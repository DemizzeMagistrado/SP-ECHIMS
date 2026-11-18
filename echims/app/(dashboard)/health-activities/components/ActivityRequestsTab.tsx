'use client'
import { AlertTriangle, CalendarDays, SearchX } from 'lucide-react'
import { GridTable, RowButton } from '@/components/ui/grid-table'
import { type Activity, activityCode, activityName, formatDate, formatTimeRange, getBarangay } from './activity-utils'
import { ActivityStatusBadge } from './StatusBadge'
import { TypePill } from './TypePill'

export function ActivityRequestsTab({ activities, empty, onOpen }: {
  /** Already filtered and sorted. */
  activities: Activity[]
  /** No activities at all (vs. none matching the filters). */
  empty: boolean
  onOpen: (activity: Activity) => void
}) {
  return (
    <GridTable
      caption="Activity requests"
      rows={activities}
      rowKey={(a) => a.schedule_id}
      onRowClick={onOpen}
      minWidth={960}
      empty={empty
        ? { icon: CalendarDays, title: 'No health activities yet', description: 'New activity requests will appear here.' }
        : { icon: SearchX, title: 'No requests match these filters', description: 'Try another status, type, barangay or search.' }}
      columns={[
        {
          key: 'request', header: 'Request', width: '24%',
          cell: (a) => <>
            <span className="block truncate font-semibold text-[#0C1260]" title={activityName(a)}>{activityName(a)}</span>
            <span className="mt-0.5 block text-xs text-[#8896B0]">{activityCode(a)}</span>
          </>,
        },
        { key: 'type', header: 'Type', width: '12%', cell: (a) => <TypePill type={a.activity_type} /> },
        {
          key: 'schedule', header: 'Schedule', width: '15%',
          cell: (a) => <>
            <span className="block">{formatDate(a.schedule_date)}</span>
            <span className="block text-xs text-[#8896B0]">{formatTimeRange(a)}</span>
          </>,
        },
        {
          key: 'location', header: 'Location', width: '14%',
          cell: (a) => {
            const barangay = getBarangay(a)
            return <>
              <span className="block truncate" title={barangay?.barangay_name}>{barangay?.barangay_name ?? `Barangay ${a.barangay_id}`}</span>
              {barangay?.municipality && <span className="block truncate text-xs text-[#8896B0]">{barangay.municipality}</span>}
            </>
          },
        },
        {
          key: 'requested', header: 'Requested by', width: '12%',
          cell: (a) => <>
            <span className="block truncate" title={a.requested_by_name ?? undefined}>{a.requested_by_name ?? '—'}</span>
            {a.requested_by_role && <span className="block text-xs text-[#8896B0]">{a.requested_by_role}</span>}
          </>,
        },
        {
          key: 'status', header: 'Status', width: '11%',
          cell: (a) => <>
            <ActivityStatusBadge status={a.status} />
            {a.conflict_status === 'DETECTED' && (
              <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-[#9C6B10]">
                <AlertTriangle size={12} aria-hidden="true" />Conflict
              </span>
            )}
          </>,
        },
        {
          key: 'actions', header: 'Actions', width: '12%', sticky: true,
          cell: (a) => <RowButton aria-label={`View details for ${activityCode(a)}`} onClick={(event) => { event.stopPropagation(); onOpen(a) }} />,
        },
      ]}
    />
  )
}
