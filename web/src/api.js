// Fetch wrapper for the FastAPI backend.
// Dev: Vite proxies /api → localhost:8000 (see vite.config.js).
// Override for non-dev setups by setting VITE_API_BASE.

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function request(path, init) {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}${body ? `: ${body}` : ''}`)
  }
  return res.json()
}

export const api = {
  health: () => request('/api/health'),
  heroes: () => request('/api/heroes'),
  portraitUrl: (heroId) => `${BASE}/api/portrait/${heroId}`,
  portraitFullUrl: (heroId) => `${BASE}/api/portrait/${heroId}/full`,
  recommend: ({ enemy_picks = [], ally_picks = [], bans = [], only_ids, only_roles } = {}) => {
    const body = { enemy_picks, ally_picks, bans }
    if (only_ids && only_ids.length > 0) body.only_ids = only_ids
    if (only_roles && only_roles.length > 0) body.only_roles = only_roles
    return request('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },
  stats: (heroId, { rank } = {}) => {
    const qs = rank ? `?rank=${encodeURIComponent(rank)}` : ''
    return request(`/api/stats/${heroId}${qs}`)
  },
  leaderboard: ({ rank } = {}) => {
    const qs = rank ? `?rank=${encodeURIComponent(rank)}` : ''
    return request(`/api/leaderboard${qs}`)
  },
}
