# MLBB Draft Assistant

An interactive web application that helps Mobile Legends: Bang Bang players make data-driven decisions during the hero draft phase, powered by live data from the official MLBB API.

---

## Project Vision

Give the player a simple draft-board UI where they can fill in enemy picks, ally picks, and bans, and instantly see which heroes from the remaining pool counter the enemy, synergize with allies, and balance the team composition. The suggestions must be transparent — the UI always shows *why* a hero is recommended (e.g., "counters Miya, synergizes with Tigreal").

### v1 Scope (this iteration)
- Data harvest: pull every hero's full detail from the MLBB API into a local `heroes.json`.
- Local portraits: download and cache all 124 hero portrait images.
- Backend proxy: FastAPI service exposing hero data and a recommendation endpoint.
- Interactive web page: React UI with enemy/ally/ban slots, searchable hero pool, and live recommendations.
- Manual input only — user clicks to fill slots.

### v2 Scope (future — not in v1)
- Screen capture of LonelyScreen window via `getDisplayMedia()` in the browser.
- Template matching (OpenCV.js) against hero portraits to auto-detect picks/bans from the iPhone AirPlay stream.
- The v1 UI must expose a clean state-update API (or event bus) so v2 can plug in without rewriting the frontend.

---

## Architecture

Three independent components in one repo:

```
mlbb-draft-assistant/
├── scraper/              # Python: one-shot harvest of MLBB API
│   ├── scrape.py
│   ├── requirements.txt
├── server/               # Python FastAPI: proxy + recommendations
│   ├── main.py
│   ├── recommender.py
│   ├── requirements.txt
│   └── data/             # heroes.json + cached portraits used by backend
├── web/                  # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── DraftBoard.jsx
│   │   │   ├── HeroPool.jsx
│   │   │   ├── Recommendations.jsx
│   │   │   └── HeroSlot.jsx
│   │   ├── hooks/
│   │   │   └── useDraftState.js
│   │   └── api.js
│   ├── package.json
│   └── vite.config.js
├── AGENTS.md             # this file
└── README.md
```

### Data flow
```
MLBB API ──(one-shot scrape)──▶ heroes.json ──▶ FastAPI ──▶ React UI
```

The scraper runs once (or periodically to catch new heroes). The backend serves the cached data and handles the scoring logic. The frontend is a pure view layer that sends draft state to the backend and renders recommendations.

---

## MLBB API Reference (verified)

Base: `https://openmlbb.fastapicloud.dev`

All successful responses share the envelope:
```json
{ "code": 0, "message": "OK", "data": { "records": [ ... ], "total": <int> } }
```

### `GET /api/heroes?size=200&lang=en`
Paginated hero list. Each `data.records[i].data` carries:
```json
{
  "hero_id": 1,
  "hero": { "data": { "name": "Miya", "sortlabel": ["Marksman"], "head": "https://...", "abilityshow": ["10","70","40","10"] } },
  "head": "https://...",
  "head_big": "https://...",
  "relation": {
    "strong": { "target_hero_id": [49, 0, 0] },
    "weak":   { "target_hero_id": [21, 0, 0] },
    "assist": { "target_hero_id": [20, 0, 0] }
  }
}
```
`size=200` returns the entire roster in one call (currently ~132 heroes). `abilityshow` is `[durability, physical, magic, difficulty]` as strings. `relation` carries up to 3 target hero ids per bucket — that's our counter-graph source.

### `GET /api/heroes/{id}`
Per-hero detail. We read `hero.data.name`, `hero.data.sortlabel` (role), `hero.data.abilityshow` (stats), `hero.data.heroskilllist[0].skilllist[]` (skills as `{skillname, skillicon, skilldesc, "skillcd&cost"}`), and `head` / `head_big` for portraits.

### `GET /api/heroes/rank?size=200&rank={tier}&sort_field=win_rate&sort_order=desc`
Leaderboard powering the popover's `rank_position` badge and the per-tile win/pick/ban rates. Each record exposes `main_heroid`, `main_hero_win_rate`, `main_hero_appearance_rate`, `main_hero_ban_rate`. Tiers: `all | epic | legend | mythic | honor | glory`.

### `GET /api/heroes/{id}/counters?rank={tier}`
First record's `data.sub_hero[]` = heroes this one counters, `data.sub_hero_last[]` = heroes that counter it. Each entry has `heroid`, `hero_win_rate`, `hero_appearance_rate`, `increase_win_rate`.

### `GET /api/heroes/{id}/compatibility?rank={tier}`
Same shape as `/counters`: `sub_hero[]` = compatible, `sub_hero_last[]` = not compatible.

### `GET /api/heroes/{id}/relations`
Moonton-curated synergy/counter triples (`assist` / `strong` / `weak`, up to 3 ids each). **Does not** accept the `rank` query param — these are rank-agnostic.

### Synergy graph derivation
The `relation` block on `/api/heroes` already gives strong/weak/assist with up to 3 ids per direction, so the scraper folds both directions of every edge into `counter_graph` directly — no inverse-inference fallback needed.

### CORS
The upstream blocks browser origins. All calls go through the FastAPI backend proxy.

---

## Canonical Data Schema (`heroes.json`)

Output of the scraper. This file is the source of truth for the backend.

```json
{
  "version": "2026-04-22",
  "heroes": {
    "1": {
      "id": 1,
      "name": "Miya",
      "role": "Marksman",
      "portrait": "portraits/1.png",
      "cover_picture": "https://...",
      "stats": { "magic": 40, "physical": 70, "durability": 10, "difficulty": 10 },
      "skills": [
        { "name": "Moon Arrow", "icon_url": "...", "description": "...", "tips": "..." }
      ],
      "recommended_items": [
        { "id": 2008, "name": "Corrosion Scythe", "icon_url": "...", "description": "..." }
      ],
      "build_tips": "...",
      "skill_priority_tips": "...",
      "counter_edges": {
        "best_with":    { "id": 20, "name": "Lolita",   "tips": "..." },
        "counters":     { "id": 49, "name": "Hylos",    "tips": "..." },
        "countered_by": { "id": 21, "name": "Hayabusa", "tips": "..." }
      }
    }
  },
  "counter_graph": {
    "counters":   [ [attacker_id, victim_id], ... ],
    "synergies":  [ [hero_a_id, hero_b_id], ... ]
  }
}
```

`counter_graph` is derived post-scrape by flattening and deduplicating both directions of every `counter_edges` entry. The backend loads this once at startup.

---

## Recommendation Logic (v1)

Transparent and simple so the user trusts it. The backend exposes:

```
POST /api/recommend
Body: { "enemy_picks": [int], "ally_picks": [int], "bans": [int] }
Response: {
  "recommendations": [
    {
      "hero_id": 49,
      "name": "Hylos",
      "score": 5,
      "reasons": [
        { "type": "counters", "target_id": 1, "target_name": "Miya", "points": 3 },
        { "type": "synergy",  "target_id": 20, "target_name": "Lolita", "points": 2 }
      ]
    }
  ]
}
```

### Scoring algorithm
For every hero not in `enemy_picks`, `ally_picks`, or `bans`:

```
score = 0
reasons = []

for enemy in enemy_picks:
    if hero counters enemy:
        score += 3; reasons.append(("counters", enemy))
    if enemy counters hero:
        score -= 3; reasons.append(("countered_by", enemy))

for ally in ally_picks:
    if hero synergizes with ally:
        score += 2; reasons.append(("synergy", ally))

missing_roles = {Tank, Fighter, Assassin, Mage, Marksman, Support} − set(roles of ally_picks)
if hero.role in missing_roles:
    score += 1; reasons.append(("fills_role", hero.role))
```

Return the top 5 by score, descending. Ties broken by hero difficulty (easier first).

### Not in v1
- Win-rate or meta-tier data (API doesn't expose it).
- Synergy/counter weights beyond the flat +2 / +3 / ±1.
- Role-specific considerations (e.g., "we already have two marksmen").

These are candidate v1.5 improvements once the baseline works.

---

## Tech Stack

| Layer    | Choice                        | Why                                            |
|----------|-------------------------------|------------------------------------------------|
| Scraper  | Python 3.10+ + `requests`     | Simple, well-suited for one-shot ETL           |
| Backend  | FastAPI + uvicorn             | Fast to write, auto OpenAPI docs, Python keeps the stack monolingual |
| Frontend | React 18 + Vite + Tailwind    | Fast iteration, good component ecosystem       |
| Images   | Local filesystem + FastAPI static | Simple; CDN not needed at this scale       |

Deliberately avoiding: databases (JSON is enough), auth (not needed for v1), state management libs beyond React's built-ins.

---

## Phase-by-Phase Build Order

Build strictly in this order. Do not start a phase until the previous one runs end-to-end.

### Phase 1 — Scraper (~half day)
Deliverable: `server/data/heroes.json` + `server/data/portraits/*.png`.

1. `scrape.py` hits `/api/heroes?size=200`, iterates all `hero_id` values.
2. For each hero: call `/api/heroes/{id}`, parse fields into the canonical schema above.
3. Rate-limit: `time.sleep(1)` between detail calls. Log progress.
4. Download each hero's portrait from the `key` URL to `portraits/{heroid}.png`.
5. After all heroes collected, build `counter_graph` by iterating every hero's `counter_edges` and emitting both directions.
6. Write `heroes.json` atomically (temp file → rename).
7. Basic validation: exit non-zero if fewer than 120 heroes were scraped, or any hero is missing required fields.

### Phase 2 — Backend (~half day)
Deliverable: running FastAPI server at `localhost:8000`.

Endpoints:
- `GET /api/heroes` → returns full `heroes.json`.
- `GET /api/portrait/{hero_id}` → serves the cached PNG.
- `POST /api/recommend` → runs the scoring algorithm.

Implementation notes:
- Load `heroes.json` once at startup into memory.
- CORS: allow `http://localhost:5173` (Vite default) during dev.
- Add a `GET /api/health` endpoint.

### Phase 3 — Frontend scaffolding (~half day)
Deliverable: React app that fetches `/api/heroes` and renders a grid of 124 portraits.

1. `npm create vite@latest web -- --template react`.
2. Install Tailwind per its Vite docs.
3. `src/api.js` with a fetch wrapper pointing at the backend.
4. Grid view showing all heroes with role badges.

### Phase 4 — Draft board UI (~1-2 days)
Deliverable: a working manual draft board.

Layout (three-column):
- **Left**: Enemy team (5 pick slots, 3-5 ban slots).
- **Center**: Searchable hero pool with role filter.
- **Right**: Your team (5 pick slots, 3-5 ban slots).
- **Bottom**: Recommendations panel.

Interaction:
1. User clicks an empty slot → slot enters "selecting" state.
2. User clicks a hero in the pool → hero fills the slot and becomes unavailable.
3. Clicking a filled slot clears it.
4. Draft state stored in a single `useReducer` in `useDraftState.js`.
5. Whenever draft state changes, POST to `/api/recommend` (debounced 300ms) and render results.

Each recommendation card shows: portrait, name, score, role, and the human-readable reasons.

### Phase 5 — Recommendation polish (~half day)
- Tooltip on each reason showing the `tips` text from the MLBB API.
- "My hero pool" filter — let the user mark heroes they own/play so only those appear in recommendations.
- Loading states, error states, empty state ("pick someone to see suggestions").

### Phase 6 — v2 hook (~1 hour of groundwork)
Expose `window.mlbbDraft.setState(newState)` or a CustomEvent API so a future screen-capture module can push detected heroes into the same reducer without modifying the UI. Don't implement capture yet — just make the seam.

---

## Dev Commands

```
# Scraper
cd scraper
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
python scrape.py

# Backend
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd web
npm install
npm run dev
```

---

## Conventions

- **Python**: format with `black`, sort imports with `isort`. Type hints on public functions.
- **JavaScript**: functional components, hooks only. No class components. No Redux — `useReducer` is sufficient.
- **Naming**: hero IDs are integers in code, strings only when dealing with the raw MLBB API response.
- **No secrets**: the MLBB API requires no auth. Nothing to `.env`.
- **Commits**: conventional commits (`feat:`, `fix:`, `chore:`). Keep them small, one logical change each.

---

## Open Questions / Decisions Deferred

1. **Re-scrape cadence**: manual for v1. A cron or GitHub Action can come later.
2. **Counter graph enrichment**: MLBB's API gives sparse data. Post-v1, consider supplementing with community sources — but only if the baseline proves too thin in practice.
3. **Deployment**: local-only for v1. If we ship it publicly, the backend needs rate-limiting and the generated backend data should live in a CDN.
4. **v2 screen capture**: will need calibration UI for the LonelyScreen window region, and a template-matching pipeline (OpenCV.js). Out of scope for v1.

---

## First Task For Codex

Start with **Phase 1 — the scraper**. Verify the two API endpoints still return the shape documented above before writing parsing logic. Output `heroes.json` and a populated `portraits/` directory. Show me a sample of three heroes before proceeding to Phase 2.
