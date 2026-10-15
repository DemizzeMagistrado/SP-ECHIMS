'use client'

// INV-USR004 — Log usage/waste modal (RHM-only, enforced server-side).
// Form:
//   • Source batch (from /api/inventory/stock-overview, scoped by RLS to the
//     RHM's barangay) — shows available quantity + expiry when picked
//   • Type: USAGE | WASTE (radio)
//   • Quantity (≤ available)
//   • Reason (required when WASTE)
// Submit → sendOrQueueUsage() so a network failure stashes to localStorage
// and replays on next load.

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { X, Package, Hash, MapPin, AlertCircle, Loader2, PackageMinus, Trash2, WifiOff, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { newClientRequestId, sendOrQueueUsage } from '@/lib/inventory-offline'

type Batch = { batch_id: number; batch_number: string; expiry_date: string; quantity_on_hand: number }
type InventoryRow = {
  inventory_id: number; item_id: number; barangay_id: number; quantity_on_hand: number
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

type Props = { open: boolean; onClose: () => void; onSaved?: () => void }

export function LogUsageModal({ open, onClose, onSaved }: Props) {
  const { showToast } = useToast()
  const invSWR = useSWR<{ inventories: InventoryRow[] }>(open ? '/api/inventory/stock-overview' : null, fetcher)

  const [batchId, setBatchId] = useState('')
  const [subtype, setSubtype] = useState<'USAGE' | 'WASTE'>('USAGE')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [requestId, setRequestId] = useState(newClientRequestId())

  useEffect(() => {
    if (open) {
      setBatchId(''); setSubtype('USAGE'); setQuantity(''); setReason('')
      setFormError(''); setRequestId(newClientRequestId())
    }
  }, [open])

  // Flatten (inventory × batch) into pickable rows — only batches with stock.
  const options = useMemo(() => {
    const inv = invSWR.data?.inventories ?? []
    const flat: Array<{ key: string; label: string; batch: Batch; inv: InventoryRow }> = []
    for (const row of inv) {
      for (const b of row.batches ?? []) {
        if (b.quantity_on_hand <= 0) continue
        const item = one(row.item)
        const brgy = one(row.barangay)
        flat.push({
          key: String(b.batch_id),
          label: `${item?.item_name ?? '?'} · ${b.batch_number} · exp ${b.expiry_date} · ${b.quantity_on_hand} ${item?.unit ?? ''} @ ${brgy?.barangay_name ?? '?'}`,
          batch: b, inv: row,
        })
      }
    }
    return flat
  }, [invSWR.data])

  const selected = options.find((o) => o.key === batchId) ?? null

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    if (!batchId) return setFormError('Please pick a batch.')
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return setFormError('Quantity must be positive.')
    if (selected && qty > selected.batch.quantity_on_hand) {
      return setFormError(`Only ${selected.batch.quantity_on_hand} available in this batch.`)
    }
    if (subtype === 'WASTE' && !reason.trim()) return setFormError('A reason is required when logging waste.')

    setSaving(true)
    try {
      const r = await sendOrQueueUsage({
        source_batch_id: Number(batchId),
        quantity: qty,
        subtype,
        reason: reason.trim() || undefined,
        request_id: requestId,
      })
      const label = selected ? `${qty} ${one(selected.inv.item)?.unit ?? ''} of ${one(selected.inv.item)?.item_name ?? 'item'} (batch ${selected.batch.batch_number})` : `${qty} units`
      if (r.sent) {
        showToast({ type: 'success', message: `${subtype === 'USAGE' ? 'Usage' : 'Waste'} logged: ${label}.` })
      } else {
        showToast({ type: 'success', message: `Offline — queued ${subtype.toLowerCase()} entry. It will auto-sync when the connection is back.` })
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save.')
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
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${subtype === 'WASTE' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
              {subtype === 'WASTE' ? <Trash2 size={18} /> : <PackageMinus size={18} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Log stock usage or waste</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                RHM-only. Deducts the quantity from the picked batch and the barangay&rsquo;s aggregate on hand.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-6">
          {/* Type radios */}
          <div>
            <span className="mb-1 block text-sm font-semibold text-foreground">Type *</span>
            <div className="flex gap-2">
              {(['USAGE', 'WASTE'] as const).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => setSubtype(t)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    subtype === t
                      ? (t === 'WASTE' ? 'border-rose-600 bg-rose-50 text-rose-700' : 'border-amber-600 bg-amber-50 text-amber-700')
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}>
                  {t === 'WASTE' ? <Trash2 size={14} /> : <PackageMinus size={14} />} {t === 'WASTE' ? 'Waste' : 'Used'}
                </button>
              ))}
            </div>
          </div>

          {/* Batch selector */}
          <div>
            <label htmlFor="lu-batch" className="mb-1 block text-sm font-semibold text-foreground">
              <Package size={13} className="mr-1 inline" /> Item & batch *
            </label>
            <select id="lu-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)} required disabled={invSWR.isLoading}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50">
              <option value="">{invSWR.isLoading ? 'Loading…' : options.length === 0 ? 'No batches with stock' : 'Pick a batch…'}</option>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {selected && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                <Hash size={12} /> <strong>{selected.batch.batch_number}</strong> ·
                exp <strong>{selected.batch.expiry_date}</strong> ·
                <MapPin size={11} /> {one(selected.inv.barangay)?.barangay_name} ·
                available <strong>{selected.batch.quantity_on_hand}</strong> {one(selected.inv.item)?.unit}
              </div>
            )}
          </div>

          {/* Qty */}
          <div>
            <label htmlFor="lu-qty" className="mb-1 block text-sm font-semibold text-foreground">
              Quantity *
            </label>
            <input id="lu-qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required
              max={selected?.batch.quantity_on_hand} disabled={!selected}
              placeholder={selected ? `≤ ${selected.batch.quantity_on_hand}` : 'Pick a batch first'}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50" />
          </div>

          {/* Reason — required for WASTE */}
          <div>
            <label htmlFor="lu-reason" className="mb-1 block text-sm font-semibold text-foreground">
              Reason {subtype === 'WASTE' && <span className="text-rose-600">*</span>}
              {subtype === 'USAGE' && <span className="text-xs font-normal text-muted-foreground"> (optional)</span>}
            </label>
            <textarea id="lu-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder={subtype === 'WASTE' ? 'e.g. Expired cold-chain break, broken vial' : 'e.g. Immunization campaign Oct 14'}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-900">
            <WifiOff size={12} className="mt-0.5 shrink-0" />
            <span>No connection? The entry is saved locally and auto-syncs when you&rsquo;re back online.</span>
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
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                subtype === 'WASTE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saving ? 'Saving…' : subtype === 'WASTE' ? 'Log waste' : 'Log usage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
