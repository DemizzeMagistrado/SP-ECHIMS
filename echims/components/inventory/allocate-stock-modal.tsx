'use client'

// INV-USR003 — Allocate Stock modal.
// PHN picks a SOURCE batch (barangay + item + batch) and a TARGET barangay,
// enters a quantity, submits. Backend validates PHN scope + available stock
// via inv_allocate_stock RPC and runs the full transfer atomically.

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { X, ArrowRight, MapPin, Package, Hash, AlertCircle, Loader2, Send } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

type Barangay = { barangay_id: number; barangay_name: string }
type Batch = {
  batch_id: number
  batch_number: string
  expiry_date: string
  quantity_on_hand: number
}
type InventoryRow = {
  inventory_id: number
  item_id: number
  barangay_id: number
  quantity_on_hand: number
  item: { item_name: string; unit: string } | { item_name: string; unit: string }[] | null
  barangay: { barangay_name: string } | { barangay_name: string }[] | null
  batches: Batch[]
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

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

type Props = { open: boolean; onClose: () => void; onSaved?: () => void }

export function AllocateStockModal({ open, onClose, onSaved }: Props) {
  const { showToast } = useToast()
  const invSWR = useSWR<{ inventories: InventoryRow[] }>(open ? '/api/inventory/stock-overview' : null, fetcher)
  const brgysSWR = useSWR<{ barangays: Barangay[] } | Barangay[]>(open ? '/api/barangays' : null, fetcher)

  const [sourceBarangayId, setSourceBarangayId] = useState('')
  const [sourceBatchId, setSourceBatchId] = useState('')
  const [targetBarangayId, setTargetBarangayId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [requestId, setRequestId] = useState(newRequestId())

  useEffect(() => {
    if (open) {
      setSourceBarangayId(''); setSourceBatchId(''); setTargetBarangayId('')
      setQuantity(''); setFormError(''); setRequestId(newRequestId())
    }
  }, [open])

  const inventories = invSWR.data?.inventories ?? []
  const barangays = Array.isArray(brgysSWR.data) ? brgysSWR.data : (brgysSWR.data?.barangays ?? [])

  // Barangays that actually have stock (so you don't pick an empty source).
  const sourceBarangays = useMemo(() => {
    const ids = new Set<number>()
    for (const inv of inventories) if ((inv.batches ?? []).some((b) => b.quantity_on_hand > 0)) ids.add(inv.barangay_id)
    return barangays.filter((b) => ids.has(b.barangay_id))
  }, [inventories, barangays])

  // Available batches at the chosen source barangay (any item), grouped visually.
  const sourceBatches = useMemo(() => {
    if (!sourceBarangayId) return []
    const bid = Number(sourceBarangayId)
    const out: Array<{ inv: InventoryRow; batch: Batch }> = []
    for (const inv of inventories) {
      if (inv.barangay_id !== bid) continue
      for (const batch of inv.batches ?? []) {
        if (batch.quantity_on_hand > 0) out.push({ inv, batch })
      }
    }
    return out.sort((a, b) => a.batch.expiry_date.localeCompare(b.batch.expiry_date))
  }, [inventories, sourceBarangayId])

  const selectedBatch = useMemo(
    () => sourceBatches.find((s) => String(s.batch.batch_id) === sourceBatchId) ?? null,
    [sourceBatches, sourceBatchId],
  )

  // Target barangay cannot equal source.
  const targetBarangays = useMemo(
    () => barangays.filter((b) => String(b.barangay_id) !== sourceBarangayId),
    [barangays, sourceBarangayId],
  )

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    if (!sourceBatchId) return setFormError('Please pick a source batch.')
    if (!targetBarangayId) return setFormError('Please pick a target barangay.')
    if (sourceBarangayId === targetBarangayId) return setFormError('Source and target barangay must differ.')
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return setFormError('Quantity must be positive.')
    const available = selectedBatch?.batch.quantity_on_hand ?? 0
    if (qty > available) return setFormError(`Only ${available} available in this batch.`)

    setSaving(true)
    try {
      const r = await fetch('/api/inventory/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_batch_id: Number(sourceBatchId),
          target_barangay_id: Number(targetBarangayId),
          quantity: qty,
          request_id: requestId,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Save failed (HTTP ${r.status}).`)
      const itemName = selectedBatch ? one(selectedBatch.inv.item)?.item_name ?? 'item' : 'item'
      showToast({ type: 'success', message: `${qty} ${itemName} (batch ${selectedBatch?.batch.batch_number}) allocated.` })
      onSaved?.()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to allocate.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-primary">
              <Send size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Allocate stock to barangay</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                PHN-only. Moves a batch from one barangay to another; batch number + expiry carry over.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5 md:items-end">
            <div className="md:col-span-2">
              <label htmlFor="al-src-brgy" className="mb-1 block text-sm font-semibold text-foreground">
                <MapPin size={13} className="mr-1 inline" /> Source barangay *
              </label>
              <select id="al-src-brgy" value={sourceBarangayId} onChange={(e) => { setSourceBarangayId(e.target.value); setSourceBatchId('') }}
                required disabled={invSWR.isLoading}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50">
                <option value="">{invSWR.isLoading ? 'Loading…' : 'Barangay with stock…'}</option>
                {sourceBarangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
              </select>
            </div>
            <div className="hidden items-center justify-center md:flex">
              <ArrowRight size={20} className="text-muted-foreground" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="al-tgt-brgy" className="mb-1 block text-sm font-semibold text-foreground">
                <MapPin size={13} className="mr-1 inline" /> Target barangay *
              </label>
              <select id="al-tgt-brgy" value={targetBarangayId} onChange={(e) => setTargetBarangayId(e.target.value)} required
                disabled={!sourceBarangayId}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50">
                <option value="">{!sourceBarangayId ? 'Pick source first' : 'Pick target barangay…'}</option>
                {targetBarangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="al-batch" className="mb-1 block text-sm font-semibold text-foreground">
              <Package size={13} className="mr-1 inline" /> Item & batch *
            </label>
            <select id="al-batch" value={sourceBatchId} onChange={(e) => setSourceBatchId(e.target.value)} required
              disabled={!sourceBarangayId}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50">
              <option value="">
                {!sourceBarangayId ? 'Pick source barangay first' : sourceBatches.length === 0 ? 'No batches with stock here' : 'Pick an item + batch…'}
              </option>
              {sourceBatches.map(({ inv, batch }) => {
                const name = one(inv.item)?.item_name ?? '?'
                const unit = one(inv.item)?.unit ?? ''
                return (
                  <option key={batch.batch_id} value={batch.batch_id}>
                    {name} · {batch.batch_number} · exp {batch.expiry_date} · {batch.quantity_on_hand} {unit}
                  </option>
                )
              })}
            </select>
            {selectedBatch && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                <Hash size={12} /> Batch <strong>{selectedBatch.batch.batch_number}</strong> ·
                expires <strong>{selectedBatch.batch.expiry_date}</strong> ·
                available <strong>{selectedBatch.batch.quantity_on_hand}</strong> {one(selectedBatch.inv.item)?.unit}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="al-qty" className="mb-1 block text-sm font-semibold text-foreground">
              <Package size={13} className="mr-1 inline" /> Quantity to allocate *
            </label>
            <input id="al-qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required
              max={selectedBatch?.batch.quantity_on_hand}
              placeholder={selectedBatch ? `≤ ${selectedBatch.batch.quantity_on_hand}` : 'Pick a batch first'}
              disabled={!selectedBatch}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50" />
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
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {saving ? 'Allocating…' : 'Allocate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
