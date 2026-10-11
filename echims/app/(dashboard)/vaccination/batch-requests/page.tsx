'use client'

// NIP-USR010 — Vaccination Batch Requests tab (6th tab in Vaccination module).
// Shows the list of batch requests, filterable by status.
// RHM can submit new requests via the "New request" button.
// PHN / Admin can click a row to review + approve/reject.

import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Plus, Package, AlertCircle, Hash, MapPin, CalendarClock, CheckCircle2, Clock, XCircle,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { BatchRequestModal } from '@/components/vaccination/batch-request-modal'
import { BatchRequestDecisionModal, type BatchRequestRow } from '@/components/vaccination/batch-request-decision-modal'

type Payload = {
  requests: BatchRequestRow[]
  role: UserRole
  can_create: boolean
  can_approve: boolean
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Unable to load.')
  return d
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const STATUS_META: Record<string, { label: string; chip: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', chip: 'bg-amber-100 text-amber-800', icon: <Clock size={11} /> },
  APPROVED: { label: 'Approved', chip: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle2 size={11} /> },
  REJECTED: { label: 'Rejected', chip: 'bg-rose-100 text-rose-800', icon: <XCircle size={11} /> },
  COMPLETED: { label: 'Completed', chip: 'bg-sky-100 text-sky-800', icon: <CheckCircle2 size={11} /> },
  CANCELLED: { label: 'Cancelled', chip: 'bg-slate-200 text-slate-700', icon: <XCircle size={11} /> },
}

export default function BatchRequestsPage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccine Batch Requests', 'view') : false

  const [statusFilter, setStatusFilter] = useState<string>('')
  const url = statusFilter
    ? `/api/vaccination/batch-requests?status=${statusFilter}`
    : '/api/vaccination/batch-requests'

  const { data, error, isLoading } = useSWR<Payload>(isReady && canView ? url : null, fetcher)
  const [createOpen, setCreateOpen] = useState(false)
  const [decisionTarget, setDecisionTarget] = useState<BatchRequestRow | null>(null)

  if (!isReady) {
    return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading…</div>
  }
  if (!canView) {
    return (
      <div className="space-y-6">
        <ModuleTabs parent="Vaccination" role={role} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div>
            <h2 className="text-lg font-bold text-rose-900">Not authorized</h2>
            <p className="mt-1 text-sm text-rose-700">You do not have access to vaccine batch requests.</p>
          </div>
        </div>
      </div>
    )
  }

  const rows = data?.requests ?? []
  const canCreate = data?.can_create ?? false
  const canApprove = data?.can_approve ?? false

  function refresh() {
    globalMutate(url)
  }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Vaccination" role={role} />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Vaccine Batch Requests</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            RHM requests vaccine batches for a target barangay. PHN reviews and approves — approval auto-adds the dose count to that barangay&rsquo;s inventory.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <Plus size={17} /> New request
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter:</span>
        {(['', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-primary text-white'
                : 'bg-white text-muted-foreground ring-1 ring-border hover:bg-muted'
            }`}
          >
            {s === '' ? 'All' : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading requests…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-primary">
            <Package size={22} />
          </div>
          <h2 className="mt-4 font-semibold text-foreground">
            {statusFilter ? `No ${STATUS_META[statusFilter]?.label.toLowerCase() ?? statusFilter.toLowerCase()} requests` : 'No batch requests yet'}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {canCreate ? 'Click New request to submit a batch request.' : 'Nothing to review right now.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-semibold">#</th>
                  <th className="px-5 py-4 font-semibold">Vaccine · Batch</th>
                  <th className="px-5 py-4 font-semibold">Qty</th>
                  <th className="px-5 py-4 font-semibold">Target Barangay</th>
                  <th className="px-5 py-4 font-semibold">Requested</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const item = one(r.item)
                  const vaccine = one(r.vaccine)
                  const barangay = one(r.target_barangay)
                  const meta = STATUS_META[r.status] ?? STATUS_META.PENDING
                  const isPending = r.status === 'PENDING'
                  const vaccineName = item?.item_name ?? vaccine?.vaccine_type ?? '—'
                  return (
                    <tr key={r.stock_request_id} className="hover:bg-muted/40">
                      <td className="px-5 py-4 font-mono text-xs text-muted-foreground">#{r.stock_request_id}</td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-foreground">{vaccineName}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Hash size={10} /> {r.batch_number ?? '—'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-foreground">
                        <strong>{r.requested_quantity}</strong> <span className="text-xs text-muted-foreground">{item?.unit ?? 'dose(s)'}</span>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        <div className="flex items-center gap-1"><MapPin size={11} /> {barangay?.barangay_name ?? '—'}</div>
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1"><CalendarClock size={10} /> {formatDate(r.request_date)}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {canApprove && isPending ? (
                          <button
                            type="button"
                            onClick={() => setDecisionTarget(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                          >
                            Review
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDecisionTarget(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                          >
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

      {/* Modals */}
      <BatchRequestModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <BatchRequestDecisionModal
        open={!!decisionTarget}
        onClose={() => setDecisionTarget(null)}
        onDecided={refresh}
        request={decisionTarget}
      />
    </div>
  )
}