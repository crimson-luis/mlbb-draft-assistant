import PickRow from './PickRow'
import { PICK_SLOTS } from '../hooks/useDraftState'

const TEAM_META = {
  ally:  { label: 'Blue team', title: 'text-sky-300' },
  enemy: { label: 'Red team',  title: 'text-rose-300' },
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
}) {
  const meta = TEAM_META[team]
  const isAlly = team === 'ally'
  const headerEdge = isAlly ? 'justify-start' : 'justify-start lg:justify-end'
  const sectionOrder = isAlly ? 'order-1 lg:order-none' : 'order-2 lg:order-none'

  return (
    <section className={`flex min-h-0 flex-col px-2 lg:self-start lg:px-3 ${sectionOrder}`}>
      <h2 className={`flex h-6 items-center text-[10px] font-semibold uppercase tracking-widest ${meta.title} ${headerEdge}`}>
        {meta.label}
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
