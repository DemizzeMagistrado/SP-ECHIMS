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
            'absolute top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-white p-4 text-left text-xs font-normal normal-case leading-5 tracking-normal text-brand-navy shadow-lg sm:w-80',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </span>
      )}
    </span>
  )
}

/** Labeled explanation of a generated code: title, description, format, example, note. */
export function CodeHelp({ title, description, format, example, note }: {
  title: string; description: ReactNode; format: string; example: string; note: ReactNode
}) {
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-brand-muted'
  const chip = 'mt-0.5 inline-block rounded-md bg-brand-ice px-1.5 py-0.5 font-mono text-[11px] text-brand-navy ring-1 ring-inset ring-brand-line'
  return (
    <span className="block space-y-2.5">
      <span className="block text-sm font-bold text-brand-navy">{title}</span>
      <span className="block text-brand-navy/90">{description}</span>
      <span className="block"><span className={label}>Format</span><code className={chip}>{format}</code></span>
      <span className="block"><span className={label}>Example</span><code className={chip}>{example}</code></span>
      <span className="block border-t border-border pt-2 text-brand-muted">{note}</span>
    </span>
  )
}

/** The two explanations used across Child Profiling. */
export const CHILD_ID_HELP = (
  <CodeHelp
    title="Child ID"
    description="A unique number assigned by the system to each registered child."
    format="ECH-[year registered]-[6-digit number]"
    example="ECH-2026-000027"
    note="This number is permanent and cannot be edited."
  />
)
export const FSN_HELP = (
  <CodeHelp
    title="Family Serial Number (FSN)"
    description="A number shared by all children in the same household. It helps tell apart families with similar surnames."
    format="FSN-[barangay code]-[number]"
    example="FSN-0501603001-0001"
    note={<>Siblings have the same FSN. This is the &ldquo;Family no.&rdquo; on the DOH Child Immunization Record card.</>}
  />
)
