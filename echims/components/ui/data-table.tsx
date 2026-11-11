'use client'

// Client-side table: sticky header, sortable columns, pagination, right-aligned numbers, an
// EmptyState when there are no rows, and in-place refresh (rows stay and dim while refetching).
//   <DataTable rows={rows} rowKey={(r) => r.id} columns={[
//     { key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
//     { key: 'qty', header: 'Qty', cell: (r) => r.qty, sortValue: (r) => r.qty, align: 'right' },
//   ]} empty={{ title: 'No stock yet', description: '…' }} toolbar={<SearchInput … />} />

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { EmptyState } from './empty-state'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined
  align?: 'left' | 'right'
  className?: string
}

type Props<T> = {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  caption?: string
  toolbar?: ReactNode
  empty?: Parameters<typeof EmptyState>[0]
  /** A refetch is running behind rows already on screen. */
  refreshing?: boolean
  onRowClick?: (row: T) => void
  /** 0 turns pagination off. */
  pageSize?: number
  /** scroll = horizontal scroll on narrow screens; cards = one card per row below sm. */
  mobile?: 'scroll' | 'cards'
  className?: string
}

const PAGE_SIZES = [10, 25, 50, 100]

export function DataTable<T>({
  rows, columns, rowKey, caption, toolbar, empty, refreshing = false, onRowClick, pageSize: initialSize = 25, mobile = 'scroll', className,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [size, setSize] = useState(initialSize)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const get = col.sortValue
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b)
      if (x == null || x === '') return 1 // blanks last either way
      if (y == null || y === '') return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir
    })
  }, [rows, columns, sort])

  const pages = size > 0 ? Math.max(1, Math.ceil(sorted.length / size)) : 1
  const current = Math.min(page, pages - 1)
  const visible = size > 0 ? sorted.slice(current * size, current * size + size) : sorted

  const toggle = (key: string) => {
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))
    setPage(0)
  }
  const align = (c: Column<T>) => (c.align === 'right' ? 'text-right tabular-nums' : 'text-left')

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm', className)}>
      {toolbar && <div className="flex flex-col gap-3 border-b border-brand-line p-4 md:flex-row md:items-center">{toolbar}</div>}

      {rows.length === 0 ? (
        <EmptyState {...(empty ?? { title: 'Nothing to show yet' })} />
      ) : (
        <div className={cn('transition-opacity duration-200', refreshing && 'opacity-60')} aria-busy={refreshing || undefined}>
          {/* Sticky header: the scroll box is capped in height so the header has something to stick to. */}
          <div className={cn('scroll-subtle max-h-[70vh] overflow-auto', mobile === 'cards' && 'hidden sm:block')}>
            <table className="w-full border-separate border-spacing-0 text-sm">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead>
                <tr>
                  {columns.map((c) => {
                    const active = sort?.key === c.key
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}
                        className={cn('sticky top-0 z-[1] border-b border-brand-line bg-brand-ice px-4 py-3 text-xs font-semibold uppercase tracking-wide text-brand-muted', align(c), c.className)}
                      >
                        {c.sortValue ? (
                          <button type="button" onClick={() => toggle(c.key)} className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase hover:text-brand-navy focus-visible:outline-2 focus-visible:outline-ring', active && 'text-brand-navy')}>
                            {c.header}
                            {active ? (sort.dir === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />) : <ArrowUpDown size={13} aria-hidden="true" className="opacity-50" />}
                          </button>
                        ) : c.header}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('transition-colors hover:bg-brand-ice/60 [&:last-child>td]:border-b-0', onRowClick && 'cursor-pointer')}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('border-b border-brand-line/70 px-4 py-3.5 align-middle text-brand-navy', align(c), c.className)}>{c.cell(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mobile === 'cards' && (
            <ul className="divide-y divide-brand-line sm:hidden">
              {visible.map((row) => (
                <li key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cn('space-y-1.5 p-4', onRowClick && 'cursor-pointer active:bg-brand-ice/60')}>
                  {columns.map((c) => (
                    <div key={c.key} className="flex items-start justify-between gap-4 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">{c.header}</span>
                      <span className={cn('text-right text-brand-navy', c.align === 'right' && 'tabular-nums')}>{c.cell(row)}</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}

          {size > 0 && sorted.length > PAGE_SIZES[0] && (
            <nav aria-label="Table pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-line px-4 py-3 text-sm text-brand-muted">
              <label className="flex items-center gap-2">
                Rows per page
                <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }} className="h-8 rounded-lg border border-brand-line bg-white px-2 text-brand-navy outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/20">
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <span className="mr-2" aria-live="polite">{current * size + 1}–{Math.min(sorted.length, (current + 1) * size)} of {sorted.length}</span>
                <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded-lg p-1.5 hover:bg-brand-ice disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"><ChevronLeft size={16} aria-hidden="true" /></button>
                <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded-lg p-1.5 hover:bg-brand-ice disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"><ChevronRight size={16} aria-hidden="true" /></button>
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
