'use client'

// NIP-USR003 — Vaccination Records tab with real record flow.
// Replaces NIP-USR002's placeholder-only Records page.
//
// Changes vs USR002:
//   - "Add new record" button now opens the <RecordVaccinationModal />
//   - Status column + status filter (All / Pending / Approved / Rejected)
//   - Approve / Reject buttons for PHN + Admin on PENDING rows
//   - Shows recorder + approver names
//   - On every save/review, SWR revalidates so the list updates in place

import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import Link from 'next/link'
import { Search, Download, Plus, ArrowRight, Syringe, CheckCircle2, XCircle, Filter } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { useToast } from '@/components/ui/toast'
import { RecordVaccinationModal } from '@/components/vaccination/record-vaccination-modal'
import { drainQueue, listQueuedVaccinations } from '@/lib/vaccination-offline'

type ChildRef = {
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
type Row = {
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
  child: ChildRef | ChildRef[] | null
  vaccine: VaccineRef | VaccineRef[] | null
  recorder: RecorderRef | RecorderRef[] | null
  approver: UserRef | UserRef[] | null
}
type Payload = {
  rows: Row[]
  can_create: boolean
  can_review: boolean
  can_export: boolean
  role: UserRole
}

const STATUS_META = {
  PENDING: { label: 'Pending', chip: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', chip: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Rejected', chip: 'bg-rose-100 text-rose-800' },
} as const

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load records.')
  return d
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}
function fullName(c: ChildRef) { return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') }
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

export default function VaccinationRecordsPage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination', 'view') : false
  const { showToast } = useToast()

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [reviewing, setReviewing] = useState<{ row: Row; action: 'APPROVE' | 'REJECT' } | null>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [queueCount, setQueueCount] = useState(0)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (statusFilter) p.set('status', statusFilter)
    return p.toString()
  }, [q, statusFilter])

  const url = `/api/vaccination/records${qs ? `?${qs}` : ''}`
  const { data, error, isLoading } = useSWR<Payload>(canView ? url : null, fetcher)

  // Try to drain the offline queue when we're online + signed in
  useEffect(() => {
    if (!user?.id || typeof navigator === 'undefined') return
    async function refreshQueue() {
      if (!user?.id) return
      const q = await listQueuedVaccinations(user.id).catch(() => [])
      setQueueCount(q.length)
    }
    async function tryDrain() {
      if (!navigator.onLine || !user?.id) return
      const { sent } = await drainQueue(user.id)
      if (sent > 0) {
        showToast({ type: 'success', message: `Synced ${sent} offline draft${sent === 1 ? '' : 's'}.` })
        globalMutate((k) => typeof k === 'string' && k.startsWith('/api/vaccination/records'))
      }
      refreshQueue()
    }
    refreshQueue()
    tryDrain()
    const onOnline = () => { tryDrain() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [user?.id, showToast])

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view vaccination records.</div>

  const rows = data?.rows ?? []
  const canCreate = data?.can_create ?? false
  const canReview = data?.can_review ?? false
  const canExport = data?.can_export ?? false

  async function openReview(row: Row, action: 'APPROVE' | 'REJECT') {
    setReviewing({ row, action })
    setReviewRemarks('')
  }

  async function submitReview() {
    if (!reviewing) return
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
      globalMutate((k) => typeof k === 'string' && k.startsWith('/api/vaccination/records'))
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Review failed.' })
    } finally {
      setSubmittingReview(false)
    }
  }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Vaccination" role={role} />

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

      {/* Offline queue indicator */}
      {queueCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{queueCount}</strong> offline draft{queueCount === 1 ? '' : 's'} queued. They will sync automatically when you're online.
        </div>
      )}

      {/* Filters */}
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
            {statusFilter ? `No ${STATUS_META[statusFilter as keyof typeof STATUS_META]?.label.toLowerCase()} records.` : 'No vaccination records yet'}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {canCreate
              ? 'Click Add new record to log an administered dose. Records save as PENDING for PHN approval.'
              : 'Vaccination records in your scope will appear here once BHWs or RHMs start logging administered shots.'}
          </p>
          <Link href="/vaccination/schedule" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Go to Schedule tab <ArrowRight size={14} />
          </Link>
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
                  const meta = STATUS_META[row.status]
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
        onSaved={() => globalMutate((k) => typeof k === 'string' && k.startsWith('/api/vaccination/records'))}
        ownerId={user?.id ?? null}
      />

      {/* Review modal */}
      {reviewing && (
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