import { useEffect, useRef, useState } from 'react'

function titleCase(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value
}

function SegmentedButton({ active, children, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`min-h-8 rounded px-2.5 py-1 text-xs font-medium transition ${
        active
          ? 'bg-slate-100 text-slate-950'
          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function FieldLabel({ children }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </div>
  )
}

function DraftSettingsPopover({
  rank,
  ranks,
  lane,
  lanes,
  laneLabels,
  banCount,
  banCountSource,
  onRankChange,
  onLaneChange,
  onBanCountChange,
}) {
  return (
    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[110] w-[calc(100vw-1.5rem)] max-w-[420px] rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/40 sm:w-[420px]">
      <div className="grid gap-3">
        <section className="grid gap-1.5">
          <FieldLabel>Rank</FieldLabel>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
            {ranks.map((value) => (
              <SegmentedButton
                key={value}
                active={rank === value}
                onClick={() => onRankChange(value)}
                title="Rank tier used for live stats"
              >
                {titleCase(value)}
              </SegmentedButton>
            ))}
          </div>
        </section>

        <section className="grid gap-1.5">
          <FieldLabel>Recommendation lane</FieldLabel>
          <select
            value={lane}
            onChange={(e) => onLaneChange(e.target.value)}
            className="min-h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 outline-none focus:border-slate-400"
          >
            {lanes.map((value) => (
              <option key={value} value={value}>{laneLabels[value] ?? value}</option>
            ))}
          </select>
        </section>

        <section className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <FieldLabel>Bans per team</FieldLabel>
            {banCountSource === 'rank' && (
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                Rank default
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[3, 4, 5].map((value) => (
              <SegmentedButton
                key={value}
                active={banCount === value}
                onClick={() => onBanCountChange(value)}
                title={banCountSource === 'rank' ? 'Current rank default' : 'User-selected ban count'}
              >
                {value}
              </SegmentedButton>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default function HeaderBar({
  rank,
  ranks,
  lane,
  lanes,
  laneLabels,
  banCount,
  banCountSource,
  onRankChange,
  onLaneChange,
  onBanCountChange,
  onReset,
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const summary = `${titleCase(rank)} / ${laneLabels[lane] ?? lane} / ${banCount} bans`

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <header className="relative z-[100] border-b border-slate-800 bg-slate-900/70 backdrop-blur">
      <div className="mx-auto flex min-h-11 max-w-[1600px] items-center gap-2 px-3 py-1.5 sm:px-6">
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight sm:text-lg">
          MLBB Draft Assistant
        </h1>
        <div ref={menuRef} className="relative flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="min-h-8 max-w-[52vw] rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-left text-xs text-slate-200 hover:bg-slate-700 focus:border-slate-400 focus:outline-none sm:max-w-none"
            title="Draft settings"
          >
            <span className="font-semibold text-slate-100">Draft</span>
            <span className="hidden text-slate-400 sm:inline"> - {summary}</span>
          </button>
          <button
            type="button"
            onClick={onReset}
            className="min-h-8 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            Reset
          </button>
          {open && (
            <DraftSettingsPopover
              rank={rank}
              ranks={ranks}
              lane={lane}
              lanes={lanes}
              laneLabels={laneLabels}
              banCount={banCount}
              banCountSource={banCountSource}
              onRankChange={onRankChange}
              onLaneChange={onLaneChange}
              onBanCountChange={onBanCountChange}
            />
          )}
        </div>
      </div>
    </header>
  )
}
