'use client'

// NIP-USR005 — Defaulters list page at /vaccination/defaulters (v2 — grouped by child)
// 4th tab in the Vaccination section (Records / Schedule / Calendar / Defaulters).
//
// v2 UX change: rows are now grouped by child so one kid with 17 overdue doses doesn't
// explode into 17 scrollbar rows. Click a child row to expand and see the per-dose
// detail. Summary shows "N overdue · M due" per child at the parent-row level.
//
// Backend endpoint is unchanged — same /api/vaccination/defaulters payload.
// RLS still enforces barangay/RHU scope.

import { Fragment, useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import {
  AlertCircle, Clock, Filter, UserPlus, ArrowRight, Users, Syringe, ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { NIP_CATALOG } from '@/lib/nip-schedule'

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

type Payload = {
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

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load defaulters.')
  return d
}

function formatDate(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function VaccinationDefaultersPage() {
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
  const { data, error, isLoading } = useSWR<Payload>(canView ? url : null, fetcher)

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
      <ModuleTabs parent="Vaccination" role={role} />

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
                          <div className="text-xs text-muted-foreground">DOB {formatDate(g.date_of_birth)}</div>
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
                                      <td className="px-4 py-2 text-muted-foreground">{formatDate(d.due_date)}</td>
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