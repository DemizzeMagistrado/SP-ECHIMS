'use client'

// INV-USR006 — Batch Trace page.
// PHN/Admin-only (RHM/BHW don't see this tab per role config). Enter a batch
// number, see the full picture: all inventories holding it, every transaction
// touching it, and every child who received a dose from it (vax + supp).
//
// Export: CSV download of the children + transactions tables.

import { useState } from 'react'
import useSWR from 'swr'
import {
  Search, Package, Hash, MapPin, CalendarClock, AlertCircle, Download, Users, Syringe, Pill,
  CheckCircle2, Clock, XCircle, Send,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'

type TracePayload = {
  batch_number: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  batches: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vaccinations: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supplementations: any[]
  counts: { batches: number; transactions: number; children_vaccinated: number; children_supplemented: number }
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Load failed.')
  return d
}
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}
function fullName(c: { first_name?: string; middle_name?: string; last_name?: string } | null): string {
  if (!c) return '—'
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
}
function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function BatchTracePage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role === 'Public Health Nurse' || role === 'Administrator'
  const _hasModule = role ? canPerform(role, 'Inventory', 'view') : false

  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')

  const { data, error, isLoading } = useSWR<TracePayload>(
    canView && submitted ? `/api/inventory/batch-trace?batch_number=${encodeURIComponent(submitted)}` : null,
    fetcher,
  )

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading…</div>
  if (!canView) {
    return (
      <div className="space-y-6">
        <ModuleTabs parent="Inventory" role={role} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div>
            <h2 className="text-lg font-bold text-rose-900">Not authorized</h2>
            <p className="mt-1 text-sm text-rose-700">Batch tracing is restricted to PHN and Admin.</p>
          </div>
        </div>
      </div>
    )
  }

  function doSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q) setSubmitted(q)
  }

  function downloadCsv() {
    if (!data) return
    const header = ['section', 'date', 'child_or_barangay', 'details', 'quantity']
    const rows: string[][] = [header]
    for (const t of data.transactions) {
      const brgy = one(one(t.inventory)?.barangay)
      rows.push(['transaction', t.transaction_date, brgy?.barangay_name ?? '', `${t.transaction_type}${t.movement_subtype ? '/' + t.movement_subtype : ''} · ${t.remarks ?? ''}`, String(t.quantity)])
    }
    for (const v of data.vaccinations) {
      const child = one(v.child)
      rows.push(['vaccination', v.vaccination_date, fullName(child), `${one(v.vaccine)?.vaccine_type ?? ''} · dose ${v.dose_number} · ${v.status}`, '1'])
    }
    for (const s of data.supplementations) {
      const child = one(s.child)
      rows.push(['supplementation', s.supplementation_date, fullName(child), one(s.supplement)?.supplement_type ?? '', String(s.quantity_given ?? 1)])
    }
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `batch-trace-${data.batch_number}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Inventory" role={role} />

      <div>
        <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">Batch Trace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          PHN/Admin only. Enter a batch number to see where it was received, allocated, used, and which children received doses from it.
          Essential for recall or defect investigations.
        </p>
      </div>

      <form onSubmit={doSearch} className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label htmlFor="bt-q" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Batch number</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input id="bt-q" type="text" value={query} onChange={(e) => setQuery(e.target.value)} required placeholder="e.g. BCG-2026-001"
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
          <Search size={14} /> Trace
        </button>
        {data && (
          <button type="button" onClick={downloadCsv}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
            <Download size={14} /> Export CSV
          </button>
        )}
      </form>

      {!submitted && (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center text-muted-foreground">
          <Hash size={28} className="text-primary" />
          <p className="mt-3 text-sm">Enter a batch number above to begin.</p>
        </div>
      )}

      {submitted && isLoading && (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Searching…</div>
      )}
      {submitted && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      )}

      {data && (
        <>
          {/* Counts */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={<Package size={14} />} label="Barangays holding" value={data.counts.batches} />
            <StatTile icon={<Send size={14} />} label="Transactions" value={data.counts.transactions} />
            <StatTile icon={<Syringe size={14} />} label="Children vaccinated" value={data.counts.children_vaccinated} />
            <StatTile icon={<Pill size={14} />} label="Children supplemented" value={data.counts.children_supplemented} />
          </div>

          {/* Barangay distribution */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MapPin size={14} /> Barangay distribution
            </h2>
            {data.batches.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No active batches with this number.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Barangay</th>
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 font-semibold">On hand</th>
                      <th className="px-4 py-3 font-semibold">Expiry</th>
                      <th className="px-4 py-3 font-semibold">Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.batches.map((b) => {
                      const inv = one(b.inventory)
                      const item = one(inv?.item)
                      const brgy = one(inv?.barangay)
                      return (
                        <tr key={b.batch_id}>
                          <td className="px-4 py-3">{brgy?.barangay_name ?? '—'}</td>
                          <td className="px-4 py-3">{item?.item_name ?? '—'}</td>
                          <td className="px-4 py-3"><strong>{Number(b.quantity_on_hand).toLocaleString()}</strong> {item?.unit}</td>
                          <td className="px-4 py-3 text-xs"><CalendarClock size={10} className="mr-1 inline" />{b.expiry_date}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{b.received_date}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Transactions timeline */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock size={14} /> Transactions (stock-in · allocations · usage/waste)</h2>
            {data.transactions.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No transactions recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">When</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Barangay</th>
                      <th className="px-4 py-3 font-semibold">Qty</th>
                      <th className="px-4 py-3 font-semibold">Reference</th>
                      <th className="px-4 py-3 font-semibold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.transactions.map((t) => {
                      const brgy = one(one(t.inventory)?.barangay)
                      const kind = t.movement_subtype ?? t.transaction_type
                      return (
                        <tr key={t.transaction_id}>
                          <td className="px-4 py-3 text-xs">{new Date(t.transaction_date).toLocaleString('en-PH')}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {kind}
                            </span>
                          </td>
                          <td className="px-4 py-3">{brgy?.barangay_name ?? '—'}</td>
                          <td className="px-4 py-3"><strong>{Number(t.quantity).toLocaleString()}</strong></td>
                          <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{t.reference_number}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{t.remarks ?? ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Children */}
          <section className="rounded-2xl border border-border bg-white p-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users size={14} /> Children who received this batch</h2>
            {data.vaccinations.length === 0 && data.supplementations.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">No children associated with this batch yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Child</th>
                      <th className="px-4 py-3 font-semibold">Barangay</th>
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 font-semibold">Status / Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.vaccinations.map((v) => {
                      const child = one(v.child)
                      const brgy = one(child?.barangay)
                      return (
                        <tr key={`v-${v.vaccination_record_id}`}>
                          <td className="px-4 py-3 text-xs">{v.vaccination_date}</td>
                          <td className="px-4 py-3">{fullName(child)}</td>
                          <td className="px-4 py-3 text-xs">{brgy?.barangay_name ?? '—'}</td>
                          <td className="px-4 py-3">💉 {one(v.vaccine)?.vaccine_type ?? ''} dose {v.dose_number}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <CheckCircle2 size={10} /> {v.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {data.supplementations.map((s) => {
                      const child = one(s.child)
                      const brgy = one(child?.barangay)
                      return (
                        <tr key={`s-${s.supplementation_record_id}`}>
                          <td className="px-4 py-3 text-xs">{s.supplementation_date}</td>
                          <td className="px-4 py-3">{fullName(child)}</td>
                          <td className="px-4 py-3 text-xs">{brgy?.barangay_name ?? '—'}</td>
                          <td className="px-4 py-3">💊 {one(s.supplement)?.supplement_type ?? ''}</td>
                          <td className="px-4 py-3">
                            <strong>{s.quantity_given ?? 1}</strong>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon} {label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
    </div>
  )
}
