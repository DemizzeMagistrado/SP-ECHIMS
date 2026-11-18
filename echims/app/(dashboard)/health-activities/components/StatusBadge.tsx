import { cn } from '@/lib/utils'
import { activityStatusMeta } from '@/lib/constants/activity-statuses'

/** Activity status badge (ACT-REV01 colours). sm = 22px for the upcoming cards, md = 24px. */
export function ActivityStatusBadge({ status, size = 'md', className }: { status: string; size?: 'sm' | 'md'; className?: string }) {
  const meta = activityStatusMeta(status)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold', size === 'sm' ? 'h-[22px] px-2 text-[11px]' : 'h-6 px-2.5 text-xs', className)}
      style={{ backgroundColor: meta.bg, color: meta.fg }}
    >
      {meta.label}
    </span>
  )
}
