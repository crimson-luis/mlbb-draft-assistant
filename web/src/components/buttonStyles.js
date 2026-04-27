const BUTTON_BASE = 'inline-flex min-h-8 items-center justify-center rounded-md border px-2.5 py-1 text-xs font-medium leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-50'
const BUTTON_COMPACT_BASE = 'inline-flex min-h-7 items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium leading-none transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-50'

const BUTTON_TONES = {
  neutral: 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:border-slate-300',
  active: 'border-slate-100 bg-slate-100 text-slate-950 hover:bg-white focus-visible:border-white',
  primary: 'border-sky-400/60 bg-sky-400/15 text-sky-100 hover:bg-sky-400/25 focus-visible:border-sky-200',
  warning: 'border-amber-400/60 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25 focus-visible:border-amber-200',
}

export function buttonClass(tone = 'neutral', extra = '') {
  return [BUTTON_BASE, BUTTON_TONES[tone] ?? BUTTON_TONES.neutral, extra].filter(Boolean).join(' ')
}

export function compactButtonClass(tone = 'neutral', extra = '') {
  return [BUTTON_COMPACT_BASE, BUTTON_TONES[tone] ?? BUTTON_TONES.neutral, extra].filter(Boolean).join(' ')
}

export const selectClass = 'min-h-8 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-100 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-500/40'

export const searchInputClass = 'min-h-8 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-500/40'
