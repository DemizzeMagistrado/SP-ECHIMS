'use client'

// Vaccination module — all sections merged into one page (one route).
// Sections: Records · Schedule · Defaulters · SMS Reminders · NIP Catalog · Batch Requests.
// Each section keeps its own permission check, data fetching and modals.
// Only the active section is mounted, so only its API calls fire.

import React, { Fragment, useEffect, useMemo, useState } from 'react'
import { mutate as globalMutate } from 'swr'
import { useVaccinationView } from '@/hooks/use-vaccination-view'
import { vaccinationKeyMatches } from '@/lib/vaccination-cache'
import { VaccinationOfflineTools, VaccinationSnapshotNotice } from '@/components/vaccination/vaccination-offline-tools'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Plus, Package, AlertCircle, Hash, MapPin, CalendarClock, CheckCircle2, Clock, XCircle,
  Pencil, Power, Syringe, Eye, History, ChevronDown, ChevronRight, BookOpen, Shield, Info,
  ExternalLink, Filter, UserPlus, ArrowRight, Users, Search, Download, Calendar as CalendarIcon,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { useToast } from '@/components/ui/toast'
import { NIP_CATALOG } from '@/lib/nip-schedule'
import { BatchRequestModal } from '@/components/vaccination/batch-request-modal'
import { BatchRequestDecisionModal, type BatchRequestRow } from '@/components/vaccination/batch-request-decision-modal'
import { RecordVaccinationModal } from '@/components/vaccination/record-vaccination-modal'
import { VaccineFormModal, type VaccineCatalogRow } from '@/components/vaccination/vaccine-form-modal'
import { VaccinationSmsPanel } from '@/components/vaccination/vaccination-sms-panel'

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
  PENDING: { label: 'Pending', chip: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', chip: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Rejected', chip: 'bg-rose-100 text-rose-800' },
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
  const { showToast } = useToast()

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
  const { data, error, isLoading, readOnly, savedAt } = useVaccinationView<RecordsPayload>(isReady && canView ? url : null)

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
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
      showToast({ type: 'error', message: 'A reason is required when rejecting a record.' })
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
      showToast({ type: 'success', message: `Record ${reviewing.action === 'APPROVE' ? 'approved' : 'rejected'}.` })
      setReviewing(null)
      setReviewRemarks('')
      revalidateVaccination('/api/vaccination/records')
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Review failed.' })
    } finally {
      setSubmittingReview(false)
    }
  }

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Vaccination: Records</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Administered vaccines awaiting PHN approval or already logged.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <Plus size={17} /> Add new record
          </button>
        )}
      </div>

      {/* Filters */}
      <fieldset disabled={readOnly}>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search records by child name..."
            className="w-full rounded-lg border border-border py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        {canExport && (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
            onClick={() => alert('Export shipping in a later ticket.')}
          >
            <Download size={16} /> Export CSV
          </button>
        )}
      </div>

            </fieldset>
{/* Table or empty state */}
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading records...</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-primary">
            <Syringe size={22} />
          </div>
          <h2 className="mt-4 font-semibold text-foreground">
            {statusFilter ? `No ${RECORD_STATUS_META[statusFilter as keyof typeof RECORD_STATUS_META]?.label.toLowerCase()} records.` : 'No vaccination records yet'}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {canCreate
              ? 'Click Add new record to log an administered dose. Records save as PENDING for PHN approval.'
              : 'Vaccination records in your scope will appear here once BHWs or RHMs start logging administered shots.'}
          </p>
          <button type="button" onClick={onGoToSchedule} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Go to Schedule tab <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-semibold">Child</th>
                  <th className="px-5 py-4 font-semibold">Vaccine</th>
                  <th className="px-5 py-4 font-semibold">Dose</th>
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Batch</th>
                  <th className="px-5 py-4 font-semibold">Recorded by</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const c = one(row.child)
                  const v = one(row.vaccine)
                  const r = one(row.recorder)
                  const meta = RECORD_STATUS_META[row.status]
                  return (
                    <tr key={row.vaccination_record_id} className="hover:bg-muted/40">
                      <td className="px-5 py-4">
                        {c ? (
                          <Link href={`/child-profiling/children/${c.child_id}`} className="font-semibold text-primary hover:underline">
                            {fullName(c)}
                          </Link>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-4 text-foreground font-medium">{vaccineLabel(v)}</td>
                      <td className="px-5 py-4 text-muted-foreground">Dose {row.dose_number}</td>
                      <td className="px-5 py-4 text-muted-foreground">{new Date(row.vaccination_date + 'T00:00:00').toLocaleDateString()}</td>
                      <td className="px-5 py-4 text-muted-foreground">{row.batch_number ?? '—'}</td>
                      <td className="px-5 py-4 text-muted-foreground">{recorderName(r)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {canReview && row.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => openReview(row, 'APPROVE')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                <CheckCircle2 size={14} /> Approve
                              </button>
                              <button
                                onClick={() => openReview(row, 'REJECT')}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </>
                          )}
                          {c && (
                            <Link
                              href={`/child-profiling/children/${c.child_id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                            >
                              View child <ArrowRight size={12} />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
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
              <textarea
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setReviewing(null); setReviewRemarks('') }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground"
              >Cancel</button>
              <button
                onClick={submitReview}
                disabled={submittingReview}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  reviewing.action === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submittingReview ? 'Submitting...' : reviewing.action === 'APPROVE' ? 'Confirm approve' : 'Confirm reject'}
              </button>
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

const SCHEDULE_STATUS_META: Record<ScheduleRow['status'], { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Pending', bg: 'bg-amber-100', fg: 'text-amber-700' },
  APPROVED: { label: 'Approved', bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  REJECTED: { label: 'Rejected', bg: 'bg-rose-100', fg: 'text-rose-700' },
  NEEDS_REVISION: { label: 'Needs revision', bg: 'bg-orange-100', fg: 'text-orange-700' },
  ONGOING: { label: 'Ongoing', bg: 'bg-sky-100', fg: 'text-sky-700' },
  COMPLETED: { label: 'Completed', bg: 'bg-teal-100', fg: 'text-teal-700' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-slate-200', fg: 'text-slate-700' },
}

function ScheduleSection() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination Schedule', 'view') : false
  const { showToast } = useToast()

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
  const { data, error, isLoading, readOnly, savedAt } = useVaccinationView<SchedulePayload>(isReady && canView ? url : null)

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
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
      showToast({ type: 'error', message: 'A reason is required when rejecting a request.' })
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
      showToast({ type: 'success', message: `Request ${reviewAction === 'APPROVE' ? 'approved' : 'rejected'}.` })
      setReviewing(null)
      setReviewAction(null)
      setReviewRemarks('')
      revalidateVaccination(url)
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Unable to submit the review.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <div>
        <h1 className="text-3xl font-bold text-foreground">Vaccination Schedule</h1>
        <p className="text-muted-foreground mt-1">
          {canReview
            ? 'Review and approve per-child vaccination schedule requests from BHWs and RHMs.'
            : 'Track the status of vaccination schedule requests you have submitted.'}
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Total shown</p>
          <p className="text-3xl font-bold text-foreground mt-2">{rows.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Approved</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{approvedCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <p className="text-sm text-muted-foreground">Rejected</p>
          <p className="text-3xl font-bold text-rose-600 mt-2">{rejectedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <fieldset disabled={readOnly}>

      <div className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by child name..."
            className="w-full rounded-lg border border-border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">All statuses</option>
            {Object.entries(SCHEDULE_STATUS_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <CalendarIcon size={16} className="text-muted-foreground" />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary max-w-[160px]"
            aria-label="From date"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary max-w-[160px]"
            aria-label="To date"
          />
        </div>
      </div>

            </fieldset>
{/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-semibold">Child</th>
                <th className="px-5 py-4 font-semibold">Barangay</th>
                <th className="px-5 py-4 font-semibold">Requested</th>
                <th className="px-5 py-4 font-semibold">Scheduled for</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">Loading schedule requests...</td></tr>
              )}
              {error && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-red-600">{error.message}</td></tr>
              )}
              {!isLoading && !error && rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No schedule requests match these filters.</td></tr>
              )}
              {rows.map((row) => {
                const c = one(row.child)
                const b = one(row.barangay)
                const meta = SCHEDULE_STATUS_META[row.status]
                return (
                  <tr key={row.schedule_id} className="hover:bg-muted/40">
                    <td className="px-5 py-4">
                      {c ? (
                        <Link href={`/child-profiling/children/${c.child_id}`} className="font-semibold text-primary hover:underline">
                          {fullName(c)}
                        </Link>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{b?.barangay_name ?? '—'}</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-foreground font-medium">
                      {new Date(row.schedule_date + 'T00:00:00').toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${meta.bg} ${meta.fg}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {canReview && (row.status === 'PENDING' || row.status === 'NEEDS_REVISION') && (
                          <>
                            <button
                              onClick={() => openReview(row, 'APPROVE')}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <CheckCircle2 size={14} /> Approve
                            </button>
                            <button
                              onClick={() => openReview(row, 'REJECT')}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </>
                        )}
                        {c && (
                          <Link
                            href={`/child-profiling/children/${c.child_id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            View child <ArrowRight size={12} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review modal */}
      {reviewing && reviewAction && !readOnly && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
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
              <textarea
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                rows={3}
                placeholder={reviewAction === 'REJECT' ? 'Explain why this request is being rejected...' : 'Any notes for the requester...'}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setReviewing(null); setReviewAction(null); setReviewRemarks('') }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground"
              >Cancel</button>
              <button
                onClick={submitReview}
                disabled={submitting}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  reviewAction === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submitting ? 'Submitting...' : reviewAction === 'APPROVE' ? 'Confirm approve' : 'Confirm reject'}
              </button>
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [expandAll, setExpandAll] = useState<boolean>(false)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (statusFilter) p.set('status', statusFilter)
    if (vaccineFilter) p.set('vaccine', vaccineFilter)
    return p.toString()
  }, [statusFilter, vaccineFilter])

  const url = `/api/vaccination/defaulters${qs ? `?${qs}` : ''}`
  const { data, error, isLoading, readOnly, savedAt } = useVaccinationView<DefaultersPayload>(isReady && canView ? url : null)

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

  function toggleRow(childId: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(childId)) next.delete(childId); else next.add(childId)
      return next
    })
  }

  function toggleAll() {
    if (expandAll) {
      setExpanded(new Set())
      setExpandAll(false)
    } else {
      setExpanded(new Set(groups.map((g) => g.child_id)))
      setExpandAll(true)
    }
  }

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view the defaulters list.</div>

  const counts = data?.counts

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">Vaccination: Defaulters</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Children with vaccinations past their due date. Click a row to see which doses are missed.
          {data && (
            <> Grace period is <strong>{data.grace_period_days} days</strong> — doses past that are flagged as OVERDUE.</>
          )}
        </p>
      </div>

      {/* Summary tiles */}
      {counts && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile icon={<AlertCircle size={16} />} label="Overdue doses" value={counts.overdue} tone="rose" />
          <SummaryTile icon={<Clock size={16} />} label="Due doses" value={counts.due} tone="amber" />
          <SummaryTile icon={<Users size={16} />} label="Children affected" value={counts.unique_children_affected} tone="sky" />
          <SummaryTile icon={<Syringe size={16} />} label="Children in scope" value={counts.total_children_in_scope} tone="slate" />
        </div>
      )}

      {/* Filters */}
      <fieldset disabled={readOnly}>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <Filter size={14} className="text-muted-foreground" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | 'OVERDUE' | 'DUE')}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All (DUE + OVERDUE)</option>
          <option value="OVERDUE">Overdue only</option>
          <option value="DUE">Due only</option>
        </select>
        <select
          value={vaccineFilter}
          onChange={(e) => setVaccineFilter(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All vaccines</option>
          {NIP_CATALOG.map((v) => (
            <option key={v.code} value={v.code}>{v.vaccine_type}</option>
          ))}
        </select>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            {expandAll ? 'Collapse all' : 'Expand all'}
          </button>
        )}
        {counts && counts.total_matched > counts.total_shown && (
          <span className="ml-auto text-xs text-muted-foreground">
            Showing {counts.total_shown} of {counts.total_matched} doses — narrow filters to see more.
          </span>
        )}
      </div>

            </fieldset>
{/* Table or empty state */}
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading defaulters…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : groups.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <UserPlus size={22} />
          </div>
          <h2 className="mt-4 font-semibold text-foreground">No defaulters in your scope</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Every child is up to date on their vaccinations for the current filters. Nice work!
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-4"></th>
                  <th className="px-5 py-4 font-semibold">Child</th>
                  <th className="px-5 py-4 font-semibold">Barangay</th>
                  <th className="px-5 py-4 font-semibold">Missed doses</th>
                  <th className="px-5 py-4 font-semibold">Worst overdue</th>
                  <th className="px-5 py-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups.map((g) => {
                  const isOpen = expanded.has(g.child_id)
                  return (
                    <Fragment key={g.child_id}>
                      {/* Parent row — one per child */}
                      <tr
                        className="cursor-pointer transition-colors hover:bg-muted/40"
                        onClick={() => toggleRow(g.child_id)}
                      >
                        <td className="px-3 py-4 align-middle">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleRow(g.child_id) }}
                            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground"
                            aria-label={isOpen ? 'Collapse' : 'Expand'}
                          >
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <Link
                            href={`/child-profiling/children/${g.child_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-primary hover:underline"
                          >
                            {g.child_name}
                          </Link>
                          <div className="text-xs text-muted-foreground">DOB {formatYmd(g.date_of_birth)}</div>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{g.barangay_name ?? '—'}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {g.overdue_count > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
                                <AlertCircle size={11} /> {g.overdue_count} overdue
                              </span>
                            )}
                            {g.due_count > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                <Clock size={11} /> {g.due_count} due
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`font-semibold ${g.worst_days_overdue > 60 ? 'text-rose-700' : g.worst_days_overdue > 30 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                            {g.worst_days_overdue} {g.worst_days_overdue === 1 ? 'day' : 'days'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <Link
                            href={`/child-profiling/children/${g.child_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                          >
                            View child <ArrowRight size={12} />
                          </Link>
                        </td>
                      </tr>

                      {/* Expanded detail — per-dose rows under this child */}
                      {isOpen && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="overflow-hidden rounded-xl border border-border bg-white">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  <tr>
                                    <th className="px-4 py-2 font-semibold">Vaccine</th>
                                    <th className="px-4 py-2 font-semibold">Dose</th>
                                    <th className="px-4 py-2 font-semibold">Due date</th>
                                    <th className="px-4 py-2 font-semibold">Days past due</th>
                                    <th className="px-4 py-2 font-semibold">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {g.doses.map((d, idx) => (
                                    <tr key={`${g.child_id}-${d.vaccine_code}-${d.dose_number}-${idx}`}>
                                      <td className="px-4 py-2 font-medium text-foreground">{d.vaccine_type}</td>
                                      <td className="px-4 py-2 text-muted-foreground">Dose {d.dose_number}</td>
                                      <td className="px-4 py-2 text-muted-foreground">{formatYmd(d.due_date)}</td>
                                      <td className="px-4 py-2">
                                        <span className={`font-semibold ${d.days_overdue > 60 ? 'text-rose-700' : d.days_overdue > 30 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                                          {d.days_overdue} {d.days_overdue === 1 ? 'day' : 'days'}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                          d.status === 'OVERDUE' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                          {d.status === 'OVERDUE' ? <AlertCircle size={10} /> : <Clock size={10} />}
                                          {d.status === 'OVERDUE' ? 'Overdue' : 'Due'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryTile({ icon, label, value, tone }: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'rose' | 'amber' | 'sky' | 'slate'
}) {
  const colors = {
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    sky: 'bg-sky-50 text-sky-700 ring-sky-100',
    slate: 'bg-slate-50 text-slate-700 ring-slate-200',
  }[tone]
  return (
    <div className={`rounded-xl p-4 ring-1 ${colors}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
        {icon} {label}
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}
/* ═════════════════════════ SMS Reminders ═════════════════════════ */

function SmsSection() {
  const { online } = useVaccinationView<unknown>(null)
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  if (!isReady) return <p className="text-sm text-muted-foreground">Checking session…</p>
  if (!role || !canPerform(role, 'Vaccination', 'view'))
    return <p role="alert">You cannot view vaccination reminders.</p>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vaccination SMS Reminders</h1>
        <p className="mt-1 text-muted-foreground">Guardian messages and presentation simulation history</p>
      </div>
      {online ? <VaccinationSmsPanel /> : <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">SMS sending and simulation require an online session. SMS history caching is not connected in this patch.</p>}
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
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  // Admin edits; PHN reads. Everyone else is 403.
  const administrator = role === 'Administrator'
  const canView = role ? canPerform(role, 'NIP Catalog', 'view') : false
  const { showToast } = useToast()

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
    const confirmMsg = nextActive
      ? `Reactivate ${v.vaccine_type}? It will reappear in schedule computation and the Record modal.`
      : `Deactivate ${v.vaccine_type}? It will stop appearing in the Record modal and will be excluded from new schedule computation.`
    if (!window.confirm(confirmMsg)) return
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
      showToast({ type: 'success', message: `${v.vaccine_type} ${nextActive ? 'reactivated' : 'deactivated'}.` })
      revalidateVaccination('/api/vaccines/catalog')
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Toggle failed.' })
    } finally {
      setTogglingId(null)
    }
  }

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
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
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">NIP Vaccine Catalog</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Maintain the DOH immunization catalog and schedule rules. Every change is logged.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <Plus size={17} /> Add new vaccine
          </button>
        )}
      </div>

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
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading catalog…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-primary">
            <Syringe size={22} />
          </div>
          <h2 className="mt-4 font-semibold text-foreground">No vaccines in the catalog yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Click Add new vaccine to seed your first DOH entry.</p>
        </div>
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
                              <button
                                onClick={() => openEdit(v)}
                                className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                              >
                                <Pencil size={12} /> Edit
                              </button>
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

const BATCH_STATUS_META: Record<string, { label: string; chip: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', chip: 'bg-amber-100 text-amber-800', icon: <Clock size={11} /> },
  APPROVED: { label: 'Approved', chip: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 size={11} /> },
  REJECTED: { label: 'Rejected', chip: 'bg-rose-100 text-rose-800', icon: <XCircle size={11} /> },
  COMPLETED: { label: 'Completed', chip: 'bg-sky-100 text-sky-800', icon: <CheckCircle2 size={11} /> },
  CANCELLED: { label: 'Cancelled', chip: 'bg-slate-200 text-slate-700', icon: <XCircle size={11} /> },
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
    return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading…</div>
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
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Vaccine Batch Requests</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            RHM requests vaccine batches for a target barangay. PHN reviews and approves — approval auto-adds the dose count to that barangay&rsquo;s inventory.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <Plus size={17} /> New request
          </button>
        )}
      </div>

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
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading requests…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-primary">
            <Package size={22} />
          </div>
          <h2 className="mt-4 font-semibold text-foreground">
            {statusFilter ? `No ${BATCH_STATUS_META[statusFilter]?.label.toLowerCase() ?? statusFilter.toLowerCase()} requests` : 'No batch requests yet'}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {canCreate ? 'Click New request to submit a batch request.' : 'Nothing to review right now.'}
          </p>
        </div>
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
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {canApprove && isPending ? (
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => setDecisionTarget(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                          >
                            Review
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => setDecisionTarget(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                          >
                            View
                          </button>
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
    return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading…</div>
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
      <div role="tablist" aria-label="Vaccination sections" className="relative flex flex-wrap gap-1 border-b border-[#E5E7EB] pr-24">
        {visible.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              active === t.id
                ? 'border-[#0077B6] text-[#0077B6]'
                : 'border-transparent text-[#6B7280] hover:text-[#03045E]'
            }`}
          >
            {t.label}
          </button>
        ))}
        <VaccinationOfflineTools />
      </div>

      {active === 'records' && <RecordsSection key={user?.id} onGoToSchedule={() => setTab('schedule')} />}
      {active === 'schedule' && <ScheduleSection key={user?.id} />}
      {active === 'defaulters' && <DefaultersSection key={user?.id} />}
      {active === 'sms' && <SmsSection key={user?.id} />}
      {active === 'catalog' && <CatalogSection key={user?.id} />}
      {active === 'batch' && <BatchRequestsSection key={user?.id} />}
    </div>
  )
}
