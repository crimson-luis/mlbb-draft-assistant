import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { rankTextTone, WrDot } from './HeroOverlay'
import { LANE_LABELS, LANE_ORDER, LANE_ROLES } from '../lanes'

const DRAG_MIME = 'application/x-mlbb-hero'

function hasOurDrag(dt) {
  if (!dt) return false
  const t = dt.types
  if (!t) return false
  for (let i = 0; i < t.length; i++) if (t[i] === DRAG_MIME) return true
  return false
}

function getDraggedHeroId(dt) {
  const raw = dt?.getData(DRAG_MIME) || dt?.getData('text/plain')
  const id = Number.parseInt(raw, 10)
  return Number.isFinite(id) ? id : null
}

const TEAM_DROP_ZONES = [
  {
    team: 'ally',
    label: 'Blue team',
    base: 'bg-sky-500/[0.08] ring-sky-300/20',
    active: 'bg-sky-400/[0.16] ring-sky-200/50',
    text: 'text-sky-100/80',
  },
  {
    team: 'enemy',
    label: 'Red team',
    base: 'bg-rose-500/[0.08] ring-rose-300/20',
    active: 'bg-rose-400/[0.16] ring-rose-200/50',
    text: 'text-rose-100/80',
  },
]

const ROLES = ['All', 'Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support']
const ROLE_LABELS = { All: 'All Roles' }
const FILTER_MODE_STORAGE_KEY = 'mlbb.heroPool.filterMode'

function loadFilterMode() {
  try {
    const v = localStorage.getItem(FILTER_MODE_STORAGE_KEY)
    return v === 'role' ? 'role' : 'lane'
  } catch {
    return 'lane'
  }
}

const SORT_FIELDS = [
  { value: 'name', label: 'Name', defaultDir: 'asc', stat: null },
  { value: 'rank', label: 'Rank', defaultDir: 'asc', stat: 'rank' },
  { value: 'win_rate', label: 'Win rate', defaultDir: 'desc', stat: 'win_rate' },
  { value: 'pick_rate', label: 'Pick rate', defaultDir: 'desc', stat: 'pick_rate' },
  { value: 'ban_rate', label: 'Ban rate', defaultDir: 'desc', stat: 'ban_rate' },
]
const SORT_FIELD_BY_VALUE = Object.fromEntries(SORT_FIELDS.map((f) => [f.value, f]))
const SORT_STORAGE_KEY = 'mlbb.heroPool.sort'

function loadSort() {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (!raw) return { field: 'name', dir: 'asc' }
    const parsed = JSON.parse(raw)
    const field = SORT_FIELD_BY_VALUE[parsed.field] ? parsed.field : 'name'
    const dir = parsed.dir === 'asc' || parsed.dir === 'desc' ? parsed.dir : 'asc'
    return { field, dir }
  } catch {
    return { field: 'name', dir: 'asc' }
  }
}

export default function HeroPool({
  heroes,
  usedIds,
  selecting,
  onPick,
  editMode,
  ownedIds,
  onToggleOwned,
  onHeroEnter,
  onHeroLeave,
  leaderboardStats,
  rankTotal,
  onDropToTeam,
}) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [laneFilter, setLaneFilter] = useState('any')
  const [filterMode, setFilterMode] = useState(loadFilterMode)
  const [sort, setSort] = useState(loadSort)
  const [draggingHeroId, setDraggingHeroId] = useState(null)
  const [dropHoverTeam, setDropHoverTeam] = useState(null)

  useEffect(() => {
    try { localStorage.setItem(FILTER_MODE_STORAGE_KEY, filterMode) } catch { /* ignore */ }
  }, [filterMode])

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort))
    } catch {
      // ignore quota / disabled storage
    }
  }, [sort])

  const setSortField = (field) => {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { field, dir: SORT_FIELD_BY_VALUE[field]?.defaultDir ?? 'asc' }
    })
  }
  const toggleSortDir = () => {
    setSort((prev) => ({ field: prev.field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  // Suppress the native "not-allowed" cursor while dragging a hero anywhere on
  // the page. Without a document-level preventDefault the browser only accepts
  // drops inside HeroSlot; everywhere else it shows the cancel cursor, which
  // is jarring because we render the drag with custom visuals.
  useEffect(() => {
    const onDragOver = (e) => {
      if (!hasOurDrag(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
    const onDrop = (e) => {
      if (!hasOurDrag(e.dataTransfer)) return
      e.preventDefault()
      setDraggingHeroId(null)
      setDropHoverTeam(null)
    }
    const onDragEnd = () => {
      setDraggingHeroId(null)
      setDropHoverTeam(null)
    }
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    document.addEventListener('dragend', onDragEnd)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
      document.removeEventListener('dragend', onDragEnd)
    }
  }, [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const laneRoles = filterMode === 'lane' ? LANE_ROLES[laneFilter] : null
    const filtered = heroes
      .filter((h) => {
        if (filterMode === 'role') {
          return roleFilter === 'All' ? true : h.role === roleFilter
        }
        return laneRoles ? laneRoles.includes(h.role) : true
      })
      .filter((h) => (q ? h.name.toLowerCase().includes(q) : true))

    const fieldDef = SORT_FIELD_BY_VALUE[sort.field] ?? SORT_FIELD_BY_VALUE.name
    const sign = sort.dir === 'desc' ? -1 : 1
    const nameCmp = (a, b) => a.name.localeCompare(b.name)

    if (fieldDef.value === 'name') {
      return filtered.slice().sort((a, b) => sign * nameCmp(a, b))
    }

    const statKey = fieldDef.stat
    const valueOf = (h) => {
      const v = leaderboardStats?.[h.id]?.[statKey]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    return filtered.slice().sort((a, b) => {
      const av = valueOf(a)
      const bv = valueOf(b)
      if (av == null && bv == null) return nameCmp(a, b)
      if (av == null) return 1
      if (bv == null) return -1
      if (av === bv) return nameCmp(a, b)
      return sign * (av - bv)
    })
  }, [heroes, query, roleFilter, laneFilter, filterMode, sort, leaderboardStats])

  const handleClick = (hero) => {
    if (editMode) { onToggleOwned(hero.id); return }
    if (selecting && !usedIds.has(hero.id)) onPick(hero.id)
  }

  const editHint = editMode
    ? 'Edit mode: click heroes to add/remove them from your pool.'
    : null

  const teamDropActive = draggingHeroId != null && !editMode && !!onDropToTeam
  const teamDropHandlers = (team) => ({
    onDragEnter: (e) => {
      if (!hasOurDrag(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      setDropHoverTeam((prev) => (prev === team ? prev : team))
    },
    onDragOver: (e) => {
      if (!hasOurDrag(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDropHoverTeam((prev) => (prev === team ? prev : team))
    },
    onDragLeave: () => {
      setDropHoverTeam((prev) => (prev === team ? null : prev))
    },
    onDrop: (e) => {
      if (!hasOurDrag(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      const heroId = getDraggedHeroId(e.dataTransfer)
      setDraggingHeroId(null)
      setDropHoverTeam(null)
      if (heroId != null) onDropToTeam(team, heroId)
    },
  })

  return (
    <section className="relative flex min-h-0 flex-col gap-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 p-1.5 lg:gap-2 lg:p-2">
      {teamDropActive && (
        <div className="absolute inset-0 z-20 grid grid-cols-2 overflow-hidden rounded-lg">
          {TEAM_DROP_ZONES.map((zone) => {
            const isActive = dropHoverTeam === zone.team
            return (
              <div
                key={zone.team}
                {...teamDropHandlers(zone.team)}
                className={`relative flex items-center justify-center ring-1 ring-inset transition-colors duration-150 ${
                  isActive ? zone.active : zone.base
                }`}
              >
                <div className="pointer-events-none rounded border border-white/10 bg-slate-950/35 px-3 py-1.5 text-[10px] font-semibold uppercase shadow-sm backdrop-blur-sm">
                  <span className={zone.text}>{zone.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <header className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex overflow-hidden rounded ring-1 ring-slate-700">
          {['lane', 'role'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFilterMode(m)}
              className={`px-2 py-0.5 text-xs transition ${
                filterMode === m
                  ? 'bg-slate-100 text-slate-900'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title={m === 'lane' ? 'Filter by lane' : 'Filter by role'}
            >
              {m === 'lane' ? 'Lane' : 'Role'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {filterMode === 'lane'
            ? LANE_ORDER.map((l) => (
                <button
                  key={l}
                  onClick={() => setLaneFilter(l)}
                  className={`rounded px-2 py-0.5 text-xs transition ${
                    laneFilter === l
                      ? 'bg-slate-100 text-slate-900'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {LANE_LABELS[l] ?? l}
                </button>
              ))
            : ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`rounded px-2 py-0.5 text-xs transition ${
                    roleFilter === r
                      ? 'bg-slate-100 text-slate-900'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {ROLE_LABELS[r] ?? r}
                </button>
              ))}
        </div>
        <span className="text-xs text-slate-500">{list.length} shown</span>
        <div className="flex w-full flex-wrap items-center gap-1 sm:ml-auto sm:w-auto">
          <label className="flex items-center gap-1 text-xs text-slate-400">
            <span>Sort</span>
            <select
              value={sort.field}
              onChange={(e) => setSortField(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-slate-100 focus:border-slate-400 focus:outline-none"
            >
              {SORT_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={toggleSortDir}
            aria-label={`Sort direction: ${sort.dir === 'asc' ? 'ascending' : 'descending'}`}
            title={sort.dir === 'asc' ? 'Ascending — click to flip' : 'Descending — click to flip'}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 focus:border-slate-400 focus:outline-none"
          >
            {sort.dir === 'asc' ? '↑' : '↓'}
          </button>
          <input
            type="search"
            placeholder="Search heroes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-[160px] flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm placeholder-slate-500 focus:border-slate-400 focus:outline-none sm:w-[180px] sm:flex-none"
          />
        </div>
      </header>

      {editHint && (
        <div className="rounded border border-amber-700 bg-amber-950/30 px-2 py-1 text-xs text-amber-200">
          {editHint}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1 overflow-y-auto overflow-x-hidden pr-1 [grid-auto-rows:96px] sm:grid-cols-[repeat(auto-fill,minmax(72px,1fr))] sm:[grid-auto-rows:104px] lg:grid-cols-[repeat(auto-fill,minmax(80px,1fr))] lg:[grid-auto-rows:112px]">
        {list.map((h) => {
          const used = usedIds.has(h.id)
          const owned = ownedIds?.has(h.id)
          const interactive = editMode ? true : (!!selecting && !used)
          const draggable = !editMode && !used
          const stats = leaderboardStats?.[h.id]
          return (
            <button
              key={h.id}
              type="button"
              disabled={!interactive && !draggable}
              draggable={draggable}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, String(h.id))
                e.dataTransfer.setData('text/plain', String(h.id))
                e.dataTransfer.effectAllowed = 'move'
                setDraggingHeroId(h.id)
                setDropHoverTeam(null)
                onHeroLeave?.()
              }}
              onDragEnd={() => {
                setDraggingHeroId(null)
                setDropHoverTeam(null)
              }}
              onMouseEnter={(e) => onHeroEnter?.(h.id, e.currentTarget)}
              onMouseLeave={() => onHeroLeave?.()}
              onClick={() => handleClick(h)}
              className={`group relative flex h-24 flex-col items-center justify-center gap-0.5 rounded-md p-0.5 text-left transition sm:h-[104px] lg:h-[112px]
                ${!editMode && used ? 'cursor-not-allowed opacity-30' : ''}
                ${interactive ? 'cursor-pointer hover:bg-slate-800/70' : draggable ? 'cursor-grab hover:bg-slate-800/70 active:cursor-grabbing' : 'cursor-not-allowed'}
              `}
              aria-label={`${h.name} (${h.role})`}
              title={!editMode && used ? `${h.name} — already used` : h.name}
            >
              <div className={`relative h-14 w-14 flex-none overflow-hidden rounded-full bg-slate-800 ring-1 sm:h-16 sm:w-16 lg:h-[72px] lg:w-[72px] ${
                editMode && owned ? 'ring-amber-400' : 'ring-slate-700 group-hover:ring-slate-400'
              }`}>
                <img
                  src={api.portraitUrl(h.id)}
                  alt={h.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {owned && (
                  <span
                    aria-label="in my pool"
                    className="absolute left-0.5 top-0.5 rounded bg-amber-400/90 px-1 text-[9px] font-bold leading-4 text-slate-900"
                  >
                    ★
                  </span>
                )}
              </div>
              <span className="flex w-full items-center justify-center gap-1 truncate text-center text-[9px] font-medium leading-none text-slate-100 sm:text-[10px]" title={h.name}>
                {stats?.rank ? (
                  <span className={`flex-none tabular-nums ${rankTextTone(stats.rank, rankTotal)}`}>#{stats.rank}</span>
                ) : null}
                <span className="min-w-0 truncate">{h.name}</span>
                <WrDot wr={stats?.win_rate} size="xs" className="flex-none" />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
