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
  Pencil, Power, Syringe, Eye, History, ChevronDown, ChevronRight, BookOpen, Shield, Info,
  ExternalLink, ArrowRight, Users, Search, Download, Calendar as CalendarIcon,
  CalendarX,
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
import { TabBar } from '@/components/ui/module-tabs'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { DateInput, Input, Select, Textarea } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { AccordionCard, ExpandCollapseAll } from '@/components/ui/accordion-card'
import { DataTable } from '@/components/ui/data-table'

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
}
type RecordsPayload = {
  rows: RecordRow[]
  can_create: boolean
  can_review: boolean
  can_export: boolean
  role: UserRole
}

const RECORD_STATUS_META = {
  PENDING: { label: 'Pending' },
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

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [reviewing, setReviewing] = useState<{ row: RecordRow; action: 'APPROVE' | 'REJECT' } | null>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
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

  async function openReview(row: RecordRow, action: 'APPROVE' | 'REJECT') {
    setReviewing({ row, action })
    setReviewRemarks('')
  }

  async function submitReview() {
    if (readOnly || !navigator.onLine || !reviewing) return
    if (reviewing.action === 'REJECT' && !reviewRemarks.trim()) {
      toast.error('A reason is required when rejecting a record.')
      return
    }
    setSubmittingReview(true)
    try {
      const r = await fetch(`/api/vaccination/record-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: reviewing.row.vaccination_record_id,
          action: reviewing.action,
          review_remarks: reviewRemarks.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to submit the review.')
      toast.success(`Record ${reviewing.action === 'APPROVE' ? 'approved' : 'rejected'}.`)
      setReviewing(null)
      setReviewRemarks('')
      revalidateVaccination('/api/vaccination/records')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Review failed.')
    } finally {
      setSubmittingReview(false)
    }
  }

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
            <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-[1fr_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                <Input aria-label="Search records" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by child name…" className="pl-9" />
              </div>
              <Select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="PENDING">Pending</option>
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
              cell: (row) => { const c = one(row.child); return c ? <span className="font-semibold text-brand-navy">{fullName(c)}</span> : <span className="text-muted-foreground">—</span> },
            },
            { key: 'vaccine', header: 'Vaccine', sortValue: (row) => vaccineLabel(one(row.vaccine)), cell: (row) => <span className="font-medium">{vaccineLabel(one(row.vaccine))}</span> },
            { key: 'dose', header: 'Dose', sortValue: (row) => row.dose_number, cell: (row) => `Dose ${row.dose_number}` },
            { key: 'date', header: 'Date', sortValue: (row) => row.vaccination_date, cell: (row) => formatYmd(row.vaccination_date) },
            { key: 'batch', header: 'Batch', cell: (row) => row.batch_number ?? '—' },
            { key: 'recorder', header: 'Recorded by', sortValue: (row) => recorderName(one(row.recorder)), cell: (row) => recorderName(one(row.recorder)) },
            { key: 'status', header: 'Status', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} label={RECORD_STATUS_META[row.status].label} /> },
            ...(canReview ? [{
              key: 'review', header: 'Review',
              cell: (row: RecordRow) => row.status === 'PENDING' ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openReview(row, 'APPROVE')}><CheckCircle2 size={14} aria-hidden="true" /> Approve</Button>
                  <Button size="sm" variant="secondary" className="text-danger" onClick={() => openReview(row, 'REJECT')}><XCircle size={14} aria-hidden="true" /> Reject</Button>
                </div>
              ) : <span className="text-xs text-muted-foreground">—</span>,
            }] : []),
          ]}
        />
      )}

      {/* Record modal */}
      <RecordVaccinationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => revalidateVaccination('/api/vaccination/records')}
        ownerId={user?.id ?? null}
      />

      {/* Review modal */}
      {reviewing && !readOnly && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
          <div className="mx-auto mt-20 max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {reviewing.action === 'APPROVE' ? 'Approve record' : 'Reject record'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {(() => {
                    const c = one(reviewing.row.child)
                    const v = one(reviewing.row.vaccine)
                    return `${vaccineLabel(v)} dose ${reviewing.row.dose_number}${c ? ` for ${fullName(c)}` : ''}.`
                  })()}
                </p>
                {reviewing.action === 'APPROVE' && (
                  <p className="mt-2 text-xs text-amber-700">
                    Stock will be deducted from the child&apos;s barangay inventory on approval.
                  </p>
                )}
              </div>
              <button
                onClick={() => { setReviewing(null); setReviewRemarks('') }}
                className="text-muted-foreground"
                aria-label="Close"
              >×</button>
            </div>

            <label className="mt-4 block text-sm font-medium text-foreground">
              {reviewing.action === 'REJECT' ? 'Reason for rejection (required)' : 'Review remarks (optional)'}
              <Textarea
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary"
                onClick={() => { setReviewing(null); setReviewRemarks('') }}
               
              >Cancel</Button>
              <Button variant={reviewing.action === 'APPROVE' ? 'primary' : 'danger'} onClick={submitReview} loading={submittingReview}>
                {reviewing.action === 'APPROVE' ? 'Confirm approve' : 'Confirm reject'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
/* ═════════════════════════ Schedule (NIP-USR002) ═════════════════════════ */

type ScheduleChildRef = { child_id: number; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string }
type BarangayRef = { barangay_id: number; barangay_name: string }
type ScheduleRow = {
  schedule_id: number
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
  REJECTED: { label: 'Rejected' },
  NEEDS_REVISION: { label: 'Needs revision' },
  ONGOING: { label: 'Ongoing' },
  COMPLETED: { label: 'Completed' },
  CANCELLED: { label: 'Cancelled' },
}

function ScheduleSection() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination Schedule', 'view') : false

  const [status, setStatus] = useState<string>('PENDING')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reviewing, setReviewing] = useState<ScheduleRow | null>(null)
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | null>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
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
  const pendingCount = rows.filter((r) => r.status === 'PENDING').length
  const approvedCount = rows.filter((r) => r.status === 'APPROVED').length
  const rejectedCount = rows.filter((r) => r.status === 'REJECTED').length

  async function openReview(row: ScheduleRow, action: 'APPROVE' | 'REJECT') {
    setReviewing(row)
    setReviewAction(action)
    setReviewRemarks('')
  }

  async function submitReview() {
    if (readOnly || !navigator.onLine || !reviewing || !reviewAction) return
    if (reviewAction === 'REJECT' && !reviewRemarks.trim()) {
      toast.error('A reason is required when rejecting a request.')
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch('/api/vaccination/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: reviewing.schedule_id,
          action: reviewAction,
          review_remarks: reviewRemarks.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to submit the review.')
      toast.success(`Request ${reviewAction === 'APPROVE' ? 'approved' : 'rejected'}.`)
      setReviewing(null)
      setReviewAction(null)
      setReviewRemarks('')
      revalidateVaccination(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit the review.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccination Schedule"
        subtitle={<>{canReview ? 'Review and approve per-child vaccination schedule requests from BHWs and RHMs.' : 'Track the status of vaccination schedule requests you have submitted.'}</>}
      />

      {isLoading ? (
        <LogoLoader size="section" label="Loading schedule requests…" />
      ) : error && !data ? (
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error.message}</div>
      ) : (<>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total shown" value={rows.length} />
          <StatCard label="Pending" value={pendingCount} tone="warn" />
          <StatCard label="Approved" value={approvedCount} tone="good" />
          <StatCard label="Rejected" value={rejectedCount} tone="danger" />
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
            <fieldset disabled={readOnly} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_auto]">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                <Input aria-label="Search requests" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by child name…" className="pl-9" />
              </div>
              <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {Object.entries(SCHEDULE_STATUS_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </Select>
              <div className="flex items-center gap-2">
                <CalendarIcon size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                <DateInput value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="min-w-0" />
                <span className="text-sm text-muted-foreground">to</span>
                <DateInput value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="min-w-0" />
              </div>
            </fieldset>
          }
          empty={{ icon: CalendarX, title: 'No schedule requests match these filters', description: 'Try a different status, date range or name.' }}
          columns={[
            {
              key: 'child', header: 'Child', sortValue: (row) => { const c = one(row.child); return c ? fullName(c) : '' },
              cell: (row) => { const c = one(row.child); return c ? <span className="font-semibold text-brand-navy">{fullName(c)}</span> : <span className="text-muted-foreground">—</span> },
            },
            { key: 'barangay', header: 'Barangay', sortValue: (row) => one(row.barangay)?.barangay_name ?? '', cell: (row) => one(row.barangay)?.barangay_name ?? '—' },
            { key: 'requested', header: 'Requested', sortValue: (row) => row.created_at, cell: (row) => formatTimestamp(row.created_at) },
            { key: 'date', header: 'Scheduled for', sortValue: (row) => row.schedule_date, cell: (row) => <span className="font-medium">{formatYmd(row.schedule_date)}</span> },
            { key: 'status', header: 'Status', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} label={SCHEDULE_STATUS_META[row.status].label} /> },
            ...(canReview ? [{
              key: 'review', header: 'Review',
              cell: (row: ScheduleRow) => (row.status === 'PENDING' || row.status === 'NEEDS_REVISION') ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openReview(row, 'APPROVE')}><CheckCircle2 size={14} aria-hidden="true" /> Approve</Button>
                  <Button size="sm" variant="secondary" className="text-danger" onClick={() => openReview(row, 'REJECT')}><XCircle size={14} aria-hidden="true" /> Reject</Button>
                </div>
              ) : <span className="text-xs text-muted-foreground">—</span>,
            }] : []),
          ]}
        />
      </>)}

      {/* Review modal */}
      {reviewing && reviewAction && !readOnly && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
          <div className="mx-auto mt-20 max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {reviewAction === 'APPROVE' ? 'Approve request' : 'Reject request'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {(() => {
                    const c = one(reviewing.child)
                    return c ? `For ${fullName(c)} on ${new Date(reviewing.schedule_date + 'T00:00:00').toLocaleDateString()}.` : ''
                  })()}
                </p>
              </div>
              <button
                onClick={() => { setReviewing(null); setReviewAction(null); setReviewRemarks('') }}
                className="text-2xl text-muted-foreground"
                aria-label="Close"
              >×</button>
            </div>

            {reviewing.remarks && (
              <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
                <p className="font-semibold text-foreground">Requester remarks</p>
                <p className="mt-1 text-muted-foreground">{reviewing.remarks}</p>
              </div>
            )}

            <label className="mt-4 block text-sm font-medium text-foreground">
              {reviewAction === 'REJECT' ? 'Reason for rejection (required)' : 'Review remarks (optional)'}
              <Textarea
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                rows={3}
                placeholder={reviewAction === 'REJECT' ? 'Explain why this request is being rejected...' : 'Any notes for the requester...'}
                className="mt-1"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary"
                onClick={() => { setReviewing(null); setReviewAction(null); setReviewRemarks('') }}
               
              >Cancel</Button>
              <Button variant={reviewAction === 'APPROVE' ? 'primary' : 'danger'} onClick={submitReview} loading={submitting}>
                {reviewAction === 'APPROVE' ? 'Confirm approve' : 'Confirm reject'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
/* ═════════════════════════ Defaulters (NIP-USR005) ═════════════════════════ */

type Defaulter = {
  child_id: number
  child_name: string
  date_of_birth: string
  barangay_id: number | null
  barangay_name: string | null
  vaccine_code: string
  vaccine_type: string
  dose_number: number
  due_date: string
  days_overdue: number
  status: 'DUE' | 'OVERDUE'
}

type DefaultersPayload = {
  defaulters: Defaulter[]
  counts: {
    overdue: number
    due: number
    unique_children_affected: number
    total_children_in_scope: number
    total_shown: number
    total_matched: number
  }
  role: UserRole
  grace_period_days: number
}

type ChildGroup = {
  child_id: number
  child_name: string
  date_of_birth: string
  barangay_name: string | null
  overdue_count: number
  due_count: number
  worst_days_overdue: number     // max days overdue across the child's doses — drives sort order
  doses: Defaulter[]
}

function DefaultersSection() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination', 'view') : false

  const [statusFilter, setStatusFilter] = useState<'' | 'OVERDUE' | 'DUE'>('OVERDUE')
  const [vaccineFilter, setVaccineFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  // Open state per child; untouched cards start closed (long lists stay scannable).
  const [openOverride, setOpenOverride] = useState<Record<number, boolean>>({})

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (statusFilter) p.set('status', statusFilter)
    if (vaccineFilter) p.set('vaccine', vaccineFilter)
    return p.toString()
  }, [statusFilter, vaccineFilter])

  const url = `/api/vaccination/defaulters${qs ? `?${qs}` : ''}`
  const { data, error, isLoading, refreshing, readOnly, savedAt } = useVaccinationView<DefaultersPayload>(isReady && canView ? url : null)

  // Group the flat defaulter list by child
  const groups = useMemo<ChildGroup[]>(() => {
    const rows = data?.defaulters ?? []
    const byChild = new Map<number, ChildGroup>()
    for (const r of rows) {
      let g = byChild.get(r.child_id)
      if (!g) {
        g = {
          child_id: r.child_id,
          child_name: r.child_name,
          date_of_birth: r.date_of_birth,
          barangay_name: r.barangay_name,
          overdue_count: 0,
          due_count: 0,
          worst_days_overdue: 0,
          doses: [],
        }
        byChild.set(r.child_id, g)
      }
      g.doses.push(r)
      if (r.status === 'OVERDUE') g.overdue_count++
      else g.due_count++
      if (r.days_overdue > g.worst_days_overdue) g.worst_days_overdue = r.days_overdue
    }
    // Sort groups: worst-overdue first, then by name
    return [...byChild.values()].sort((a, b) => {
      if (a.worst_days_overdue !== b.worst_days_overdue) return b.worst_days_overdue - a.worst_days_overdue
      return a.child_name.localeCompare(b.child_name)
    })
  }, [data])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? groups.filter((g) => g.child_name.toLowerCase().includes(q) || (g.barangay_name ?? '').toLowerCase().includes(q)) : groups
  }, [groups, search])
  const isOpen = (id: number) => openOverride[id] ?? false
  const allOpen = shown.length > 0 && shown.every((g) => isOpen(g.child_id))
  const noneOpen = shown.every((g) => !isOpen(g.child_id))
  const setAll = (open: boolean) => setOpenOverride(Object.fromEntries(shown.map((g) => [g.child_id, open])))

  if (!isReady) return <LogoLoader />
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view the defaulters list.</div>

  const counts = data?.counts
  // Both API statuses are past the due date: OVERDUE is past the grace period ("Missed"),
  // DUE is within it ("Recently missed"). Wording only; the rules are unchanged.
  const missedLabel = (st: 'DUE' | 'OVERDUE') => (st === 'OVERDUE' ? 'Missed' : 'Recently missed')

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccination: Defaulters"
        subtitle={<>Children with vaccine doses past their due date{data ? <> · missed more than {data.grace_period_days} days ago is &ldquo;Missed&rdquo;, sooner is &ldquo;Recently missed&rdquo;</> : null}.</>}
      />

      {isLoading ? (
        <LogoLoader size="section" label="Loading defaulters…" />
      ) : error && !data ? (
        <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error.message}</div>
      ) : (<>
        {counts && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <SummaryTile icon={<AlertCircle size={16} aria-hidden="true" />} label="Missed doses" value={counts.overdue} tone="rose" />
            <SummaryTile icon={<Clock size={16} aria-hidden="true" />} label="Recently missed" value={counts.due} tone="amber" />
            <SummaryTile icon={<Users size={16} aria-hidden="true" />} label="Children affected" value={counts.unique_children_affected} tone="sky" />
            <SummaryTile icon={<Syringe size={16} aria-hidden="true" />} label="Children in scope" value={counts.total_children_in_scope} tone="slate" />
          </div>
        )}

        <fieldset disabled={readOnly} className="space-y-3 rounded-2xl border border-border bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_220px_220px]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
              <Input aria-label="Search children" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by child or barangay…" className="pl-9" />
            </div>
            <Select aria-label="Missed status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | 'OVERDUE' | 'DUE')}>
              <option value="">All missed doses</option>
              <option value="OVERDUE">Missed (past grace period)</option>
              <option value="DUE">Recently missed</option>
            </Select>
            <Select aria-label="Vaccine" value={vaccineFilter} onChange={(e) => setVaccineFilter(e.target.value)}>
              <option value="">All vaccines</option>
              {NIP_CATALOG.map((v) => <option key={v.code} value={v.code}>{v.vaccine_type}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {counts && counts.total_matched > counts.total_shown ? `Showing ${counts.total_shown} of ${counts.total_matched} doses — narrow the filters to see more.` : `${shown.length} ${shown.length === 1 ? 'child' : 'children'}`}
            </span>
            {shown.length > 1 && <ExpandCollapseAll allOpen={allOpen} noneOpen={noneOpen} onSet={setAll} />}
          </div>
        </fieldset>

        <div key={`${statusFilter}|${vaccineFilter}`} className={`animate-in fade-in duration-150 motion-reduce:animate-none ${refreshing ? 'opacity-60 transition-opacity' : ''}`}>
          {shown.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={search.trim() ? 'No children match this search' : 'No missed doses right now'}
              description={search.trim() ? 'Try another name or barangay.' : 'Every child in these filters is up to date on their vaccinations.'}
              className="rounded-2xl border border-dashed border-good/30 bg-good-soft/40"
            />
          ) : (
            <ul className="space-y-2.5">
              {shown.map((g) => {
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
                        <span className="block text-xs text-muted-foreground">{g.barangay_name ?? '—'} · Born {formatYmd(g.date_of_birth)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {g.overdue_count > 0 && <StatusBadge status="missed" tone="danger" label={`${g.overdue_count} missed`} />}
                        {g.due_count > 0 && <StatusBadge status="recently-missed" tone="warn" label={`${g.due_count} recently missed`} />}
                        <span className="text-xs text-muted-foreground sm:w-36 sm:text-right">
                          Longest <span className={`font-semibold ${g.worst_days_overdue > 60 ? 'text-danger' : g.worst_days_overdue > 30 ? 'text-warn' : 'text-brand-navy'}`}>{g.worst_days_overdue} {g.worst_days_overdue === 1 ? 'day' : 'days'}</span>
                        </span>
                      </span>
                    </>}
                  >
                    <div className="mb-2 flex justify-end">
                      <Link href={`/child-profiling/children/${g.child_id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                        View child <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    </div>
                    <table className="hidden w-full text-left text-sm sm:table">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-brand-muted">
                          <th className="pb-2 pr-3 font-medium">Vaccine</th>
                          <th className="pb-2 pr-3 font-medium">Dose</th>
                          <th className="pb-2 pr-3 font-medium">Due date</th>
                          <th className="pb-2 pr-3 font-medium">Missed for</th>
                          <th className="pb-2 text-right font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {g.doses.map((d, idx) => (
                          <tr key={`${d.vaccine_code}-${d.dose_number}-${idx}`}>
                            <td className="py-2.5 pr-3 font-medium text-brand-navy">{d.vaccine_type}</td>
                            <td className="py-2.5 pr-3 text-muted-foreground">Dose {d.dose_number}</td>
                            <td className="py-2.5 pr-3 text-muted-foreground">{formatYmd(d.due_date)}</td>
                            <td className="py-2.5 pr-3 text-muted-foreground">{d.days_overdue} {d.days_overdue === 1 ? 'day' : 'days'}</td>
                            <td className="py-2.5 text-right"><StatusBadge status={d.status} tone={d.status === 'OVERDUE' ? 'danger' : 'warn'} label={missedLabel(d.status)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <ul className="space-y-2 sm:hidden">
                      {g.doses.map((d, idx) => (
                        <li key={`${d.vaccine_code}-${d.dose_number}-${idx}`} className="rounded-lg bg-white p-3 text-sm ring-1 ring-border/70">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-brand-navy">{d.vaccine_type} · Dose {d.dose_number}</span>
                            <StatusBadge status={d.status} tone={d.status === 'OVERDUE' ? 'danger' : 'warn'} label={missedLabel(d.status)} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">Due {formatYmd(d.due_date)} · missed for {d.days_overdue} {d.days_overdue === 1 ? 'day' : 'days'}</p>
                        </li>
                      ))}
                    </ul>
                  </AccordionCard>
                )
              })}
            </ul>
          )}
        </div>
      </>)}
    </div>
  )
}

function SummaryTile({ icon, label, value, tone }: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'rose' | 'amber' | 'sky' | 'slate'
}) {
  const map = { rose: 'danger', amber: 'warn', sky: 'info', slate: 'default' } as const
  return <StatCard icon={icon} label={label} value={value} tone={map[tone]} />
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

  const rows = data?.vaccines ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="NIP Vaccine Catalog"
        subtitle="Maintain the DOH immunization catalog and schedule rules. Every change is logged."
        actions={<>
          {isAdmin && (
            <Button
              onClick={openCreate}
            >
              <Plus size={17} /> Add new vaccine
            </Button>
          )}
        </>}
      />

      {/* Read-only banner for non-admin viewers (e.g. PHN, RHM, BHW) */}
      {!isAdmin && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Eye size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>Read-only view.</strong> Click any row to see DOH eligibility, contraindications, and guidelines before administering a dose. Only administrators can add, edit, or deactivate vaccines.
          </span>
        </div>
      )}
      {/* NIP-USR011 — expand hint (admin view too, so they discover guidelines live here) */}
      {isAdmin && rows.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-2.5 text-xs text-sky-900">
          <BookOpen size={14} className="mt-0.5 shrink-0" />
          <span>
            Click any row to view DOH Guidelines & Eligibility inline. Edit via the vaccine form.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-white"><LogoLoader size="section" label="Loading catalog…" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <EmptyState size="page" icon={Syringe} title="No vaccines in the catalog yet" description="Use “Add new vaccine” to add your first DOH entry." className="min-h-64 rounded-2xl border border-dashed border-sky-200 bg-white" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            {/* NIP-USR011 — table-layout: fixed + explicit column widths on <thead>
                so that expanding a Guidelines row doesn't force the browser to
                recalculate column widths and shift sibling collapsed rows.
                Column widths sum to 100% of the min-w-[1100px] canvas. */}
            <table className="w-full min-w-[1100px] text-left text-sm" style={{ tableLayout: 'fixed' }}>
              {/* Column widths (left to right): caret · Vaccine · Code · Schedule
                  · Administration · Status · Last change · Actions (admin only).
                  Comments live out here — JSX comments INSIDE <colgroup> become
                  whitespace text nodes that break React hydration. */}
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '14%' }} />
                {isAdmin && <col style={{ width: '17%' }} />}
              </colgroup>
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {/* Caret column — click anywhere on the row to expand Guidelines. */}
                  <th className="px-3 py-4 font-semibold"></th>
                  <th className="px-5 py-4 font-semibold">Vaccine</th>
                  <th className="px-5 py-4 font-semibold">Code</th>
                  <th className="px-5 py-4 font-semibold">Schedule</th>
                  <th className="px-5 py-4 font-semibold">Administration</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Last change</th>
                  {isAdmin && <th className="px-5 py-4 font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((v) => {
                  const item = one(v.item)
                  const active = item?.status === 'ACTIVE'
                  const isOpen = expanded.has(v.vaccine_id)
                  const colSpan = isAdmin ? 8 : 7
                  return (
                    <React.Fragment key={v.vaccine_id}>
                      <tr
                        className={`${active ? 'hover:bg-muted/40' : 'bg-slate-50/60'} cursor-pointer`}
                        onClick={() => toggleExpanded(v.vaccine_id)}
                        aria-expanded={isOpen}
                      >
                        <td className="px-3 py-4 align-top">
                          <span className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-top">
                          {/* break-words lets long vaccine names wrap instead of
                              widening the column. */}
                          <div className="font-semibold text-foreground break-words">{item?.item_name ?? '—'}</div>
                          {item?.description && <div className="mt-0.5 text-xs text-muted-foreground break-words">{item.description}</div>}
                        </td>
                        <td className="px-5 py-4"><span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{v.vaccine_type}</span></td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          <div><strong className="text-foreground">{v.total_doses}</strong> dose{v.total_doses === 1 ? '' : 's'}</div>
                          <div>from day <strong className="text-foreground">{v.min_age_days}</strong>{v.interval_days ? ` · +${v.interval_days}d each` : ''}</div>
                          {v.target_age && <div className="mt-0.5 italic">{v.target_age}</div>}
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {v.dose_volume && <div>{v.dose_volume}</div>}
                          {v.route && <div>{v.route}</div>}
                        </td>
                        <td className="px-5 py-4">
                          {active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              <CheckCircle2 size={11} /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              <AlertCircle size={11} /> Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {v.latest_change ? (
                            <>
                              <div className="flex items-center gap-1"><History size={11} /> {v.latest_change.action.toLowerCase()}</div>
                              <div>{formatTimestamp(v.latest_change.changed_at)}</div>
                            </>
                          ) : (
                            <>
                              <div>Last updated</div>
                              <div>{formatTimestamp(v.updated_at)}</div>
                            </>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-5 py-4">
                            {/* Admin actions — stopPropagation so clicking a button doesn't
                                also toggle the row expansion. */}
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button variant="secondary" size="sm"
                                onClick={() => openEdit(v)}
                              >
                                <Pencil size={12} /> Edit
                              </Button>
                              <button
                                onClick={() => toggleActive(v, !active)}
                                disabled={togglingId === v.vaccine_id}
                                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                                  active ? 'border-rose-600 text-rose-700 hover:bg-rose-50' : 'border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                <Power size={12} /> {active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* NIP-USR011 — Inline Guidelines row. Rendered only when expanded
                          so the catalog stays scannable at a glance. */}
                      {isOpen && (
                        <tr className="bg-sky-50/40">
                          <td className="px-3 py-0 align-top"></td>
                          <td colSpan={colSpan - 1} className="px-5 py-4">
                            <GuidelinesPanel vaccine={v} isAdmin={isAdmin} onEdit={() => openEdit(v)} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

  const [statusFilter, setStatusFilter] = useState<string>('')
  const url = statusFilter
    ? `/api/vaccination/batch-requests?status=${statusFilter}`
    : '/api/vaccination/batch-requests'

  const { data, error, isLoading, readOnly, savedAt } = useVaccinationView<BatchPayload>(isReady && canView ? url : null)
  const [createOpen, setCreateOpen] = useState(false)
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

  const rows = data?.requests ?? []
  const canCreate = !readOnly && (data?.can_create ?? false)
  const canApprove = !readOnly && (data?.can_approve ?? false)

  function refresh() {
    revalidateVaccination(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Vaccine Batch Requests"
        subtitle={<>RHM requests vaccine batches for a target barangay. PHN reviews and approves — approval auto-adds the dose count to that barangay&rsquo;s inventory.</>}
        actions={<>
          {canCreate && (
            <Button
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={17} /> New request
            </Button>
          )}
        </>}
      />

      {/* Filter chips */}
      <fieldset disabled={readOnly}>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter:</span>
        {(['', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-primary text-white'
                : 'bg-white text-muted-foreground ring-1 ring-border hover:bg-muted'
            }`}
          >
            {s === '' ? 'All' : BATCH_STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

            </fieldset>
{/* List */}
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-white"><LogoLoader size="section" label="Loading requests…" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          size="page"
          icon={Package}
          title={statusFilter ? `No ${BATCH_STATUS_META[statusFilter]?.label.toLowerCase() ?? statusFilter.toLowerCase()} requests` : 'No batch requests yet'}
          description={canCreate ? 'Use “New request” to submit a batch request.' : 'Nothing to review right now.'}
          className="min-h-64 rounded-2xl border border-dashed border-sky-200 bg-white"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-semibold">#</th>
                  <th className="px-5 py-4 font-semibold">Vaccine · Batch</th>
                  <th className="px-5 py-4 font-semibold">Qty</th>
                  <th className="px-5 py-4 font-semibold">Target Barangay</th>
                  <th className="px-5 py-4 font-semibold">Requested</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const item = one(r.item)
                  const vaccine = one(r.vaccine)
                  const barangay = one(r.target_barangay)
                  const meta = BATCH_STATUS_META[r.status] ?? BATCH_STATUS_META.PENDING
                  const isPending = r.status === 'PENDING'
                  const vaccineName = item?.item_name ?? vaccine?.vaccine_type ?? '—'
                  return (
                    <tr key={r.stock_request_id} className="hover:bg-muted/40">
                      <td className="px-5 py-4 font-mono text-xs text-muted-foreground">#{r.stock_request_id}</td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-foreground">{vaccineName}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Hash size={10} /> {r.batch_number ?? '—'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-foreground">
                        <strong>{r.requested_quantity}</strong> <span className="text-xs text-muted-foreground">{item?.unit ?? 'dose(s)'}</span>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        <div className="flex items-center gap-1"><MapPin size={11} /> {barangay?.barangay_name ?? '—'}</div>
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1"><CalendarClock size={10} /> {formatYmd(r.request_date)}</div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={r.status} label={meta.label} icon={meta.icon} />
                      </td>
                      <td className="px-5 py-4">
                        {canApprove && isPending ? (
                          <Button variant="secondary" size="sm"
                            disabled={readOnly}
                            onClick={() => setDecisionTarget(r)}
                          >
                            Review
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm"
                            disabled={readOnly}
                            onClick={() => setDecisionTarget(r)}
                          >
                            View
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
