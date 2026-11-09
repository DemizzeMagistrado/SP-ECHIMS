'use client'
import { useLayoutEffect, useRef } from 'react'

// Last position per tab group, so route-based tabs (which remount with the page) slide from
// where the indicator was instead of appearing in place.
const last = new Map<string, string>()

/**
 * Marks the active tab ([aria-selected="true"] or [aria-current="page"]) of its parent, which must
 * be position: relative. line: a 2px bar under the tab that moves with translate + scaleX.
 * pill: a background behind pill/segmented tabs (give the tab buttons `relative z-10` and no active
 * background); it slides with translate and takes the new tab's size without animating it, so its
 * corners never stretch.
 */
export function TabIndicator({ group, activeKey, variant = 'line', className = '' }: {
  group: string; activeKey: string; variant?: 'line' | 'pill'; className?: string
}) {
  const bar = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = bar.current
    const list = el?.parentElement
    if (!el || !list) return
    const place = (animate: boolean) => {
      const tab = list.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]')
      if (!tab) { el.style.opacity = '0'; return }
      const to = variant === 'pill'
        ? `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`
        : `translate(${tab.offsetLeft}px, ${tab.offsetTop + tab.offsetHeight - 2}px) scaleX(${tab.offsetWidth})`
      if (variant === 'pill') { el.style.width = `${tab.offsetWidth}px`; el.style.height = `${tab.offsetHeight}px` }
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
  }, [group, activeKey, variant])

  return <span ref={bar} aria-hidden className={`${variant === 'pill' ? 'tab-pill' : 'tab-indicator'} ${className}`} />
}
