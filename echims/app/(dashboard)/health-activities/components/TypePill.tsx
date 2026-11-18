import { cn } from '@/lib/utils'
import { activityTypeMeta } from '@/lib/constants/activity-types'

/** Activity type pill. sm = 22px for the upcoming cards, md = 24px. */
export function TypePill({ type, size = 'md', className }: { type: string; size?: 'sm' | 'md'; className?: string }) {
  const meta = activityTypeMeta(type)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold', size === 'sm' ? 'h-[22px] px-2 text-[11px]' : 'h-6 px-2.5 text-xs', className)}
      style={{ backgroundColor: meta.bg, color: meta.fg }}
    >
      {meta.short}
    </span>
  )
}
