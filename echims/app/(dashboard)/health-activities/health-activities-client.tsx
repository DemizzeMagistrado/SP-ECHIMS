'use client'
import { Select, DateInput, Input } from '@/components/ui/form'
import { CountsStrip, FilterCard, GuidanceCard, SectionHeader } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { TabBar } from '@/components/ui/module-tabs'
import { useAuth } from '@/components/auth/auth-provider'
import { offlineScope } from '@/lib/offline/fetch'
import { submitSafeDraft } from '@/lib/offline/safe-submit'
import { listActivityDrafts,saveActivityDraft,deleteActivityDraft,type ActivityDraft } from '@/lib/activity-drafts'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { cn } from '@/lib/utils'

import { AlertTriangle, CheckCircle2, Info, PencilLine, Plus, RefreshCw, Search, XCircle } from 'lucide-react'

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react'

import { ACTIVITY_STATUSES, ACTIVITY_STATUS_META, type ActivityStatus } from '@/lib/constants/activity-statuses'
import { ACTIVITY_TYPES as TYPE_KEYS, ACTIVITY_TYPE_META, type ActivityType } from '@/lib/constants/activity-types'
import { type Activity, type Barangay, activityCode, formatActivityType, formatDate, formatTime, formatTimeRange, getBarangayName, getTodayString } from './components/activity-utils'
import { ActivityRequestsTab } from './components/ActivityRequestsTab'
import { CalendarUpcomingTab } from './components/CalendarUpcomingTab'
import { ActivityDetailModal, type DetailAction } from './components/ActivityDetailModal'
import { ActivityStatusBadge } from './components/StatusBadge'
import { TypePill } from './components/TypePill'
import { LogoLoader, Spinner } from '@/components/brand/logo-loader'
import { TabPanel, usePageLoading } from '@/components/brand/page-gate'
import { readPageCache, writePageCache } from '@/lib/page-cache'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { LoadError } from '@/components/ui/load-error'

/* =========================================================
   TYPES
========================================================= */

type Role = 'Administrator' | 'PHN' | 'RHM' | 'BHW' | 'BNS'

type HealthWorkerRole = 'PHN' | 'RHM' | 'BHW' | 'BNS'

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

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = TYPE_KEYS.map((value) => ({ value, label: ACTIVITY_TYPE_META[value].label }))

const ACTIVITY_TYPES_BY_ROLE: Record<HealthWorkerRole, ActivityType[]> = {
  PHN: ['VACCINATION', 'NUTRITIONAL_ASSESSMENT', 'SUPPLEMENTATION'],
  RHM: ['VACCINATION', 'NUTRITIONAL_ASSESSMENT', 'SUPPLEMENTATION'],
  BHW: ['VACCINATION'],
  BNS: ['NUTRITIONAL_ASSESSMENT', 'SUPPLEMENTATION'],
}

const STATUS_LABELS = Object.fromEntries(ACTIVITY_STATUSES.map((s) => [s, ACTIVITY_STATUS_META[s].label])) as Record<ActivityStatus, string>

type RequesterStatus = 'ONGOING' | 'COMPLETED' | 'CANCELLED'

/* Statuses the requester may move an activity to, by current status */
const REQUESTER_STATUS_TRANSITIONS: Partial<
  Record<ActivityStatus, RequesterStatus[]>
> = {
  PENDING: ['CANCELLED'],
  APPROVED: ['ONGOING', 'COMPLETED', 'CANCELLED'],
  ONGOING: ['COMPLETED', 'CANCELLED'],
}

type Tab = 'requests' | 'calendar'

const SECTIONS: Record<Tab, { title: string; subtitle: string; about: React.ReactNode }> = {
  requests: {
    title: 'Activity requests',
    subtitle: 'All health activity requests filed by BHWs, BNSs, and health staff. PHN reviews and approves.',
    about: <InfoContent
      title="Activity requests"
      description="All requests within your scope, latest schedule first."
      sections={[{ label: 'Tip', value: 'Select a count card to filter by that status' }]}
      bullets={['Counts follow the type, barangay and search filters', 'Open a request to see details and available actions']}
    />,
  },
  calendar: {
    title: 'Calendar & upcoming',
    subtitle: 'Scheduled activities by month or week, and what is coming up in the next 14 days.',
    about: <InfoContent
      title="Calendar & upcoming"
      description="Your activities on a monthly calendar, with what's next on the right."
      sections={[
        { label: 'Values', value: ['Solid = approved / ongoing', 'Dashed = pending approval', 'Faded = cancelled'] },
        { label: 'Tip', value: 'Select a day to see everything scheduled on it' },
      ]}
      note="Upcoming lists approved and ongoing activities, soonest first."
    />,
  },
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function HealthActivitiesClient() {
 const {user,isReady}=useAuth()
 if(!isReady)return <LogoLoader label="Checking account…" />
 if(!user)return <p>Please sign in to view health activities.</p>
 return <ActivityWorkspace key={user.id+':'+offlineScope(user)}/>
}
type ActivitiesCache = { currentUserId: string | null; activities: Activity[]; role: Role | null }

function ActivityWorkspace() {
  const { user } = useAuth()
  // A revisit starts from the last result for this account and scope, then refreshes quietly.
  const cacheKey = user ? 'health-activities:' + offlineScope(user) : ''
  const [cached] = useState(() => readPageCache<ActivitiesCache>(user?.id, cacheKey))
  const [currentUserId, setCurrentUserId] = useState<string | null>(cached?.currentUserId ?? null)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [statusActivity, setStatusActivity] = useState<{ activity: Activity; initial?: RequesterStatus } | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('requests')
  // Filters persist across both tabs so switching never changes the data underneath.
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [barangayFilter, setBarangayFilter] = useState<string>('ALL')
  const [activities, setActivities] = useState<Activity[]>(cached?.activities ?? [])
  const [role, setRole] = useState<Role | null>(cached?.role ?? null)
  const [loading, setLoading] = useState(!cached)
  const [refreshing, setRefreshing] = useState(false)
  usePageLoading(loading)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [reviewing, setReviewing] = useState<{ activity: Activity; action: ReviewAction } | null>(null)
  const [ruleEvaluation, setRuleEvaluation] = useState<RuleEvaluation | null>(null)

  /* LOAD ACTIVITIES */

  const loadActivities = useCallback(async () => {
    if (!readPageCache(user?.id, cacheKey)) setLoading(true)
    setRefreshing(true)
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
      writePageCache<ActivitiesCache>(user?.id, cacheKey, { currentUserId: data.currentUserId ?? null, activities: data.activities ?? [], role: data.role ?? null })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load health activities.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user?.id, cacheKey])

  useEffect(() => {
    void loadActivities()
  }, [loadActivities])

  /* PERMISSIONS */

  const canRequest =
    role === 'PHN' || role === 'RHM' || role === 'BHW' || role === 'BNS'

  const canReview = role === 'PHN'

  /* FILTER */

  const barangayOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const activity of activities) seen.set(activity.barangay_id, getBarangayName(activity))
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [activities])

  // Everything but status: the counts strip counts these, so a count always matches its filter.
  const scopedActivities = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activities.filter((activity) =>
      (typeFilter === 'ALL' || activity.activity_type === typeFilter)
      && (barangayFilter === 'ALL' || String(activity.barangay_id) === barangayFilter)
      && (!q || [formatActivityType(activity.activity_type), getBarangayName(activity), activity.requested_by_name, activityCode(activity), String(activity.schedule_id)]
        .some((value) => value?.toLowerCase().includes(q))),
    )
  }, [activities, search, typeFilter, barangayFilter])

  const filteredActivities = useMemo(
    () => scopedActivities
      .filter((activity) => statusFilter === 'ALL' || activity.status === statusFilter)
      .sort((a, b) => b.schedule_date.localeCompare(a.schedule_date) || (b.start_time ?? '').localeCompare(a.start_time ?? '') || b.schedule_id - a.schedule_id),
    [scopedActivities, statusFilter],
  )

  const countOf = (status: ActivityStatus) => scopedActivities.filter((activity) => activity.status === status).length

  function handleCreated(evaluation?: RuleEvaluation) {
    setShowRequestModal(false)
    setRuleEvaluation(evaluation ?? null)
    toast.success('Activity request submitted for PHN review.')
    void loadActivities()
  }

  /* DETAIL ACTIONS: what this user can do with this request, primary action last. */

  function actionsFor(activity: Activity): DetailAction[] {
    if (canReview && activity.status === 'PENDING') return ['revise', 'approve']
    if (activity.created_by !== currentUserId) return []
    if (activity.status === 'NEEDS_REVISION') return ['edit']
    if (activity.status === 'PENDING') return ['cancel']
    if (activity.status === 'APPROVED') return ['status']
    if (activity.status === 'ONGOING') return ['status', 'complete']
    return []
  }

  function runAction(activity: Activity, action: DetailAction) {
    setSelectedActivity(null)
    if (action === 'approve') setReviewing({ activity, action: 'APPROVE' })
    else if (action === 'revise') setReviewing({ activity, action: 'RESCHEDULE' })
    else if (action === 'edit') setEditingActivity(activity)
    else if (action === 'complete') setStatusActivity({ activity, initial: 'COMPLETED' })
    else if (action === 'cancel') setStatusActivity({ activity, initial: 'CANCELLED' })
    else setStatusActivity({ activity })
  }

  const section = SECTIONS[activeTab]
  const filtersKey = `${typeFilter}|${barangayFilter}|${statusFilter}`

  return (
    <div className="space-y-5">
      {/* Header block: title and subtitle, then the view tabs; one divider below. */}
      <div className="space-y-4">
        <PageHeader
          title="Health Activities"
          subtitle="Activity requests, scheduling, and community health event tracking"
        />
        <TabBar
          className="pb-5"
          label="Health activity views"
          group="health-activities"
          value={activeTab}
          onChange={setActiveTab}
          items={[
            { value: 'requests', label: 'Activity requests' },
            { value: 'calendar', label: 'Calendar & upcoming' },
          ]}
        />
      </div>

      <ActivityDraftPanel onUploaded={() => void loadActivities()}/>

      {/* RULE RESULT */}

      {ruleEvaluation?.hasConflict && (
        <div role="status" className="flex gap-3 rounded-2xl border border-review-line/40 bg-review-soft p-4">
          <AlertTriangle className="mt-0.5 shrink-0 text-review" size={20} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-review">Scheduling rule triggered</p>
            <p className="mt-1 text-sm text-brand-navy">
              {ruleEvaluation.hasHardConflict
                ? 'A health worker time conflict was detected. The request must be rescheduled before PHN approval.'
                : 'Another activity overlaps in the same barangay. The PHN may review and approve the overlap if intentional.'}
            </p>
            {ruleEvaluation.suggestions?.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-semibold text-brand-navy">Suggested alternatives</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ruleEvaluation.suggestions.map((suggestion, index) => (
                    <span key={index} className="rounded-lg bg-white px-3 py-2 text-xs text-brand-navy ring-1 ring-review-line/40">
                      {formatDate(suggestion.suggested_date)} · {formatTime(suggestion.suggested_start_time)} – {formatTime(suggestion.suggested_end_time)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setRuleEvaluation(null)}><XCircle size={16} aria-hidden="true" /></Button>
        </div>
      )}

      <TabPanel tabKey={activeTab} className="space-y-4">
        <SectionHeader title={section.title} subtitle={section.subtitle} about={section.about} />

        <FilterCard
          wide
          refresh={<>
            <Button variant="secondary" size="icon" className="size-10" aria-label="Refresh" disabled={refreshing} onClick={() => void loadActivities()} title="Refresh"><RefreshCw size={16} aria-hidden="true" className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} /></Button>
            {canRequest && (
              <Button
                className="bg-[#07075F] hover:bg-[#1A1A80]"
                onClick={() => {
                  setRuleEvaluation(null)
                  setShowRequestModal(true)
                }}
              >
                <Plus size={17} aria-hidden="true" />
                New request
              </Button>
            )}
          </>}
          below={activeTab === 'requests' ? (
            <CountsStrip
              label="Activity counts"
              selected={statusFilter}
              onSelect={(key) => setStatusFilter(statusFilter === key ? 'ALL' : key)}
              items={[
                { key: 'PENDING', label: 'Pending', value: countOf('PENDING') },
                { key: 'NEEDS_REVISION', label: 'Needs revision', value: countOf('NEEDS_REVISION'), tone: 'review' },
                { key: 'APPROVED', label: 'Approved', value: countOf('APPROVED'), tone: 'good' },
                { key: 'ONGOING', label: 'Ongoing', value: countOf('ONGOING'), tone: 'info' },
                { key: 'COMPLETED', label: 'Completed', value: countOf('COMPLETED'), tone: 'muted' },
              ]}
            />
          ) : undefined}
        >
          <div className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search activities" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activities…" className="pl-9" />
          </div>
          <Select aria-label="Activity type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="ALL">All types</option>
            {ACTIVITY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </Select>
          <Select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">All statuses</option>
            {ACTIVITY_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </Select>
          <Select aria-label="Barangay" value={barangayFilter} onChange={(event) => setBarangayFilter(event.target.value)}>
            <option value="ALL">All barangays</option>
            {barangayOptions.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
          </Select>
        </FilterCard>

        {loading ? (
          <LogoLoader size="section" label="Loading activities…" />
        ) : error ? (
          <LoadError what="health activities" error={new Error(error)} retrying={refreshing} onRetry={() => void loadActivities()} />
        ) : (
          // Re-keyed on filter changes so the new result fades in instead of snapping.
          <div key={filtersKey} className={cn('animate-in fade-in duration-150 motion-reduce:animate-none', refreshing && 'opacity-60 transition-opacity')}>
            {activeTab === 'calendar'
              ? <CalendarUpcomingTab activities={filteredActivities} onOpen={setSelectedActivity} />
              : <ActivityRequestsTab activities={filteredActivities} empty={activities.length === 0} onOpen={setSelectedActivity} />}
          </div>
        )}
      </TabPanel>

      <GuidanceCard title="How activity requests and approvals work" icon={<Info size={16} aria-hidden="true" className="shrink-0 text-brand-blue" />}>
        <ul className="list-disc space-y-1.5 pl-5 text-brand-muted">
          <li><span className="font-semibold text-brand-navy">Request:</span> a BHW, BNS, RHM or PHN files a request for a barangay they cover, with a date and time. Scheduling rules check it for overlaps when it is submitted.</li>
          <li><span className="font-semibold text-brand-navy">Review:</span> the PHN approves the request, or returns it for revision with a note on what to change. A returned request is not refused: the requester edits and resubmits it, and it goes back to Pending.</li>
          <li><span className="font-semibold text-brand-navy">Approval:</span> every activity type (vaccination, nutritional assessment, supplementation) needs PHN approval before it can start.</li>
          <li><span className="font-semibold text-brand-navy">Statuses:</span> Pending → Approved (or Needs revision → Pending again) → Ongoing → Completed. A request can be cancelled at any point before it is completed, with a reason.</li>
          <li><span className="font-semibold text-brand-navy">Conflicts:</span> a worker booked at the same time blocks approval until the schedule changes; an overlap in the same barangay is a warning the PHN may accept.</li>
        </ul>
      </GuidanceCard>

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
        <ActivityDetailModal
          key={selectedActivity.schedule_id}
          activity={selectedActivity}
          actions={actionsFor(selectedActivity)}
          onClose={() => setSelectedActivity(null)}
          onAction={(action) => runAction(selectedActivity, action)}
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
            toast.success('Request resubmitted for PHN review.')
            void loadActivities()
          }}
        />
      )}

      {/* REQUESTER STATUS MODAL */}

      {statusActivity && (
        <UpdateStatusModal
          key={statusActivity.activity.schedule_id}
          activity={statusActivity.activity}
          initialStatus={statusActivity.initial}
          onClose={() => setStatusActivity(null)}
          onUpdated={() => {
            setStatusActivity(null)
            toast.success('Activity status updated.')
            void loadActivities()
          }}
        />
      )}

      {/* PHN REVIEW MODAL */}

      {reviewing && canReview && (
        <ReviewActivityModal
          key={reviewing.activity.schedule_id}
          activity={reviewing.activity}
          action={reviewing.action}
          onClose={() => setReviewing(null)}
          onUpdated={(message) => {
            setReviewing(null)
            toast.success(message)
            void loadActivities()
          }}
        />
      )}
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
      onClose={onClose}
      busy={submitting}
      onSubmit={handleResubmit}
      footer={<Button type="submit" loading={submitting}>{submitting ? 'Resubmitting…' : 'Resubmit for Review'}</Button>}
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-900">
            PHN Revision Instructions
          </p>

          <p className="mt-1 whitespace-pre-wrap text-sm text-orange-800">
            {activity.review_remarks || 'Please revise the activity schedule.'}
          </p>
        </div>

        <div className="rounded-2xl bg-[#f1fbfd] p-4">
          <p className="font-bold text-brand-navy">
            {formatActivityType(activity.activity_type)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {getBarangayName(activity)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <DateInput
              required
              min={getTodayString()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={submitting}
             
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
      </div>
    </ModalShell>
  )
}

/* =========================================================
   REQUESTER STATUS MODAL
========================================================= */
function UpdateStatusModal({
  activity,
  initialStatus,
  onClose,
  onUpdated,
}: {
  activity: Activity
  /** Preselects a status (Mark as completed, Cancel request). */
  initialStatus?: RequesterStatus
  onClose: () => void
  onUpdated: () => void
}) {
  const options =
    REQUESTER_STATUS_TRANSITIONS[activity.status] ?? []

  const [status, setStatus] =
    useState<RequesterStatus | ''>(initialStatus && options.includes(initialStatus) ? initialStatus : options[0] ?? '')

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
        `/api/health-activities/${activity.schedule_id}/management`,
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
      onClose={onClose}
      busy={submitting}
      onSubmit={handleSubmit}
      footer={<Button type="submit" loading={submitting} disabled={!status}>{submitting ? 'Saving…' : 'Save status'}</Button>}
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="font-bold text-brand-navy">
            {formatActivityType(activity.activity_type)}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {getBarangayName(activity)} ·{' '}
            {formatDate(activity.schedule_date)}
          </p>

          <div className="mt-3">
            <ActivityStatusBadge status={activity.status} />
          </div>
        </div>

        <Field label="New status">
          <Select
            required
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as RequesterStatus,
              )
            }
            disabled={submitting}
           
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
          </Select>
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
            <DateInput
              required
              min={activity.schedule_date}
              max={getTodayString()}
              value={completionDate}
              onChange={(event) =>
                setCompletionDate(event.target.value)
              }
              disabled={submitting}
             
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
      </div>
    </ModalShell>
  )
}

/* =========================================================
   REQUEST ACTIVITY MODAL
========================================================= */

function RequestActivityModal({
  role,
  onClose,
  onCreated,
  draft,
}: {
  draft?: ActivityDraft
  role: HealthWorkerRole
  onClose: () => void
  onCreated: (evaluation?: RuleEvaluation) => void
}) {
  const {user}=useAuth()
  const [online,setOnline]=useState<boolean|null>(null)
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
  const formRef=useRef<HTMLFormElement>(null)
  const requestId=useRef(draft?.requestId??'')
  const [reviewed,setReviewed]=useState(false)
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

  async function saveLocal(){
    if(submitting||!formRef.current)return
    setSubmitting(true);setError('')
    try{
      if(!user)throw new Error('Sign in before saving a draft.')
      if(!requestId.current)requestId.current=crypto.randomUUID()
      const form=Object.fromEntries(new FormData(formRef.current).entries()) as Record<string,string>
      await saveActivityDraft({requestId:requestId.current,ownerId:user.id,scope:offlineScope(user),savedAt:new Date().toISOString(),status:'DRAFT',form})
      onClose()
    }catch(e){setError(e instanceof Error?e.message:'Draft was not saved.')}finally{setSubmitting(false)}
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!navigator.onLine){await saveLocal();return}

    if (loadingOptions || barangays.length === 0) return

    setSubmitting(true)
    setError('')

    const formData = new FormData(event.currentTarget)

    try {
      if(draft){
        if(!reviewed)throw new Error('Review and confirm this request before uploading.')
        const data=await submitSafeDraft('ACTIVITY',{...draft,form:Object.fromEntries(formData.entries()) as Record<string,string>},{activityType:formData.get('activityType'),barangayId:Number(formData.get('barangayId')),scheduleDate:formData.get('scheduleDate'),startTime:formData.get('startTime'),endTime:formData.get('endTime'),remarks:formData.get('remarks')})
        onCreated(data.ruleEvaluation);return
      }
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
    <ModalShell
      title="Request Health Activity"
      onClose={onClose}
      busy={submitting}
      onSubmit={handleSubmit}
      formRef={formRef}
      footer={<>
        {online===false && <Button variant="secondary" disabled={submitting} onClick={()=>void saveLocal()}>Save Draft on Device</Button>}
        {online===true && <Button type="submit" loading={submitting} disabled={loadingOptions || barangays.length === 0 || Boolean(draft&&!reviewed)}>{submitting ? 'Submitting...' : draft?'Submit Reviewed Request':'Submit Request'}</Button>}
      </>}
    >
      <div className="grid gap-4">
        <div className="rounded-2xl bg-[#f1fbfd] px-3 py-3">
          <p className="text-xs font-medium uppercase text-slate-500">
            Requesting as
          </p>
          <p className="mt-1 text-sm font-bold text-brand-navy">{role}</p>
        </div>

        <Field label="Activity Type">
          <Select name="activityType" defaultValue={String(draft?.form.activityType??'')} required>
            <option value="">Select activity</option>

            {availableActivityTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Barangay">
          <Select
            name="barangayId" defaultValue={String(draft?.form.barangayId??'')}
            required
            disabled={loadingOptions || barangays.length === 0}
           
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
          </Select>

          {loadingOptions && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Spinner />
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
          <DateInput
            name="scheduleDate" defaultValue={String(draft?.form.scheduleDate??'')}
            min={minDate}
            required
           
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start Time">
            <input type="time" name="startTime" defaultValue={String(draft?.form.startTime??'')} required className={inputClass} />
          </Field>

          <Field label="End Time">
            <input type="time" name="endTime" defaultValue={String(draft?.form.endTime??'')} required className={inputClass} />
          </Field>
        </div>

        <Field label="Remarks">
          <textarea
            name="remarks" defaultValue={String(draft?.form.remarks??'')}
            placeholder="Activity details or notes"
            className={textareaClass}
          />
        </Field>

        <p className="text-sm text-amber-800">{online===false?'Save on this device, then review and submit after reconnecting. A draft does not reserve a schedule.':'Requests are checked against current scheduling rules when submitted.'}</p>
        {draft&&online===true&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the date, time, activity and barangay.</label>}
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </ModalShell>
  )
}
/* =========================================================
   PHN REVIEW MODAL
   Approve, or return for revision (the requester edits and resubmits).
========================================================= */

type ReviewAction = 'APPROVE' | 'RESCHEDULE'

function ReviewActivityModal({
  activity,
  action,
  onClose,
  onUpdated,
}: {
  activity: Activity
  action: ReviewAction
  onClose: () => void
  onUpdated: (message: string) => void
}) {
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const approving = action === 'APPROVE'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    if (!approving && !remarks.trim()) {
      setError('Say what the requester needs to change.')
      return
    }

    setSubmitting(true)
    setError('')
    setSuggestions([])

    try {
      const response = await fetch(
        `/api/health-activities/${activity.schedule_id}/review`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, reviewRemarks: remarks }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        setSuggestions(data.suggestions ?? [])
        throw new Error(data.error ?? 'Unable to review activity.')
      }

      onUpdated(data.message ?? (approving ? 'Activity approved.' : 'Returned to the requester for revision.'))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to review activity.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={approving ? 'Approve activity' : 'Return for revision'}
      subtitle={approving ? 'Scheduling rules are checked again before the approval is saved.' : 'The requester edits the request and resubmits it for your review.'}
      size="form"
      onClose={onClose}
      busy={submitting}
      dirty={Boolean(remarks.trim())}
      onSubmit={handleSubmit}
      footer={
        <Button type="submit" loading={submitting}>
          {approving ? <CheckCircle2 size={16} aria-hidden="true" /> : <PencilLine size={16} aria-hidden="true" />}
          {approving ? 'Approve activity' : 'Return for revision'}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-brand-line/70 bg-[var(--row-zebra)] p-4">
          <div className="min-w-0">
            <p className="font-semibold text-brand-navy">{formatActivityType(activity.activity_type)} · {getBarangayName(activity)}</p>
            <p className="mt-1 text-sm text-brand-muted">{formatDate(activity.schedule_date)} · {formatTimeRange(activity)}</p>
            {activity.requested_by_name && <p className="mt-0.5 text-sm text-brand-muted">Requested by {activity.requested_by_name}</p>}
          </div>
          <TypePill type={activity.activity_type} />
        </div>

        {activity.conflict_status === 'DETECTED' && (
          <p className="flex gap-2 rounded-xl border border-review-line/40 bg-review-soft p-3 text-sm text-review">
            <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            This request has a scheduling conflict. A worker double-booking blocks approval; a same-barangay overlap does not.
          </p>
        )}

        <Field label={approving ? 'Remarks (optional)' : 'What needs to change'}>
          <textarea
            rows={4}
            required={!approving}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            disabled={submitting}
            placeholder={approving ? 'Notes for the requester' : 'For example: move to a morning slot, or pick another date'}
            className={textareaClass}
          />
        </Field>

        {suggestions.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-brand-navy">Available times you can suggest</p>
            <p className="mt-1 text-xs text-brand-muted">Return the request for revision and mention one of these.</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="rounded-lg border border-brand-line bg-white px-3 py-2 text-xs text-brand-navy">
                  {formatDate(suggestion.suggested_date)} · {formatTime(suggestion.suggested_start_time)} – {formatTime(suggestion.suggested_end_time)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}
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
  disabled:text-slate-500
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

function ModalShell({ title, children, onClose, ...rest }: {
  title: string
  children: React.ReactNode
  onClose: () => void
} & Omit<React.ComponentProps<typeof Modal>, 'open' | 'title' | 'children' | 'onClose'>) {
  return <Modal open title={title} onClose={onClose} {...rest}>{children}</Modal>
}

function ActivityDraftPanel({onUploaded}:{onUploaded:()=>void}){
 const {user}=useAuth(),scope=user?offlineScope(user):'',confirm=useConfirm()
 const [online,setOnline]=useState(true),[showReview,setShowReview]=useState(false)
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 const [rows,setRows]=useState<ActivityDraft[]>([]),[selected,setSelected]=useState<ActivityDraft|null>(null),[error,setError]=useState('')
 useEffect(()=>{let active=true;const refresh=()=>{if(user)void listActivityDrafts(user.id,scope).then(r=>{if(active)setRows(r)}).catch(e=>{if(active)setError(e.message)})};refresh();window.addEventListener('echims-activity-drafts',refresh);return()=>{active=false;window.removeEventListener('echims-activity-drafts',refresh)}},[user?.id,scope])
 const aliases:Record<string,HealthWorkerRole>={'Public Health Nurse':'PHN','Rural Health Midwife':'RHM','Barangay Health Worker':'BHW','Barangay Nutrition Scholar':'BNS'}
 const role=user?aliases[user.role]:undefined
 if(!role)return null
 return <section aria-label="Offline activity queue" className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{online?'Pending offline drafts':'Offline'} · {rows.length} local draft{rows.length===1?'':'s'}</h2><p className="text-xs text-muted-foreground">Drafts stay on this device until you review and confirm submission. Scheduling rules are checked online.</p></div><Button variant="secondary" disabled={rows.length===0} onClick={()=>setShowReview(v=>!v)}>{showReview?'Hide pending drafts':'Review pending drafts'}</Button></div>{error&&<p role="alert">{error}</p>}
 {showReview&&rows.map(row=><div key={row.requestId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white p-3 text-sm"><span>{String(row.form.activityType||'Activity draft')} · {String(row.form.scheduleDate||'Date incomplete')}{row.status==='UNCERTAIN'?(row.safeRetry?' — Submission uncertain. Retry the same request safely.':' — Older uncertain request needs reconciliation.'):''}</span>{row.status==='UNCERTAIN'&&row.safeRetry&&<Button size="sm" onClick={async()=>{try{await submitSafeDraft('ACTIVITY',row);onUploaded()}catch(e){setError(e instanceof Error?e.message:'Retry failed.')}}}>Retry unchanged submission</Button>}{row.status==='DRAFT'&&<div className="flex gap-3"><Button size="sm" variant="secondary" onClick={()=>setSelected(row)}>Review / Edit</Button><Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" onClick={async()=>{if(await confirm({title:'Delete this local activity draft?',description:'It has not been uploaded. Deleting it cannot be undone.',confirmLabel:'Delete draft',tone:'danger'}))try{await deleteActivityDraft(row);toast.success('Local draft deleted.')}catch(e){setError(e instanceof Error?e.message:'Unable to delete draft.')}}}>Delete draft</Button></div>}</div>)}
 {selected&&selected.ownerId===user?.id&&selected.scope===scope&&<RequestActivityModal key={selected.requestId} role={role} draft={selected} onClose={()=>setSelected(null)} onCreated={()=>{setSelected(null);onUploaded()}}/>}</section>
}
