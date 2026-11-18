'use client'

// Client-side table: sticky header, sortable columns, pagination, right-aligned numbers, an
// EmptyState when there are no rows, and in-place refresh (rows stay and dim while refetching).
//   <DataTable rows={rows} rowKey={(r) => r.id} columns={[
//     { key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
//     { key: 'qty', header: 'Qty', cell: (r) => r.qty, sortValue: (r) => r.qty, align: 'right' },
//   ]} empty={{ title: 'No stock yet', description: '…' }} toolbar={<SearchInput … />} />

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react'
import { EmptyState } from './empty-state'
import { PAGE_SIZE, Pagination, usePagination, useStableHeight } from './pagination'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Shown after the header (outside the sort button), e.g. an <InfoTip>. */
  headerExtra?: ReactNode
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
  /** Accessible name for an openable row, e.g. "Open Juan Dela Cruz's profile". */
  rowLabel?: (row: T) => string
  /** Items per page (default and max: 6, the shared PAGE_SIZE); 0 turns pagination off. */
  pageSize?: number
  /** scroll = horizontal scroll on narrow screens; cards = one card per row below sm. */
  mobile?: 'scroll' | 'cards'
  /** Keep the rows area as tall as a full page on every page (short last page = blank space), so
   *  the pagination bar stays put at the bottom of the card. */
  stableHeight?: boolean
  /** Controlled page (0-based), e.g. kept in useSessionState so Back returns to it. */
  page?: number
  onPageChange?: (page: number) => void
  className?: string
}

export function DataTable<T>({
  rows, columns, rowKey, caption, toolbar, empty, refreshing = false, onRowClick, rowLabel, pageSize = PAGE_SIZE, mobile = 'scroll', stableHeight = false, page, onPageChange, className,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)

  // Openable rows: whole row clicks, Enter/Space from the keyboard, but links/buttons inside the
  // row keep their own action.
  const openable = 'group cursor-pointer outline-none hover:bg-brand-ice/70 hover:shadow-[0_2px_8px_-4px_rgba(3,4,94,0.18)] focus-visible:bg-brand-ice/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-brand-ice'
  const rowProps = (row: T) => onRowClick ? {
    tabIndex: 0,
    'aria-label': rowLabel?.(row),
    onClick: (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label')) return
      onRowClick(row)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      onRowClick(row)
    },
  } : {}

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

  const control = useMemo(() => (page !== undefined && onPageChange ? { page, onPageChange } : undefined), [page, onPageChange])
  const { visible, setPage, bindList, listStyle, props: pagerProps } = usePagination(sorted, Math.min(pageSize, PAGE_SIZE), control)

  // stableHeight: every page gets the height of a full page (shared with card lists).
  const { bindArea: setArea, height: areaMin } = useStableHeight(stableHeight, visible.length >= pagerProps.pageSize)
  const areaStyle = stableHeight ? (pagerProps.pageCount > 1 && areaMin ? { minHeight: areaMin } : undefined) : listStyle

  const toggle = (key: string) => {
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))
    setPage(0)
  }
  const align = (c: Column<T>) => (c.align === 'right' ? 'text-right tabular-nums' : 'text-left')

  return (
    // stableHeight: white sits on the rows, toolbar and pager, so a short last page's reserved space
    // shows the page background instead of a white filler box.
    <div className={cn('overflow-hidden rounded-2xl border border-brand-line shadow-sm', !stableHeight && 'bg-white', className)}>
      {toolbar && <div className="flex flex-col gap-3 border-b border-brand-line bg-white p-4 md:flex-row md:items-center">{toolbar}</div>}

      {rows.length === 0 ? (
        <EmptyState {...(empty ?? { title: 'Nothing to show yet' })} className={cn('bg-white', empty?.className)} />
      ) : (
        <div ref={bindList} className={cn('scroll-mt-4 transition-opacity duration-200', refreshing && 'opacity-60')} aria-busy={refreshing || undefined}>
          <div ref={setArea} style={areaStyle}>
          {/* Sticky header: the scroll box is capped in height so the header has something to stick to. */}
          <div className={cn('scroll-subtle max-h-[70vh] overflow-auto bg-white', mobile === 'cards' && 'hidden sm:block')}>
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
                        {c.headerExtra && <span className="ml-1 inline-flex align-middle">{c.headerExtra}</span>}
                      </th>
                    )
                  })}
                  {onRowClick && <th scope="col" className="sticky top-0 z-[1] w-16 border-b border-brand-line bg-brand-ice"><span className="sr-only">Open</span></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={rowKey(row)}
                    {...rowProps(row)}
                    className={cn('transition-colors [&:last-child>td]:border-b-0', onRowClick ? openable : 'hover:bg-brand-ice/60')}
                  >
                    {columns.map((c, i) => (
                      <td key={c.key} className={cn('border-b border-brand-line/70 px-4 py-3.5 align-middle text-brand-navy', i === 0 && onRowClick && 'border-l-[3px] border-l-transparent group-hover:border-l-primary group-focus-visible:border-l-primary', align(c), c.className)}>{c.cell(row)}</td>
                    ))}
                    {onRowClick && (
                      <td className="border-b border-brand-line/70 px-3 text-right align-middle">
                        <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          View <ChevronRight size={14} />
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {mobile === 'cards' && (
            <ul className="divide-y divide-brand-line bg-white sm:hidden">
              {visible.map((row) => (
                <li key={rowKey(row)} {...rowProps(row)} className={cn('relative space-y-1.5 p-4', onRowClick && cn(openable, 'pr-10'))}>
                  {onRowClick && <ChevronRight size={18} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted group-hover:text-primary" />}
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

          </div>
          {pageSize > 0 && <Pagination {...pagerProps} label="Table pages" />}
        </div>
      )}
    </div>
  )
}
