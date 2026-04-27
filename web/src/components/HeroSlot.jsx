import { useState } from 'react'
import { api } from '../api'
import { rankTextTone, WrDot } from './HeroOverlay'
import { roleBorder } from './roleStyles'

export default function HeroSlot({
  hero,
  team,
  kind,
  selecting,
  onSelect,
  onClear,
  onDropHero,
  optional,
  onHeroEnter,
  onHeroLeave,
  stats,
  rankTotal,
  compact = false,
  slotIndex,
}) {
  const filled = !!hero
  const isBan = kind === 'bans'
  const mutedOptional = optional && !filled
  const [dragOver, setDragOver] = useState(false)

  const ring = dragOver
    ? 'ring-2 ring-emerald-400'
    : mutedOptional
      ? 'ring-1 ring-dashed ring-slate-700/60 hover:ring-slate-500'
      : 'ring-1 ring-slate-700 hover:ring-slate-400'
  const pulseClass = selecting && !filled && !dragOver ? 'slot-selecting' : ''

  const bg = isBan
    ? mutedOptional ? 'bg-rose-950/10' : 'bg-rose-950/30'
    : 'bg-slate-800'

  const handleClick = () => {
    if (filled) onClear?.()
    else onSelect?.()
  }

  const portraitShape = compact ? 'rounded-full' : 'rounded-t'
  const handlers = {
    onClick: handleClick,
    onMouseEnter: filled ? (e) => onHeroEnter?.(hero.id, e.currentTarget) : undefined,
    onMouseLeave: filled ? () => onHeroLeave?.() : undefined,
    onDragOver: (e) => {
      if (!onDropHero) return
      if (![...e.dataTransfer.types].some((t) => t === 'application/x-mlbb-hero' || t === 'text/plain')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!dragOver) setDragOver(true)
    },
    onDragLeave: () => dragOver && setDragOver(false),
    onDrop: (e) => {
      e.preventDefault()
      setDragOver(false)
      if (!onDropHero) return
      const raw = e.dataTransfer.getData('application/x-mlbb-hero') || e.dataTransfer.getData('text/plain')
      const id = Number.parseInt(raw, 10)
      if (Number.isFinite(id)) onDropHero(id)
    },
  }

  const ariaLabel = filled
    ? `${hero.name} — click to remove`
    : `${isBan ? 'Ban' : 'Pick'} slot${optional ? ' (optional)' : ''}`

  if (compact) {
    return (
      <button
        type="button"
        {...handlers}
        data-draft-slot={team != null && slotIndex != null ? 'true' : undefined}
        data-draft-team={team}
        data-draft-kind={kind}
        data-draft-index={slotIndex}
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden ${portraitShape} ${bg} ${ring} ${pulseClass} transition ${mutedOptional ? 'opacity-60 hover:opacity-100' : ''}`}
        aria-label={ariaLabel}
      >
        {filled ? (
          <>
            <img
              src={api.portraitUrl(hero.id)}
              alt={hero.name}
              className="h-full w-full object-cover grayscale"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-rose-950/40">
              <span className="rotate-12 text-2xl font-black text-rose-400/90">✕</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-0.5 text-slate-500">
            <span className="text-base leading-none">+</span>
            <span className="text-[8px] uppercase tracking-wider">
              {optional ? 'ban·opt' : 'ban'}
            </span>
          </div>
        )}
      </button>
    )
  }

  // Pick variant: 84×112 with a 84px portrait row + 28px nameplate row.
  // The top border of the nameplate carries the role color (replaces the
  // inline role badge pill to save vertical real estate).
  const playerLabel = typeof slotIndex === 'number' ? `Player ${slotIndex + 1}` : 'Pick'
  const nameplateBorder = filled ? roleBorder(hero?.role) : 'border-slate-700'
  return (
    <button
      type="button"
      {...handlers}
      data-draft-slot={team != null && slotIndex != null ? 'true' : undefined}
      data-draft-team={team}
      data-draft-kind={kind}
      data-draft-index={slotIndex}
      className={`grid h-[152px] w-[84px] grid-rows-[132px_28px] overflow-hidden rounded ${ring} ${pulseClass} transition ${mutedOptional ? 'opacity-60 hover:opacity-100' : ''}`}
      aria-label={ariaLabel}
    >
      <div className={`relative flex items-center justify-center overflow-hidden ${bg}`}>
        {filled ? (
          <img
            src={api.portraitUrl(hero.id)}
            alt={hero.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-0.5 text-slate-500">
            <span className="text-xl leading-none">+</span>
            <span className="text-[8px] uppercase tracking-wider">pick</span>
          </div>
        )}
      </div>
      <div className={`flex items-center gap-1 border-t-2 ${nameplateBorder} bg-slate-900/80 px-1 text-left text-[10px]`}>
        {filled ? (
          <>
            {stats?.rank != null && (
              <span className={`flex-none tabular-nums ${rankTextTone(stats.rank, rankTotal)}`}>
                #{stats.rank}
              </span>
            )}
            <span
              className="min-w-0 flex-1 truncate font-medium text-slate-100"
              title={hero.name}
            >
              {hero.name}
            </span>
            <WrDot wr={stats?.win_rate} size="xs" className="flex-none" />
            {stats?.win_rate != null && (
              <span className="flex-none tabular-nums text-slate-300">
                {Math.round(stats.win_rate * 100)}%
              </span>
            )}
          </>
        ) : (
          <span className="flex-1 text-center uppercase tracking-wider text-slate-500">
            {playerLabel}
          </span>
        )}
      </div>
    </button>
  )
}
