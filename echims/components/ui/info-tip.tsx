'use client'

// Small ⓘ button with a short explanation. Opens on mouse hover and keyboard focus, toggles on
// tap (touch screens), closes on Esc, blur or a tap elsewhere.
//   <InfoTip label="About Child ID">A unique ID the system gives every registered child…</InfoTip>
// The bubble is rendered in a portal on <body>, so table headers (uppercase, nowrap, overflow)
// never clip or restyle it: fixed 320px width (max 100vw − 32px), normal wrapping, below the
// icon or above when there is no room, shifted to stay on screen, with an arrow at the icon.
// Content follows the system format (INV-REV01): use <InfoContent> (bold title, one-line
// description, FORMAT / EXAMPLE / VALUES / TIP sections, optional bullets and a footer note).

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const WIDTH = 320
const MARGIN = 16

export function InfoTip({ label, children, className, align = 'start', text }: {
  /** Accessible name of the button, e.g. "About Child ID". */
  label: string
  children: ReactNode
  className?: string
  /** Preferred side: the bubble starts at the icon (start) or ends at it (end); it still shifts to fit. */
  align?: 'start' | 'end'
  /** Visible text after the icon, e.g. "About this view" (link colour, 13px semibold). It is then the button's name. */
  text?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const box = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ style: CSSProperties; arrowLeft: number; up: boolean } | null>(null)
  // A tap fires focus then click; a click right after an open must not close it again.
  const openedAt = useRef(0)
  // Hover close waits briefly, so moving from the icon onto the bubble (a portal) does not flicker it.
  const closeTimer = useRef<number | undefined>(undefined)
  const cancelClose = () => window.clearTimeout(closeTimer.current)
  const show = () => { cancelClose(); if (!open) openedAt.current = Date.now(); setOpen(true) }
  const hide = () => { cancelClose(); setOpen(false); setPos(null) }
  const hideSoon = () => { cancelClose(); closeTimer.current = window.setTimeout(hide, 120) }
  useEffect(() => cancelClose, [])

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !bubble.current?.contains(t)) { window.clearTimeout(closeTimer.current); setOpen(false); setPos(null) }
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
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideSoon() }}>
      <button
        ref={button}
        type="button"
        aria-label={text ? undefined : label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); if (open && Date.now() - openedAt.current < 400) return; if (open) hide(); else show() }}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); hide() } }}
        className={text
          ? 'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded text-[13px] font-semibold text-link outline-none hover:underline focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-link'
          : 'inline-flex size-5 items-center justify-center rounded-full text-brand-muted hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-ring'}
      >
        <Info size={14} aria-hidden="true" />
        {text}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          style={pos?.style ?? { position: 'fixed', left: 0, top: 0, width: Math.min(WIDTH, window.innerWidth - MARGIN * 2), visibility: 'hidden' }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') cancelClose() }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') hideSoon() }}
          className={cn(
            'z-[90] block whitespace-normal break-words rounded-xl border border-[#D5E2EA] bg-white p-4 text-left text-[13px] font-normal normal-case leading-[1.5] tracking-normal text-[#1E2A55] shadow-[0_4px_16px_rgba(12,18,96,0.12)] [overflow-wrap:anywhere]',
            // Soft entrance: fade with a 4px drift from the icon's side; none with reduced motion.
            'animate-in fade-in duration-150 ease-out motion-reduce:animate-none',
            pos?.up ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1',
          )}
        >
          {pos && (
            <span aria-hidden="true" style={{ left: pos.arrowLeft }}
              className={cn('absolute size-2.5 -translate-x-1/2 rotate-45 border-[#D5E2EA] bg-white', pos.up ? '-bottom-[6px] border-b border-r' : '-top-[6px] border-l border-t')} />
          )}
          {children}
        </span>,
        document.body,
      )}
    </span>
  )
}

export type InfoSection = {
  label: 'Scope' | 'Format' | 'Example' | 'Values' | 'Tip'
  /** One value, or several lines (Values: one per line). */
  value: ReactNode | ReactNode[]
}

/** The system info-popup format: bold title, a one-line description, labeled sections (FORMAT and
 *  EXAMPLE as mono chips; VALUES and TIP as a gray box), optional bullets, then a footer note. Use it
 *  as InfoTip / SectionHeader `about` content. A one-liner is just title + description. */
export function InfoContent({ title, description, sections = [], bullets = [], note }: {
  title: ReactNode
  description: ReactNode
  sections?: InfoSection[]
  bullets?: ReactNode[]
  note?: ReactNode
}) {
  return (
    <span className="block">
      <span className="mb-1.5 block text-sm font-bold text-[#0C1260]">{title}</span>
      <span className="block text-[#55617F]">{description}</span>
      {sections.map((section) => {
        const lines = Array.isArray(section.value) ? section.value : [section.value]
        const code = section.label === 'Format' || section.label === 'Example'
        return (
          <span key={section.label} className="block">
            <span className="mb-1 mt-2.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-[#8896B0]">{section.label}</span>
            {code ? (
              <code className="inline-block rounded-md bg-[#F0F2F5] px-2.5 py-1 font-mono text-xs text-[#0C1260] [font-family:'SF_Mono','Fira_Code',ui-monospace,monospace]">{lines[0]}</code>
            ) : (
              <span className="block rounded-md bg-[#F0F2F5] px-2.5 py-1.5 text-xs text-[#0C1260]">
                {lines.map((line, i) => <span key={i} className="block">{line}</span>)}
              </span>
            )}
          </span>
        )
      })}
      {bullets.length > 0 && (
        <span className="mt-2.5 block space-y-1 text-[#55617F]">
          {bullets.map((bullet, i) => (
            <span key={i} className="flex gap-1.5"><span aria-hidden="true" className="text-[#8896B0]">•</span><span>{bullet}</span></span>
          ))}
        </span>
      )}
      {note && <span className="mt-2.5 block border-t border-[#EAF0F4] pt-2 text-xs text-[#8896B0]">{note}</span>}
    </span>
  )
}

/** Labeled explanation of a generated code: title, description, format, example, note. */
export function CodeHelp({ title, description, format, example, note }: {
  title: string; description: ReactNode; format: string; example: string; note: ReactNode
}) {
  return <InfoContent title={title} description={description} sections={[{ label: 'Format', value: format }, { label: 'Example', value: example }]} note={note} />
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
