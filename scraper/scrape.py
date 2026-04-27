"""MLBB hero data harvester (openmlbb.fastapicloud.dev).

One-shot ETL:
  1. GET /api/heroes?size=200               -> list of 132 heroes with relations
  2. GET /api/heroes/{id}  per hero         -> stats (abilityshow), role (sortlabel)
  3. Download portrait                      -> portraits/<id>.<ext>
  4. Build counter_graph from relations     -> strong/weak/assist edges
  5. Atomic write heroes.json               -> source of truth for the backend

The /api/heroes list response includes each hero's curated `relation` block
(strong/weak/assist) with up to 3 target hero ids each — the source of the
counter graph.

Run:  python scrape.py
Output:
  server/data/heroes.json
  server/data/portraits/<id>.<ext>
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import tempfile
import time
from datetime import date
from pathlib import Path
from typing import Any

import requests

API_BASE = "https://openmlbb.fastapicloud.dev"
LIST_URL = f"{API_BASE}/api/heroes"
DETAIL_URL = f"{API_BASE}/api/heroes"  # /{hero_id}
LIST_PAGE_SIZE = 200

# Moonton's official lore page hosts richer portrait art (vs. the small head
# crops returned by openmlbb). Site only exposes hero names, so we match its
# entries against names from openmlbb to recover the hero id.
LORE_LIST_URL = "https://play.mobilelegends.com/lore/heroList"

OUT_DIR = Path(__file__).resolve().parent.parent / "server" / "data"
PORTRAIT_DIR = OUT_DIR / "portraits"
HEROES_JSON = OUT_DIR / "heroes.json"

REQUEST_TIMEOUT = 20
DETAIL_SLEEP_SECONDS = 0.3
MIN_HEROES_EXPECTED = 120
USER_AGENT = "mlbb-draft-assistant/0.2 (+scraper)"

REQUIRED_HERO_FIELDS = ("id", "name", "role", "portrait", "stats")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
    level=logging.INFO,
)
log = logging.getLogger("scrape")


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    return s


def _get_json(session: requests.Session, url: str, params: dict | None = None) -> dict:
    r = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    payload = r.json()
    if payload.get("code") != 0:
        raise RuntimeError(f"API error at {url} params={params}: code={payload.get('code')} msg={payload.get('message')}")
    return payload


def _safe_int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def fetch_hero_list(session: requests.Session) -> list[dict]:
    log.info("GET %s?size=%d", LIST_URL, LIST_PAGE_SIZE)
    payload = _get_json(session, LIST_URL, params={"size": LIST_PAGE_SIZE})
    records = (payload.get("data") or {}).get("records") or []
    log.info("hero list: %d heroes", len(records))
    # Unwrap records[i].data so callers see {hero_id, hero, relation, ...} directly.
    return [r.get("data") or {} for r in records]


def fetch_hero_detail(session: requests.Session, heroid: int) -> dict:
    payload = _get_json(session, f"{DETAIL_URL}/{heroid}")
    records = (payload.get("data") or {}).get("records") or []
    if not records:
        return {}
    return records[0].get("data") or {}


def _normalize_name(name: str) -> str:
    """Lowercase + collapse whitespace + strip punctuation noise so names from
    different sources collide cleanly (e.g. "Yi Sun-shin" vs "yi sun shin")."""
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


# Regex for the lore page list items. The HTML structure is consistent:
#   <li class="list-item-box">
#       <div class="list-item"><img src="//host/path.png" alt="">
#           <div class="item-info"><h4 class="name v-html-content-box">Name</h4>
# Names may have surrounding whitespace and may span lines.
_LORE_ITEM_RE = re.compile(
    r'<li[^>]*class="list-item-box"[^>]*>.*?'
    r'<img[^>]*\bsrc="([^"]+)"[^>]*>.*?'
    r'<h4[^>]*class="name[^"]*"[^>]*>\s*([^<]+?)\s*</h4>',
    re.DOTALL,
)


def fetch_lore_portraits(session: requests.Session) -> dict[str, str]:
    """Return {normalized_name: absolute_image_url} from the lore page.

    Uses a browser-ish User-Agent because the lore site rejects our scraper UA.
    Returns {} on any error so the caller can fall back to the openmlbb head URL.
    """
    log.info("GET %s", LORE_LIST_URL)
    try:
        r = session.get(
            LORE_LIST_URL,
            timeout=REQUEST_TIMEOUT,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        r.raise_for_status()
    except Exception as e:
        log.warning("lore page fetch failed: %s — falling back to openmlbb portraits", e)
        return {}

    html = r.text
    print(html)
    out: dict[str, str] = {}
    for src, name in _LORE_ITEM_RE.findall(html):
        url = src.strip()
        if url.startswith("//"):
            url = "https:" + url
        elif url.startswith("/"):
            url = "https://play.mobilelegends.com" + url
        key = _normalize_name(name)
        if not key or not url:
            continue
        # First occurrence wins; lore page should not have dupes anyway.
        out.setdefault(key, url)

    log.info("lore page: parsed %d hero portraits", len(out))
    return out


def download_portrait(
    session: requests.Session,
    heroid: int,
    url: str,
    *,
    force: bool = False,
) -> str:
    if not url:
        raise ValueError(f"hero {heroid}: empty portrait url")

    ext_source = url.split("?", 1)[0]
    ext = os.path.splitext(ext_source)[1].lower() or ".png"
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        ext = ".png"

    filename = f"{heroid}{ext}"
    out_path = PORTRAIT_DIR / filename

    if not force and out_path.exists() and out_path.stat().st_size > 0:
        return f"portraits/{filename}"

    r = session.get(url, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    tmp = out_path.with_suffix(out_path.suffix + ".part")
    tmp.write_bytes(r.content)
    tmp.replace(out_path)

    # When forcing a refresh from a different source, an old file may exist with
    # a different extension (e.g. .png stale + .jpg new). Remove stale variants
    # so the backend's directory listing only finds the current portrait.
    for stale in PORTRAIT_DIR.glob(f"{heroid}.*"):
        if stale != out_path and not stale.name.endswith(".part"):
            try:
                stale.unlink()
            except OSError:
                pass

    return f"portraits/{filename}"


def parse_stats(hero_data: dict) -> dict:
    """openmlbb `abilityshow` is [durability, physical, magic, difficulty] as strings.

    Confirmed against Miya (Marksman) → abilityshow=['10','70','40','10']:
      durability=10 physical=70 magic=40 difficulty=10.
    """
    ab = hero_data.get("abilityshow") or []
    ab = [_safe_int(x) for x in ab] + [0] * 4
    return {
        "durability": ab[0],
        "physical":   ab[1],
        "magic":      ab[2],
        "difficulty": ab[3] or _safe_int(hero_data.get("difficulty")),
    }


def parse_role(hero_data: dict) -> str:
    labels = hero_data.get("sortlabel") or []
    for lbl in labels:
        if lbl:
            return lbl
    return ""


def parse_skills(hero_data: dict) -> list[dict]:
    """Flatten heroskilllist → list of {name, icon_url, description, tips}.

    openmlbb nests skills under heroskilllist[i].skilllist[j]. We only need the
    primary list (first skin's skills).
    """
    groups = hero_data.get("heroskilllist") or []
    if not groups:
        return []
    first = groups[0] or {}
    raw = first.get("skilllist") or []
    out: list[dict] = []
    for s in raw:
        out.append({
            "name": s.get("skillname") or "",
            "icon_url": s.get("skillicon") or "",
            "description": s.get("skilldesc") or "",
            "tips": s.get("skillcd&cost") or "",
        })
    return out


def _relation_ids(relation: dict, key: str) -> list[int]:
    """Extract non-zero, deduped target ids for a relation bucket."""
    block = (relation or {}).get(key) or {}
    raw = block.get("target_hero_id") or []
    seen: set[int] = set()
    out: list[int] = []
    for v in raw:
        i = _safe_int(v)
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out


def _first_edge(relation: dict, key: str, names_by_id: dict[int, str]) -> dict | None:
    ids = _relation_ids(relation, key)
    if not ids:
        return None
    hid = ids[0]
    return {"id": hid, "name": names_by_id.get(hid, ""), "tips": ""}


def hero_from_detail(
    heroid: int,
    list_entry: dict,
    detail: dict,
    portrait_rel: str,
    names_by_id: dict[int, str],
) -> dict:
    hero_block = (detail.get("hero") or {}).get("data") or {}
    # Fallbacks from list entry so a partial detail response still yields a usable hero.
    list_hero = (list_entry.get("hero") or {}).get("data") or {}
    name = hero_block.get("name") or list_hero.get("name") or ""
    relation = list_entry.get("relation") or {}

    return {
        "id": heroid,
        "name": name,
        "role": parse_role(hero_block),
        "portrait": portrait_rel,
        "cover_picture": detail.get("head_big") or list_entry.get("head_big") or "",
        "stats": parse_stats(hero_block),
        "skills": parse_skills(hero_block),
        "recommended_items": [],
        "build_tips": "",
        "skill_priority_tips": "",
        "counter_edges": {
            "best_with":    _first_edge(relation, "assist", names_by_id),
            "counters":     _first_edge(relation, "strong", names_by_id),
            "countered_by": _first_edge(relation, "weak",   names_by_id),
        },
    }


def build_counter_graph(heroes: dict[str, dict], list_entries: dict[int, dict]) -> dict:
    """Fold each hero's `relation` block into bidirectional edge lists.

    strong[hero].targets  -> (hero, t) counter edges
    weak[hero].targets    -> (t, hero) counter edges (t counters hero)
    assist[hero].targets  -> undirected synergy pair (hero, t)
    """
    valid_ids = {int(k) for k in heroes.keys()}
    counter_pairs: set[tuple[int, int]] = set()
    synergy_pairs: set[tuple[int, int]] = set()

    for hid_str in heroes.keys():
        hid = int(hid_str)
        relation = (list_entries.get(hid) or {}).get("relation") or {}

        for t in _relation_ids(relation, "strong"):
            if t in valid_ids and t != hid:
                counter_pairs.add((hid, t))
        for t in _relation_ids(relation, "weak"):
            if t in valid_ids and t != hid:
                counter_pairs.add((t, hid))
        for t in _relation_ids(relation, "assist"):
            if t in valid_ids and t != hid:
                a, b = sorted((hid, t))
                synergy_pairs.add((a, b))

    return {
        "counters":  sorted([list(p) for p in counter_pairs]),
        "synergies": sorted([list(p) for p in synergy_pairs]),
    }


def validate(data: dict) -> list[str]:
    errors: list[str] = []
    heroes = data.get("heroes") or {}
    if len(heroes) < MIN_HEROES_EXPECTED:
        errors.append(f"only {len(heroes)} heroes scraped (expected >= {MIN_HEROES_EXPECTED})")

    for hid, h in heroes.items():
        for field in REQUIRED_HERO_FIELDS:
            if field not in h or h[field] in (None, ""):
                errors.append(f"hero {hid}: missing required field '{field}'")
        portrait = h.get("portrait")
        if portrait:
            p = OUT_DIR / portrait
            if not p.exists() or p.stat().st_size == 0:
                errors.append(f"hero {hid}: portrait file missing or empty: {p}")
    return errors


def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".heroes-", suffix=".json", dir=str(path.parent))
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        tmp.replace(path)
    except Exception:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)

    session = _session()

    try:
        hero_list = fetch_hero_list(session)
    except Exception as e:
        log.error("failed to fetch hero list: %s", e)
        return 2

    # First pass: build id → name map so counter_edges can include names without
    # needing the detail response of the referenced hero.
    names_by_id: dict[int, str] = {}
    list_entries: dict[int, dict] = {}
    for entry in hero_list:
        hid = _safe_int(entry.get("hero_id"))
        if not hid:
            continue
        list_entries[hid] = entry
        name = ((entry.get("hero") or {}).get("data") or {}).get("name") or ""
        if name:
            names_by_id[hid] = name

    # Lore-page portraits (richer artwork than openmlbb's small head crop). Map
    # is name-keyed; we re-key to id below using the openmlbb name list.
    lore_portraits = fetch_lore_portraits(session)
    lore_by_id: dict[int, str] = {}
    for hid, name in names_by_id.items():
        url = lore_portraits.get(_normalize_name(name))
        if url:
            lore_by_id[hid] = url
    log.info(
        "lore portraits matched: %d / %d heroes (rest will fall back to openmlbb head)",
        len(lore_by_id), len(names_by_id),
    )

    heroes: dict[str, dict] = {}
    failures: list[tuple[int, str]] = []
    portrait_sources = {"lore": 0, "openmlbb": 0}
    total = len(list_entries)

    for i, (heroid, entry) in enumerate(sorted(list_entries.items()), 1):
        try:
            detail = fetch_hero_detail(session, heroid)
        except Exception as e:
            log.error("[%3d/%d] id=%d detail fetch failed: %s", i, total, heroid, e)
            failures.append((heroid, f"detail: {e}"))
            time.sleep(DETAIL_SLEEP_SECONDS)
            continue

        lore_url = lore_by_id.get(heroid)
        fallback_url = (
            ((detail.get("hero") or {}).get("data") or {}).get("head")
            or detail.get("head")
            or ((entry.get("hero") or {}).get("data") or {}).get("head")
            or entry.get("head")
            or ""
        )
        portrait_url = lore_url or fallback_url
        source = "lore" if lore_url else "openmlbb"
        # Force re-download when the source switches sources (lore on a previous
        # openmlbb-only run or vice versa) by always refetching the lore-sourced
        # ones; openmlbb fallbacks keep the old skip-if-exists semantics.
        try:
            portrait_rel = download_portrait(
                session, heroid, portrait_url, force=(source == "lore"),
            )
            portrait_sources[source] += 1
        except Exception as e:
            log.error("[%3d/%d] id=%d portrait download failed (%s): %s", i, total, heroid, source, e)
            failures.append((heroid, f"portrait: {e}"))
            time.sleep(DETAIL_SLEEP_SECONDS)
            continue

        hero = hero_from_detail(heroid, entry, detail, portrait_rel, names_by_id)
        heroes[str(heroid)] = hero
        log.info("[%3d/%d] %s (id=%d) ok — %s [%s]", i, total, hero["name"], heroid, hero["role"] or "?", source)
        time.sleep(DETAIL_SLEEP_SECONDS)

    counter_graph = build_counter_graph(heroes, list_entries)

    output = {
        "version": date.today().isoformat(),
        "heroes": heroes,
        "counter_graph": counter_graph,
    }

    errors = validate(output)
    if errors:
        log.error("validation failed with %d issues:", len(errors))
        for e in errors[:20]:
            log.error("  - %s", e)
        if len(errors) > 20:
            log.error("  ... and %d more", len(errors) - 20)
        return 3

    atomic_write_json(HEROES_JSON, output)
    log.info("wrote %s (%d heroes, %d counter edges, %d synergy edges)",
             HEROES_JSON, len(heroes),
             len(counter_graph["counters"]), len(counter_graph["synergies"]))
    log.info("portrait sources: lore=%d, openmlbb=%d",
             portrait_sources["lore"], portrait_sources["openmlbb"])

    if failures:
        log.warning("%d heroes had errors but overall run passed validation:", len(failures))
        for hid, msg in failures:
            log.warning("  - id=%d: %s", hid, msg)

    return 0


if __name__ == "__main__":
    sys.exit(main())
