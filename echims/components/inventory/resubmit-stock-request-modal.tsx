'use client'
// INV-REV01 — the requester edits a stock request the PHN returned for revision and resubmits it.
// Shared by replenishment, vaccine batch and supplement batch requests.
import { useState, type FormEvent } from 'react'
import { AlertCircle, PencilLine } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Textarea } from '@/components/ui/form'

export type ReturnedStockRequest = {
  stock_request_id: number
  request_type: 'REPLENISHMENT' | 'VACCINE_BATCH' | 'SUPPLEMENT_BATCH' | string
  requested_quantity: number
  remarks: string | null
  reason: string | null
  batch_number?: string | null
  item_name?: string | null
  unit?: string | null
}

/** The create RPC appends '[req:UUID]' to replenishment remarks for idempotency; it is not user text. */
const stripMarker = (s: string | null) => (s ?? '').replace(/\s*\[req:[0-9a-f-]{36}\]\s*/i, '').trim()

export function ResubmitStockRequestModal({ request, onClose, onDone }: {
  request: ReturnedStockRequest
  onClose: () => void
  onDone: () => void
}) {
  const vaccine = request.request_type === 'VACCINE_BATCH'
  const [quantity, setQuantity] = useState(String(request.requested_quantity))
  const [remarks, setRemarks] = useState(stripMarker(request.remarks))
  const [batch, setBatch] = useState(request.batch_number ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = quantity !== String(request.requested_quantity) || remarks !== stripMarker(request.remarks) || batch !== (request.batch_number ?? '')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) return setError('Enter a whole quantity greater than 0.')
    if (vaccine && !batch.trim()) return setError('Enter the batch number.')
    if (!navigator.onLine) return setError('You are offline. Reconnect to resubmit; nothing was changed.')
    setSaving(true)
    setError('')
    try {
      const r = await fetch('/api/inventory/stock-requests/resubmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_request_id: request.stock_request_id, quantity: qty, remarks: remarks.trim() || null, batch_number: vaccine ? batch.trim() : null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to resubmit this request.')
      toast.success(`Request #${request.stock_request_id} resubmitted for PHN review.`)
      onDone()
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'Unable to resubmit this request.'} Nothing was changed.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      size="form"
      onClose={onClose}
      busy={saving}
      dirty={dirty}
      onSubmit={submit}
      icon={<PencilLine />}
      title={`Edit and resubmit request #${request.stock_request_id}`}
      subtitle={request.item_name ? `${request.item_name}${request.unit ? ` · ${request.unit}` : ''}` : undefined}
      footer={<Button type="submit" loading={saving}>Resubmit for review</Button>}
    >
      <div className="space-y-4">
        {request.reason && (
          <div className="rounded-xl border border-[#F3D9A4] bg-[#FFF4DB] p-3 text-sm text-[#5C3F08]">
            <p className="text-xs font-semibold uppercase tracking-[0.5px] text-[#9C6B10]">What the PHN asked to change</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{request.reason}</p>
          </div>
        )}
        <Field label="Quantity" required>
          <Input type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={saving} />
        </Field>
        {vaccine && (
          <Field label="Batch number" required>
            <Input value={batch} onChange={(e) => setBatch(e.target.value)} disabled={saving} />
          </Field>
        )}
        <Field label="Remarks">
          <Textarea rows={3} maxLength={2000} value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={saving} placeholder="What changed, or why this quantity" />
        </Field>
        <p className="text-xs text-brand-muted">Resubmitting sends the request back to Pending for the PHN to review again.</p>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />{error}
          </p>
        )}
      </div>
    </Modal>
  )
}
