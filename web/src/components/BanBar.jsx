import HeroSlot from './HeroSlot'

// Top-of-page ban bar: ally bans (left) + enemy bans (right), mirroring the
// in-game draft layout. The count per side is controlled from the header.
// Visual team cue lives in the slot's ring color — there is no text label.
const TEAM_STYLES = {
  ally:  { ringTone: 'ring-sky-500/30',  justify: 'justify-start' },
  enemy: { ringTone: 'ring-rose-500/30', justify: 'justify-end' },
}

function BanGroup({ team, state, heroesById, selectingSlot, actions, banCount, onHeroEnter, onHeroLeave, leaderboardStats, rankTotal }) {
  const meta = TEAM_STYLES[team]
  const count = Math.max(0, Math.min(5, banCount))
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-1 ${meta.justify}`}>
      {Array.from({ length: count }).map((_, i) => {
        const id = state[team].bans[i] ?? null
        const hero = id != null ? heroesById[id] : null
        return (
          <div key={`${team}-ban-${i}`} className={`h-[52px] w-[52px] rounded-full ring-1 ${meta.ringTone}`}>
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
    <section className="flex h-14 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/40 px-3">
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
