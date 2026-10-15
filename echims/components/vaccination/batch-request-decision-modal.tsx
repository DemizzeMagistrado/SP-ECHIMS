'use client'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// NIP-USR010 — PHN review modal for a single batch request.
// Shows the full request detail and gives Approve / Reject buttons.
// Reject prompts for a reason inline before confirming.

import { useState } from 'react'
import { X, AlertCircle, Loader2, CheckCircle2, XCircle, Package, Hash, MapPin, FileText, User, Calendar } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

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
  requester?: { user_id: string; user?: { email: string } | { email: string }[] | null } | { user_id: string; user?: { email: string } | { email: string }[] | null }[] | null
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

export function BatchRequestDecisionModal({ open, onClose, onDecided, request }: Props) {
  const { showToast } = useToast()
  const [mode, setMode] = useState<'review' | 'reject'>('review')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  if (!open || !request) return null

  const item = one(request.item)
  const vaccine = one(request.vaccine)
  const barangay = one(request.target_barangay)
  const requester = one(request.requester)
  const requesterEmail = requester ? one(requester.user)?.email ?? requester.user_id : '—'

  async function send(decision: 'APPROVE' | 'REJECT') {
    setFormError('')
    if (decision === 'REJECT' && !reason.trim()) {
      return setFormError('A reason is required when rejecting.')
    }
    setSaving(true)
    try {
      const r = await fetch('/api/vaccination/batch-requests/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_request_id: request!.stock_request_id,
          decision,
          reason: decision === 'REJECT' ? reason.trim() : undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Decision failed (HTTP ${r.status}).`)
      const msg = decision === 'APPROVE'
        ? `Request #${request!.stock_request_id} approved. ${d.warning ?? 'Inventory updated.'}`
        : `Request #${request!.stock_request_id} rejected.`
      showToast({ type: 'success', message: msg })
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

  const isPending = request.status === 'PENDING'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-primary">
              <Package size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Batch request #{request.stock_request_id}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Submitted {formatDate(request.request_date)} · Status <StatusChip status={request.status} />
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { setMode('review'); setReason(''); setFormError(''); onClose() }} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6">
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
                <DetailRow icon={<FileText size={13} />} label="Decision reason" value={request.reason} />
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

          {/* Reject reason input */}
          {isPending && mode === 'reject' && (
            <div>
              <label htmlFor="br-reason" className="mb-1 block text-sm font-semibold text-foreground">
                Reason for rejection *
              </label>
              <textarea
                id="br-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Batch already allocated / insufficient central stock / duplicate request"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">Shown to the RHM in their requests list.</p>
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
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            {!isPending ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Close
              </button>
            ) : mode === 'review' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode('reject')}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  <XCircle size={14} /> Reject
                </button>
                <button
                  type="button"
                  onClick={() => send('APPROVE')}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {saving ? 'Approving…' : 'Approve'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setMode('review'); setReason(''); setFormError('') }}
                  disabled={saving}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => send('REJECT')}
                  disabled={saving || !reason.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  {saving ? 'Rejecting…' : 'Confirm reject'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
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
  const map: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-rose-100 text-rose-800',
    COMPLETED: 'bg-sky-100 text-sky-800',
    CANCELLED: 'bg-slate-200 text-slate-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  )
}