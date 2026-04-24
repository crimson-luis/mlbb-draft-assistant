import { useCallback, useRef, useState } from 'react'

// Shared hover-popover controller. Used by Recommendations, HeroPool tiles,
// and pick/ban slots so they all drive a single floating popover rendered
// at the top of the tree.
//
// - openDelay: ms to wait before opening after mouseenter (prevents flicker).
// - closeDelay: ms to wait before closing after mouseleave, so the user can
//   move the cursor into the popover without it disappearing.
export default function useHeroPopover({ openDelay = 300, closeDelay = 120 } = {}) {
  const [hover, setHover] = useState(null) // { heroId, rect } | null
  const openTimer = useRef(null)
  const closeTimer = useRef(null)

  const onHeroEnter = useCallback((heroId, el) => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = setTimeout(() => {
      if (!el || !el.getBoundingClientRect) return
      setHover({ heroId, rect: el.getBoundingClientRect() })
    }, openDelay)
  }, [openDelay])

  const onHeroLeave = useCallback(() => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setHover(null), closeDelay)
  }, [closeDelay])

  // Called from the popover itself when the mouse enters it — cancels the
  // pending close so the popover stays visible while the cursor is inside.
  const onPopoverKeep = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])

  return { hover, onHeroEnter, onHeroLeave, onPopoverKeep }
}
