'use client'

// INV-USR005 — PHN approve/reject replenishment decision modal.
// Simple 2-step flow: Review (shows request details + Approve/Reject buttons)
// → Reject prompts for a reason. Approve just flips status; PHN then uses the
// existing Allocate Stock flow (USR003) to fulfill it, optionally passing the
// request id for linkage.

import { useState } from 'react'
import { X, AlertCircle, Loader2, CheckCircle2, XCircle, Package, MapPin, User, Calendar, FileText } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

export type ReplenishmentRequest = {
  stock_request_id: number
  request_date: string
  requested_quantity: number
  status: string
  remarks: string | null
  reason: string | null
  item_id: number
  target_barangay_id: number
  requested_by: string
  item?: { item_name: string; unit: string } | { item_name: string; unit: string }[] | null
  target_barangay?: { barangay_name: string } | { barangay_name: string }[] | null
  requester?: { full_name?: string; email?: string } | null
}

type Props = {
  open: boolean
  onClose: () => void
  onDecided?: () => void
  request: ReplenishmentRequest | null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function stripReqMarker(s: string | null): string {
  // The create RPC appends '[req:UUID]' to remarks for idempotency. Hide it
  // from PHN view since it's an internal marker.
  if (!s) return ''
  return s.replace(/\s*\[req:[0-9a-f-]{36}\]\s*/i, '').trim()
}

export function ReplenishmentDecisionModal({ open, onClose, onDecided, request }: Props) {
  const { showToast } = useToast()
  const [mode, setMode] = useState<'review' | 'reject'>('review')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  if (!open || !request) return null

  const item = one(request.item)
  const brgy = one(request.target_barangay)
  const isPending = request.status === 'PENDING'

  async function send(decision: 'APPROVE' | 'REJECT') {
    setFormError('')
    if (decision === 'REJECT' && !reason.trim()) return setFormError('A reason is required when rejecting.')
    setSaving(true)
    try {
      const r = await fetch('/api/inventory/replenishment-decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock_request_id: request!.stock_request_id,
          decision,
          reason: decision === 'REJECT' ? reason.trim() : undefined,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      showToast({
        type: 'success',
        message: decision === 'APPROVE'
          ? `Request #${request!.stock_request_id} approved — use Stock Allocation to fulfill it.`
          : `Request #${request!.stock_request_id} rejected.`,
      })
      onDecided?.()
      setMode('review'); setReason(''); setFormError('')
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to process decision.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-primary">
              <Package size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Replenishment request #{request.stock_request_id}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Submitted {request.request_date} · <StatusChip status={request.status} />
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { setMode('review'); setReason(''); setFormError(''); onClose() }} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/30 p-4 md:grid-cols-2">
            <Row icon={<Package size={13} />} label="Item" value={item?.item_name ?? '—'} />
            <Row icon={<Package size={13} />} label="Quantity requested" value={`${request.requested_quantity} ${item?.unit ?? ''}`} />
            <Row icon={<MapPin size={13} />} label="Receiving barangay" value={brgy?.barangay_name ?? '—'} />
            <Row icon={<User size={13} />} label="Requested by" value={request.requester?.full_name ?? request.requester?.email ?? request.requested_by} />
            <Row icon={<Calendar size={13} />} label="Request date" value={request.request_date} />
            {stripReqMarker(request.remarks) && (
              <div className="md:col-span-2">
                <Row icon={<FileText size={13} />} label="Remarks" value={stripReqMarker(request.remarks)} />
              </div>
            )}
            {request.reason && (
              <div className="md:col-span-2">
                <Row icon={<FileText size={13} />} label="Decision reason" value={request.reason} />
              </div>
            )}
          </div>

          {isPending && mode === 'review' && (
            <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                Approving flips this request to <strong>APPROVED</strong>. To actually move stock, open
                <strong> Stock Allocation</strong> and allocate to <strong>{brgy?.barangay_name}</strong>.
                The allocation will link back to this request.
              </span>
            </div>
          )}

          {isPending && mode === 'reject' && (
            <div>
              <label htmlFor="rd-reason" className="mb-1 block text-sm font-semibold text-foreground">
                Reason for rejection *
              </label>
              <textarea id="rd-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                placeholder="e.g. Central stock insufficient / request duplicate / insufficient justification"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
              <p className="mt-1 text-xs text-muted-foreground">Shown to the RHM in their request list.</p>
            </div>
          )}

          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            {!isPending ? (
              <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">Close</button>
            ) : mode === 'review' ? (
              <>
                <button type="button" onClick={() => setMode('reject')} disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                  <XCircle size={14} /> Reject
                </button>
                <button type="button" onClick={() => send('APPROVE')} disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {saving ? 'Approving…' : 'Approve'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setMode('review'); setReason(''); setFormError('') }} disabled={saving}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">Back</button>
                <button type="button" onClick={() => send('REJECT')} disabled={saving || !reason.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
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

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
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
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status] ?? 'bg-slate-100 text-slate-700'}`}>{status}</span>
}
