'use client'
// Report-page building blocks shared by Nutritional Assessment and Supplementation: card, filter card,
// counts strip, section header ("About this view"), view switcher (pills) and collapsed guidance card.
import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InfoTip } from '@/components/ui/info-tip'
import { PillLabel, pillFill, strip, subPill } from '@/components/ui/module-tabs'
import { TabIndicator } from '@/components/dashboard/tab-indicator'

/** Card used by every report block (filters, reports, tables): same radius, border and shadow. */
export const REPORT_CARD = 'overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm'

/** Filter card: Child Profiling's filter container, one row of controls on a shared bottom edge
 *  (gap 16px), Refresh (and any toolbar buttons) pushed right at the select height. The optional
 *  row below holds the counts. */
export function FilterCard({ children, refresh, extra, below, wide }: {
  children: ReactNode; refresh?: ReactNode; extra?: ReactNode; below?: ReactNode
  /** Four controls on one row at wide screens (search + three selects). */
  wide?: boolean
}) {
  return (
    <section aria-label="Filters" className={cn(REPORT_CARD, 'nutrition-no-print')}>
      <div className="flex flex-wrap items-end gap-4 p-4">
        <div className={cn('grid min-w-0 flex-[1_1_28rem] gap-4 sm:grid-cols-2 lg:grid-cols-3', wide && 'xl:grid-cols-4')}>{children}</div>
        {extra && <div className="flex h-10 items-center">{extra}</div>}
        {refresh && <div className="ml-auto flex flex-wrap items-center gap-2">{refresh}</div>}
      </div>
      {below}
    </section>
  )
}

const COUNT_TONE = { severe: 'text-severe', review: 'text-review', good: 'text-good', info: 'text-[#035C8C]', muted: 'text-brand-muted' } as const
type CountItem = { label: string; value: number | string; tone?: keyof typeof COUNT_TONE; key?: string; hint?: ReactNode }
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
  /** One key, or several when two filters can be on at once. */
  selected?: string | string[]
  onSelect?: (key: string) => void
}) {
  const isOn = (key: string) => (Array.isArray(selected) ? selected.includes(key) : selected === key)
  const number = (item: CountItem, on = false) => cn('text-[28px] font-bold leading-none tabular-nums transition-colors duration-150', on ? 'text-white' : item.value === 0 ? 'text-zero' : item.tone ? COUNT_TONE[item.tone] : 'text-[#07075F]')
  const span = (i: number) => items.length === 5 && i === 4 && 'col-span-2 lg:col-span-1'
  const grid = cn('grid gap-px border-t border-[#EAF0F4] bg-[#EAF0F4]', COUNT_GRID[items.length] ?? 'grid-cols-2 sm:grid-cols-4')
  if (onSelect) {
    return (
      // Filter buttons: no strip; each count is its own button (light border like the tabs), solid navy when on.
      <div role="group" aria-label={label} className={cn('grid gap-2 border-t border-brand-line p-3', COUNT_GRID[items.length] ?? 'grid-cols-2 sm:grid-cols-4')}>
        {items.map((item, i) => {
          const key = item.key ?? item.label
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isOn(key)}
              onClick={() => onSelect(key)}
              className={cn(
                'flex flex-wrap items-baseline gap-x-2 rounded-lg border px-4 py-3 text-left outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-link motion-reduce:transition-none',
                isOn(key) ? 'border-[#07075F] bg-[#07075F] shadow-[0_1px_3px_rgba(12,18,96,0.18)]' : 'border-[#D5E2EA] bg-white hover:border-[#8896B0] hover:bg-[#F5F8FA] active:bg-brand-ice',
                span(i),
              )}
            >
              <span className={number(item, isOn(key))}>{item.value}</span>
              <span className={cn('text-sm font-medium transition-colors duration-150', isOn(key) ? 'text-white' : 'text-[#55617F]')}>{item.label}</span>
              {item.hint && <span className={cn('basis-full text-xs', isOn(key) ? 'text-white/80' : 'text-brand-muted')}>{item.hint}</span>}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <dl aria-label={label} className={grid}>
      {items.map((item, i) => (
        <div key={item.key ?? item.label} className={cn('flex flex-row-reverse flex-wrap-reverse items-baseline justify-end gap-x-2 bg-white px-5 py-3.5', span(i))}>
          {item.hint && <dd className="basis-full text-xs text-brand-muted">{item.hint}</dd>}
          <dt className="min-w-0 text-sm font-medium text-[#55617F]">{item.label}</dt>
          <dd className={number(item)}>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Tab section header: 22px title, muted subtitle (max 70ch), "About this view" on the right. */
export function SectionHeader({ title, subtitle, about, actions }: { title: ReactNode; subtitle?: ReactNode; about?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0 flex-[1_1_20rem]">
        <h2 className="text-[22px] font-semibold leading-tight text-brand-navy">{title}</h2>
        {subtitle && <p className="mt-1 max-w-[70ch] text-sm text-brand-muted">{subtitle}</p>}
      </div>
      {about && <InfoTip label="About this view" text="About this view" align="end">{about}</InfoTip>}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Sub-views inside a tab (the Summary "Overview / List UW …" pills), styled as sub-tabs (TabBar
 *  variant="sub"): separate pills, thin navy border, solid navy when active. One row that scrolls sideways when narrow, the
 *  active pill kept in view; optional count badges. */
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
    <div ref={row} role="group" aria-label={label} className={cn(strip, "flex w-fit min-w-0 max-w-full flex-nowrap gap-1.5 overflow-x-auto p-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={subPill(active)}
          >
            <PillLabel>
              {item.label}
              {item.count != null && (
                <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors duration-[250ms]', active ? 'bg-white/20 text-white' : 'bg-brand-ice text-[#07075F]')}>
                  {item.count}
                </span>
              )}
            </PillLabel>
          </button>
        )
      })}
      <TabIndicator group={label} activeKey={value} className={pillFill} />
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
