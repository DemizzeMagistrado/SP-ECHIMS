'use client'

// "Needs correction" workflow on Vaccination › Records (NIP-REV01): the PHN returns a record with
// a note; the recorder fixes it here and resubmits it (back to Awaiting approval). Every return,
// resubmission and approval is kept in the review history.

import { useState } from 'react'
import useSWR from 'swr'
import { History, PencilLine } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { Button } from '@/components/ui/button'
import { DateInput, Field, Select, Textarea } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { LoadError } from '@/components/ui/load-error'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { Spinner } from '@/components/brand/logo-loader'
import { toast } from '@/components/ui/toast'
import { BatchNumberField, checkBatchNumber } from '@/components/inventory/batch-number-field'
import { RecordConflict } from '@/components/children/record-conflict'
import { VACCINATION_SITES } from '@/lib/vaccination-config'
import { manilaTodayYMD } from '@/lib/nip-schedule'

export type CorrectableRecord = {
  vaccination_record_id: number
  vaccination_date: string
  batch_number: string | null
  vaccination_site: string | null
  remarks: string | null
  review_remarks: string | null
  /** Edit counter (migration 08); a save against an older one gets Keep mine / Keep saved. */
  revision?: number | null
}
type Saved = { vaccination_date: string; batch_number: string | null; vaccination_site: string | null; remarks: string | null; revision: number | null }
const fmtDay = (ymd: string | null) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

export function CorrectRecordButton({ record, title, onDone }: { record: CorrectableRecord; title: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(record.vaccination_date)
  const [batch, setBatch] = useState(record.batch_number ?? '')
  const [site, setSite] = useState(record.vaccination_site ?? '')
  const [remarks, setRemarks] = useState(record.remarks ?? '')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<Saved | null>(null)
  const [revision, setRevision] = useState<number | null | undefined>(record.revision)

  const start = () => {
    setConflict(null); setRevision(record.revision)
    setDate(record.vaccination_date); setBatch(record.batch_number ?? ''); setSite(record.vaccination_site ?? '')
    setRemarks(record.remarks ?? ''); setNote(''); setErrors({}); setOpen(true)
  }

  async function submit(expected = revision) {
    const e: Record<string, string> = {}
    if (!date) e.date = 'Enter the date the dose was given.'
    const b = checkBatchNumber(batch, false)
    if (b.error) e.batch = b.error
    setErrors(e)
    if (Object.keys(e).length) return
    if (!navigator.onLine) { toast.warning('Connect to the internet to resubmit the record.'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/vaccination/record-resubmit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_id: record.vaccination_record_id, note: note.trim() || null, expected_revision: expected ?? undefined,
          edits: { vaccination_date: date, batch_number: b.value, vaccination_site: site || null, remarks: remarks.trim() || null },
        }),
      })
      const d = await r.json().catch(() => ({}))
      // Someone else saved this record after it was opened: show both versions.
      if (r.status === 409 && d.conflict) { setConflict(d.conflict as Saved); return }
      if (!r.ok) throw new Error(d.error || 'Unable to resubmit the record.')
      toast.success('Record resubmitted. It is back in Awaiting approval and the PHN was notified.')
      setOpen(false)
      onDone()
    } catch (err) {
      toast.error(`${err instanceof Error ? err.message : 'Unable to resubmit the record.'} Try again.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={start}><PencilLine size={14} aria-hidden="true" /> Correct &amp; resubmit</Button>
      <Modal open={open} onClose={() => setOpen(false)} busy={saving} size="md" icon={<PencilLine />} title="Correct and resubmit" subtitle={title}
        onSubmit={(ev) => { ev.preventDefault(); void submit() }} bodyClassName="space-y-4"
        footer={<Button type="submit" loading={saving}>Resubmit for approval</Button>}>
        {conflict && (
          <RecordConflict
            title="This record changed while you were editing"
            description="Someone else saved it after you opened it. Keep your corrections, or keep the saved version."
            rows={[
              { field: 'date', label: 'Date given', yours: fmtDay(date), saved: fmtDay(conflict.vaccination_date) },
              { field: 'batch', label: 'Batch number', yours: checkBatchNumber(batch, false).value ?? '—', saved: conflict.batch_number ?? '—' },
              { field: 'site', label: 'Site', yours: site || '—', saved: conflict.vaccination_site ?? '—' },
              { field: 'remarks', label: 'Remarks', yours: remarks.trim() || '—', saved: conflict.remarks ?? '—' },
            ].filter((row) => row.yours !== row.saved)}
            actions={<>
              <Button type="button" loading={saving} onClick={() => { const rev = conflict.revision; setRevision(rev); setConflict(null); void submit(rev) }}>Keep mine</Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => { setConflict(null); setOpen(false); onDone() }}>Keep saved</Button>
            </>}
          />
        )}
        {record.review_remarks && (
          <div className="rounded-lg border border-warn/25 bg-warn-soft px-3 py-2 text-sm text-brand-navy">
            <p className="text-xs font-semibold uppercase tracking-wide text-warn">What the PHN asked to fix</p>
            <p className="mt-1">{record.review_remarks}</p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date given" required error={errors.date}>
            <DateInput value={date} max={manilaTodayYMD()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Site">
            <Select value={site} onChange={(e) => setSite(e.target.value)}>
              <option value="">Select site</option>
              {VACCINATION_SITES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <BatchNumberField value={batch} onChange={setBatch} error={errors.batch} />
        <Field label="Remarks (optional)">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </Field>
        <Field label="Note to the PHN (optional)" hint="Saved in the record's review history.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="e.g. Corrected the batch number from the vial." />
        </Field>
      </Modal>
    </>
  )
}

type HistoryRow = { event_id: number; action: 'RETURNED' | 'RESUBMITTED' | 'APPROVED' | 'MIGRATED'; note: string | null; actor_name: string | null; created_at: string }
const ACTION: Record<HistoryRow['action'], { label: string; tone: 'warn' | 'info' | 'good' | 'neutral' }> = {
  RETURNED: { label: 'Returned for correction', tone: 'warn' },
  RESUBMITTED: { label: 'Resubmitted', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'good' },
  MIGRATED: { label: 'Needs correction (was Rejected)', tone: 'neutral' },
}
const stamp = (ts: string) => new Date(ts).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(d.error || 'Unable to load.'), { status: r.status })
  return d as { rows: HistoryRow[]; unavailable?: boolean }
}

function HistoryList({ recordId }: { recordId: number }) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(`/api/vaccination/record-history?record_id=${recordId}`, fetcher)
  if (isLoading) return <Spinner showLabel label="Loading the review history…" className="w-full justify-center py-6 text-sm text-brand-muted" />
  if (error && !data) return <LoadError what="the review history" error={error} retrying={isValidating} onRetry={() => void mutate()} />
  if (!data?.rows.length) return <EmptyState icon={History} title="No reviews yet" description={data?.unavailable ? 'The review history starts once the latest database update is applied.' : 'Returns, resubmissions and approval will appear here.'} />
  return (
    <ol className="divide-y divide-brand-line overflow-hidden rounded-xl border border-brand-line">
      {data.rows.map((r) => (
        <li key={r.event_id} className="space-y-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge status={r.action.toLowerCase()} tone={ACTION[r.action].tone} label={ACTION[r.action].label} />
            <span className="text-xs text-brand-muted">{stamp(r.created_at)}{r.actor_name ? ` · ${r.actor_name}` : ''}</span>
          </div>
          {r.note && <p className="text-brand-navy">{r.note}</p>}
        </li>
      ))}
    </ol>
  )
}

export function RecordHistoryButton({ recordId, title }: { recordId: number; title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><History size={14} aria-hidden="true" /> History</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="md" icon={<History />} title="Review history" subtitle={title} cancelLabel="Close" confirmDiscard={false}>
        {open && <HistoryList recordId={recordId} />}
      </Modal>
    </>
  )
}
