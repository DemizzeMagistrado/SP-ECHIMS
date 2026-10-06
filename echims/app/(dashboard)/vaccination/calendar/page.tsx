'use client'

// NIP-USR002 — Vaccination Calendar at /vaccination/calendar (v2)
// Replaces v1 (NIP-USR001). Visual language mirrors the PHN Health Activities
// "Activity requests" calendar (Today / ‹ › nav on the left, Month / Week / Day
// pill on the right, consistent card styling for entries).
//
// Backend contract is unchanged: GET /api/vaccination/calendar?from=&to= returns
// per-child VACCINATION schedules, RLS-scoped. Side panel still allows PHN/Admin
// to approve/reject PENDING / NEEDS_REVISION requests inline.

import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import Link from 'next/link'
import { X, CheckCircle2, XCircle } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { useToast } from '@/components/ui/toast'

type ChildRef = { child_id: number; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string }
type BarangayRef = { barangay_id: number; barangay_name: string }
type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'
type Schedule = {
  schedule_id: number
  status: Status
  schedule_date: string
  created_at: string
  remarks: string | null
  review_remarks: string | null
  child_id: number | null
  barangay_id: number | null
  child: ChildRef | ChildRef[] | null
  barangay: BarangayRef | BarangayRef[] | null
}
type Payload = { from: string; to: string; schedules: Schedule[]; can_review: boolean }

type CalendarView = 'MONTH' | 'WEEK' | 'DAY'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_META: Record<Status, { label: string; chip: string; card: string }> = {
  PENDING: { label: 'Pending', chip: 'bg-amber-100 text-amber-800', card: 'border-amber-200 bg-amber-50 text-amber-900' },
  APPROVED: { label: 'Approved', chip: 'bg-green-100 text-green-800', card: 'border-green-200 bg-green-50 text-green-900' },
  REJECTED: { label: 'Rejected', chip: 'bg-red-100 text-red-800', card: 'border-red-200 bg-red-50 text-red-900' },
  NEEDS_REVISION: { label: 'Needs revision', chip: 'bg-orange-100 text-orange-800', card: 'border-orange-200 bg-orange-50 text-orange-900' },
  ONGOING: { label: 'Ongoing', chip: 'bg-blue-100 text-blue-800', card: 'border-blue-200 bg-blue-50 text-blue-900' },
  COMPLETED: { label: 'Completed', chip: 'bg-slate-200 text-slate-800', card: 'border-slate-200 bg-slate-50 text-slate-900' },
  CANCELLED: { label: 'Cancelled', chip: 'bg-red-100 text-red-800', card: 'border-red-200 bg-red-50 text-red-900' },
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load the calendar.')
  return d
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fullName(c: ChildRef) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
}

function dateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d: Date) {
  return addDays(d, -d.getDay())
}

export default function VaccinationCalendarPage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccination', 'view') : false
  const { showToast } = useToast()

  const [view, setView] = useState<CalendarView>('MONTH')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selected, setSelected] = useState<Schedule | null>(null)
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | null>(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const todayKey = dateKey(new Date())

  // Fetch window matches the widest view that could be navigated to from here.
  // Simplest: fetch the surrounding ~3 months so navigation stays responsive.
  const windowRange = useMemo(() => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0)
    return { from: dateKey(start), to: dateKey(end) }
  }, [currentDate])

  const url = `/api/vaccination/calendar?from=${windowRange.from}&to=${windowRange.to}`
  const { data, error, isLoading } = useSWR<Payload>(canView ? url : null, fetcher)

  const bucket = useMemo(() => {
    const map: Record<string, Schedule[]> = {}
    for (const s of data?.schedules ?? []) {
      const k = s.schedule_date
      ;(map[k] ||= []).push(s)
    }
    return map
  }, [data])

  const visibleDates = useMemo(() => {
    if (view === 'MONTH') {
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      const gridStart = startOfWeek(monthStart)
      const cells = Math.ceil((monthStart.getDay() + monthEnd.getDate()) / 7) * 7
      return Array.from({ length: cells }, (_, i) => addDays(gridStart, i))
    }
    if (view === 'WEEK') {
      const ws = startOfWeek(currentDate)
      return Array.from({ length: 7 }, (_, i) => addDays(ws, i))
    }
    return [currentDate]
  }, [view, currentDate])

  const heading = useMemo(() => {
    if (view === 'MONTH') return currentDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    if (view === 'WEEK') {
      const ws = startOfWeek(currentDate)
      return `${ws.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${addDays(ws, 6).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }, [view, currentDate])

  function navigate(direction: number) {
    setCurrentDate((prev) => {
      if (view === 'MONTH') return new Date(prev.getFullYear(), prev.getMonth() + direction, 1)
      return addDays(prev, direction * (view === 'WEEK' ? 7 : 1))
    })
  }

  async function submitReview() {
    if (!selected || !reviewAction) return
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
          schedule_id: selected.schedule_id,
          action: reviewAction,
          review_remarks: reviewRemarks.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to submit the review.')
      showToast({ type: 'success', message: `Request ${reviewAction === 'APPROVE' ? 'approved' : 'rejected'}.` })
      setSelected(null); setReviewAction(null); setReviewRemarks('')
      mutate(url)
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Unable to submit the review.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view the vaccination calendar.</div>

  const canReview = data?.can_review ?? false

  function renderCell(d: Date) {
    const k = dateKey(d)
    const inMonth = view !== 'MONTH' || d.getMonth() === currentDate.getMonth()
    const isToday = k === todayKey
    const items = bucket[k] ?? []
    return (
      <div
        key={k}
        className={`min-h-[110px] border-b border-r border-border p-2 ${inMonth ? 'bg-white' : 'bg-slate-50'}`}
      >
        <div className={`mb-1 inline-flex items-center justify-center text-xs font-semibold ${
          isToday ? 'rounded-full bg-primary px-2 py-0.5 text-white' : inMonth ? 'text-foreground' : 'text-slate-400'
        }`}>
          {d.getDate()}
        </div>
        <div className="space-y-1">
          {items.slice(0, view === 'DAY' ? 50 : 3).map((s) => {
            const c = one(s.child)
            const meta = STATUS_META[s.status]
            return (
              <button
                key={s.schedule_id}
                type="button"
                onClick={() => { setSelected(s); setReviewAction(null); setReviewRemarks('') }}
                className={`w-full rounded-lg border p-1.5 text-left transition hover:shadow-sm ${meta.card}`}
              >
                <p className="truncate text-xs font-semibold">
                  {c ? fullName(c) : 'Vaccination'}
                </p>
                <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                  {meta.label}
                </span>
              </button>
            )
          })}
          {items.length > 3 && view !== 'DAY' && (
            <p className="text-[11px] font-medium text-muted-foreground">+{items.length - 3} more</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Vaccination" role={role} />

      <div>
        <h1 className="text-3xl font-bold text-foreground">Vaccination: Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {canReview
            ? 'Monthly, weekly, and daily view of per-child vaccination schedule requests. Click any entry to review.'
            : 'Monthly, weekly, and daily view of vaccination schedule requests in your scope.'}
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        {/* Header: nav controls + view switcher — mirrors PHN Activity requests calendar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`Previous ${view.toLowerCase()}`}
              onClick={() => navigate(-1)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-muted"
            >‹</button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-muted"
            >Today</button>
            <button
              type="button"
              aria-label={`Next ${view.toLowerCase()}`}
              onClick={() => navigate(1)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-muted"
            >›</button>
          </div>

          <h2 className="text-lg font-bold text-foreground">{heading}</h2>

          <div className="inline-flex rounded-full border border-border bg-white p-1 text-sm">
            {(['MONTH', 'WEEK', 'DAY'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-4 py-1.5 font-semibold transition ${
                  view === v ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v.charAt(0) + v.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {view === 'DAY' ? (
          <div className="p-4">
            <div className="rounded-xl border border-border bg-white">
              {renderCell(currentDate)}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 border-b border-border bg-muted/60 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {weekdays.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 border-l border-t border-border">
              {visibleDates.map((d) => renderCell(d))}
            </div>
          </>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ONGOING', 'COMPLETED'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`size-3 rounded ${STATUS_META[s].card.split(' ')[1]}`} />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>
      </section>

      {isLoading && <p className="text-sm text-muted-foreground">Loading schedules...</p>}
      {error && <p className="text-sm text-rose-600">{error.message}</p>}

      {/* Side panel modal */}
      {selected && (() => {
        const c = one(selected.child)
        const b = one(selected.barangay)
        const meta = STATUS_META[selected.status]
        const isPendingish = selected.status === 'PENDING' || selected.status === 'NEEDS_REVISION'
        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
            <div className="mx-auto mt-20 max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Vaccination request</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(selected.schedule_date + 'T00:00:00').toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => { setSelected(null); setReviewAction(null); setReviewRemarks('') }}
                  className="text-muted-foreground"
                  aria-label="Close"
                ><X size={20} /></button>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Child</span>
                  {c ? (
                    <Link href={`/child-profiling/children/${c.child_id}`} className="font-semibold text-primary hover:underline">
                      {fullName(c)}
                    </Link>
                  ) : <span>—</span>}
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Barangay</span>
                  <span className="font-medium text-foreground">{b?.barangay_name ?? '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>{meta.label}</span>
                </div>
                {selected.remarks && (
                  <div className="pt-2">
                    <p className="text-muted-foreground">Requester remarks</p>
                    <p className="mt-1 rounded-lg bg-muted/60 p-2 text-foreground">{selected.remarks}</p>
                  </div>
                )}
                {selected.review_remarks && (
                  <div className="pt-2">
                    <p className="text-muted-foreground">Review remarks</p>
                    <p className="mt-1 rounded-lg bg-muted/60 p-2 text-foreground">{selected.review_remarks}</p>
                  </div>
                )}
              </div>

              {canReview && isPendingish && (
                <div className="mt-6 border-t border-border pt-5">
                  {!reviewAction && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setReviewAction('APPROVE')}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      ><CheckCircle2 size={16} /> Approve</button>
                      <button
                        onClick={() => setReviewAction('REJECT')}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-rose-600 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                      ><XCircle size={16} /> Reject</button>
                    </div>
                  )}
                  {reviewAction && (
                    <div>
                      <label className="block text-sm font-medium text-foreground">
                        {reviewAction === 'REJECT' ? 'Reason for rejection (required)' : 'Review remarks (optional)'}
                        <textarea
                          value={reviewRemarks}
                          onChange={(e) => setReviewRemarks(e.target.value)}
                          rows={3}
                          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </label>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => { setReviewAction(null); setReviewRemarks('') }}
                          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground"
                        >Cancel</button>
                        <button
                          onClick={submitReview}
                          disabled={submitting}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                            reviewAction === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                          }`}
                        >
                          {submitting ? 'Submitting...' : reviewAction === 'APPROVE' ? 'Confirm approve' : 'Confirm reject'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}