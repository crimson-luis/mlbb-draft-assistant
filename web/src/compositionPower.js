const MAX_SCORE = 100
const PICK_COUNT = 5

const BREAKDOWN_WEIGHTS = [
  ['Role Shape', 20],
  ['Frontline', 15],
  ['Damage Spread', 15],
  ['Control Chain', 15],
  ['Draft Links', 10],
  ['Tempo', 10],
  ['Meta Form', 15],
]

const HARD_CONTROL_RE = /\b(stun(?:ned)?|airborne|knock(?:ed)?|suppress(?:ed)?|taunt(?:ed)?|silence(?:d)?|immobili[sz](?:e|ed)|freeze|frozen|petrif(?:y|ied)|pull(?:ed)?|hook(?:ed)?)\b/g
const SOFT_CONTROL_RE = /\b(slow(?:ed)?|root(?:ed)?|restrain(?:ed)?|disarm(?:ed)?|terrifi(?:ed|es|y))\b/g
const UTILITY_RE = /\b(heal(?:s|ed|ing)?|shield(?:s|ed|ing)?|protect(?:s|ed|ing)?|guard(?:s|ed|ing)?|restore(?:s|d)?|immune|purify|cleanse|speed up)\b/
const ENGAGE_RE = /\b(initiat(?:e|es|ing|or)|charge(?:s|d)?|dash(?:es|ed)?|blink(?:s|ed)?|leap(?:s|ed)?|pull(?:s|ed)?|hook(?:s|ed)?|knock(?:s|ed)?|airborne|suppress(?:es|ed)?)\b/

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function asHero(id, heroesById) {
  return heroesById?.[id] ?? heroesById?.[String(id)] ?? null
}

function getSkillText(hero) {
  return (hero?.skills ?? [])
    .map((skill) => `${skill.name ?? ''} ${skill.description ?? ''} ${skill.tips ?? ''}`)
    .join(' ')
    .toLowerCase()
}

function countMatches(text, re) {
  return [...text.matchAll(re)].length
}

function heroControl(hero) {
  const text = getSkillText(hero)
  const hard = countMatches(text, HARD_CONTROL_RE)
  const soft = countMatches(text, SOFT_CONTROL_RE)
  return {
    hard,
    soft,
    value: clamp(hard * 0.35 + soft * 0.14, 0, 1),
  }
}

function hasUtility(hero) {
  return hero.role === 'Support' || UTILITY_RE.test(getSkillText(hero))
}

function hasEngage(hero) {
  const control = heroControl(hero)
  return (
    hero.role === 'Tank' ||
    hero.role === 'Assassin' ||
    control.hard > 0 ||
    ENGAGE_RE.test(getSkillText(hero))
  )
}

function roleCounts(heroes) {
  const counts = {}
  for (const hero of heroes) counts[hero.role] = (counts[hero.role] ?? 0) + 1
  return counts
}

function damageProfile(hero) {
  const stats = hero.stats ?? {}
  const physical = Number(stats.physical ?? 0)
  const magic = Number(stats.magic ?? 0)
  const role = hero.role

  if (role === 'Mage') return 'magic'
  if (role === 'Marksman') return 'physical'
  if (role === 'Support') return magic >= physical ? 'magic' : 'physical'
  if (role === 'Assassin') return magic >= physical + 20 ? 'magic' : 'physical'
  if (Math.min(physical, magic) >= 50 && Math.abs(physical - magic) <= 25) return 'mixed'
  if (magic >= physical + 20) return 'magic'
  if (physical >= magic + 20) return 'physical'
  return 'mixed'
}

function roleShape(heroes) {
  const anchors = [
    heroes.some((h) => h.role === 'Tank' || h.role === 'Fighter' || Number(h.stats?.durability ?? 0) >= 70),
    heroes.some((h) => h.role === 'Marksman' || h.role === 'Assassin' || Number(h.stats?.physical ?? 0) >= 60),
    heroes.some((h) => h.role === 'Mage' || damageProfile(h) === 'magic' || damageProfile(h) === 'mixed'),
    heroes.some((h) => h.role === 'Support' || hasUtility(h)),
    heroes.some(hasEngage),
  ]
  const found = anchors.filter(Boolean).length
  return {
    points: found * 4,
    detail: `${found}/5 draft jobs covered`,
  }
}

function frontline(heroes) {
  const bodyValues = heroes
    .map((hero) => {
      const durability = Number(hero.stats?.durability ?? 0)
      const roleBase =
        hero.role === 'Tank' ? 1 :
        hero.role === 'Fighter' ? 0.75 :
        hero.role === 'Support' ? 0.35 : 0
      const statBase =
        durability >= 90 ? 0.95 :
        durability >= 70 ? 0.75 :
        durability >= 50 ? 0.4 : 0
      return Math.max(roleBase, statBase)
    })
    .sort((a, b) => b - a)

  const bodyScore = clamp(((bodyValues[0] ?? 0) + (bodyValues[1] ?? 0)) / 2, 0, 1)
  const durableBodies = bodyValues.filter((v) => v >= 0.7).length
  const initiator = heroes.some((hero) => {
    const control = heroControl(hero)
    return control.hard > 0 && (hero.role === 'Tank' || hero.role === 'Fighter' || Number(hero.stats?.durability ?? 0) >= 70)
  })
  const points = Math.round(bodyScore * 11 + (initiator ? 4 : 0))

  return {
    points: clamp(points, 0, 15),
    detail: `${durableBodies} durable ${durableBodies === 1 ? 'body' : 'bodies'}${initiator ? ' + initiator' : ''}`,
  }
}

function damageSpread(heroes) {
  const counts = { physical: 0, magic: 0, mixed: 0 }
  for (const hero of heroes) counts[damageProfile(hero)] += 1

  const physicalUnits = counts.physical + counts.mixed * 0.5
  const magicUnits = counts.magic + counts.mixed * 0.5
  const contributors = counts.physical + counts.magic + counts.mixed
  const points =
    Math.min(5, physicalUnits * 2.5) +
    Math.min(5, magicUnits * 5) +
    Math.min(3, contributors) +
    (physicalUnits > 0 && magicUnits > 0 ? 2 : 0)

  return {
    points: Math.round(clamp(points, 0, 15)),
    detail: `${counts.physical} offense, ${counts.magic} control, ${counts.mixed} mixed`,
  }
}

function controlChain(heroes) {
  const controls = heroes.map(heroControl)
  const hard = controls.reduce((sum, c) => sum + c.hard, 0)
  const soft = controls.reduce((sum, c) => sum + c.soft, 0)
  const sourceCount = controls.filter((c) => c.value > 0.2).length
  const base = Math.min(10, hard * 2.4 + soft * 0.8)
  const chain = sourceCount >= 3 ? 5 : sourceCount === 2 ? 3 : sourceCount === 1 ? 1 : 0

  return {
    points: Math.round(clamp(base + chain, 0, 15)),
    detail: `${sourceCount} control ${sourceCount === 1 ? 'source' : 'sources'}`,
  }
}

function pairKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function draftLinks(ids, synergyPairs) {
  const synergySet = new Set((synergyPairs ?? []).map(([a, b]) => pairKey(Number(a), Number(b))))
  let links = 0
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      if (synergySet.has(pairKey(ids[i], ids[j]))) links += 1
    }
  }
  return {
    points: Math.min(10, links * 5),
    detail: `${links} known synergy ${links === 1 ? 'pair' : 'pairs'}`,
  }
}

function tempo(heroes) {
  const counts = roleCounts(heroes)
  const controlSources = heroes.filter((hero) => heroControl(hero).value > 0.2).length
  const early = (counts.Assassin ?? 0) * 1.3 + (counts.Fighter ?? 0) * 0.8 + controlSources * 0.35
  const mid = (counts.Mage ?? 0) + (counts.Fighter ?? 0) + (counts.Tank ?? 0) + (counts.Support ?? 0) + controlSources * 0.5
  const late = (counts.Marksman ?? 0) * 1.5 + (counts.Mage ?? 0) * 0.7 + (counts.Support ?? 0) * 0.4
  const phases = [
    ['Early game', early],
    ['Mid game', mid],
    ['Late game', late],
  ].sort((a, b) => b[1] - a[1])
  const activePhases = [early, mid, late].filter((v) => v >= 1).length
  const closeTop = phases[0][1] > 0 && phases[0][1] - phases[1][1] <= 0.5
  const label = closeTop && activePhases >= 2 ? 'Balanced' : phases[0][0]
  const points = Math.round(clamp(activePhases * 2.4 + Math.min(phases[0][1], 3), 0, 10))

  return {
    points,
    label,
    detail: `${label} identity`,
  }
}

function normalizeWinRate(value) {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n > 1 ? n / 100 : n
}

function teamMetrics(ids, heroes, statsByHeroId, rankTotal) {
  const physicalPower = heroes.reduce((sum, hero) => sum + Number(hero.stats?.physical ?? 0), 0)
  const magicPower = heroes.reduce((sum, hero) => sum + Number(hero.stats?.magic ?? 0), 0)
  const totalPower = physicalPower + magicPower
  const rows = ids
    .map((id) => statsByHeroId?.[id] ?? statsByHeroId?.[String(id)])
    .filter(Boolean)
  const winRates = rows.map((row) => normalizeWinRate(row.win_rate)).filter((v) => v != null)
  const ranks = rows
    .map((row) => Number(row.rank ?? row.rank_position))
    .filter((rank) => Number.isFinite(rank))
  const total = Number(rankTotal) || 0
  const rankPercentiles = ranks
    .map((rank) => (total > 1 ? 1 - (rank - 1) / (total - 1) : null))
    .filter((v) => v != null)

  return {
    pickCount: ids.length,
    statsCount: rows.length,
    physicalPower,
    magicPower,
    physicalPct: totalPower > 0 ? physicalPower / totalPower : null,
    magicPct: totalPower > 0 ? magicPower / totalPower : null,
    avgWinRate: winRates.length
      ? winRates.reduce((sum, wr) => sum + wr, 0) / winRates.length
      : null,
    winRateCount: winRates.length,
    avgRank: ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null,
    rankCount: ranks.length,
    avgRankPercentile: rankPercentiles.length
      ? rankPercentiles.reduce((sum, v) => sum + v, 0) / rankPercentiles.length
      : null,
    rankTotal: total,
  }
}

function metaForm(metrics) {
  if (metrics.winRateCount === 0 && metrics.rankCount === 0) {
    return {
      points: 0,
      detail: 'Live stats unavailable',
    }
  }

  const winScore = metrics.avgWinRate == null ? 0 : clamp((metrics.avgWinRate - 0.45) / 0.1, 0, 1) * 9
  const points = Math.round(clamp(winScore + (metrics.avgRankPercentile ?? 0) * 6, 0, 15))
  const wrText = metrics.avgWinRate == null ? 'WR unknown' : `${Math.round(metrics.avgWinRate * 1000) / 10}% avg WR`

  return {
    points,
    detail: `${wrText}; ${metrics.winRateCount}/${metrics.pickCount} WR, ${metrics.rankCount}/${metrics.pickCount} ranked`,
  }
}

function makeBreakdown(label, max, result) {
  return {
    label,
    max,
    points: clamp(Math.round(result.points), 0, max),
    detail: result.detail,
  }
}

function summarize(breakdown, tempoLabel) {
  const strengths = breakdown
    .filter((row) => row.points / row.max >= 0.7)
    .map((row) => row.label)
    .slice(0, 2)
  const gaps = breakdown
    .filter((row) => row.points / row.max <= 0.35)
    .map((row) => row.label)
    .slice(0, 1)

  if (strengths.length > 0) return `${strengths.join(' + ')} - ${tempoLabel}`
  if (gaps.length > 0) return `Needs ${gaps[0].toLowerCase()} - ${tempoLabel}`
  return `${tempoLabel} draft`
}

export function getDraftPower({ picks = [], heroesById = {}, statsByHeroId = {}, rankTotal = 0, synergyPairs = [] } = {}) {
  const ids = picks.filter((id) => id != null).map(Number)
  const heroes = ids.map((id) => asHero(id, heroesById)).filter(Boolean)
  const metrics = teamMetrics(ids, heroes, statsByHeroId, rankTotal)

  if (heroes.length === 0) {
    return {
      score: null,
      maxScore: MAX_SCORE,
      tempoLabel: 'No picks',
      summary: 'Pick heroes to evaluate draft power.',
      metrics,
      breakdown: BREAKDOWN_WEIGHTS.map(([label, max]) => ({ label, max, points: 0, detail: 'No picks yet' })),
    }
  }

  const tempoResult = tempo(heroes)
  const raw = [
    roleShape(heroes),
    frontline(heroes),
    damageSpread(heroes),
    controlChain(heroes),
    draftLinks(ids, synergyPairs),
    tempoResult,
    metaForm(metrics),
  ]
  const breakdown = BREAKDOWN_WEIGHTS.map(([label, max], i) => makeBreakdown(label, max, raw[i]))
  const score = breakdown.reduce((sum, row) => sum + row.points, 0)
  const pickPenalty = Math.max(0, PICK_COUNT - heroes.length)

  return {
    score,
    maxScore: MAX_SCORE,
    tempoLabel: tempoResult.label,
    summary: `${summarize(breakdown, tempoResult.label)}${pickPenalty ? ` - ${heroes.length}/${PICK_COUNT} picked` : ''}`,
    metrics,
    breakdown,
  }
}
