'use client'

// Sticky section jump bar (first used on the child profile).
// - Not stuck: no background, border or shadow; only the pill buttons show on the page gradient.
// - Stuck under the top bar (seen by an IntersectionObserver sentinel, no scroll handler): fades
//   in the page gradient (slightly translucent, light blur) and a soft bottom fade instead of a
//   hard line, ~200ms ease-out, instant with reduced motion.
// - Jumping lands the section title just below the bar: offset = measured top bar + bar height +
//   GAP, re-measured on resize / font load; it is also exposed as --subnav-offset for
//   scroll-margin-top (give sections `scroll-mt-[var(--subnav-offset,8rem)]`). After a smooth
//   scroll ends, the position is corrected once in case content above grew while scrolling.
// - The clicked section is highlighted at once and stays highlighted (also the last section when
//   the page cannot scroll that far) until the user scrolls on their own.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const GAP = 14

export const subnavPill = (active: boolean) => cn(
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-brand-navy hover:bg-brand-ice',
)

export function StickySubnav({ items, extra, label }: {
  items: { id: string; label: ReactNode }[]
  /** Extra links after the section buttons (e.g. Alerts, which is another page). */
  extra?: ReactNode
  label: string
}) {
  const nav = useRef<HTMLElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const offset = useRef(128)
  const clicked = useRef<string | null>(null)
  const scrolling = useRef(false)
  const [top, setTop] = useState(64)
  const [stuck, setStuck] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const ids = items.map((i) => i.id).join('|')

  // Measure the top bar and this bar; keep offset and --subnav-offset current.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.app-topbar')
    const measure = () => {
      const t = bar?.offsetHeight ?? 0
      setTop(t)
      offset.current = t + (nav.current?.offsetHeight ?? 0) + GAP
      document.documentElement.style.setProperty('--subnav-offset', `${offset.current}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (bar) observer.observe(bar)
    if (nav.current) observer.observe(nav.current)
    void document.fonts?.ready.then(measure)
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--subnav-offset') }
  }, [])

  // Stuck = the sentinel just above the bar has gone under the top bar.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < top + 1), { rootMargin: `-${top + 1}px 0px 0px 0px` })
    observer.observe(el)
    return () => observer.disconnect()
  }, [top])

  // Current section: the last one whose top has reached the bar.
  useEffect(() => {
    const els = () => ids.split('|').map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el))
    let frame = 0
    const pick = () => {
      frame = 0
      if (scrolling.current) return
      const list = els()
      if (!list.length) return
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (clicked.current) { setActive(clicked.current); return }
      let current: string | null = null
      for (const el of list) if (el.getBoundingClientRect().top <= offset.current + 4) current = el.id
      if (atBottom) current = list[list.length - 1].id
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(pick) }
    // The user scrolling on their own releases the clicked highlight.
    const release = () => { if (!scrolling.current) clicked.current = null }
    pick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    for (const ev of ['wheel', 'touchstart', 'keydown'] as const) window.addEventListener(ev, release, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      for (const ev of ['wheel', 'touchstart', 'keydown'] as const) window.removeEventListener(ev, release)
    }
  }, [ids])

  function jump(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = () => Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset.current)
    clicked.current = id
    setActive(id)
    scrolling.current = true
    window.scrollTo({ top: target(), behavior: reduce ? 'auto' : 'smooth' })
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.removeEventListener('scrollend', finish)
      // Content above may have grown (sections loading) during the scroll: land exactly.
      if (Math.abs(target() - window.scrollY) > 2) window.scrollTo({ top: target(), behavior: 'auto' })
      requestAnimationFrame(() => { scrolling.current = false })
    }
    window.addEventListener('scrollend', finish, { once: true })
    setTimeout(finish, reduce ? 50 : 900) // browsers without scrollend
  }

  return (
    <>
      {/* -mb-px: no extra space, also inside space-y-* parents (their margin sits on the bar). */}
      <div ref={sentinel} aria-hidden="true" className="-mb-px h-px" />
      <nav
        ref={nav}
        aria-label={label}
        style={{ top }}
        className="print-hide sticky isolate z-20 -mx-4 px-4 py-2.5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        {/* Stuck background: the page gradient (fixed, so it lines up), translucent with a blur. */}
        <div aria-hidden="true" className={cn(
          'absolute inset-0 -z-10 bg-[linear-gradient(180deg,#CAF0F8_0%,#E4F6FA_40%,#F1FAFC_100%)] bg-fixed opacity-0 backdrop-blur-md transition-opacity duration-200 ease-out motion-reduce:transition-none',
          stuck && 'opacity-90',
        )} />
        {/* Soft bottom fade instead of a border, so content slides under it. */}
        <div aria-hidden="true" className={cn(
          'pointer-events-none absolute inset-x-0 top-full h-4 bg-gradient-to-b from-[#D8F3F9]/80 to-transparent opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none',
          stuck && 'opacity-100',
        )} />
        <div className="flex gap-2 overflow-x-auto">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={active === item.id ? 'location' : undefined}
              onClick={(e) => { e.preventDefault(); jump(item.id) }}
              className={subnavPill(active === item.id)}
            >
              {item.label}
            </a>
          ))}
          {extra}
        </div>
      </nav>
    </>
  )
}
