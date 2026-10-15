// echims/app/(dashboard)/masterlist-upload/page.tsx
// MLU-USR001/002/003 — Masterlist upload wizard.
// Step 1 Upload → Step 2 Preview + edit → Step 3 Import summary.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Batch = {
  batch_id: number
  file_name: string
  row_count: number
  status: string
  valid_count: number
  error_count: number
  duplicate_count: number
  imported_count: number
  skipped_count: number
  uploaded_at: string
  completed_at: string | null
}

type StagingRow = {
  staging_id: number
  batch_id: number
  row_number: number
  raw: Record<string, string>
  normalized: Record<string, string>
  status: 'PENDING' | 'VALID' | 'ERROR' | 'DUPLICATE' | 'IMPORTED' | 'SKIPPED'
  errors: string[]
  matched_child_id: number | null
}

const CHILD_PROFILING_TABS = [
  { label: 'Children', href: '/child-profiling/children' },
  { label: 'Map', href: '/geospatial' },
  { label: 'Masterlist Import', href: '/masterlist-upload' },
]

function ChildProfilingTabs() {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-6 border-b border-border/60">
      {CHILD_PROFILING_TABS.map((t) => {
        const active = pathname === t.href || (t.href === '/masterlist-upload' && pathname.startsWith('/masterlist-upload'))
        return (
          <Link key={t.href} href={t.href}
            className={'relative pb-2 text-sm font-semibold transition ' + (active ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
          </Link>
        )
      })}
    </div>
  )
}

export default function MasterlistUploadPage() {
  const [batch, setBatch] = useState<Batch | null>(null)
  const [rows, setRows] = useState<StagingRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<StagingRow | null>(null)
  const [tab, setTab] = useState<'all' | 'error' | 'duplicate' | 'valid'>('all')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const step: 1 | 2 | 3 = batch == null ? 1 : batch.status === 'COMPLETED' || batch.status === 'FAILED' ? 3 : 2

  async function refreshBatch() {
    if (!batch) return
    const r = await fetch(`/api/masterlist/batches?batch_id=${batch.batch_id}`).then((r) => r.json())
    if (r.batch) setBatch(r.batch)
  }
  async function refreshRows() {
    if (!batch) return
    const r = await fetch(`/api/masterlist/staging?batch_id=${batch.batch_id}`).then((r) => r.json())
    setRows(r.rows ?? [])
  }
  useEffect(() => { if (batch) refreshRows() }, [batch?.batch_id, batch?.status])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/masterlist/upload', { method: 'POST', body: fd })
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? 'Upload failed.'); return }
      const b = await fetch(`/api/masterlist/batches?batch_id=${body.batch_id}`).then((r) => r.json())
      setBatch(b.batch)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function editRow(stagingId: number, patch: Record<string, string>) {
    const res = await fetch('/api/masterlist/staging', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staging_id: stagingId, patch }),
    })
    if (!res.ok) { setError((await res.json()).error ?? 'Edit failed.'); return }
    await Promise.all([refreshRows(), refreshBatch()])
    setEditing(null)
  }

  async function deleteRow(stagingId: number) {
    if (!confirm('Remove this row from the batch?')) return
    const res = await fetch('/api/masterlist/staging', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staging_id: stagingId }),
    })
    if (!res.ok) { setError((await res.json()).error ?? 'Delete failed.'); return }
    await Promise.all([refreshRows(), refreshBatch()])
  }

  async function doImport() {
    if (!batch) return
    setImporting(true); setError(null)
    try {
      const res = await fetch('/api/masterlist/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batch.batch_id }),
      })
      if (!res.ok) { setError((await res.json()).error ?? 'Import failed.'); return }
      await Promise.all([refreshRows(), refreshBatch()])
    } finally { setImporting(false) }
  }

  function reset() { setBatch(null); setRows([]); setError(null) }

  const filtered = useMemo(() => {
    if (tab === 'all') return rows
    const want = tab === 'error' ? 'ERROR' : tab === 'duplicate' ? 'DUPLICATE' : 'VALID'
    return rows.filter((r) => r.status === want)
  }, [rows, tab])

  function errorReportCsv(): string {
    const headers = ['row_number', 'status', 'errors', ...Object.keys(rows[0]?.raw ?? {})]
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
    const lines = [headers.join(',')]
    for (const r of rows) {
      if (r.status === 'VALID' || r.status === 'IMPORTED') continue
      const row = [r.row_number, r.status, r.errors.join(' | '), ...headers.slice(3).map((h) => r.raw[h] ?? '')]
      lines.push(row.map((v) => esc(String(v))).join(','))
    }
    return lines.join('\n')
  }

  return (
    <div className="space-y-5">
      <ChildProfilingTabs />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground">eCHIMS Workspace</div>
          <h1 className="text-2xl font-bold text-primary">Masterlist Upload</h1>
          <p className="text-sm text-muted-foreground">
            Bulk-register children, households and guardians from a CSV masterlist.
          </p>
        </div>
        <Stepper step={step} />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* ───────── Step 1: Upload ───────── */}
      {step === 1 && (
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Upload a CSV</h2>
            <p className="text-sm text-muted-foreground">
              Save your Excel file as <span className="font-mono">.csv</span> first. Max 2 MB.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-dashed border-border p-5 text-center">
              <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" id="mlu-file" onChange={onFile} />
              <label htmlFor="mlu-file" className={'inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 ' + (uploading ? 'opacity-50 pointer-events-none' : '')}>
                {uploading ? 'Uploading…' : 'Choose CSV file'}
              </label>
              <div className="mt-3 text-xs text-muted-foreground">
                .csv only · max 2 MB · UTF-8
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <div className="mb-2 text-sm font-semibold">Required columns</div>
              <div className="mb-3 text-xs text-muted-foreground">
                Download the template, fill it in, save as CSV, and upload.
              </div>
              <a href="/masterlist-template.csv" download className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted">
                Download CSV template
              </a>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>• <strong>Required:</strong> child name, sex, DOB, barangay, household address, guardian name</li>
                <li>• DOB must be <span className="font-mono">YYYY-MM-DD</span>, age 0–59 months</li>
                <li>• barangay_name must exactly match a known barangay (case-insensitive)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Step 2: Preview + edit ───────── */}
      {step === 2 && batch && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{batch.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  Uploaded {new Date(batch.uploaded_at).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <SummaryChip label="Total" value={batch.row_count} tone="neutral" />
                <SummaryChip label="Valid" value={batch.valid_count} tone="success" onClick={() => setTab('valid')} />
                <SummaryChip label="Errors" value={batch.error_count} tone="danger" onClick={() => setTab('error')} />
                <SummaryChip label="Duplicates" value={batch.duplicate_count} tone="warn" onClick={() => setTab('duplicate')} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                {(['all','error','duplicate','valid'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={'rounded-full px-3 py-1 text-xs font-semibold ' + (tab === t ? 'bg-primary text-white' : 'border border-border text-muted-foreground hover:bg-muted')}>
                    {t === 'all' ? 'All' : t === 'error' ? 'Errors' : t === 'duplicate' ? 'Duplicates' : 'Valid'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={reset} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted">
                  Cancel
                </button>
                <button
                  onClick={doImport}
                  disabled={importing || (batch.error_count ?? 0) > 0 || (batch.valid_count ?? 0) === 0}
                  className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {importing ? 'Importing…' : `Confirm import (${batch.valid_count ?? 0})`}
                </button>
              </div>
            </div>

            {(batch.error_count ?? 0) > 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Fix or remove all error rows before importing. Click any error row to edit.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Child</th>
                    <th className="py-2 pr-3">Sex</th>
                    <th className="py-2 pr-3">DOB</th>
                    <th className="py-2 pr-3">Barangay</th>
                    <th className="py-2 pr-3">Guardian</th>
                    <th className="py-2 pr-3">Notes</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.staging_id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-3 font-mono text-[10px] text-muted-foreground">{r.row_number}</td>
                      <td className="py-2 pr-3"><StatusChip status={r.status} /></td>
                      <td className="py-2 pr-3">{r.raw.child_first_name} {r.raw.child_last_name}</td>
                      <td className="py-2 pr-3">{r.normalized.child_sex || r.raw.child_sex}</td>
                      <td className="py-2 pr-3">{r.raw.child_date_of_birth}</td>
                      <td className="py-2 pr-3">{r.raw.barangay_name}</td>
                      <td className="py-2 pr-3">{r.raw.guardian_first_name} {r.raw.guardian_last_name}</td>
                      <td className="py-2 pr-3 text-rose-700">{r.errors.join('; ')}</td>
                      <td className="py-2 pr-3 text-right">
                        <button onClick={() => setEditing(r)} className="mr-2 rounded-md border border-border px-2 py-1 text-[10px] font-semibold hover:bg-muted">Edit</button>
                        <button onClick={() => deleteRow(r.staging_id)} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100">Remove</button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No rows in this tab.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Step 3: Done ───────── */}
      {step === 3 && batch && (
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              {batch.status === 'COMPLETED' ? 'Import complete' : 'Import finished with issues'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {batch.file_name} · {new Date(batch.completed_at ?? batch.uploaded_at).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <SummaryChip label="Imported" value={batch.imported_count} tone="success" />
            <SummaryChip label="Skipped (duplicates)" value={batch.skipped_count} tone="warn" />
            <SummaryChip label="Errors" value={batch.error_count} tone="danger" />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/child-profiling/children" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
              View imported children
            </Link>
            {(batch.error_count ?? 0) + (batch.skipped_count ?? 0) > 0 && (
              <button
                onClick={() => {
                  const blob = new Blob([errorReportCsv()], { type: 'text/csv;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `masterlist-errors-batch-${batch.batch_id}.csv`
                  a.click(); URL.revokeObjectURL(url)
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Download error report
              </button>
            )}
            <button onClick={reset} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
              Upload another file
            </button>
          </div>
        </div>
      )}

      {/* ───────── Edit modal ───────── */}
      {editing && (
        <EditModal row={editing} onClose={() => setEditing(null)} onSave={(patch) => editRow(editing.staging_id, patch)} />
      )}
    </div>
  )
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Upload', 'Preview & edit', 'Import']
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const n = i + 1
        const active = n === step, done = n < step
        return (
          <div key={label} className="flex items-center gap-2">
            <span className={'flex h-6 w-6 items-center justify-center rounded-full font-semibold ' + (done ? 'bg-emerald-600 text-white' : active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>
              {done ? '✓' : n}
            </span>
            <span className={active ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</span>
            {i < steps.length - 1 && <span className="text-muted-foreground">›</span>}
          </div>
        )
      })}
    </div>
  )
}

function SummaryChip({ label, value, tone, onClick }: { label: string; value: number; tone: 'neutral'|'success'|'danger'|'warn'; onClick?: () => void }) {
  const colors = {
    neutral: 'border-border bg-white',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    danger:  'border-rose-200 bg-rose-50 text-rose-800',
    warn:    'border-amber-200 bg-amber-50 text-amber-800',
  }[tone]
  const Cmp: 'button' | 'div' = onClick ? 'button' : 'div'
  return (
    <Cmp onClick={onClick} className={`rounded-xl border px-4 py-2 text-left ${colors} ${onClick ? 'hover:brightness-95' : ''}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </Cmp>
  )
}

function StatusChip({ status }: { status: StagingRow['status'] }) {
  const map: Record<StagingRow['status'], string> = {
    VALID: 'bg-emerald-100 text-emerald-800',
    ERROR: 'bg-rose-100 text-rose-800',
    DUPLICATE: 'bg-amber-100 text-amber-800',
    PENDING: 'bg-gray-100 text-gray-700',
    IMPORTED: 'bg-emerald-200 text-emerald-900',
    SKIPPED: 'bg-gray-200 text-gray-700',
  }
  return <span className={'rounded-full px-2 py-0.5 text-[10px] font-semibold ' + map[status]}>{status}</span>
}

function EditModal({ row, onClose, onSave }: { row: StagingRow; onClose: () => void; onSave: (patch: Record<string, string>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({ ...row.raw })
  const fields = Object.keys(row.raw)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Edit row #{row.row_number}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">✕</button>
        </div>
        {row.errors.length > 0 && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {row.errors.join(' · ')}
          </div>
        )}
        <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
          {fields.map((k) => (
            <label key={k} className="text-xs">
              <div className="mb-1 font-semibold text-muted-foreground">{k}</div>
              <input
                className="w-full rounded-md border border-border px-2 py-1 text-sm"
                value={draft[k] ?? ''}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={() => onSave(draft)} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90">Save & re-validate</button>
        </div>
      </div>
    </div>
  )
}