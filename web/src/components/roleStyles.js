// Shared role color palette. Tuned for WCAG AA contrast on the dark theme —
// light desaturated backgrounds with near-black text ensure ≥4.5:1 ratio.
// Used by HeroSlot (nameplate border), HeroPool (badge), and any other
// surface that tags a hero by role.

export const ROLE_STYLES = {
  Tank:     'bg-sky-300 text-sky-950 ring-sky-900/40',
  Fighter:  'bg-amber-300 text-amber-950 ring-amber-900/40',
  Assassin: 'bg-rose-300 text-rose-950 ring-rose-900/40',
  Mage:     'bg-violet-300 text-violet-950 ring-violet-900/40',
  Marksman: 'bg-orange-300 text-orange-950 ring-orange-900/40',
  Support:  'bg-emerald-300 text-emerald-950 ring-emerald-900/40',
}

export function roleClass(role) {
  return ROLE_STYLES[role] ?? 'bg-slate-300 text-slate-950 ring-slate-900/40'
}

export const ROLE_BORDER = {
  Tank:     'border-sky-400',
  Fighter:  'border-amber-400',
  Assassin: 'border-rose-400',
  Mage:     'border-violet-400',
  Marksman: 'border-orange-400',
  Support:  'border-emerald-400',
}

export function roleBorder(role) {
  return ROLE_BORDER[role] ?? 'border-slate-500'
}
