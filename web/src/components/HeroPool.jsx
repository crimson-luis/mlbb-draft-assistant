import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { rankTextTone, WrDot } from './HeroOverlay'

const DRAG_MIME = 'application/x-mlbb-hero'

function hasOurDrag(dt) {
  if (!dt) return false
  const t = dt.types
  if (!t) return false
  for (let i = 0; i < t.length; i++) if (t[i] === DRAG_MIME) return true
  return false
}

const ROLES = ['All', 'Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support']

const ROLE_STYLES = {
  Tank: 'bg-sky-500/20 text-sky-300 ring-sky-500/30',
  Fighter: 'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  Assassin: 'bg-rose-500/20 text-rose-300 ring-rose-500/30',
  Mage: 'bg-violet-500/20 text-violet-300 ring-violet-500/30',
  Marksman: 'bg-orange-500/20 text-orange-300 ring-orange-500/30',
  Support: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
}

function roleClass(role) {
  return ROLE_STYLES[role] ?? 'bg-slate-500/20 text-slate-300 ring-slate-500/30'
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
}) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')

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
    }
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return heroes
      .filter((h) => (roleFilter === 'All' ? true : h.role === roleFilter))
      .filter((h) => (q ? h.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [heroes, query, roleFilter])

  const handleClick = (hero) => {
    if (editMode) { onToggleOwned(hero.id); return }
    if (selecting && !usedIds.has(hero.id)) onPick(hero.id)
  }

  const editHint = editMode
    ? 'Edit mode: click heroes to add/remove them from your pool.'
    : null

  return (
    <section className="flex h-full min-h-0 flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded px-2 py-1 text-xs transition ${
                roleFilter === r
                  ? 'bg-slate-100 text-slate-900'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">{list.length} shown</span>
        <input
          type="search"
          placeholder="Search heroes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm placeholder-slate-500 focus:border-slate-400 focus:outline-none"
        />
      </header>

      {editHint && (
        <div className="rounded border border-amber-700 bg-amber-950/30 px-2 py-1 text-xs text-amber-200">
          {editHint}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-1 overflow-auto pr-1 sm:grid-cols-6 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14">
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
                onHeroLeave?.()
              }}
              onMouseEnter={(e) => onHeroEnter?.(h.id, e.currentTarget)}
              onMouseLeave={() => onHeroLeave?.()}
              onClick={() => handleClick(h)}
              className={`group relative flex flex-col items-center gap-0.5 rounded-md p-0.5 text-left transition
                ${!editMode && used ? 'cursor-not-allowed opacity-30' : ''}
                ${interactive ? 'cursor-pointer hover:bg-slate-800/70' : draggable ? 'cursor-grab hover:bg-slate-800/70 active:cursor-grabbing' : 'cursor-not-allowed'}
              `}
              aria-label={`${h.name} (${h.role})`}
              title={!editMode && used ? `${h.name} — already used` : h.name}
            >
              <div className={`relative aspect-square w-full overflow-hidden rounded-full bg-slate-800 ring-1 ${
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
              <div className="flex w-full flex-col items-center gap-0.5">
                <span className="flex w-full items-center justify-center gap-1 truncate text-center text-[10px] font-medium text-slate-100" title={h.name}>
                  {stats?.rank ? (
                    <span className={`flex-none tabular-nums ${rankTextTone(stats.rank, rankTotal)}`}>#{stats.rank}</span>
                  ) : null}
                  <span className="min-w-0 truncate">{h.name}</span>
                  <WrDot wr={stats?.win_rate} size="xs" className="flex-none" />
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!h.role) return
                    setRoleFilter((prev) => (prev === h.role ? 'All' : h.role))
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.stopPropagation()
                    e.preventDefault()
                    if (!h.role) return
                    setRoleFilter((prev) => (prev === h.role ? 'All' : h.role))
                  }}
                  title={h.role ? (roleFilter === h.role ? `Show all roles` : `Filter pool to ${h.role}`) : ''}
                  className={`hidden max-w-full cursor-pointer truncate rounded px-1 text-[9px] ring-1 ring-inset hover:brightness-125 md:block ${roleClass(h.role)}`}
                >
                  {h.role || '—'}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
