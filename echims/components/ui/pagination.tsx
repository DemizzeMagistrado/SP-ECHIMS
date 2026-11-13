'use client'

// Shared pagination: 6 items per page everywhere (PAGE_SIZE), Previous / Next with chevrons,
// page numbers with the current one filled, "Showing 1–6 of 42"; on phones "Prev · 1/7 · Next".
//   const { visible, bindList, listStyle, props } = usePagination(rows)
//   <div ref={bindList} style={listStyle}>{visible.map(...)}</div>
//   <Pagination {...props} />   // destructure: the React compiler lint treats pager.bindList as a ref read
// Changing page keeps the list height steady (no jump on a short last page) and scrolls back to
// the top of the list (not the page) when the list top is off screen.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export const PAGE_SIZE = 6

/** `control` keeps the page outside (e.g. useSessionState, so Back returns to the same page). The
 *  caller then resets it when filters change; it is only clamped here. */
export function usePagination<T>(rows: T[], pageSize = PAGE_SIZE, control?: { page: number; onPageChange: (page: number) => void }) {
  const [ownPage, setPageState] = useState(0)
  const page = control ? control.page : ownPage
  const [minHeight, setMinHeight] = useState<number | undefined>()
  // The list element lives in state (not a ref) so the returned object is safe to read in render.
  const [listEl, setListEl] = useState<HTMLElement | null>(null)
  const size = pageSize > 0 ? pageSize : rows.length || 1
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(page, pageCount - 1)

  // A new data set (filter/search) starts on page 1 with its own height (reset during render).
  const [seenLength, setSeenLength] = useState(rows.length)
  if (seenLength !== rows.length) { setSeenLength(rows.length); if (!control) setPageState(0); setMinHeight(undefined) }

  const setPage = useCallback((next: number) => {
    const el = listEl
    if (el) {
      setMinHeight((h) => Math.max(h ?? 0, el.offsetHeight))
      // The list itself may be the scroll box (a stable-height card list), or hold one.
      ;[el, ...el.querySelectorAll<HTMLElement>('.scroll-subtle')].forEach((box) => { box.scrollTop = 0 })
      if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    if (control) control.onPageChange(next)
    else setPageState(next)
  }, [listEl, control])

  const visible = useMemo(() => (pageSize > 0 ? rows.slice(current * size, current * size + size) : rows), [rows, current, size, pageSize])
  const listStyle: CSSProperties | undefined = minHeight && pageCount > 1 ? { minHeight } : undefined

  return {
    page: current, setPage, visible, pageCount, listStyle,
    /** Callback ref for the list's outer element (any element type). */
    bindList: setListEl as (el: HTMLElement | null) => void,
    props: { page: current, pageCount, total: rows.length, pageSize: size, onChange: setPage },
  }
}

/** Stable height for a paginated list: every page is as tall as a full page, so a short last page
 *  leaves empty space instead of shrinking and the pager stays put. Bind `bindArea` to the list
 *  area and apply `height` (min-height for plain rows, a fixed height for expandable rows).
 *  Only lists with more than one page reserve it (pass enabled = pageCount > 1): a list that fits
 *  on one page is sized to its rows. Keep the reserved space see-through (white on the rows and
 *  the pager, not the frame), so a short last page shows the page background, not a filler box.
 *  The pager is never part of the area: render <Pagination> after it, so it always stays visible.
 *  Without `measure`: the area's own height, read only while `canMeasure` (pass "this page is
 *  full") and kept as the tallest seen, since a short page cannot be measured.
 *  shortcut: that default only grows (a wide-to-narrow resize stays tall), reset on remount.
 *  With `measure` (e.g. collapsedRowsHeight, which works on any page and ignores open rows): the
 *  exact current value, re-measured after every render and on resize, so it also shrinks. */
export function useStableHeight(enabled: boolean, canMeasure = true, measure?: (el: HTMLElement) => number) {
  const [area, setArea] = useState<HTMLElement | null>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (!enabled || !area || !canMeasure) return
    // observe() reports the current size right away, so this also measures after each render.
    const observer = new ResizeObserver(() => setHeight((h) => measure ? Math.ceil(measure(area)) : Math.max(h, area.offsetHeight)))
    observer.observe(area)
    return () => observer.disconnect()
  })
  return { bindArea: setArea as (el: HTMLElement | null) => void, height: enabled ? height : 0 }
}

/** Height of `rows` collapsed accordion rows (AccordionCard), with the list's gaps and padding:
 *  the tallest collapsed header × rows, so expanding a row never changes it. */
export function collapsedRowsHeight(list: HTMLElement, rows = PAGE_SIZE) {
  const items = Array.from(list.children) as HTMLElement[]
  if (!items.length) return 0
  const row = Math.max(...items.map((li) => {
    const header = li.querySelector<HTMLElement>('[data-accordion-header]')
    return header ? header.offsetHeight + (li.offsetHeight - li.clientHeight) : li.offsetHeight
  }))
  // From positions, not margins: space-y-* puts the gap on margin-bottom (Tailwind v4).
  const gap = items[1] ? Math.max(0, items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().bottom) : 0
  const box = getComputedStyle(list)
  return row * rows + gap * (rows - 1) + (parseFloat(box.paddingTop) || 0) + (parseFloat(box.paddingBottom) || 0)
}

function pageList(current: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)
  const set = new Set([0, count - 1, current - 1, current, current + 1].filter((p) => p >= 0 && p < count))
  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  sorted.forEach((p, i) => { if (i && p - sorted[i - 1] > 1) out.push('gap'); out.push(p) })
  return out
}

export function Pagination({ page, pageCount, total, pageSize, onChange, label = 'Pages', className }: {
  page: number; pageCount: number; total: number; pageSize: number; onChange: (page: number) => void; label?: string; className?: string
}) {
  // Always shown once there are rows (also on a single page, with Previous / Next disabled).
  if (total === 0) return null
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  const first = page === 0
  const last = page >= pageCount - 1
  return (
    <nav aria-label={label} className={cn('flex items-center justify-between gap-3 border-t border-brand-line bg-white px-4 py-3 text-sm', className)}>
      <p className="hidden whitespace-nowrap text-brand-muted sm:block" aria-live="polite">
        Showing <span className="font-semibold text-brand-navy">{from}–{to}</span> of <span className="font-semibold text-brand-navy">{total}</span>
      </p>
      <div className="flex w-full items-center justify-between gap-1.5 sm:w-auto sm:justify-end">
        <Button variant="secondary" size="sm" disabled={first} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft size={15} aria-hidden="true" /><span className="hidden sm:inline">Previous</span><span className="sm:hidden">Prev</span>
        </Button>
        <span className="px-2 font-semibold tabular-nums text-brand-navy sm:hidden" aria-live="polite">{page + 1}/{pageCount}</span>
        <ul className="hidden items-center gap-1 sm:flex">
          {pageList(page, pageCount).map((p, i) => p === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-brand-muted">…</li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p + 1}`}
                className={cn(
                  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40',
                  p === page ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-brand-ice',
                )}
              >{p + 1}</button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" disabled={last} onClick={() => onChange(page + 1)} aria-label="Next page">
          <span>Next</span><ChevronRight size={15} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
