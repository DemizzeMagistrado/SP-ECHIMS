'use client'

// Shared pagination: 6 items per page everywhere (PAGE_SIZE), Previous / Next with chevrons,
// page numbers with the current one filled, "Showing 1–6 of 42"; on phones "Prev · 1/7 · Next".
//   const { visible, bindList, listStyle, props } = usePagination(rows)
//   <div ref={bindList} style={listStyle}>{visible.map(...)}</div>
//   <Pagination {...props} />   // destructure: the React compiler lint treats pager.bindList as a ref read
// Changing page keeps the list height steady (no jump on a short last page) and scrolls back to
// the top of the list (not the page) when the list top is off screen.

import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export const PAGE_SIZE = 6

export function usePagination<T>(rows: T[], pageSize = PAGE_SIZE) {
  const [page, setPageState] = useState(0)
  const [minHeight, setMinHeight] = useState<number | undefined>()
  // The list element lives in state (not a ref) so the returned object is safe to read in render.
  const [listEl, setListEl] = useState<HTMLElement | null>(null)
  const size = pageSize > 0 ? pageSize : rows.length || 1
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(page, pageCount - 1)

  // A new data set (filter/search) starts on page 1 with its own height (reset during render).
  const [seenLength, setSeenLength] = useState(rows.length)
  if (seenLength !== rows.length) { setSeenLength(rows.length); setPageState(0); setMinHeight(undefined) }

  const setPage = useCallback((next: number) => {
    const el = listEl
    if (el) {
      setMinHeight((h) => Math.max(h ?? 0, el.offsetHeight))
      el.querySelectorAll<HTMLElement>('.scroll-subtle').forEach((box) => { box.scrollTop = 0 })
      if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    setPageState(next)
  }, [listEl])

  const visible = useMemo(() => (pageSize > 0 ? rows.slice(current * size, current * size + size) : rows), [rows, current, size, pageSize])
  const listStyle: CSSProperties | undefined = minHeight && pageCount > 1 ? { minHeight } : undefined

  return {
    page: current, setPage, visible, pageCount, listStyle,
    /** Callback ref for the list's outer element (any element type). */
    bindList: setListEl as (el: HTMLElement | null) => void,
    props: { page: current, pageCount, total: rows.length, pageSize: size, onChange: setPage },
  }
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
  if (total <= pageSize) return null
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  const first = page === 0
  const last = page >= pageCount - 1
  return (
    <nav aria-label={label} className={cn('flex items-center justify-between gap-3 border-t border-brand-line px-4 py-3 text-sm', className)}>
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
