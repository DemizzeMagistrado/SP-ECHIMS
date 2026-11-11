'use client'

// Small ⓘ button with a short explanation. Opens on mouse hover and keyboard focus, toggles on
// tap (touch screens), closes on Esc, blur or a tap elsewhere.
//   <InfoTip label="About Child ID">A unique ID the system gives every registered child…</InfoTip>

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InfoTip({ label, children, className, align = 'start' }: {
  /** Accessible name of the button, e.g. "About Child ID". */
  label: string
  children: ReactNode
  className?: string
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const box = useRef<HTMLSpanElement>(null)
  // A tap fires focus then click; a click right after an open must not close it again.
  const openedAt = useRef(0)
  const show = () => { openedAt.current = Date.now(); setOpen(true) }

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return (
    <span ref={box} className={cn('relative inline-flex align-middle normal-case tracking-normal', className)}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') show() }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false) }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); if (open && Date.now() - openedAt.current < 400) return; if (open) setOpen(false); else show() }}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) } }}
        className="inline-flex size-5 items-center justify-center rounded-full text-brand-muted hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute top-full z-30 mt-1.5 w-64 rounded-xl border border-border bg-white p-3 text-left text-xs font-normal leading-5 text-brand-navy shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </span>
      )}
    </span>
  )
}

/** The two explanations used across Child Profiling. */
export const CHILD_ID_HELP = 'A unique ID the system gives every registered child. Format: ECH-<year registered>-<6-digit number>, e.g. ECH-2026-000027. It never changes and can’t be edited.'
export const FSN_HELP = 'A number shared by children in the same household, so families with similar surnames are easy to tell apart. Format: FSN-<barangay code>-<number>. Siblings have the same FSN. This is the “Family no.” on the DOH Child Immunization Record card.'
