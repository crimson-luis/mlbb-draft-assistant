import { useState } from 'react'
import { api } from '../api'
import { rankTextTone, WrDot } from './HeroOverlay'

const DRAG_MIME = 'application/x-mlbb-hero'

// Wide pick row. Spans the full pick-column width; the hero portrait extends
// from the screen edge toward the center of the viewport, fading to transparent
// via a CSS mask (opacity of the rendered image stays at 1 — only the mask
// fades). The Player label sits at the screen edge (outer side), with
// rank / name / WR% surfacing when a hero is placed.
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

  // Ally sits at the left edge → portrait opaque on left, transparent on right
  // (fades toward center). Enemy mirrors.
  const maskImage = `linear-gradient(${isAlly ? 'to right' : 'to left'}, black 0%, black 35%, transparent 95%)`
  const rowDir = isAlly ? 'flex-row' : 'flex-row-reverse'
  const labelAlign = isAlly ? 'items-start text-left' : 'items-end text-right'
  // Outer edge: 0 padding (text hugs screen edge). Inner edge: 8px breathing
  // room before the portrait fade begins.
  const labelPad = isAlly ? 'pl-1 pr-2' : 'pr-1 pl-2'
  const objectPos = isAlly ? 'left center' : 'right center'

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
      className={`relative flex ${rowDir} h-[112px] w-full cursor-pointer items-stretch overflow-hidden ${pulseClass} ${ringBase} transition`}
    >
      {/* Label column, anchored to the screen edge. Stays above the portrait
          via z-10 so the mask fade never eats into the text. */}
      <div className={`relative z-10 flex w-[140px] flex-none flex-col justify-center gap-0.5 ${labelAlign} ${labelPad}`}>
        {filled ? (
          <>
            <div className={`flex w-full items-center gap-1.5 ${isAlly ? '' : 'flex-row-reverse'}`}>
              {stats?.rank != null && (
                <span className={`flex-none text-[11px] font-semibold tabular-nums ${rankTextTone(stats.rank, rankTotal)}`}>
                  #{stats.rank}
                </span>
              )}
              <span className="min-w-0 truncate text-sm font-semibold text-slate-100">{hero.name}</span>
            </div>
            <div className={`flex w-full items-center gap-1 text-[10px] text-slate-400 ${isAlly ? '' : 'flex-row-reverse'}`}>
              <WrDot wr={stats?.win_rate} size="xs" />
              {stats?.win_rate != null && (
                <span className="tabular-nums">{Math.round(stats.win_rate * 100)}%</span>
              )}
            </div>
          </>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Player {slotIndex + 1}
          </span>
        )}
      </div>

      {/* Portrait area — flex-1 fills the rest of the pick column width. The
          <img> uses mask-image to fade its inner edge; opacity stays at 1. */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {filled ? (
          <img
            src={api.portraitUrl(hero.id)}
            alt=""
            draggable={false}
            style={{
              WebkitMaskImage: maskImage,
              maskImage,
              objectPosition: objectPos,
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className={`flex h-full items-center ${isAlly ? 'justify-start pl-4' : 'justify-end pr-4'} text-2xl text-slate-700`}>
            +
          </div>
        )}
      </div>
    </button>
  )
}
