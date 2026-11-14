import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { InfoTip } from '@/components/ui/info-tip'

/** Card used by every Nutritional Assessment block (filters, reports, tables): same radius, border and shadow. */
export const REPORT_CARD = 'overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm'

/** Filter card shared by all four Nutritional Assessment tabs: Child Profiling's filter container, one row
 *  of controls on a shared bottom edge (gap 16px), Refresh pushed right at the select height. The
 *  optional row below holds the counts. */
export function FilterCard({ children, refresh, extra, below }: { children: ReactNode; refresh?: ReactNode; extra?: ReactNode; below?: ReactNode }) {
  return (
    <section aria-label="Filters" className={cn(REPORT_CARD, 'nutrition-no-print')}>
      <div className="flex flex-wrap items-end gap-4 p-4">
        <div className="grid min-w-0 flex-[1_1_28rem] gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        {extra && <div className="flex h-10 items-center">{extra}</div>}
        {refresh && <div className="ml-auto">{refresh}</div>}
      </div>
      {below}
    </section>
  )
}

/** Counts row under the filters (same cells as All assessments): number then label on one baseline,
 *  1px dividers. Zero is grey; severe counts red and review counts amber when not zero. */
export function CountsStrip({ label, items }: { label: string; items: { label: string; value: number; tone?: 'severe' | 'review' }[] }) {
  const five = items.length === 5
  return (
    <dl aria-label={label} className={cn('grid gap-px border-t border-brand-line/70 bg-brand-line/70', five ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-3')}>
      {items.map((item, i) => (
        <div key={item.label} className={cn('flex flex-row-reverse items-baseline justify-end gap-2 bg-white px-4 py-3', five && i === 4 && 'col-span-2 lg:col-span-1')}>
          <dt className="min-w-0 text-sm text-brand-muted">{item.label}</dt>
          <dd className={cn('text-2xl font-bold tabular-nums', item.value === 0 ? 'text-zero' : item.tone === 'severe' ? 'text-severe' : item.tone === 'review' ? 'text-review' : 'text-brand-navy')}>
            {item.value}
          </dd>
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
