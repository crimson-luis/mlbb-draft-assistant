import { useCallback, useMemo, useReducer } from 'react'

export const PICK_SLOTS = 5
export const BAN_SLOTS = 5
export const REQUIRED_BANS = 3 // slots beyond this are optional (3-5 bans per MLBB rules)
export const TEAMS = ['enemy', 'ally']
export const KINDS = ['picks', 'bans']

function emptyTeam() {
  return { picks: Array(PICK_SLOTS).fill(null), bans: Array(BAN_SLOTS).fill(null) }
}

const initial = {
  enemy: emptyTeam(),
  ally: emptyTeam(),
  selecting: null, // { team, kind, index } | null
}

function sameSlot(a, b) {
  return a && b && a.team === b.team && a.kind === b.kind && a.index === b.index
}

function reducer(state, action) {
  switch (action.type) {
    case 'SELECT_SLOT': {
      const next = { team: action.team, kind: action.kind, index: action.index }
      return { ...state, selecting: sameSlot(state.selecting, next) ? null : next }
    }
    case 'FILL_SLOT': {
      if (!state.selecting) return state
      const { team, kind, index } = state.selecting
      const slots = state[team][kind].slice()
      slots[index] = action.heroId
      return { ...state, [team]: { ...state[team], [kind]: slots }, selecting: null }
    }
    case 'FILL_AT': {
      // Direct fill (drag-drop). Clears any existing occurrence of this hero
      // so dragging a placed hero to a new slot moves them rather than duplicating.
      const { team, kind, index, heroId } = action
      if (heroId == null) return state
      const next = {
        enemy: { picks: state.enemy.picks.slice(), bans: state.enemy.bans.slice() },
        ally:  { picks: state.ally.picks.slice(),  bans: state.ally.bans.slice()  },
      }
      for (const t of TEAMS) for (const k of KINDS) {
        const arr = next[t][k]
        for (let i = 0; i < arr.length; i++) if (arr[i] === heroId) arr[i] = null
      }
      next[team][kind][index] = heroId
      return { ...state, ...next, selecting: null }
    }
    case 'CLEAR_SLOT': {
      const { team, kind, index } = action
      const slots = state[team][kind].slice()
      slots[index] = null
      return { ...state, [team]: { ...state[team], [kind]: slots } }
    }
    case 'CLEAR_SELECTION':
      return state.selecting ? { ...state, selecting: null } : state
    case 'RESET':
      return initial
    case 'REPLACE': // v2 seam: external capture can push whole state
      return action.state ?? state
    default:
      return state
  }
}

export function useDraftState() {
  const [state, dispatch] = useReducer(reducer, initial)

  const usedIds = useMemo(() => {
    const s = new Set()
    for (const team of TEAMS) {
      for (const kind of KINDS) {
        for (const id of state[team][kind]) if (id != null) s.add(id)
      }
    }
    return s
  }, [state])

  const recommendPayload = useMemo(
    () => ({
      enemy_picks: state.enemy.picks.filter((x) => x != null),
      ally_picks: state.ally.picks.filter((x) => x != null),
      bans: [...state.enemy.bans, ...state.ally.bans].filter((x) => x != null),
    }),
    [state],
  )

  const actions = useMemo(
    () => ({
      selectSlot: (team, kind, index) => dispatch({ type: 'SELECT_SLOT', team, kind, index }),
      fillSlot: (heroId) => dispatch({ type: 'FILL_SLOT', heroId }),
      fillAt: (team, kind, index, heroId) => dispatch({ type: 'FILL_AT', team, kind, index, heroId }),
      clearSlot: (team, kind, index) => dispatch({ type: 'CLEAR_SLOT', team, kind, index }),
      clearSelection: () => dispatch({ type: 'CLEAR_SELECTION' }),
      reset: () => dispatch({ type: 'RESET' }),
      replace: (s) => dispatch({ type: 'REPLACE', state: s }),
    }),
    [],
  )

  const selectingSlot = useCallback(
    (team, kind, index) => sameSlot(state.selecting, { team, kind, index }),
    [state.selecting],
  )

  return { state, actions, usedIds, recommendPayload, selectingSlot }
}
