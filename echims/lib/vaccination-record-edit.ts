// Shared validation for editing an administered-vaccination record (record-edit and
// record-resubmit): only the whitelisted fields, same rules as when recording.

import { loadBatchRule } from '@/lib/batch-rule-server'
import { batchNumberError, isVaccinationSite, normalizeBatchNumber } from '@/lib/vaccination-config'

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type RecordEdits = {
  vaccination_date?: string
  batch_number?: string | null
  vaccination_site?: string | null
  remarks?: string | null
}

/** Statuses a record can still be edited in: waiting for approval, or returned for correction. */
export const EDITABLE_STATUSES = ['PENDING', 'NEEDS_CORRECTION']

export type SavedRecord = { vaccination_record_id: number; status: string; vaccination_date: string; batch_number: string | null; vaccination_site: string | null; remarks: string | null; revision: number | null }

/**
 * Save edits only if the record is still at `expectedRevision` (migration 08). Returns
 * { conflict: saved } when someone else saved first. Before migration 08 there is no revision
 * column: the check is skipped and the edit is saved as before.
 */
export async function saveRecordPatch(db: Db, recordId: number, patch: Record<string, unknown>, expectedRevision: number | null | undefined):
  Promise<{ ok: true; revision: number | null } | { conflict: SavedRecord } | { error: { code?: string; message?: string } }> {
  const fields = 'vaccination_record_id, status, vaccination_date, batch_number, vaccination_site, remarks, revision'
  if (Number.isSafeInteger(expectedRevision)) {
    const up = await db.from('vaccination_record').update(patch).eq('vaccination_record_id', recordId).eq('revision', expectedRevision).select(fields).maybeSingle()
    if (!up.error && up.data) return { ok: true, revision: up.data.revision ?? null }
    if (!up.error) {
      const saved = await db.from('vaccination_record').select(fields).eq('vaccination_record_id', recordId).maybeSingle()
      if (saved.data) return { conflict: saved.data as SavedRecord }
      return { error: { message: 'Record not found or outside your scope.' } }
    }
    if (up.error.code !== '42703') return { error: up.error }
  }
  const up = await db.from('vaccination_record').update(patch).eq('vaccination_record_id', recordId).select('vaccination_record_id').maybeSingle()
  if (up.error || !up.data) return { error: up.error ?? { message: 'Record not found or outside your scope.' } }
  return { ok: true, revision: null }
}

export async function buildRecordPatch(db: Db, body: RecordEdits): Promise<{ patch: Record<string, unknown> } | { error: string }> {
  const patch: Record<string, unknown> = {}
  if (body.vaccination_date !== undefined) {
    const d = String(body.vaccination_date).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: 'vaccination_date must be yyyy-mm-dd.' }
    if (new Date(d + 'T23:59:59') > new Date()) return { error: 'vaccination_date cannot be in the future.' }
    patch.vaccination_date = d
  }
  if (body.batch_number !== undefined) {
    const batchError = batchNumberError(body.batch_number, await loadBatchRule(db))
    if (batchError) return { error: `Batch number: ${batchError}` }
    patch.batch_number = normalizeBatchNumber(body.batch_number)
  }
  if (body.vaccination_site !== undefined) {
    const site = (body.vaccination_site ?? '').toString().trim() || null
    if (!isVaccinationSite(site)) return { error: 'Choose a vaccination site from the list.' }
    patch.vaccination_site = site
  }
  if (body.remarks !== undefined) patch.remarks = (body.remarks ?? '').toString().trim() || null
  return { patch }
}
