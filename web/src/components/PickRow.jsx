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

  // Full-body art is portrait-oriented; anchor the top of the image so faces
  // stay visible in the 112px row. Horizontally we keep the hero on their team
  // side so they don't drift toward the HeroPool.
  const objectPos = isAlly ? 'left top' : 'right top'

  // Subtle fade where the row meets the central HeroPool, so the image doesn't
  // clip with a hard edge.
  const maskImage = `linear-gradient(${isAlly ? 'to right' : 'to left'}, black 0%, black 80%, transparent 100%)`

  // Info strip mirrors the team side: ally aligned to the left (screen) edge,
  // enemy to the right.
  const stripAlign = isAlly ? 'justify-start text-left' : 'justify-end text-right'
  const stripFlow = isAlly ? '' : 'flex-row-reverse'

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
      aria-label={ariaLabel}
      className={`relative block h-[112px] w-full cursor-pointer overflow-hidden ${pulseClass} ${ringBase} transition`}
    >
      <div className="absolute inset-0 overflow-hidden">
        {/* Portrait fills the pane; mask fades its inner edge toward HeroPool. */}
        {filled ? (
          <img
            src={api.portraitFullUrl(hero.id)}
            alt=""
            draggable={false}
            style={{
              objectPosition: objectPos,
              WebkitMaskImage: maskImage,
              maskImage,
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className={`flex h-full items-center ${isAlly ? 'justify-start pl-4' : 'justify-end pr-4'} text-2xl text-slate-700`}>
            +
          </div>
        )}

        {/* Bottom info strip — translucent black bar pinned to the bottom of
            the portrait pane, content hugs the screen-edge side. */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-7 items-center bg-black/50 px-2 ${stripAlign}`}>
          {filled ? (
            <div className={`flex min-w-0 items-center gap-1.5 ${stripFlow}`}>
              {stats?.rank != null && (
                <span className={`flex-none text-[11px] font-semibold tabular-nums ${rankTextTone(stats.rank, rankTotal)}`}>
                  #{stats.rank}
                </span>
              )}
              <span className="min-w-0 truncate text-sm font-semibold text-slate-100">{hero.name}</span>
              <span className={`flex flex-none items-center gap-1 text-[11px] tabular-nums text-slate-200 ${stripFlow}`}>
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
