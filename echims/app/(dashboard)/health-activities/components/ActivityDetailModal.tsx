'use client'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, PencilLine } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type Activity, activityCode, activityName, formatDate, formatTimeRange, getBarangay, initials } from './activity-utils'
import { ActivityStatusBadge } from './StatusBadge'
import { TypePill } from './TypePill'

export type DetailAction = 'approve' | 'revise' | 'edit' | 'status' | 'complete' | 'cancel'

// Footer buttons: shared Button, secondary for side actions, primary for the main one. No reject action exists.
const heading = 'text-sm font-semibold text-brand-navy'

export function ActivityDetailModal({ activity, actions, onClose, onAction }: {
  activity: Activity
  /** What this viewer can do here, primary action last (right-most). */
  actions: DetailAction[]
  onClose: () => void
  onAction: (action: DetailAction) => void
}) {
  const barangay = getBarangay(activity)
  const people = activity.responsible_personnel ?? []

  // Request info, then schedule info: two blocks with a divider between them.
  const requestInfo: { label: string; value: ReactNode }[] = [
    { label: 'Type', value: <TypePill type={activity.activity_type} /> },
    { label: 'Requested by', value: <>{activity.requested_by_name ?? 'Name unavailable'}{activity.requested_by_role && <span className="font-normal text-brand-muted"> · {activity.requested_by_role}</span>}</> },
    { label: 'Date requested', value: formatDate(activity.created_at) },
    ...(activity.approved_by_name ? [{ label: 'Approved by', value: activity.approved_by_name }] : []),
  ]
  const scheduleInfo: { label: string; value: ReactNode }[] = [
    { label: 'Schedule', value: <>{formatDate(activity.schedule_date)}<span className="block text-[13px] font-normal text-brand-muted">{formatTimeRange(activity)}</span></> },
    { label: 'Barangay', value: barangay?.barangay_name ?? `Barangay ${activity.barangay_id}` },
    { label: 'Location', value: [barangay?.municipality, barangay?.province].filter(Boolean).join(', ') || '—' },
  ]
  const details = (items: { label: string; value: ReactNode }[]) => (
    <dl className="mt-2.5 grid gap-4 sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-[0.5px] text-brand-muted">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-brand-navy">{value}</dd>
        </div>
      ))}
    </dl>
  )

  const buttons: Record<DetailAction, ReactNode> = {
    revise: <Button key="revise" variant="secondary" onClick={() => onAction('revise')}><PencilLine size={16} aria-hidden="true" />Return for revision</Button>,
    approve: <Button key="approve" onClick={() => onAction('approve')}><CheckCircle2 size={16} aria-hidden="true" />Approve activity</Button>,
    edit: <Button key="edit" onClick={() => onAction('edit')}><PencilLine size={16} aria-hidden="true" />Edit and resubmit</Button>,
    cancel: <Button key="cancel" variant="secondary" onClick={() => onAction('cancel')}>Cancel request</Button>,
    status: <Button key="status" variant="secondary" onClick={() => onAction('status')}>Update status</Button>,
    complete: <Button key="complete" onClick={() => onAction('complete')}><CheckCircle2 size={16} aria-hidden="true" />Mark as completed</Button>,
  }

  const section = 'border-t border-brand-line pt-4'

  return (
    <Modal
      open
      size="form"
      onClose={onClose}
      cancelLabel="Close"
      hideCancel={actions.length > 0}
      aboveTitle={
        <span className="mb-1.5 flex items-center gap-2">
          <ActivityStatusBadge status={activity.status} />
          <span className="text-xs text-brand-muted">{activityCode(activity)}</span>
        </span>
      }
      title={activityName(activity)}
      titleClassName="text-xl font-bold text-brand-navy"
      footer={actions.length > 0 ? <>{actions.map((action) => buttons[action])}</> : null}
    >
      <div className="space-y-5">
        {activity.conflict_status === 'DETECTED' && (
          <p role="status" className="flex gap-2 rounded-xl border border-[#F3D9A4] bg-[#FFF4DB] p-3 text-sm text-[#9C6B10]">
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            Another activity overlaps this schedule. Scheduling rules are checked again before approval.
          </p>
        )}

        <section>
          <h3 className={heading}>Request</h3>
          {details(requestInfo)}
        </section>

        <section className={section}>
          <h3 className={heading}>Schedule</h3>
          {details(scheduleInfo)}
        </section>

        <section className={section}>
          <h3 className={heading}>Assigned personnel</h3>
          {people.length === 0 ? (
            <p className="mt-1.5 text-sm text-brand-muted">Not assigned yet.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {people.map((person, i) => (
                <li key={person.user_id} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', i % 2 ? 'bg-[#FDEAEF] text-[#A5304D]' : 'bg-[#E9F3FD] text-[#1A5FB8]')}>{initials(person.full_name)}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-brand-navy">{person.full_name}</span>
                    {person.role && <span className="block text-xs text-brand-muted">{person.role}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={section}>
          <h3 className={heading}>Remarks</h3>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-brand-muted">{activity.remarks?.trim() || 'No remarks provided.'}</p>
        </section>

        {activity.review_remarks?.trim() && (
          <section className={section}>
            <h3 className={heading}>{activity.status === 'NEEDS_REVISION' ? 'What the PHN asked to change' : 'PHN review remarks'}</h3>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-brand-muted">{activity.review_remarks}</p>
          </section>
        )}
      </div>
    </Modal>
  )
}
