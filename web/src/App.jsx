import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { useDraftState } from './hooks/useDraftState'
import useHeroPopover from './hooks/useHeroPopover'
import useLeaderboard from './hooks/useLeaderboard'
import BanBar from './components/BanBar'
import PickColumn from './components/PickColumn'
import HeroPool from './components/HeroPool'
import Recommendations from './components/Recommendations'
import HeroStatsPopover from './components/HeroStatsPopover'

const OWNED_STORAGE_KEY = 'mlbb:ownedHeroes'
const RANK_STORAGE_KEY = 'mlbb:rank'
const LANE_STORAGE_KEY = 'mlbb:lane'
const BAN_COUNT_STORAGE_KEY = 'mlbb:banCount'
const RANKS = ['all', 'epic', 'legend', 'mythic', 'honor', 'glory']

// Ban-count defaults by rank tier (MLBB in-game rules):
//   Epic: 3 per team · Legend: 4 · Mythic+: 5
// 'all' is meta (not an actual tier) — default to the most common live setting.
const RANK_BAN_DEFAULTS = { all: 5, epic: 3, legend: 4, mythic: 5, honor: 5, glory: 5 }

// Lane → roles mapping. A lane in MLBB is the position on the map; the role
// is the hero class. This maps a selected lane to the roles typically played
// in that lane, so selecting "Gold" filters recs to Marksmen, etc.
const LANE_ROLES = {
  any: null,
  gold: ['Marksman'],
  exp: ['Fighter'],
  mid: ['Mage'],
  jungle: ['Assassin'],
  roam: ['Tank', 'Support'],
}
const LANES = Object.keys(LANE_ROLES)

function loadOwned() {
  try {
    const raw = localStorage.getItem(OWNED_STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function loadRank() {
  try {
    const r = localStorage.getItem(RANK_STORAGE_KEY)
    return RANKS.includes(r) ? r : 'mythic'
  } catch {
    return 'mythic'
  }
}

function loadLane() {
  try {
    const l = localStorage.getItem(LANE_STORAGE_KEY)
    return LANES.includes(l) ? l : 'any'
  } catch {
    return 'any'
  }
}

// Ban count is stored as either a number (user override) or the string
// 'rank' (follow the rank tier's default). Anything else falls back to 'rank'.
function loadBanCount() {
  try {
    const v = localStorage.getItem(BAN_COUNT_STORAGE_KEY)
    if (v === '3' || v === '4' || v === '5') return Number(v)
    return 'rank'
  } catch {
    return 'rank'
  }
}

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [recs, setRecs] = useState([])
  const [recsLoading, setRecsLoading] = useState(false)
  const [recsError, setRecsError] = useState(null)

  const [ownedIds, setOwnedIds] = useState(loadOwned)
  const [poolEditMode, setPoolEditMode] = useState(false)
  const [filterToOwned, setFilterToOwned] = useState(false)
  const [rank, setRank] = useState(loadRank)
  const [lane, setLane] = useState(loadLane)
  const [banCountPref, setBanCountPref] = useState(loadBanCount)

  const { state, actions, usedIds, recommendPayload, selectingSlot } = useDraftState()
  const { hover: popHover, onHeroEnter, onHeroLeave, onPopoverKeep } = useHeroPopover()
  const { statsByHeroId, rankTotal } = useLeaderboard(rank)

  // Resolve the effective ban count: user override wins, otherwise follow rank.
  const banCount = typeof banCountPref === 'number' ? banCountPref : RANK_BAN_DEFAULTS[rank] ?? 5
  const banCountSource = typeof banCountPref === 'number' ? 'user' : 'rank'

  useEffect(() => {
    api.heroes().then(setData).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify([...ownedIds]))
    } catch { /* ignore quota */ }
  }, [ownedIds])

  useEffect(() => {
    try { localStorage.setItem(RANK_STORAGE_KEY, rank) } catch { /* ignore */ }
  }, [rank])

  useEffect(() => {
    try { localStorage.setItem(LANE_STORAGE_KEY, lane) } catch { /* ignore */ }
  }, [lane])

  useEffect(() => {
    try {
      if (typeof banCountPref === 'number') localStorage.setItem(BAN_COUNT_STORAGE_KEY, String(banCountPref))
      else localStorage.removeItem(BAN_COUNT_STORAGE_KEY)
    } catch { /* ignore */ }
  }, [banCountPref])

  const onBanCountChange = useCallback((n) => {
    // Clicking the rank default while it's already selected clears the override
    // and returns to "follow rank". Otherwise pin the user's choice.
    setBanCountPref((prev) => {
      const rankDefault = RANK_BAN_DEFAULTS[rank] ?? 5
      if (n === rankDefault && prev !== 'rank') return 'rank'
      if (n === rankDefault && prev === 'rank') return 'rank'
      return n
    })
  }, [rank])

  const toggleOwned = useCallback((id) => {
    setOwnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const heroesById = useMemo(() => {
    if (!data) return {}
    const map = {}
    for (const [id, h] of Object.entries(data.heroes)) map[id] = h
    return map
  }, [data])

  const heroesList = useMemo(
    () => (data ? Object.values(data.heroes) : []),
    [data],
  )

  // Respect the active ban count — bans beyond the visible slots shouldn't
  // influence scoring or mark heroes as used.
  const visibleBans = useMemo(
    () => [
      ...state.enemy.bans.slice(0, banCount),
      ...state.ally.bans.slice(0, banCount),
    ].filter((x) => x != null),
    [state.enemy.bans, state.ally.bans, banCount],
  )

  const hasInput =
    recommendPayload.enemy_picks.length +
      recommendPayload.ally_picks.length +
      visibleBans.length >
    0

  const filterToOwnedActive = filterToOwned && ownedIds.size > 0

  // Debounced recommend — 300ms per CLAUDE.md.
  const abortRef = useRef(null)
  useEffect(() => {
    if (!data) return
    if (!hasInput) {
      setRecs([])
      setRecsError(null)
      return
    }
    setRecsLoading(true)
    setRecsError(null)
    abortRef.current?.cancel?.()
    let cancelled = false
    abortRef.current = { cancel: () => (cancelled = true) }

    const laneRoles = LANE_ROLES[lane]
    const payload = {
      enemy_picks: recommendPayload.enemy_picks,
      ally_picks: recommendPayload.ally_picks,
      bans: visibleBans,
      ...(filterToOwnedActive ? { only_ids: [...ownedIds] } : {}),
      ...(laneRoles ? { only_roles: laneRoles } : {}),
    }

    const t = setTimeout(async () => {
      try {
        const r = await api.recommend(payload)
        if (!cancelled) setRecs(r.recommendations)
      } catch (e) {
        if (!cancelled) setRecsError(e.message)
      } finally {
        if (!cancelled) setRecsLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [recommendPayload, visibleBans, hasInput, data, filterToOwnedActive, ownedIds, lane])

  // Escape clears pending slot selection (and exits edit mode).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (poolEditMode) setPoolEditMode(false)
      else actions.clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, poolEditMode])

  // v2 seam: expose a tiny imperative API so a future screen-capture module
  // can push detected draft state in without touching the UI. Same payload
  // shape as the reducer state (minus `selecting`).
  useEffect(() => {
    const setState = (next) => actions.replace({ ...next, selecting: null })
    window.mlbbDraft = {
      setState,
      getState: () => state,
      reset: () => actions.reset(),
    }
    const onEvent = (e) => setState(e.detail)
    window.addEventListener('mlbb:setState', onEvent)
    return () => {
      window.removeEventListener('mlbb:setState', onEvent)
      if (window.mlbbDraft?.setState === setState) delete window.mlbbDraft
    }
  }, [actions, state])

  const onPoolPick = (heroId) => {
    if (!state.selecting) return
    actions.fillSlot(heroId)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-6 py-3">
          <h1 className="text-lg font-semibold tracking-tight">MLBB Draft Assistant</h1>
          {data && (
            <span className="text-xs text-slate-400">
              {Object.keys(data.heroes).length} heroes · v{data.version}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-slate-400" title="Rank tier used for live stats">
              Rank
              <select
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-200 ring-1 ring-slate-700 focus:outline-none"
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <div
              className="flex items-center gap-1 text-xs text-slate-400"
              title={banCountSource === 'rank' ? 'Bans per team — default for current rank' : 'Bans per team — overridden'}
            >
              Bans
              <div className="inline-flex overflow-hidden rounded ring-1 ring-slate-700">
                {[3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onBanCountChange(n)}
                    className={`px-1.5 py-0.5 text-xs transition ${
                      banCount === n
                        ? 'bg-slate-100 text-slate-900'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-1 text-xs text-slate-400" title="Your lane — filters recommendations to the matching roles">
              Lane
              <select
                value={lane}
                onChange={(e) => setLane(e.target.value)}
                className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-200 ring-1 ring-slate-700 focus:outline-none"
              >
                {LANES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <span className="text-xs text-slate-400">
              My pool: <span className="font-semibold text-slate-200">{ownedIds.size}</span>
            </span>
            <button
              onClick={() => setPoolEditMode((v) => !v)}
              className={`rounded px-2 py-1 text-xs transition ${
                poolEditMode
                  ? 'bg-amber-400 text-slate-900 hover:bg-amber-300'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {poolEditMode ? 'Done editing' : 'Edit pool'}
            </button>
            <label
              className={`flex items-center gap-1.5 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 ${
                ownedIds.size === 0 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-slate-700'
              }`}
              title={ownedIds.size === 0 ? 'Add heroes to your pool first' : 'Only suggest heroes you own'}
            >
              <input
                type="checkbox"
                checked={filterToOwned}
                disabled={ownedIds.size === 0}
                onChange={(e) => setFilterToOwned(e.target.checked)}
                className="h-3 w-3 accent-amber-400"
              />
              Filter recs to my pool
            </label>
            <button
              onClick={actions.reset}
              className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              Reset draft
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1600px] flex-col gap-3 px-6 py-4">
        {error && (
          <div className="rounded border border-rose-700 bg-rose-950/50 p-4 text-sm text-rose-200">
            Failed to load hero data: {error}
            <div className="mt-1 text-xs text-rose-300">
              Is the backend running at <code>localhost:8000</code>?
            </div>
          </div>
        )}

        {!data && !error && (
          <div className="p-10 text-center text-sm text-slate-400">Loading hero roster…</div>
        )}

        {data && (
          <>
            <BanBar
              state={state}
              heroesById={heroesById}
              actions={actions}
              selectingSlot={selectingSlot}
              banCount={banCount}
              onHeroEnter={onHeroEnter}
              onHeroLeave={onHeroLeave}
              leaderboardStats={statsByHeroId}
              rankTotal={rankTotal}
            />

            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
              <PickColumn
                team="ally"
                state={state}
                heroesById={heroesById}
                actions={actions}
                selectingSlot={selectingSlot}
                onHeroEnter={onHeroEnter}
                onHeroLeave={onHeroLeave}
                leaderboardStats={statsByHeroId}
                rankTotal={rankTotal}
              />
              <HeroPool
                heroes={heroesList}
                usedIds={usedIds}
                selecting={state.selecting}
                onPick={onPoolPick}
                editMode={poolEditMode}
                ownedIds={ownedIds}
                onToggleOwned={toggleOwned}
                onHeroEnter={onHeroEnter}
                onHeroLeave={onHeroLeave}
                leaderboardStats={statsByHeroId}
                rankTotal={rankTotal}
              />
              <PickColumn
                team="enemy"
                state={state}
                heroesById={heroesById}
                actions={actions}
                selectingSlot={selectingSlot}
                onHeroEnter={onHeroEnter}
                onHeroLeave={onHeroLeave}
                leaderboardStats={statsByHeroId}
                rankTotal={rankTotal}
              />
            </div>
            <Recommendations
              recommendations={recs}
              heroesById={heroesById}
              loading={recsLoading}
              error={recsError}
              hasInput={hasInput}
              filterToOwnedActive={filterToOwnedActive}
              onHeroEnter={onHeroEnter}
              onHeroLeave={onHeroLeave}
              leaderboardStats={statsByHeroId}
              rankTotal={rankTotal}
            />
          </>
        )}
      </main>

      {popHover && (
        <HeroStatsPopover
          heroId={popHover.heroId}
          hero={heroesById[popHover.heroId]}
          rank={rank}
          anchorRect={popHover.rect}
          onHoverKeep={onPopoverKeep}
          onHoverLeave={onHeroLeave}
        />
      )}
    </div>
  )
}
