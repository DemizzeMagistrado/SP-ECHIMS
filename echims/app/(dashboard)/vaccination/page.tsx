'use client'
import { StatCard } from '@/components/ui/stat-card'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// Vaccination module — all sections merged into one page (one route).
// Sections: Records · Schedule · Defaulters · SMS Reminders · NIP Catalog · Batch Requests.
// Each section keeps its own permission check, data fetching and modals.
// Only the active section is mounted, so only its API calls fire.

import React, { Fragment, useEffect, useMemo, useState } from 'react'
import { refreshOfflineViews as globalMutate } from '@/lib/offline/refresh'
import { useVaccinationView } from '@/hooks/use-vaccination-view'
import { vaccinationKeyMatches } from '@/lib/vaccination-cache'
import { VaccinationOfflineTools, VaccinationSnapshotNotice } from '@/components/vaccination/vaccination-offline-tools'
import Link from 'next/link'
import { usePathname, useRouter } from '@/lib/offline/navigation'
import {
  Plus, Package, AlertCircle, Hash, MapPin, CalendarClock, CheckCircle2, Clock, XCircle,
  Pencil, Power, Syringe, Eye, History, BookOpen, Shield, Info,
  ExternalLink, ArrowRight, Users, Search, Download,
  CalendarX, HandHelping,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { toast } from '@/components/ui/toast'
import { NIP_CATALOG } from '@/lib/nip-schedule'
import { BatchRequestModal } from '@/components/vaccination/batch-request-modal'
import { BatchRequestDecisionModal, type BatchRequestRow } from '@/components/vaccination/batch-request-decision-modal'
import { RecordVaccinationModal } from '@/components/vaccination/record-vaccination-modal'
import { VaccineFormModal, type VaccineCatalogRow } from '@/components/vaccination/vaccine-form-modal'
import { VaccinationSmsPanel } from '@/components/vaccination/vaccination-sms-panel'
import { LogoLoader } from '@/components/brand/logo-loader'
import { TabPanel } from '@/components/brand/page-gate'
import { FilterChips, TabBar } from '@/components/ui/module-tabs'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { DateInput, Input, Select, Textarea } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { AccordionCard, ExpandCollapseAll } from '@/components/ui/accordion-card'
import { DataTable } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { Field } from '@/components/ui/form'
import { BhwAssistBadge, BhwAssistToggle } from '@/components/vaccination/bhw-assist'

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

// Full timestamps
function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  PENDING: { label: 'Pending approval' },
  APPROVED: { label: 'Approved' },
  REJECTED: { label: 'Rejected' },
} as const

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
  const { data, error, isLoading, refreshing, readOnly, savedAt } = useVaccinationView<RecordsPayload>(isReady && canView ? url : null)
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
    if (reviewing.action === 'REJECT' && !reviewRemarks.trim()) { setRemarksError('Say why the record is rejected so the recorder can correct it.'); return }
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
        : 'Record rejected. The recorder can see your reason.')
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
          {canExport && (
            <Button variant="secondary" onClick={() => toast.info('CSV export is coming in a later update.')}>
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
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error.message}</div>
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
            <fieldset disabled={readOnly} className="grid w-full gap-3 sm:grid-cols-[1fr_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                <Input aria-label="Search records" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Child name, Child ID, FSN, vaccine or batch…" className="pl-9" />
              </div>
              <Select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="PENDING">Pending approval</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </Select>
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
            { key: 'status', header: 'Status', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} label={RECORD_STATUS_META[row.status].label} /> },
            {
              key: 'actions', header: <span className="sr-only">Actions</span>,
              cell: (row: RecordRow) => {
                const c = one(row.child)
                return (
                  <div className="flex flex-wrap justify-end gap-2 sm:justify-start">
                    {canReview && row.status === 'PENDING' && <>
                      <Button size="sm" onClick={() => openReview(row, 'APPROVE')}><CheckCircle2 size={14} aria-hidden="true" /> Approve</Button>
                      <Button size="sm" variant="secondary" className="text-danger" onClick={() => openReview(row, 'REJECT')}><XCircle size={14} aria-hidden="true" /> Reject record</Button>
                    </>}
                    {c && <Link href={`/child-profiling/children/${c.child_id}#vaccination-schedule`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Child schedule</Link>}
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
        title={reviewing?.action === 'REJECT' ? 'Reject this record' : 'Approve record'}
        subtitle={reviewing ? `${vaccineLabel(one(reviewing.row.vaccine))} dose ${reviewing.row.dose_number}${reviewChild ? ` for ${fullName(reviewChild)}` : ''}` : undefined}
        onSubmit={(e) => { e.preventDefault(); void submitReview() }}
        bodyClassName="space-y-4"
        footer={<Button type="submit" variant={reviewing?.action === 'REJECT' ? 'danger' : 'primary'} loading={submittingReview}>{reviewing?.action === 'REJECT' ? 'Reject record' : 'Approve'}</Button>}
      >
        {reviewing?.action === 'APPROVE' && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            One dose is deducted from the child&rsquo;s barangay stock{(one(reviewing.row.vaccine)?.companions ?? []).length ? `, plus ${(one(reviewing.row.vaccine)?.companions ?? []).map((x) => one(x.item)?.item_name).filter(Boolean).join(', ')}` : ''}.
          </p>
        )}
        {reviewing?.action === 'REJECT' && <p className="text-sm text-brand-muted">Use this when the record itself is wrong (wrong child, dose or date). The child&rsquo;s schedule is not affected.</p>}
        <Field label={reviewing?.action === 'REJECT' ? 'Reason' : 'Remarks (optional)'} required={reviewing?.action === 'REJECT'} error={remarksError}>
          <Textarea value={reviewRemarks} onChange={(e) => { setReviewRemarks(e.target.value); setRemarksError(null) }} rows={3} />
        </Field>
      </Modal>
    </div>
  )
}
/* ═════════════════════════ Schedule (NIP-USR002) ═════════════════════════ */

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
  barangay_id: number | null
  created_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  child: ScheduleChildRef | ScheduleChildRef[] | null
  barangay: BarangayRef | BarangayRef[] | null
}
type SchedulePayload = {
  rows: ScheduleRow[]
  can_review: boolean
  role: UserRole
}

const SCHEDULE_STATUS_META: Record<ScheduleRow['status'], { label: string }> = {
  PENDING: { label: 'Pending' },
  APPROVED: { label: 'Approved' },
  NEEDS_REVISION: { label: 'Needs new date' },
  ONGOING: { label: 'Ongoing' },
  COMPLETED: { label: 'Completed' },
  CANCELLED: { label: 'Cancelled' },
  REJECTED: { label: 'Rejected (old)' },
}
const SCHEDULE_FILTERS = ['PENDING', 'APPROVED', 'NEEDS_REVISION', 'COMPLETED', 'CANCELLED'] as const

function ScheduleSection() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination Schedule', 'view') : false
  const canFlag = role !== undefined && role !== 'Barangay Nutrition Scholar'

  const [status, setStatus] = useState<string>('PENDING')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reviewing, setReviewing] = useState<ScheduleRow | null>(null)
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REVISE'>('APPROVE')
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [remarksError, setRemarksError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (q.trim()) p.set('q', q.trim())
    return p.toString()
  }, [status, from, to, q])

  const url = `/api/vaccination/schedule${qs ? `?${qs}` : ''}`
  const { data, error, isLoading, refreshing, readOnly, savedAt } = useVaccinationView<SchedulePayload>(isReady && canView ? url : null)
  const router = useRouter()

  if (!isReady) return <LogoLoader />
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view the vaccination schedule.</div>

  const rows = data?.rows ?? []
  const canReview = !readOnly && (data?.can_review ?? false)
  const count = (st: ScheduleRow['status']) => rows.filter((r) => r.status === st).length

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_id: reviewing.schedule_id, action: reviewAction, review_remarks: reviewRemarks.trim() || null }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to submit the review.')
      toast.success(reviewAction === 'APPROVE' ? 'Schedule approved.' : 'Sent back to the requester for a new date.')
      setReviewing(null)
      revalidateVaccination(url)
    } catch (err) {
      toast.error(`${err instanceof Error ? err.message : 'Unable to submit the review.'} Nothing was changed; try again.`)
    } finally {
      setSubmitting(false)
    }
  }

  const reviewChild = reviewing ? one(reviewing.child) : null

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccination Schedule"
        subtitle={canReview ? 'Approve per-child vaccination schedules, or ask the requester for a new date.' : 'Track the vaccination schedule requests you have submitted.'}
      />

      {isLoading ? (
        <LogoLoader size="section" label="Loading schedule requests…" />
      ) : error && !data ? (
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error.message}</div>
      ) : (<>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total shown" value={rows.length} />
          <StatCard label="Pending" value={count('PENDING')} tone="warn" />
          <StatCard label="Approved" value={count('APPROVED')} tone="good" />
          <StatCard label="Needs new date" value={count('NEEDS_REVISION')} tone="info" />
        </div>

        <DataTable
          rows={rows}
          rowKey={(row) => row.schedule_id}
          caption="Vaccination schedule requests"
          refreshing={refreshing}
          mobile="cards"
          onRowClick={(row) => { const c = one(row.child); if (c) router.push(`/child-profiling/children/${c.child_id}`) }}
          rowLabel={(row) => { const c = one(row.child); return c ? `Open ${fullName(c)}'s profile` : 'Request' }}
          toolbar={
            <fieldset disabled={readOnly} className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_auto]">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                <Input aria-label="Search requests" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Child name, Child ID, FSN or barangay…" className="pl-9" />
              </div>
              <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {SCHEDULE_FILTERS.map((key) => <option key={key} value={key}>{SCHEDULE_STATUS_META[key].label}</option>)}
              </Select>
              <div className="flex items-center gap-2">
                <DateInput value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="min-w-0" />
                <span className="text-sm text-muted-foreground">to</span>
                <DateInput value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="min-w-0" />
              </div>
            </fieldset>
          }
          empty={{ icon: CalendarX, title: 'No schedule requests match these filters', description: 'Try a different status, date range, name or Child ID.' }}
          columns={[
            {
              key: 'child', header: 'Child', sortValue: (row) => { const c = one(row.child); return c ? fullName(c) : '' },
              cell: (row) => {
                const c = one(row.child)
                if (!c) return <span className="text-muted-foreground">—</span>
                return (
                  <span className="flex flex-col items-end gap-1 sm:items-start">
                    <span className="font-semibold text-brand-navy">{fullName(c)}</span>
                    <span className="text-xs text-muted-foreground">{c.child_code ?? `#${c.child_id}`} · {one(row.barangay)?.barangay_name ?? '—'}</span>
                    <BhwAssistBadge assist={one(c.assist)} />
                  </span>
                )
              },
            },
            { key: 'date', header: 'Scheduled for', sortValue: (row) => row.schedule_date, cell: (row) => <span className="font-medium">{formatYmd(row.schedule_date)}</span> },
            { key: 'status', header: 'Status', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status === 'NEEDS_REVISION' ? 'upcoming' : row.status} label={SCHEDULE_STATUS_META[row.status].label} /> },
            {
              key: 'actions', header: <span className="sr-only">Actions</span>,
              cell: (row: ScheduleRow) => {
                const c = one(row.child)
                return (
                  <div className="flex flex-wrap justify-end gap-2 sm:justify-start">
                    {canReview && row.status === 'PENDING' && <>
                      <Button size="sm" onClick={() => openReview(row, 'APPROVE')}><CheckCircle2 size={14} aria-hidden="true" /> Approve</Button>
                      <Button size="sm" variant="secondary" onClick={() => openReview(row, 'REVISE')}><CalendarClock size={14} aria-hidden="true" /> Ask for new date</Button>
                    </>}
                    {c && canFlag && !readOnly && <BhwAssistToggle childId={c.child_id} childName={fullName(c)} assist={one(c.assist)} onChanged={() => revalidateVaccination(url)} />}
                    {c && <Link href={`/child-profiling/children/${c.child_id}#vaccination-schedule`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Child schedule</Link>}
                  </div>
                )
              },
            },
          ]}
        />
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
/* ═════════════════════════ Defaulters (NIP-USR005) ═════════════════════════ */

type Defaulter = {
  child_id: number
  child_name: string
  child_code: string | null
  family_serial_no: string | null
  bhw_assist: { reason: string | null } | null
  date_of_birth: string
  barangay_id: number | null
  barangay_name: string | null
  vaccine_code: string
  vaccine_type: string
  dose_number: number
  due_date: string
  days_overdue: number
  rescheduled_date: string | null
  status: 'OVERDUE'
}

type DefaultersPayload = {
  defaulters: Defaulter[]
  counts: {
    overdue: number
    unique_children_affected: number
    total_children_in_scope: number
    total_shown: number
    total_matched: number
  }
  role: UserRole
}

type ChildGroup = {
  child_id: number
  child_name: string
  child_code: string | null
  family_serial_no: string | null
  bhw_assist: { reason: string | null } | null
  date_of_birth: string
  barangay_name: string | null
  doses: Defaulter[]
  /** The dose missed the longest (drives sort order and the summary). */
  worst: Defaulter
}

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
/** "Missed · rescheduled to Nov 20, 2026" (or "Missed" when no new date). */
function missedLabel(d: { rescheduled_date: string | null }) {
  return d.rescheduled_date ? `Missed · rescheduled to ${formatYmd(d.rescheduled_date)}` : 'Missed'
}

function DefaultersSection() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination', 'view') : false
  const canFlag = role !== undefined && role !== 'Barangay Nutrition Scholar'

  const [vaccineFilter, setVaccineFilter] = useState<string>('')
  const [assistOnly, setAssistOnly] = useState<'all' | 'assist'>('all')
  const [search, setSearch] = useState('')
  // Open state per child; every card starts collapsed on each visit.
  const [openOverride, setOpenOverride] = useState<Record<number, boolean>>({})

  const url = `/api/vaccination/defaulters${vaccineFilter ? `?vaccine=${vaccineFilter}` : ''}`
  const { data, error, isLoading, refreshing, readOnly, savedAt } = useVaccinationView<DefaultersPayload>(isReady && canView ? url : null)

  const groups = useMemo<ChildGroup[]>(() => {
    const byChild = new Map<number, ChildGroup>()
    for (const r of data?.defaulters ?? []) {
      const g = byChild.get(r.child_id)
      if (!g) {
        byChild.set(r.child_id, {
          child_id: r.child_id, child_name: r.child_name, child_code: r.child_code, family_serial_no: r.family_serial_no,
          bhw_assist: r.bhw_assist, date_of_birth: r.date_of_birth, barangay_name: r.barangay_name, doses: [r], worst: r,
        })
      } else {
        g.doses.push(r)
        if (r.days_overdue > g.worst.days_overdue) g.worst = r
      }
    }
    return [...byChild.values()].sort((a, b) => b.worst.days_overdue - a.worst.days_overdue || a.child_name.localeCompare(b.child_name))
  }, [data])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups.filter((g) => {
      if (assistOnly === 'assist' && !g.bhw_assist) return false
      if (!q) return true
      const hay = [g.child_name, g.child_code, g.family_serial_no, g.barangay_name, ...g.doses.map((d) => d.vaccine_type)].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [groups, search, assistOnly])
  const { visible, bindList, listStyle, props: pagerProps } = usePagination(shown)

  const isOpen = (id: number) => openOverride[id] ?? false
  const allOpen = shown.length > 0 && shown.every((g) => isOpen(g.child_id))
  const noneOpen = shown.every((g) => !isOpen(g.child_id))
  const setAll = (open: boolean) => setOpenOverride(Object.fromEntries(shown.map((g) => [g.child_id, open])))

  if (!isReady) return <LogoLoader />
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view the defaulters list.</div>

  const counts = data?.counts
  const assistCount = groups.filter((g) => g.bhw_assist).length

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccination: Defaulters"
        subtitle="Children with Missed doses (due date passed, not given). Each Missed dose shows its next valid date."
      />

      {isLoading ? (
        <LogoLoader size="section" label="Loading defaulters…" />
      ) : error && !data ? (
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error.message}</div>
      ) : (<>
        {counts && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard icon={<AlertCircle size={16} aria-hidden="true" />} label="Missed doses" value={counts.overdue} tone="danger" />
            <StatCard icon={<Users size={16} aria-hidden="true" />} label="Children affected" value={counts.unique_children_affected} tone="warn" />
            <StatCard icon={<HandHelping size={16} aria-hidden="true" />} label="BHW to assist" value={assistCount} tone="info" onClick={() => setAssistOnly(assistOnly === 'assist' ? 'all' : 'assist')} pressed={assistOnly === 'assist'} />
            <StatCard icon={<Syringe size={16} aria-hidden="true" />} label="Children in scope" value={counts.total_children_in_scope} />
          </div>
        )}

        <fieldset disabled={readOnly} className="space-y-3 rounded-2xl border border-border bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
              <Input aria-label="Search defaulters" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Child name, Child ID, FSN, barangay or vaccine…" className="pl-9" />
            </div>
            <Select aria-label="Vaccine" value={vaccineFilter} onChange={(e) => setVaccineFilter(e.target.value)}>
              <option value="">All vaccines</option>
              {NIP_CATALOG.filter((v) => v.routine_enabled !== false).map((v) => <option key={v.code} value={v.code}>{v.vaccine_type}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilterChips label="Show" value={assistOnly} onChange={setAssistOnly} options={[{ value: 'all', label: 'All children' }, { value: 'assist', label: 'BHW to assist', count: assistCount }]} />
            {shown.length > 1 && <ExpandCollapseAll allOpen={allOpen} noneOpen={noneOpen} onSet={setAll} />}
          </div>
          {counts && counts.total_matched > counts.total_shown && (
            <p className="text-xs text-muted-foreground">Showing the {counts.total_shown} longest-missed of {counts.total_matched} doses. Pick a vaccine to see the rest.</p>
          )}
        </fieldset>

        <div key={`${vaccineFilter}|${assistOnly}`} className={`animate-in fade-in duration-150 motion-reduce:animate-none ${refreshing ? 'opacity-60 transition-opacity' : ''}`}>
          {shown.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={search.trim() || assistOnly === 'assist' ? 'No children match these filters' : 'No missed doses right now'}
              description={search.trim() || assistOnly === 'assist' ? 'Try another name, Child ID or vaccine, or show all children.' : 'Every child in scope is up to date on their vaccinations.'}
              className="rounded-2xl border border-dashed border-good/30 bg-good-soft/40"
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
              <ul ref={bindList} style={listStyle} className="scroll-mt-4 space-y-2.5 p-3">
                {visible.map((g) => {
                  const open = isOpen(g.child_id)
                  return (
                    <AccordionCard
                      key={g.child_id}
                      id={`defaulter-${g.child_id}`}
                      open={open}
                      onToggle={() => setOpenOverride((o) => ({ ...o, [g.child_id]: !open }))}
                      header={<>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-brand-navy">{g.child_name}</span>
                          <span className="block text-xs text-muted-foreground">{g.child_code ?? `#${g.child_id}`} · {g.barangay_name ?? '—'} · Born {formatYmd(g.date_of_birth)}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                          <StatusBadge status="missed" tone="danger" label={`${g.doses.length} missed ${g.doses.length === 1 ? 'dose' : 'doses'}`} />
                          <span className="text-xs text-muted-foreground">Longest missed: <span className="font-semibold text-danger">{g.worst.vaccine_type} {g.worst.dose_number}, {days(g.worst.days_overdue)}</span></span>
                          <BhwAssistBadge assist={g.bhw_assist} />
                        </span>
                      </>}
                    >
                      <div className="mb-2 flex flex-wrap justify-end gap-2">
                        {canFlag && !readOnly && <BhwAssistToggle childId={g.child_id} childName={g.child_name} assist={g.bhw_assist} onChanged={() => revalidateVaccination(url)} />}
                        <Link href={`/child-profiling/children/${g.child_id}#vaccination-schedule`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Child schedule</Link>
                        <Link href={`/child-profiling/children/${g.child_id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>View child <ArrowRight size={12} aria-hidden="true" /></Link>
                      </div>
                      <ul className="space-y-2">
                        {g.doses.map((d) => (
                          <li key={`${d.vaccine_code}-${d.dose_number}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm ring-1 ring-border/70">
                            <span>
                              <span className="font-medium text-brand-navy">{d.vaccine_type} · Dose {d.dose_number}</span>
                              <span className="block text-xs text-muted-foreground">Due {formatYmd(d.due_date)} · missed for {days(d.days_overdue)}</span>
                            </span>
                            <StatusBadge status="missed" tone="danger" label={missedLabel(d)} />
                          </li>
                        ))}
                      </ul>
                    </AccordionCard>
                  )
                })}
              </ul>
              <Pagination {...pagerProps} label="Defaulter pages" />
            </div>
          )}
        </div>
      </>)}
    </div>
  )
}
/* ═════════════════════════ SMS Reminders ═════════════════════════ */

function SmsSection() {
  const { online } = useVaccinationView<unknown>(null)
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  if (!isReady) return <LogoLoader size="section" label="Checking session…" />
  if (!role || !canPerform(role, 'Vaccination', 'view'))
    return <p role="alert">You cannot view vaccination reminders.</p>
  return (
    <div className="space-y-6">
      <PageHeader
        title="Vaccination SMS Reminders"
        subtitle="Guardian messages and presentation simulation history"
      />
      <VaccinationSmsPanel online={online}/>
    </div>
  )
}

/* ═════════════════════════ NIP Catalog (NIP-USR006 / USR011) ═════════════════════════ */

type LatestChange = {
  audit_id: number
  vaccine_id: number
  action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE'
  changed_at: string
  changed_by: string
} | null

type CatalogPayload = {
  vaccines: (VaccineCatalogRow & { latest_change: LatestChange })[]
  can_edit: boolean
  role: UserRole
}

function CatalogSection() {
  const confirm = useConfirm()
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  // Admin edits; PHN reads. Everyone else is 403.
  const administrator = role === 'Administrator'
  const canView = role ? canPerform(role, 'NIP Catalog', 'view') : false

  const { data, error, isLoading, readOnly, savedAt } = useVaccinationView<CatalogPayload>(isReady && canView ? '/api/vaccines/catalog' : null)
  const isAdmin = administrator && !readOnly
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<VaccineCatalogRow | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  // NIP-USR011 — tracks which rows have the inline Guidelines panel expanded.
  // Using a Set so multiple rows can stay open simultaneously if the user wants
  // to compare two vaccines side-by-side.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const [search, setSearch] = useState('')
  // Active vaccines by default (Rotavirus is kept as inactive for old records).
  const [activeFilter, setActiveFilter] = useState<'all' | 'ACTIVE' | 'INACTIVE'>('ACTIVE')

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(v: VaccineCatalogRow) { setEditing(v); setModalOpen(true) }

  async function toggleActive(v: VaccineCatalogRow, nextActive: boolean) {
    if (readOnly || !navigator.onLine || togglingId) return
    const ok = await confirm(nextActive
      ? { title: `Reactivate ${v.vaccine_type}?`, description: 'It will reappear in schedule computation and the Record modal.', confirmLabel: 'Reactivate' }
      : { title: `Deactivate ${v.vaccine_type}?`, description: 'It will stop appearing in the Record modal and will be excluded from new schedule computation.', confirmLabel: 'Deactivate', tone: 'danger' })
    if (!ok) return
    setTogglingId(v.vaccine_id)
    try {
      // Toggle is folded into the main PATCH — no separate /toggle folder needed
      const r = await fetch('/api/vaccines/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_id: v.vaccine_id, is_active: nextActive }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Toggle failed.')
      toast.success(`${v.vaccine_type} ${nextActive ? 'reactivated' : 'deactivated'}.`)
      revalidateVaccination('/api/vaccines/catalog')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toggle failed.')
    } finally {
      setTogglingId(null)
    }
  }

  if (!isReady) return <LogoLoader />
  if (!canView) {
    return (
      <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div>
            <h2 className="text-lg font-bold text-rose-900">Not authorized</h2>
            <p className="mt-1 text-sm text-rose-700">You do not have access to the NIP vaccine catalog.</p>
          </div>
        </div>
      </div>
    )
  }

  const allRows = data?.vaccines ?? []
  const q = search.trim().toLowerCase()
  const rows = allRows.filter((v) => {
    const item = one(v.item)
    const isActive = item?.status === 'ACTIVE'
    return (!q || [item?.item_name, v.vaccine_type, item?.description].some((x) => x?.toLowerCase().includes(q)))
      && (activeFilter === 'all' || (activeFilter === 'ACTIVE') === isActive)
  })
  const allOpen = rows.length > 0 && rows.every((v) => expanded.has(v.vaccine_id))
  const noneOpen = rows.every((v) => !expanded.has(v.vaccine_id))
  const setAll = (open: boolean) => setExpanded(open ? new Set(rows.map((v) => v.vaccine_id)) : new Set())

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="NIP Vaccine Catalog"
        subtitle="The DOH immunization catalog and schedule rules. Open a vaccine for eligibility and guidelines; every change is logged."
        actions={isAdmin && (
          <Button onClick={openCreate}><Plus size={17} aria-hidden="true" /> Add new vaccine</Button>
        )}
      />

      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-xl border border-brand-blue/20 bg-brand-ice px-4 py-3 text-sm text-brand-navy">
          <Eye size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span><strong>Read-only view.</strong> Only administrators can add, edit or deactivate vaccines.</span>
        </div>
      )}

      {isLoading ? (
        <LogoLoader size="section" label="Loading catalog…" />
      ) : error && !data ? (
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error.message}</div>
      ) : allRows.length === 0 ? (
        <EmptyState size="page" icon={Syringe} title="No vaccines in the catalog yet" description={isAdmin ? 'Use “Add new vaccine” to add your first DOH entry.' : 'An administrator has not added vaccines yet.'} className="min-h-64 rounded-2xl border border-dashed border-border bg-white" />
      ) : (<>
        <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
              <Input aria-label="Search vaccines" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code…" className="pl-9" />
            </div>
            <Select aria-label="Status" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as 'all' | 'ACTIVE' | 'INACTIVE')}>
              <option value="all">All vaccines</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{rows.length} of {allRows.length} vaccines</span>
            {rows.length > 1 && <ExpandCollapseAll allOpen={allOpen} noneOpen={noneOpen} onSet={setAll} />}
          </div>
        </div>

        <div key={`${q}|${activeFilter}`} className="animate-in fade-in duration-150 motion-reduce:animate-none">
          {rows.length === 0 ? (
            <EmptyState icon={Syringe} title="No vaccines match these filters" description="Try another name, code or status." className="rounded-2xl border border-dashed border-border" />
          ) : (
            <ul className="space-y-2.5">
              {rows.map((v) => {
                const item = one(v.item)
                const active = item?.status === 'ACTIVE'
                const open = expanded.has(v.vaccine_id)
                return (
                  <AccordionCard
                    key={v.vaccine_id}
                    id={`catalog-${v.vaccine_id}`}
                    open={open}
                    onToggle={() => toggleExpanded(v.vaccine_id)}
                    className={active ? undefined : 'opacity-80'}
                    header={<>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-brand-navy">{item?.item_name ?? v.vaccine_type}</span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">{v.vaccine_type}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {v.total_doses} dose{v.total_doses === 1 ? '' : 's'} · from day {v.min_age_days}{v.interval_days ? `, +${v.interval_days} days each` : ''}{v.target_age ? ` · ${v.target_age}` : ''}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="text-xs text-muted-foreground">{[v.dose_volume, v.route].filter(Boolean).join(' · ') || '—'}</span>
                        <StatusBadge status={active ? 'active' : 'inactive'} label={active ? 'Active' : 'Inactive'} />
                      </span>
                    </>}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <History size={12} aria-hidden="true" />
                          {v.latest_change ? `Last change: ${v.latest_change.action.toLowerCase()} · ${formatTimestamp(v.latest_change.changed_at)}` : `Last updated ${formatTimestamp(v.updated_at)}`}
                        </span>
                        {isAdmin && (
                          <span className="flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={() => openEdit(v)}><Pencil size={12} aria-hidden="true" /> Edit</Button>
                            <Button variant="secondary" size="sm" className={active ? 'text-danger' : 'text-good'} loading={togglingId === v.vaccine_id} onClick={() => toggleActive(v, !active)}>
                              <Power size={12} aria-hidden="true" /> {active ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          </span>
                        )}
                      </div>
                      <GuidelinesPanel vaccine={v} isAdmin={isAdmin} onEdit={() => openEdit(v)} />
                    </div>
                  </AccordionCard>
                )
              })}
            </ul>
          )}
        </div>
      </>)}

      <VaccineFormModal
        open={modalOpen && !readOnly}
        onClose={() => setModalOpen(false)}
        onSaved={() => revalidateVaccination('/api/vaccines/catalog')}
        editing={editing}
      />
    </div>
  )
}

// NIP-USR011 — Inline Guidelines panel. Shows DOH text with consistent tone
// per field (emerald = eligibility, rose = contraindications, sky = DOH guide).
// Mirrors the Supplementation Guidelines tab's styling so the app reads as one
// system. Admin sees an "Edit guidelines" shortcut that opens the vaccine form
// so they don't have to scroll back to the Actions column.
function GuidelinesPanel({
  vaccine, isAdmin, onEdit,
}: {
  vaccine: VaccineCatalogRow & { latest_change: LatestChange }
  isAdmin: boolean
  onEdit: () => void
}) {
  const hasAnyText = Boolean(
    (vaccine.eligibility && vaccine.eligibility.trim()) ||
    (vaccine.contraindications && vaccine.contraindications.trim()) ||
    (vaccine.doh_guidelines && vaccine.doh_guidelines.trim()),
  )
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-sky-900">
          <BookOpen size={13} /> DOH Guidelines & Eligibility
        </h4>
        {isAdmin && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
          >
            <Pencil size={10} /> Edit guidelines
          </button>
        )}
      </div>

      {!hasAnyText && !vaccine.source_reference && (
        <div className="rounded-lg border border-dashed border-sky-200 bg-white px-3 py-2 text-xs italic text-muted-foreground">
          No DOH guidelines configured for this vaccine yet.
          {isAdmin && <> Click <strong>Edit guidelines</strong> to add them.</>}
        </div>
      )}

      {hasAnyText && (
        <div className="grid gap-2 md:grid-cols-3">
          <GuidelineBox
            icon={<CheckCircle2 size={12} className="text-emerald-700" />}
            tone="emerald"
            label="Eligibility"
            value={vaccine.eligibility}
          />
          <GuidelineBox
            icon={<Shield size={12} className="text-rose-700" />}
            tone="rose"
            label="Contraindications"
            value={vaccine.contraindications}
          />
          <GuidelineBox
            icon={<Info size={12} className="text-sky-700" />}
            tone="sky"
            label="DOH guidelines"
            value={vaccine.doh_guidelines}
          />
        </div>
      )}

      {vaccine.source_reference && (
        <a
          href={vaccine.source_reference}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          DOH source document <ExternalLink size={10} />
        </a>
      )}
    </div>
  )
}

function GuidelineBox({
  icon, tone, label, value,
}: {
  icon: React.ReactNode
  tone: 'emerald' | 'rose' | 'sky'
  label: string
  value: string | null
}) {
  const bg = {
    emerald: 'bg-emerald-50 border-emerald-100',
    rose: 'bg-rose-50 border-rose-100',
    sky: 'bg-sky-50 border-sky-100',
  }[tone]
  return (
    <div className={`rounded-lg border px-3 py-2 ${bg}`}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground">
        {value?.trim() || <span className="italic text-muted-foreground">Not configured yet.</span>}
      </p>
    </div>
  )
}
/* ═════════════════════════ Batch Requests (NIP-USR010) ═════════════════════════ */

type BatchPayload = {
  requests: BatchRequestRow[]
  role: UserRole
  can_create: boolean
  can_approve: boolean
}

const BATCH_STATUS_META: Record<string, { label: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', icon: <Clock size={11} /> },
  APPROVED: { label: 'Approved', icon: <CheckCircle2 size={11} /> },
  REJECTED: { label: 'Rejected', icon: <XCircle size={11} /> },
  COMPLETED: { label: 'Completed', icon: <CheckCircle2 size={11} /> },
  CANCELLED: { label: 'Cancelled', icon: <XCircle size={11} /> },
}

function BatchRequestsSection() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccine Batch Requests', 'view') : false
  const canTrace = role === 'Public Health Nurse' || role === 'Administrator'

  const [statusFilter, setStatusFilter] = useState<string>('')
  const url = statusFilter
    ? `/api/vaccination/batch-requests?status=${statusFilter}`
    : '/api/vaccination/batch-requests'

  const { data, error, isLoading, refreshing, readOnly, savedAt } = useVaccinationView<BatchPayload>(isReady && canView ? url : null)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [decisionTarget, setDecisionTarget] = useState<BatchRequestRow | null>(null)

  if (!isReady) {
    return <LogoLoader />
  }
  if (!canView) {
    return (
      <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div>
            <h2 className="text-lg font-bold text-rose-900">Not authorized</h2>
            <p className="mt-1 text-sm text-rose-700">You do not have access to vaccine batch requests.</p>
          </div>
        </div>
      </div>
    )
  }

  const allRows = data?.requests ?? []
  const q = search.trim().toLowerCase()
  const rows = q ? allRows.filter((r) => [one(r.item)?.item_name, one(r.vaccine)?.vaccine_type, r.batch_number, one(r.target_barangay)?.barangay_name, String(r.stock_request_id)]
    .some((x) => x?.toLowerCase().includes(q))) : allRows
  const canCreate = !readOnly && (data?.can_create ?? false)
  const canApprove = !readOnly && (data?.can_approve ?? false)
  const count = (st: string) => allRows.filter((r) => r.status === st).length

  function refresh() {
    revalidateVaccination(url)
  }

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccine Batch Requests"
        subtitle={<>RHMs request vaccine batches for a barangay; the PHN reviews them. Approval adds the doses to that barangay&rsquo;s inventory.</>}
        actions={canCreate && <Button onClick={() => setCreateOpen(true)}><Plus size={17} aria-hidden="true" /> New request</Button>}
      />

      {isLoading ? (
        <LogoLoader size="section" label="Loading requests…" />
      ) : error && !data ? (
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error.message}</div>
      ) : (<>
        {!statusFilter && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Requests" value={allRows.length} />
            <StatCard label="Pending review" value={count('PENDING')} tone="warn" />
            <StatCard label="Approved" value={count('APPROVED')} tone="good" />
            <StatCard label="Rejected" value={count('REJECTED')} tone="danger" />
          </div>
        )}
        <DataTable
          rows={rows}
          rowKey={(r) => r.stock_request_id}
          caption="Vaccine batch requests"
          refreshing={refreshing}
          mobile="cards"
          onRowClick={readOnly ? undefined : (r) => setDecisionTarget(r)}
          rowLabel={(r) => `Open request #${r.stock_request_id}`}
          toolbar={
            <fieldset disabled={readOnly} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <FilterChips
                label="Filter by status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={(['', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => ({ value: st, label: st === '' ? 'All' : BATCH_STATUS_META[st]?.label ?? st }))}
              />
              <div className="relative lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                <Input aria-label="Search requests" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vaccine, batch or barangay…" className="pl-9" />
              </div>
            </fieldset>
          }
          empty={{
            icon: Package,
            title: q ? 'No requests match this search' : statusFilter ? `No ${BATCH_STATUS_META[statusFilter]?.label.toLowerCase() ?? statusFilter.toLowerCase()} requests` : 'No batch requests yet',
            description: canCreate ? 'Use “New request” to submit a batch request.' : 'Nothing to review right now.',
          }}
          columns={[
            {
              key: 'vaccine', header: 'Vaccine · Batch', sortValue: (r) => one(r.item)?.item_name ?? one(r.vaccine)?.vaccine_type ?? '',
              cell: (r) => (
                <div>
                  <div className="font-semibold text-brand-navy">{one(r.item)?.item_name ?? one(r.vaccine)?.vaccine_type ?? '—'}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash size={10} aria-hidden="true" />
                    {r.batch_number && canTrace ? <Link href={`/inventory/batch-trace?batch_number=${encodeURIComponent(r.batch_number)}`} className="font-medium text-brand-blue hover:underline">{r.batch_number}</Link> : r.batch_number ?? '—'}
                    <span className="font-mono">· #{r.stock_request_id}</span>
                  </div>
                </div>
              ),
            },
            { key: 'qty', header: 'Qty', align: 'right', sortValue: (r) => r.requested_quantity, cell: (r) => <span><strong>{r.requested_quantity}</strong> <span className="text-xs text-muted-foreground">{one(r.item)?.unit ?? 'dose(s)'}</span></span> },
            {
              key: 'barangay', header: 'Barangay · requested', sortValue: (r) => r.request_date,
              cell: (r) => (
                <span className="flex flex-col items-end text-muted-foreground sm:items-start">
                  <span className="flex items-center gap-1"><MapPin size={11} aria-hidden="true" /> {one(r.target_barangay)?.barangay_name ?? '—'}</span>
                  <span className="flex items-center gap-1 text-xs"><CalendarClock size={10} aria-hidden="true" /> {formatYmd(r.request_date)}</span>
                </span>
              ),
            },
            { key: 'status', header: 'Status', sortValue: (r) => r.status, cell: (r) => { const meta = BATCH_STATUS_META[r.status] ?? BATCH_STATUS_META.PENDING; return <StatusBadge status={r.status} label={meta.label} icon={meta.icon} /> } },
            {
              key: 'action', header: 'Action',
              cell: (r) => (
                <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setDecisionTarget(r)}>
                  {canApprove && r.status === 'PENDING' ? 'Review' : 'View'}
                </Button>
              ),
            },
          ]}
        />
      </>)}

      {/* Modals */}
      <BatchRequestModal
        open={createOpen && !readOnly}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <BatchRequestDecisionModal
        open={!!decisionTarget && !readOnly}
        onClose={() => setDecisionTarget(null)}
        onDecided={refresh}
        request={decisionTarget}
      />
    </div>
  )
}
/* ═════════════════════════ Page ═════════════════════════ */

const TABS = [
  { id: 'records', label: 'Records', resource: 'Vaccination' },
  { id: 'defaulters', label: 'Defaulters', resource: 'Vaccination' },
  { id: 'schedule', label: 'Schedule', resource: 'Vaccination Schedule' },
  { id: 'catalog', label: 'NIP Catalog', resource: 'NIP Catalog' },
  { id: 'batch', label: 'Batch Requests', resource: 'Vaccine Batch Requests' },
  { id: 'sms', label: 'SMS Reminders', resource: 'Vaccination' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function VaccinationPage() {
  const pathname = usePathname()
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const [tab, setTab] = useState<TabId>('records')
  useEffect(() => {
    const routes: Record<string, TabId> = {
      records: 'records', defaulters: 'defaulters', schedule: 'schedule',
      catalog: 'catalog', 'batch-requests': 'batch', sms: 'sms',
    }
    const section = pathname?.split('/').filter(Boolean).pop() ?? ''
    if (routes[section]) setTab(routes[section])
  }, [pathname])

  if (!isReady) {
    return <LogoLoader />
  }

  // Only show tabs the current role may view
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
        items={visible.map((t) => ({ value: t.id, label: t.label }))}
      />

      {/* Holds the previous tab's height and fades the new one in once its data is in. */}
      <TabPanel tabKey={active}>
        {active === 'records' && <RecordsSection key={user?.id} onGoToSchedule={() => setTab('schedule')} />}
        {active === 'schedule' && <ScheduleSection key={user?.id} />}
        {active === 'defaulters' && <DefaultersSection key={user?.id} />}
        {active === 'sms' && <SmsSection key={user?.id} />}
        {active === 'catalog' && <CatalogSection key={user?.id} />}
        {active === 'batch' && <BatchRequestsSection key={user?.id} />}
      </TabPanel>
    </div>
  )
}
