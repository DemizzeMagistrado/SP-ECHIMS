'use client'

// A panel anchored to a trigger, rendered in a portal on <body> so cards/modals never clip it.
// Always opens below the trigger (never flips above). When there is too little room below, the
// trigger is first scrolled toward the middle of its scroll box so the list has space. The panel
// stays inside the viewport (8px margin) and follows scroll/resize. Closes on an outside press, and
// opening one panel closes any other (one dropdown at a time). Used by Select, Combobox and
// DatePicker. `fit` (DatePicker) never clips or scrolls the content: below if it fits, else shifted
// up just enough to stay fully on screen.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const MARGIN = 8
// Less room than this below the trigger (about 5 options): scroll the trigger up first.
const MIN_BELOW = 200
// The open panel's close function: opening another panel closes it first.
let closeOpenPanel: (() => void) | null = null

export function FloatingPanel({ anchor, open, onClose, children, minWidth = 0, maxHeight = 320, width: fixedWidth, fit = false, className, id, sheetOnMobile = false, label }: {
  anchor: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: ReactNode
  minWidth?: number
  maxHeight?: number
  /** Fixed width in px (left edge stays aligned to the anchor) instead of the anchor's width. */
  width?: number
  /** Show the whole content, never an inner scrollbar (see above). */
  fit?: boolean
  className?: string
  id?: string
  /** Below sm: a bottom sheet with a backdrop instead of an anchored panel. */
  sheetOnMobile?: boolean
  label?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  // Hidden but already fixed and sized, so the first measurement matches the final layout.
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden', position: 'fixed', top: 0, left: 0, width: fixedWidth })
  const [sheet, setSheet] = useState(false)
  // Latest onClose, so the one-at-a-time hook below does not re-run on every render.
  const closeRef = useRef(onClose)
  useLayoutEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!open) return
    const close = () => closeRef.current()
    if (closeOpenPanel && closeOpenPanel !== close) closeOpenPanel()
    closeOpenPanel = close
    return () => { if (closeOpenPanel === close) closeOpenPanel = null }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    // Too little room below: bring the trigger up once, before the first placement.
    const first = anchor.current?.getBoundingClientRect()
    if (first && !(sheetOnMobile && window.innerWidth < 640) && window.innerHeight - first.bottom - MARGIN * 2 < MIN_BELOW)
      anchor.current?.scrollIntoView({ block: 'center' })
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const p = panel.current
      if (!a || !p) return
      const vw = window.innerWidth, vh = window.innerHeight
      if (sheetOnMobile && vw < 640) { setSheet(true); setStyle({}); return }
      setSheet(false)
      const width = Math.min(fixedWidth ?? Math.max(a.width, minWidth), vw - MARGIN * 2)
      const left = Math.min(Math.max(a.left, MARGIN), vw - width - MARGIN)
      if (fit) {
        const h = Math.min(p.scrollHeight + 2, vh - MARGIN * 2) // +2: the panel border
        const top = a.bottom + 4 + h <= vh - MARGIN ? a.bottom + 4 : Math.max(MARGIN, vh - MARGIN - h)
        setStyle({ position: 'fixed', left, width, top, maxHeight: h })
        return
      }
      const below = vh - a.bottom - MARGIN * 2
      const natural = Math.min(p.scrollHeight, maxHeight)
      setStyle({ position: 'fixed', left, width, top: a.bottom + 4, maxHeight: Math.max(Math.min(natural, below), 120) })
    }
    place()
    // Content changes (search filtering, month switch) re-place without a render loop.
    const observer = new ResizeObserver(place)
    if (panel.current?.firstElementChild) observer.observe(panel.current.firstElementChild)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, anchor, minWidth, maxHeight, fixedWidth, fit, sheetOnMobile])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, onClose, anchor])

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <>
      {sheet && <div aria-hidden="true" className="fixed inset-0 z-[79] bg-brand-navy/30 animate-in fade-in duration-200" />}
      <div
        ref={panel}
        id={id}
        aria-label={label}
        style={style}
        className={cn(
          'scroll-subtle z-[80] overflow-auto rounded-xl border border-brand-line bg-white text-sm text-brand-navy shadow-[0_16px_40px_-12px_rgba(3,4,94,0.28)] outline-none animate-in fade-in duration-150 ease-out motion-reduce:animate-none',
          // Drops down from the trigger (a short slide, no zoom); phones' bottom sheet slides up.
          sheet ? 'fixed inset-x-0 bottom-0 max-h-[85vh] rounded-b-none rounded-t-2xl pb-[env(safe-area-inset-bottom)] slide-in-from-bottom-8' : 'origin-top slide-in-from-top-1',
          className,
        )}
      >
        <div>{children}</div>
      </div>
    </>,
    document.body,
  )
}
