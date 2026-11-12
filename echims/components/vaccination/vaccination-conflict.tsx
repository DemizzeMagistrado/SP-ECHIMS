'use client'

// A vaccination draft (offline or just submitted) matches a dose that is already saved for the
// same child, vaccine and dose number. Show both versions side by side and let the user choose:
// - Keep saved: delete this draft; the saved record stays as it is.
// - Keep mine: copy this draft's date, batch, site and remarks onto the saved record (only while
//   it is still waiting for approval and the user may edit it), then delete the draft.

import { useState } from 'react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { RecordConflict } from '@/components/children/record-conflict'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { discardBlockedVaccinationDraft, type VaccinationConflict as Conflict, type VaccinationPayload } from '@/lib/vaccination-offline'

const fmt = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '')

export function VaccinationConflict({ ownerId, payload, conflict, label, canEditOthers, onResolved }: {
  ownerId: string
  payload: VaccinationPayload
  conflict: Conflict
  /** e.g. "Juan Dela Cruz · Pentavalent dose 2" */
  label: string
  /** PHN / Admin may edit any pending record in scope. */
  canEditOthers: boolean
  onResolved: (kept: 'mine' | 'saved') => void
}) {
  const [busy, setBusy] = useState<'mine' | 'saved' | null>(null)
  const canKeepMine = conflict.status === 'PENDING' && (conflict.recorded_by_me || canEditOthers)

  async function keepSaved() {
    setBusy('saved')
    try {
      await discardBlockedVaccinationDraft(ownerId, payload.client_request_id)
      toast.success('Kept the saved record. Your draft was removed from this device.')
      onResolved('saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unable to remove the draft. Try again.')
    } finally { setBusy(null) }
  }

  async function keepMine() {
    if (!navigator.onLine) { toast.warning('Connect to the internet to update the saved record.'); return }
    setBusy('mine')
    try {
      const r = await fetch('/api/vaccination/record-edit', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: conflict.vaccination_record_id, vaccination_date: payload.vaccination_date, batch_number: payload.batch_number, vaccination_site: payload.vaccination_site, remarks: payload.remarks }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to update the saved record.')
      await discardBlockedVaccinationDraft(ownerId, payload.client_request_id)
      toast.success('Saved record updated with your version. It still needs PHN approval.')
      onResolved('mine')
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : 'Unable to update the saved record.'} Your draft is still on this device.`)
    } finally { setBusy(null) }
  }

  return (
    <RecordConflict
      title={`This dose is already saved (record #${conflict.vaccination_record_id})`}
      description={<>{label}. Someone (or this device earlier) saved the same dose. Compare the two versions and choose which one to keep. Nothing is lost until you choose.</>}
      rows={[
        { field: 'date', label: 'Date given', yours: fmt(payload.vaccination_date), saved: fmt(conflict.vaccination_date) },
        { field: 'batch', label: 'Batch number', yours: payload.batch_number ?? '', saved: conflict.batch_number ?? '' },
        { field: 'site', label: 'Vaccination site', yours: payload.vaccination_site ?? '', saved: conflict.vaccination_site ?? '' },
        { field: 'remarks', label: 'Remarks', yours: payload.remarks ?? '', saved: conflict.remarks ?? '' },
        { field: 'status', label: 'Status', yours: 'Not saved yet', saved: conflict.status === 'APPROVED' ? 'Approved' : 'Waiting for PHN approval' },
      ]}
      note={canKeepMine ? undefined : conflict.status === 'APPROVED'
        ? 'The saved dose is already approved, so it cannot be replaced here. If it is wrong, ask the PHN to correct it.'
        : 'Only the person who recorded the saved dose, or a PHN, can replace it.'}
      actions={<>
        <Button loading={busy === 'mine'} disabled={!canKeepMine || busy !== null} onClick={() => void keepMine()}>Keep mine</Button>
        <Button variant="secondary" loading={busy === 'saved'} disabled={busy !== null} onClick={() => void keepSaved()}>Keep saved</Button>
      </>}
    />
  )
}
