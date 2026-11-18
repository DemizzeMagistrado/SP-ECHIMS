'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// NIP-USR010 — PHN review modal for a single batch request.
// Shows the full request detail and gives Approve / Return for revision (INV-REV01).
// Return asks what to change; the RHM edits and resubmits the request.

import { useState } from 'react'
import { AlertCircle, CheckCircle2, PencilLine, Package, Hash, MapPin, FileText, User, Calendar } from 'lucide-react'
import { toast } from '@/components/ui/toast'

import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/form'

export type BatchRequestRow = {
  stock_request_id: number
  request_type: string
  request_date: string
  requested_quantity: number
  status: string
  reason: string | null
  remarks: string | null
  batch_number: string | null
  target_barangay_id: number | null
  approved_at: string | null
  requested_by: string
  approved_by: string | null
  item_id: number
  item?: { item_id: number; item_name: string; unit: string | null } | { item_id: number; item_name: string; unit: string | null }[] | null
  vaccine?: { vaccine_id: number; vaccine_type: string; dose_volume: string | null; route: string | null } | { vaccine_id: number; vaccine_type: string; dose_volume: string | null; route: string | null }[] | null
  target_barangay?: { barangay_id: number; barangay_name: string } | { barangay_id: number; barangay_name: string }[] | null
  requester?: { user_id: string; user?: { email: string; full_name?: string | null } | { email: string; full_name?: string | null }[] | null } | { user_id: string; user?: { email: string; full_name?: string | null } | { email: string; full_name?: string | null }[] | null }[] | null
}

type Props = {
  open: boolean
  onClose: () => void
  onDecided?: () => void
  request: BatchRequestRow | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function formatDate(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function BatchRequestDecisionModal({ open, onClose, onDecided, request, canDecide = true }: Props & { canDecide?: boolean }) {
  const [mode, setMode] = useState<'review' | 'return'>('review')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  if (!request) return null
  const close = () => { setMode('review'); setReason(''); setFormError(''); onClose() }

  const item = one(request.item)
  const vaccine = one(request.vaccine)
  const barangay = one(request.target_barangay)
  const requester = one(request.requester)
  const requesterEmail = requester ? one(requester.user)?.full_name ?? one(requester.user)?.email ?? requester.user_id : '—'

  async function send(decision: 'APPROVE' | 'RETURN') {
    setFormError('')
    if (decision === 'RETURN' && !reason.trim()) {
      return setFormError('Say what the requester needs to change.')
    }
    setSaving(true)
    try {
      const r = await fetch('/api/vaccination/batch-requests/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_request_id: request!.stock_request_id,
          decision,
          reason: decision === 'RETURN' ? reason.trim() : undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Decision failed (HTTP ${r.status}).`)
      const msg = decision === 'APPROVE'
        ? `Request #${request!.stock_request_id} approved. ${d.warning ?? 'Inventory updated.'}`
        : `Request #${request!.stock_request_id} returned for revision.`
      toast.success(msg)
      onDecided?.()
      // Reset local UI
      setMode('review'); setReason(''); setFormError('')
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to process decision.')
    } finally {
      setSaving(false)
    }
  }

  const isPending = request.status === 'PENDING' && canDecide

  return (
    <Modal
      open={open}
      onClose={close}
      busy={saving}
      size="lg"
      icon={<Package />}
      title={`Batch request #${request.stock_request_id}`}
      subtitle={<>Submitted {formatDate(request.request_date)} · Status <StatusChip status={request.status} /></>}
      cancelLabel={isPending ? 'Cancel' : 'Close'}
      footer={!isPending ? null : mode === 'review' ? (
        <>
          <Button variant="outline" onClick={() => setMode('return')} disabled={saving}><PencilLine size={14} aria-hidden="true" /> Return for revision</Button>
          <Button onClick={() => send('APPROVE')} loading={saving}>{!saving && <CheckCircle2 size={14} aria-hidden="true" />}{saving ? 'Approving…' : 'Approve'}</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => { setMode('review'); setReason(''); setFormError('') }} disabled={saving}>Back</Button>
          <Button onClick={() => send('RETURN')} loading={saving} disabled={!reason.trim()}>{!saving && <PencilLine size={14} aria-hidden="true" />}{saving ? 'Returning…' : 'Return for revision'}</Button>
        </>
      )}
    >
        <div className="space-y-4">
          {/* Request details grid */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-2">
            <DetailRow icon={<Package size={13} />} label="Vaccine" value={item?.item_name ?? vaccine?.vaccine_type ?? '—'} sub={vaccine?.vaccine_type ? `Code: ${vaccine.vaccine_type}` : null} />
            <DetailRow icon={<Hash size={13} />} label="Batch number" value={request.batch_number ?? '—'} />
            <DetailRow icon={<Package size={13} />} label="Quantity requested" value={`${request.requested_quantity} ${item?.unit ?? 'dose(s)'}`} />
            <DetailRow icon={<MapPin size={13} />} label="Target barangay" value={barangay?.barangay_name ?? '—'} />
            <DetailRow icon={<User size={13} />} label="Requested by" value={requesterEmail} />
            <DetailRow icon={<Calendar size={13} />} label="Request date" value={request.request_date} />
            {request.remarks && (
              <div className="md:col-span-2">
                <DetailRow icon={<FileText size={13} />} label="Remarks" value={request.remarks} />
              </div>
            )}
            {request.reason && (
              <div className="md:col-span-2">
                <DetailRow icon={<FileText size={13} />} label={request.status === 'NEEDS_REVISION' ? 'What the PHN asked to change' : 'PHN note'} value={request.reason} />
              </div>
            )}
            {request.approved_at && (
              <div className="md:col-span-2">
                <DetailRow icon={<Calendar size={13} />} label="Decided at" value={formatDate(request.approved_at)} />
              </div>
            )}
          </div>

          {/* Approval impact note */}
          {isPending && mode === 'review' && (
            <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                Approving will add <strong>{request.requested_quantity}</strong> dose(s) of <strong>{item?.item_name ?? 'this vaccine'}</strong> to
                <strong> {barangay?.barangay_name ?? 'the target barangay'}</strong>&rsquo;s inventory and log a STOCK_IN transaction for audit.
              </span>
            </div>
          )}

          {/* What to change, for Return for revision */}
          {isPending && mode === 'return' && (
            <div>
              <label htmlFor="br-reason" className="mb-1 block text-sm font-semibold text-foreground">
                What needs to change *
              </label>
              <Textarea
                id="br-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. The batch number does not match the label / reduce the quantity to 50"
              />
              <p className="mt-1 text-xs text-muted-foreground">The RHM sees this, edits the request and resubmits it.</p>
            </div>
          )}

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

function DetailRow({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string | null }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  return <StatusBadge status={status} className="px-2 py-0.5" />
}