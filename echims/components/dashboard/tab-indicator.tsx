'use client'
import { useLayoutEffect, useRef } from 'react'

// Last position per tab group, so route-based tabs (which remount with the page) slide from
// where the indicator was instead of appearing in place.
const last = new Map<string, string>()

/**
 * Sliding background behind the active tab ([aria-selected="true"] or [aria-current="page"]) of its
 * parent, which must be position: relative. Give the tab buttons `relative z-10` and no active
 * background. It slides with translate and takes the new tab's size without animating it, so its
 * corners never stretch. Module tabs use it through components/ui/module-tabs.tsx.
 */
export function TabIndicator({ group, activeKey, className = '' }: {
  group: string; activeKey: string; className?: string
}) {
  const bar = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = bar.current
    const list = el?.parentElement
    if (!el || !list) return
    const place = (animate: boolean) => {
      const tab = list.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]')
      if (!tab) { el.style.opacity = '0'; return }
      const to = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`
      el.style.width = `${tab.offsetWidth}px`; el.style.height = `${tab.offsetHeight}px`
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

  return <span ref={bar} aria-hidden className={`tab-pill ${className}`} />
}
