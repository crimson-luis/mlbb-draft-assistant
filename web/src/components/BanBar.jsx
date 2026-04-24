import HeroSlot from './HeroSlot'

// Top-of-page ban bar: ally bans (left) + enemy bans (right), mirroring the
// in-game draft layout. The count per side is controlled from the header.
const TEAM_STYLES = {
  ally: { label: 'Blue bans', accent: 'text-sky-200', justify: 'justify-start' },
  enemy: { label: 'Red bans', accent: 'text-rose-200', justify: 'justify-end', textAlign: 'text-right' },
}

function BanGroup({ team, state, heroesById, selectingSlot, actions, banCount, onHeroEnter, onHeroLeave, leaderboardStats, rankTotal }) {
  const meta = TEAM_STYLES[team]
  const count = Math.max(0, Math.min(5, banCount))
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className={`flex items-baseline gap-2 text-[10px] uppercase tracking-widest ${meta.accent} ${meta.textAlign ?? ''} ${team === 'enemy' ? 'justify-end' : ''}`}>
        <span>{meta.label}</span>
        <span className="text-[9px] normal-case tracking-normal text-slate-500">{count}</span>
      </div>
      <div className={`flex flex-wrap gap-1 ${meta.justify}`}>
        {Array.from({ length: count }).map((_, i) => {
          const id = state[team].bans[i] ?? null
          const hero = id != null ? heroesById[id] : null
          return (
            <div key={`${team}-ban-${i}`} className="w-10 sm:w-12 md:w-14">
              <HeroSlot
                hero={hero}
                kind="bans"
                selecting={selectingSlot(team, 'bans', i)}
                onSelect={() => actions.selectSlot(team, 'bans', i)}
                onClear={() => actions.clearSlot(team, 'bans', i)}
                onDropHero={(heroId) => actions.fillAt(team, 'bans', i, heroId)}
                onHeroEnter={onHeroEnter}
                onHeroLeave={onHeroLeave}
                stats={hero ? leaderboardStats?.[hero.id] : null}
                rankTotal={rankTotal}
                compact
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BanBar({
  state,
  heroesById,
  actions,
  selectingSlot,
  banCount,
  onHeroEnter,
  onHeroLeave,
  leaderboardStats,
  rankTotal,
}) {
  return (
    <section className="flex flex-wrap items-stretch gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <BanGroup
        team="ally"
        state={state}
        heroesById={heroesById}
        selectingSlot={selectingSlot}
        actions={actions}
        banCount={banCount}
        onHeroEnter={onHeroEnter}
        onHeroLeave={onHeroLeave}
        leaderboardStats={leaderboardStats}
        rankTotal={rankTotal}
      />
      <BanGroup
        team="enemy"
        state={state}
        heroesById={heroesById}
        selectingSlot={selectingSlot}
        actions={actions}
        banCount={banCount}
        onHeroEnter={onHeroEnter}
        onHeroLeave={onHeroLeave}
        leaderboardStats={leaderboardStats}
        rankTotal={rankTotal}
      />
    </section>
  )
}
