"""FastAPI proxy + recommendation service for the MLBB Draft Assistant.

Endpoints:
  GET  /api/health            health + dataset summary
  GET  /api/heroes            full heroes.json payload
  GET  /api/portrait/{id}     cached PNG/JPG for a hero
  POST /api/recommend         score remaining pool against current draft

Dataset is loaded once at import time. Resolution order for the data dir:
  1. $MLBB_DATA_DIR            (override)
  2. server/data               (copy or symlink of scraper/output)
  3. ../scraper/output         (dev default — reads straight from the scraper)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from recommender import recommend as score_draft
from stats import DEFAULT_RANK, VALID_RANKS, fetch_leaderboard, fetch_stats

BASE_DIR = Path(__file__).resolve().parent
_CANDIDATES = [
    Path(os.environ["MLBB_DATA_DIR"]) if os.environ.get("MLBB_DATA_DIR") else None,
    BASE_DIR / "data",
    BASE_DIR.parent / "scraper" / "output",
]


def _resolve_data_dir() -> Path:
    for c in _CANDIDATES:
        if c and (c / "heroes.json").exists():
            return c
    searched = " | ".join(str(c) for c in _CANDIDATES if c)
    raise RuntimeError(f"heroes.json not found. Searched: {searched}")


DATA_DIR = _resolve_data_dir()
HEROES_JSON = DATA_DIR / "heroes.json"

with HEROES_JSON.open(encoding="utf-8") as f:
    HERO_DATA: dict = json.load(f)

HERO_NAMES: dict[int, str] = {
    int(hid): h["name"] for hid, h in HERO_DATA.get("heroes", {}).items()
}


app = FastAPI(title="MLBB Draft Assistant API", version=HERO_DATA.get("version", "dev"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class RecommendRequest(BaseModel):
    enemy_picks: list[int] = Field(default_factory=list)
    ally_picks: list[int] = Field(default_factory=list)
    bans: list[int] = Field(default_factory=list)
    only_ids: list[int] | None = None
    only_roles: list[str] | None = None


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": HERO_DATA.get("version"),
        "heroes": len(HERO_DATA.get("heroes", {})),
        "data_dir": str(DATA_DIR),
    }


@app.get("/api/heroes")
def heroes() -> dict:
    return HERO_DATA


@app.get("/api/portrait/{hero_id}")
def portrait(hero_id: int):
    hero = HERO_DATA.get("heroes", {}).get(str(hero_id))
    if not hero:
        raise HTTPException(status_code=404, detail="hero not found")
    rel = hero.get("portrait")
    if not rel:
        raise HTTPException(status_code=404, detail="portrait not recorded for this hero")
    path = DATA_DIR / rel
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"portrait file missing: {rel}")
    return FileResponse(path)


# Full-body portraits live in scraper/output/portraits_full/{id}.{ext}. They're
# only rendered in the pick slots; pool tiles + ban slots use the smaller round
# face crop served by /api/portrait. If a hero has no full-body asset we fall
# back to the face crop so the UI still renders something.
_FULL_PORTRAIT_EXTS = (".png", ".jpg", ".jpeg", ".webp")


def _find_full_portrait(hero_id: int) -> Path | None:
    for ext in _FULL_PORTRAIT_EXTS:
        p = DATA_DIR / "portraits_full" / f"{hero_id}{ext}"
        if p.exists():
            return p
    return None


@app.get("/api/portrait/{hero_id}/full")
def portrait_full(hero_id: int):
    if str(hero_id) not in HERO_DATA.get("heroes", {}):
        raise HTTPException(status_code=404, detail="hero not found")
    full = _find_full_portrait(hero_id)
    if full is not None:
        return FileResponse(full)
    # Fallback to the face crop so the pick slot is never empty.
    return portrait(hero_id)


@app.post("/api/recommend")
def recommend(req: RecommendRequest) -> dict:
    return score_draft(
        HERO_DATA,
        req.enemy_picks,
        req.ally_picks,
        req.bans,
        req.only_ids,
        req.only_roles,
    )


@app.get("/api/leaderboard")
def leaderboard(rank: str = DEFAULT_RANK) -> dict:
    if rank not in VALID_RANKS:
        raise HTTPException(
            status_code=400,
            detail=f"invalid rank '{rank}'. Allowed: {sorted(VALID_RANKS)}",
        )
    return fetch_leaderboard(rank)


@app.get("/api/stats/{hero_id}")
def stats(hero_id: int, rank: str = DEFAULT_RANK) -> dict:
    if rank not in VALID_RANKS:
        raise HTTPException(
            status_code=400,
            detail=f"invalid rank '{rank}'. Allowed: {sorted(VALID_RANKS)}",
        )
    if str(hero_id) not in HERO_DATA.get("heroes", {}):
        raise HTTPException(status_code=404, detail="hero not found")
    try:
        return fetch_stats(hero_id, HERO_NAMES, rank=rank)
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"upstream error: {e}") from e
    except requests.RequestException as e:
        raise HTTPException(status_code=504, detail=f"upstream unreachable: {e}") from e
