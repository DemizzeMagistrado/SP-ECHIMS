'use client'

import { useEffect } from 'react'

/**
 * Arrow-key support for every tab bar, mounted once in the root layout. In a [role=tablist],
 * ←/→ (and Home/End) move to the neighbouring [role=tab] and select it; in a [data-arrow-nav]
 * link bar (the module tabs, which are page links) they only move focus. Bars that already
 * handle the key call preventDefault, which this respects.
 */
export function ArrowKeyTabs() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
      const el = e.target as HTMLElement | null
      const bar = el?.closest<HTMLElement>('[role="tablist"], [data-arrow-nav]')
      if (!el || !bar) return
      const isTabs = bar.getAttribute('role') === 'tablist'
      const items = Array.from(bar.querySelectorAll<HTMLElement>(isTabs ? '[role="tab"]:not([disabled])' : 'a[href]'))
      const i = items.indexOf(el)
      if (i < 0) return
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
      e.preventDefault()
      items[next].focus()
      if (isTabs) items[next].click()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return null
}
