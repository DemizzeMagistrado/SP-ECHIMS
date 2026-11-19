'use client'
import { useLayoutEffect, useRef } from 'react'

// Last position per tab group, so route-based tabs (which remount with the page) slide from
// where the indicator was instead of appearing in place.
const last = new Map<string, string>()

// The active item of a strip: tabs (aria-selected), route links (aria-current="page"), the sticky
// section bar (aria-current="location") and toggle buttons (aria-pressed).
const ACTIVE = '[aria-selected="true"], [aria-current="page"], [aria-current="location"], [aria-pressed="true"]'

/**
 * Sliding fill behind the active item of its parent strip, which must be `relative isolate`.
 * Items stay `relative` with no z-index and wrap their label in `relative z-[1]`, so the fill
 * paints over the items' own backgrounds (it stays visible while crossing them) and under their
 * text. It slides with translate (.tab-pill, 250ms) and takes the new item's size without
 * animating it, so its corners never stretch. With no active item it fades out.
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
      const tab = list.querySelector<HTMLElement>(ACTIVE)
      if (!tab) { el.style.opacity = '0'; return }
      const to = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`
      el.style.width = `${tab.offsetWidth}px`; el.style.height = `${tab.offsetHeight}px`
      el.style.transition = animate ? '' : 'none'
      el.style.opacity = '1'
      el.style.transform = to
      last.set(group, to)
    }
    let frame = 0
    const from = last.get(group)
    if (from && el.style.transform === '') {
      // Remounted after a route change: start at the old spot, wait until the page gate reveals
      // the page (a slide behind the loader would be invisible), then slide.
      el.style.transition = 'none'
      el.style.transform = from
      el.style.opacity = '1'
      let tries = 0
      const go = () => {
        if (el.closest('.loading-gate[data-state="loading"]') && tries++ < 600) { frame = requestAnimationFrame(go); return }
        frame = requestAnimationFrame(() => place(true))
      }
      frame = requestAnimationFrame(go)
    } else {
      place(el.style.transform !== '')
    }
    // Wrapping or resizing tab rows: follow without animating. The observer's first call is
    // just the initial size and would cancel the slide above.
    let initial = true
    const ro = new ResizeObserver(() => { if (initial) { initial = false; return } place(false) })
    ro.observe(list)
    return () => { cancelAnimationFrame(frame); ro.disconnect() }
  }, [group, activeKey])

  return <span ref={bar} aria-hidden className={`tab-pill ${className}`} />
}
