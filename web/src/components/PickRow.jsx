import { useState } from 'react'
import { api } from '../api'
import { rankTextTone, WrDot } from './HeroOverlay'

const DRAG_MIME = 'application/x-mlbb-hero'

// Wide pick row. The hero portrait fills the entire row, fading toward the
// HeroPool side via a CSS mask. A bottom-anchored info strip overlays the
// portrait: "PLAYER N" while empty, "#rank Name WR%" once a hero is dropped.
//
// Click/select/clear/drop behavior mirrors the previous HeroSlot pick variant.
export default function PickRow({
  team,
  slotIndex,
  hero,
  stats,
  rankTotal,
  selecting,
  onSelect,
  onClear,
  onDropHero,
  onHeroEnter,
  onHeroLeave,
}) {
  const isAlly = team === 'ally'
  const filled = !!hero
  const [dragOver, setDragOver] = useState(false)

  // Full-body art is portrait-oriented. Keep its natural aspect ratio and
  // anchor it to the team edge instead of stretching it across a wide lane.
  const imageEdge = isAlly ? 'left-0' : 'right-0'

  // Subtle fade where the row meets the central HeroPool, so the image doesn't
  // clip with a hard edge.
  const maskImage = `linear-gradient(${isAlly ? 'to right' : 'to left'}, black 0%, black 80%, transparent 100%)`

  // Info strip mirrors the team side: ally aligned to the left (screen) edge,
  // enemy to the right.
  const stripAlign = isAlly ? 'justify-start text-left' : 'justify-end text-right'
  const ringBase = dragOver
    ? 'ring-2 ring-inset ring-emerald-400'
    : 'hover:bg-slate-800/20'
  const pulseClass = selecting && !filled && !dragOver ? 'slot-selecting' : ''

  const handleClick = () => {
    if (filled) onClear?.()
    else onSelect?.()
  }

  const handlers = {
    onClick: handleClick,
    onMouseEnter: filled ? (e) => onHeroEnter?.(hero.id, e.currentTarget) : undefined,
    onMouseLeave: filled ? () => onHeroLeave?.() : undefined,
    onDragOver: (e) => {
      if (!onDropHero) return
      if (![...e.dataTransfer.types].some((t) => t === DRAG_MIME || t === 'text/plain')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!dragOver) setDragOver(true)
    },
    onDragLeave: () => dragOver && setDragOver(false),
    onDrop: (e) => {
      e.preventDefault()
      setDragOver(false)
      if (!onDropHero) return
      const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
      const id = Number.parseInt(raw, 10)
      if (Number.isFinite(id)) onDropHero(id)
    },
  }

  const ariaLabel = filled
    ? `${hero.name} — click to remove`
    : `Pick slot · Player ${slotIndex + 1}`

  return (
    <button
      type="button"
      {...handlers}
      data-draft-slot="true"
      data-draft-team={team}
      data-draft-kind="picks"
      data-draft-index={slotIndex}
      aria-label={ariaLabel}
      className={`relative block h-[84px] w-full cursor-pointer overflow-hidden sm:h-[92px] lg:h-[112px] ${pulseClass} ${ringBase} transition`}
    >
      <div className="absolute inset-0 overflow-hidden">
        {/* Double-height art is clipped by the row so only the top half shows. */}
        {filled ? (
          <img
            src={api.portraitFullUrl(hero.id)}
            alt=""
            draggable={false}
            style={{
              WebkitMaskImage: maskImage,
              maskImage,
            }}
            className={`absolute top-0 ${imageEdge} h-[200%] w-auto max-w-none object-contain`}
          />
        ) : (
          <div className={`flex h-full items-center ${isAlly ? 'justify-start pl-4' : 'justify-end pr-4'} text-2xl text-slate-700`}>
            +
          </div>
        )}

        {/* Bottom info strip — translucent black bar pinned to the bottom of
            the portrait pane, content hugs the screen-edge side. */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-6 items-center bg-black/50 px-1.5 sm:px-2 lg:h-7 ${stripAlign}`}>
          {filled ? (
            <div className="flex min-w-0 items-center gap-1.5">
              {stats?.rank != null && (
                <span className={`flex-none text-[11px] font-semibold tabular-nums ${rankTextTone(stats.rank, rankTotal)}`}>
                  #{stats.rank}
                </span>
              )}
              <span className="min-w-0 truncate text-xs font-semibold text-slate-100 lg:text-sm">{hero.name}</span>
              <span className="flex flex-none items-center gap-1 text-[10px] tabular-nums text-slate-200 lg:text-[11px]">
                <WrDot wr={stats?.win_rate} size="xs" />
                {stats?.win_rate != null && <span>{Math.round(stats.win_rate * 100)}%</span>}
              </span>
            </div>
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300">
              Player {slotIndex + 1}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
