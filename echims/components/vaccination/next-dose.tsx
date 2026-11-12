'use client'

// Compact "next schedule" display used in Records, the Schedule cards and the child profile:
//   Feb 12, 2027  in 5 days        ← date (medium) + relative hint (muted)
//   Penta · Dose 2                 ← vaccine + dose (muted, truncated with a tooltip)
// Missed doses get a small red "Missed" pill (tooltip: "Missed · new date …"); normal pending
// doses get no badge. The date is computed by the system (lib/nip-schedule), never typed in.
// `provisional`: the date counts a dose that is recorded but still awaiting approval ("Pending
// approval"); it becomes final when the PHN approves, and reverts if the record is returned.

import Link from 'next/link'
import { manilaTodayYMD, nipDaysBetween } from '@/lib/nip-schedule'
import { cn } from '@/lib/utils'

/** Child profile opened at the Vaccination schedule section (the jump bar's anchor); `dose`
 *  (a vaccine code) also expands that vaccine's card there. */
export function vaccinationProfileHref(childId: number, doseCode?: string | null) {
  return `/child-profiling/children/${childId}${doseCode ? `?dose=${encodeURIComponent(doseCode)}` : ''}#vaccination-schedule`
}

const fmt = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

/** "today", "tomorrow", "in 5 days", "2 days ago"; null when more than 30 days away (not useful). */
export function relativeDay(ymd: string, today = manilaTodayYMD()): string | null {
  const d = nipDaysBetween(today, ymd)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  if (Math.abs(d) > 30) return null
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

export function NextDose({ date, vaccine, dose, missed = false, provisional = false, href, className }: {
  /** YYYY-MM-DD; for a missed dose, its new (rescheduled) date. */
  date: string | null | undefined
  vaccine?: string | null
  dose?: number | null
  missed?: boolean
  provisional?: boolean
  /** Makes the date a link (not inside buttons such as accordion headers). */
  href?: string
  className?: string
}) {
  if (!date) return <span className={cn('text-muted-foreground', className)}>—</span>
  const rel = relativeDay(date)
  const what = [vaccine, dose ? `Dose ${dose}` : null].filter(Boolean).join(' · ')
  const label = fmt(date)
  return (
    <span className={cn('inline-flex min-w-0 max-w-full flex-col items-end text-right sm:items-start sm:text-left', className)}>
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {href
          ? <Link href={href} className="font-medium text-brand-navy underline-offset-4 hover:text-brand-blue hover:underline">{label}</Link>
          : <span className="font-medium text-brand-navy">{label}</span>}
        {missed && (
          <span title={`Missed · new date ${label}`} className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold leading-4 text-danger">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-danger" />Missed
            <span className="sr-only"> · new date {label}</span>
          </span>
        )}
        {rel && <span className="text-xs text-muted-foreground">{rel}</span>}
        {provisional && (
          <span title="Counts a dose that is recorded but not yet approved. Final once the PHN approves it." className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium leading-4 text-slate-600">
            Pending approval
          </span>
        )}
      </span>
      {what && <span title={what} className="max-w-[14rem] truncate text-xs text-muted-foreground">{what}</span>}
    </span>
  )
}
