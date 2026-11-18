'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// NIP-USR010 — Batch Request create modal (RHM / Admin flow).
// Opens from the Batch Requests tab's "New request" button. RHM fills in:
//   • Vaccine (from /api/vaccines — active catalog)
//   • Target barangay (from /api/barangays — RLS-scoped)
//   • Batch number (REQUIRED)
//   • Quantity (positive integer, usually doses)
//   • Remarks (optional)
// Submit → POST /api/vaccination/batch-requests → appears in PHN inbox as PENDING.

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { AlertCircle, Syringe, MapPin, Package, FileText } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Spinner } from '@/components/brand/logo-loader'
import { Button } from '@/components/ui/button'
import { BatchNumberField, checkBatchNumber } from '@/components/inventory/batch-number-field'
import { Modal } from '@/components/ui/modal'
import { Input, Select, Textarea } from '@/components/ui/form'

type VaccineOption = {
  vaccine_id: number
  vaccine_type: string
  item?: { item_name?: string } | { item_name?: string }[] | null
}
type BarangayOption = { barangay_id: number; barangay_name: string }

type Props = {
  open: boolean
  onClose: () => void
  onSaved?: () => void
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

export function BatchRequestModal({ open, onClose, onSaved }: Props) {
  const vaccinesSWR = useSWR<{ vaccines: VaccineOption[] }>(open ? '/api/vaccines' : null, fetcher)
  const barangaysSWR = useSWR<{ barangays: BarangayOption[] } | BarangayOption[]>(open ? '/api/barangays' : null, fetcher)

  const [vaccineId, setVaccineId] = useState<string>('')
  const [barangayId, setBarangayId] = useState<string>('')
  const [batchNumber, setBatchNumber] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('')
  const [remarks, setRemarks] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string>('')

  useEffect(() => {
    if (open) {
      setVaccineId(''); setBarangayId(''); setBatchNumber('')
      setQuantity(''); setRemarks(''); setFormError('')
    }
  }, [open])

  // Handle both response shapes ({barangays:[...]} or [...]) just in case.
  const barangays: BarangayOption[] = Array.isArray(barangaysSWR.data)
    ? barangaysSWR.data
    : (barangaysSWR.data?.barangays ?? [])
  const vaccines = vaccinesSWR.data?.vaccines ?? []

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    if (!vaccineId) return setFormError('Please pick a vaccine.')
    if (!barangayId) return setFormError('Please pick a target barangay.')
    const batch = checkBatchNumber(batchNumber, true)
    if (batch.error) return setFormError(`Batch number: ${batch.error}`)
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return setFormError('Quantity must be a positive number.')

    setSaving(true)
    try {
      const r = await fetch('/api/vaccination/batch-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaccine_id: Number(vaccineId),
          target_barangay_id: Number(barangayId),
          batch_number: batch.value,
          requested_quantity: qty,
          remarks: remarks.trim() || undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Save failed (HTTP ${r.status}).`)
      toast.success(`Batch request #${d.stock_request_id} submitted — awaiting PHN review.`)
      onSaved?.()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save batch request.')
    } finally {
      setSaving(false)
    }
  }


  const selectedVaccine = vaccines.find((v) => String(v.vaccine_id) === vaccineId) ?? null

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      icon={<Package />}
      title="New vaccine batch request"
      subtitle={<>Request a vaccine batch to be allocated to a barangay. Submits as <strong>PENDING</strong> for PHN review.</>}
      onSubmit={submit}
      footer={<>

            <Button
              type="submit"
              disabled={saving}
            >
              {saving ? <Spinner /> : <Package size={14} />}
              {saving ? 'Submitting…' : 'Submit request'}
            </Button>
      </>}
    >
        <div className="space-y-5">
          {/* Vaccine + Barangay row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="br-vaccine" className="mb-1 block text-sm font-semibold text-foreground">
                <Syringe size={13} className="mr-1 inline" /> Vaccine *
              </label>
              <Select
                id="br-vaccine"
                value={vaccineId}
                onChange={(e) => setVaccineId(e.target.value)}
                required
                disabled={vaccinesSWR.isLoading}
              >
                <option value="">
                  {vaccinesSWR.isLoading ? 'Loading…' : 'Select a vaccine…'}
                </option>
                {vaccines.map((v) => {
                  const name = one(v.item)?.item_name ?? v.vaccine_type
                  return <option key={v.vaccine_id} value={v.vaccine_id}>{name} ({v.vaccine_type})</option>
                })}
              </Select>
              {selectedVaccine && (
                <p className="mt-1 text-xs text-muted-foreground">Code: {selectedVaccine.vaccine_type}</p>
              )}
            </div>
            <div>
              <label htmlFor="br-barangay" className="mb-1 block text-sm font-semibold text-foreground">
                <MapPin size={13} className="mr-1 inline" /> Target barangay *
              </label>
              <Select
                id="br-barangay"
                value={barangayId}
                onChange={(e) => setBarangayId(e.target.value)}
                required
                disabled={barangaysSWR.isLoading}
              >
                <option value="">
                  {barangaysSWR.isLoading ? 'Loading…' : 'Select a barangay…'}
                </option>
                {barangays.map((b) => (
                  <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Batch + Quantity row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BatchNumberField id="br-batch" required value={batchNumber} onChange={setBatchNumber} />
            <div>
              <label htmlFor="br-qty" className="mb-1 block text-sm font-semibold text-foreground">
                <Package size={13} className="mr-1 inline" /> Quantity (doses) *
              </label>
              <Input
                id="br-qty"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                placeholder="50"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label htmlFor="br-remarks" className="mb-1 block text-sm font-semibold text-foreground">
              <FileText size={13} className="mr-1 inline" /> Remarks <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="br-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Why is this batch needed? (urgency, expiring stock, scheduled campaign…)"
            />
          </div>

          {/* Error */}
          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Actions */}
        </div>
    </Modal>
  )
}