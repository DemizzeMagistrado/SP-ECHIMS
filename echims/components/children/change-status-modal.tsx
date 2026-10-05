'use client'

// Modal for changing a child's record status (ACTIVE / INACTIVE / MOVED / LOST / DECEASED).
// Opens from the profile page. Posts to /api/children/[childId]/movement which flips
// child.status and, where applicable, logs an entry in child_movement for the audit trail.
// Status-aware fields:
//   MOVED    → optional new address + optional target household id (future: dropdown)
//   LOST     → reason + remarks
//   DECEASED → date of death + reason (sensitive — minimal UI)
//   INACTIVE → reason only
//   ACTIVE   → re-activation note (reason optional)

import { FormEvent, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'

type ChildStatus = 'ACTIVE' | 'INACTIVE' | 'MOVED' | 'LOST' | 'DECEASED'

const STATUS_META: Record<ChildStatus, { label: string; description: string; tone: 'default' | 'warning' | 'danger' }> = {
  ACTIVE: { label: 'Active', description: 'The child is currently being monitored at this barangay.', tone: 'default' },
  INACTIVE: { label: 'Inactive', description: 'The child is temporarily not being monitored. Record is preserved.', tone: 'default' },
  MOVED: { label: 'Moved', description: 'The child has relocated — either outside the catchment or to another household.', tone: 'warning' },
  LOST: { label: 'Lost to follow-up', description: 'The child\'s whereabouts are unknown and they could not be reached.', tone: 'warning' },
  DECEASED: { label: 'Deceased', description: 'The child has passed away. This is a terminal status and should be used with care.', tone: 'danger' },
}

export function ChangeStatusModal({ childId, currentStatus, childName, onClose, onSaved, onError }: {
  childId: number
  currentStatus: string
  childName: string
  onClose: () => void
  onSaved: () => void
  onError?: (message: string) => void
}) {
  // Default to empty so the user is forced to deliberately pick a NEW status
  // instead of accidentally clicking "Mark as <current>" (which the API rejects).
  const [newStatus, setNewStatus] = useState<ChildStatus | ''>('')
  const [reason, setReason] = useState('')
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10))
  const [newAddress, setNewAddress] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const meta = newStatus ? STATUS_META[newStatus] : null
  const requiresReason = Boolean(newStatus) && newStatus !== 'ACTIVE'
  const showAddressField = newStatus === 'MOVED'
  const dateLabel = newStatus === 'DECEASED' ? 'Date of death' : newStatus === 'MOVED' ? 'Date moved' : 'Date'
  // Disable save until a different status is picked AND, when required, a reason is filled.
  const canSubmit = Boolean(newStatus) && newStatus !== currentStatus && (!requiresReason || reason.trim() !== '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    if (!newStatus) {
      const msg = 'Please choose a new status first.'
      setMessage(msg); onError?.(msg); return
    }
    if (newStatus === currentStatus) {
      const msg = `This child is already marked ${currentStatus}.`
      setMessage(msg); onError?.(msg); return
    }
    if (requiresReason && !reason.trim()) {
      const msg = 'A reason is required when changing status away from Active.'
      setMessage(msg); onError?.(msg); return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/children/${childId}/movement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_status: newStatus,
          reason: reason.trim(),
          movement_date: movementDate,
          new_address: showAddressField ? newAddress.trim() : undefined,
          remarks: remarks.trim(),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Status change failed (HTTP ${r.status}).`)
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to change the child\'s status.'
      setMessage(msg); onError?.(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
      <form onSubmit={submit} className="mx-auto max-w-xl space-y-5 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Change child status</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {childName} · currently <span className="font-semibold">{currentStatus}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X /></button>
        </div>

        {message && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}

        <label className="grid gap-1 text-sm">
          <span className="font-medium">New status *</span>
          <select
            required
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as ChildStatus | '')}
            className="h-10 rounded-lg border border-border bg-white px-3"
          >
            <option value="">Choose a new status...</option>
            {(Object.keys(STATUS_META) as ChildStatus[]).map((s) => (
              <option key={s} value={s} disabled={s === currentStatus}>
                {STATUS_META[s].label}{s === currentStatus ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>

        {meta && (
          <div className={`rounded-xl border p-3 text-sm ${
            meta.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-800' :
            meta.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' :
            'border-border bg-muted text-muted-foreground'
          }`}>
            <div className="flex items-start gap-2">
              {meta.tone !== 'default' && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
              <span>{meta.description}</span>
            </div>
          </div>
        )}

        <label className="grid gap-1 text-sm">
          <span className="font-medium">{dateLabel}</span>
          <input
            type="date"
            value={movementDate}
            onChange={(e) => setMovementDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="h-10 rounded-lg border border-border px-3"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Reason{requiresReason ? ' *' : ''}</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={newStatus === 'DECEASED' ? 'Cause / brief note' : newStatus === 'LOST' ? 'e.g. family moved without informing, no contact for 3 months' : newStatus === 'MOVED' ? 'e.g. relocated to Manila for work' : 'Short reason for the change'}
            className="h-10 rounded-lg border border-border px-3"
            required={requiresReason}
          />
        </label>

        {showAddressField && (
          <label className="grid gap-1 text-sm">
            <span className="font-medium">New address</span>
            <input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="New residence, if known"
              className="h-10 rounded-lg border border-border px-3"
            />
            <span className="text-xs text-muted-foreground">If relocating within the system to another household, mention the household number here. Household linking UI will come in a future update.</span>
          </label>
        )}

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Additional remarks (optional)</span>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Any other context — e.g. source of the information, follow-up actions"
            className="min-h-20 rounded-lg border border-border p-3"
          />
        </label>

        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2">Cancel</button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className={`rounded-lg px-5 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed ${meta?.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'}`}
          >
            {saving ? 'Saving...' : meta ? `Mark as ${meta.label}` : 'Save status change'}
          </button>
        </div>
      </form>
    </div>
  )
}