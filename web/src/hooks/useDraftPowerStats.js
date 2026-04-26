import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'

function normalizeFallbackRow(row) {
  if (!row) return null
  return {
    win_rate: row.win_rate,
    pick_rate: row.pick_rate,
    ban_rate: row.ban_rate,
    rank: row.rank ?? row.rank_position,
    source: row.source,
  }
}

function hasLeaderboardRow(leaderboardStats, id) {
  return Boolean(leaderboardStats?.[id] ?? leaderboardStats?.[String(id)])
}

export default function useDraftPowerStats({ pickedIds, leaderboardStats, rank }) {
  const [fallbackState, setFallbackState] = useState({ rank, rows: {} })
  const emptyFallbackStats = useMemo(() => ({}), [])
  const fallbackStats = fallbackState.rank === rank ? fallbackState.rows : emptyFallbackStats

  const ids = useMemo(
    () => [...new Set((pickedIds ?? []).filter((id) => id != null).map(Number))],
    [pickedIds],
  )

  useEffect(() => {
    const missingIds = ids.filter(
      (id) => !hasLeaderboardRow(leaderboardStats, id) && fallbackStats[id] === undefined,
    )
    if (missingIds.length === 0) return undefined

    let cancelled = false
    Promise.allSettled(
      missingIds.map((id) => api.stats(id, { rank }).then((row) => [id, normalizeFallbackRow(row)])),
    ).then((results) => {
      if (cancelled) return
      setFallbackState((prev) => {
        const next = { ...(prev.rank === rank ? prev.rows : {}) }
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const [id, row] = result.value
            next[id] = row
          } else {
            next[missingIds[index]] = null
          }
        })
        return { rank, rows: next }
      })
    })

    return () => {
      cancelled = true
    }
  }, [fallbackStats, ids, leaderboardStats, rank])

  return useMemo(() => {
    const rows = {}
    for (const [id, row] of Object.entries(fallbackStats)) {
      if (row) rows[id] = row
    }
    return { ...rows, ...(leaderboardStats ?? {}) }
  }, [fallbackStats, leaderboardStats])
}
