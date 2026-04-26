import PickRow from './PickRow'
import { PICK_SLOTS } from '../hooks/useDraftState'

const TEAM_META = {
  ally:  { label: 'Blue team', title: 'text-sky-300' },
  enemy: { label: 'Red team',  title: 'text-rose-300' },
}

function powerTone(score) {
  if (score == null) return 'bg-slate-800/80 text-slate-400 ring-slate-700'
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
  if (score >= 55) return 'bg-sky-500/15 text-sky-300 ring-sky-500/30'
  if (score >= 40) return 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
  return 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
}

function DraftPowerChip({ draftPower }) {
  const score = draftPower?.score
  const label = score == null ? '--' : String(score)
  const title = score == null
    ? 'Draft Power: pick heroes to evaluate this team.'
    : `Draft Power: ${score}/${draftPower.maxScore}\n${draftPower.summary}`

  return (
    <span
      title={title}
      className={`ml-1 inline-flex h-5 min-w-8 items-center justify-center rounded px-1.5 text-[10px] font-bold tracking-normal tabular-nums ring-1 ring-inset ${powerTone(score)}`}
    >
      {label}
    </span>
  )
}

// Wide pick column. The section has no outer padding/border so its content
// sits flush against the screen edge — PickRow handles internal layout, with
// the player label anchored at the screen edge and the portrait fading toward
// the center via a CSS mask.
export default function PickColumn({
  team,
  state,
  heroesById,
  actions,
  selectingSlot,
  onHeroEnter,
  onHeroLeave,
  leaderboardStats,
  rankTotal,
  draftPower,
}) {
  const meta = TEAM_META[team]
  const isAlly = team === 'ally'
  const headerEdge = isAlly ? 'justify-start' : 'justify-start lg:justify-end'
  const sectionOrder = isAlly ? 'order-1 lg:order-none' : 'order-2 lg:order-none'

  return (
    <section className={`flex min-h-0 flex-col px-2 lg:self-start lg:px-3 ${sectionOrder}`}>
      <h2 className={`flex h-6 items-center text-[10px] font-semibold uppercase tracking-widest ${meta.title} ${headerEdge}`}>
        <span>{meta.label}</span>
        <DraftPowerChip draftPower={draftPower} />
      </h2>
      <div className="grid grid-cols-5 gap-px overflow-hidden rounded border border-slate-800 bg-slate-950/40 lg:flex lg:flex-col lg:gap-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent">
        {Array.from({ length: PICK_SLOTS }).map((_, i) => {
          const id = state[team].picks[i] ?? null
          const hero = id != null ? heroesById[id] : null
          return (
            <PickRow
              key={`${team}-pick-${i}`}
              team={team}
              slotIndex={i}
              hero={hero}
              selecting={selectingSlot(team, 'picks', i)}
              onSelect={() => actions.selectSlot(team, 'picks', i)}
              onClear={() => actions.clearSlot(team, 'picks', i)}
              onDropHero={(heroId) => actions.fillAt(team, 'picks', i, heroId)}
              onHeroEnter={onHeroEnter}
              onHeroLeave={onHeroLeave}
              stats={hero ? leaderboardStats?.[hero.id] : null}
              rankTotal={rankTotal}
            />
          )
        })}
      </div>
    </section>
  )
}
