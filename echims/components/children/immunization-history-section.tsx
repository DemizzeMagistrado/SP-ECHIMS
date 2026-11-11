'use client'
import { StatCard } from '@/components/ui/stat-card'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
// NIP-USR004 — Immunization history section (replaces the inline Vaccination History
// SectionCard on the child profile page). Shows:
//   - "Next due" callout (overdue first, then due)
//   - Summary counts
//   - Vaccine filter dropdown
//   - Table with every dose + status badge (COMPLETE / DUE / OVERDUE / UPCOMING)
// *- "Prior" chip on COMPLETE doses that were back-filled (NIP-USR008)
//   - Approved records log (sortable, newest first)
//   - Print button
//   - "Add past vaccination" button (NIP-USR008) — gated per role
//   - Empty / loading / error states
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Syringe, Printer, AlertCircle, Ban, CheckCircle2, Clock, CalendarClock, Plus, History, SearchX } from 'lucide-react'
import { AccordionCard, ExpandCollapseAll } from '@/components/ui/accordion-card'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { RecordPriorVaccinationModal } from '@/components/vaccination/record-prior-vaccination-modal'
import { Spinner } from '@/components/brand/logo-loader'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
type DoseStatus = 'COMPLETE' | 'DUE' | 'OVERDUE' | 'UPCOMING' | 'NOT_ELIGIBLE'
type DoseRow = {
  dose_number: number
  status: DoseStatus
  due_date: string
  given_date: string | null
  batch_number: string | null
  vaccination_site: string | null
  vaccination_record_id: number | null
  // NIP-USR008 — flag + source for retrospective records (Baby Book, prior RHU).
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
type Payload = {
  child: { child_id: number; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string }
  vaccine_status: VaccineStatus[]
  next_due: ({ vaccine_code: string; vaccine_type: string } & DoseRow) | null
  counts: { complete: number; due: number; overdue: number; upcoming: number }
}
const STATUS_META: Record<DoseStatus, { label: string; icon: React.ReactNode }> = {
  COMPLETE: { label: 'Completed', icon: <CheckCircle2 size={12} aria-hidden="true" /> },
  DUE: { label: 'Due', icon: <Clock size={12} aria-hidden="true" /> },
  OVERDUE: { label: 'Missed', icon: <AlertCircle size={12} aria-hidden="true" /> },
  UPCOMING: { label: 'Pending', icon: <CalendarClock size={12} aria-hidden="true" /> },
  NOT_ELIGIBLE: { label: 'Not eligible', icon: <Ban size={12} aria-hidden="true" /> },
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
export function ImmunizationHistorySection({ childId, childName }: { childId: number; childName?: string }) {
  const { user } = useAuth()
  const role = user?.role as UserRole | undefined
  // NIP-USR008 — only roles with Vaccination 'create' can back-fill prior records.
  // After NIP-USR007, that's Admin / RHM / BHW (not PHN, not BNS).
  const canAddPrior = role ? canPerform(role, 'Vaccination', 'create') : false

  const { data, error, isLoading, mutate } = useSWR<Payload>(
    childId ? `/api/vaccination/history?child_id=${childId}` : null,
    fetcher,
  )
  const [vaccineFilter, setVaccineFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<DoseStatus | ''>('')
  const [priorModalOpen, setPriorModalOpen] = useState(false)
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
  const groups = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string; route: string; dose_volume: string; total: number; doses: typeof rows }>()
    for (const r of rows) {
      const v = data?.vaccine_status.find((x) => x.code === r.vaccine_code)
      if (!byCode.has(r.vaccine_code)) byCode.set(r.vaccine_code, { code: r.vaccine_code, name: r.vaccine_type, route: r.route, dose_volume: r.dose_volume, total: v?.total_doses ?? 0, doses: [] })
      byCode.get(r.vaccine_code)!.doses.push(r)
    }
    return [...byCode.values()].map((g) => {
      const all = data?.vaccine_status.find((x) => x.code === g.code)?.doses ?? g.doses
      const done = all.filter((d) => d.status === 'COMPLETE').length
      const total = g.total || all.length
      const missed = all.some((d) => d.status === 'OVERDUE')
      const open = all.filter((d) => d.status !== 'COMPLETE' && d.status !== 'NOT_ELIGIBLE')
      const next = open.sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null
      const state: 'COMPLETED' | 'MISSED' | 'PENDING' | 'NOT_ELIGIBLE' =
        done >= total ? 'COMPLETED' : missed ? 'MISSED' : open.length ? 'PENDING' : 'NOT_ELIGIBLE'
      return { ...g, done, total, state, next, isNextDue: data?.next_due?.vaccine_code === g.code }
    })
  }, [rows, data])
  // Short lists start open; longer ones start closed except vaccines that need action.
  const defaultOpen = useMemo(() => new Set(groups.filter((g) => groups.length <= 5 || g.state === 'MISSED' || g.isNextDue).map((g) => g.code)), [groups])
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({})
  const isOpen = (code: string) => openOverride[code] ?? defaultOpen.has(code)
  const setAll = (open: boolean) => setOpenOverride(Object.fromEntries(groups.map((g) => [g.code, open])))
  const allOpen = groups.length > 0 && groups.every((g) => isOpen(g.code))
  const noneOpen = groups.every((g) => !isOpen(g.code))
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
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {canAddPrior && (
            <Button variant="secondary" size="sm" onClick={() => setPriorModalOpen(true)} title="Record a vaccination given before eCHIMS enrollment (Baby Book, prior RHU, etc.)">
              <Plus size={14} aria-hidden="true" /> Add past vaccination
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handlePrint}>
            <Printer size={14} aria-hidden="true" /> Print
          </Button>
        </div>
      </div>
      {/* Body */}
      <div className="space-y-5 p-6">
        {isLoading && (
          <div className="rounded-xl border border-dashed border-border">
            <Spinner showLabel label="Loading immunization history…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
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
                    {data.next_due.status === 'OVERDUE' ? 'Missed dose' : 'Next due'}
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
                  <p className="mt-1 text-sm text-muted-foreground">No missed or due doses right now.</p>
                </div>
              </div>
            )}
            {/* Summary counts */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryTile label="Complete" value={data.counts.complete} tone="emerald" />
              <SummaryTile label="Due" value={data.counts.due} tone="amber" />
              <SummaryTile label="Missed" value={data.counts.overdue} tone="rose" />
              <SummaryTile label="Pending" value={data.counts.upcoming} tone="slate" />
            </div>
            {/* Filters: two compact selects side by side (stacked on narrow phones), then the
                expand/collapse controls on their own row, aligned right. */}
            <div className="space-y-3 print:hidden">
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Filter by vaccine</span>
                  <Select value={vaccineFilter} onChange={(e) => setVaccineFilter(e.target.value)} className="h-9">
                    <option value="">All vaccines</option>
                    {data.vaccine_status.map((v) => (
                      <option key={v.code} value={v.code}>{v.vaccine_type}</option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-muted">Filter by status</span>
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DoseStatus | '')} className="h-9">
                    <option value="">All statuses</option>
                    {(['COMPLETE', 'OVERDUE', 'UPCOMING', 'NOT_ELIGIBLE'] as const).map((s) => (
                      <option key={s} value={s}>{STATUS_META[s].label}</option>
                    ))}
                  </Select>
                </label>
              </div>
              {groups.length > 1 && <ExpandCollapseAll allOpen={allOpen} noneOpen={noneOpen} onSet={setAll} />}
            </div>
            {/* Vaccines: one card each. Changing a filter fades the list in; open states persist. */}
            <div key={`${vaccineFilter}|${statusFilter}`} className="animate-in fade-in duration-150 motion-reduce:animate-none">
            {rows.length === 0 ? (
              <EmptyState icon={SearchX} title="No doses match these filters" description="Try a different status or vaccine." className="rounded-xl border border-dashed border-border" />
            ) : (
              <ul className="space-y-2.5">
                {groups.map((g) => {
                  const open = isOpen(g.code)
                  return (
                    <AccordionCard
                      key={g.code}
                      id={`nip-${childId}-${g.code}`}
                      open={open}
                      onToggle={() => setOpenOverride((o) => ({ ...o, [g.code]: !open }))}
                      header={<>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-brand-navy">{g.name}</span>
                          <span className="block text-xs text-muted-foreground">{g.route} · {g.dose_volume}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="text-sm tabular-nums text-brand-navy"><span className="font-semibold">{g.done}/{g.total}</span> <span className="text-muted-foreground">doses</span></span>
                          <StatusBadge
                            status={g.state.toLowerCase()}
                            tone={g.state === 'COMPLETED' ? 'good' : g.state === 'MISSED' ? 'danger' : g.state === 'NOT_ELIGIBLE' ? 'neutral' : 'info'}
                            label={g.state === 'COMPLETED' ? 'Completed' : g.state === 'MISSED' ? 'Missed' : g.state === 'NOT_ELIGIBLE' ? 'Not eligible' : 'Pending'}
                          />
                          <span className="text-xs text-muted-foreground sm:w-40 sm:text-right">
                            {g.next
                              ? g.next.status === 'OVERDUE'
                                ? <>Missed since <span className="font-medium text-danger">{formatDate(g.next.due_date)}</span></>
                                : <>Next due <span className="font-medium text-brand-navy">{formatDate(g.next.due_date)}</span></>
                              : g.state === 'NOT_ELIGIBLE' ? 'Past the age limit' : 'All doses given'}
                          </span>
                        </span>
                      </>}
                    >
                            {/* Desktop: compact table */}
                            <table className="hidden w-full text-left text-sm sm:table">
                              <thead>
                                <tr className="text-[11px] uppercase tracking-wide text-brand-muted">
                                  <th className="pb-2 pr-3 font-medium">Dose</th>
                                  <th className="pb-2 pr-3 font-medium">Due date</th>
                                  <th className="pb-2 pr-3 font-medium">Given</th>
                                  <th className="pb-2 pr-3 font-medium">Batch</th>
                                  <th className="pb-2 pr-3 font-medium">Site / remarks</th>
                                  <th className="pb-2 text-right font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {g.doses.map((r) => {
                                  const meta = STATUS_META[r.status]
                                  return (
                                    <tr key={r.dose_number}>
                                      <td className="py-2.5 pr-3 font-medium text-brand-navy">Dose {r.dose_number}</td>
                                      <td className="py-2.5 pr-3 text-muted-foreground">{formatDate(r.due_date)}</td>
                                      <td className="py-2.5 pr-3 text-foreground">
                                        {formatDate(r.given_date)}
                                        {r.is_prior && <PriorChip source={r.prior_source} />}
                                      </td>
                                      <td className="py-2.5 pr-3 text-muted-foreground">{r.batch_number ?? '—'}</td>
                                      <td className="py-2.5 pr-3 text-muted-foreground">{doseRemarks(r)}</td>
                                      <td className="py-2.5 text-right"><StatusBadge status={r.status} label={meta.label} icon={meta.icon} /></td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                            {/* Phones: one mini card per dose */}
                            <ul className="space-y-2 sm:hidden">
                              {g.doses.map((r) => {
                                const meta = STATUS_META[r.status]
                                return (
                                  <li key={r.dose_number} className="rounded-lg bg-white p-3 text-sm ring-1 ring-border/70">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium text-brand-navy">Dose {r.dose_number}</span>
                                      <StatusBadge status={r.status} label={meta.label} icon={meta.icon} />
                                    </div>
                                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                                      <dt className="text-brand-muted">Due</dt><dd>{formatDate(r.due_date)}</dd>
                                      <dt className="text-brand-muted">Given</dt><dd>{formatDate(r.given_date)}{r.is_prior && <PriorChip source={r.prior_source} />}</dd>
                                      <dt className="text-brand-muted">Batch</dt><dd>{r.batch_number ?? '—'}</dd>
                                      <dt className="text-brand-muted">Site / remarks</dt><dd>{doseRemarks(r)}</dd>
                                    </dl>
                                  </li>
                                )
                              })}
                            </ul>
                    </AccordionCard>
                  )
                })}
              </ul>
            )}
            </div>
          </>
        )}
      </div>
      {/* NIP-USR008 — Prior vaccination modal mount */}
      {canAddPrior && (
        <RecordPriorVaccinationModal
          open={priorModalOpen}
          onClose={() => setPriorModalOpen(false)}
          onSaved={() => mutate()}
          childId={childId}
          childName={
            childName ??
            (data?.child
              ? [data.child.first_name, data.child.last_name].filter(Boolean).join(' ')
              : 'this child')
          }
        />
      )}
    </section>
  )
}
function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const map = { emerald: 'good', amber: 'warn', rose: 'danger', slate: 'default' } as const
  return <StatCard className="p-4" label={label} value={value} tone={map[tone]} />
}

function PriorChip({ source }: { source: string | null | undefined }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-semibold text-warn" title={source ? `Source: ${source}` : 'Back-filled from paper record'}>
      <History size={10} aria-hidden="true" /> Prior
    </span>
  )
}

function doseRemarks(r: DoseRow): string {
  return [r.vaccination_site, r.is_prior && r.prior_source ? `From ${r.prior_source}` : null].filter(Boolean).join(' · ') || '—'
}
