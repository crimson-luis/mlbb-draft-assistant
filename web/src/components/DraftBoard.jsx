import HeroSlot from './HeroSlot'
import { PICK_SLOTS, BAN_SLOTS, REQUIRED_BANS } from '../hooks/useDraftState'

const TEAM_META = {
  enemy: { label: 'Enemy', accent: 'border-rose-900 bg-rose-950/20' },
  ally:  { label: 'Your team', accent: 'border-sky-900 bg-sky-950/20' },
}

function SlotRow({ team, kind, ids, heroesById, selectingSlot, actions, count, optionalFrom, onHeroEnter, onHeroLeave }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => {
        const id = ids[i] ?? null
        const hero = id != null ? heroesById[id] : null
        return (
          <HeroSlot
            key={`${team}-${kind}-${i}`}
            hero={hero}
            kind={kind}
            optional={optionalFrom != null && i >= optionalFrom}
            selecting={selectingSlot(team, kind, i)}
            onSelect={() => actions.selectSlot(team, kind, i)}
            onClear={() => actions.clearSlot(team, kind, i)}
            onDropHero={(heroId) => actions.fillAt(team, kind, i, heroId)}
            onHeroEnter={onHeroEnter}
            onHeroLeave={onHeroLeave}
          />
        )
      })}
    </div>
  )
}

export default function DraftBoard({ team, state, heroesById, actions, selectingSlot, onHeroEnter, onHeroLeave }) {
  const meta = TEAM_META[team]
  return (
    <section className={`flex flex-col gap-4 rounded-lg border ${meta.accent} p-3`}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">{meta.label}</h2>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Picks</div>
        <SlotRow
          team={team}
          kind="picks"
          ids={state[team].picks}
          count={PICK_SLOTS}
          heroesById={heroesById}
          selectingSlot={selectingSlot}
          actions={actions}
          onHeroEnter={onHeroEnter}
          onHeroLeave={onHeroLeave}
        />
      </div>

      <div>
        <div className="mb-1 flex items-baseline gap-2 text-[10px] uppercase tracking-widest text-slate-500">
          <span>Bans</span>
          <span className="text-[9px] normal-case tracking-normal text-slate-600">
            {REQUIRED_BANS} required · up to {BAN_SLOTS}
          </span>
        </div>
        <SlotRow
          team={team}
          kind="bans"
          ids={state[team].bans}
          count={BAN_SLOTS}
          optionalFrom={REQUIRED_BANS}
          heroesById={heroesById}
          selectingSlot={selectingSlot}
          actions={actions}
          onHeroEnter={onHeroEnter}
          onHeroLeave={onHeroLeave}
        />
      </div>
    </section>
  )
}
