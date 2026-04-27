const POWER_META = {
  ally: { label: 'Blue', text: 'text-sky-300', ring: 'ring-sky-500/30' },
  enemy: { label: 'Red', text: 'text-rose-300', ring: 'ring-rose-500/30' },
}

const BREAKDOWN_HELP = {
  'Role Shape': 'Counts five draft jobs: frontline, damage core, control pressure, utility/peel, and engage/pickoff.',
  Frontline: 'Uses the two strongest durability/role bodies and adds a bonus when a durable hero also has hard engage.',
  'Damage Spread': 'Classifies picked heroes as offense, control, or mixed from role plus offense and control balance.',
  'Control Chain': 'Counts hard and soft control words from skill text, then rewards multiple heroes that can chain control.',
  'Draft Links': 'Counts known teammate synergy pairs from the cached MLBB relation graph.',
  Tempo: 'Infers early, mid, and late game identity from roles and control/carry presence.',
  'Meta Form': 'Combines average live win rate with average leaderboard rank percentile for the selected rank tier.',
}

function powerTone(score) {
  if (score == null) return 'bg-slate-800/80 text-slate-400 ring-slate-700'
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
  if (score >= 55) return 'bg-sky-500/15 text-sky-300 ring-sky-500/30'
  if (score >= 40) return 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
  return 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
}

function scoreText(power) {
  return power?.score == null ? '--' : String(power.score)
}

function formatPercent(value, precision = 0) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `${(value * 100).toFixed(precision)}%`
}

function formatRank(value) {
  if (value == null || !Number.isFinite(value)) return '--'
  return `#${value.toFixed(value % 1 === 0 ? 0 : 1)}`
}

function leaderboardIssue(leaderboardStatus) {
  if (!leaderboardStatus) return ''
  if (leaderboardStatus.statsAvailable === false) {
    return ` Live leaderboard unavailable${leaderboardStatus.error ? `: ${leaderboardStatus.error}` : '.'}`
  }
  if (leaderboardStatus.stale) {
    return ` Using stale leaderboard data because the latest refresh failed${leaderboardStatus.error ? `: ${leaderboardStatus.error}` : '.'}`
  }
  return ''
}

function metricItems(power, leaderboardStatus) {
  const m = power?.metrics ?? {}
  const pickCount = m.pickCount ?? 0
  const statCount = m.statsCount ?? 0
  const winRateCount = m.winRateCount ?? statCount
  const rankCount = m.rankCount ?? 0
  const issue = leaderboardIssue(leaderboardStatus)
  return [
    {
      label: 'Offense',
      value: formatPercent(m.physicalPct),
      title: `Offense proportion = sum of picked heroes' offense divided by offense + control total. Raw offense power: ${m.physicalPower ?? 0}. Picks counted: ${pickCount}.`,
    },
    {
      label: 'Control',
      value: formatPercent(m.magicPct),
      title: `Control proportion = sum of picked heroes' control divided by offense + control total. Raw control power: ${m.magicPower ?? 0}. Picks counted: ${pickCount}.`,
    },
    {
      label: 'Avg. WR',
      value: formatPercent(m.avgWinRate, 1),
      title: m.avgWinRate == null
        ? `Average win rate needs live win-rate data for picked heroes. Heroes with WR data: ${winRateCount}/${pickCount}.${issue}`
        : `Average win rate = arithmetic mean of live win rates for picked heroes. Heroes with WR data: ${winRateCount}/${pickCount}.${issue}`,
    },
    {
      label: 'Avg. Rank',
      value: formatRank(m.avgRank),
      title: m.avgRank == null
        ? `Rank mean requires live leaderboard rank positions. Lower is better. Heroes with rank data: ${rankCount}/${pickCount}.${issue}`
        : `Rank mean = arithmetic mean of live leaderboard rank positions for picked heroes. Lower is better. Heroes with rank data: ${rankCount}/${pickCount}.${issue}`,
    },
  ]
}

function MetricPill({ item }) {
  return (
    <span
      title={item.title}
      className="inline-flex min-w-0 items-center justify-center gap-1 overflow-hidden rounded bg-slate-900/70 px-1 py-0.5 text-[9px] ring-1 ring-inset ring-slate-800"
    >
      <span className="min-w-0 truncate text-slate-500">{item.label}</span>
      <span className="truncate font-semibold tabular-nums text-slate-200">{item.value}</span>
    </span>
  )
}

function TeamPowerCard({ team, power, leaderboardStatus }) {
  const meta = POWER_META[team]
  return (
    <div className={`min-w-0 overflow-hidden rounded bg-slate-950/40 px-2 py-1 ring-1 ring-inset ${meta.ring}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider ${meta.text}`}>{meta.label}</span>
        <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ring-1 ring-inset ${powerTone(power?.score)}`}>
          {scoreText(power)}
        </span>
      </div>
      <div className="mt-0.5 truncate text-center text-[10px] text-slate-400" title={power?.summary}>
        {power?.summary ?? 'Pick heroes to evaluate draft power.'}
      </div>
      <div className="mt-1 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-1">
        {metricItems(power, leaderboardStatus).map((item) => (
          <MetricPill key={item.label} item={item} />
        ))}
      </div>
    </div>
  )
}

function BreakdownValue({ row, team }) {
  const meta = POWER_META[team]
  const value = row ? `${row.points}` : '--'
  return (
    <span className={`text-right text-[10px] font-semibold tabular-nums ${meta.text}`}>
      {value}
    </span>
  )
}

export default function DraftPower({ draftPowers, leaderboardStatus }) {
  const ally = draftPowers?.ally
  const enemy = draftPowers?.enemy
  const rows = ally?.breakdown?.length ? ally.breakdown : enemy?.breakdown ?? []

  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40 p-2">
      <header className="flex h-4 min-w-0 items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Draft Power</h2>
      </header>

      <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-1.5">
        <TeamPowerCard team="ally" power={ally} leaderboardStatus={leaderboardStatus} />
        <TeamPowerCard team="enemy" power={enemy} leaderboardStatus={leaderboardStatus} />
      </div>

      <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pr-1">
        {rows.map((row, i) => {
          const allyRow = ally?.breakdown?.[i]
          const enemyRow = enemy?.breakdown?.[i]
          const help = BREAKDOWN_HELP[row.label] ?? 'Draft Power factor.'
          const title = [
            help,
            `Blue: ${allyRow?.points ?? 0}/${row.max} - ${allyRow?.detail ?? 'No picks yet'}`,
            `Red: ${enemyRow?.points ?? 0}/${row.max} - ${enemyRow?.detail ?? 'No picks yet'}`,
          ].join('\n')
          return (
            <div
              key={row.label}
              title={title}
              className="grid min-w-0 grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2 border-t border-slate-800/80 py-0.5"
            >
              <BreakdownValue row={allyRow} team="ally" />
              <span className="min-w-0 truncate text-center text-[10px] text-slate-400">
                {row.label} <span className="text-slate-600">/{row.max}</span>
              </span>
              <BreakdownValue row={enemyRow} team="enemy" />
            </div>
          )
        })}
      </div>
    </section>
  )
}
