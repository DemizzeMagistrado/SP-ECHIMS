'use client'

// INV-USR005 — Replenishment page.
// RHM: sees own requests + "New request" button
// PHN: sees RHU-wide inbox + "Review" button per PENDING row
// Both: filter chips by status

import { useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Plus, PackagePlus, AlertCircle, Package, MapPin, CalendarClock, Clock, CheckCircle2, XCircle,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { ReplenishmentRequestModal } from '@/components/inventory/replenishment-request-modal'
import { ReplenishmentDecisionModal, type ReplenishmentRequest } from '@/components/inventory/replenishment-decision-modal'

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

const STATUS_META: Record<string, { label: string; chip: string; icon: React.ReactNode }> = {
  PENDING:   { label: 'Pending',   chip: 'bg-amber-100 text-amber-800',   icon: <Clock size={11} /> },
  APPROVED:  { label: 'Approved',  chip: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 size={11} /> },
  REJECTED:  { label: 'Rejected',  chip: 'bg-rose-100 text-rose-800',     icon: <XCircle size={11} /> },
  COMPLETED: { label: 'Completed', chip: 'bg-sky-100 text-sky-800',       icon: <CheckCircle2 size={11} /> },
}

export default function ReplenishmentPage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Inventory', 'view') : false
  const isRhm = role === 'Rural Health Midwife'
  const isPhn = role === 'Public Health Nurse' || role === 'Administrator'

  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [decisionTarget, setDecisionTarget] = useState<ReplenishmentRequest | null>(null)

  const url = statusFilter
    ? `/api/inventory/replenishment?status=${statusFilter}`
    : '/api/inventory/replenishment'

  const { data, error, isLoading } = useSWR<{ requests: ReplenishmentRequest[] }>(canView ? url : null, fetcher)
  const rows = data?.requests ?? []

  if (!isReady) return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading…</div>
  if (!canView) {
    return (
      <div className="space-y-6">
        <ModuleTabs parent="Inventory" role={role} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div><h2 className="text-lg font-bold text-rose-900">Not authorized</h2></div>
        </div>
      </div>
    )
  }

  function refresh() { globalMutate(url) }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Inventory" role={role} />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Replenishment Requests</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            RHM: request stock when yours runs low. PHN: review pending requests and fulfill them via Stock Allocation.
          </p>
        </div>
        {isRhm && (
          <button type="button" onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90">
            <Plus size={17} /> New request
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter:</span>
        {(['', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] as const).map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === s ? 'bg-primary text-white' : 'bg-white text-muted-foreground ring-1 ring-border hover:bg-muted'
            }`}>
            {s === '' ? 'All' : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center text-muted-foreground">
          <PackagePlus size={28} className="text-primary" />
          <p className="mt-3 text-sm">
            {isRhm ? 'No replenishment requests yet. Click “New request” to submit one.' : 'No requests in this view.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-semibold">#</th>
                  <th className="px-5 py-4 font-semibold">Item</th>
                  <th className="px-5 py-4 font-semibold">Qty</th>
                  <th className="px-5 py-4 font-semibold">Barangay</th>
                  <th className="px-5 py-4 font-semibold">Requested</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const item = one(r.item)
                  const brgy = one(r.target_barangay)
                  const meta = STATUS_META[r.status] ?? STATUS_META.PENDING
                  const isPending = r.status === 'PENDING'
                  return (
                    <tr key={r.stock_request_id} className="hover:bg-muted/30">
                      <td className="px-5 py-4 font-mono text-xs text-muted-foreground">#{r.stock_request_id}</td>
                      <td className="px-5 py-4"><Package size={11} className="mr-1 inline" />{item?.item_name ?? '—'}</td>
                      <td className="px-5 py-4"><strong>{Number(r.requested_quantity).toLocaleString()}</strong> {item?.unit ?? ''}</td>
                      <td className="px-5 py-4 text-muted-foreground"><MapPin size={11} className="mr-1 inline" />{brgy?.barangay_name ?? '—'}</td>
                      <td className="px-5 py-4 text-xs text-muted-foreground"><CalendarClock size={10} className="mr-1 inline" />{r.request_date}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {isPhn && isPending ? (
                          <button type="button" onClick={() => setDecisionTarget(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5">
                            Review
                          </button>
                        ) : (
                          <button type="button" onClick={() => setDecisionTarget(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                            View
                          </button>
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

      <ReplenishmentRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={refresh} />
      <ReplenishmentDecisionModal open={!!decisionTarget} onClose={() => setDecisionTarget(null)} onDecided={refresh} request={decisionTarget} />
    </div>
  )
}
