import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from '../api'
import { wrTextTone } from './HeroOverlay'

// In-memory cache keyed by `${heroId}|${rank}`. Backend caches for 1h too;
// this just avoids re-fetching during a single session when the user re-opens.
const cache = new Map()
const inflight = new Map()

function cacheKey(heroId, rank) { return `${heroId}|${rank || 'mythic'}` }

function loadStats(heroId, rank) {
  const key = cacheKey(heroId, rank)
  if (cache.has(key)) return Promise.resolve(cache.get(key))
  if (inflight.has(key)) return inflight.get(key)
  const p = api.stats(heroId, { rank })
    .then((data) => { cache.set(key, data); inflight.delete(key); return data })
    .catch((e) => { inflight.delete(key); throw e })
  inflight.set(key, p)
  return p
}

function pct(n) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function signedPct(n) {
  if (n == null) return ''
  const v = n * 100
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

function formatUpdated(ms) {
  if (!ms) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function StatBar({ label, value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <div className="flex w-full items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-widest text-slate-500">{label}</span>
        <span className="text-[10px] font-semibold tabular-nums text-slate-300">{v}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded bg-slate-400" style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

function Headline({ label, value, tone }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-widest text-slate-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone ?? 'text-slate-200'}`}>{value}</span>
    </div>
  )
}

function HeroRow({ item, deltaTone }) {
  return (
    <li className="flex items-center gap-1.5">
      <img
        src={api.portraitUrl(item.id)}
        alt=""
        loading="lazy"
        onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
        className="h-4 w-4 flex-none rounded-sm object-cover ring-1 ring-slate-700"
      />
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">{item.name}</span>
      {item.win_rate != null && (
        <span className="text-[10px] tabular-nums text-slate-400">{pct(item.win_rate)}</span>
      )}
      {item.increase_win_rate != null && (
        <span className={`w-10 text-right text-[10px] tabular-nums ${deltaTone}`}>
          {signedPct(item.increase_win_rate)}
        </span>
      )}
    </li>
  )
}

function HeroList({ items, deltaTone }) {
  if (!items || items.length === 0) {
    return <div className="text-[11px] text-slate-500">No data.</div>
  }
  return (
    <ul className="space-y-0.5">
      {items.map((it) => <HeroRow key={it.id} item={it} deltaTone={deltaTone} />)}
    </ul>
  )
}

function SidePanel({ title, items, deltaTone }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">{title}</div>
      <HeroList items={items} deltaTone={deltaTone} />
    </div>
  )
}

function SkeletonBar({ width = 'w-full', height = 'h-3' }) {
  return <div className={`skeleton ${width} ${height}`} />
}

function SkeletonBody() {
  return (
    <>
      {/* Stats bars: 4 short bars mirroring the real Mag/Phy/Dur/Diff row. */}
      <div className="flex gap-2">
        {['Mag', 'Phy', 'Dur', 'Diff'].map((label) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="flex w-full items-baseline justify-between">
              <span className="text-[9px] uppercase tracking-widest text-slate-500">{label}</span>
              <SkeletonBar width="w-4" height="h-2" />
            </div>
            <SkeletonBar height="h-1" />
          </div>
        ))}
      </div>

      {/* Headline tile: 3 cells mirroring Win/Pick/Ban. */}
      <div className="grid grid-cols-3 gap-2 rounded bg-slate-900/60 p-2">
        {['Win', 'Pick', 'Ban'].map((label) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className="text-[9px] uppercase tracking-widest text-slate-500">{label}</span>
            <SkeletonBar width="w-10" height="h-3" />
          </div>
        ))}
      </div>

      {/* Counters / Countered by side panels (3 rows each). */}
      <div className="flex gap-3">
        {['Counters', 'Countered by'].map((title) => (
          <div key={title} className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">{title}</div>
            <div className="space-y-1">
              <SkeletonBar height="h-3" />
              <SkeletonBar height="h-3" />
              <SkeletonBar height="h-3" />
            </div>
          </div>
        ))}
      </div>

      {/* Compatible / Not compatible side panels. */}
      <div className="flex gap-3">
        {['Compatible', 'Not compatible'].map((title) => (
          <div key={title} className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">{title}</div>
            <div className="space-y-1">
              <SkeletonBar height="h-3" />
              <SkeletonBar height="h-3" />
              <SkeletonBar height="h-3" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function RelationRow({ title, items, tone }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">{title}</div>
      {(!items || items.length === 0) ? (
        <div className="text-[11px] text-slate-500">No data.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-1.5 rounded bg-slate-900/60 px-1.5 py-0.5 ring-1 ring-slate-800">
              <img
                src={api.portraitUrl(it.id)}
                alt=""
                loading="lazy"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                className="h-4 w-4 flex-none rounded-sm object-cover ring-1 ring-slate-700"
              />
              <span className={`text-[11px] ${tone}`}>{it.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HeroStatsPopover({ heroId, hero, rank, anchorRect, onHoverKeep, onHoverLeave }) {
  const rankKey = rank || 'mythic'
  const [data, setData] = useState(() => cache.get(cacheKey(heroId, rankKey)) ?? null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!cache.has(cacheKey(heroId, rankKey)))
  const ref = useRef(null)
  const [pos, setPos] = useState(() => ({ top: anchorRect?.top ?? 8, left: 8 }))

  useEffect(() => {
    const k = cacheKey(heroId, rankKey)
    if (cache.has(k)) { setData(cache.get(k)); setLoading(false); return }
    let cancelled = false
    setLoading(true); setError(null)
    loadStats(heroId, rankKey).then(
      (d) => { if (!cancelled) { setData(d); setLoading(false) } },
      (e) => { if (!cancelled) { setError(e.message); setLoading(false) } },
    )
    return () => { cancelled = true }
  }, [heroId, rankKey])

  useLayoutEffect(() => {
    if (!anchorRect || !ref.current) return
    const GAP = 8
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1600
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900
    const rect = ref.current.getBoundingClientRect()
    const w = rect.width || 320
    const h = rect.height || 0

    const rightSpace = vw - anchorRect.right - GAP
    const placeRight = rightSpace >= w
    const left = placeRight ? anchorRect.right + GAP : Math.max(8, anchorRect.left - GAP - w)

    let top = anchorRect.top
    if (top + h > vh - 8) top = vh - 8 - h
    if (top < 8) top = 8

    setPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }))
  }, [anchorRect, data, loading, error])

  if (!anchorRect) return null

  const POPOVER_W = 360
  const displayName = data?.name ?? hero?.name
  const displayRole = hero?.role || ''
  const updated = formatUpdated(data?.data_updated_at_ms)
  // abilityshow from openmlbb is [durability, physical, magic, difficulty]
  // but local heroes.json scraped from mapi stored them as explicit keys.
  const heroStats = hero?.stats || {}
  const rankPos = data?.rank_position
  const rankTotal = data?.rank_total

  return (
    <div
      ref={ref}
      role="dialog"
      onMouseEnter={onHoverKeep}
      onMouseLeave={onHoverLeave}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_W, zIndex: 50 }}
      className="flex flex-col gap-2.5 rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-sm shadow-xl backdrop-blur"
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate">
          <span className="text-[11px] font-mono text-slate-500">#{heroId}</span>
          <span className="ml-1.5 font-semibold text-slate-100">{displayName}</span>
          {displayRole && (
            <span className="ml-1.5 text-[10px] uppercase tracking-widest text-slate-400">· {displayRole}</span>
          )}
        </span>
        <span className="flex-none text-[10px] text-slate-500">
          {rankPos != null ? <>rank #{rankPos}{rankTotal ? `/${rankTotal}` : ''}</> : loading ? 'loading…' : null}
        </span>
      </header>

      {(heroStats.magic != null || heroStats.physical != null) && (
        <div className="flex gap-2">
          <StatBar label="Mag"  value={heroStats.magic} />
          <StatBar label="Phy"  value={heroStats.physical} />
          <StatBar label="Dur"  value={heroStats.durability} />
          <StatBar label="Diff" value={heroStats.difficulty} />
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-700 bg-rose-950/60 p-2 text-[11px] text-rose-200">
          Stats unavailable: {error}
        </div>
      )}

      {loading && !data && !error && <SkeletonBody />}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 rounded bg-slate-900/60 p-2">
            <Headline label="Win"  value={pct(data.win_rate)}  tone={wrTextTone(data.win_rate)} />
            <Headline label="Pick" value={pct(data.pick_rate)} tone="text-sky-300" />
            <Headline label="Ban"  value={pct(data.ban_rate)}  tone="text-amber-300" />
          </div>

          <div className="flex gap-3">
            <SidePanel title="Counters"     items={data.counters}       deltaTone="text-emerald-300" />
            <SidePanel title="Countered by" items={data.countered_by}   deltaTone="text-rose-300" />
          </div>

          <div className="flex gap-3">
            <SidePanel title="Compatible"     items={data.compatible}     deltaTone="text-sky-300" />
            <SidePanel title="Not compatible" items={data.not_compatible} deltaTone="text-rose-300" />
          </div>

          <div className="flex flex-col gap-1.5 rounded bg-slate-900/40 p-2">
            <RelationRow title="Strong against" items={data.relation_strong} tone="text-emerald-300" />
            <RelationRow title="Weak against"   items={data.relation_weak}   tone="text-rose-300" />
            <RelationRow title="Assists"        items={data.relation_assist} tone="text-sky-300" />
          </div>

          <div className="text-[9px] text-slate-600">
            Ranked {data.rank_tier || 'mythic'} · via {(data.source || '').replace(/^https?:\/\//, '')}
            {updated && <> · updated {updated}</>}
          </div>
        </>
      )}
    </div>
  )
}
