"""On-demand MLBB hero statistics.

Proxies a community wrapper of Moonton's GMS API to fetch live rank / pick /
win / ban rates plus counter, compatibility, and relation lists.

Upstream is configurable via $MLBB_STATS_BASE (default openmlbb.fastapicloud.dev).

Results are cached in-memory per (hero_id, rank) with a 1-hour TTL so repeated
hovers on the same hero don't hammer upstream.

The `rank` tier passed through to upstream filters the matchup data to players
of a given rank bracket. Accepted values:
    all, epic, legend, mythic, honor, glory
"""

from __future__ import annotations

import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import requests

log = logging.getLogger("stats")

STATS_BASE = os.environ.get(
    "MLBB_STATS_BASE", "https://openmlbb.fastapicloud.dev"
).rstrip("/")
DEFAULT_STATS_BASES = [
    "https://openmlbb.fastapicloud.dev",
    "https://mlbb.rone.dev/api",
]
CACHE_TTL = 60 * 60  # 1 hour
RANK_FAILURE_TTL = 60
UPSTREAM_TIMEOUT = 8.0

VALID_RANKS = {"all", "epic", "legend", "mythic", "honor", "glory"}
DEFAULT_RANK = "mythic"

# Leaderboard cache: full ranked list keyed by rank tier, refreshed every
# CACHE_TTL. Degraded/failed refreshes use RANK_FAILURE_TTL so a transient upstream
# outage does not poison Draft Power and tile overlays for a full hour.
_rank_cache: dict[str, dict[str, Any]] = {}
_cache: dict[tuple[int, str], tuple[float, dict]] = {}
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="stats")


def _stats_bases() -> list[str]:
    bases: list[str] = []
    for base in [STATS_BASE, *DEFAULT_STATS_BASES]:
        base = base.rstrip("/")
        if base not in bases:
            bases.append(base)
    return bases


STATS_BASES = _stats_bases()


def _source_url(base: str, path: str) -> str:
    if base.endswith("/api") and path.startswith("/api/"):
        return f"{base}{path.removeprefix('/api')}"
    return f"{base}{path}"


def _get_from_base(base: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    r = requests.get(_source_url(base, path), params=params or {}, timeout=UPSTREAM_TIMEOUT)
    r.raise_for_status()
    return r.json()


def _get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return _get_from_base(STATS_BASE, path, params)


def _first_record(payload: dict) -> tuple[dict, int | None]:
    """Extract (data, updated_at_ms) from the first record in an upstream payload."""
    records = (payload.get("data") or {}).get("records") or []
    if not records:
        return {}, None
    rec = records[0]
    updated = rec.get("_updatedAt")
    try:
        updated_ms = int(updated) if updated is not None else None
    except (TypeError, ValueError):
        updated_ms = None
    return rec.get("data") or {}, updated_ms


def _sub_row(s: dict, hero_names: dict[int, str]) -> dict | None:
    hid = s.get("heroid")
    if hid is None:
        return None
    return {
        "id": int(hid),
        "name": hero_names.get(int(hid), f"#{hid}"),
        "win_rate": s.get("hero_win_rate"),
        "pick_rate": s.get("hero_appearance_rate"),
        "increase_win_rate": s.get("increase_win_rate"),
    }


def _top_subs(record: dict, key: str, hero_names: dict[int, str], limit: int = 5) -> list[dict]:
    subs = record.get(key) or []
    out: list[dict] = []
    for s in subs[:limit]:
        row = _sub_row(s, hero_names)
        if row:
            out.append(row)
    return out


def _parse_leaderboard(payload: dict) -> tuple[dict[int, dict], int, int | None]:
    records = (payload.get("data") or {}).get("records") or []
    entries: dict[int, dict] = {}
    updated_candidates: list[int] = []
    for pos, r in enumerate(records, start=1):
        rec = r.get("data") or {}
        hid = rec.get("main_heroid")
        if hid is None:
            continue
        entries[int(hid)] = {
            "rank": pos,
            "win_rate": rec.get("main_hero_win_rate"),
            "pick_rate": rec.get("main_hero_appearance_rate"),
            "ban_rate": rec.get("main_hero_ban_rate"),
        }
        updated = r.get("_updatedAt")
        try:
            if updated is not None:
                updated_candidates.append(int(updated))
        except (TypeError, ValueError):
            pass
    updated_at_ms = max(updated_candidates) if updated_candidates else None
    return entries, len(records), updated_at_ms


def _rank_result(
    *,
    entries: dict[int, dict] | None = None,
    total: int = 0,
    updated_at_ms: int | None = None,
    source: str | None = None,
    stats_available: bool = False,
    error: str | None = None,
    stale: bool = False,
    ttl: int = CACHE_TTL,
) -> dict[str, Any]:
    return {
        "cached_at": time.time(),
        "ttl": ttl,
        "entries": entries or {},
        "total": total,
        "updated_at_ms": updated_at_ms,
        "source": source,
        "stats_available": stats_available,
        "error": error,
        "stale": stale,
    }


def _fetch_leaderboard(rank: str) -> dict[str, Any]:
    """Fetch `/api/heroes/rank?size=200&rank=<tier>` sorted by win rate.

    Returns a status dict carrying entries, source, and availability metadata.
    On upstream failure, reuses a previous non-empty cache if one exists; otherwise
    caches a short-lived degraded response so callers can fail open without hiding
    the outage for an hour.
    """
    now = time.time()
    hit = _rank_cache.get(rank)
    if hit and now - hit["cached_at"] < hit.get("ttl", CACHE_TTL):
        return hit

    params = {"size": 200, "rank": rank, "sort_field": "win_rate", "sort_order": "desc"}
    errors: list[str] = []
    for base in STATS_BASES:
        try:
            payload = _get_from_base(base, "/api/heroes/rank", params)
            entries, total, updated_at_ms = _parse_leaderboard(payload)
            if not entries:
                errors.append(f"{base}: empty leaderboard response")
                continue
            result = _rank_result(
                entries=entries,
                total=total,
                updated_at_ms=updated_at_ms,
                source=base,
                stats_available=True,
            )
            _rank_cache[rank] = result
            return result
        except requests.RequestException as e:
            log.warning("leaderboard fetch failed (rank=%s, source=%s): %s", rank, base, e)
            errors.append(f"{base}: {e}")

    error = "; ".join(errors) if errors else "leaderboard unavailable"
    if hit and hit.get("entries"):
        result = {**hit, "cached_at": now, "ttl": RANK_FAILURE_TTL, "stale": True, "error": error}
        _rank_cache[rank] = result
        return result

    result = _rank_result(error=error, ttl=RANK_FAILURE_TTL)
    _rank_cache[rank] = result
    return result


def _get_rank_index(rank: str) -> tuple[dict[int, int], int]:
    """Thin projection over _fetch_leaderboard: (hero_id -> rank position, total)."""
    result = _fetch_leaderboard(rank)
    entries = result["entries"]
    total = result["total"]
    return {hid: e["rank"] for hid, e in entries.items()}, total


def fetch_leaderboard(rank: str = DEFAULT_RANK) -> dict:
    """Public wrapper shaped for the /api/leaderboard endpoint."""
    rank = rank if rank in VALID_RANKS else DEFAULT_RANK
    result = _fetch_leaderboard(rank)
    entries = result["entries"]
    return {
        "rank_tier": rank,
        "rank_total": result["total"],
        "heroes": {str(hid): e for hid, e in entries.items()},
        "stats_available": result["stats_available"],
        "stale": result["stale"],
        "error": result["error"],
        "data_updated_at_ms": result["updated_at_ms"],
        "fetched_at": time.time(),
        "source": result["source"],
    }


def fetch_stats(hero_id: int, hero_names: dict[int, str], rank: str = DEFAULT_RANK) -> dict:
    """Return fresh (or cached) stats for one hero for the given rank tier."""
    rank = rank if rank in VALID_RANKS else DEFAULT_RANK
    now = time.time()
    key = (hero_id, rank)
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_TTL:
        return hit[1]

    # Per openmlbb OpenAPI spec:
    #   /counters      — accepts `rank`
    #   /compatibility — accepts `rank`
    #   /relations     — does NOT accept `rank` (Moonton-curated, rank-agnostic)
    #   /api/heroes/rank — accepts `rank` (leaderboard for the rank_position badge)
    params = {"rank": rank}
    fut_counters = _pool.submit(_get, f"/api/heroes/{hero_id}/counters", params)
    fut_compat = _pool.submit(_get, f"/api/heroes/{hero_id}/compatibility", params)
    fut_rel = _pool.submit(_get, f"/api/heroes/{hero_id}/relations")
    fut_rank = _pool.submit(_get_rank_index, rank)

    counters_raw = fut_counters.result()
    compat_raw = fut_compat.result()
    rel_raw = fut_rel.result()
    rank_idx, rank_total = fut_rank.result()

    counter_rec, counter_updated_ms = _first_record(counters_raw)
    compat_rec, compat_updated_ms = _first_record(compat_raw)
    rel_rec, rel_updated_ms = _first_record(rel_raw)

    source_rec = counter_rec or compat_rec
    main_hero = (source_rec.get("main_hero") or {}).get("data") or {}

    updated_candidates = [
        t for t in (counter_updated_ms, compat_updated_ms, rel_updated_ms) if t is not None
    ]
    data_updated_at_ms = max(updated_candidates) if updated_candidates else None

    # Relations: three lists of 3 hero IDs each (0 = empty slot).
    relation = (rel_rec.get("relation") or {}) if rel_rec else {}

    def _rel_ids(kind: str) -> list[dict]:
        ids = ((relation.get(kind) or {}).get("target_hero_id") or [])
        return [
            {"id": int(i), "name": hero_names.get(int(i), f"#{i}")}
            for i in ids
            if i and int(i) != 0
        ]

    result = {
        "hero_id": hero_id,
        "name": main_hero.get("name") or hero_names.get(hero_id, f"#{hero_id}"),
        "rank_tier": rank,
        "win_rate": source_rec.get("main_hero_win_rate"),
        "pick_rate": source_rec.get("main_hero_appearance_rate"),
        "ban_rate": source_rec.get("main_hero_ban_rate"),
        "rank_position": rank_idx.get(hero_id),
        "rank_total": rank_total,
        # sub_hero = positive-delta side (heroes this one wins against / pairs well with).
        # sub_hero_last = negative-delta side.
        "counters": _top_subs(counter_rec, "sub_hero", hero_names),
        "countered_by": _top_subs(counter_rec, "sub_hero_last", hero_names),
        "compatible": _top_subs(compat_rec, "sub_hero", hero_names),
        "not_compatible": _top_subs(compat_rec, "sub_hero_last", hero_names),
        # Moonton-curated relations (3 each).
        "relation_strong": _rel_ids("strong"),
        "relation_weak": _rel_ids("weak"),
        "relation_assist": _rel_ids("assist"),
        "data_updated_at_ms": data_updated_at_ms,
        "fetched_at": now,
        "source": STATS_BASE,
    }

    _cache[key] = (now, result)
    return result
