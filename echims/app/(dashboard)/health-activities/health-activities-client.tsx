'use client'

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react'

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import HealthActivityCalendar from './health-activity-calendar'

/* =========================================================
   TYPES
========================================================= */

type Role = 'Administrator' | 'PHN' | 'RHM' | 'BHW' | 'BNS'

type HealthWorkerRole = 'PHN' | 'RHM' | 'BHW' | 'BNS'

type ActivityType =
  | 'VACCINATION'
  | 'NUTRITIONAL_ASSESSMENT'
  | 'SUPPLEMENTATION'

type ActivityStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NEEDS_REVISION'

type ConflictStatus = 'NONE' | 'DETECTED' | 'RESOLVED'

type Barangay = {
  barangay_id: number
  barangay_name: string
  municipality?: string | null
  province?: string | null
  rhu_id?: number | null
}

type Activity = {
  schedule_id: number
  activity_type: string
  schedule_date: string
  start_time: string | null
  end_time: string | null
  status: ActivityStatus
  remarks: string | null
  conflict_status: ConflictStatus
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
  approved_by_name?: string | null
  responsible_personnel?: {
    user_id: string
    full_name: string
  }[]
}

type Suggestion = {
  suggested_date: string
  suggested_start_time: string
  suggested_end_time: string
}

type RuleConflict = {
  schedule_id?: number
  activity_type?: string
  schedule_date?: string
  start_time?: string
  end_time?: string
  conflict_rule?: string
  conflict_reason?: string
}

type RuleEvaluation = {
  hasConflict: boolean
  hasHardConflict: boolean
  conflicts: RuleConflict[]
  warnings: RuleConflict[]
  suggestions: Suggestion[]
}

/* =========================================================
   ACTIVITY CONFIGURATION
========================================================= */

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'VACCINATION', label: 'Vaccination' },
  { value: 'NUTRITIONAL_ASSESSMENT', label: 'Nutritional Assessment' },
  { value: 'SUPPLEMENTATION', label: 'Supplementation' },
]

const ACTIVITY_TYPES_BY_ROLE: Record<HealthWorkerRole, ActivityType[]> = {
  PHN: ['VACCINATION', 'NUTRITIONAL_ASSESSMENT', 'SUPPLEMENTATION'],
  RHM: ['VACCINATION', 'NUTRITIONAL_ASSESSMENT', 'SUPPLEMENTATION'],
  BHW: ['VACCINATION'],
  BNS: ['NUTRITIONAL_ASSESSMENT', 'SUPPLEMENTATION'],
}

const STATUS_LABELS: Record<ActivityStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ONGOING: 'Ongoing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NEEDS_REVISION: 'Needs revision',
}

type RequesterStatus = 'ONGOING' | 'COMPLETED' | 'CANCELLED'

/* Statuses the requester may move an activity to, by current status */
const REQUESTER_STATUS_TRANSITIONS: Partial<
  Record<ActivityStatus, RequesterStatus[]>
> = {
  PENDING: ['CANCELLED'],
  APPROVED: ['ONGOING', 'COMPLETED', 'CANCELLED'],
  ONGOING: ['COMPLETED', 'CANCELLED'],
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All requests' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'NEEDS_REVISION', label: 'Needs revision' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ONGOING', label: 'Ongoing' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

/* =========================================================
   HELPERS
========================================================= */

function getBarangay(activity: Activity): Barangay | null {
  if (!activity.barangay) return null
  if (Array.isArray(activity.barangay)) return activity.barangay[0] ?? null
  return activity.barangay
}

function getBarangayName(activity: Activity) {
  return getBarangay(activity)?.barangay_name ?? `Barangay ${activity.barangay_id}`
}

function formatActivityType(value: string) {
  return (
    ACTIVITY_TYPES.find((item) => item.value === value)?.label ??
    value.replaceAll('_', ' ')
  )
}

function formatTime(value: string | null) {
  if (!value) return '—'

  const [hours, minutes] = value.split(':')
  const date = new Date()
  date.setHours(Number(hours), Number(minutes), 0, 0)

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getTodayString() {
  const today = new Date()

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({ status }: { status: ActivityStatus }) {
  const styles: Record<ActivityStatus, string> = {
    PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
    ONGOING: 'bg-blue-50 text-blue-700 ring-blue-200',
    COMPLETED: 'bg-slate-100 text-slate-700 ring-slate-200',
    CANCELLED: 'bg-gray-100 text-gray-600 ring-gray-200',
    NEEDS_REVISION: 'bg-orange-50 text-orange-700 ring-orange-200',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

/* =========================================================
   DETAILS MODAL
========================================================= */

function ActivityDetailsModal({
  activity,
  canReview,
  onClose,
  onReview,
}: {
  activity: Activity
  canReview: boolean
  onClose: () => void
  onReview: () => void
}) {
  const barangay = getBarangay(activity)

  const details = [
    { label: 'Activity', value: formatActivityType(activity.activity_type) },
    { label: 'Date', value: formatDate(activity.schedule_date) },
    {
      label: 'Time',
      value:
        activity.start_time || activity.end_time
          ? `${formatTime(activity.start_time)} – ${formatTime(activity.end_time)}`
          : 'Time not specified',
    },
    {
      label: 'Location / Barangay',
      value: [
        barangay?.barangay_name ?? `Barangay ${activity.barangay_id}`,
        barangay?.municipality,
        barangay?.province,
      ]
        .filter(Boolean)
        .join(', '),
    },
    {
      label: 'Conflict Status',
      value: activity.conflict_status.replaceAll('_', ' '),
    },
    {
      label: 'Requested by',
      value: activity.requested_by_name ?? 'Name unavailable',
    },
    {
      label: 'Responsible personnel',
      value:
        activity.responsible_personnel
          ?.map((person) => person.full_name)
          .join(', ') || 'Not assigned yet',
    },
    {
      label: 'Approved by',
      value: activity.approved_by_name ?? 'Not available',
    },
  ]

  return (
    <ModalShell title="Health Activity Details" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#087db9]">
            Schedule #{activity.schedule_id}
          </p>

          <StatusBadge status={activity.status} />
        </div>

        <dl className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          {details.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-bold text-[#0b165d]">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="text-sm font-bold text-[#0b165d]">Activity Remarks</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
            {activity.remarks?.trim() || 'No remarks provided.'}
          </p>
        </div>

        {activity.review_remarks?.trim() && (
          <div>
            <p className="text-sm font-bold text-[#0b165d]">PHN Review Remarks</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
              {activity.review_remarks}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-[#0b165d] hover:bg-slate-50"
          >
            Close
          </button>

          {canReview && activity.status === 'PENDING' && (
            <button
              type="button"
              onClick={onReview}
              className="rounded-full bg-[#087db9] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#056d9e]"
            >
              Review Request
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function HealthActivitiesClient() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [statusActivity, setStatusActivity] = useState<Activity | null>(null)
  const [activeTab, setActiveTab] = useState<'Requests' | 'Calendar'>('Requests')
  const [activities, setActivities] = useState<Activity[]>([])
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [reviewActivity, setReviewActivity] = useState<Activity | null>(null)
  const [ruleEvaluation, setRuleEvaluation] = useState<RuleEvaluation | null>(null)

  /* LOAD ACTIVITIES */

  const loadActivities = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/health-activities', {
        method: 'GET',
        cache: 'no-store',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to load health activities.')
      }

      setCurrentUserId(data.currentUserId ?? null)
      setActivities(data.activities ?? [])
      setRole(data.role ?? null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load health activities.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadActivities()
  }, [loadActivities])

  /* PERMISSIONS */

  const canRequest =
    role === 'PHN' || role === 'RHM' || role === 'BHW' || role === 'BNS'

  const canReview = role === 'PHN'

  /* FILTER */

  const filteredActivities = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return activities.filter((activity) => {
      const matchesStatus =
        statusFilter === 'ALL' || activity.status === statusFilter

      const matchesSearch =
        !normalizedSearch ||
        formatActivityType(activity.activity_type)
          .toLowerCase()
          .includes(normalizedSearch) ||
        getBarangay(activity)
          ?.barangay_name?.toLowerCase()
          .includes(normalizedSearch)

      return matchesStatus && matchesSearch
    })
  }, [activities, search, statusFilter])

  /* COUNTS */

  const pendingCount = activities.filter((i) => i.status === 'PENDING').length
  const approvedCount = activities.filter((i) => i.status === 'APPROVED').length
  const conflictCount = activities.filter(
    (i) => i.conflict_status === 'DETECTED',
  ).length

  function handleCreated(evaluation?: RuleEvaluation) {
    setShowRequestModal(false)
    setRuleEvaluation(evaluation ?? null)
    void loadActivities()
  }

  /* UPCOMING */

  const now = new Date()
  const today = getTodayString()
  const currentTime = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join(':')

  const upcomingActivities = filteredActivities
    .filter((activity) => {
      if (activity.status !== 'APPROVED') return false
      if (activity.schedule_date > today) return true
      if (activity.schedule_date < today) return false
      if (!activity.end_time) return true

      const endTime =
        activity.end_time.length === 5
          ? `${activity.end_time}:00`
          : activity.end_time

      return endTime > currentTime
    })
    .sort(
      (a, b) =>
        a.schedule_date.localeCompare(b.schedule_date) ||
        (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99') ||
        a.schedule_id - b.schedule_id,
    )
    .slice(0, 5)

  return (
    <div className="min-h-screen bg-[#c9f1f7] text-[#10215f]">
      <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-9 lg:px-10">
        {/* HEADER */}

        <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="mb-1 text-sm font-semibold text-[#087db9]">
              eCHIMS Workspace
            </p>

            <h1 className="text-3xl font-black tracking-tight text-[#07145e] sm:text-4xl">
              Health Activities
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Request, review, and monitor community health activities.
            </p>
          </div>

          {canRequest && (
            <button
              type="button"
              onClick={() => {
                setRuleEvaluation(null)
                setShowRequestModal(true)
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#087db9] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#056d9e]"
            >
              <Plus size={19} />
              Request activity
            </button>
          )}
        </div>

        {/* SUMMARY */}

        <div className="mb-7 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            title={canReview ? 'Pending review' : 'Pending'}
            value={pendingCount}
            note="Requests waiting for action"
            icon={Clock3}
            iconClass="text-amber-600"
          />

          <SummaryCard
            title="Approved activities"
            value={approvedCount}
            note="Ready for implementation"
            icon={CheckCircle2}
            iconClass="text-emerald-600"
          />

          <SummaryCard
            title="Schedule conflicts"
            value={conflictCount}
            note="Overlapping schedules detected"
            icon={AlertTriangle}
            iconClass="text-[#087db9]"
          />
        </div>

        {/* RULE RESULT */}

        {ruleEvaluation?.hasConflict && (
          <div className="mb-7 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle
                className="mt-0.5 shrink-0 text-amber-600"
                size={20}
              />

              <div>
                <p className="font-semibold text-amber-900">
                  Scheduling rule triggered
                </p>

                <p className="mt-1 text-sm text-amber-800">
                  {ruleEvaluation.hasHardConflict
                    ? 'A health worker time conflict was detected. The request must be rescheduled before PHN approval.'
                    : 'Another activity overlaps in the same barangay. The PHN may review and approve the overlap if intentional.'}
                </p>

                {ruleEvaluation.suggestions?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-amber-900">
                      Suggested alternatives
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {ruleEvaluation.suggestions.map((suggestion, index) => (
                        <span
                          key={index}
                          className="rounded-lg bg-white px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200"
                        >
                          {formatDate(suggestion.suggested_date)} ·{' '}
                          {formatTime(suggestion.suggested_start_time)}
                          {' – '}
                          {formatTime(suggestion.suggested_end_time)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* UPCOMING */}

        {!loading && !error && (
          <section className="mb-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-2">
              <CalendarDays size={20} className="text-[#087db9]" />
              <h2 className="text-lg font-bold text-[#0b165d]">
                Upcoming activities
              </h2>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Next five approved activities matching your filters.
            </p>

            {upcomingActivities.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No upcoming approved activities match your filters.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingActivities.map((activity) => (
                  <button
                    key={activity.schedule_id}
                    type="button"
                    onClick={() => setSelectedActivity(activity)}
                    className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-[#087db9] hover:bg-[#f1fbfd]"
                  >
                    <p className="text-sm font-bold text-[#0b165d]">
                      {formatActivityType(activity.activity_type)}
                    </p>

                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {formatDate(activity.schedule_date)}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {formatTime(activity.start_time)}
                      {' – '}
                      {formatTime(activity.end_time)}
                    </p>

                    <p className="mt-2 text-xs font-medium text-slate-600">
                      {getBarangayName(activity)}
                    </p>

                    <div className="mt-3">
                      <StatusBadge status={activity.status} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* REQUESTS SECTION */}

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-5 pt-5 sm:px-7">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-lg font-bold text-[#0b165d]">
                  Activity requests
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review and manage submitted health activity requests.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search activity or barangay"
                    className="h-10 w-48 rounded-full bg-slate-100 pl-9 pr-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-[#087db9] sm:w-64"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void loadActivities()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5 flex gap-5 overflow-x-auto">
              {(['Requests', 'Calendar'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-semibold ${
                    activeTab === tab
                      ? 'border-[#087db9] text-[#087db9]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-52 items-center justify-center">
              <Loader2 className="animate-spin text-[#087db9]" size={28} />
            </div>
          ) : error ? (
            <div className="m-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              {error}
            </div>
          ) : activeTab === 'Calendar' ? (
            <div className="p-4 sm:p-7">
              <HealthActivityCalendar
                activities={filteredActivities}
                onSelectActivity={(activity) => setSelectedActivity(activity)}
              />
            </div>
          ) : (
            <>
              {/* STATUS PILLS */}

              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4 sm:px-7">
                {STATUS_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setStatusFilter(item.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      statusFilter === item.value
                        ? 'bg-[#e0f6fa] text-[#087db9]'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {filteredActivities.length === 0 ? (
                <div className="px-5 py-14 text-center">
                  <CalendarDays className="mx-auto text-slate-300" size={40} />
                  <h3 className="mt-4 font-semibold text-slate-800">
                    No health activities found
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Scheduled health activities will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[940px] text-left">
                    <thead className="bg-[#f7fafb] text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-7 py-4 font-semibold">Request</th>
                        <th className="px-4 py-4 font-semibold">Schedule</th>
                        <th className="px-4 py-4 font-semibold">Location</th>
                        <th className="px-4 py-4 font-semibold">Requested by</th>
                        <th className="px-4 py-4 font-semibold">Status</th>
                        <th className="px-7 py-4 text-right font-semibold">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {filteredActivities.map((activity) => {
                        const canEdit =
                          activity.status === 'NEEDS_REVISION' &&
                          activity.created_by === currentUserId

                        const canUpdateStatus =
                          activity.created_by === currentUserId &&
                          (REQUESTER_STATUS_TRANSITIONS[activity.status]
                            ?.length ?? 0) > 0

                        return (
                          <tr
                            key={activity.schedule_id}
                            className="group hover:bg-[#fafdfe]"
                          >
                            <td className="px-7 py-4">
                              <button
                                type="button"
                                onClick={() => setSelectedActivity(activity)}
                                className="text-left"
                              >
                                <p className="font-bold text-[#0b165d] group-hover:text-[#087db9]">
                                  {formatActivityType(activity.activity_type)}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                  Schedule #{activity.schedule_id}
                                </p>
                              </button>
                            </td>

                            <td className="px-4 py-4">
                              <p className="text-sm font-semibold text-slate-700">
                                {formatDate(activity.schedule_date)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatTime(activity.start_time)}
                                {' – '}
                                {formatTime(activity.end_time)}
                              </p>
                            </td>

                            <td className="px-4 py-4 text-sm font-medium text-slate-700">
                              {getBarangayName(activity)}
                            </td>

                            <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                              {activity.requested_by_name ?? '—'}
                            </td>

                            <td className="px-4 py-4">
                              <StatusBadge status={activity.status} />

                              {activity.conflict_status === 'DETECTED' && (
                                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700">
                                  <AlertTriangle size={13} />
                                  Conflict detected
                                </p>
                              )}
                            </td>

                            <td className="px-7 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                {canReview && activity.status === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={() => setReviewActivity(activity)}
                                    className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    Review
                                  </button>
                                )}

                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingActivity(activity)}
                                    className="rounded-lg bg-[#087db9] px-3 py-2 text-xs font-bold text-white hover:bg-[#056d9e]"
                                  >
                                    Edit &amp; Resubmit
                                  </button>
                                )}

                                {canUpdateStatus && (
                                  <button
                                    type="button"
                                    onClick={() => setStatusActivity(activity)}
                                    className="rounded-lg bg-[#e0f6fa] px-3 py-2 text-xs font-bold text-[#087db9] hover:bg-[#cdeff6]"
                                  >
                                    Update status
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setSelectedActivity(activity)}
                                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                >
                                  View details
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-100 px-7 py-4 text-xs text-slate-500">
                <span>
                  Showing {filteredActivities.length} of {activities.length}{' '}
                  requests
                </span>
                <span>Last synced just now</span>
              </div>
            </>
          )}
        </section>
      </div>

      {/* REQUEST MODAL */}

      {showRequestModal && role && role !== 'Administrator' && (
        <RequestActivityModal
          role={role}
          onClose={() => setShowRequestModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* DETAILS MODAL */}

      {selectedActivity && (
        <ActivityDetailsModal
          activity={selectedActivity}
          canReview={canReview}
          onClose={() => setSelectedActivity(null)}
          onReview={() => {
            setReviewActivity(selectedActivity)
            setSelectedActivity(null)
          }}
        />
      )}

      {/* REQUESTER EDIT MODAL */}

      {editingActivity && (
        <EditActivityModal
          key={editingActivity.schedule_id}
          activity={editingActivity}
          onClose={() => setEditingActivity(null)}
          onUpdated={() => {
            setEditingActivity(null)
            void loadActivities()
          }}
        />
      )}

      {/* REQUESTER STATUS MODAL */}

      {statusActivity && (
        <UpdateStatusModal
          key={statusActivity.schedule_id}
          activity={statusActivity}
          onClose={() => setStatusActivity(null)}
          onUpdated={() => {
            setStatusActivity(null)
            void loadActivities()
          }}
        />
      )}

      {/* PHN REVIEW MODAL */}

      {reviewActivity && canReview && (
        <ReviewActivityModal
          key={reviewActivity.schedule_id}
          activity={reviewActivity}
          onClose={() => setReviewActivity(null)}
          onUpdated={() => {
            setReviewActivity(null)
            void loadActivities()
          }}
        />
      )}
    </div>
  )
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({
  title,
  value,
  note,
  icon: Icon,
  iconClass,
}: {
  title: string
  value: number
  note: string
  icon: typeof Clock3
  iconClass: string
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon size={20} className={iconClass} />
      </div>

      <p className="mt-3 text-3xl font-black text-[#0a165f]">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  )
}

/* =========================================================
   EDIT & RESUBMIT MODAL
========================================================= */

function EditActivityModal({
  activity,
  onClose,
  onUpdated,
}: {
  activity: Activity
  onClose: () => void
  onUpdated: () => void
}) {
  const [date, setDate] = useState(activity.schedule_date)
  const [startTime, setStartTime] = useState(
    activity.start_time?.slice(0, 5) ?? '',
  )
  const [endTime, setEndTime] = useState(activity.end_time?.slice(0, 5) ?? '')
  const [remarks, setRemarks] = useState(activity.remarks ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleResubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submitting) return

    setError('')

    if (!date || !startTime || !endTime) {
      setError('Date, start time, and end time are required.')
      return
    }

    if (date < getTodayString()) {
      setError('Choose today or a future date.')
      return
    }

    if (endTime <= startTime) {
      setError('End time must be later than start time.')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch(
        `/api/health-activities/${activity.schedule_id}/resubmit`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduleDate: date,
            startTime,
            endTime,
            remarks,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to resubmit this activity.')
      }

      onUpdated()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to resubmit this activity.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit & Resubmit Activity"
      onClose={() => {
        if (!submitting) onClose()
      }}
    >
      <form onSubmit={handleResubmit} className="space-y-5">
        <div className="rounded-xl bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-900">
            PHN Revision Instructions
          </p>

          <p className="mt-1 whitespace-pre-wrap text-sm text-orange-800">
            {activity.review_remarks || 'Please revise the activity schedule.'}
          </p>
        </div>

        <div className="rounded-2xl bg-[#f1fbfd] p-4">
          <p className="font-bold text-[#0b165d]">
            {formatActivityType(activity.activity_type)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {getBarangayName(activity)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <input
              type="date"
              required
              min={getTodayString()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </Field>

          <Field label="Start Time">
            <input
              type="time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </Field>

          <Field label="End Time">
            <input
              type="time"
              required
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Activity Remarks">
          <textarea
            rows={3}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            disabled={submitting}
            className={textareaClass}
          />
        </Field>

        <p className="text-xs text-slate-500">
          Existing personnel assignments are retained. This request will return
          to Pending for PHN review.
        </p>

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-[#0b165d] hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full bg-[#087db9] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#056d9e] disabled:opacity-50"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? 'Resubmitting…' : 'Resubmit for Review'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

/* =========================================================
   REQUESTER STATUS MODAL
========================================================= */
function UpdateStatusModal({
  activity,
  onClose,
  onUpdated,
}: {
  activity: Activity
  onClose: () => void
  onUpdated: () => void
}) {
  const options =
    REQUESTER_STATUS_TRANSITIONS[activity.status] ?? []

  const [status, setStatus] =
    useState<RequesterStatus | ''>(options[0] ?? '')

  const [reason, setReason] = useState('')
  const [completionDate, setCompletionDate] =
    useState(getTodayString())

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (submitting || !status) return

    setError('')

    if (status === 'CANCELLED' && !reason.trim()) {
      setError('A cancellation reason is required.')
      return
    }

    if (
      status === 'COMPLETED' &&
      (
        !completionDate ||
        completionDate < activity.schedule_date ||
        completionDate > getTodayString()
      )
    ) {
      setError(
        'Completion date must be between the scheduled date and today.',
      )
      return
    }

    const action =
      status === 'ONGOING'
        ? 'START'
        : status === 'COMPLETED'
          ? 'COMPLETE'
          : 'CANCEL'

    setSubmitting(true)

    try {
      const response = await fetch(
        `/api/health-activities/${activity.schedule_id}/lifecycle`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            ...(status === 'CANCELLED'
              ? { cancellationReason: reason.trim() }
              : {}),
            ...(status === 'COMPLETED'
              ? { completionDate }
              : {}),
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ?? 'Unable to update activity status.',
        )
      }

      onUpdated()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update activity status.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Update Activity Status"
      onClose={() => {
        if (!submitting) onClose()
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="font-bold text-[#0b165d]">
            {formatActivityType(activity.activity_type)}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {getBarangayName(activity)} ·{' '}
            {formatDate(activity.schedule_date)}
          </p>

          <div className="mt-3">
            <StatusBadge status={activity.status} />
          </div>
        </div>

        <Field label="New status">
          <select
            required
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as RequesterStatus,
              )
            }
            disabled={submitting}
            className={inputClass}
          >
            {options.length === 0 && (
              <option value="">
                No status changes available
              </option>
            )}

            {options.map((item) => (
              <option key={item} value={item}>
                {STATUS_LABELS[item]}
              </option>
            ))}
          </select>
        </Field>

        {status === 'CANCELLED' && (
          <Field label="Cancellation reason">
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(event) =>
                setReason(event.target.value)
              }
              disabled={submitting}
              placeholder="Explain why the activity is being cancelled"
              className={textareaClass}
            />
          </Field>
        )}

        {status === 'COMPLETED' && (
          <Field label="Actual completion date">
            <input
              required
              type="date"
              min={activity.schedule_date}
              max={getTodayString()}
              value={completionDate}
              onChange={(event) =>
                setCompletionDate(event.target.value)
              }
              disabled={submitting}
              className={inputClass}
            />
          </Field>
        )}

        {(status === 'CANCELLED' ||
          status === 'COMPLETED') && (
          <p className="text-xs text-slate-500">
            Cancelled and completed activities cannot
            be edited or reopened.
          </p>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-[#0b165d] hover:bg-slate-50 disabled:opacity-50"
          >
            Back
          </button>

          <button
            type="submit"
            disabled={submitting || !status}
            className="inline-flex items-center gap-2 rounded-full bg-[#087db9] px-5 py-2 text-sm font-bold text-white hover:bg-[#056d9e] disabled:opacity-50"
          >
            {submitting && (
              <Loader2
                size={16}
                className="animate-spin"
              />
            )}
            {submitting ? 'Saving…' : 'Save status'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

/* =========================================================
   REQUEST ACTIVITY MODAL
   Paste this above "PHN REVIEW MODAL" in health-activities-client.tsx
========================================================= */

function RequestActivityModal({
  role,
  onClose,
  onCreated,
}: {
  role: HealthWorkerRole
  onClose: () => void
  onCreated: (evaluation?: RuleEvaluation) => void
}) {
  const [barangays, setBarangays] = useState<Barangay[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const minDate = getTodayString()

  const allowedActivityTypes = ACTIVITY_TYPES_BY_ROLE[role]

  const availableActivityTypes = ACTIVITY_TYPES.filter((item) =>
    allowedActivityTypes.includes(item.value),
  )

  /*
   * PHN: all barangays inside PHN RHU.
   * RHM/BHW/BNS: active assigned barangays.
   */
  useEffect(() => {
    let cancelled = false

    async function loadOptions() {
      setLoadingOptions(true)
      setError('')

      try {
        const response = await fetch('/api/health-activities/options', {
          method: 'GET',
          cache: 'no-store',
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error ?? 'Unable to load assigned barangays.')
        }

        if (!cancelled) setBarangays(data.barangays ?? [])
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load assigned barangays.',
          )
        }
      } finally {
        if (!cancelled) setLoadingOptions(false)
      }
    }

    void loadOptions()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loadingOptions || barangays.length === 0) return

    setSubmitting(true)
    setError('')

    const formData = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/health-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityType: formData.get('activityType'),
          barangayId: Number(formData.get('barangayId')),
          scheduleDate: formData.get('scheduleDate'),
          startTime: formData.get('startTime'),
          endTime: formData.get('endTime'),
          remarks: formData.get('remarks'),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to submit request.')
      }

      onCreated(data.ruleEvaluation)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to submit request.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Request Health Activity" onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="rounded-2xl bg-[#f1fbfd] px-3 py-3">
          <p className="text-xs font-medium uppercase text-slate-400">
            Requesting as
          </p>
          <p className="mt-1 text-sm font-bold text-[#0b165d]">{role}</p>
        </div>

        <Field label="Activity Type">
          <select name="activityType" required className={inputClass}>
            <option value="">Select activity</option>

            {availableActivityTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Barangay">
          <select
            name="barangayId"
            required
            disabled={loadingOptions || barangays.length === 0}
            className={inputClass}
          >
            <option value="">
              {loadingOptions
                ? 'Loading assigned barangays...'
                : barangays.length === 0
                  ? 'No assigned barangay available'
                  : 'Select barangay'}
            </option>

            {barangays.map((barangay) => (
              <option key={barangay.barangay_id} value={barangay.barangay_id}>
                {barangay.barangay_name}
                {barangay.municipality ? ` — ${barangay.municipality}` : ''}
              </option>
            ))}
          </select>

          {loadingOptions && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              Loading your geographic scope...
            </div>
          )}

          {!loadingOptions && barangays.length === 0 && (
            <p className="mt-2 text-xs text-amber-700">
              No active barangay assignment is available for your account.
            </p>
          )}
        </Field>

        <Field label="Date">
          <input
            type="date"
            name="scheduleDate"
            min={minDate}
            required
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start Time">
            <input type="time" name="startTime" required className={inputClass} />
          </Field>

          <Field label="End Time">
            <input type="time" name="endTime" required className={inputClass} />
          </Field>
        </div>

        <Field label="Remarks">
          <textarea
            name="remarks"
            placeholder="Activity details or notes"
            className={textareaClass}
          />
        </Field>

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-[#0b165d] hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting || loadingOptions || barangays.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#087db9] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#056d9e] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
/* =========================================================
   PHN REVIEW MODAL
========================================================= */

function ReviewActivityModal({
  activity,
  onClose,
  onUpdated,
}: {
  activity: Activity
  onClose: () => void
  onUpdated: () => void
}) {
  const [remarks, setRemarks] = useState('')
  const [date, setDate] = useState(activity.schedule_date)
  const [startTime, setStartTime] = useState(activity.start_time ?? '')
  const [endTime, setEndTime] = useState(activity.end_time ?? '')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  const minDate = getTodayString()

  async function review(action: 'APPROVE' | 'REJECT' | 'RESCHEDULE') {
    if (action === 'REJECT' && !remarks.trim()) {
      setError('A reason is required when rejecting an activity request.')
      return
    }

    setLoadingAction(action)
    setError('')
    setSuggestions([])

    try {
      const response = await fetch(
        `/api/health-activities/${activity.schedule_id}/review`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            reviewRemarks: remarks,
            scheduleDate: date,
            startTime,
            endTime,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        setSuggestions(data.suggestions ?? [])
        throw new Error(data.error ?? 'Unable to review activity.')
      }

      /*
       * RESCHEDULE may succeed while still returning warnings or a
       * hard conflict. Keep the modal open so the PHN can see and
       * choose an alternative.
       */
      if (action === 'RESCHEDULE' && data.ruleEvaluation?.hasConflict) {
        setSuggestions(data.ruleEvaluation.suggestions ?? [])
        setError(data.message)
        return
      }

      onUpdated()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to review activity.',
      )
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <ModalShell title="Review Health Activity" onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-bold text-[#0b165d]">
                {formatActivityType(activity.activity_type)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {getBarangayName(activity)}
              </p>
            </div>

            <StatusBadge status={activity.status} />
          </div>
        </div>

        {activity.conflict_status === 'DETECTED' && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle size={18} className="shrink-0" />
            <span>
              This request has a scheduling conflict. The rule engine will
              evaluate it again before approval.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Date">
            <input
              type="date"
              min={minDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Start">
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="End">
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="PHN Remarks">
          <textarea
            rows={4}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Approval, rescheduling, or rejection remarks"
            className={textareaClass}
          />
        </Field>

        <p className="text-xs text-slate-400">
          Rejection requires a reason. Approval remarks are optional.
        </p>

        {suggestions.length > 0 && (
          <div>
            <p className="text-sm font-bold text-[#0b165d]">
              Suggested available schedules
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Select an alternative to copy it into the reschedule fields.
            </p>

            <div className="mt-2 space-y-2">
              {suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  key={index}
                  onClick={() => {
                    setDate(suggestion.suggested_date)
                    setStartTime(suggestion.suggested_start_time)
                    setEndTime(suggestion.suggested_end_time)
                    setError('')
                  }}
                  className="w-full rounded-xl border border-slate-200 p-3 text-left text-sm hover:border-[#087db9] hover:bg-[#f1fbfd]"
                >
                  {formatDate(suggestion.suggested_date)}
                  {' · '}
                  {formatTime(suggestion.suggested_start_time)}
                  {' – '}
                  {formatTime(suggestion.suggested_end_time)}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
          <ActionButton
            label="Reject"
            icon={XCircle}
            loading={loadingAction === 'REJECT'}
            disabled={loadingAction !== null}
            onClick={() => void review('REJECT')}
            className="border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
          />

          <ActionButton
            label="Reschedule"
            icon={CalendarDays}
            loading={loadingAction === 'RESCHEDULE'}
            disabled={loadingAction !== null}
            onClick={() => void review('RESCHEDULE')}
            className="border border-[#087db9] bg-white text-[#087db9] hover:bg-[#f1fbfd]"
          />

          <ActionButton
            label="Approve"
            icon={CheckCircle2}
            loading={loadingAction === 'APPROVE'}
            disabled={loadingAction !== null}
            onClick={() => void review('APPROVE')}
            className="bg-[#087db9] text-white shadow-sm hover:bg-[#056d9e]"
          />
        </div>
      </div>
    </ModalShell>
  )
}

/* =========================================================
   SHARED COMPONENTS
========================================================= */

const inputClass = `
  h-11 w-full rounded-full
  border border-slate-200 bg-white px-4
  text-sm font-normal text-slate-800
  outline-none
  disabled:cursor-not-allowed
  disabled:bg-slate-50
  disabled:text-slate-400
  focus:ring-2 focus:ring-[#087db9]
`

const textareaClass = `
  min-h-24 w-full rounded-2xl
  border border-slate-200 bg-white p-3
  text-sm font-normal text-slate-800
  outline-none
  disabled:cursor-not-allowed
  disabled:bg-slate-50
  focus:ring-2 focus:ring-[#087db9]
`

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  )
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
    >
      <XCircle size={17} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

/* =========================================================
   MODAL SHELL
========================================================= */

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between border-b border-slate-100 pb-5">
          <h2 className="text-lg font-black text-[#0b165d]">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}

/* =========================================================
   ACTION BUTTON
========================================================= */

function ActionButton({
  label,
  icon: Icon,
  loading,
  disabled,
  onClick,
  className,
}: {
  label: string
  icon: typeof CheckCircle2
  loading: boolean
  disabled: boolean
  onClick: () => void
  className: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Icon size={16} />
      )}

      {label}
    </button>
  )
} 