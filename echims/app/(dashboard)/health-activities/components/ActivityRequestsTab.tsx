'use client'
import { AlertTriangle, CalendarDays, SearchX } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'
import { type Activity, activityCode, activityName, formatDate, formatTimeRange, getBarangay } from './activity-utils'
import { ActivityStatusBadge } from './StatusBadge'
import { TypePill } from './TypePill'
import { DetailsButton } from './DetailsButton'

// Column widths (table-layout: fixed): REQUEST 24 · TYPE 12 · SCHEDULE 15 · LOCATION 14 · REQUESTED BY 12 · STATUS 11 · ACTIONS 12.
const COLUMNS = [
  { label: 'Request', width: '24%' },
  { label: 'Type', width: '12%' },
  { label: 'Schedule', width: '15%' },
  { label: 'Location', width: '14%' },
  { label: 'Requested by', width: '12%' },
  { label: 'Status', width: '11%' },
  { label: 'Actions', width: '12%' },
]

export function ActivityRequestsTab({ activities, empty, onOpen }: {
  /** Already filtered and sorted. */
  activities: Activity[]
  /** No activities at all (vs. none matching the filters). */
  empty: boolean
  onOpen: (activity: Activity) => void
}) {
  const { visible, props: pager } = usePagination(activities)

  return (
    <section aria-label="Activity requests" className="overflow-hidden rounded-xl border border-[#D5E2EA] bg-white">
      <div className="scroll-subtle overflow-x-auto">
        {/* min-width keeps the fixed columns readable on a phone; the box scrolls sideways instead of the page. */}
        <table className="w-full min-w-[960px] table-fixed border-collapse text-sm">
          <colgroup>{COLUMNS.map((c) => <col key={c.label} style={{ width: c.width }} />)}</colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c, i) => (
                <th
                  key={c.label}
                  scope="col"
                  className={cn(
                    'border-b-2 border-[#D5E2EA] bg-[#F5F8FA] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.5px] text-[#55617F]',
                    i === COLUMNS.length - 1 && 'sticky right-0 z-[2] text-right',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length}>
                  <EmptyState
                    icon={empty ? CalendarDays : SearchX}
                    title={empty ? 'No health activities yet' : 'No requests match these filters'}
                    description={empty ? 'New activity requests will appear here.' : 'Try another status, type, barangay or search.'}
                  />
                </td>
              </tr>
            ) : visible.map((activity, i) => {
              const barangay = getBarangay(activity)
              const last = i === visible.length - 1
              // Background on each cell (zebra), so the sticky Actions cell matches its row.
              const td = cn('px-4 py-3 align-top transition-colors duration-[120ms] group-hover:!bg-[#F2F7FB]', i % 2 === 1 ? 'bg-[#F9FBFC]' : 'bg-white', !last && 'border-b border-[#EAF0F4]')
              return (
                <tr key={activity.schedule_id} className="group cursor-pointer" onClick={() => onOpen(activity)}>
                  <td className={cn(td, 'group-hover:shadow-[inset_3px_0_0_#07075F]')}>
                    <span className="block truncate font-semibold text-[#0C1260]" title={activityName(activity)}>{activityName(activity)}</span>
                    <span className="mt-0.5 block text-xs text-[#8896B0]">{activityCode(activity)}</span>
                  </td>
                  <td className={td}><TypePill type={activity.activity_type} /></td>
                  <td className={td}>
                    <span className="block text-[13px] text-[#1E2A55]">{formatDate(activity.schedule_date)}</span>
                    <span className="block text-xs text-[#8896B0]">{formatTimeRange(activity)}</span>
                  </td>
                  <td className={td}>
                    <span className="block truncate text-[13px] text-[#1E2A55]" title={barangay?.barangay_name}>{barangay?.barangay_name ?? `Barangay ${activity.barangay_id}`}</span>
                    {barangay?.municipality && <span className="block truncate text-xs text-[#8896B0]">{barangay.municipality}</span>}
                  </td>
                  <td className={td}>
                    <span className="block truncate text-[13px] text-[#1E2A55]" title={activity.requested_by_name ?? undefined}>{activity.requested_by_name ?? '—'}</span>
                    {activity.requested_by_role && <span className="block text-xs text-[#8896B0]">{activity.requested_by_role}</span>}
                  </td>
                  <td className={td}>
                    <ActivityStatusBadge status={activity.status} />
                    {activity.conflict_status === 'DETECTED' && (
                      <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-[#9C6B10]">
                        <AlertTriangle size={12} aria-hidden="true" />Conflict
                      </span>
                    )}
                  </td>
                  <td className={cn(td, 'sticky right-0 z-[1] text-right shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.12)]')}>
                    <DetailsButton
                      aria-label={`View details for ${activityCode(activity)}`}
                      onClick={(event) => { event.stopPropagation(); onOpen(activity) }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination {...pager} label="Request pages" />
    </section>
  )
}
