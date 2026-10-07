'use client'

// NIP-USR002 — Real Vaccination Records tab at /vaccination/records
// Replaces the generic ModulePage catch-all that was rendering hardcoded sample names
// (Maria Santos, Juan Dela Cruz, Sofia Reyes, Andrei Garcia) from lib/echims-data.ts.
// Pulls from the vaccination_record table via /api/vaccination/records. Role scope is
// enforced by RLS — PHN sees their RHU, BHW/RHM/BNS see their barangay, Admin sees all.
//
// Empty state shows when vaccination_record is empty (which it currently is — real
// records will start appearing once NIP-USR003 adds the "Record a shot" flow).

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Search, Download, Plus, ArrowRight, Syringe } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'

type ChildRef = { child_id: number; first_name: string; middle_name: string | null; last_name: string; date_of_birth: string }
type ItemRef = { item_id: number; item_name: string }
type VaccineRef = {
  vaccine_id: number
  vaccine_type: string | null
  dose_volume: string | null
  route: string | null
  target_age: string | null
  item: ItemRef | ItemRef[] | null
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
  child: ChildRef | ChildRef[] | null
  vaccine: VaccineRef | VaccineRef[] | null
}
type Payload = {
  rows: Row[]
  can_create: boolean
  can_export: boolean
  role: UserRole
}

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

function fullName(c: ChildRef) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
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

  const [q, setQ] = useState('')

  const url = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    const qs = p.toString()
    return `/api/vaccination/records${qs ? `?${qs}` : ''}`
  }, [q])

  const { data, error, isLoading } = useSWR<Payload>(canView ? url : null, fetcher)

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading...</div>
  if (!canView) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view vaccination records.</div>

  const rows = data?.rows ?? []
  const canCreate = data?.can_create ?? false
  const canExport = data?.can_export ?? false

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Vaccination" role={role} />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Vaccination: Records</h1>
          <p className="mt-2 text-sm text-muted-foreground">Track immunization records, due doses, and follow-up schedules.</p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
            // Record-a-shot flow lives in NIP-USR003 — this button is intentionally inert for now
            // so the UI already shows where it belongs. Enable it once that ticket ships.
            onClick={() => alert('Recording a shot ships with NIP-USR003.')}
          >
            <Plus size={17} /> Add new record
          </button>
        )}
      </div>

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
          <h2 className="mt-4 font-semibold text-foreground">No vaccination records yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {canCreate
              ? 'Shots that have been administered will appear here. Use the Add new record button once that flow ships (NIP-USR003), or check the Schedule tab for pending/approved vaccination requests.'
              : 'Vaccination records in your scope will appear here once BHWs or RHMs start logging administered shots.'}
          </p>
          <Link
            href="/vaccination/schedule"
            className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Go to Schedule tab <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-semibold">Child</th>
                  <th className="px-5 py-4 font-semibold">Vaccine</th>
                  <th className="px-5 py-4 font-semibold">Dose</th>
                  <th className="px-5 py-4 font-semibold">Date</th>
                  <th className="px-5 py-4 font-semibold">Batch</th>
                  <th className="px-5 py-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const c = one(row.child)
                  const v = one(row.vaccine)
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
                      <td className="px-5 py-4 text-muted-foreground">
                        {new Date(row.vaccination_date + 'T00:00:00').toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{row.batch_number ?? '—'}</td>
                      <td className="px-5 py-4">
                        {c && (
                          <Link
                            href={`/child-profiling/children/${c.child_id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                          >
                            View <ArrowRight size={12} />
                          </Link>
                        )}
                      </td>
                    </tr>
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