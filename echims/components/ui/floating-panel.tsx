'use client'

// A panel anchored to a trigger, rendered in a portal on <body> so cards/modals never clip it.
// Opens below the trigger, flips above when there is more room there, stays inside the viewport
// (8px margin) and follows scroll/resize. Closes on an outside press. Used by Select, Combobox and
// DatePicker. `fit` (DatePicker) never clips or scrolls the content: below if it fits, else above,
// else shifted up just enough to stay fully on screen.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const MARGIN = 8

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

  useLayoutEffect(() => {
    if (!open) return
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
        const top = a.bottom + 4 + h <= vh - MARGIN ? a.bottom + 4
          : a.top - 4 - h >= MARGIN ? a.top - 4 - h
          : Math.max(MARGIN, vh - MARGIN - h)
        setStyle({ position: 'fixed', left, width, top, maxHeight: h })
        return
      }
      const below = vh - a.bottom - MARGIN * 2
      const above = a.top - MARGIN * 2
      const natural = Math.min(p.scrollHeight, maxHeight)
      const up = below < natural && above > below
      const height = Math.min(natural, up ? above : below)
      setStyle({ position: 'fixed', left, width, maxHeight: Math.max(height, 120), ...(up ? { bottom: vh - a.top + 4 } : { top: a.bottom + 4 }) })
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
          'scroll-subtle z-[80] overflow-auto rounded-xl border border-brand-line bg-white text-sm text-brand-navy shadow-[0_16px_40px_-12px_rgba(3,4,94,0.28)] outline-none animate-in fade-in zoom-in-95 duration-150',
          sheet && 'fixed inset-x-0 bottom-0 max-h-[85vh] rounded-b-none rounded-t-2xl pb-[env(safe-area-inset-bottom)] slide-in-from-bottom-8 zoom-in-100',
          className,
        )}
      >
        <div>{children}</div>
      </div>
    </>,
    document.body,
  )
}
