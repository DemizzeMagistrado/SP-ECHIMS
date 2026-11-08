'use client'

import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowUp } from 'lucide-react'

// Scrolls in-page without adding "/#section" to history, so the browser Back
// button from login/register returns straight to the landing page.
function scrollToTarget(event: MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault()
  if (id === 'top') {
    window.scrollTo({ top: 0 })
    return
  }
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView()
  el.focus({ preventScroll: true })
}

export function SectionLink({
  to,
  className,
  children,
  ...rest
}: {
  to: string
  className?: string
  children: ReactNode
  'aria-label'?: string
}) {
  return (
    <a href={to === 'top' ? '/' : `#${to}`} onClick={(e) => scrollToTarget(e, to)} className={className} {...rest}>
      {children}
    </a>
  )
}

export function BackToTop() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const update = () => setShown(window.scrollY > 600)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0 })}
      aria-label="Back to top"
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      className={`fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#03045E] text-white shadow-lg transition-[opacity,transform] duration-200 hover:bg-[#087DB9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2 sm:bottom-8 sm:right-8 ${
        shown ? 'opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      <ArrowUp size={20} aria-hidden />
    </button>
  )
}
