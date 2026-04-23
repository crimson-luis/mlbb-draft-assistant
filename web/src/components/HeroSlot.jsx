import { useState } from 'react'
import { api } from '../api'

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

export default function HeroSlot({ hero, kind, selecting, onSelect, onClear, onDropHero, optional, onHeroEnter, onHeroLeave }) {
  const filled = !!hero
  const isBan = kind === 'bans'
  const mutedOptional = optional && !filled
  const [dragOver, setDragOver] = useState(false)

  const ring = dragOver
    ? 'ring-2 ring-emerald-400'
    : selecting
      ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950'
      : mutedOptional
        ? 'ring-1 ring-dashed ring-slate-700/60 hover:ring-slate-500'
        : 'ring-1 ring-slate-700 hover:ring-slate-400'

  const bg = isBan
    ? mutedOptional ? 'bg-rose-950/10' : 'bg-rose-950/30'
    : 'bg-slate-800'

  const handleClick = () => {
    if (filled) onClear?.()
    else onSelect?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={filled ? (e) => onHeroEnter?.(hero.id, e.currentTarget) : undefined}
      onMouseLeave={filled ? () => onHeroLeave?.() : undefined}
      onDragOver={(e) => {
        if (!onDropHero) return
        if (![...e.dataTransfer.types].some((t) => t === 'application/x-mlbb-hero' || t === 'text/plain')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={() => dragOver && setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (!onDropHero) return
        const raw = e.dataTransfer.getData('application/x-mlbb-hero') || e.dataTransfer.getData('text/plain')
        const id = Number.parseInt(raw, 10)
        if (Number.isFinite(id)) onDropHero(id)
      }}
      className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md ${bg} ${ring} transition ${mutedOptional ? 'opacity-60 hover:opacity-100' : ''}`}
      aria-label={filled ? `${hero.name} — click to remove` : `${isBan ? 'Ban' : 'Pick'} slot${optional ? ' (optional)' : ''}`}
    >
      {filled ? (
        <>
          <img
            src={api.portraitUrl(hero.id)}
            alt={hero.name}
            className={`h-full w-full object-cover ${isBan ? 'grayscale' : ''}`}
          />
          {isBan && (
            <div className="absolute inset-0 flex items-center justify-center bg-rose-950/40">
              <span className="rotate-12 text-3xl font-black text-rose-400/90">✕</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-1 pb-1 pt-3">
            <span className="w-full truncate text-[11px] font-medium text-slate-100" title={hero.name}>
              {hero.name}
            </span>
            <span className={`rounded px-1 text-[9px] ring-1 ring-inset ${roleClass(hero.role)}`}>
              {hero.role || '—'}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-0.5 text-slate-500">
          <span className="text-xl leading-none">+</span>
          <span className="text-[9px] uppercase tracking-wider">
            {isBan ? (optional ? 'ban · opt' : 'ban') : 'pick'}
          </span>
        </div>
      )}
    </button>
  )
}
