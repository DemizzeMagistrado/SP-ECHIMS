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
import { LogoLoader } from '@/components/brand/logo-loader'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

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

  const { data, error, isLoading } = useSWR<{ requests: ReplenishmentRequest[] }>(canView ? url : null, fetcher, { keepPreviousData: true })
  const rows = data?.requests ?? []

  if (!isReady) return <LogoLoader />
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

      <PageHeader
        title="Replenishment Requests"
        subtitle="RHM: request stock when yours runs low. PHN: review pending requests and fulfill them via Stock Allocation."
        actions={<>
          {isRhm && (
            <Button onClick={() => setCreateOpen(true)}
             >
              <Plus size={17} /> New request
            </Button>
          )}
        </>}
      />

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

      {isLoading && !data ? (
        <LogoLoader size="section" />
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.stock_request_id}
          caption="Replenishment requests"
          refreshing={isLoading && !!data}
          empty={{
            size: 'page',
            icon: PackagePlus,
            title: isRhm ? 'No replenishment requests yet' : 'No requests in this view',
            description: isRhm ? 'Use “New request” to ask for more stock.' : 'Requests from midwives will appear here.',
          }}
          columns={[
            { key: 'id', header: '#', sortValue: (r) => r.stock_request_id, cell: (r) => <span className="font-mono text-xs text-muted-foreground">#{r.stock_request_id}</span> },
            { key: 'item', header: 'Item', sortValue: (r) => one(r.item)?.item_name, cell: (r) => <><Package size={11} className="mr-1 inline" aria-hidden="true" />{one(r.item)?.item_name ?? '—'}</> },
            { key: 'qty', header: 'Qty', align: 'right', sortValue: (r) => Number(r.requested_quantity), cell: (r) => <><strong>{Number(r.requested_quantity).toLocaleString()}</strong> {one(r.item)?.unit ?? ''}</> },
            { key: 'barangay', header: 'Barangay', sortValue: (r) => one(r.target_barangay)?.barangay_name, cell: (r) => <span className="text-muted-foreground"><MapPin size={11} className="mr-1 inline" aria-hidden="true" />{one(r.target_barangay)?.barangay_name ?? '—'}</span> },
            { key: 'requested', header: 'Requested', sortValue: (r) => r.request_date, cell: (r) => <span className="text-xs text-muted-foreground"><CalendarClock size={10} className="mr-1 inline" aria-hidden="true" />{r.request_date}</span> },
            { key: 'status', header: 'Status', sortValue: (r) => r.status, cell: (r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.PENDING
              return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>{meta.icon} {meta.label}</span>
            } },
            { key: 'action', header: <span className="sr-only">Action</span>, cell: (r) => (
              <Button size="sm" variant={isPhn && r.status === 'PENDING' ? 'primary' : 'secondary'} onClick={() => setDecisionTarget(r)}>
                {isPhn && r.status === 'PENDING' ? 'Review' : 'View'}
              </Button>
            ) },
          ]}
        />
      )}

      <ReplenishmentRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={refresh} />
      <ReplenishmentDecisionModal open={!!decisionTarget} onClose={() => setDecisionTarget(null)} onDecided={refresh} request={decisionTarget} />
    </div>
  )
}
