'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

type Bar = 'idle' | 'running' | 'finishing'

/**
 * Instant feedback for in-app link clicks: a thin sky bar at the top of the window if the next
 * route has not committed within 150ms. Once the route commits (the page loader takes over if
 * the data is slow), the bar completes and fades. Only transform and opacity animate.
 */
export function NavProgress() {
  const pathname = usePathname()
  const [bar, setBar] = useState<Bar>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setBar('running'), 150)
      document.documentElement.dataset.navigating = ''
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // The route committed: finish the bar (if it showed) and release the exit fade.
  useEffect(() => {
    window.clearTimeout(timer.current)
    delete document.documentElement.dataset.navigating
    setBar((b) => (b === 'running' ? 'finishing' : 'idle'))
  }, [pathname])
  useEffect(() => {
    if (bar !== 'finishing') return
    const t = window.setTimeout(() => setBar('idle'), 350)
    return () => window.clearTimeout(t)
  }, [bar])
  // shortcut: a navigation that never commits (e.g. cancelled) clears the bar after 10s.
  useEffect(() => {
    if (bar !== 'running') return
    const t = window.setTimeout(() => { delete document.documentElement.dataset.navigating; setBar('idle') }, 10_000)
    return () => window.clearTimeout(t)
  }, [bar])

  return <div aria-hidden className="nav-progress" data-state={bar} />
}
