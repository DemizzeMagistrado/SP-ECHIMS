'use client'
import { StatCard } from '@/components/ui/stat-card'
import { FilterBar } from '@/components/ui/filter-bar'
import { CatalogSection } from '@/components/vaccination/vaccine-catalog'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// Vaccination module — all sections merged into one page (one route).
// Sections: Schedule (with Missed / reminders) · Records.
// Each section keeps its own permission check, data fetching and modals.
// Only the active section is mounted, so only its API calls fire.

import React, { Fragment, useMemo, useState, useSyncExternalStore } from 'react'
import { refreshOfflineViews as globalMutate } from '@/lib/offline/refresh'
import { useVaccinationView } from '@/hooks/use-vaccination-view'
import { vaccinationKeyMatches } from '@/lib/vaccination-cache'
import { VaccinationOfflineTools, VaccinationSnapshotNotice } from '@/components/vaccination/vaccination-offline-tools'
import Link from 'next/link'
import { usePathname, useRouter } from '@/lib/offline/navigation'
import { Plus, Package, AlertCircle, CalendarClock, CheckCircle2, Syringe, ArrowRight, Search, Download, CalendarX, HandHelping, MessageSquare, Undo2 } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { toast } from '@/components/ui/toast'
import { NIP_CATALOG } from '@/lib/nip-schedule'
import { RecordVaccinationModal } from '@/components/vaccination/record-vaccination-modal'
import { LogoLoader } from '@/components/brand/logo-loader'
import { TabPanel } from '@/components/brand/page-gate'
import { FilterChips, TabBar } from '@/components/ui/module-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { LoadError } from '@/components/ui/load-error'
import { Button, buttonVariants } from '@/components/ui/button'
import { DateInput, Input, Select, Textarea } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { AccordionCard, ExpandCollapseAll } from '@/components/ui/accordion-card'
import { DataTable } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { Field } from '@/components/ui/form'
import { BhwAssistBadge, BhwAssistToggle } from '@/components/vaccination/bhw-assist'
import { ScheduleHistoryButton } from '@/components/vaccination/schedule-history'
import { BulkReminderButton, SendReminderButton, remindersByChild, type ReminderData, type ReminderRow } from '@/components/vaccination/schedule-reminders'

/* ═════════════════════════ Shared helpers ═════════════════════════ */

function revalidateVaccination(url: string) {
 return globalMutate(key => vaccinationKeyMatches(key,url))
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Date-only strings (YYYY-MM-DD)
function formatYmd(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}


function fullName(c: { first_name: string; middle_name: string | null; last_name: string }) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
}


/* ═════════════════════════ Records (NIP-USR003) ═════════════════════════ */

type RecordChildRef = {
  child_id: number
  child_code?: string | null
  first_name: string
  middle_name: string | null
  last_name: string
  date_of_birth: string
  barangay_id: number | null
  barangay?: { barangay_name: string } | { barangay_name: string }[] | null
}
type ItemRef = { item_id: number; item_name: string }
type VaccineRef = {
  vaccine_id: number
  vaccine_type: string | null
  dose_volume: string | null
  route: string | null
  target_age: string | null
  item: ItemRef | ItemRef[] | null
  companions?: { item: ItemRef | ItemRef[] | null }[] | null
}
type UserRef = { user_id: string; full_name: string | null }
type RecorderRef = {
  user_id: string
  user: UserRef | UserRef[] | null
}
type RecordRow = {
  vaccination_record_id: number
  vaccination_date: string
  dose_number: number
  batch_number: string | null
  vaccination_site: string | null
  remarks: string | null
  created_at: string
  schedule_id: number | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  approved_by: string | null
  approved_at: string | null
  review_remarks: string | null
  child: RecordChildRef | RecordChildRef[] | null
  vaccine: VaccineRef | VaccineRef[] | null
  recorder: RecorderRef | RecorderRef[] | null
  approver: UserRef | UserRef[] | null
  /** Companion medications given with this dose (written on approval). */
  companions?: { item_id: number; quantity: number; deducted: boolean; note: string | null; item: ItemRef | ItemRef[] | null }[] | null
}
type RecordsPayload = {
  rows: RecordRow[]
  can_create: boolean
  can_review: boolean
  can_export: boolean
  role: UserRole
}

const RECORD_STATUS_META = {
  PENDING: { label: 'Awaiting approval' },
  APPROVED: { label: 'Approved' },
  // RHU QA: nothing is "rejected"; the PHN returns the record to the recorder to fix (UI wording;
  // the stored status is still REJECTED until the backend flow changes, see docs/known-issues.md).
  REJECTED: { label: 'Needs correction' },
} as const
// Needs correction = amber (the badge's default for REJECTED is red); other statuses keep their usual tone.
const recordTone = (s: RecordRow['status']) => (s === 'REJECTED' ? 'warn' as const : undefined)

function userName(u: UserRef | null) { return u?.full_name || (u ? u.user_id.slice(0, 6) : '—') }
function recorderName(r: RecorderRef | null) {
  if (!r) return '—'
  const u = Array.isArray(r.user) ? r.user[0] : r.user
  return userName(u ?? null)
}
function vaccineLabel(v: VaccineRef | null): string {
  if (!v) return '—'
  const item = one(v.item)
  return item?.item_name || v.vaccine_type || `Vaccine #${v.vaccine_id}`
}

function RecordsSection({ onGoToSchedule }: { onGoToSchedule: () => void }) {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination', 'view') : false
  const canTrace = role === 'Public Health Nurse' || role === 'Administrator'

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [reviewing, setReviewing] = useState<{ row: RecordRow; action: 'APPROVE' | 'REJECT' } | null>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [remarksError, setRemarksError] = useState<string | null>(null)
  const [submittingReview, setSubmittingReview] = useState(false)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (statusFilter) p.set('status', statusFilter)
    return p.toString()
  }, [q, statusFilter])

  const url = `/api/vaccination/records${qs ? `?${qs}` : ''}`
  // Next dose per child from the same data as the Schedule tab: a missed dose (its new date)
  // first, else the earliest pending dose.
  const schedule = useVaccinationView<DosesPayload>(isReady && canView ? '/api/vaccination/defaulters?include=pending' : null)
  const nextByChild = useMemo(() => {
    const map = new Map<number, DoseRow>()
    const better = (a: DoseRow, b: DoseRow | undefined) => {
      if (!b) return true
      if ((a.status === 'OVERDUE') !== (b.status === 'OVERDUE')) return a.status === 'OVERDUE'
      return doseDate(a) < doseDate(b)
    }
    for (const d of [...(schedule.data?.defaulters ?? []), ...(schedule.data?.pending ?? [])]) if (better(d, map.get(d.child_id))) map.set(d.child_id, d)
    return map
  }, [schedule.data])
  const { data, error, isLoading, refreshing, readOnly, savedAt, mutate } = useVaccinationView<RecordsPayload>(isReady && canView ? url : null)
  const router = useRouter()

  if (!isReady) return <LogoLoader />
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view vaccination records.</div>

  const rows = data?.rows ?? []
  const canCreate = data?.can_create ?? false
  const canReview = !readOnly && (data?.can_review ?? false)
  const canExport = !readOnly && (data?.can_export ?? false)

  function openReview(row: RecordRow, action: 'APPROVE' | 'REJECT') {
    setReviewing({ row, action }); setReviewRemarks(''); setRemarksError(null)
  }

  async function submitReview() {
    if (readOnly || !reviewing) return
    if (!navigator.onLine) { toast.warning('You are offline. Reconnect to review this record; nothing was changed.'); return }
    if (reviewing.action === 'REJECT' && !reviewRemarks.trim()) { setRemarksError('Say what needs fixing so the recorder can correct it.'); return }
    setSubmittingReview(true)
    try {
      const r = await fetch(`/api/vaccination/record-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: reviewing.row.vaccination_record_id, action: reviewing.action, review_remarks: reviewRemarks.trim() || null }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to submit the review.')
      const comp = (d.companions ?? []) as { item_name: string; deducted: boolean }[]
      const notDeducted = comp.filter((c) => !c.deducted).map((c) => c.item_name)
      toast.success(reviewing.action === 'APPROVE'
        ? `Record approved. Vaccine stock deducted${comp.length ? `; ${comp.filter((c) => c.deducted).map((c) => c.item_name).join(', ') || 'no companion'} deducted too` : ''}.`
        : 'Record marked Needs correction. The recorder can see your note.')
      if (notDeducted.length) toast.warning(`${notDeducted.join(', ')} had no stock in this barangay, so it was recorded but not deducted. Restock it in Inventory.`)
      setReviewing(null)
      revalidateVaccination('/api/vaccination/records')
    } catch (err) {
      toast.error(`${err instanceof Error ? err.message : 'Review failed.'} Nothing was changed; try again.`)
    } finally {
      setSubmittingReview(false)
    }
  }

  const reviewChild = reviewing ? one(reviewing.row.child) : null

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccination: Records"
        subtitle="Administered vaccines awaiting PHN approval or already logged."
        actions={<>
          {role && canPerform(role, 'Vaccine Batch Requests', 'view') && (
            <Link href="/inventory/batch-requests" className={buttonVariants({ variant: 'tonal' })}><Package size={16} aria-hidden="true" /> Batch requests</Link>
          )}
          {canExport && (
            <Button variant="tonal" onClick={() => toast.info('CSV export is coming in a later update.')}>
              <Download size={16} aria-hidden="true" /> Export CSV
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={17} aria-hidden="true" /> Add new record
            </Button>
          )}
        </>}
      />

      <VaccinationOfflineTools />

      {isLoading ? (
        <LogoLoader size="section" label="Loading records…" />
      ) : error && !data ? (
        <LoadError what="vaccination records" error={error} retrying={refreshing} onRetry={() => void mutate()} />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(row) => row.vaccination_record_id}
          caption="Vaccination records"
          refreshing={refreshing}
          mobile="cards"
          onRowClick={(row) => { const c = one(row.child); if (c) router.push(`/child-profiling/children/${c.child_id}`) }}
          rowLabel={(row) => { const c = one(row.child); return c ? `Open ${fullName(c)}'s profile` : 'Record' }}
          toolbar={
            <fieldset disabled={readOnly} className="flex w-full flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                <Input aria-label="Search records" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Child name, Child ID, FSN, vaccine or batch…" className="pl-9" />
              </div>
              <FilterChips label="Record status" value={statusFilter} onChange={setStatusFilter} options={[
                { value: '', label: 'All' },
                { value: 'PENDING', label: 'Awaiting approval' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'REJECTED', label: 'Needs correction' },
              ]} />
            </fieldset>
          }
          empty={{
            icon: Syringe,
            title: statusFilter ? `No ${RECORD_STATUS_META[statusFilter as keyof typeof RECORD_STATUS_META]?.label.toLowerCase()} records` : q.trim() ? 'No records match this search' : 'No vaccination records yet',
            description: canCreate
              ? 'Use “Add new record” to log an administered dose. Records save as pending for PHN approval.'
              : 'Records in your scope will appear here once BHWs or RHMs log administered doses.',
            action: <Button variant="secondary" size="sm" onClick={onGoToSchedule}>Go to Schedule <ArrowRight size={14} aria-hidden="true" /></Button>,
          }}
          columns={[
            {
              key: 'child', header: 'Child', sortValue: (row) => { const c = one(row.child); return c ? fullName(c) : '' },
              cell: (row) => {
                const c = one(row.child)
                return c ? (
                  <span className="flex flex-col items-end sm:items-start">
                    <span className="font-semibold text-brand-navy">{fullName(c)}</span>
                    <span className="text-xs text-muted-foreground">{c.child_code ?? `#${c.child_id}`}</span>
                  </span>
                ) : <span className="text-muted-foreground">—</span>
              },
            },
            {
              key: 'vaccine', header: 'Vaccine', sortValue: (row) => vaccineLabel(one(row.vaccine)),
              cell: (row) => {
                const comps = row.companions ?? []
                return (
                  <span className="flex flex-col items-end sm:items-start">
                    <span className="font-medium">{vaccineLabel(one(row.vaccine))} · Dose {row.dose_number}</span>
                    <span className="text-xs text-muted-foreground">
                      Batch {row.batch_number ? (canTrace ? <Link href={`/inventory/batch-trace?batch_number=${encodeURIComponent(row.batch_number)}`} className="font-medium text-brand-blue hover:underline">{row.batch_number}</Link> : row.batch_number) : '—'}
                      {comps.length > 0 && <> · with {comps.map((x) => one(x.item)?.item_name).filter(Boolean).join(', ')}</>}
                      {comps.length === 0 && row.status === 'PENDING' && (one(row.vaccine)?.companions ?? []).length > 0 && <> · {(one(row.vaccine)?.companions ?? []).map((x) => one(x.item)?.item_name).filter(Boolean).join(', ')} on approval</>}
                      {' · by '}{recorderName(one(row.recorder))}
                    </span>
                  </span>
                )
              },
            },
            { key: 'date', header: 'Date given', sortValue: (row) => row.vaccination_date, cell: (row) => formatYmd(row.vaccination_date) },
            { key: 'status', header: 'Status', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} tone={recordTone(row.status)} label={RECORD_STATUS_META[row.status].label} /> },
            {
              key: 'next', header: 'Next schedule', sortValue: (row) => { const c = one(row.child); const n = c ? nextByChild.get(c.child_id) : undefined; return n ? doseDate(n) : null },
              cell: (row) => {
                const c = one(row.child)
                const n = c ? nextByChild.get(c.child_id) : undefined
                if (!c || !n) return <span className="text-muted-foreground" title={schedule.isLoading ? 'Loading the schedule…' : 'No missed or pending dose found for this child'}>—</span>
                return (
                  <span className="flex flex-col items-end gap-1 sm:items-start">
                    <Link href={`/child-profiling/children/${c.child_id}#vaccination-schedule`} className="font-medium text-brand-blue underline-offset-4 hover:underline">
                      {formatYmd(doseDate(n))} · {n.vaccine_type} {n.dose_number}
                    </Link>
                    {n.status === 'OVERDUE' && <StatusBadge status="missed" tone="danger" label={n.rescheduled_date ? `Missed · rescheduled to ${formatYmd(n.rescheduled_date)}` : 'Missed'} />}
                  </span>
                )
              },
            },
            {
              key: 'actions', header: <span className="sr-only">Actions</span>,
              cell: (row: RecordRow) => {
                return (
                  <div className="flex flex-wrap justify-end gap-2 sm:justify-start">
                    {canReview && row.status === 'PENDING' && <>
                      <Button size="sm" onClick={() => openReview(row, 'APPROVE')}><CheckCircle2 size={14} aria-hidden="true" /> Approve</Button>
                      <Button size="sm" variant="tonal" onClick={() => openReview(row, 'REJECT')}><Undo2 size={14} aria-hidden="true" /> Return for correction</Button>
                    </>}
                  </div>
                )
              },
            },
          ]}
        />
      )}

      <RecordVaccinationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => revalidateVaccination('/api/vaccination/records')}
        ownerId={user?.id ?? null}
      />

      <Modal
        open={Boolean(reviewing) && !readOnly}
        size="sm"
        onClose={() => setReviewing(null)}
        busy={submittingReview}
        title={reviewing?.action === 'REJECT' ? 'Return for correction' : 'Approve record'}
        subtitle={reviewing ? `${vaccineLabel(one(reviewing.row.vaccine))} dose ${reviewing.row.dose_number}${reviewChild ? ` for ${fullName(reviewChild)}` : ''}` : undefined}
        onSubmit={(e) => { e.preventDefault(); void submitReview() }}
        bodyClassName="space-y-4"
        footer={<Button type="submit" loading={submittingReview}>{reviewing?.action === 'REJECT' ? 'Return to recorder' : 'Approve'}</Button>}
      >
        {reviewing?.action === 'APPROVE' && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            One dose is deducted from the child&rsquo;s barangay stock{(one(reviewing.row.vaccine)?.companions ?? []).length ? `, plus ${(one(reviewing.row.vaccine)?.companions ?? []).map((x) => one(x.item)?.item_name).filter(Boolean).join(', ')}` : ''}.
          </p>
        )}
        {reviewing?.action === 'REJECT' && <p className="text-sm text-brand-muted">Use this when something in the record needs fixing (child, dose, date or batch). The recorder sees your note. The child&rsquo;s schedule is not affected.</p>}
        <Field label={reviewing?.action === 'REJECT' ? 'What needs fixing?' : 'Remarks (optional)'} required={reviewing?.action === 'REJECT'} error={remarksError}>
          <Textarea value={reviewRemarks} onChange={(e) => { setReviewRemarks(e.target.value); setRemarksError(null) }} rows={3} />
        </Field>
      </Modal>
    </div>
  )
}
/* ═════════════════════ Schedule (NIP-USR002 + NIP-USR005 Defaulters) ═════════════════════ */
// One card per child: Missed doses (with their rescheduled dates), the next Pending date, the
// latest schedule request (Approve / Ask for new date), the BHW-assist flag and guardian SMS
// reminders. Chips: All · Pending · Missed (the former Defaulters view) · BHW to assist.

type ScheduleChildRef = {
  child_id: number; child_code: string | null; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string
  household?: { family_serial_no: string | null } | { family_serial_no: string | null }[] | null
  assist?: { reason: string | null } | { reason: string | null }[] | null
}
type BarangayRef = { barangay_id: number; barangay_name: string }
type ScheduleRow = {
  schedule_id: number
  // REJECTED stays in the type for old rows only; schedules can no longer be rejected.
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'
  schedule_date: string
  created_at: string
  remarks: string | null
  review_remarks: string | null
  child_id: number | null
  child: ScheduleChildRef | ScheduleChildRef[] | null
  barangay: BarangayRef | BarangayRef[] | null
}
type SchedulePayload = { rows: ScheduleRow[]; can_review: boolean; role: UserRole }

const SCHEDULE_STATUS_META: Record<ScheduleRow['status'], { label: string }> = {
  PENDING: { label: 'Awaiting approval' },
  APPROVED: { label: 'Approved' },
  NEEDS_REVISION: { label: 'Needs new date' },
  ONGOING: { label: 'Ongoing' },
  COMPLETED: { label: 'Completed' },
  CANCELLED: { label: 'Cancelled' },
  REJECTED: { label: 'Needs correction (old)' },
}

type DoseRow = {
  child_id: number
  child_name: string
  child_code: string | null
  family_serial_no: string | null
  bhw_assist: { reason: string | null } | null
  date_of_birth: string
  barangay_name: string | null
  vaccine_code: string
  vaccine_type: string
  dose_number: number
  due_date: string
  days_overdue: number
  rescheduled_date: string | null
  status: 'OVERDUE' | 'UPCOMING'
}
type DosesPayload = {
  defaulters: DoseRow[]
  pending?: DoseRow[]
  counts: { overdue: number; unique_children_affected: number; total_children_in_scope: number; total_shown: number; total_matched: number }
}
type ChildCard = {
  child_id: number
  child_name: string
  child_code: string | null
  family_serial_no: string | null
  bhw_assist: { reason: string | null } | null
  date_of_birth: string | null
  barangay_name: string | null
  missed: DoseRow[]
  pending: DoseRow[]
  worst: DoseRow | null
  request: ScheduleRow | null
  /** Earliest date the child should come in (rescheduled missed date or next pending date). */
  nextDate: string | null
}

type StatusChip = 'all' | 'pending' | 'missed' | 'assist'
const CHIPS: StatusChip[] = ['all', 'pending', 'missed', 'assist']
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
const doseDate = (d: DoseRow) => d.rescheduled_date ?? d.due_date
const subscribeNoop = () => () => {}

function ScheduleSection() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination', 'view') : false
  const canSeeRequests = role ? canPerform(role, 'Vaccination Schedule', 'view') : false
  const canFlag = role !== undefined && role !== 'Barangay Nutrition Scholar'

  // /vaccination/defaulters redirects here with ?status=missed.
  const linkedChip = useSyncExternalStore(subscribeNoop, () => {
    const v = new URLSearchParams(window.location.search).get('status') ?? ''
    return (CHIPS as string[]).includes(v) ? (v as StatusChip) : 'all'
  }, () => 'all' as StatusChip)
  const [chipChoice, setChip] = useState<StatusChip | null>(null)
  const chip = chipChoice ?? linkedChip
  const [requestFilter, setRequestFilter] = useState('')
  const [vaccineFilter, setVaccineFilter] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [openOverride, setOpenOverride] = useState<Record<number, boolean>>({})
  const [reviewing, setReviewing] = useState<ScheduleRow | null>(null)
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REVISE'>('APPROVE')
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [remarksError, setRemarksError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const dosesUrl = `/api/vaccination/defaulters?include=pending${vaccineFilter ? `&vaccine=${vaccineFilter}` : ''}`
  const requestsUrl = '/api/vaccination/schedule'
  const smsUrl = '/api/sms/reminders?program=VACCINATION'
  const doses = useVaccinationView<DosesPayload>(isReady && canView ? dosesUrl : null)
  const requests = useVaccinationView<SchedulePayload>(isReady && canSeeRequests ? requestsUrl : null)
  const sms = useVaccinationView<ReminderData>(isReady && canView ? smsUrl : null)
  const readOnly = doses.readOnly
  const refreshAll = () => { revalidateVaccination(dosesUrl); revalidateVaccination(requestsUrl); revalidateVaccination(smsUrl) }

  const cards = useMemo<ChildCard[]>(() => {
    const byChild = new Map<number, ChildCard>()
    const card = (d: DoseRow) => {
      let c = byChild.get(d.child_id)
      if (!c) {
        c = { child_id: d.child_id, child_name: d.child_name, child_code: d.child_code, family_serial_no: d.family_serial_no, bhw_assist: d.bhw_assist,
          date_of_birth: d.date_of_birth, barangay_name: d.barangay_name, missed: [], pending: [], worst: null, request: null, nextDate: null }
        byChild.set(d.child_id, c)
      }
      return c
    }
    for (const d of doses.data?.defaulters ?? []) {
      const c = card(d)
      c.missed.push(d)
      if (!c.worst || d.days_overdue > c.worst.days_overdue) c.worst = d
    }
    for (const d of doses.data?.pending ?? []) card(d).pending.push(d)
    // Latest request per child (rows are newest first). A child with a request but no due doses still shows.
    for (const r of requests.data?.rows ?? []) {
      const ch = one(r.child)
      if (!ch || (byChild.get(ch.child_id)?.request)) continue
      let c = byChild.get(ch.child_id)
      if (!c) {
        if (vaccineFilter) continue
        c = { child_id: ch.child_id, child_name: fullName(ch), child_code: ch.child_code, family_serial_no: one(ch.household)?.family_serial_no ?? null,
          bhw_assist: one(ch.assist), date_of_birth: ch.date_of_birth, barangay_name: one(r.barangay)?.barangay_name ?? null, missed: [], pending: [], worst: null, request: null, nextDate: null }
        byChild.set(ch.child_id, c)
      }
      c.request = r
    }
    for (const c of byChild.values()) {
      const dates = [...c.missed, ...c.pending].map(doseDate).sort()
      c.nextDate = dates[0] ?? c.request?.schedule_date ?? null
    }
    return [...byChild.values()].sort((a, b) =>
      (b.worst?.days_overdue ?? -1) - (a.worst?.days_overdue ?? -1) || (a.nextDate ?? '9').localeCompare(b.nextDate ?? '9') || a.child_name.localeCompare(b.child_name))
  }, [doses.data, requests.data, vaccineFilter])

  const reminders = useMemo(() => remindersByChild(sms.data), [sms.data])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cards.filter((c) => {
      if (chip === 'missed' && c.missed.length === 0) return false
      if (chip === 'pending' && c.pending.length === 0) return false
      if (chip === 'assist' && !c.bhw_assist) return false
      if (requestFilter && c.request?.status !== requestFilter) return false
      if (from && (!c.nextDate || c.nextDate < from)) return false
      if (to && (!c.nextDate || c.nextDate > to)) return false
      if (!q) return true
      return [c.child_name, c.child_code, c.family_serial_no, c.barangay_name, ...c.missed.map((d) => d.vaccine_type), ...c.pending.map((d) => d.vaccine_type)]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [cards, chip, requestFilter, from, to, search])
  const { visible, bindList, listStyle, props: pagerProps } = usePagination(shown)

  const isOpen = (id: number) => openOverride[id] ?? false
  const allOpen = shown.length > 0 && shown.every((c) => isOpen(c.child_id))
  const noneOpen = shown.every((c) => !isOpen(c.child_id))
  const setAll = (open: boolean) => setOpenOverride(Object.fromEntries(shown.map((c) => [c.child_id, open])))

  if (!isReady) return <LogoLoader />
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view the vaccination schedule.</div>

  const canReview = !readOnly && (requests.data?.can_review ?? false)
  const missedCards = cards.filter((c) => c.missed.length)
  const worstOverall = missedCards.reduce<DoseRow | null>((w, c) => (c.worst && (!w || c.worst.days_overdue > w.days_overdue) ? c.worst : w), null)
  const awaiting = cards.filter((c) => c.request?.status === 'PENDING').length
  const chipCount: Record<StatusChip, number> = {
    all: cards.length, pending: cards.filter((c) => c.pending.length).length, missed: missedCards.length, assist: cards.filter((c) => c.bhw_assist).length,
  }
  const counts = doses.data?.counts

  function openReview(row: ScheduleRow, action: 'APPROVE' | 'REVISE') {
    setReviewing(row); setReviewAction(action); setReviewRemarks(''); setRemarksError(null)
  }
  async function submitReview() {
    if (readOnly || !reviewing) return
    if (!navigator.onLine) { toast.warning('You are offline. Reconnect to review this request; nothing was changed.'); return }
    if (reviewAction === 'REVISE' && !reviewRemarks.trim()) { setRemarksError('Say which date or change is needed.'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/vaccination/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_id: reviewing.schedule_id, action: reviewAction, review_remarks: reviewRemarks.trim() || null }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to submit the review.')
      toast.success(reviewAction === 'APPROVE' ? 'Schedule approved.' : 'Sent back to the requester for a new date.')
      setReviewing(null)
      refreshAll()
    } catch (err) {
      toast.error(`${err instanceof Error ? err.message : 'Unable to submit the review.'} Nothing was changed; try again.`)
    } finally {
      setSubmitting(false)
    }
  }
  const reviewChild = reviewing ? one(reviewing.child) : null
  const truncated = Boolean(counts && counts.total_matched > counts.total_shown)
  const chipLabel: Record<StatusChip, string> = { all: 'All', pending: 'Pending', missed: 'Defaulters (Missed)', assist: 'BHW to assist' }

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={doses.savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccination Schedule"
        subtitle="Each child's next dose, Missed doses with their new dates, schedule requests and guardian reminders."
        actions={<>
          {role === 'Administrator' && <Link href="/alerts?tab=SMS" className={buttonVariants({ variant: 'tonal' })}><MessageSquare size={16} aria-hidden="true" /> SMS history</Link>}
          {!readOnly && <BulkReminderButton rows={shown.map((c) => reminders.get(c.child_id)).filter((r): r is ReminderRow => Boolean(r))} data={sms.data} onSent={refreshAll} />}
        </>}
      />

      {doses.isLoading ? (
        <LogoLoader size="section" label="Loading the schedule…" />
      ) : doses.error && !doses.data ? (
        <LoadError what="the vaccination schedule" error={doses.error} onRetry={() => void doses.mutate()} />
      ) : (<>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard icon={<AlertCircle size={16} aria-hidden="true" />} label="Missed doses" value={counts?.overdue ?? 0} tone="danger"
            hint={worstOverall ? <>Longest missed: <span className="font-semibold text-brand-navy">{worstOverall.vaccine_type} {worstOverall.dose_number}</span> · {days(worstOverall.days_overdue)} · {worstOverall.child_name}</> : undefined}
            onClick={() => setChip(chip === 'missed' ? 'all' : 'missed')} pressed={chip === 'missed'} />
          <StatCard icon={<CalendarClock size={16} aria-hidden="true" />} label="Children with a pending dose" value={chipCount.pending} tone="info" onClick={() => setChip(chip === 'pending' ? 'all' : 'pending')} pressed={chip === 'pending'} />
          <StatCard icon={<HandHelping size={16} aria-hidden="true" />} label="BHW to assist" value={chipCount.assist} onClick={() => setChip(chip === 'assist' ? 'all' : 'assist')} pressed={chip === 'assist'} />
          <StatCard icon={<CheckCircle2 size={16} aria-hidden="true" />} label="Requests awaiting approval" value={awaiting} tone="warn" onClick={() => setRequestFilter(requestFilter === 'PENDING' ? '' : 'PENDING')} pressed={requestFilter === 'PENDING'} />
        </div>

        <fieldset disabled={readOnly} className="rounded-2xl border border-border bg-white p-4">
          <FilterBar
            chips={<FilterChips label="Show" value={chip} onChange={setChip} options={CHIPS.map((c) => ({ value: c, label: chipLabel[c], count: chipCount[c] }))} />}
            search={
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                <Input aria-label="Search the schedule" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Child name, Child ID, FSN, barangay or vaccine…" className="pl-9" />
              </div>
            }
            // Only when the server capped the list; the chip counts already say how many children.
            info={truncated && counts ? `Showing the ${counts.total_shown} longest-missed of ${counts.total_matched} missed doses. Pick a vaccine to see the rest.` : null}
            actions={shown.length > 1 ? <ExpandCollapseAll allOpen={allOpen} noneOpen={noneOpen} onSet={setAll} /> : null}
          >
            <Select aria-label="Vaccine" value={vaccineFilter} onChange={(e) => setVaccineFilter(e.target.value)}>
              <option value="">All vaccines</option>
              {NIP_CATALOG.filter((v) => v.routine_enabled !== false).map((v) => <option key={v.code} value={v.code}>{v.vaccine_type}</option>)}
            </Select>
            <Select aria-label="Schedule request" value={requestFilter} onChange={(e) => setRequestFilter(e.target.value)} disabled={!canSeeRequests}>
              <option value="">Any request</option>
              {(['PENDING', 'APPROVED', 'NEEDS_REVISION', 'COMPLETED', 'CANCELLED'] as const).map((k) => <option key={k} value={k}>{SCHEDULE_STATUS_META[k].label}</option>)}
            </Select>
            <DateInput value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Next date from" placeholder="Next date from (MM/DD/YYYY)" />
            <DateInput value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Next date to" placeholder="Next date to (MM/DD/YYYY)" />
          </FilterBar>
        </fieldset>

        <div key={`${chip}|${vaccineFilter}|${requestFilter}`} className={`animate-in fade-in duration-150 motion-reduce:animate-none ${doses.refreshing ? 'opacity-60 transition-opacity' : ''}`}>
          {shown.length === 0 ? (
            <EmptyState
              icon={chip === 'missed' ? CheckCircle2 : CalendarX}
              title={chip === 'missed' && !search.trim() ? 'No missed doses right now' : 'No children match these filters'}
              description={chip === 'missed' && !search.trim() ? 'Every child in scope is up to date on their vaccinations.' : 'Try another chip, name, Child ID, vaccine or date range.'}
              className="rounded-2xl border border-dashed border-border bg-white"
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
              <ul ref={bindList} style={listStyle} className="scroll-mt-4 space-y-2.5 p-3">
                {visible.map((c) => {
                  const open = isOpen(c.child_id)
                  const req = c.request
                  const pendingDate = c.pending[0] ? doseDate(c.pending[0]) : null
                  return (
                    <AccordionCard
                      key={c.child_id}
                      id={`schedule-${c.child_id}`}
                      open={open}
                      onToggle={() => setOpenOverride((o) => ({ ...o, [c.child_id]: !open }))}
                      header={<>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-brand-navy">{c.child_name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{c.child_code ?? `#${c.child_id}`} · {c.barangay_name ?? '—'}{c.date_of_birth ? ` · Born ${formatYmd(c.date_of_birth)}` : ''}</span>
                        </span>
                        {/* Status summary: one dose badge, plus the request only when it needs action. */}
                        <span className="flex flex-wrap items-center justify-end gap-1.5">
                          {c.missed.length > 0
                            ? <StatusBadge status="missed" tone="danger" label={`${c.missed.length} missed`} />
                            : pendingDate && <StatusBadge status="pending" tone="info" label={`Next · ${formatYmd(pendingDate)}`} />}
                          {req && (req.status === 'PENDING' || req.status === 'NEEDS_REVISION') && <StatusBadge status={req.status === 'PENDING' ? 'pending' : 'upcoming'} label={SCHEDULE_STATUS_META[req.status].label} />}
                          <BhwAssistBadge assist={c.bhw_assist} />
                        </span>
                      </>}
                    >
                      <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {canReview && req?.status === 'PENDING' && <>
                          <Button size="sm" onClick={() => openReview(req, 'APPROVE')}><CheckCircle2 size={14} aria-hidden="true" /> Approve {formatYmd(req.schedule_date)}</Button>
                          <Button size="sm" variant="tonal" onClick={() => openReview(req, 'REVISE')}><CalendarClock size={14} aria-hidden="true" /> Ask for new date</Button>
                        </>}
                        {!readOnly && (c.missed.length > 0 || c.pending.length > 0) && <SendReminderButton row={reminders.get(c.child_id)} data={sms.data} onSent={refreshAll} />}
                        {canFlag && !readOnly && <BhwAssistToggle variant="ghost" childId={c.child_id} childName={c.child_name} assist={c.bhw_assist} onChanged={refreshAll} />}
                        {canSeeRequests && <ScheduleHistoryButton variant="ghost" childId={c.child_id} childName={c.child_name} />}
                        <Link href={`/child-profiling/children/${c.child_id}#vaccination-schedule`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Child schedule</Link>
                        <Link href={`/child-profiling/children/${c.child_id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>View child <ArrowRight size={12} aria-hidden="true" /></Link>
                      </div>
                      {req && (
                        <p className="rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-border/70">
                          <span className="font-medium text-brand-navy">Schedule request for {formatYmd(req.schedule_date)}</span> · {SCHEDULE_STATUS_META[req.status].label}
                          {req.remarks && <span className="block text-xs text-muted-foreground">Requester: {req.remarks}</span>}
                          {req.review_remarks && <span className="block text-xs text-muted-foreground">Reviewer: {req.review_remarks}</span>}
                        </p>
                      )}
                      <ul className="space-y-2.5">
                        {c.missed.map((d) => (
                          <li key={`m-${d.vaccine_code}-${d.dose_number}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-border/70">
                            <span>
                              <span className="font-medium text-brand-navy">{d.vaccine_type} · Dose {d.dose_number}</span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">Due {formatYmd(d.due_date)} · missed for {days(d.days_overdue)}</span>
                            </span>
                            <StatusBadge status="missed" tone="danger" label={d.rescheduled_date ? `Missed · rescheduled to ${formatYmd(d.rescheduled_date)}` : 'Missed'} />
                          </li>
                        ))}
                        {c.pending.map((d) => (
                          <li key={`p-${d.vaccine_code}-${d.dose_number}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-white px-4 py-3 text-sm ring-1 ring-border/70">
                            <span className="font-medium text-brand-navy">{d.vaccine_type} · Dose {d.dose_number}</span>
                            <StatusBadge status="pending" tone="info" label={d.rescheduled_date ? `Pending · moved to ${formatYmd(d.rescheduled_date)}` : `Pending · ${formatYmd(d.due_date)}`} />
                          </li>
                        ))}
                        {c.missed.length === 0 && c.pending.length === 0 && <li className="text-sm text-muted-foreground">No routine doses due right now.</li>}
                      </ul>
                      </div>
                    </AccordionCard>
                  )
                })}
              </ul>
              <Pagination {...pagerProps} label="Schedule pages" />
            </div>
          )}
        </div>
      </>)}

      <Modal
        open={Boolean(reviewing) && !readOnly}
        size="sm"
        onClose={() => setReviewing(null)}
        busy={submitting}
        title={reviewAction === 'APPROVE' ? 'Approve schedule' : 'Ask for a new date'}
        subtitle={reviewing && reviewChild ? `${fullName(reviewChild)} · ${formatYmd(reviewing.schedule_date)}` : undefined}
        onSubmit={(e) => { e.preventDefault(); void submitReview() }}
        bodyClassName="space-y-4"
        footer={<Button type="submit" loading={submitting}>{reviewAction === 'APPROVE' ? 'Approve' : 'Send back for a new date'}</Button>}
      >
        {reviewing?.remarks && (
          <div className="rounded-lg bg-brand-ice p-3 text-sm">
            <p className="font-semibold text-brand-navy">Requester remarks</p>
            <p className="mt-1 text-brand-muted">{reviewing.remarks}</p>
          </div>
        )}
        <Field
          label={reviewAction === 'REVISE' ? 'What needs to change?' : 'Remarks (optional)'}
          required={reviewAction === 'REVISE'}
          hint={reviewAction === 'REVISE' ? 'The requester sees this and picks a new date. Schedules are never rejected.' : undefined}
          error={remarksError}
        >
          <Textarea
            value={reviewRemarks}
            onChange={(e) => { setReviewRemarks(e.target.value); setRemarksError(null) }}
            rows={3}
            placeholder={reviewAction === 'REVISE' ? 'e.g. No vaccinator on that day. Please choose a Wednesday.' : 'Any notes for the requester…'}
          />
        </Field>
      </Modal>
    </div>
  )
}

/* ═════════════════════════ Page ═════════════════════════ */

// Three tabs (NIP-REV01): Defaulters is Schedule's "Defaulters (Missed)" chip (with a count on the
// tab), SMS reminders are on Schedule rows, Vaccines is the NIP catalog (Admin/PHN edit it there;
// /vaccination/catalog and /settings/vaccine-catalog redirect to it) and Batch Requests live in Inventory.
const TABS = [
  { id: 'records', label: 'Records', resource: 'Vaccination' },
  { id: 'schedule', label: 'Schedule', resource: 'Vaccination' },
  { id: 'vaccines', label: 'Vaccines', resource: 'NIP Catalog' },
] as const

/** Schedule tab label with the number of defaulters (children with a missed dose). Same URL as
 *  the Schedule list's default view, so SWR shares one request. */
function ScheduleTabLabel({ enabled }: { enabled: boolean }) {
  const { data } = useVaccinationView<DosesPayload>(enabled ? '/api/vaccination/defaulters?include=pending' : null)
  const n = data?.counts.unique_children_affected ?? 0
  return (
    <span className="inline-flex items-center gap-2">
      Schedule
      {n > 0 && <span aria-label={`${n} defaulters`} className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums">{n}</span>}
    </span>
  )
}

type TabId = (typeof TABS)[number]['id']

export default function VaccinationPage() {
  const pathname = usePathname()
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const [chosen, setTab] = useState<TabId | null>(null)
  const tab: TabId = chosen ?? (pathname?.endsWith('/schedule') ? 'schedule' : pathname?.endsWith('/vaccines') ? 'vaccines' : 'records')

  if (!isReady) {
    return <LogoLoader />
  }

  const visible = role ? TABS.filter((t) => canPerform(role, t.resource, 'view')) : []
  if (visible.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
        <div>
          <h2 className="text-lg font-bold text-rose-900">Not authorized</h2>
          <p className="mt-1 text-sm text-rose-700">You do not have access to the Vaccination module.</p>
        </div>
      </div>
    )
  }
  const active: TabId = visible.some((t) => t.id === tab) ? tab : visible[0].id

  return (
    <div className="space-y-6">
      <TabBar
        label="Vaccination sections"
        group="vaccination"
        value={active}
        onChange={setTab}
        items={visible.map((t) => ({ value: t.id, label: t.id === 'schedule' ? <ScheduleTabLabel enabled={Boolean(role && canPerform(role, 'Vaccination', 'view'))} /> : t.id === 'vaccines'
          ? <span className="inline-flex items-center gap-2"><Syringe size={15} aria-hidden="true" />{t.label}</span>
          : t.label }))}
      />

      {/* Holds the previous tab's height and fades the new one in once its data is in. */}
      <TabPanel tabKey={active}>
        {active === 'records' && <RecordsSection key={user?.id} onGoToSchedule={() => setTab('schedule')} />}
        {active === 'schedule' && <ScheduleSection key={user?.id} />}
        {active === 'vaccines' && <CatalogSection key={user?.id} />}
      </TabPanel>
    </div>
  )
}
