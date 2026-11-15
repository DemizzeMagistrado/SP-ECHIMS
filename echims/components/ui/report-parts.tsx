'use client'
// Report-page building blocks shared by Nutritional Assessment and Supplementation: card, filter card,
// counts strip, section header ("About this view"), view switcher (pills) and collapsed guidance card.
import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InfoTip } from '@/components/ui/info-tip'

/** Card used by every report block (filters, reports, tables): same radius, border and shadow. */
export const REPORT_CARD = 'overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm'

/** Filter card: Child Profiling's filter container, one row of controls on a shared bottom edge
 *  (gap 16px), Refresh (and any toolbar buttons) pushed right at the select height. The optional
 *  row below holds the counts. */
export function FilterCard({ children, refresh, extra, below }: { children: ReactNode; refresh?: ReactNode; extra?: ReactNode; below?: ReactNode }) {
  return (
    <section aria-label="Filters" className={cn(REPORT_CARD, 'nutrition-no-print')}>
      <div className="flex flex-wrap items-end gap-4 p-4">
        <div className="grid min-w-0 flex-[1_1_28rem] gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        {extra && <div className="flex h-10 items-center">{extra}</div>}
        {refresh && <div className="ml-auto flex flex-wrap items-center gap-2">{refresh}</div>}
      </div>
      {below}
    </section>
  )
}

type CountItem = { label: string; value: number; tone?: 'severe' | 'review'; key?: string }
const COUNT_GRID: Record<number, string> = {
  3: 'grid-cols-1 sm:grid-cols-3',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
}
/** Counts row under the filters (same cells as All assessments): number then label on one baseline,
 *  1px dividers. Zero is grey; severe counts red and review counts amber when not zero. With
 *  onSelect the cells are filter buttons (aria-pressed), like All assessments. */
export function CountsStrip({ label, items, selected, onSelect }: {
  label: string
  items: CountItem[]
  selected?: string
  onSelect?: (key: string) => void
}) {
  const number = (item: CountItem) => cn('text-2xl font-bold tabular-nums', item.value === 0 ? 'text-zero' : item.tone === 'severe' ? 'text-severe' : item.tone === 'review' ? 'text-review' : 'text-brand-navy')
  const span = (i: number) => items.length === 5 && i === 4 && 'col-span-2 lg:col-span-1'
  const grid = cn('grid gap-px border-t border-brand-line/70 bg-brand-line/70', COUNT_GRID[items.length] ?? 'grid-cols-2 sm:grid-cols-4')
  if (onSelect) {
    return (
      <div role="group" aria-label={label} className={grid}>
        {items.map((item, i) => {
          const key = item.key ?? item.label
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected === key}
              onClick={() => onSelect(key)}
              className={cn(
                'flex items-baseline gap-2 bg-white px-4 py-3 text-left outline-none transition-colors hover:bg-brand-ice focus-visible:outline-3 focus-visible:outline-solid focus-visible:-outline-offset-3 focus-visible:outline-link',
                selected === key && 'bg-brand-ice',
                span(i),
              )}
            >
              <span className={number(item)}>{item.value}</span>
              <span className="text-sm text-brand-muted">{item.label}</span>
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <dl aria-label={label} className={grid}>
      {items.map((item, i) => (
        <div key={item.key ?? item.label} className={cn('flex flex-row-reverse items-baseline justify-end gap-2 bg-white px-4 py-3', span(i))}>
          <dt className="min-w-0 text-sm text-brand-muted">{item.label}</dt>
          <dd className={number(item)}>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Tab section header: 22px title, muted subtitle (max 70ch), "About this view" on the right. */
export function SectionHeader({ title, subtitle, about }: { title: ReactNode; subtitle?: ReactNode; about?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0 flex-[1_1_20rem]">
        <h2 className="text-[22px] font-semibold leading-tight text-brand-navy">{title}</h2>
        {subtitle && <p className="mt-1 max-w-[70ch] text-sm text-brand-muted">{subtitle}</p>}
      </div>
      {about && <InfoTip label="About this view" text="About this view" align="end">{about}</InfoTip>}
    </div>
  )
}

/** Sub-views inside a tab (the Summary "Overview / List UW …" pills): one row at every width that
 *  scrolls sideways when narrow, the active pill kept in view; optional count badges. */
export function ViewSwitch<T extends string>({ label, value, onChange, items }: {
  label: string
  value: T
  onChange: (value: T) => void
  items: readonly { value: T; label: string; count?: number }[]
}) {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = row.current
    const pill = list?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!list || !pill || list.scrollWidth <= list.clientWidth) return
    const left = pill.offsetLeft - list.offsetLeft - 16
    const right = pill.offsetLeft - list.offsetLeft + pill.offsetWidth + 16 - list.clientWidth
    if (list.scrollLeft > left) list.scrollLeft = left
    else if (list.scrollLeft < right) list.scrollLeft = right
  }, [value])
  return (
    <div ref={row} role="group" aria-label={label} className="-m-1 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40',
              active ? 'border-transparent bg-primary text-white' : 'border-border bg-white text-foreground shadow-sm hover:bg-muted',
            )}
          >
            {item.label}
            {item.count != null && (
              <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tabular-nums', active ? 'bg-white/20' : 'bg-muted text-muted-foreground')}>
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Collapsed guidance card (Nutritional Assessment's "Follow-up guidance"). */
export function GuidanceCard({ title, icon, children, className }: { title: ReactNode; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cn(REPORT_CARD, 'nutrition-no-print group', className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-brand-navy outline-none focus-visible:ring-2 focus-visible:ring-brand-sky [&::-webkit-details-marker]:hidden">
        {icon ?? <AlertCircle size={16} aria-hidden="true" className="shrink-0 text-warn" />}
        {title}
        <ChevronDown size={16} aria-hidden="true" className="ml-auto text-brand-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="border-t border-brand-line/70 px-4 py-3 text-sm text-brand-navy">{children}</div>
    </details>
  )
}
