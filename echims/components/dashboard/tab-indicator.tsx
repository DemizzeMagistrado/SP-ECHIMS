'use client'
import { useLayoutEffect, useRef } from 'react'

// Last position per tab group, so route-based tabs (which remount with the page) slide from
// where the indicator was instead of appearing in place.
const last = new Map<string, string>()

/**
 * A 2px bar under the active tab ([aria-selected="true"] or [aria-current="page"]) of its parent,
 * which must be position: relative. Moves with transform only (translate + scaleX).
 */
export function TabIndicator({ group, activeKey }: { group: string; activeKey: string }) {
  const bar = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = bar.current
    const list = el?.parentElement
    if (!el || !list) return
    const place = (animate: boolean) => {
      const tab = list.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]')
      if (!tab) { el.style.opacity = '0'; return }
      const to = `translate(${tab.offsetLeft}px, ${tab.offsetTop + tab.offsetHeight - 2}px) scaleX(${tab.offsetWidth})`
      el.style.transition = animate ? '' : 'none'
      el.style.opacity = '1'
      el.style.transform = to
      last.set(group, to)
    }
    const from = last.get(group)
    if (from && el.style.transform === '') {
      // Remounted after a route change: start at the old spot, then slide.
      el.style.transition = 'none'
      el.style.transform = from
      requestAnimationFrame(() => requestAnimationFrame(() => place(true)))
    } else {
      place(el.style.transform !== '')
    }
    // Wrapping or resizing tab rows: follow without animating. The observer's first call is
    // just the initial size and would cancel the slide above.
    let initial = true
    const ro = new ResizeObserver(() => { if (initial) { initial = false; return } place(false) })
    ro.observe(list)
    return () => ro.disconnect()
  }, [group, activeKey])

  return <span ref={bar} aria-hidden className="tab-indicator" />
}
