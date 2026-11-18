import type { ActivityStatus } from '@/lib/constants/activity-statuses'
import { activityTypeMeta } from '@/lib/constants/activity-types'

export type Barangay = {
  barangay_id: number
  barangay_name: string
  municipality?: string | null
  province?: string | null
  rhu_id?: number | null
}

export type Activity = {
  schedule_id: number
  activity_type: string
  schedule_date: string
  start_time: string | null
  end_time: string | null
  status: ActivityStatus
  remarks: string | null
  conflict_status: 'NONE' | 'DETECTED' | 'RESOLVED'
  review_remarks: string | null
  reviewed_at: string | null
  reviewed_by?: string | null
  created_at: string
  updated_at: string
  created_by: string
  approved_by: string | null
  barangay_id: number
  barangay: Barangay | Barangay[] | null
  requested_by_name?: string | null
  requested_by_role?: string | null
  approved_by_name?: string | null
  responsible_personnel?: { user_id: string; full_name: string; role?: string | null }[]
}

export function getBarangay(activity: Activity): Barangay | null {
  if (!activity.barangay) return null
  if (Array.isArray(activity.barangay)) return activity.barangay[0] ?? null
  return activity.barangay
}

export function getBarangayName(activity: Activity) {
  return getBarangay(activity)?.barangay_name ?? `Barangay ${activity.barangay_id}`
}

export function formatActivityType(value: string) {
  return activityTypeMeta(value).label
}

/** The table and card title: activities have no name of their own, so type + barangay. */
export function activityName(activity: Activity) {
  return `${activityTypeMeta(activity.activity_type).label} · ${getBarangayName(activity)}`
}

/** Display ID, e.g. ACT-2026-0041: year requested + schedule number. Search matches it too. */
export function activityCode(activity: Activity) {
  return `ACT-${activity.created_at.slice(0, 4)}-${String(activity.schedule_id).padStart(4, '0')}`
}

export function formatTime(value: string | null) {
  if (!value) return '—'
  const [hours, minutes] = value.split(':')
  const date = new Date()
  date.setHours(Number(hours), Number(minutes), 0, 0)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatTimeRange(activity: Pick<Activity, 'start_time' | 'end_time'>) {
  return activity.start_time || activity.end_time
    ? `${formatTime(activity.start_time)} – ${formatTime(activity.end_time)}`
    : 'Time not specified'
}

export function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Local YYYY-MM-DD. */
export function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function getTodayString() {
  return dateKey(new Date())
}

export function addDays(date: Date, amount: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
}

/** Minutes since midnight from "HH:MM[:SS]". */
export function minutesOf(value: string | null) {
  if (!value) return null
  const [h, m] = value.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/** Approved or ongoing, from now (today's activity counts until it ends) to `days` ahead. */
export function isUpcoming(activity: Activity, days: number, now = new Date()) {
  if (activity.status !== 'APPROVED' && activity.status !== 'ONGOING') return false
  const today = dateKey(now)
  const last = dateKey(addDays(now, days))
  if (activity.schedule_date > last) return false
  if (activity.schedule_date > today) return true
  if (activity.schedule_date < today) return activity.status === 'ONGOING'
  const end = minutesOf(activity.end_time)
  return end === null || end > now.getHours() * 60 + now.getMinutes()
}
