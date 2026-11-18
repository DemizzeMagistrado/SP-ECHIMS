'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { getRefreshing, subscribe } from '@/components/brand/loader-state'

type Bar = 'idle' | 'running' | 'finishing'

/**
 * Instant feedback without in-page loaders: a thin sky bar at the top of the window while an
 * in-app navigation has not committed, or while content on screen is refetching (a new filter or
 * date range), once either has taken longer than 150ms. It then completes and fades.
 * Only transform and opacity animate.
 */
export function NavProgress() {
  const pathname = usePathname()
  const [navigating, setNavigating] = useState(false)
  const refreshing = useSyncExternalStore(subscribe, getRefreshing, () => 0) > 0
  const [bar, setBar] = useState<Bar>('idle')
  const timer = useRef<number | undefined>(undefined)
  const active = navigating || refreshing

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
      // Lets the current page fade out (see html[data-navigating] in globals.css).
      document.documentElement.dataset.navigating = ''
      setNavigating(true)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // The route committed.
  useEffect(() => {
    delete document.documentElement.dataset.navigating
    setNavigating(false)
  }, [pathname])
  // shortcut: a navigation that never commits (e.g. cancelled) is dropped after 10s.
  useEffect(() => {
    if (!navigating) return
    const t = window.setTimeout(() => { delete document.documentElement.dataset.navigating; setNavigating(false) }, 10_000)
    return () => window.clearTimeout(t)
  }, [navigating])

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (active) timer.current = window.setTimeout(() => setBar('running'), 150)
    else setBar((b) => (b === 'running' ? 'finishing' : 'idle'))
    return () => window.clearTimeout(timer.current)
  }, [active])
  useEffect(() => {
    if (bar !== 'finishing') return
    const t = window.setTimeout(() => setBar('idle'), 350)
    return () => window.clearTimeout(t)
  }, [bar])

  return <div aria-hidden className="nav-progress" data-state={bar} />
}
