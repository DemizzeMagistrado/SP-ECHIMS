'use client'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, PencilLine } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { type Activity, activityCode, activityName, formatDate, formatTimeRange, getBarangay, initials } from './activity-utils'
import { ActivityStatusBadge } from './StatusBadge'
import { TypePill } from './TypePill'

export type DetailAction = 'approve' | 'revise' | 'edit' | 'status' | 'complete' | 'cancel'

// Footer buttons: outline = white + #BFD3DE border; primary = #07075F. No reject action exists.
const outline = 'inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#BFD3DE] bg-white px-5 text-sm font-medium text-[#0C1260] transition-colors hover:border-[#07075F] hover:bg-[#E6F1F7] hover:text-[#07075F] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[#0B759A]'
const primary = 'inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#07075F] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1A1A80] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[#0B759A]'

export function ActivityDetailModal({ activity, actions, onClose, onAction }: {
  activity: Activity
  /** What this viewer can do here, primary action last (right-most). */
  actions: DetailAction[]
  onClose: () => void
  onAction: (action: DetailAction) => void
}) {
  const barangay = getBarangay(activity)
  const people = activity.responsible_personnel ?? []

  const info: { label: string; value: ReactNode }[] = [
    { label: 'Type', value: <TypePill type={activity.activity_type} /> },
    { label: 'Requested by', value: <>{activity.requested_by_name ?? 'Name unavailable'}{activity.requested_by_role && <span className="font-normal text-[#8896B0]"> · {activity.requested_by_role}</span>}</> },
    { label: 'Schedule', value: <>{formatDate(activity.schedule_date)}<span className="block text-[13px] font-normal text-[#55617F]">{formatTimeRange(activity)}</span></> },
    { label: 'Location', value: [barangay?.municipality, barangay?.province].filter(Boolean).join(', ') || '—' },
    { label: 'Barangay', value: barangay?.barangay_name ?? `Barangay ${activity.barangay_id}` },
    { label: 'Date requested', value: formatDate(activity.created_at) },
    ...(activity.approved_by_name ? [{ label: 'Approved by', value: activity.approved_by_name }] : []),
  ]

  const buttons: Record<DetailAction, ReactNode> = {
    revise: <button key="revise" type="button" className={outline} onClick={() => onAction('revise')}><PencilLine size={16} aria-hidden="true" />Return for revision</button>,
    approve: <button key="approve" type="button" className={primary} onClick={() => onAction('approve')}><CheckCircle2 size={16} aria-hidden="true" />Approve activity</button>,
    edit: <button key="edit" type="button" className={primary} onClick={() => onAction('edit')}><PencilLine size={16} aria-hidden="true" />Edit and resubmit</button>,
    cancel: <button key="cancel" type="button" className={outline} onClick={() => onAction('cancel')}>Cancel request</button>,
    status: <button key="status" type="button" className={outline} onClick={() => onAction('status')}>Update status</button>,
    complete: <button key="complete" type="button" className={primary} onClick={() => onAction('complete')}><CheckCircle2 size={16} aria-hidden="true" />Mark as completed</button>,
  }

  const section = 'border-t border-[#EAF0F4] pt-4'

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
          <span className="text-xs text-[#8896B0]">{activityCode(activity)}</span>
        </span>
      }
      title={activityName(activity)}
      titleClassName="text-xl font-bold text-[#0C1260]"
      footer={actions.length > 0 ? <>{actions.map((action) => buttons[action])}</> : null}
    >
      <div className="space-y-5">
        {activity.conflict_status === 'DETECTED' && (
          <p role="status" className="flex gap-2 rounded-xl border border-[#F3D9A4] bg-[#FFF4DB] p-3 text-sm text-[#9C6B10]">
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            Another activity overlaps this schedule. Scheduling rules are checked again before approval.
          </p>
        )}

        <dl className="grid gap-4 sm:grid-cols-2">
          {info.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-[0.5px] text-[#8896B0]">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-[#1E2A55]">{value}</dd>
            </div>
          ))}
        </dl>

        <section className={section}>
          <h3 className="text-sm font-semibold text-[#0C1260]">Assigned personnel</h3>
          {people.length === 0 ? (
            <p className="mt-1.5 text-sm text-[#55617F]">Not assigned yet.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {people.map((person, i) => (
                <li key={person.user_id} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', i % 2 ? 'bg-[#FDEAEF] text-[#A5304D]' : 'bg-[#E9F3FD] text-[#1A5FB8]')}>{initials(person.full_name)}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[#1E2A55]">{person.full_name}</span>
                    {person.role && <span className="block text-xs text-[#8896B0]">{person.role}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={section}>
          <h3 className="text-sm font-semibold text-[#0C1260]">Remarks</h3>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#55617F]">{activity.remarks?.trim() || 'No remarks provided.'}</p>
        </section>

        {activity.review_remarks?.trim() && (
          <section className={section}>
            <h3 className="text-sm font-semibold text-[#0C1260]">{activity.status === 'NEEDS_REVISION' ? 'What the PHN asked to change' : 'PHN review remarks'}</h3>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#55617F]">{activity.review_remarks}</p>
          </section>
        )}
      </div>
    </Modal>
  )
}
