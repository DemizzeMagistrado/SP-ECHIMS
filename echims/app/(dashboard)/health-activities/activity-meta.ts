import type { StatusTone } from '@/components/ui/status-badge'

// Health activity types and statuses, shared by the requests table, detail modal and calendar.
// Six statuses only: the PHN approves a request or returns it for revision.

export type ActivityType = 'VACCINATION' | 'NUTRITIONAL_ASSESSMENT' | 'SUPPLEMENTATION'

export type ActivityStatus = 'PENDING' | 'APPROVED' | 'NEEDS_REVISION' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'

/** pill: the type pill (table, modal); dot: the calendar dot and legend. */
export const ACTIVITY_TYPE_META: Record<ActivityType, { label: string; short: string; pill: string; dot: string }> = {
  VACCINATION: { label: 'Vaccination', short: 'Vaccination', pill: 'bg-[#FDEAEF] text-[#A5304D]', dot: 'bg-[#A5304D]' },
  NUTRITIONAL_ASSESSMENT: { label: 'Nutritional assessment', short: 'Nutritional', pill: 'bg-[#E9F3FD] text-[#1A5FB8]', dot: 'bg-[#1A5FB8]' },
  SUPPLEMENTATION: { label: 'Supplementation', short: 'Supplementation', pill: 'bg-[#E8F0FE] text-[#2A6A8C]', dot: 'bg-[#2A6A8C]' },
}

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_META) as ActivityType[]

export const ACTIVITY_STATUS_META: Record<ActivityStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Pending', tone: 'review' },
  APPROVED: { label: 'Approved', tone: 'good' },
  NEEDS_REVISION: { label: 'Needs revision', tone: 'warn' },
  ONGOING: { label: 'Ongoing', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
}

export const ACTIVITY_STATUSES = Object.keys(ACTIVITY_STATUS_META) as ActivityStatus[]

export function typeMeta(type: string) {
  return ACTIVITY_TYPE_META[type as ActivityType] ?? { label: type.replaceAll('_', ' '), short: type.replaceAll('_', ' '), pill: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' }
}

export function statusMeta(status: string) {
  return ACTIVITY_STATUS_META[status as ActivityStatus] ?? { label: status.replaceAll('_', ' '), tone: 'neutral' as StatusTone }
}
