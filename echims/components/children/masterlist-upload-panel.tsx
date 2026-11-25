// Masterlist upload wizard opened from Child Profiling > Children.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { FilterChips } from '@/components/ui/module-tabs'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
import { toast } from '@/components/ui/toast'

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

type UploadLocation = {
  barangay_id: number
  barangay_name: string
  municipality: string
  province: string
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
  possible_duplicate?: boolean
}

function isDuplicate(row: StagingRow) {
  return row.status === 'DUPLICATE' || row.status === 'SKIPPED' || Boolean(row.possible_duplicate)
}

export function MasterlistUploadPanel() {
  const confirm = useConfirm()
  const [batch, setBatch] = useState<Batch | null>(null)
  const [rows, setRows] = useState<StagingRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showImportResult, setShowImportResult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<StagingRow | null>(null)
  const [tab, setTab] = useState<'all' | 'error' | 'duplicate' | 'valid'>('all')
  const [locations, setLocations] = useState<UploadLocation[]>([])
  const [barangayId, setBarangayId] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const [scope, history] = await Promise.all([
          fetch('/api/masterlist/upload'),
          fetch('/api/masterlist/batches'),
        ])
        if (!scope.ok || !history.ok) {
          throw new Error('Could not load assigned locations or saved batches.')
        }
        const [scopeData, historyData] = await Promise.all([scope.json(), history.json()])
        if (mounted) {
          setLocations(scopeData.locations)
          setBatches(historyData.batches)
        }
      } catch {
        if (mounted) setError('Could not load assigned locations or saved batches.')
      }
    }

    void load()
    return () => { mounted = false }
  }, [batch?.batch_id])

  const step: 1 | 2 | 3 = !batch
    ? 1
    : showImportResult || batch.status === 'COMPLETED' || batch.status === 'FAILED'
      ? 3
      : 2

  async function refreshBatch() {
    if (!batch) return
    const response = await fetch(`/api/masterlist/batches?batch_id=${batch.batch_id}`)
    const data = await response.json()
    if (!response.ok || !data.batch) {
      throw new Error(data.error ?? 'Could not load the batch.')
    }
    setBatch(data.batch)
  }

  async function refreshRows() {
    if (!batch) return
    const response = await fetch(`/api/masterlist/staging?batch_id=${batch.batch_id}`)
    const data = await response.json()
    if (!response.ok || data.error) {
      throw new Error(data.error ?? 'Could not load the batch rows.')
    }
    setRows(data.rows ?? [])
  }

  useEffect(() => {
    if (batch) {
      void refreshRows().catch((failure) => {
        setError(failure instanceof Error ? failure.message : 'Could not load the batch rows.')
      })
    }
  }, [batch?.batch_id, batch?.status])

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)

    try {
      const form = new FormData()
      form.append('file', file)
      if (barangayId) form.append('barangay_id', barangayId)

      const response = await fetch('/api/masterlist/upload', { method: 'POST', body: form })
      const body = await response.json()
      if (!response.ok) {
        setError(body.error ?? 'Upload failed.')
        return
      }

      const saved = await fetch(`/api/masterlist/batches?batch_id=${body.batch_id}`)
      const data = await saved.json()
      if (!saved.ok || !data.batch) {
        setError(data.error ?? 'The file was uploaded. Reopen it from Saved batches.')
        return
      }

      setBatch(data.batch)
      setNotice([
        body.outsideAge ? `${body.outsideAge} outside the age range` : '',
        body.outsideScope ? `${body.outsideScope} outside your assignment` : '',
      ].filter(Boolean).join(' · ') || null)
    } catch {
      setError('Could not upload the CSV. Try again.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function editRow(stagingId: number, patch: Record<string, string>) {
    setError(null)
    try {
      const response = await fetch('/api/masterlist/staging', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staging_id: stagingId, patch }),
      })
      if (!response.ok) {
        setError((await response.json()).error ?? 'Edit failed.')
        return
      }
      setEditing(null)
      await Promise.all([refreshRows(), refreshBatch()])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the row.')
    }
  }

  async function deleteRow(stagingId: number) {
    await confirm({
      title: 'Remove this row?',
      description: 'This will remove the row from the saved batch.',
      confirmLabel: 'Remove row',
      tone: 'danger',
      action: async () => {
        try {
          const response = await fetch('/api/masterlist/staging', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staging_id: stagingId }),
          })
          if (!response.ok) {
            toast.error((await response.json()).error ?? 'Delete failed.')
            return
          }
          await Promise.all([refreshRows(), refreshBatch()])
          toast.success('Row removed from the batch.')
        } catch (failure) {
          toast.error(failure instanceof Error ? failure.message : 'Could not remove the row.')
        }
      },
    })
  }

  async function doImport() {
    if (!batch || importing) return

    setImporting(true)
    setError(null)

    try {
      const response = await fetch('/api/masterlist/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batch.batch_id }),
      })
      if (!response.ok) {
        setError((await response.json()).error ?? 'Import failed.')
        return
      }

      await Promise.all([refreshRows(), refreshBatch()]).catch(() => {
        setError('The import finished, but the counts could not be refreshed. Reopen this batch from Saved batches to see the latest results.')
      })
      setShowImportResult(true)
    } catch {
      setError('Could not confirm the import result. Reopen the saved batch to check its status.')
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setBatch(null)
    setRows([])
    setError(null)
    setNotice(null)
    setTab('all')
    setShowImportResult(false)
  }

  const ready = rows.filter(row => row.status === 'VALID').length
  const needsReview = rows.filter(row => row.status === 'ERROR' || row.status === 'PENDING').length
  const duplicateCount = rows.filter(isDuplicate).length
  const importedCount = rows.filter(row => row.status === 'IMPORTED').length

  const filtered = useMemo(() => {
    if (tab === 'all') return rows
    if (tab === 'error') return rows.filter(row => row.status === 'ERROR' || row.status === 'PENDING')
    if (tab === 'duplicate') return rows.filter(isDuplicate)
    return rows.filter(row => row.status === 'VALID')
  }, [rows, tab])

  function errorReportCsv(): string {
    const headers = ['row_number', 'status', 'errors', ...Object.keys(rows[0]?.raw ?? {})]
    const escapeCell = (value: string) => {
      const safe = /^[=+@\t\r-]/.test(value) ? "'" + value : value
      return `"${safe.replace(/"/g, '""')}"`
    }

    const lines = [headers.join(',')]
    for (const row of rows) {
      if (row.status === 'VALID' || row.status === 'IMPORTED') continue
      const cells = [
        row.row_number,
        row.status,
        row.errors.join(' | '),
        ...headers.slice(3).map(header => row.raw[header] ?? ''),
      ]
      lines.push(cells.map(value => escapeCell(String(value))).join(','))
    }
    return lines.join('\n')
  }

  const { visible: pagedRows, props: rowPager } = usePagination(filtered)

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm">{notice}</p>}

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
              <div className="mt-3 text-xs text-muted-foreground">.csv only · max 2 MB · UTF-8</div>
              <label className="mt-4 block text-left text-xs">
                Barangay (required for OPT+)
                <select value={barangayId} onChange={event => setBarangayId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-white p-2">
                  <option value="">Select the barangay on the roster</option>
                  {locations.map(location => (
                    <option key={location.barangay_id} value={location.barangay_id}>
                      {location.barangay_name}, {location.municipality}, {location.province}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <div className="mb-2 text-sm font-semibold">Accepted CSV formats</div>
              <div className="mb-3 text-xs text-muted-foreground">
                Use the Household Profiling Consolidation roster, the OPT+ Clean&amp;Update roster, or the eCHIMS template.
              </div>
              <a href="/masterlist-template.csv" download className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted">
                Download CSV template
              </a>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>• Profiles missing a household or guardian can be completed after import.</li>
                <li>• Rows missing a child’s name, sex, birth date, or confirmed barangay stay in Needs review.</li>
              </ul>
            </div>
          </div>

          {batches.length > 0 && (
            <details className="mt-4 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Saved batches</summary>
              <ul className="mt-2 space-y-1">
                {batches.map(saved => (
                  <li key={saved.batch_id}>
                    <button
                      type="button"
                      className="text-left text-sm underline"
                      onClick={() => {
                        setShowImportResult(false)
                        setBatch(saved)
                        setTab('all')
                        setError(null)
                      }}
                    >
                      {saved.file_name} · {new Date(saved.uploaded_at).toLocaleDateString()}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

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
                <SummaryChip label="Total" value={rows.length} tone="neutral" />
                <SummaryChip label="Imported" value={importedCount} tone="success" />
                <SummaryChip label="Ready" value={ready} tone="success" onClick={() => setTab('valid')} />
                <SummaryChip label="Needs review" value={needsReview} tone="danger" onClick={() => setTab('error')} />
                <SummaryChip label="Duplicates" value={duplicateCount} tone="warn" onClick={() => setTab('duplicate')} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <FilterChips
                label="Filter rows"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'all', label: 'All', count: rows.length },
                  { value: 'error', label: 'Needs review', count: needsReview },
                  { value: 'duplicate', label: 'Duplicates', count: duplicateCount },
                  { value: 'valid', label: 'Ready', count: ready },
                ]}
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={reset} disabled={importing}>Cancel</Button>
                <Button onClick={doImport} disabled={importing || ready === 0}>
                  {importing ? 'Importing…' : `Confirm import (${ready})`}
                </Button>
              </div>
            </div>

            {needsReview > 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {ready > 0
                  ? 'You can import the ready rows now. Rows that need review will stay in this saved batch.'
                  : 'Edit the remaining rows to make them ready for import.'}
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
                  {pagedRows.map(row => (
                    <tr key={row.staging_id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-3 font-mono text-[10px] text-muted-foreground">{row.row_number}</td>
                      <td className="py-2 pr-3">
                        <StatusBadge
                          status={row.status}
                          label={
                            isDuplicate(row) ? 'Possible duplicate'
                              : row.status === 'ERROR' || row.status === 'PENDING' ? 'Needs review'
                                : row.status === 'VALID' ? 'Ready' : undefined
                          }
                          className="text-[10px]"
                        />
                      </td>
                      <td className="py-2 pr-3">{row.raw.child_first_name} {row.raw.child_last_name}</td>
                      <td className="py-2 pr-3">{row.normalized.child_sex || row.raw.child_sex}</td>
                      <td className="py-2 pr-3">{row.raw.child_date_of_birth}</td>
                      <td className="py-2 pr-3">{row.raw.barangay_name}</td>
                      <td className="py-2 pr-3">{row.raw.guardian_first_name} {row.raw.guardian_last_name}</td>
                      <td className="py-2 pr-3 text-rose-700">
                        {row.errors.join('; ')}
                        {row.status === 'VALID' && !isDuplicate(row) && [
                          !row.raw.child_birth_place ? 'Child information incomplete' : '',
                          !row.raw.household_address ? 'Household information incomplete' : '',
                          !row.raw.guardian_first_name || !row.raw.guardian_last_name
                            || !row.raw.guardian_relationship || !row.normalized.guardian_contact_number
                            ? 'Guardian information incomplete' : '',
                        ].filter(Boolean).join(' · ')}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {row.matched_child_id && (
                          <Link className="text-primary underline" href={`/child-profiling/children/${row.matched_child_id}`}>
                            Open profile
                          </Link>
                        )}
                        {['VALID', 'ERROR', 'PENDING'].includes(row.status) && (
                          <span className="inline-flex gap-1.5">
                            <Button variant="secondary" size="sm" onClick={() => setEditing(row)} disabled={importing}>Edit</Button>
                            <Button variant="danger" size="sm" onClick={() => deleteRow(row.staging_id)} disabled={importing}>Remove</Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState icon={FileSpreadsheet} title="No rows in this tab" description="Rows with this status will appear here." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination {...rowPager} label="Staged row pages" />
          </div>
        </div>
      )}

      {step === 3 && batch && (
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              {batch.status === 'FAILED'
                ? 'Import finished with issues'
                : batch.status === 'COMPLETED'
                  ? 'Import complete'
                  : 'Import results'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {batch.file_name} · {new Date(batch.completed_at ?? batch.uploaded_at).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <SummaryChip label="Imported" value={importedCount} tone="success" />
            <SummaryChip label="Skipped (duplicates)" value={duplicateCount} tone="warn" />
            <SummaryChip label="Needs review" value={needsReview} tone="danger" />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/child-profiling/children" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90">
              View imported children
            </Link>
            {batch.status === 'VALIDATED' && needsReview > 0 && (
              <Button variant="secondary" onClick={() => {
                setTab('error')
                setShowImportResult(false)
              }}>
                Review remaining rows ({needsReview})
              </Button>
            )}
            {needsReview + duplicateCount > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  const blob = new Blob([errorReportCsv()], { type: 'text/csv;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = `masterlist-errors-batch-${batch.batch_id}.csv`
                  link.click()
                  URL.revokeObjectURL(url)
                }}
              >
                Download error report
              </Button>
            )}
            <Button variant="secondary" onClick={reset}>Upload another file</Button>
          </div>
        </div>
      )}

      {editing && (
        <EditModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={patch => editRow(editing.staging_id, patch)}
        />
      )}
    </div>
  )
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Upload', 'Preview & edit', 'Import results']
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((label, index) => {
        const number = index + 1
        const active = number === step
        const done = number < step
        return (
          <div key={label} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span className={'flex h-6 w-6 items-center justify-center rounded-full font-semibold ' + (done ? 'bg-emerald-600 text-white' : active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>
              {done ? '✓' : number}
            </span>
            <span className={active ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</span>
            {index < steps.length - 1 && <span className="text-muted-foreground">›</span>}
          </div>
        )
      })}
    </div>
  )
}

function SummaryChip({
  label, value, tone, onClick,
}: {
  label: string
  value: number
  tone: 'neutral' | 'success' | 'danger' | 'warn'
  onClick?: () => void
}) {
  const colors = {
    neutral: 'border-border bg-white',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    danger: 'border-rose-200 bg-rose-50 text-rose-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
  }
  const Component = onClick ? 'button' : 'div'
  return (
    <Component onClick={onClick} className={`rounded-xl border px-4 py-2 text-left ${colors[tone]} ${onClick ? 'hover:brightness-95' : ''}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </Component>
  )
}

function EditModal({
  row, onClose, onSave,
}: {
  row: StagingRow
  onClose: () => void
  onSave: (patch: Record<string, string>) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>({ ...row.raw })
  const fields = Object.keys(row.raw)

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Edit row #${row.row_number}`}
      subtitle="Fix the values, then save to validate the row again."
      footer={<Button onClick={() => onSave(draft)}>Save &amp; re-validate</Button>}
    >
      {row.errors.length > 0 && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {row.errors.join(' · ')}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {fields.map(field => (
          <label key={field} className="text-xs">
            <div className="mb-1 font-semibold text-muted-foreground">{field}</div>
            <Input
              value={draft[field] ?? ''}
              onChange={event => setDraft({ ...draft, [field]: event.target.value })}
            />
          </label>
        ))}
      </div>
    </Modal>
  )
}