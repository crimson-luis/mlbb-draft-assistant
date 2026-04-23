# Running Locally

Three processes, one per component. All commands are run from the project root
(`C:\Users\luisg\PycharmProjects\mlbb-draft-assistant`).

## 1. Scraper — one-shot

Populates `scraper/output/heroes.json` + `scraper/output/portraits/` from
`openmlbb.fastapicloud.dev`. Re-run only when you want fresh data.

```powershell
cd scraper
.venv\Scripts\activate
pip install -r requirements.txt
python scrape.py
```

Expected: `132 heroes, 542 counter edges, 270 synergy edges`.

## 2. Backend — FastAPI on :8000

Loads `heroes.json` at startup and serves `/api/heroes`, `/api/recommend`,
`/api/stats/{id}`, `/api/portrait/{id}`.

```powershell
cd server
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Health check:

```powershell
curl http://localhost:8000/api/health
# {"status":"ok","version":"2026-04-23","heroes":132,...}
```

## 3. Frontend — Vite dev server on :5173

```powershell
cd web
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api/*` to `localhost:8000` (see
`web/vite.config.js`), so no CORS config is needed.

## First-run order

Scraper -> Backend -> Frontend. After the first run, only the backend and
frontend need to be started each time; the scraper is one-shot.

## Troubleshooting

| Symptom                                    | Likely cause / fix                                                                   |
|--------------------------------------------|--------------------------------------------------------------------------------------|
| Backend reports `heroes: 124` not 132      | Uvicorn loaded the old JSON before the re-scrape. Restart uvicorn.                   |
| Frontend: `Failed to load hero data`       | Backend isn't on :8000, or `VITE_API_BASE` is set to a different URL.                |
| Portraits don't render                     | Missing files in `scraper/output/portraits/`. Re-run the scraper.                    |
| `heroes.json not found` at backend startup | Set `MLBB_DATA_DIR` or place a copy/symlink at `server/data/heroes.json`.            |
| Stats popover stuck on loading             | Upstream `openmlbb.fastapicloud.dev` is slow/down. Check backend logs for 502/504.   |
