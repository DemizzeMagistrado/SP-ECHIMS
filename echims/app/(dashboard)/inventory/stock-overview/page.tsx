'use client'

// INV-USR001/USR002 — Stock Overview page.
// Default landing for /inventory. Shows every (item × barangay) inventory row
// grouped with its batches, filtered by item + barangay. Row-level badges flag
// LOW (compared to the LOW_STOCK threshold stored on alert_rule) and NEAR
// EXPIRY (<= 90 days from today). "Record stock-in" opens the USR001 modal.
//
// Role access (via existing sidebar config + RLS):
//   • Admin / PHN : full RHU view, can open stock-in
//   • RHM         : only their assigned barangay rows (RLS filters)
//   • BHW / BNS   : no Inventory tab in sidebar at all

import { useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Plus, Package, AlertCircle, CheckCircle2, Clock, CalendarClock, Hash, MapPin, Syringe, Pill, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { StockInModal } from '@/components/inventory/stock-in-modal'

type Batch = { batch_id: number; batch_number: string; expiry_date: string; received_date: string; quantity_on_hand: number }
type Item = { item_id: number; item_name: string; unit: string; status: string }
type Barangay = { barangay_id: number; barangay_name: string }
type InventoryRow = {
  inventory_id: number
  item_id: number
  barangay_id: number
  quantity_on_hand: number
  updated_at: string
  item: Item | Item[] | null
  barangay: Barangay | Barangay[] | null
  batches: Batch[]
  batch_sum: number
  has_drift: boolean
}
type Payload = { inventories: InventoryRow[] }

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

function daysUntil(ymd: string): number {
  return Math.floor((new Date(ymd + 'T00:00:00').getTime() - Date.now()) / 86400000)
}

// Classify a batch for the badge: EXPIRED / EXPIRING_SOON (<=90d) / OK.
function expiryTone(ymd: string): 'rose' | 'amber' | 'slate' {
  const d = daysUntil(ymd)
  if (d <= 0) return 'rose'
  if (d <= 90) return 'amber'
  return 'slate'
}

// Low-stock threshold — the alert evaluator uses rule-based thresholds, but for
// the UI badge we show a conservative "<10 units" marker so health workers can
// scan at a glance even before an alert rule exists.
const LOW_STOCK_UI_THRESHOLD = 10

export default function StockOverviewPage() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const isPhn = role === 'Public Health Nurse' || role === 'Administrator'
  const canView = role ? canPerform(role, 'Inventory', 'view') : false

  const [itemFilter, setItemFilter] = useState('')
  const [brgyFilter, setBrgyFilter] = useState('')
  const [stockInOpen, setStockInOpen] = useState(false)

  const url = useMemo(() => {
    const qs = new URLSearchParams()
    if (itemFilter) qs.set('item_id', itemFilter)
    if (brgyFilter) qs.set('barangay_id', brgyFilter)
    return `/api/inventory/stock-overview${qs.toString() ? `?${qs}` : ''}`
  }, [itemFilter, brgyFilter])

  const { data, error, isLoading } = useSWR<Payload>(isReady && canView ? url : null, fetcher)
  const itemsSWR = useSWR<{ items: { item_id: number; item_name: string; kind: string }[] }>(canView ? '/api/inventory/items' : null, fetcher)
  const brgysSWR = useSWR<Barangay[] | { barangays: Barangay[] }>(canView ? '/api/barangays' : null, fetcher)
  const items = itemsSWR.data?.items ?? []
  const barangays = Array.isArray(brgysSWR.data) ? brgysSWR.data : (brgysSWR.data?.barangays ?? [])

  if (!isReady) {
    return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading…</div>
  }
  if (!canView) {
    return (
      <div className="space-y-6">
        <ModuleTabs parent="Inventory" role={role} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div>
            <h2 className="text-lg font-bold text-rose-900">Not authorized</h2>
            <p className="mt-1 text-sm text-rose-700">You do not have access to Inventory.</p>
          </div>
        </div>
      </div>
    )
  }

  const rows = data?.inventories ?? []

  function refresh() { globalMutate(url) }

  return (
    <div className="space-y-6">
      <ModuleTabs parent="Inventory" role={role} />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Stock Overview</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Real-time quantity-on-hand per item and barangay. Each row expands to show its batches with expiry.
          </p>
        </div>
        {isPhn && (
          <button type="button" onClick={() => setStockInOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
            <Plus size={17} /> Record stock-in
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 md:flex-row md:items-center">
        <div className="flex-1">
          <label htmlFor="f-item" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</label>
          <select id="f-item" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">All items</option>
            {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="f-brgy" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Barangay</label>
          <select id="f-brgy" value={brgyFilter} onChange={(e) => setBrgyFilter(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="">All barangays</option>
            {barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading stock…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error.message}</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-200 bg-white p-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-primary">
            <Package size={22} />
          </div>
          <h2 className="mt-4 font-semibold text-foreground">No stock to show</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {isPhn ? 'Click “Record stock-in” to receive your first shipment.' : 'Ask the PHN to record a stock-in for this barangay.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((inv) => {
            const item = one(inv.item)
            const brgy = one(inv.barangay)
            const lowStock = Number(inv.quantity_on_hand) <= LOW_STOCK_UI_THRESHOLD
            return (
              <article key={inv.inventory_id} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                {/* Row header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                      {item?.item_name?.toLowerCase().includes('vaccine') ? <Syringe size={16} className="text-primary" /> : <Pill size={16} className="text-primary" />}
                      {item?.item_name ?? '—'}
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                        {item?.unit ?? ''}
                      </span>
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin size={11} /> {brgy?.barangay_name ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {lowStock && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
                        <AlertTriangle size={11} /> Low stock
                      </span>
                    )}
                    {inv.has_drift && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800" title={`Batches sum to ${inv.batch_sum}, aggregate shows ${inv.quantity_on_hand}`}>
                        <AlertCircle size={11} /> Batch/agg drift
                      </span>
                    )}
                    <span className="rounded-xl bg-emerald-50 px-3 py-1 text-lg font-bold text-emerald-800">
                      {Number(inv.quantity_on_hand).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Batches */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Batch</th>
                        <th className="px-5 py-3 font-semibold">Qty on hand</th>
                        <th className="px-5 py-3 font-semibold">Received</th>
                        <th className="px-5 py-3 font-semibold">Expiry</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {inv.batches.length === 0 ? (
                        <tr><td colSpan={5} className="px-5 py-6 text-center text-xs italic text-muted-foreground">No batches recorded yet.</td></tr>
                      ) : inv.batches.map((batch) => {
                        const tone = expiryTone(batch.expiry_date)
                        const days = daysUntil(batch.expiry_date)
                        const toneChip = {
                          rose: 'bg-rose-100 text-rose-800',
                          amber: 'bg-amber-100 text-amber-800',
                          slate: 'bg-slate-100 text-slate-700',
                        }[tone]
                        const toneLabel = days <= 0 ? 'Expired' : days <= 90 ? `Expiring in ${days}d` : 'OK'
                        return (
                          <tr key={batch.batch_id} className="hover:bg-muted/30">
                            <td className="px-5 py-3 font-mono text-xs"><Hash size={10} className="mr-1 inline" />{batch.batch_number}</td>
                            <td className="px-5 py-3"><strong>{Number(batch.quantity_on_hand).toLocaleString()}</strong></td>
                            <td className="px-5 py-3 text-xs text-muted-foreground">{batch.received_date}</td>
                            <td className="px-5 py-3 text-xs text-muted-foreground">
                              <CalendarClock size={10} className="mr-1 inline" />{batch.expiry_date}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneChip}`}>
                                {tone === 'slate' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                                {toneLabel}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <StockInModal open={stockInOpen} onClose={() => setStockInOpen(false)} onSaved={refresh} />
    </div>
  )
}
