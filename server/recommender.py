"""Draft recommendation scoring.

Pure function over the canonical hero data. No I/O, no framework deps, so the
scoring logic is trivially testable in isolation.

Scoring (per CLAUDE.md §Recommendation Logic):
  +3  hero counters an enemy pick
  -3  an enemy pick counters hero
  +2  hero synergizes with an ally pick
  +1  hero fills a role missing from allies

Tiebreak: lower `difficulty` wins (easier heroes surfaced first).
"""

from __future__ import annotations

from typing import Any

ROLES: tuple[str, ...] = ("Tank", "Fighter", "Assassin", "Mage", "Marksman", "Support")

COUNTER_POINTS = 3
SYNERGY_POINTS = 2
ROLE_POINTS = 1
TOP_N = 5


def _build_lookups(hero_data: dict) -> tuple[set[tuple[int, int]], set[tuple[int, int]]]:
    """Materialize counter_graph into fast membership sets.

    - counters: directed (attacker, victim)
    - synergies: symmetric — stored as both (a,b) and (b,a)
    """
    graph = hero_data.get("counter_graph") or {}
    counters = {(int(a), int(v)) for a, v in graph.get("counters", [])}

    synergies: set[tuple[int, int]] = set()
    for a, b in graph.get("synergies", []):
        synergies.add((int(a), int(b)))
        synergies.add((int(b), int(a)))

    return counters, synergies


def recommend(
    hero_data: dict,
    enemy_picks: list[int],
    ally_picks: list[int],
    bans: list[int],
    only_ids: list[int] | None = None,
    only_roles: list[str] | None = None,
) -> dict[str, Any]:
    heroes: dict[str, dict] = hero_data.get("heroes", {})
    counters, synergies = _build_lookups(hero_data)

    used: set[int] = set(enemy_picks) | set(ally_picks) | set(bans)
    only_set: set[int] | None = set(only_ids) if only_ids else None
    role_set: set[str] | None = {r for r in only_roles if r} if only_roles else None

    ally_roles = {
        heroes[str(a)]["role"]
        for a in ally_picks
        if str(a) in heroes and heroes[str(a)].get("role")
    }
    missing_roles = set(ROLES) - ally_roles

    def _name(hid: int) -> str:
        return heroes.get(str(hid), {}).get("name", "")

    scored: list[dict[str, Any]] = []

    for hid_str, hero in heroes.items():
        hid = int(hid_str)
        if hid in used:
            continue
        if only_set is not None and hid not in only_set:
            continue
        if role_set is not None and hero.get("role") not in role_set:
            continue

        score = 0
        reasons: list[dict[str, Any]] = []

        for enemy_id in enemy_picks:
            if (hid, enemy_id) in counters:
                score += COUNTER_POINTS
                reasons.append({
                    "type": "counters",
                    "target_id": enemy_id,
                    "target_name": _name(enemy_id),
                    "points": COUNTER_POINTS,
                })
            if (enemy_id, hid) in counters:
                score -= COUNTER_POINTS
                reasons.append({
                    "type": "countered_by",
                    "target_id": enemy_id,
                    "target_name": _name(enemy_id),
                    "points": -COUNTER_POINTS,
                })

        for ally_id in ally_picks:
            if (hid, ally_id) in synergies:
                score += SYNERGY_POINTS
                reasons.append({
                    "type": "synergy",
                    "target_id": ally_id,
                    "target_name": _name(ally_id),
                    "points": SYNERGY_POINTS,
                })

        role = hero.get("role")
        if role and role in missing_roles:
            score += ROLE_POINTS
            reasons.append({
                "type": "fills_role",
                "target_id": None,
                "target_name": role,
                "points": ROLE_POINTS,
            })

        scored.append({
            "hero_id": hid,
            "name": hero.get("name", ""),
            "role": role or "",
            "score": score,
            "reasons": reasons,
            "_difficulty": (hero.get("stats") or {}).get("difficulty", 0),
        })

    scored.sort(key=lambda r: (-r["score"], r["_difficulty"]))
    top = scored[:TOP_N]
    for r in top:
        r.pop("_difficulty", None)
    return {"recommendations": top}
