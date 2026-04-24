import HeroSlot from './HeroSlot'
import { PICK_SLOTS } from '../hooks/useDraftState'

const TEAM_META = {
  ally:  { label: 'Blue team', accent: 'border-sky-900/60 bg-sky-950/20',   title: 'text-sky-200' },
  enemy: { label: 'Red team',  accent: 'border-rose-900/60 bg-rose-950/20', title: 'text-rose-200' },
}

// Vertical 5-slot pick column, in-game style. Blue team renders on the left
// with "Player N" labels to the left of each slot; Red team mirrors on the
// right. Slots are stacked tight (no gap) to match the in-game draft layout.
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
  const isEnemy = team === 'enemy'
  const rowClass = isEnemy
    ? 'flex flex-row-reverse items-center gap-1.5'
    : 'flex flex-row items-center gap-1.5'
  const labelClass = isEnemy ? 'text-right' : 'text-left'

  return (
    <section className={`flex flex-col gap-2 rounded-lg border ${meta.accent} p-2`}>
      <h2 className={`text-[10px] font-semibold uppercase tracking-widest ${meta.title} ${isEnemy ? 'text-right' : 'text-left'}`}>
        {meta.label}
      </h2>
      <div className="flex flex-col">
        {Array.from({ length: PICK_SLOTS }).map((_, i) => {
          const id = state[team].picks[i] ?? null
          const hero = id != null ? heroesById[id] : null
          return (
            <div key={`${team}-pick-${i}`} className={rowClass}>
              <span className={`hidden shrink-0 text-[9px] font-medium uppercase tracking-wider text-slate-500 sm:block sm:w-16 md:w-20 ${labelClass}`}>
                Player {i + 1}
              </span>
              <div className="w-14 sm:w-16 md:w-20 lg:w-24">
                <HeroSlot
                  hero={hero}
                  kind="picks"
                  selecting={selectingSlot(team, 'picks', i)}
                  onSelect={() => actions.selectSlot(team, 'picks', i)}
                  onClear={() => actions.clearSlot(team, 'picks', i)}
                  onDropHero={(heroId) => actions.fillAt(team, 'picks', i, heroId)}
                  onHeroEnter={onHeroEnter}
                  onHeroLeave={onHeroLeave}
                  stats={hero ? leaderboardStats?.[hero.id] : null}
                  rankTotal={rankTotal}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
