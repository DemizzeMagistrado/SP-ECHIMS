'use client'
// NIP-USR001 — Vaccination Schedule section for the child profile page.
// Loads the computed schedule preview + the latest request status. BHW/RHM see a
// "Request Schedule" button when no PENDING request exists; everyone sees the preview.
// Status badges mirror the health_activity_schedule lifecycle (PENDING / APPROVED / REJECTED).
import { useId, useState, type KeyboardEvent } from 'react'
import { ImmunizationHistorySection } from '@/components/children/immunization-history-section'
import useSWR from 'swr'
import { Syringe, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { useToast } from '@/components/ui/toast'
type ScheduleEntry = {
  vaccine_code: string
  vaccine_type: string
  dose_number: number
  recommended_date: string
  route: string
  dose_volume: string
}
type LatestRequest = {
  schedule_id: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'
  created_at: string
  created_by: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_remarks: string | null
  schedule_date: string | null
  remarks: string | null
} | null
type SchedulePayload = {
  child: { child_id: number; name: string; date_of_birth: string }
  latest_request: LatestRequest
  preview: ScheduleEntry[]
  excluded_count: number
}
const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load the vaccination schedule.')
  return d
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function daysBetween(a: string, b: string) {
  const da = new Date(`${a}T00:00:00Z`)
  const db = new Date(`${b}T00:00:00Z`)
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}
function StatusBadge({ status }: { status: NonNullable<LatestRequest>['status'] }) {
  const map = {
    PENDING: { label: 'Pending review', icon: Clock, cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    APPROVED: { label: 'Approved', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    REJECTED: { label: 'Rejected', icon: XCircle, cls: 'bg-red-50 text-red-700 ring-red-200' },
    NEEDS_REVISION: { label: 'Needs revision', icon: AlertCircle, cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    ONGOING: { label: 'Ongoing', icon: Clock, cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    COMPLETED: { label: 'Completed', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    CANCELLED: { label: 'Cancelled', icon: XCircle, cls: 'bg-muted text-muted-foreground ring-border' },
  }[status]
  const Icon = map.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${map.cls}`}>
      <Icon size={14} />{map.label}
    </span>
  )
}
function VaccinationScheduleContent({ childId }: { childId: number }) {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const isApproved = user?.accountStatus === 'APPROVED'
  const canView = Boolean(role && isApproved && canPerform(role, 'Child Profiling', 'view'))
  // Only BHW/RHM can request (per the ticket spec); PHN/BNS/Admin see the preview + status only.
  const canRequest = isApproved && (role === 'Barangay Health Worker' || role === 'Rural Health Midwife')
  const { data, error, isLoading, mutate } = useSWR<SchedulePayload>(
    isReady && canView ? `/api/children/${childId}/vaccination-schedule` : null,
    fetcher,
  )
  const { showToast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [remarks, setRemarks] = useState('')
  // Proposed service date. Pre-fills to the nearest overdue dose (or today if all are
  // future) so the BHW/RHM doesn't have to type one from scratch.
  const [proposedDate, setProposedDate] = useState('')
  const [showForm, setShowForm] = useState(false)
  // Auto-pick a sensible default date when the preview loads and the form opens.
  function openForm() {
    const today = new Date().toISOString().slice(0, 10)
    const nextDose = data?.preview.find((e) => e.recommended_date >= today) ?? data?.preview[0]
    const defaultDate = nextDose?.recommended_date && nextDose.recommended_date >= today ? nextDose.recommended_date : today
    setProposedDate(defaultDate)
    setShowForm(true)
  }
  async function submitRequest() {
    if (!proposedDate) {
      showToast({ type: 'error', message: 'Please pick a target service date.' })
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/children/${childId}/vaccination-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: remarks.trim(), schedule_date: proposedDate }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Request failed (HTTP ${r.status}).`)
      showToast({ type: 'success', message: 'Schedule request submitted for review' })
      setShowForm(false)
      setRemarks('')
      setProposedDate('')
      mutate()
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Unable to submit the request.' })
    } finally {
      setSubmitting(false)
    }
  }
  if (!canView) return null
  // Loading state
  if (isLoading || !data) {
    if (error) {
      return (
        <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-primary"><Syringe size={18} />Vaccination Schedule</h2>
          <p className="mt-3 text-sm text-red-600">{error.message}</p>
        </section>
      )
    }
    return (
      <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-primary"><Syringe size={18} />Vaccination Schedule</h2>
        <p className="mt-3 text-sm text-muted-foreground">Loading schedule...</p>
      </section>
    )
  }
  const today = new Date().toISOString().slice(0, 10)
  const upcomingCount = data.preview.filter((e) => e.recommended_date >= today).length
  const overdueCount = data.preview.filter((e) => e.recommended_date < today).length
  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Syringe size={18} /></div>
          <div>
            <h2 className="text-lg font-semibold text-primary">Vaccination Schedule</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.preview.length} recommended dose{data.preview.length === 1 ? '' : 's'} remaining
              {data.excluded_count > 0 && ` · ${data.excluded_count} already administered`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data.latest_request && <StatusBadge status={data.latest_request.status} />}
        </div>
      </div>
      {/* Status summary bar */}
      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">Overdue</p>
          <p className="mt-0.5 text-xl font-bold text-amber-900">{overdueCount}</p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
          <p className="text-xs font-medium text-sky-800">Upcoming</p>
          <p className="mt-0.5 text-xl font-bold text-sky-900">{upcomingCount}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-800">Already given</p>
          <p className="mt-0.5 text-xl font-bold text-emerald-900">{data.excluded_count}</p>
        </div>
      </div>
      {/* Request form or button (BHW/RHM only; hidden when a PENDING request already exists) */}
      {canRequest && (!data.latest_request || data.latest_request.status !== 'PENDING') && (
        <div className="mb-4 rounded-xl border border-border bg-muted/40 p-4">
          {!showForm ? (
            <button
              type="button"
              onClick={openForm}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              <Syringe size={16} />Request Vaccination Schedule
            </button>
          ) : (
            <div className="space-y-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Proposed service date <span className="text-red-600">*</span></span>
                <input
                  type="date"
                  value={proposedDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setProposedDate(e.target.value)}
                  className="h-10 w-full max-w-[200px] rounded-lg border border-border px-3 text-sm"
                />
                <span className="text-xs text-muted-foreground">
                  Pre-filled to the next due dose. Once the PHN approves, this date appears on their vaccination calendar.
                </span>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Remarks (optional)</span>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add context for the reviewer (e.g. family is available this week, child has upcoming trip, etc.)"
                  className="min-h-20 rounded-lg border border-border p-3 text-sm"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setRemarks(''); setProposedDate('') }}
                  className="rounded-lg border border-border px-4 py-2 text-sm"
                >Cancel</button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={submitRequest}
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >{submitting ? 'Submitting...' : 'Submit for review'}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Pending-request banner with review remarks when rejected */}
      {data.latest_request && (data.latest_request.status === 'REJECTED' || data.latest_request.status === 'NEEDS_REVISION') && data.latest_request.review_remarks && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Reviewer remarks:</p>
          <p className="mt-1">{data.latest_request.review_remarks}</p>
        </div>
      )}
      {/* Schedule preview table */}
      {data.preview.length === 0 ? (
        <div className="rounded-xl bg-muted/50 p-6 text-center text-sm text-muted-foreground">
          All recommended NIP doses have been administered. 🎉
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/60">
              <tr>
                {['Vaccine', 'Dose', 'Recommended date', 'Status', 'Route', 'Dose volume'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.preview.map((entry) => {
                const diff = daysBetween(today, entry.recommended_date)
                const overdue = diff < 0
                const soon = diff >= 0 && diff <= 14
                return (
                  <tr key={`${entry.vaccine_code}-${entry.dose_number}`}>
                    <td className="px-4 py-3 text-sm font-medium">{entry.vaccine_type}</td>
                    <td className="px-4 py-3 text-sm">Dose {entry.dose_number}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(entry.recommended_date)}</td>
                    <td className="px-4 py-3 text-sm">
                      {overdue ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          <AlertCircle size={12} />{Math.abs(diff)} day{Math.abs(diff) === 1 ? '' : 's'} overdue
                        </span>
                      ) : soon ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          <Clock size={12} />Due in {diff} day{diff === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                          <Clock size={12} />In {diff} days
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{entry.route}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{entry.dose_volume}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const nipTabs = [
  { key: 'HISTORY', label: 'Immunization History' },
  { key: 'SCHEDULE', label: 'Vaccination Schedule' },
] as const

// The existing profile call now displays both NIP sections in one tabbed card.
export function VaccinationScheduleSection({ childId }: { childId: number }) {
  const [activeTab, setActiveTab] = useState<'HISTORY' | 'SCHEDULE'>('HISTORY')
  const tabId = useId()
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = Boolean(isReady && user?.accountStatus === 'APPROVED' && role && canPerform(role, 'Child Profiling', 'view'))

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % nipTabs.length
    else if (event.key === 'ArrowLeft') next = (index + nipTabs.length - 1) % nipTabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = nipTabs.length - 1
    else return
    event.preventDefault()
    setActiveTab(nipTabs[next].key)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  if (!canView) return null
  if (!Number.isSafeInteger(childId) || childId <= 0) {
    return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">A valid child record is required to view NIP records.</p>
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="border-b p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-primary"><Syringe size={18} />National Immunization Program</h2>
        <p className="mt-1 text-sm text-muted-foreground">Saved immunization records, dose status and vaccination schedule requests</p>
      </div>
      <div role="tablist" aria-label="NIP record sections" className="flex flex-wrap gap-2 border-b p-3 print:hidden">
        {nipTabs.map((tab, index) => <button
          key={tab.key}
          id={`${tabId}-tab-${tab.key}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          aria-controls={`${tabId}-panel-${tab.key}`}
          tabIndex={activeTab === tab.key ? 0 : -1}
          onClick={() => setActiveTab(tab.key)}
          onKeyDown={(event) => navigateTabs(event, index)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-primary text-white' : 'bg-muted/40 text-foreground hover:bg-muted'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}
        >{tab.label}</button>)}
      </div>
      {nipTabs.map((tab) => <div
        key={tab.key}
        id={`${tabId}-panel-${tab.key}`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-${tab.key}`}
        hidden={activeTab !== tab.key}
        tabIndex={0}
        className="[&>section]:rounded-none [&>section]:border-0 [&>section]:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary print:block"
      >
        {/* Keep both mounted to preserve history filters and request-form inputs. */}
        {tab.key === 'HISTORY'
          ? <ImmunizationHistorySection childId={childId} />
          : <VaccinationScheduleContent childId={childId} />}
      </div>)}
    </section>
  )
}
