'use client'

// INV-USR001 — Record Stock-In modal.
// Triggered from Stock Overview. PHN-only (gated server-side by inv_receive_stock).
// Form:
//   • Item (vaccine or supplement — fetched from /api/inventory/items)
//   • Barangay (fetched from /api/barangays)
//   • Batch number (required)
//   • Quantity (positive number)
//   • Expiry date (must be future)
//   • Received date (today or past)
// Submit → POST /api/inventory/stock-in with a fresh request_id (UUID) for idempotency.

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Package, Calendar, MapPin, Syringe, Pill, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'

import { Button } from '@/components/ui/button'
import { BatchNumberField, checkBatchNumber } from '@/components/inventory/batch-number-field'
import { Modal } from '@/components/ui/modal'
import { DateInput, Input, Select } from '@/components/ui/form'

type Item = { item_id: number; item_name: string; unit: string; kind: 'vaccine' | 'supplement'; code: string }
type Barangay = { barangay_id: number; barangay_name: string }

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Load failed.')
  return d
}

// Generate a UUID v4 — the backend uses it as the idempotency key for stock-in.
function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Props = { open: boolean; onClose: () => void; onSaved?: () => void }

export function StockInModal({ open, onClose, onSaved }: Props) {
  const itemsSWR = useSWR<{ items: Item[] }>(open ? '/api/inventory/items' : null, fetcher)
  const brgysSWR = useSWR<{ barangays: Barangay[] } | Barangay[]>(open ? '/api/barangays' : null, fetcher)

  const [itemId, setItemId] = useState('')
  const [barangayId, setBarangayId] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [quantity, setQuantity] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [receivedDate, setReceivedDate] = useState(today())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Keep an idempotency key stable for one dialog session; reset on open.
  const [requestId, setRequestId] = useState(newRequestId())

  useEffect(() => {
    if (open) {
      setItemId(''); setBarangayId(''); setBatchNumber(''); setQuantity('')
      setExpiryDate(''); setReceivedDate(today())
      setFormError(''); setRequestId(newRequestId())
    }
  }, [open])

  const items = itemsSWR.data?.items ?? []
  const barangays = Array.isArray(brgysSWR.data) ? brgysSWR.data : (brgysSWR.data?.barangays ?? [])
  const selectedItem = useMemo(() => items.find((i) => String(i.item_id) === itemId) ?? null, [items, itemId])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    if (!itemId) return setFormError('Please pick an item.')
    if (!barangayId) return setFormError('Please pick a barangay.')
    const batch = checkBatchNumber(batchNumber, true)
    if (batch.error) return setFormError(`Batch number: ${batch.error}`)
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return setFormError('Quantity must be positive.')
    if (!expiryDate) return setFormError('Expiry date is required.')
    if (!receivedDate) return setFormError('Received date is required.')
    if (new Date(expiryDate) <= new Date(receivedDate)) return setFormError('Expiry date must be after the received date.')

    setSaving(true)
    try {
      const r = await fetch('/api/inventory/stock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: Number(itemId),
          barangay_id: Number(barangayId),
          batch_number: batch.value,
          quantity: qty,
          expiry_date: expiryDate,
          received_date: receivedDate,
          request_id: requestId,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Save failed (HTTP ${r.status}).`)
      toast.success(`${qty} ${selectedItem?.unit ?? 'unit(s)'} of ${selectedItem?.item_name ?? 'item'} received into stock.`)
      onSaved?.()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save stock-in.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      icon={<Package />}
      title="Record stock-in"
      subtitle={<>PHN-only. Adds a received shipment to a barangay&rsquo;s inventory with batch and expiry.</>}
      onSubmit={submit}
      footer={<Button type="submit" loading={saving}>{!saving && <CheckCircle2 size={14} aria-hidden="true" />}{saving ? 'Saving…' : 'Record stock-in'}</Button>}
    >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="si-item" className="mb-1 block text-sm font-semibold text-foreground">
                <Package size={13} className="mr-1 inline" /> Item *
              </label>
              <Select id="si-item" value={itemId} onChange={(e) => setItemId(e.target.value)} required disabled={itemsSWR.isLoading}
               >
                <option value="">{itemsSWR.isLoading ? 'Loading…' : 'Select an item…'}</option>
                {items.map((it) => (
                  <option key={it.item_id} value={it.item_id}>
                    {it.kind === 'vaccine' ? '💉' : '💊'} {it.item_name} ({it.unit})
                  </option>
                ))}
              </Select>
              {selectedItem && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedItem.kind === 'vaccine' ? <Syringe size={10} className="mr-1 inline" /> : <Pill size={10} className="mr-1 inline" />}
                  Code: {selectedItem.code} · counted in {selectedItem.unit}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="si-brgy" className="mb-1 block text-sm font-semibold text-foreground">
                <MapPin size={13} className="mr-1 inline" /> Barangay *
              </label>
              <Select id="si-brgy" value={barangayId} onChange={(e) => setBarangayId(e.target.value)} required disabled={brgysSWR.isLoading}
               >
                <option value="">{brgysSWR.isLoading ? 'Loading…' : 'Select a barangay…'}</option>
                {barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BatchNumberField id="si-batch" required value={batchNumber} onChange={setBatchNumber} />
            <div>
              <label htmlFor="si-qty" className="mb-1 block text-sm font-semibold text-foreground">
                <Package size={13} className="mr-1 inline" /> Quantity *
              </label>
              <Input id="si-qty" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required
                placeholder="e.g. 50"
                />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="si-received" className="mb-1 block text-sm font-semibold text-foreground">
                <Calendar size={13} className="mr-1 inline" /> Received date *
              </label>
              <DateInput id="si-received" max={today()} value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required
                />
            </div>
            <div>
              <label htmlFor="si-expiry" className="mb-1 block text-sm font-semibold text-foreground">
                <Calendar size={13} className="mr-1 inline" /> Expiry date *
              </label>
              <DateInput id="si-expiry" min={receivedDate || today()} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required
                />
            </div>
          </div>

          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{formError}</span>
            </div>
          )}

        </div>
    </Modal>
  )
}
