'use client'

// NIP-USR002 — Vaccination Schedule tab at /vaccination/schedule
// Lists per-child vaccination schedule requests with filters, inline approve/reject,
// and status pills. Scope is enforced by RLS on health_activity_schedule — PHN sees
// their RHU, BHW/RHM see their barangay, Admin sees all. Approve/reject is gated on
// role: only Admin + PHN have 'approve' on Vaccination Schedule per the role matrix.

import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import Link from 'next/link'
import { Search, CheckCircle2, XCircle, ArrowRight, Filter, Calendar as CalendarIcon } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { useToast } from '@/components/ui/toast'

// Note: useToast() exposes `showToast({ type, message })`, not a `toast()` function.

type ChildRef = { child_id: number; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string }
type BarangayRef = { barangay_id: number; barangay_name: string }
type Row = {
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
  child: ChildRef | ChildRef[] | null
  barangay: BarangayRef | BarangayRef[] | null
}
type Payload = {
  rows: Row[]
  can_review: boolean
  role: UserRole
}

const STATUS_META: Record<Row['status'], { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Pending', bg: 'bg-amber-100', fg: 'text-amber-700' },
  APPROVED: { label: 'Approved', bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  REJECTED: { label: 'Rejected', bg: 'bg-rose-100', fg: 'text-rose-700' },
  NEEDS_REVISION: { label: 'Needs revision', bg: 'bg-orange-100', fg: 'text-orange-700' },
  ONGOING: { label: 'Ongoing', bg: 'bg-sky-100', fg: 'text-sky-700' },
  COMPLETED: { label: 'Completed', bg: 'bg-teal-100', fg: 'text-teal-700' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-slate-200', fg: 'text-slate-700' },
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load the schedule.')
  return d
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fullName(c: ChildRef) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
}

export default function VaccinationSchedulePage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination Schedule', 'view') : false
  const { showToast } = useToast()

  const [status, setStatus] = useState<string>('PENDING')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reviewing, setReviewing] = useState<Row | null>(null)
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
  const { data, error, isLoading } = useSWR<Payload>(canView ? url : null, fetcher)

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view the vaccination schedule.</div>

  const rows = data?.rows ?? []
  const canReview = data?.can_review ?? false
  const pendingCount = rows.filter((r) => r.status === 'PENDING').length
  const approvedCount = rows.filter((r) => r.status === 'APPROVED').length
  const rejectedCount = rows.filter((r) => r.status === 'REJECTED').length

  async function openReview(row: Row, action: 'APPROVE' | 'REJECT') {
    setReviewing(row)
    setReviewAction(action)
    setReviewRemarks('')
  }

  async function submitReview() {
    if (!reviewing || !reviewAction) return
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
      mutate(url)
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Unable to submit the review.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Vaccination" role={role} />

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
            {Object.entries(STATUS_META).map(([key, meta]) => (
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
                const meta = STATUS_META[row.status]
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
      {reviewing && reviewAction && (
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