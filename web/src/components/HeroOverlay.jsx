// Tone helpers for rank position and win rate, plus a tiny WR dot component
// used as an inline badge next to hero names. The file is kept as HeroOverlay
// so existing imports don't churn — the rank badge / WR bar overlay it used to
// render was removed because the same info is now shown inline with the name.

export function rankTextTone(rank, total) {
  if (!rank || !total) return 'text-slate-500'
  const top = Math.max(1, Math.round(total * 0.1))
  if (rank <= top) return 'text-amber-300'
  const upper = Math.max(1, Math.round(total * 0.25))
  if (rank <= upper) return 'text-sky-300'
  return 'text-slate-400'
}

export function wrTextTone(wr) {
  if (wr == null) return 'text-slate-400'
  if (wr >= 0.52) return 'text-emerald-300'
  if (wr >= 0.48) return 'text-amber-300'
  return 'text-rose-300'
}

function wrDotBg(wr) {
  if (wr == null) return 'bg-slate-500'
  if (wr >= 0.52) return 'bg-emerald-400'
  if (wr >= 0.48) return 'bg-amber-400'
  return 'bg-rose-400'
}

export function WrDot({ wr, size = 'sm', className = '' }) {
  if (wr == null) return null
  const sz = size === 'xs' ? 'h-1.5 w-1.5' : 'h-2 w-2'
  return (
    <span
      title={`WR ${(wr * 100).toFixed(1)}%`}
      aria-label={`win rate ${(wr * 100).toFixed(1)}%`}
      className={`inline-block rounded-full ${sz} ${wrDotBg(wr)} ${className}`}
    />
  )
}

// Backwards-compatible default export — renders nothing now that all info is
// shown inline with the name. Remove once all callers drop their <HeroOverlay/>.
export default function HeroOverlay() {
  return null
}
