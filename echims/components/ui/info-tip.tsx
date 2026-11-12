'use client'

// Small ⓘ button with a short explanation. Opens on mouse hover and keyboard focus, toggles on
// tap (touch screens), closes on Esc, blur or a tap elsewhere.
//   <InfoTip label="About Child ID">A unique ID the system gives every registered child…</InfoTip>
// The bubble is rendered in a portal on <body>, so table headers (uppercase, nowrap, overflow)
// never clip or restyle it: fixed 312px width (max 100vw − 32px), normal wrapping, below the
// icon or above when there is no room, shifted to stay on screen, with an arrow at the icon.

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const WIDTH = 312
const MARGIN = 16

export function InfoTip({ label, children, className, align = 'start' }: {
  /** Accessible name of the button, e.g. "About Child ID". */
  label: string
  children: ReactNode
  className?: string
  /** Preferred side: the bubble starts at the icon (start) or ends at it (end); it still shifts to fit. */
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const box = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ style: CSSProperties; arrowLeft: number; up: boolean } | null>(null)
  // A tap fires focus then click; a click right after an open must not close it again.
  const openedAt = useRef(0)
  const show = () => { openedAt.current = Date.now(); setOpen(true) }
  const hide = () => { setOpen(false); setPos(null) }

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !bubble.current?.contains(t)) hide()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const b = button.current?.getBoundingClientRect()
      const el = bubble.current
      if (!b || !el) return
      const vw = window.innerWidth, vh = window.innerHeight
      const width = Math.min(WIDTH, vw - MARGIN * 2)
      const center = b.left + b.width / 2
      const preferred = align === 'end' ? b.right + 12 - width : b.left - 12
      const left = Math.min(Math.max(preferred, MARGIN), vw - width - MARGIN)
      const h = el.offsetHeight
      const up = b.bottom + 10 + h > vh - 8 && b.top - 10 - h > 8
      setPos({
        style: { position: 'fixed', left, width, ...(up ? { top: b.top - 10 - h } : { top: b.bottom + 10 }) },
        arrowLeft: Math.min(Math.max(center - left, 14), width - 14),
        up,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, align])

  return (
    <span ref={box} className={cn('relative inline-flex align-middle normal-case tracking-normal', className)}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') show() }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') hide() }}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); if (open && Date.now() - openedAt.current < 400) return; if (open) hide(); else show() }}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); hide() } }}
        className="inline-flex size-5 items-center justify-center rounded-full text-brand-muted hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          style={pos?.style ?? { position: 'fixed', left: 0, top: 0, width: Math.min(WIDTH, window.innerWidth - MARGIN * 2), visibility: 'hidden' }}
          className="z-[90] block whitespace-normal break-words rounded-xl border border-border bg-white p-4 text-left text-xs font-normal normal-case leading-5 tracking-normal text-brand-navy shadow-lg [overflow-wrap:anywhere] animate-in fade-in duration-100"
        >
          {pos && (
            <span aria-hidden="true" style={{ left: pos.arrowLeft }}
              className={cn('absolute size-2.5 -translate-x-1/2 rotate-45 border-border bg-white', pos.up ? '-bottom-[6px] border-b border-r' : '-top-[6px] border-l border-t')} />
          )}
          {children}
        </span>,
        document.body,
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
