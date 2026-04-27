import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { rankTextTone, WrDot } from './HeroOverlay'
import { LANE_LABELS, LANE_ORDER, LANE_ROLES } from '../lanes'
import { buttonClass, compactButtonClass, searchInputClass, selectClass } from './buttonStyles'

const DRAG_START_THRESHOLD = 8

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

function teamFromClientX(x) {
  return x < window.innerWidth / 2 ? 'ally' : 'enemy'
}

function boundsFromElement(element) {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

function pointInBounds(x, y, bounds) {
  return !!bounds &&
    x >= bounds.left &&
    x <= bounds.left + bounds.width &&
    y >= bounds.top &&
    y <= bounds.top + bounds.height
}

function slotFromPoint(x, y) {
  const element = document.elementFromPoint(x, y)
  const slot = element?.closest?.('[data-draft-slot="true"]')
  if (!slot) return null

  const { draftTeam: team, draftKind: kind, draftIndex } = slot.dataset
  const index = Number.parseInt(draftIndex, 10)
  if ((team !== 'ally' && team !== 'enemy') || (kind !== 'picks' && kind !== 'bans') || !Number.isFinite(index)) {
    return null
  }
  return { team, kind, index, bounds: boundsFromElement(slot) }
}

const ROLES = ['All', 'Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support']
const ROLE_LABELS = { All: 'All Roles' }
const FILTER_MODE_STORAGE_KEY = 'mlbb.heroPool.filterMode'

function loadFilterMode() {
  try {
    const v = localStorage.getItem(FILTER_MODE_STORAGE_KEY)
    return v === 'role' || v === 'pool' ? v : 'lane'
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
const SORT_ARROW = { asc: '\u2191', desc: '\u2193' }

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

function MyPoolPopover({
  ownedCount,
  editMode,
  onEditModeChange,
}) {
  return (
    <div className="absolute right-0 top-[calc(100%+0.4rem)] z-40 w-[calc(100vw-2rem)] max-w-72 rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/40 sm:w-72">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">My Pool</span>
          <span className="text-xs font-semibold text-slate-200">{ownedCount} heroes</span>
        </div>
        <button
          type="button"
          onClick={() => onEditModeChange((value) => !value)}
          className={buttonClass(editMode ? 'warning' : 'neutral', 'min-h-9 justify-start text-sm')}
        >
          {editMode ? 'Done editing' : 'Edit pool'}
        </button>
      </div>
    </div>
  )
}

export default function HeroPool({
  heroes,
  usedIds,
  selecting,
  onPick,
  editMode,
  ownedIds,
  onEditModeChange,
  onToggleOwned,
  onHeroEnter,
  onHeroLeave,
  leaderboardStats,
  rankTotal,
  onDropToTeam,
  onDropToSlot,
}) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [laneFilter, setLaneFilter] = useState('any')
  const [filterMode, setFilterMode] = useState(loadFilterMode)
  const [sort, setSort] = useState(loadSort)
  const [dragState, setDragState] = useState(null)
  const [poolMenuOpen, setPoolMenuOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const poolRef = useRef(null)
  const poolMenuRef = useRef(null)
  const pendingDragRef = useRef(null)
  const removePointerListenersRef = useRef(null)
  const suppressClickRef = useRef(false)

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

  useEffect(() => {
    if (!poolMenuOpen) return undefined
    const onPointerDown = (e) => {
      if (!poolMenuRef.current?.contains(e.target)) setPoolMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setPoolMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [poolMenuOpen])

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

  const removePointerListeners = useCallback(() => {
    removePointerListenersRef.current?.()
    removePointerListenersRef.current = null
  }, [])

  const cleanupPointerDrag = useCallback(() => {
    const pending = pendingDragRef.current
    if (pending?.target && pending.pointerId != null) {
      try { pending.target.releasePointerCapture(pending.pointerId) } catch { /* ignore */ }
    }
    pendingDragRef.current = null
    removePointerListeners()
    setDragState(null)
  }, [removePointerListeners])

  const cancelPointerDrag = useCallback(() => {
    suppressClickRef.current = false
    cleanupPointerDrag()
  }, [cleanupPointerDrag])

  useEffect(() => () => cleanupPointerDrag(), [cleanupPointerDrag])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') cancelPointerDrag()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', cancelPointerDrag)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', cancelPointerDrag)
    }
  }, [cancelPointerDrag])

  useEffect(() => {
    if (!editMode && onDropToTeam) return undefined
    const id = window.setTimeout(cancelPointerDrag, 0)
    return () => window.clearTimeout(id)
  }, [cancelPointerDrag, editMode, onDropToTeam])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const laneRoles = filterMode === 'lane' ? LANE_ROLES[laneFilter] : null
    const filtered = heroes
      .filter((h) => {
        if (filterMode === 'pool') {
          return ownedIds?.has(h.id)
        }
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
  }, [heroes, query, roleFilter, laneFilter, filterMode, sort, leaderboardStats, ownedIds])

  const handleClick = (hero) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (editMode) { onToggleOwned(hero.id); return }
    if (selecting && !usedIds.has(hero.id)) onPick(hero.id)
  }

  const editHint = editMode
    ? 'Edit mode: click heroes to add/remove them from your pool.'
    : null
  const totalCount = heroes.length
  const availableCount = Math.max(0, totalCount - usedIds.size)
  const activeFilterLabel =
    filterMode === 'pool' ? 'My Pool' :
    filterMode === 'role' ? `${ROLE_LABELS[roleFilter] ?? roleFilter}` :
    `${LANE_LABELS[laneFilter] ?? laneFilter}`
  const activeSortField = SORT_FIELD_BY_VALUE[sort.field] ?? SORT_FIELD_BY_VALUE.name
  const activeSortLabel = `${activeSortField.label} ${SORT_ARROW[sort.dir] ?? ''}`.trim()
  const poolMetadataLabel = `${activeFilterLabel} / ${activeSortLabel}`
  const availableLabel = `${availableCount}/${totalCount}`

  const startTeamDrag = (hero, canTeamDrag) => (e) => {
    if (!canTeamDrag || e.button !== 0) return

    suppressClickRef.current = false
    cleanupPointerDrag()

    const pointerId = e.pointerId
    const target = e.currentTarget
    pendingDragRef.current = {
      active: false,
      hero,
      pointerId,
      startX: e.clientX,
      startY: e.clientY,
      target,
    }

    try { target.setPointerCapture(pointerId) } catch { /* ignore */ }

    const onPointerMove = (ev) => {
      const pending = pendingDragRef.current
      if (!pending || pending.pointerId !== ev.pointerId) return

      const bounds = boundsFromElement(poolRef.current)
      const dx = ev.clientX - pending.startX
      const dy = ev.clientY - pending.startY
      const movedEnough = Math.hypot(dx, dy) >= DRAG_START_THRESHOLD
      if (!pending.active && !movedEnough) return

      if (!pending.active) {
        pending.active = true
        onHeroLeave?.()
      }

      const insidePool = pointInBounds(ev.clientX, ev.clientY, bounds)
      ev.preventDefault()
      setDragState({
        hero: pending.hero,
        team: teamFromClientX(ev.clientX),
        x: ev.clientX,
        y: ev.clientY,
        bounds,
        slot: insidePool || !onDropToSlot ? null : slotFromPoint(ev.clientX, ev.clientY),
      })
    }

    const onPointerUp = (ev) => {
      const pending = pendingDragRef.current
      if (!pending || pending.pointerId !== ev.pointerId) return

      const { active, hero: pendingHero } = pending
      const bounds = boundsFromElement(poolRef.current)
      const insidePool = pointInBounds(ev.clientX, ev.clientY, bounds)
      const team = teamFromClientX(ev.clientX)
      const slot = insidePool ? null : slotFromPoint(ev.clientX, ev.clientY)
      cleanupPointerDrag()

      if (!active) return

      ev.preventDefault()
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)

      if (slot) {
        onDropToSlot?.(slot, pendingHero.id)
      } else if (insidePool) {
        onDropToTeam?.(team, pendingHero.id)
      }
    }

    const onPointerCancel = (ev) => {
      const pending = pendingDragRef.current
      if (!pending || pending.pointerId !== ev.pointerId) return
      cancelPointerDrag()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    removePointerListenersRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }

  return (
    <section ref={poolRef} className="relative flex min-h-0 flex-col gap-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 p-1.5 lg:gap-2 lg:p-2">
      {dragState && (
        <>
          {dragState.bounds && (
            <div
              className="pointer-events-none fixed z-50 grid grid-cols-2 overflow-hidden rounded-lg"
              style={{
                left: dragState.bounds.left,
                top: dragState.bounds.top,
                width: dragState.bounds.width,
                height: dragState.bounds.height,
              }}
            >
              {TEAM_DROP_ZONES.map((zone) => {
                const isActive = dragState.team === zone.team
                return (
                  <div
                    key={zone.team}
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
          {dragState.slot?.bounds && (
            <div
              aria-hidden="true"
              className={`pointer-events-none fixed z-[55] bg-emerald-400/10 ring-2 ring-inset ring-emerald-300 shadow-lg shadow-emerald-400/30 ${
                dragState.slot.kind === 'bans' ? 'rounded-full' : 'rounded-md'
              }`}
              style={{
                left: dragState.slot.bounds.left,
                top: dragState.slot.bounds.top,
                width: dragState.slot.bounds.width,
                height: dragState.slot.bounds.height,
              }}
            />
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-[60] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-white/15 bg-slate-950/85 py-1 pl-1 pr-3 text-xs font-semibold text-slate-100 shadow-2xl"
            style={{ left: dragState.x, top: dragState.y }}
          >
            <img
              src={api.portraitUrl(dragState.hero.id)}
              alt=""
              draggable={false}
              className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-500"
            />
            <span>{dragState.hero.name}</span>
          </div>
        </>
      )}

      <header className="grid gap-1.5">
        <div className="grid min-w-0 gap-1.5 sm:flex sm:items-center">
          <input
            type="search"
            placeholder="Search heroes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${searchInputClass} min-w-0 flex-1`}
          />
          <div className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 sm:mx-0 sm:shrink-0 sm:overflow-visible sm:px-0">
            <button
              type="button"
              aria-expanded={controlsOpen}
              onClick={() => setControlsOpen((value) => !value)}
              className={compactButtonClass(controlsOpen ? 'active' : 'neutral', 'shrink-0 whitespace-nowrap justify-start text-left')}
              title="Hero pool filters and sorting"
            >
              <span className="font-semibold">Pool:</span>
              <span className={`${controlsOpen ? 'text-slate-700' : 'text-slate-400'} ml-1`}>{poolMetadataLabel}</span>
            </button>
            <div ref={poolMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={poolMenuOpen}
                onClick={() => setPoolMenuOpen((value) => !value)}
                className={compactButtonClass(editMode ? 'warning' : 'neutral', 'shrink-0 whitespace-nowrap')}
              >
                <span>My Pool</span>
                <span className="ml-1 tabular-nums text-slate-400">{ownedIds?.size ?? 0}</span>
              </button>
              {poolMenuOpen && (
                <MyPoolPopover
                  ownedCount={ownedIds?.size ?? 0}
                  editMode={editMode}
                  onEditModeChange={onEditModeChange}
                />
              )}
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-slate-400">
              {availableLabel}
            </span>
          </div>
        </div>
        {controlsOpen && (
          <div className="grid gap-1.5 rounded-md border border-slate-800 bg-slate-950/30 p-1.5">
            <div className="flex min-w-0 items-center gap-1">
              <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-slate-700 bg-slate-950/35">
                {['lane', 'role', 'pool'].map((m, index) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFilterMode(m)}
                    className={compactButtonClass(
                      filterMode === m ? 'active' : 'neutral',
                      `${index === 0 ? 'rounded-r-none' : index === 2 ? 'rounded-l-none' : 'rounded-none'} border-transparent`
                    )}
                    title={
                      m === 'lane' ? 'Filter by lane' :
                      m === 'role' ? 'Filter by role' :
                      'Show only heroes in my pool'
                    }
                  >
                    {m === 'lane' ? 'Lane' : m === 'role' ? 'Role' : 'Pool'}
                  </button>
                ))}
              </div>
              <label className="ml-auto flex min-w-0 items-center gap-1 text-xs text-slate-400">
                <span className="shrink-0">Sort</span>
                <select
                  value={sort.field}
                  onChange={(e) => setSortField(e.target.value)}
                  className={`${selectClass} min-h-7 min-w-0 py-0.5`}
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
                title={sort.dir === 'asc' ? 'Ascending - click to flip' : 'Descending - click to flip'}
                className={compactButtonClass('neutral', 'w-7 shrink-0 px-0')}
              >
                {SORT_ARROW[sort.dir]}
              </button>
            </div>
            {filterMode !== 'pool' && (
              <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0">
                <div className="flex w-max items-center gap-1 sm:w-auto sm:flex-wrap">
                  {filterMode === 'lane'
                    ? LANE_ORDER.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setLaneFilter(l)}
                          className={compactButtonClass(laneFilter === l ? 'active' : 'neutral', 'shrink-0 whitespace-nowrap')}
                        >
                          {LANE_LABELS[l] ?? l}
                        </button>
                      ))
                    : ROLES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRoleFilter(r)}
                          className={compactButtonClass(roleFilter === r ? 'active' : 'neutral', 'shrink-0 whitespace-nowrap')}
                        >
                          {ROLE_LABELS[r] ?? r}
                        </button>
                      ))}
                </div>
              </div>
            )}
          </div>
        )}
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
          const canTeamDrag = !editMode && !used && !!onDropToTeam
          const stats = leaderboardStats?.[h.id]
          return (
            <button
              key={h.id}
              type="button"
              disabled={!interactive && !canTeamDrag}
              onPointerDown={startTeamDrag(h, canTeamDrag)}
              onMouseEnter={(e) => onHeroEnter?.(h.id, e.currentTarget)}
              onMouseLeave={() => onHeroLeave?.()}
              onClick={() => handleClick(h)}
              className={`group relative flex h-24 flex-col items-center justify-center gap-0.5 rounded-md p-0.5 text-left transition sm:h-[104px] lg:h-[112px]
                ${!editMode && used ? 'cursor-not-allowed opacity-30' : ''}
                ${canTeamDrag ? 'touch-none' : ''}
                ${interactive ? 'cursor-pointer hover:bg-slate-800/70' : canTeamDrag ? 'cursor-grab hover:bg-slate-800/70 active:cursor-grabbing' : 'cursor-not-allowed'}
              `}
              aria-grabbed={dragState?.hero.id === h.id}
              aria-label={`${h.name} (${h.role})`}
              title={!editMode && used ? `${h.name} - already used` : h.name}
            >
              {owned && (
                <span
                  aria-label="in my pool"
                  className="pointer-events-none absolute right-0.5 top-0 z-10 text-sm leading-none text-slate-400 drop-shadow"
                >
                  &#9733;
                </span>
              )}
              <div className={`relative h-14 w-14 flex-none overflow-hidden rounded-full bg-slate-800 ring-1 sm:h-16 sm:w-16 lg:h-[72px] lg:w-[72px] ${
                editMode && owned ? 'ring-amber-400' : 'ring-slate-700 group-hover:ring-slate-400'
              }`}>
                <img
                  src={api.portraitUrl(h.id)}
                  alt={h.name}
                  draggable={false}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
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
