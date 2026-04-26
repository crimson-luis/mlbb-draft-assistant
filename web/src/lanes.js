// Lane → roles mapping. A lane in MLBB is the position on the map; the role
// is the hero class. Selecting a lane filters to the roles typically played
// in that lane (e.g. Gold → Marksman).
export const LANE_ROLES = {
  any: null,
  exp: ['Fighter'],
  gold: ['Marksman'],
  mid: ['Mage'],
  roam: ['Tank', 'Support'],
  jungle: ['Assassin'],
}

// Display order for lane filter chips. Distinct from object key order so we
// never depend on JS engine iteration order for UI layout.
export const LANE_ORDER = ['any', 'exp', 'gold', 'mid', 'roam', 'jungle']

export const LANE_LABELS = {
  any: 'All Lanes',
  exp: 'Exp Lane',
  gold: 'Gold Lane',
  mid: 'Mid Lane',
  roam: 'Roam',
  jungle: 'Jungle',
}

export const LANES = LANE_ORDER
