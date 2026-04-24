import { useEffect, useState } from 'react'
import { api } from '../api'

// Fetches the full hero leaderboard (rank + win/pick/ban rates for all 132 heroes)
// once per rank change. Backend caches upstream responses for an hour, so the cost
// of a rank switch is one round-trip. Returns { statsByHeroId, loading, error }
// — consumers render a small overlay per tile (rank badge + WR bar).
export default function useLeaderboard(rank) {
  const [data, setData] = useState({ statsByHeroId: {}, rankTotal: 0, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    setData((d) => ({ ...d, loading: true, error: null }))

    api.leaderboard({ rank })
      .then((resp) => {
        if (cancelled) return
        // Backend keys are strings; normalize to numeric ids for easy lookup.
        const stats = {}
        for (const [hid, row] of Object.entries(resp.heroes || {})) {
          stats[Number(hid)] = row
        }
        setData({
          statsByHeroId: stats,
          rankTotal: resp.rank_total ?? 0,
          loading: false,
          error: null,
        })
      })
      .catch((e) => {
        if (cancelled) return
        setData({ statsByHeroId: {}, rankTotal: 0, loading: false, error: e.message })
      })

    return () => { cancelled = true }
  }, [rank])

  return data
}
