import { useRef } from 'react'
import { api } from '../api'

const REASON_LABELS = {
  counters: (r) => `Counters ${r.target_name}`,
  countered_by: (r) => `Countered by ${r.target_name}`,
  synergy: (r) => `Synergy with ${r.target_name}`,
  fills_role: (r) => `Fills ${r.target_name} slot`,
}

const REASON_TONE = {
  counters: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  countered_by: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  synergy: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  fills_role: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

// The MLBB API only provides *one* tip per hero per direction. After folding
// the graph bidirectionally, a reason edge may have its original tip stored on
// either end — check both.
function findTip(rec, reason, heroesById) {
  const recHero = heroesById?.[rec.hero_id]
  if (!recHero) return null
  const ce = recHero.counter_edges || {}
  const target = reason.target_id != null ? heroesById?.[reason.target_id] : null
  const tce = target?.counter_edges || {}

  switch (reason.type) {
    case 'counters':
      return ce.counters?.id === reason.target_id ? ce.counters.tips
           : tce.countered_by?.id === rec.hero_id ? tce.countered_by.tips
           : null
    case 'countered_by':
      return ce.countered_by?.id === reason.target_id ? ce.countered_by.tips
           : tce.counters?.id === rec.hero_id ? tce.counters.tips
           : null
    case 'synergy':
      return ce.best_with?.id === reason.target_id ? ce.best_with.tips
           : tce.best_with?.id === rec.hero_id ? tce.best_with.tips
           : null
    case 'fills_role':
      return `Your team has no ${reason.target_name} yet — this hero rounds out the composition.`
    default:
      return null
  }
}

function ReasonPill({ reason, tip }) {
  const label = (REASON_LABELS[reason.type] ?? (() => reason.type))(reason)
  const tone = REASON_TONE[reason.type] ?? 'bg-slate-500/15 text-slate-300 ring-slate-500/30'
  const sign = reason.points > 0 ? '+' : ''
  const title = tip ? `${label}\n\n${tip}` : label
  return (
    <span
      title={title}
      className={`inline-flex cursor-help items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tone}`}
    >
      <span>{label}</span>
      <span className="opacity-70">{sign}{reason.points}</span>
    </span>
  )
}

function RecommendationCard({ rec, heroesById, onHeroEnter, onHeroLeave }) {
  const scoreColor =
    rec.score > 4 ? 'text-emerald-300' :
    rec.score > 0 ? 'text-sky-300' :
    rec.score === 0 ? 'text-slate-400' : 'text-rose-300'

  const ref = useRef(null)

  return (
    <div
      ref={ref}
      onMouseEnter={() => onHeroEnter?.(rec.hero_id, ref.current)}
      onMouseLeave={() => onHeroLeave?.()}
      className="flex gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition hover:border-slate-600"
    >
      <div className="h-16 w-16 flex-none overflow-hidden rounded-md bg-slate-800 ring-1 ring-slate-700">
        <img
          src={api.portraitUrl(rec.hero_id)}
          alt={rec.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold text-slate-100">{rec.name}</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-500">{rec.role}</span>
          <span className={`ml-auto text-lg font-bold tabular-nums ${scoreColor}`}>
            {rec.score > 0 ? '+' : ''}{rec.score}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {rec.reasons.length === 0
            ? <span className="text-[11px] text-slate-500">No specific counter/synergy data — included as baseline.</span>
            : rec.reasons.map((r, i) => (
                <ReasonPill key={i} reason={r} tip={findTip(rec, r, heroesById)} />
              ))}
        </div>
      </div>
    </div>
  )
}

export default function Recommendations({ recommendations, heroesById, loading, error, hasInput, filterToOwnedActive, onHeroEnter, onHeroLeave }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Recommendations</h2>
        {filterToOwnedActive && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
            filtered to my pool
          </span>
        )}
        {loading && <span className="text-xs text-slate-500">scoring…</span>}
      </header>

      {error && (
        <div className="rounded border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-200">
          Could not fetch recommendations: {error}
        </div>
      )}

      {!hasInput && !error && (
        <p className="text-sm text-slate-500">
          Pick someone (friend or foe) to see suggestions.
        </p>
      )}

      {hasInput && !error && recommendations.length === 0 && !loading && (
        <p className="text-sm text-slate-500">
          No recommendations.{filterToOwnedActive ? ' Try disabling the "my pool" filter or adding more heroes to your pool.' : ''}
        </p>
      )}

      <div className="grid gap-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {recommendations.map((rec) => (
          <RecommendationCard
            key={rec.hero_id}
            rec={rec}
            heroesById={heroesById}
            onHeroEnter={onHeroEnter}
            onHeroLeave={onHeroLeave}
          />
        ))}
      </div>
    </section>
  )
}
