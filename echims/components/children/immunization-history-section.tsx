'use client'
// NIP-USR004 — Immunization history section (replaces the inline Vaccination History
// SectionCard on the child profile page). Shows:
//   - "Next due" callout (overdue first, then due)
//   - Summary counts
//   - Vaccine filter dropdown
//   - Table with every dose + status badge (COMPLETE / DUE / OVERDUE / UPCOMING)
//   - Approved records log (sortable, newest first)
//   - Print button
//   - Empty / loading / error states
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Syringe, Printer, AlertCircle, CheckCircle2, Clock, CalendarClock, Filter } from 'lucide-react'
type DoseStatus = 'COMPLETE' | 'DUE' | 'OVERDUE' | 'UPCOMING'
type DoseRow = {
  dose_number: number
  status: DoseStatus
  due_date: string
  given_date: string | null
  batch_number: string | null
  vaccination_site: string | null
  vaccination_record_id: number | null
}
type VaccineStatus = {
  code: string
  vaccine_type: string
  route: string
  dose_volume: string
  total_doses: number
  doses: DoseRow[]
}
type Payload = {
  child: { child_id: number; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string }
  vaccine_status: VaccineStatus[]
  next_due: ({ vaccine_code: string; vaccine_type: string } & DoseRow) | null
  counts: { complete: number; due: number; overdue: number; upcoming: number }
}
const STATUS_META: Record<DoseStatus, { label: string; chip: string; icon: React.ReactNode }> = {
  COMPLETE: { label: 'Complete', chip: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 size={12} /> },
  DUE: { label: 'Due', chip: 'bg-amber-100 text-amber-800', icon: <Clock size={12} /> },
  OVERDUE: { label: 'Overdue', chip: 'bg-rose-100 text-rose-800', icon: <AlertCircle size={12} /> },
  UPCOMING: { label: 'Upcoming', chip: 'bg-slate-100 text-slate-700', icon: <CalendarClock size={12} /> },
}
const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load immunization history.')
  return d
}
function formatDate(ymd: string | null): string {
  if (!ymd) return '—'
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
export function ImmunizationHistorySection({ childId }: { childId: number }) {
  const { data, error, isLoading } = useSWR<Payload>(
    childId ? `/api/vaccination/history?child_id=${childId}` : null,
    fetcher,
  )
  const [vaccineFilter, setVaccineFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<DoseStatus | ''>('')
  const rows = useMemo(() => {
    if (!data) return []
    const flat = data.vaccine_status.flatMap((v) =>
      v.doses.map((d) => ({
        vaccine_code: v.code,
        vaccine_type: v.vaccine_type,
        route: v.route,
        dose_volume: v.dose_volume,
        ...d,
      })),
    )
    return flat
      .filter((r) => (vaccineFilter ? r.vaccine_code === vaccineFilter : true))
      .filter((r) => (statusFilter ? r.status === statusFilter : true))
      .sort((a, b) => {
        // Group by vaccine, then dose number
        if (a.vaccine_type !== b.vaccine_type) return a.vaccine_type.localeCompare(b.vaccine_type)
        return a.dose_number - b.dose_number
      })
  }, [data, vaccineFilter, statusFilter])
  function handlePrint() {
    if (typeof window !== 'undefined') window.print()
  }
  if (!childId) return null
  return (
    <section className="rounded-2xl border border-border bg-white shadow-sm print:shadow-none">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border p-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-primary">
            <Syringe size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Immunization history</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Approved doses + computed due/overdue status against the DOH schedule.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted print:hidden"
        >
          <Printer size={14} /> Print
        </button>
      </div>
      {/* Body */}
      <div className="space-y-5 p-6">
        {isLoading && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Loading immunization history…
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error.message}</span>
          </div>
        )}
        {data && (
          <>
            {/* Next due callout */}
            {data.next_due ? (
              <div className={`flex items-start gap-3 rounded-xl border p-4 ${
                data.next_due.status === 'OVERDUE'
                  ? 'border-rose-200 bg-rose-50'
                  : 'border-amber-200 bg-amber-50'
              }`}>
                <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                  data.next_due.status === 'OVERDUE' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                }`}>
                  {data.next_due.status === 'OVERDUE' ? <AlertCircle size={16} /> : <Clock size={16} />}
                </div>
                <div className="flex-1">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${
                    data.next_due.status === 'OVERDUE' ? 'text-rose-700' : 'text-amber-800'
                  }`}>
                    Next due {data.next_due.status === 'OVERDUE' ? '(overdue)' : ''}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {data.next_due.vaccine_type} — Dose {data.next_due.dose_number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Scheduled: {formatDate(data.next_due.due_date)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">All caught up</p>
                  <p className="mt-1 text-sm text-muted-foreground">No overdue or due doses right now.</p>
                </div>
              </div>
            )}
            {/* Summary counts */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryTile label="Complete" value={data.counts.complete} tone="emerald" />
              <SummaryTile label="Due" value={data.counts.due} tone="amber" />
              <SummaryTile label="Overdue" value={data.counts.overdue} tone="rose" />
              <SummaryTile label="Upcoming" value={data.counts.upcoming} tone="slate" />
            </div>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Filter size={14} className="text-muted-foreground" />
              <select
                value={vaccineFilter}
                onChange={(e) => setVaccineFilter(e.target.value)}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs outline-none focus:border-primary"
              >
                <option value="">All vaccines</option>
                {data.vaccine_status.map((v) => (
                  <option key={v.code} value={v.code}>{v.vaccine_type}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DoseStatus | '')}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs outline-none focus:border-primary"
              >
                <option value="">All statuses</option>
                {(['COMPLETE', 'DUE', 'OVERDUE', 'UPCOMING'] as const).map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
            {/* Table */}
            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No doses match the current filters.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Vaccine</th>
                        <th className="px-4 py-3 font-semibold">Dose</th>
                        <th className="px-4 py-3 font-semibold">Due date</th>
                        <th className="px-4 py-3 font-semibold">Given</th>
                        <th className="px-4 py-3 font-semibold">Batch</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => {
                        const meta = STATUS_META[r.status]
                        return (
                          <tr key={`${r.vaccine_code}-${r.dose_number}`} className="hover:bg-muted/30">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-foreground">{r.vaccine_type}</div>
                              <div className="text-xs text-muted-foreground">{r.route} · {r.dose_volume}</div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">Dose {r.dose_number}</td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(r.due_date)}</td>
                            <td className="px-4 py-3 text-foreground">{formatDate(r.given_date)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{r.batch_number ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
                                {meta.icon} {meta.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    slate: 'bg-slate-50 text-slate-700 ring-slate-200',
  }[tone]
  return (
    <div className={`rounded-xl p-3 ring-1 ${colors}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
