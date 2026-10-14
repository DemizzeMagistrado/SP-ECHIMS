'use client'

// INV-USR005 — Replenishment request modal (RHM creates).
// Form: item + barangay (defaults to the RHM's assignment — but we show the
// selector in case they manage multiple), quantity, remarks (optional).
// Current stock display updates as item + barangay are picked.

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { X, Package, MapPin, AlertCircle, Loader2, PackagePlus } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

type Item = { item_id: number; item_name: string; unit: string; kind: string }
type Barangay = { barangay_id: number; barangay_name: string }
type Inventory = {
  inventory_id: number; item_id: number; barangay_id: number; quantity_on_hand: number
}

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Load failed.')
  return d
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

type Props = { open: boolean; onClose: () => void; onSaved?: () => void }

export function ReplenishmentRequestModal({ open, onClose, onSaved }: Props) {
  const { showToast } = useToast()
  const itemsSWR = useSWR<{ items: Item[] }>(open ? '/api/inventory/items' : null, fetcher)
  const brgysSWR = useSWR<Barangay[] | { barangays: Barangay[] }>(open ? '/api/barangays' : null, fetcher)
  const invSWR = useSWR<{ inventories: Inventory[] }>(open ? '/api/inventory/stock-overview' : null, fetcher)

  const [itemId, setItemId] = useState('')
  const [barangayId, setBarangayId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [requestId, setRequestId] = useState(newRequestId())

  useEffect(() => {
    if (open) {
      setItemId(''); setBarangayId(''); setQuantity(''); setRemarks('')
      setFormError(''); setRequestId(newRequestId())
    }
  }, [open])

  const items = itemsSWR.data?.items ?? []
  const barangays = Array.isArray(brgysSWR.data) ? brgysSWR.data : (brgysSWR.data?.barangays ?? [])
  const inventories = invSWR.data?.inventories ?? []

  // Current stock lookup for (item, barangay).
  const currentStock = useMemo(() => {
    if (!itemId || !barangayId) return null
    const row = inventories.find((i) => String(i.item_id) === itemId && String(i.barangay_id) === barangayId)
    return row ? Number(row.quantity_on_hand) : 0
  }, [itemId, barangayId, inventories])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    if (!itemId) return setFormError('Please pick an item.')
    if (!barangayId) return setFormError('Please pick the receiving barangay.')
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return setFormError('Quantity must be positive.')

    setSaving(true)
    try {
      const r = await fetch('/api/inventory/replenishment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: Number(itemId),
          barangay_id: Number(barangayId),
          quantity: qty,
          remarks: remarks.trim() || undefined,
          request_id: requestId,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      showToast({ type: 'success', message: `Replenishment request #${d.stock_request_id} submitted — awaiting PHN review.` })
      onSaved?.()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to submit.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null
  const selectedItem = items.find((i) => String(i.item_id) === itemId) ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-primary">
              <PackagePlus size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Request replenishment</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                RHM-only. Submits as <strong>PENDING</strong> for PHN review and allocation.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="rr-item" className="mb-1 block text-sm font-semibold text-foreground">
                <Package size={13} className="mr-1 inline" /> Item *
              </label>
              <select id="rr-item" value={itemId} onChange={(e) => setItemId(e.target.value)} required disabled={itemsSWR.isLoading}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50">
                <option value="">{itemsSWR.isLoading ? 'Loading…' : 'Select an item…'}</option>
                {items.map((it) => (
                  <option key={it.item_id} value={it.item_id}>
                    {it.kind === 'vaccine' ? '💉' : '💊'} {it.item_name} ({it.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rr-brgy" className="mb-1 block text-sm font-semibold text-foreground">
                <MapPin size={13} className="mr-1 inline" /> Receiving barangay *
              </label>
              <select id="rr-brgy" value={barangayId} onChange={(e) => setBarangayId(e.target.value)} required disabled={brgysSWR.isLoading}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50">
                <option value="">{brgysSWR.isLoading ? 'Loading…' : 'Select a barangay…'}</option>
                {barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
              </select>
            </div>
          </div>

          {itemId && barangayId && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <strong>Current stock:</strong> {currentStock} {selectedItem?.unit ?? ''}
              {typeof currentStock === 'number' && currentStock <= 10 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                  Low
                </span>
              )}
            </div>
          )}

          <div>
            <label htmlFor="rr-qty" className="mb-1 block text-sm font-semibold text-foreground">
              Quantity requested *
            </label>
            <input id="rr-qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required
              placeholder="e.g. 100"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>

          <div>
            <label htmlFor="rr-remarks" className="mb-1 block text-sm font-semibold text-foreground">
              Remarks <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea id="rr-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2}
              placeholder="e.g. Expecting campaign next week — need buffer"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>

          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <PackagePlus size={14} />}
              {saving ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
