'use client'

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
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

type Role =
  | 'Administrator'
  | 'PHN'
  | 'RHM'
  | 'BHW'
  | 'BNS'

type HealthWorkerRole =
  | 'PHN'
  | 'RHM'
  | 'BHW'
  | 'BNS'

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

type ConflictStatus =
  | 'NONE'
  | 'DETECTED'
  | 'RESOLVED'

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

type PersonnelOption = {
  user_id: string
  full_name: string
  role: string
}

type CalendarView = 'MONTH' | 'WEEK' | 'DAY'

/* =========================================================
   ACTIVITY CONFIGURATION
========================================================= */

const ACTIVITY_TYPES: {
  value: ActivityType
  label: string
}[] = [
  {
    value: 'VACCINATION',
    label: 'Vaccination',
  },
  {
    value: 'NUTRITIONAL_ASSESSMENT',
    label: 'Nutritional Assessment',
  },
  {
    value: 'SUPPLEMENTATION',
    label: 'Supplementation',
  },
]

const ACTIVITY_TYPES_BY_ROLE: Record<
  HealthWorkerRole,
  ActivityType[]
> = {
  PHN: [
    'VACCINATION',
    'NUTRITIONAL_ASSESSMENT',
    'SUPPLEMENTATION',
  ],

  RHM: [
    'VACCINATION',
    'NUTRITIONAL_ASSESSMENT',
    'SUPPLEMENTATION',
  ],

  BHW: ['VACCINATION'],

  BNS: [
    'NUTRITIONAL_ASSESSMENT',
    'SUPPLEMENTATION',
  ],
}

/* =========================================================
   HELPERS
========================================================= */

function getBarangay(
  activity: Activity
): Barangay | null {
  if (!activity.barangay) {
    return null
  }

  if (Array.isArray(activity.barangay)) {
    return activity.barangay[0] ?? null
  }

  return activity.barangay
}

function formatActivityType(
  value: string
) {
  return (
    ACTIVITY_TYPES.find(
      (item) => item.value === value
    )?.label ??
    value.replaceAll('_', ' ')
  )
}

function formatTime(
  value: string | null
) {
  if (!value) {
    return '—'
  }

  const [hours, minutes] =
    value.split(':')

  const date = new Date()

  date.setHours(
    Number(hours),
    Number(minutes),
    0,
    0
  )

  return date.toLocaleTimeString(
    [],
    {
      hour: 'numeric',
      minute: '2-digit',
    }
  )
}

function formatDate(value: string) {
  const date = new Date(
    `${value}T00:00:00`
  )

  return date.toLocaleDateString(
    [],
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  )
}

function getTodayString() {
  const today = new Date()

  return [
    today.getFullYear(),
    String(
      today.getMonth() + 1
    ).padStart(2, '0'),
    String(
      today.getDate()
    ).padStart(2, '0'),
  ].join('-')
}

/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({
  status,
}: {
  status: ActivityStatus
}) {
  const styles: Record<
    ActivityStatus,
    string
  > = {
    PENDING:
      'bg-amber-50 text-amber-700 ring-amber-200',

    APPROVED:
      'bg-emerald-50 text-emerald-700 ring-emerald-200',

    REJECTED:
      'bg-red-50 text-red-700 ring-red-200',

    ONGOING:
      'bg-blue-50 text-blue-700 ring-blue-200',

    COMPLETED:
      'bg-slate-100 text-slate-700 ring-slate-200',

    CANCELLED:
      'bg-gray-100 text-gray-600 ring-gray-200',
  }

  return (
    <span
      className={`
        inline-flex rounded-full
        px-2.5 py-1
        text-xs font-semibold
        ring-1 ring-inset
        ${styles[status]}
      `}
    >
      {status}
    </span>
  )
}

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
    {
      label: 'Activity',
      value: formatActivityType(activity.activity_type),
    },
    {
      label: 'Date',
      value: formatDate(activity.schedule_date),
    },
    {
      label: 'Time',
      value:
        activity.start_time || activity.end_time
          ? `${formatTime(activity.start_time)} – ${formatTime(
              activity.end_time,
            )}`
          : 'Time not specified',
    },
    {
      label: 'Location / Barangay',
      value: [
        barangay?.barangay_name ??
          `Barangay ${activity.barangay_id}`,
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
    <ModalShell
      title="Health Activity Details"
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Schedule #{activity.schedule_id}
          </p>

          <StatusBadge status={activity.status} />
        </div>

        <dl className="grid gap-4 rounded-xl bg-[#F7F9FA] p-4 sm:grid-cols-2">
          {details.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-gray-500">
                {label}
              </dt>

              <dd className="mt-1 break-words text-sm font-semibold text-gray-800">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="text-sm font-semibold text-gray-700">
            Activity Remarks
          </p>

          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">
            {activity.remarks?.trim() || 'No remarks provided.'}
          </p>
        </div>

        {activity.review_remarks?.trim() && (
          <div>
            <p className="text-sm font-semibold text-gray-700">
              PHN Review Remarks
            </p>

            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">
              {activity.review_remarks}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            Close
          </button>

          {canReview && activity.status === 'PENDING' && (
            <button
              type="button"
              onClick={onReview}
              className="rounded-xl bg-[#087DB9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#056d9e]"
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
  const [showCalendar, setShowCalendar] = useState(false)
  
  const [
    activities,
    setActivities,
  ] = useState<Activity[]>([])

  const [role, setRole] =
    useState<Role | null>(null)

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [
    statusFilter,
    setStatusFilter,
  ] = useState('ALL')

  const [
    showRequestModal,
    setShowRequestModal,
  ] = useState(false)

  const [
    selectedActivity,
    setSelectedActivity,
  ] = useState<Activity | null>(
    null
  )

  const [reviewActivity, setReviewActivity] =
  useState<Activity | null>(null)

  const [
    ruleEvaluation,
    setRuleEvaluation,
  ] =
    useState<RuleEvaluation | null>(
      null
    )

    /* -----------------------------------------------------
     LOAD ACTIVITIES
  ----------------------------------------------------- */

  const loadActivities =
    useCallback(async () => {
      setLoading(true)
      setError('')

      try {
        const response =
          await fetch(
            '/api/health-activities',
            {
              method: 'GET',
              cache: 'no-store',
            }
          )

        const data =
          await response.json()

        if (!response.ok) {
          throw new Error(
            data.error ??
              'Unable to load health activities.'
          )
        }

        setActivities(
          data.activities ?? []
        )

        setRole(
          data.role ?? null
        )
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load health activities.'
        )
      } finally {
        setLoading(false)
      }
    }, [])

  useEffect(() => {
    void loadActivities()
  }, [loadActivities])

  /* -----------------------------------------------------
     PERMISSIONS
  ----------------------------------------------------- */

  const canRequest =
    role === 'PHN' ||
    role === 'RHM' ||
    role === 'BHW' ||
    role === 'BNS'

  const canReview =
    role === 'PHN'

  /* -----------------------------------------------------
     FILTER ACTIVITIES
  ----------------------------------------------------- */

  const filteredActivities =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase()

      return activities.filter(
        (activity) => {
          const barangay =
            getBarangay(activity)

          const matchesStatus =
            statusFilter ===
              'ALL' ||
            activity.status ===
              statusFilter

          const matchesSearch =
            !normalizedSearch ||
            formatActivityType(
              activity.activity_type
            )
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            barangay
              ?.barangay_name
              ?.toLowerCase()
              .includes(
                normalizedSearch
              )
              
          return (
            matchesStatus &&
            matchesSearch
          )
        }
      )
    }, [
      activities,
      search,
      statusFilter,
    ])

  /* -----------------------------------------------------
     COUNTS
  ----------------------------------------------------- */

  const pendingCount =
    activities.filter(
      (item) =>
        item.status ===
        'PENDING'
    ).length

  const approvedCount =
    activities.filter(
      (item) =>
        item.status ===
        'APPROVED'
    ).length

  const conflictCount =
    activities.filter(
      (item) =>
        item.conflict_status ===
        'DETECTED'
    ).length

  /* -----------------------------------------------------
     REQUEST CREATED
  ----------------------------------------------------- */

  function handleCreated(
    evaluation?: RuleEvaluation
  ) {
    setShowRequestModal(false)

    setRuleEvaluation(
      evaluation ?? null
    )

    void loadActivities()
  }

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

    // Keep today's activities without an end time.
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
      (a.start_time ?? '99:99').localeCompare(
        b.start_time ?? '99:99',
      ) ||
      a.schedule_id - b.schedule_id,
  )
  .slice(0, 5)

  return (
    <div className="min-h-screen bg-[#F7F9FA]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* HEADER */}

        <div
          className="
            flex flex-col gap-4
            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >
          <div>
            <h1 className="text-2xl font-bold text-[#03045E] sm:text-3xl">
              Health Activities
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Schedule, review, and
              monitor community health
              activities.
            </p>
          </div>


          {/* CALENDAR BUTTON */}
          <div className="flex flex-wrap items-center gap-2">
            {/* CALENDAR TOGGLE */}
            <button
              type="button"
              onClick={() => setShowCalendar((previous) => !previous)}
              aria-pressed={showCalendar}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#087DB9] bg-white px-4 py-3 text-sm font-semibold text-[#087DB9] hover:bg-[#F4FBFD]"
            >
              <CalendarDays size={18} />
              {showCalendar ? 'Show List' : 'Calendar'}
            </button>

            {canRequest && (
              <button
                type="button"
                onClick={() => {
                  setRuleEvaluation(null)
                  setShowRequestModal(true)
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#087DB9] px-4 py-3 text-sm font-semibold text-white hover:bg-[#056d9e]"
              >
                <Plus size={18} />
                Request Activity
              </button>
            )}
          </div>
          </div>

        {/* SUMMARY */}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard
            title={
              canReview
                ? 'Pending Review'
                : 'Pending'
            }
            value={pendingCount}
            icon={Clock3}
          />

          <SummaryCard
            title="Approved"
            value={approvedCount}
            icon={CheckCircle2}
          />

          <SummaryCard
            title="Schedule Conflicts"
            value={conflictCount}
            icon={AlertTriangle}
          />
        </div>

        {/* RULE RESULT */}

        {ruleEvaluation
          ?.hasConflict && (
          <div
            className="
              mt-6 rounded-2xl
              border border-amber-200
              bg-amber-50 p-4
            "
          >
            <div className="flex gap-3">
              <AlertTriangle
                className="mt-0.5 shrink-0 text-amber-600"
                size={20}
              />

              <div>
                <p className="font-semibold text-amber-900">
                  Scheduling rule
                  triggered
                </p>

                <p className="mt-1 text-sm text-amber-800">
                  {ruleEvaluation
                    .hasHardConflict
                    ? 'A health worker time conflict was detected. The request must be rescheduled before PHN approval.'
                    : 'Another activity overlaps in the same barangay. The PHN may review and approve the overlap if intentional.'}
                </p>

                {ruleEvaluation
                  .suggestions
                  ?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-amber-900">
                      Suggested
                      alternatives
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {ruleEvaluation
                        .suggestions
                        .map(
                          (
                            suggestion,
                            index
                          ) => (
                            <span
                              key={
                                index
                              }
                              className="
                                rounded-lg
                                bg-white
                                px-3 py-2
                                text-xs
                                text-amber-900
                                ring-1
                                ring-amber-200
                              "
                            >
                              {formatDate(
                                suggestion.suggested_date
                              )}{' '}
                              ·{' '}
                              {formatTime(
                                suggestion.suggested_start_time
                              )}
                              {' – '}
                              {formatTime(
                                suggestion.suggested_end_time
                              )}
                            </span>
                          )
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* FILTERS */}

        <div
          className="
            mt-6 flex flex-col
            gap-3 rounded-2xl
            bg-white p-4
            ring-1 ring-gray-200
            sm:flex-row
          "
        >
          <div className="relative flex-1">
            <Search
              size={18}
              className="
                absolute left-3 top-1/2
                -translate-y-1/2
                text-gray-400
              "
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search activity or barangay"
              className="
                w-full rounded-xl
                border border-gray-200
                py-2.5 pl-10 pr-3
                text-sm outline-none
                focus:border-[#087DB9]
              "
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value
              )
            }
            className="
              rounded-xl
              border border-gray-200
              bg-white px-3 py-2.5
              text-sm outline-none
              focus:border-[#087DB9]
            "
          >
            <option value="ALL">
              All Statuses
            </option>

            <option value="PENDING">
              Pending
            </option>

            <option value="APPROVED">
              Approved
            </option>

            <option value="REJECTED">
              Rejected
            </option>

            <option value="ONGOING">
              Ongoing
            </option>

            <option value="COMPLETED">
              Completed
            </option>

            <option value="CANCELLED">
              Cancelled
            </option>
          </select>
          
          <button
            type="button"
            onClick={() =>
              void loadActivities()
            }
            className="
              inline-flex items-center
              justify-center gap-2
              rounded-xl border
              border-gray-200
              px-4 py-2.5
              text-sm font-medium
              hover:bg-gray-50
            "
          >
            <RefreshCw size={16} />

            Refresh
          </button>
          
        </div>


{/* UPCOMING ACTIVITIES */}
{!loading && !error && (
  <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-gray-200">
    <div className="flex items-center gap-2">
      <CalendarDays size={20} className="text-[#087DB9]" />

      <h2 className="font-bold text-[#03045E]">
        Upcoming Activities
      </h2>
    </div>

    <p className="mt-1 text-xs text-gray-500">
      Next five approved activities matching your filters.
    </p>

    {upcomingActivities.length === 0 ? (
      <p className="mt-4 text-sm text-gray-500">
        No upcoming approved activities match your filters.
      </p>
    ) : (
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {upcomingActivities.map((activity) => (
          <button
            key={activity.schedule_id}
            type="button"
            onClick={() => setSelectedActivity(activity)}
            className="rounded-xl border border-gray-200 p-4 text-left transition hover:border-[#087DB9] hover:bg-[#F4FBFD]"
          >
            <p className="text-sm font-semibold text-[#03045E]">
              {formatActivityType(activity.activity_type)}
            </p>

            <p className="mt-2 text-sm text-gray-600">
              {formatDate(activity.schedule_date)}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              {formatTime(activity.start_time)}
              {' – '}
              {formatTime(activity.end_time)}
            </p>

            <p className="mt-2 text-xs text-gray-600">
              {getBarangay(activity)?.barangay_name ??
                `Barangay ${activity.barangay_id}`}
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

        {/* CONTENT */}

        <div className="mt-5">
          {loading ? (
            <div className="flex min-h-52 items-center justify-center">
              <Loader2
                className="animate-spin text-[#087DB9]"
                size={28}
              />
            </div>
          ) : error ? (
            <div
              className="
                rounded-2xl
                border border-red-200
                bg-red-50 p-5
                text-sm text-red-700
              "
            >
              {error}
            </div>
                    ) : showCalendar ? (
            <HealthActivityCalendar
              activities={filteredActivities}
              onSelectActivity={(activity) =>
                setSelectedActivity(activity)
              }
            />
          ) : filteredActivities.length === 0 ? (
            <div
              className="
                rounded-2xl bg-white
                px-5 py-14
                text-center
                ring-1 ring-gray-200
              "
            >
              <CalendarDays
                className="mx-auto text-gray-300"
                size={40}
              />

              <h2 className="mt-4 font-semibold text-gray-800">
                No health activities
                found
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Scheduled health
                activities will appear
                here.
              </p>
            </div>
          ) : (
            <div
              className="
                grid grid-cols-1
                gap-4
                md:grid-cols-2
                xl:grid-cols-3
              "
            >
              {filteredActivities.map(
                (activity) => (
                  <ActivityCard
                    key={
                      activity.schedule_id
                    }
                    activity={
                      activity
                    }
                    canReview={
                      canReview
                    }
                    onReview={() =>
                      setReviewActivity(
                        activity
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* REQUEST MODAL */}

      {showRequestModal &&
        role &&
        role !==
          'Administrator' && (
          <RequestActivityModal
            role={role}
            onClose={() =>
              setShowRequestModal(
                false
              )
            }
            onCreated={
              handleCreated
            }
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
  icon: Icon,
}: {
  title: string
  value: number
  icon: typeof Clock3
}) {
  return (
    <div
      className="
        rounded-2xl bg-white
        p-4 ring-1 ring-gray-200
        sm:p-5
      "
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {title}
          </p>

          <p className="mt-1 text-2xl font-bold text-[#03045E]">
            {value}
          </p>
        </div>

        <div
          className="
            flex h-10 w-10
            items-center justify-center
            rounded-xl bg-[#E5F5FA]
            text-[#087DB9]
          "
        >
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   ACTIVITY CARD
========================================================= */

function ActivityCard({
  activity,
  canReview,
  onReview,
}: {
  activity: Activity
  canReview: boolean
  onReview: () => void
}) {
  const barangay =
    getBarangay(activity)

  return (
    <article
      className="
        rounded-2xl bg-white
        p-5 ring-1 ring-gray-200
      "
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-[#03045E]">
            {formatActivityType(
              activity.activity_type
            )}
          </p>

          <p className="mt-1 text-xs text-gray-400">
            Schedule #
            {activity.schedule_id}
          </p>
        </div>

        <StatusBadge
          status={
            activity.status
          }
        />
      </div>

      <div className="mt-5 space-y-3 text-sm text-gray-600">
        <div className="flex gap-2">
          <CalendarDays
            size={17}
            className="shrink-0 text-[#087DB9]"
          />

          {formatDate(
            activity.schedule_date
          )}
        </div>

        <div className="flex gap-2">
          <Clock3
            size={17}
            className="shrink-0 text-[#087DB9]"
          />

          {formatTime(
            activity.start_time
          )}

          {' – '}

          {formatTime(
            activity.end_time
          )}
        </div>

        <div className="flex gap-2">
          <MapPin
            size={17}
            className="shrink-0 text-[#087DB9]"
          />

          {barangay
            ?.barangay_name ??
            `Barangay ${activity.barangay_id}`}
        </div>
      </div>

      {activity.conflict_status ===
        'DETECTED' && (
        <div
          className="
            mt-4 flex gap-2
            rounded-xl bg-amber-50
            p-3 text-xs
            text-amber-800
          "
        >
          <AlertTriangle
            size={16}
            className="shrink-0"
          />

          Scheduling conflict
          detected
        </div>
      )}

      {activity.remarks && (
        <p
          className="
            mt-4 line-clamp-3
            text-sm leading-6
            text-gray-500
          "
        >
          {activity.remarks}
        </p>
      )}

      {activity.review_remarks &&
        activity.status !==
          'PENDING' && (
          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Review remarks
            </p>

            <p className="mt-1 text-sm text-gray-600">
              {
                activity.review_remarks
              }
            </p>
          </div>
        )}

      {canReview &&
        activity.status ===
          'PENDING' && (
          <button
            type="button"
            onClick={onReview}
            className="
              mt-5 w-full
              rounded-xl
              bg-[#087DB9]
              px-4 py-2.5
              text-sm font-semibold
              text-white
              hover:bg-[#056d9e]
            "
          >
            Review Request
          </button>
        )}
    </article>
  )
}

/* =========================================================
   REQUEST ACTIVITY MODAL
========================================================= */

function RequestActivityModal({
  role,
  onClose,
  onCreated,
}: {
  role: HealthWorkerRole

  onClose: () => void

  onCreated: (
    evaluation?: RuleEvaluation
  ) => void
}) {
  const [
    barangays,
    setBarangays,
  ] = useState<Barangay[]>([])

  const [
    loadingOptions,
    setLoadingOptions,
  ] = useState(true)

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [error, setError] =
    useState('')

  const minDate =
    getTodayString()

  /* -----------------------------------------------------
     ROLE-AWARE ACTIVITY TYPES
  ----------------------------------------------------- */

  const allowedActivityTypes =
    ACTIVITY_TYPES_BY_ROLE[
      role
    ]

  const availableActivityTypes =
    ACTIVITY_TYPES.filter(
      (item) =>
        allowedActivityTypes.includes(
          item.value
        )
    )

  /* -----------------------------------------------------
     LOAD ALLOWED BARANGAYS

     PHN:
     all barangays inside PHN RHU.

     RHM/BHW/BNS:
     active assigned barangays.
  ----------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    async function loadOptions() {
      setLoadingOptions(true)
      setError('')

      try {
        const response =
          await fetch(
            '/api/health-activities/options',
            {
              method: 'GET',
              cache: 'no-store',
            }
          )

        const data =
          await response.json()

        if (!response.ok) {
          throw new Error(
            data.error ??
              'Unable to load assigned barangays.'
          )
        }

        if (!cancelled) {
          setBarangays(
            data.barangays ??
              []
          )
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load assigned barangays.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingOptions(
            false
          )
        }
      }
    }

    void loadOptions()

    return () => {
      cancelled = true
    }
  }, [])

  /* -----------------------------------------------------
     SUBMIT REQUEST
  ----------------------------------------------------- */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    if (
      loadingOptions ||
      barangays.length === 0
    ) {
      return
    }

    setSubmitting(true)
    setError('')

    const formData =
      new FormData(
        event.currentTarget
      )

    try {
      const response =
        await fetch(
          '/api/health-activities',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              {
                activityType:
                  formData.get(
                    'activityType'
                  ),

                barangayId:
                  Number(
                    formData.get(
                      'barangayId'
                    )
                  ),

                scheduleDate:
                  formData.get(
                    'scheduleDate'
                  ),

                startTime:
                  formData.get(
                    'startTime'
                  ),

                endTime:
                  formData.get(
                    'endTime'
                  ),

                remarks:
                  formData.get(
                    'remarks'
                  ),
              }
            ),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Unable to submit request.'
        )
      }

      onCreated(
        data.ruleEvaluation
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to submit request.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Request Health Activity"
      onClose={onClose}
    >
      <form
        onSubmit={
          handleSubmit
        }
        className="space-y-4"
      >
        {/* ROLE */}

        <div className="rounded-xl bg-[#F4FBFD] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Requesting as
          </p>

          <p className="mt-1 text-sm font-semibold text-[#03045E]">
            {role}
          </p>
        </div>

        {/* ACTIVITY TYPE */}

        <Field label="Activity Type">
          <select
            name="activityType"
            required
            className={
              inputClass
            }
          >
            <option value="">
              Select activity
            </option>

            {availableActivityTypes.map(
              (item) => (
                <option
                  key={
                    item.value
                  }
                  value={
                    item.value
                  }
                >
                  {
                    item.label
                  }
                </option>
              )
            )}
          </select>
        </Field>

        {/* BARANGAY */}

        <Field label="Barangay">
          <select
            name="barangayId"
            required
            disabled={
              loadingOptions ||
              barangays.length ===
                0
            }
            className={
              inputClass
            }
          >
            <option value="">
              {loadingOptions
                ? 'Loading assigned barangays...'
                : barangays.length ===
                    0
                  ? 'No assigned barangay available'
                  : 'Select barangay'}
            </option>

            {barangays.map(
              (barangay) => (
                <option
                  key={
                    barangay.barangay_id
                  }
                  value={
                    barangay.barangay_id
                  }
                >
                  {
                    barangay.barangay_name
                  }

                  {barangay.municipality
                    ? ` — ${barangay.municipality}`
                    : ''}
                </option>
              )
            )}
          </select>

          {loadingOptions && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <Loader2
                size={14}
                className="animate-spin"
              />

              Loading your
              geographic scope...
            </div>
          )}

          {!loadingOptions &&
            barangays.length ===
              0 && (
              <p className="mt-2 text-xs text-amber-700">
                No active barangay
                assignment is
                available for your
                account.
              </p>
            )}
        </Field>

        {/* DATE */}

        <Field label="Date">
          <input
            type="date"
            name="scheduleDate"
            min={minDate}
            required
            className={
              inputClass
            }
          />
        </Field>

        {/* TIME */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start Time">
            <input
              type="time"
              name="startTime"
              required
              className={
                inputClass
              }
            />
          </Field>

          <Field label="End Time">
            <input
              type="time"
              name="endTime"
              required
              className={
                inputClass
              }
            />
          </Field>
        </div>

        {/* REMARKS */}

        <Field label="Remarks">
          <textarea
            name="remarks"
            rows={4}
            placeholder="Activity details or notes"
            className={
              inputClass
            }
          />
        </Field>

        {/* ERROR */}

        {error && (
          <div
            className="
              flex gap-2
              rounded-xl bg-red-50
              p-3 text-sm
              text-red-700
            "
          >
            <XCircle
              size={17}
              className="mt-0.5 shrink-0"
            />

            <span>
              {error}
            </span>
          </div>
        )}

        {/* ACTIONS */}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={
              submitting
            }
            className="
              rounded-xl border
              border-gray-200
              px-4 py-2.5
              text-sm font-semibold
              hover:bg-gray-50
              disabled:opacity-50
            "
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              submitting ||
              loadingOptions ||
              barangays.length ===
                0
            }
            className="
              inline-flex items-center
              justify-center gap-2
              rounded-xl bg-[#087DB9]
              px-4 py-2.5
              text-sm font-semibold
              text-white
              hover:bg-[#056d9e]
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            {submitting && (
              <Loader2
                size={16}
                className="animate-spin"
              />
            )}

            {submitting
              ? 'Submitting...'
              : 'Submit Request'}
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
  const [
    remarks,
    setRemarks,
  ] = useState('')

  const [date, setDate] =
    useState(
      activity.schedule_date
    )

  const [
    startTime,
    setStartTime,
  ] = useState(
    activity.start_time ?? ''
  )

  const [
    endTime,
    setEndTime,
  ] = useState(
    activity.end_time ?? ''
  )

  const [
    loadingAction,
    setLoadingAction,
  ] = useState<string | null>(
    null
  )

  const [error, setError] =
    useState('')

  const [
    suggestions,
    setSuggestions,
  ] = useState<Suggestion[]>([])

  const minDate =
    getTodayString()

  async function review(
    action:
      | 'APPROVE'
      | 'REJECT'
      | 'RESCHEDULE'
  ) {
    
    if (
      action === 'REJECT' &&
      !remarks.trim()
    ) {
      setError(
        'A reason is required when rejecting an activity request.'
      )

      return
    }

    setLoadingAction(action)
    setError('')
    setSuggestions([])

    try {
      const response =
        await fetch(
          `/api/health-activities/${activity.schedule_id}/review`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              {
                action,

                reviewRemarks:
                  remarks,

                scheduleDate:
                  date,

                startTime,

                endTime,
              }
            ),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        setSuggestions(
          data.suggestions ??
            []
        )

        throw new Error(
          data.error ??
            'Unable to review activity.'
        )
      }

      /*
       * RESCHEDULE may succeed while
       * still returning warnings or a
       * hard conflict. Keep the modal
       * open so the PHN can see and
       * choose an alternative.
       */
      if (
        action ===
          'RESCHEDULE' &&
        data.ruleEvaluation
          ?.hasConflict
      ) {
        setSuggestions(
          data.ruleEvaluation
            .suggestions ??
            []
        )

        setError(
          data.message
        )

        return
      }

      onUpdated()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to review activity.'
      )
    } finally {
      setLoadingAction(
        null
      )
    }
  }

  return (
    <ModalShell
      title="Review Health Activity"
      onClose={onClose}
    >
      <div className="space-y-5">
        {/* ACTIVITY DETAILS */}

        <div
          className="
            rounded-xl
            bg-[#F7F9FA]
            p-4
          "
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-bold text-[#03045E]">
                {formatActivityType(
                  activity.activity_type
                )}
              </p>

              <p className="mt-2 text-sm text-gray-500">
                {getBarangay(
                  activity
                )?.barangay_name ??
                  `Barangay ${activity.barangay_id}`}
              </p>
            </div>

            <StatusBadge
              status={
                activity.status
              }
            />
          </div>
        </div>

        {/* CONFLICT */}

        {activity.conflict_status ===
          'DETECTED' && (
          <div
            className="
              flex gap-3
              rounded-xl
              border border-amber-200
              bg-amber-50 p-3
              text-sm text-amber-800
            "
          >
            <AlertTriangle
              size={18}
              className="shrink-0"
            />

            <span>
              This request has a
              scheduling conflict.
              The rule engine will
              evaluate it again
              before approval.
            </span>
          </div>
        )}

        {/* DATE / TIME */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Date">
            <input
              type="date"
              min={minDate}
              value={date}
              onChange={(
                event
              ) =>
                setDate(
                  event.target
                    .value
                )
              }
              className={
                inputClass
              }
            />
          </Field>

          <Field label="Start">
            <input
              type="time"
              value={
                startTime
              }
              onChange={(
                event
              ) =>
                setStartTime(
                  event.target
                    .value
                )
              }
              className={
                inputClass
              }
            />
          </Field>

          <Field label="End">
            <input
              type="time"
              value={endTime}
              onChange={(
                event
              ) =>
                setEndTime(
                  event.target
                    .value
                )
              }
              className={
                inputClass
              }
            />
          </Field>
        </div>

        {/* REMARKS */}

        <Field label="PHN Remarks">
          <textarea
            rows={4}
            value={remarks}
            onChange={(
              event
            ) =>
              setRemarks(
                event.target.value
              )
            }
            placeholder="Approval, rescheduling, or rejection remarks"
            className={
              inputClass
            }
          />
        </Field>

        <p className="text-xs text-gray-400">
          Rejection requires a
          reason. Approval remarks
          are optional.
        </p>

        {/* SUGGESTIONS */}

        {suggestions.length >
          0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700">
              Suggested available
              schedules
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Select an alternative
              to copy it into the
              reschedule fields.
            </p>

            <div className="mt-2 space-y-2">
              {suggestions.map(
                (
                  suggestion,
                  index
                ) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => {
                      setDate(
                        suggestion.suggested_date
                      )

                      setStartTime(
                        suggestion.suggested_start_time
                      )

                      setEndTime(
                        suggestion.suggested_end_time
                      )

                      setError('')
                    }}
                    className="
                      w-full rounded-xl
                      border border-gray-200
                      p-3 text-left
                      text-sm
                      hover:border-[#087DB9]
                      hover:bg-[#F4FBFD]
                    "
                  >
                    {formatDate(
                      suggestion.suggested_date
                    )}

                    {' · '}

                    {formatTime(
                      suggestion.suggested_start_time
                    )}

                    {' – '}

                    {formatTime(
                      suggestion.suggested_end_time
                    )}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* ERROR / RULE MESSAGE */}

        {error && (
          <div
            className="
              flex gap-2
              rounded-xl
              bg-red-50
              p-3 text-sm
              text-red-700
            "
          >
            <AlertTriangle
              size={17}
              className="mt-0.5 shrink-0"
            />

            <span>
              {error}
            </span>
          </div>
        )}

        {/* ACTIONS */}

        <div
          className="
            grid grid-cols-1
            gap-2 pt-2
            sm:grid-cols-3
          "
        >
          <ActionButton
            label="Reject"
            icon={XCircle}
            loading={
              loadingAction ===
              'REJECT'
            }
            disabled={
              loadingAction !==
              null
            }
            onClick={() =>
              void review(
                'REJECT'
              )
            }
            className="
              border border-red-200
              bg-white text-red-700
              hover:bg-red-50
            "
          />

          <ActionButton
            label="Reschedule"
            icon={
              CalendarDays
            }
            loading={
              loadingAction ===
              'RESCHEDULE'
            }
            disabled={
              loadingAction !==
              null
            }
            onClick={() =>
              void review(
                'RESCHEDULE'
              )
            }
            className="
              border border-[#087DB9]
              bg-white text-[#087DB9]
              hover:bg-[#F4FBFD]
            "
          />

          <ActionButton
            label="Approve"
            icon={
              CheckCircle2
            }
            loading={
              loadingAction ===
              'APPROVE'
            }
            disabled={
              loadingAction !==
              null
            }
            onClick={() =>
              void review(
                'APPROVE'
              )
            }
            className="
              bg-[#087DB9]
              text-white
              hover:bg-[#056d9e]
            "
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
  w-full rounded-xl
  border border-gray-200
  bg-white px-3 py-2.5
  text-sm text-gray-800
  outline-none
  disabled:cursor-not-allowed
  disabled:bg-gray-50
  disabled:text-gray-400
  focus:border-[#087DB9]
  focus:ring-2
  focus:ring-[#087DB9]/10
`

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </span>

      {children}
    </label>
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
      className="
        fixed inset-0 z-50
        flex items-end
        justify-center
        bg-black/40
        sm:items-center
        sm:p-4
      "
    >
      <div
        className="
          max-h-[92vh]
          w-full overflow-y-auto
          rounded-t-3xl
          bg-white
          sm:max-w-2xl
          sm:rounded-3xl
        "
      >
        <div
          className="
            sticky top-0 z-10
            flex items-center
            justify-between
            border-b
            border-gray-100
            bg-white
            px-5 py-4
            sm:px-6
          "
        >
          <h2 className="text-lg font-bold text-[#03045E]">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="
              flex h-9 w-9
              items-center
              justify-center
              rounded-full
              text-gray-500
              hover:bg-gray-100
            "
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {children}
        </div>
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
      className={`
        inline-flex items-center
        justify-center gap-2
        rounded-xl px-4 py-2.5
        text-sm font-semibold
        disabled:cursor-not-allowed
        disabled:opacity-50
        ${className}
      `}
    >
      {loading ? (
        <Loader2
          size={16}
          className="animate-spin"
        />
      ) : (
        <Icon size={16} />
      )}

      {label}
    </button>
  )
}