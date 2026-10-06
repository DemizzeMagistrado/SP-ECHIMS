'use client'

// NIP-USR001 — Vaccination Calendar at /vaccination/calendar
// Monthly grid of per-child vaccination schedule requests, grouped by date.
// Shows PENDING + APPROVED + other statuses, color-coded. PHN/RHM/Admin can
// approve/reject PENDING requests inline via a side panel.
// Access scope is enforced by RLS on health_activity_schedule — the client just
// renders whatever /api/vaccination/calendar returns.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, CheckCircle2, XCircle } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { useToast } from '@/components/ui/toast'

type ChildRef = { child_id: number; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string }
type BarangayRef = { barangay_id: number; barangay_name: string }
type Schedule = {
  schedule_id: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'
  schedule_date: string
  created_at: string
  remarks: string | null
  review_remarks: string | null
  child_id: number | null
  barangay_id: number | null
  child: ChildRef | ChildRef[] | null
  barangay: BarangayRef | BarangayRef[] | null
}
type CalendarPayload = {
  from: string
  to: string
  schedules: Schedule[]
  can_review: boolean
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load the calendar.')
  return d
}

// Unwrap Supabase embed (always an array in some projects, single object in others).
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 0))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

function buildMonthGrid(year: number, month: number) {
  // Monthly grid starting Sunday. Each cell is yyyy-mm-dd.
  const first = new Date(Date.UTC(year, month, 1))
  const startDow = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: { date: string; inMonth: boolean }[] = []
  for (let i = 0; i < startDow; i++) {
    const d = new Date(Date.UTC(year, month, 1 - (startDow - i)))
    cells.push({ date: d.toISOString().slice(0, 10), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10)
    cells.push({ date, inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const i = cells.length - startDow - daysInMonth + 1
    const d = new Date(Date.UTC(year, month + 1, i))
    cells.push({ date: d.toISOString().slice(0, 10), inMonth: false })
  }
  return cells
}

const STATUS_COLOR: Record<Schedule['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  REJECTED: 'bg-red-100 text-red-800 border-red-300',
  NEEDS_REVISION: 'bg-amber-100 text-amber-800 border-amber-300',
  ONGOING: 'bg-sky-100 text-sky-800 border-sky-300',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CANCELLED: 'bg-gray-100 text-gray-600 border-gray-300',
}

export default function VaccinationCalendarPage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const isApproved = user?.accountStatus === 'APPROVED'
  const canView = Boolean(role && isApproved && canPerform(role, 'Vaccination', 'view'))

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState<Schedule | null>(null)

  const { from, end } = useMemo(() => {
    const r = monthRange(year, month)
    return { from: r.start, end: r.end }
  }, [year, month])

  const { data, error, isLoading, mutate } = useSWR<CalendarPayload>(
    canView ? `/api/vaccination/calendar?from=${from}&to=${end}` : null,
    fetcher,
  )

  const { showToast } = useToast()
  const [reviewing, setReviewing] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])
  const byDate = useMemo(() => {
    const m = new Map<string, Schedule[]>()
    for (const s of data?.schedules ?? []) {
      const list = m.get(s.schedule_date) ?? []
      list.push(s)
      m.set(s.schedule_date, list)
    }
    return m
  }, [data])

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })

  function prev() {
    const d = new Date(Date.UTC(year, month - 1, 1))
    setYear(d.getUTCFullYear()); setMonth(d.getUTCMonth())
  }
  function next() {
    const d = new Date(Date.UTC(year, month + 1, 1))
    setYear(d.getUTCFullYear()); setMonth(d.getUTCMonth())
  }
  function goToday() {
    const t = new Date()
    setYear(t.getFullYear()); setMonth(t.getMonth())
  }

  async function review(action: 'APPROVE' | 'REJECT', remarks?: string) {
    if (!selected) return
    setReviewing(true)
    try {
      const r = await fetch(`/api/vaccination/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_id: selected.schedule_id, action, review_remarks: remarks ?? null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Review failed (HTTP ${r.status}).`)
      showToast({ type: 'success', message: action === 'APPROVE' ? 'Request approved' : 'Request rejected' })
      setSelected(null)
      setShowReject(false)
      setRejectReason('')
      mutate()
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Unable to submit the review.' })
    } finally {
      setReviewing(false)
    }
  }

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view the vaccination calendar.</div>

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Vaccination" role={role} />

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Vaccination Calendar</h1>
          <p className="mt-1 text-muted-foreground">Scheduled vaccinations for children in your scope. Click any entry for details or to review.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prev} className="rounded-lg border border-border bg-white p-2 hover:bg-muted" aria-label="Previous month"><ChevronLeft size={18} /></button>
          <button onClick={goToday} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-muted">Today</button>
          <button onClick={next} className="rounded-lg border border-border bg-white p-2 hover:bg-muted" aria-label="Next month"><ChevronRight size={18} /></button>
          <span className="ml-2 text-lg font-semibold text-primary">{monthLabel}</span>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>}

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/60 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-3">{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-border">
          {grid.map((cell) => {
            const todayStr = new Date().toISOString().slice(0, 10)
            const isToday = cell.date === todayStr
            const entries = byDate.get(cell.date) ?? []
            return (
              <div
                key={cell.date}
                className={`min-h-[110px] p-2 ${cell.inMonth ? 'bg-white' : 'bg-muted/30 text-muted-foreground'}`}
              >
                <div className={`mb-1 text-xs font-semibold ${isToday ? 'inline-flex items-center justify-center rounded-full bg-primary px-2 text-white' : ''}`}>
                  {Number(cell.date.slice(8, 10))}
                </div>
                <div className="space-y-1">
                  {entries.map((s) => {
                    const child = one(s.child)
                    const name = child ? `${child.first_name} ${child.last_name}` : `Request #${s.schedule_id}`
                    return (
                      <button
                        key={s.schedule_id}
                        type="button"
                        onClick={() => setSelected(s)}
                        className={`block w-full truncate rounded border px-2 py-1 text-left text-xs ${STATUS_COLOR[s.status]} hover:brightness-95`}
                        title={`${name} — ${s.status}`}
                      >
                        <span className="font-semibold">{name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {isLoading && <p className="text-center text-sm text-muted-foreground">Loading schedules...</p>}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-amber-300" />Pending</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-300" />Approved / Completed</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-sky-300" />Ongoing</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-300" />Rejected</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-gray-300" />Cancelled</span>
      </div>

      {/* Detail / review panel */}
      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request #{selected.schedule_id}</p>
                <h2 className="mt-1 text-xl font-bold">{(() => { const c = one(selected.child); return c ? `${c.first_name} ${c.last_name}` : '—' })()}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Barangay: {one(selected.barangay)?.barangay_name ?? '—'}
                </p>
              </div>
              <button onClick={() => { setSelected(null); setShowReject(false); setRejectReason('') }} aria-label="Close"><X /></button>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_COLOR[selected.status]}`}>{selected.status}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Proposed date</dt>
                <dd className="font-medium">{new Date(`${selected.schedule_date}T00:00:00Z`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</dd>
              </div>
              {selected.remarks && (
                <div className="pt-2">
                  <dt className="text-muted-foreground">Request remarks</dt>
                  <dd className="mt-1 rounded-lg bg-muted/50 p-3">{selected.remarks}</dd>
                </div>
              )}
              {selected.review_remarks && (
                <div className="pt-2">
                  <dt className="text-muted-foreground">Review remarks</dt>
                  <dd className="mt-1 rounded-lg bg-muted/50 p-3">{selected.review_remarks}</dd>
                </div>
              )}
            </dl>

            {/* Review controls — only when the request is PENDING or NEEDS_REVISION and the user has review access */}
            {data?.can_review && (selected.status === 'PENDING' || selected.status === 'NEEDS_REVISION') && (
              <div className="mt-6 border-t border-border pt-5">
                {!showReject ? (
                  <div className="flex gap-2">
                    <button
                      disabled={reviewing}
                      onClick={() => review('APPROVE')}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    ><CheckCircle2 size={16} />Approve</button>
                    <button
                      disabled={reviewing}
                      onClick={() => setShowReject(true)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    ><XCircle size={16} />Reject</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Reason for rejection <span className="text-red-600">*</span></span>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Explain why the request is being rejected so the requester can revise or re-submit."
                        className="min-h-20 rounded-lg border border-border p-3 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowReject(false); setRejectReason('') }} className="rounded-lg border border-border px-4 py-2 text-sm">Back</button>
                      <button
                        type="button"
                        disabled={reviewing || !rejectReason.trim()}
                        onClick={() => review('REJECT', rejectReason.trim())}
                        className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >{reviewing ? 'Submitting...' : 'Confirm reject'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 border-t border-border pt-4 text-center">
              {one(selected.child) && (
                <Link
                  href={`/child-profiling/children/${one(selected.child)!.child_id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >Open full child profile →</Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'