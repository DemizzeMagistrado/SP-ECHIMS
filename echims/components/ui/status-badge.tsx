import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// One pastel map for every status chip. Pass the raw status (any case, _ or -):
//   <StatusBadge status="PENDING" />  <StatusBadge status="due-soon" label="Due in 3 days" dot />
// Text/background pairs are all ≥ 4.5:1 (WCAG AA for small text).
const TONES = {
  good: 'bg-good-soft text-good ring-good/20',
  warn: 'bg-warn-soft text-warn ring-warn/25',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  info: 'bg-brand-ice text-[#035C8C] ring-brand-blue/20',
  nutrition: 'bg-nutrition-soft text-nutrition ring-nutrition/20',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-300/60',
} as const

export type StatusTone = keyof typeof TONES

const STATUS_TONE: Record<string, StatusTone> = {
  approved: 'good', completed: 'good', complete: 'good', normal: 'good', active: 'good', valid: 'good', imported: 'good',
  synced: 'good', done: 'good', resolved: 'good', 'in-stock': 'good', sent: 'good', delivered: 'good', validated: 'good',
  pending: 'warn', 'due-soon': 'warn', due: 'warn', 'low-stock': 'warn', duplicate: 'warn', 'needs-revision': 'warn',
  review: 'warn', draft: 'warn', uncertain: 'warn', queued: 'warn',
  rejected: 'danger', overdue: 'danger', 'at-risk': 'danger', expired: 'danger', error: 'danger', failed: 'danger',
  critical: 'danger', blocked: 'danger', 'out-of-stock': 'danger', suspended: 'danger',
  upcoming: 'info', scheduled: 'info', ongoing: 'info', 'in-progress': 'info', new: 'info', open: 'info',
  cancelled: 'neutral', canceled: 'neutral', skipped: 'neutral', inactive: 'neutral', unknown: 'neutral', closed: 'neutral',
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, '-')
const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

export function statusTone(status: string): StatusTone {
  return STATUS_TONE[norm(status)] ?? 'neutral'
}

export function StatusBadge({ status, label, tone, dot = false, icon, className }: {
  status: string
  /** Defaults to the status in sentence case ("NEEDS_REVISION" → "Needs revision"). */
  label?: ReactNode
  /** Overrides the tone looked up from the status. */
  tone?: StatusTone
  dot?: boolean
  icon?: ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', TONES[tone ?? statusTone(status)], className)}>
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {icon}
      {label ?? titleCase(status)}
    </span>
  )
}
