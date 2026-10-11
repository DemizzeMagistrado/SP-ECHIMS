'use client'

// NIP-USR009 — Previous vaccinations preview panel.
// Compact, read-only summary of a child's immunization history, meant to live
// INSIDE the Record Vaccination modal right after the child is picked.
//
// Shows (mirroring the nutrition-modal pattern Suzie referenced):
//   • Header with total COMPLETE dose count
//   • Last 3 given doses (vaccine · dose # · date), with a "Prior" chip when
//     the dose was back-filled (NIP-USR008)
//   • "Completed" chip grid: ✓ BCG · HEPB-1 · PENTA-1,2,3 … so the recorder
//     sees what's already in the system at a glance
//   • "Next due" callout — overdue days or "due today" — so the recorder can
//     confirm the dose they're about to administer actually matches
//   • "Review full history →" link to the child profile
//
// Uses the existing /api/vaccination/history endpoint — no new API needed.
// Prevents the "I just recorded the same dose twice" footgun.

import useSWR from 'swr'
import Link from 'next/link'
import { CheckCircle2, History, CalendarClock, AlertCircle, ArrowRight, Syringe } from 'lucide-react'

type DoseStatus = 'COMPLETE' | 'DUE' | 'OVERDUE' | 'UPCOMING'

type DoseRow = {
  dose_number: number
  status: DoseStatus
  due_date: string
  given_date: string | null
  batch_number: string | null
  vaccination_site: string | null
  vaccination_record_id: number | null
  is_prior?: boolean
  prior_source?: string | null
}

type VaccineStatus = {
  code: string
  vaccine_type: string
  route: string
  dose_volume: string
  total_doses: number
  doses: DoseRow[]
}

type HistoryPayload = {
  child: { child_id: number; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string }
  vaccine_status: VaccineStatus[]
  next_due: ({ vaccine_code: string; vaccine_type: string } & DoseRow) | null
  counts: { complete: number; due: number; overdue: number; upcoming: number }
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load history.')
  return d
}

function formatDate(ymd: string | null): string {
  if (!ymd) return '—'
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysBetween(from: string, to: string): number {
  return Math.floor(
    (new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000,
  )
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function VaccinationHistoryPreview({ childId }: { childId: number }) {
  const { data, error, isLoading } = useSWR<HistoryPayload>(
    childId ? `/api/vaccination/history?child_id=${childId}` : null,
    fetcher,
    { revalidateOnFocus: false }, // modal is short-lived; no need to refetch on focus
  )

  if (!childId) return null

  // Shell state: loading / error
  if (isLoading) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
        Loading vaccination history…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <span>Could not load history ({error.message}). You can still record this dose.</span>
      </div>
    )
  }
  if (!data) return null

  // Derive the three visual sections from the payload.
  const allDoses = data.vaccine_status.flatMap((v) =>
    v.doses.map((d) => ({ vaccine_code: v.code, vaccine_type: v.vaccine_type, ...d })),
  )
  const givenDoses = allDoses
    .filter((d) => d.status === 'COMPLETE' && d.given_date)
    .sort((a, b) => (b.given_date ?? '').localeCompare(a.given_date ?? ''))
  const lastThree = givenDoses.slice(0, 3)

  // Chip grid: compact completed label per vaccine with all completed dose numbers.
  const completedByVaccine = data.vaccine_status
    .map((v) => {
      const completed = v.doses.filter((d) => d.status === 'COMPLETE').map((d) => d.dose_number)
      return completed.length > 0 ? { code: v.code, vaccine_type: v.vaccine_type, doses: completed } : null
    })
    .filter((v): v is { code: string; vaccine_type: string; doses: number[] } => v !== null)

  const nextDue = data.next_due
  const today = todayYMD()
  let nextDueLabel = ''
  let nextDueTone = 'amber'
  if (nextDue) {
    const diff = daysBetween(nextDue.due_date, today)
    if (diff < 0) nextDueLabel = `due in ${-diff} day${-diff === 1 ? '' : 's'}`
    else if (diff === 0) nextDueLabel = 'due today'
    else nextDueLabel = `overdue by ${diff} day${diff === 1 ? '' : 's'}`
    if (diff > 0) nextDueTone = 'rose'
  }

  const empty = data.counts.complete === 0 && !nextDue

  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Syringe size={14} className="text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Vaccination basis · {data.counts.complete} completed dose{data.counts.complete === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href={`/child-profiling/children/${childId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Full history <ArrowRight size={11} />
        </Link>
      </div>

      {/* Empty state: child has no vaccinations yet */}
      {empty && (
        <p className="text-sm text-muted-foreground">
          No vaccinations recorded yet. This will be this child&rsquo;s first.
        </p>
      )}

      {/* Last 3 doses */}
      {lastThree.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-foreground">Last {lastThree.length} dose{lastThree.length === 1 ? '' : 's'} given:</p>
          <ul className="space-y-0.5 text-sm text-foreground">
            {lastThree.map((d) => (
              <li key={`${d.vaccine_code}-${d.dose_number}`} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <strong>{d.vaccine_type}</strong> (Dose {d.dose_number})
                  {d.is_prior && (
                    <span
                      className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800"
                      title={d.prior_source ? `Source: ${d.prior_source}` : 'Back-filled past record'}
                    >
                      <History size={8} /> Prior
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(d.given_date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Completed chip grid */}
      {completedByVaccine.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-foreground">Completed:</p>
          <div className="flex flex-wrap gap-1.5">
            {completedByVaccine.map((v) => (
              <span
                key={v.code}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
              >
                <CheckCircle2 size={10} />
                {v.vaccine_type}
                {v.doses.length > 1 && <span className="font-normal opacity-80">({v.doses.join(',')})</span>}
                {v.doses.length === 1 && <span className="font-normal opacity-80">({v.doses[0]})</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Next due callout */}
      {nextDue && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
            nextDueTone === 'rose'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <CalendarClock size={13} className="mt-0.5 shrink-0" />
          <span>
            <strong>Next due:</strong> {nextDue.vaccine_type} Dose {nextDue.dose_number} — {nextDueLabel}
          </span>
        </div>
      )}
    </div>
  )
}