'use client'

import Link from 'next/link'
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowUp, Menu, X } from 'lucide-react'
import { Logo } from '@/components/brand/logo'

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
  onNavigate,
  ...rest
}: {
  to: string
  className?: string
  children: ReactNode
  onNavigate?: () => void
  'aria-label'?: string
  'aria-current'?: 'location' | undefined
}) {
  return (
    <a
      href={to === 'top' ? '/' : `#${to}`}
      onClick={(e) => {
        scrollToTarget(e, to)
        onNavigate?.()
      }}
      className={className}
      {...rest}
    >
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

const sections = [
  ['features', 'Features'],
  ['how-it-works', 'How it works'],
  ['roles', 'Who uses it'],
] as const

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2'

// White header: gains a shadow once the page scrolls, underlines the section in view,
// and folds the section links into a menu on small screens.
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8)
    update()
    window.addEventListener('scroll', update, { passive: true })

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
          else setActive((current) => (current === entry.target.id ? null : current))
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    sections.forEach(([id]) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => {
      window.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 bg-white/95 backdrop-blur-md transition-shadow animate-in fade-in slide-in-from-top-2 fill-mode-both duration-500 ${
        scrolled || open ? 'shadow-[0_1px_0_rgba(3,4,94,0.08),0_8px_24px_-16px_rgba(3,4,94,0.35)]' : 'shadow-[0_1px_0_rgba(3,4,94,0.06)]'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-[4.5rem] sm:px-8">
        <SectionLink to="top" aria-label="Back to top" onNavigate={() => setOpen(false)} className={`shrink-0 rounded-lg ${focusRing}`}>
          <Logo size={44} priority />
        </SectionLink>

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {sections.map(([id, label]) => (
            <SectionLink
              key={id}
              to={id}
              aria-current={active === id ? 'location' : undefined}
              className={`group relative rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors duration-200 ${focusRing} ${
                active === id ? 'text-[#03045E]' : 'text-[#5B6478] hover:text-[#03045E]'
              }`}
            >
              {label}
              <span
                aria-hidden
                className={`absolute inset-x-3.5 -bottom-0.5 h-0.5 origin-left rounded-full bg-[#087DB9] transition-transform duration-300 ease-out ${
                  active === id ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50'
                }`}
              />
            </SectionLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/login" className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-[#03045E] transition-colors hover:bg-[#EAF6FA] ${focusRing}`}>
            Sign in
          </Link>
          <Link
            href="/register"
            className={`hidden rounded-lg bg-[#087DB9] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#087DB9]/30 transition-colors hover:bg-[#056d9e] sm:inline-block ${focusRing}`}
          >
            Create account
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-sections"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={`flex h-10 w-10 items-center justify-center rounded-lg text-[#03045E] hover:bg-[#EAF6FA] md:hidden ${focusRing}`}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-sections" aria-label="Sections" className="border-t border-[#E3EEF3] px-4 pb-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200 md:hidden">
          {sections.map(([id, label]) => (
            <SectionLink
              key={id}
              to={id}
              onNavigate={() => setOpen(false)}
              className={`block rounded-lg px-3 py-3 font-semibold ${focusRing} ${active === id ? 'bg-[#EAF6FA] text-[#03045E]' : 'text-[#2D3A55]'}`}
            >
              {label}
            </SectionLink>
          ))}
          <Link href="/register" className={`mt-2 block rounded-lg bg-[#087DB9] px-3 py-3 text-center font-semibold text-white sm:hidden ${focusRing}`}>
            Create account
          </Link>
        </nav>
      )}
    </header>
  )
}
