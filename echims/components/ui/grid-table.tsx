'use client'
// Shared data table (ACT-REV01 / INV-REV01 spec): #D5E2EA card, 12px radius; #F5F8FA header, 11px
// uppercase 700 #55617F, 2px rule; #EAF0F4 row lines; zebra on every cell (#FFFFFF / #F9FBFC) so a
// sticky Actions cell matches its row; hover #F2F7FB with a navy accent on the first cell; 12px 16px
// cells; 10 rows per page with the shared pager. Use with RowButton for "View details ›".
//   <GridTable rows={rows} rowKey={(r) => r.id} columns={[{ key: 'item', header: 'Item', cell: (r) => r.name }]} />
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination, usePagination } from '@/components/ui/pagination'

export type GridColumn<T> = {
  key: string
  header: ReactNode
  cell: (row: T, index: number) => ReactNode
  /** e.g. '24%'; with any width set the table uses table-layout: fixed. */
  width?: string
  align?: 'left' | 'right'
  /** The right-most Actions column: sticky on scroll. */
  sticky?: boolean
}

export const GRID_PAGE_SIZE = 5

export function GridTable<T>({ rows, columns, rowKey, onRowClick, empty, caption, title, minWidth = 860, pageSize = GRID_PAGE_SIZE, className }: {
  rows: T[]
  columns: GridColumn<T>[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  empty: { icon: LucideIcon; title: string; description?: string }
  caption?: string
  /** Visible heading bar inside the card, directly above the table. */
  title?: ReactNode
  /** The box scrolls sideways below this width instead of the page. */
  minWidth?: number
  pageSize?: number
  className?: string
}) {
  const { visible, props: pager } = usePagination(rows, pageSize)
  const fixed = columns.some((c) => c.width)

  return (
    <section aria-label={caption} className={cn('overflow-hidden rounded-xl border border-[#D5E2EA] bg-white', className)}>
      {title && <h3 className="flex items-center gap-2 border-b border-[#D5E2EA] px-4 py-2.5 text-sm font-semibold text-[#0C1260]">{title}</h3>}
      <div className="scroll-subtle overflow-x-auto">
        <table className={cn('w-full border-collapse text-sm', fixed && 'table-fixed')} style={{ minWidth }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          {fixed && <colgroup>{columns.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}</colgroup>}
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'border-b-2 border-[#D5E2EA] bg-[#F5F8FA] px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.5px] text-[#55617F]',
                    c.align === 'right' && 'text-right',
                    c.sticky && 'sticky right-0 z-[2] text-right',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length}><EmptyState icon={empty.icon} title={empty.title} description={empty.description} /></td></tr>
            ) : visible.map((row, i) => {
              const last = i === visible.length - 1
              const td = cn(
                'px-4 py-3 align-top text-[13px] text-[#1E2A55] transition-colors duration-[120ms] group-hover:!bg-[#F2F7FB]',
                i % 2 === 1 ? 'bg-[#F9FBFC]' : 'bg-white',
                !last && 'border-b border-[#EAF0F4]',
              )
              return (
                <tr key={rowKey(row)} className={cn('group', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                  {columns.map((c, ci) => (
                    <td
                      key={c.key}
                      className={cn(
                        td,
                        ci === 0 && 'group-hover:shadow-[inset_3px_0_0_#07075F]',
                        c.align === 'right' && 'text-right tabular-nums',
                        c.sticky && 'sticky right-0 z-[1] text-right shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.12)]',
                      )}
                    >
                      {c.cell(row, i)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination {...pager} label={caption ? `${caption} pages` : 'Pages'} />
    </section>
  )
}

/** "View details ›": the outline row button (full width on cards with className="w-full"). */
export function RowButton({ className, children = 'View details', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 cursor-pointer items-center justify-center gap-[5px] whitespace-nowrap rounded-lg border border-[#BFD3DE] bg-white px-3 text-[13px] font-medium text-[#0C1260] transition-colors duration-[120ms] hover:border-[#07075F] hover:bg-[#E6F1F7] hover:text-[#07075F] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[#0B759A] disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  )
}
