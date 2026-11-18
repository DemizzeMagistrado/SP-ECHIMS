// Health activity request statuses. Only these six exist (database check constraint, ACT-REV01):
// the PHN approves a request or returns it for revision; the requester edits and resubmits it.

export type ActivityStatus = 'PENDING' | 'APPROVED' | 'NEEDS_REVISION' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'

/** bg / fg: the status badge colours (table, cards, modal). */
export const ACTIVITY_STATUS_META: Record<ActivityStatus, { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Pending', bg: '#FEF3C7', fg: '#92610E' },
  APPROVED: { label: 'Approved', bg: '#DDF1E8', fg: '#17694C' },
  NEEDS_REVISION: { label: 'Needs revision', bg: '#FFF4DB', fg: '#9C6B10' },
  ONGOING: { label: 'Ongoing', bg: '#DFF3F9', fg: '#0B759A' },
  COMPLETED: { label: 'Completed', bg: '#F0F2F5', fg: '#55617F' },
  CANCELLED: { label: 'Cancelled', bg: '#FEE2E2', fg: '#C42B2B' },
}

export const ACTIVITY_STATUSES = Object.keys(ACTIVITY_STATUS_META) as ActivityStatus[]

export function activityStatusMeta(status: string) {
  return ACTIVITY_STATUS_META[status as ActivityStatus] ?? { label: status.replaceAll('_', ' '), bg: '#F0F2F5', fg: '#55617F' }
}
