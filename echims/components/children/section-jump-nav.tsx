'use client'

// Sticky quick-jump bar for the child profile: sits under the top bar while scrolling, marks the
// section in view (aria-current) and scrolls smoothly to a section (instantly with reduced motion).

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SectionJumpNav({ items, extra, label }: {
  items: { id: string; label: ReactNode }[]
  /** Extra links after the section buttons (e.g. Alerts, which is another page). */
  extra?: ReactNode
  label: string
}) {
  const [active, setActive] = useState<string | null>(null)
  const ids = items.map((i) => i.id).join('|')

  useEffect(() => {
    const els = ids.split('|').map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el))
    if (!els.length) return
    // The section whose top has passed the bar (about 140px from the viewport top) is current.
    const pick = () => {
      let current: string | null = null
      for (const el of els) if (el.getBoundingClientRect().top <= 140) current = el.id
      setActive(current)
    }
    pick()
    window.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    return () => { window.removeEventListener('scroll', pick); window.removeEventListener('resize', pick) }
  }, [ids])

  function jump(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <nav
      aria-label={label}
      className="print-hide sticky top-16 z-20 -mx-4 border-b border-brand-line/70 bg-[#F1FAFC]/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div className="flex gap-2 overflow-x-auto">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active === item.id ? 'location' : undefined}
            onClick={(e) => { e.preventDefault(); jump(item.id) }}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active === item.id ? 'border-primary bg-primary text-white' : 'border-border bg-white text-brand-navy hover:bg-brand-ice',
            )}
          >
            {item.label}
          </a>
        ))}
        {extra}
      </div>
    </nav>
  )
}
