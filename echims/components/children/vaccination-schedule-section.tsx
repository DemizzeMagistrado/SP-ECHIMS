'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
// NIP-USR001 — Vaccination Schedule section for the child profile page.
// Loads the computed schedule preview + the latest request status. BHW/RHM see a
// "Request Schedule" button when no PENDING request exists; everyone sees the preview.
// Status badges mirror the health_activity_schedule lifecycle (PENDING / APPROVED / NEEDS_REVISION).
// Schedules are never rejected (NIP-REV01); a reviewer asks for a new date instead.
import { useId, useState } from 'react'
import { ImmunizationHistorySection } from '@/components/children/immunization-history-section'
import useSWR from 'swr'
import { Syringe, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { toast } from '@/components/ui/toast'
import { Spinner } from '@/components/brand/logo-loader'
import { TabBar } from '@/components/ui/module-tabs'
import { TabPanel } from '@/components/brand/page-gate'
import { Button } from '@/components/ui/button'
import { DateInput, Textarea } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
type ScheduleEntry = {
  vaccine_code: string
  vaccine_type: string
  dose_number: number
  recommended_date: string
  route: string
  dose_volume: string
  /** Missed (or pushed back): the next valid date. */
  rescheduled_date?: string
  /** Past the vaccine's age limit (e.g. BCG after the first birthday). */
  not_eligible?: boolean
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
  // If the server returns HTML (404/500 page), treat it as "no schedule yet"
  // instead of throwing a JSON parse error.
  const contentType = r.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return { child: { child_id: 0, name: '', date_of_birth: '' }, latest_request: null, preview: [], excluded_count: 0 }
  }
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
  const [submitting, setSubmitting] = useState(false)
  const [remarks, setRemarks] = useState('')
  // Proposed service date. Pre-fills to the nearest missed dose (or today if all are
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
      toast.error('Please pick a target service date.')
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
      toast.success('Schedule request submitted for review')
      setShowForm(false)
      setRemarks('')
      setProposedDate('')
      mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit the request.')
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
        <Spinner showLabel label="Loading schedule…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
      </section>
    )
  }
  const today = new Date().toISOString().slice(0, 10)
  const pendingCount = data.preview.filter((e) => !e.not_eligible && e.recommended_date >= today).length
  const missed = data.preview.filter((e) => !e.not_eligible && e.recommended_date < today)
  // Longest-missed dose: earliest recommended date among the missed ones.
  const longest = missed.reduce<typeof missed[number] | null>((a, e) => (!a || e.recommended_date < a.recommended_date ? e : a), null)
  const longestDays = longest ? daysBetween(longest.recommended_date, today) : 0
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
          {data.latest_request && <StatusBadge status={data.latest_request.status} label={data.latest_request.status === 'PENDING' ? 'Pending review' : undefined} dot />}
        </div>
      </div>
      {/* Summary: missed doses first (with the longest-missed dose), then counts. */}
      <div className={`mb-4 rounded-xl border p-4 ${missed.length ? 'border-danger/20 bg-danger-soft' : 'border-good/20 bg-good-soft'}`}>
        <p className={`flex flex-wrap items-center gap-2 text-sm font-semibold ${missed.length ? 'text-danger' : 'text-good'}`}>
          {missed.length ? <AlertCircle size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
          {missed.length
            ? `${missed.length} missed dose${missed.length === 1 ? '' : 's'}${longest ? ` · longest: ${longest.vaccine_type} ${longest.dose_number}, ${longestDays} day${longestDays === 1 ? '' : 's'}` : ''}`
            : 'No missed doses'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge status="missed" tone={missed.length ? 'danger' : 'neutral'} label={`${missed.length} missed`} />
          <StatusBadge status="pending" tone="info" label={`${pendingCount} pending`} />
          <StatusBadge status="given" tone="good" label={`${data.excluded_count} already given`} />
        </div>
        {missed.length > 0 && <p className="mt-2 text-xs text-brand-muted">Schedule the missed doses at the next vaccination session. Doses are listed below by recommended date.</p>}
      </div>
      {/* Request form or button (BHW/RHM only; hidden when a PENDING request already exists) */}
      {canRequest && (!data.latest_request || data.latest_request.status !== 'PENDING') && (
        <div className="mb-4 rounded-xl border border-border bg-muted/40 p-4">
          {!showForm ? (
            <Button
              onClick={openForm}
            >
              <Syringe size={16} />Request Vaccination Schedule
            </Button>
          ) : (
            <div className="space-y-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Proposed service date <span className="text-red-600">*</span></span>
                <DateInput
                  value={proposedDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setProposedDate(e.target.value)}
                  className="h-10 max-w-[200px]"
                />
                <span className="text-xs text-muted-foreground">
                  Pre-filled to the next due dose. Once the PHN approves, this date appears on their vaccination calendar.
                </span>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Remarks (optional)</span>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add context for the reviewer (e.g. family is available this week, child has upcoming trip, etc.)"
                  className="min-h-20"
                />
              </label>
              <div className="flex gap-2">
                <Button variant="secondary"
                  onClick={() => { setShowForm(false); setRemarks(''); setProposedDate('') }}
                 
                >Cancel</Button>
                <Button
                  loading={submitting}
                  onClick={submitRequest}
                >{submitting ? 'Submitting…' : 'Submit for review'}</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Review remarks when the reviewer asked for a new date (old rows may be REJECTED) */}
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
                      {entry.not_eligible ? (
                        <StatusBadge status="not-eligible" tone="neutral" label="Not eligible (past age limit)" />
                      ) : overdue ? (
                        <StatusBadge status="missed" tone="danger" icon={<AlertCircle size={12} aria-hidden="true" />} label={entry.rescheduled_date ? `Missed · rescheduled to ${formatDate(entry.rescheduled_date)}` : 'Missed'} />
                      ) : entry.rescheduled_date ? (
                        <StatusBadge status="pending" tone="info" icon={<Clock size={12} aria-hidden="true" />} label={`Pending · moved to ${formatDate(entry.rescheduled_date)}`} />
                      ) : soon ? (
                        <StatusBadge status="pending" tone="warn" icon={<Clock size={12} aria-hidden="true" />} label={diff === 0 ? 'Pending · due today' : `Pending · due in ${diff} day${diff === 1 ? '' : 's'}`} />
                      ) : (
                        <StatusBadge status="pending" tone="info" icon={<Clock size={12} aria-hidden="true" />} label={`Pending · in ${diff} days`} />
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
      <TabBar
        className="border-b p-3 print:hidden"
        label="NIP record sections"
        group="nip-records"
        idBase={tabId}
        value={activeTab}
        onChange={setActiveTab}
        items={nipTabs.map((tab) => ({ value: tab.key, label: tab.label }))}
      />
      <TabPanel tabKey={activeTab}>
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
      </TabPanel>
    </section>
  )
}
