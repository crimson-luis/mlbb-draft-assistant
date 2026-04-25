import { useRef } from 'react'
import { api } from '../api'
import { rankTextTone, WrDot } from './HeroOverlay'

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

// Prioritize the most-impactful reasons first: positives (counters, synergy,
// fills_role) outweigh negatives (countered_by). Within each side, higher
// |points| comes first. Used to pick the 2 pills that fit on a compact card.
function rankReasons(reasons) {
  return [...reasons].sort((a, b) => Math.abs(b.points || 0) - Math.abs(a.points || 0))
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
      className={`inline-flex max-w-full cursor-help items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${tone}`}
    >
      <span className="truncate">{label}</span>
      <span className="flex-none opacity-70">{sign}{reason.points}</span>
    </span>
  )
}

function RecommendationCard({ rec, heroesById, onHeroEnter, onHeroLeave, stats, rankTotal }) {
  const scoreColor =
    rec.score > 4 ? 'text-emerald-300' :
    rec.score > 0 ? 'text-sky-300' :
    rec.score === 0 ? 'text-slate-400' : 'text-rose-300'

  const ref = useRef(null)
  const topReasons = rankReasons(rec.reasons).slice(0, 2)

  return (
    <div
      ref={ref}
      onMouseEnter={() => onHeroEnter?.(rec.hero_id, ref.current)}
      onMouseLeave={() => onHeroLeave?.()}
      className="flex h-[96px] w-[220px] flex-none snap-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2 transition hover:border-slate-600"
    >
      <div className="relative h-[80px] w-[80px] flex-none overflow-hidden rounded-md bg-slate-800 ring-1 ring-slate-700">
        <img
          src={api.portraitUrl(rec.hero_id)}
          alt={rec.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {stats?.rank ? (
            <span className={`flex-none tabular-nums text-[10px] ${rankTextTone(stats.rank, rankTotal)}`}>#{stats.rank}</span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{rec.name}</span>
          <WrDot wr={stats?.win_rate} className="flex-none" />
          <span className={`flex-none text-base font-bold tabular-nums ${scoreColor}`}>
            {rec.score > 0 ? '+' : ''}{rec.score}
          </span>
        </div>
        <span className="text-[9px] uppercase tracking-widest text-slate-500">{rec.role}</span>
        <div className="mt-auto flex min-w-0 flex-col gap-0.5">
          {topReasons.length === 0 ? (
            <span className="text-[10px] text-slate-500">No specific counter/synergy data.</span>
          ) : (
            topReasons.map((r, i) => (
              <ReasonPill key={i} reason={r} tip={findTip(rec, r, heroesById)} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function Recommendations({ recommendations, heroesById, loading, error, hasInput, filterToOwnedActive, onHeroEnter, onHeroLeave, leaderboardStats, rankTotal }) {
  return (
    <section className="flex min-h-0 flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
      <header className="flex h-4 items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Recommendations</h2>
        {filterToOwnedActive && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
            filtered to my pool
          </span>
        )}
        {loading && <span className="text-[10px] text-slate-500">scoring…</span>}
        {!hasInput && !loading && !error && (
          <span className="ml-2 text-[10px] text-slate-500">Pick someone to see suggestions.</span>
        )}
        {hasInput && !error && recommendations.length === 0 && !loading && (
          <span className="ml-2 text-[10px] text-slate-500">
            No recommendations.{filterToOwnedActive ? ' Disable the pool filter or add more heroes.' : ''}
          </span>
        )}
        {error && (
          <span className="ml-2 truncate text-[10px] text-rose-300" title={error}>Error: {error}</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 snap-x gap-2 overflow-x-auto overflow-y-hidden pr-2">
        {recommendations.map((rec) => (
          <RecommendationCard
            key={rec.hero_id}
            rec={rec}
            heroesById={heroesById}
            onHeroEnter={onHeroEnter}
            onHeroLeave={onHeroLeave}
            stats={leaderboardStats?.[rec.hero_id]}
            rankTotal={rankTotal}
          />
        ))}
      </div>
    </section>
  )
}
