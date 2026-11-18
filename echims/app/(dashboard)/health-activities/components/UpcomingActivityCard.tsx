import { CalendarDays, MapPin } from 'lucide-react'
import { activityTypeMeta } from '@/lib/constants/activity-types'
import { type Activity, activityCode, activityName, formatDate, formatTimeRange, getBarangayName } from './activity-utils'
import { ActivityStatusBadge } from './StatusBadge'
import { TypePill } from './TypePill'
import { DetailsButton } from './DetailsButton'

export function UpcomingActivityCard({ activity, onOpen }: { activity: Activity; onOpen: (activity: Activity) => void }) {
  return (
    <article
      className="flex flex-col gap-2 rounded-[10px] border border-l-[3px] border-[#D5E2EA] bg-white px-3.5 py-3 transition-shadow duration-150 hover:shadow-[0_2px_8px_rgba(12,18,96,0.10)]"
      style={{ borderLeftColor: activityTypeMeta(activity.activity_type).fg }}
    >
      <div className="flex items-center justify-between gap-2">
        <TypePill type={activity.activity_type} size="sm" />
        <ActivityStatusBadge status={activity.status} size="sm" />
      </div>
      <div className="min-w-0">
        <h4 className="truncate text-sm font-bold text-[#0C1260]" title={activityName(activity)}>{activityName(activity)}</h4>
        <p className="text-xs text-[#8896B0]">{activityCode(activity)}</p>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#55617F]">
        <span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" className="text-[#8896B0]" />{formatDate(activity.schedule_date)} · {formatTimeRange(activity)}</span>
        <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={13} aria-hidden="true" className="shrink-0 text-[#8896B0]" /><span className="truncate">{getBarangayName(activity)}</span></span>
      </p>
      <DetailsButton className="w-full" aria-label={`View activity details for ${activityCode(activity)}`} onClick={() => onOpen(activity)}>
        View activity details
      </DetailsButton>
    </article>
  )
}
