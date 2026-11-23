"use client";

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DateInput, Select } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { Pagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterCard, SectionHeader } from '@/components/ui/report-parts'

const programNames: Record<string, string> = {
  VACCINATION: 'Vaccination', SUPPLEMENTATION: 'Supplementation', CHECKUP: 'Follow-up checkup',
}
const statuses = { SUBMITTED: 'Submitted', IN_PROGRESS: 'In progress', FAILED: 'Failed' } as const
const statusKeys = Object.keys(statuses) as (keyof typeof statuses)[]
type Log = {
  id: string
  child_id: number
  child_name: string
  program: string
  status: keyof typeof statuses
  masked_number: string | null
  provider_uid: string | null
  batch_id: string | null
  error_code: string | null
  created_at: string
  can_review_failure: boolean
  needs_provider_check: boolean
}
type LogPage = { currentUserId: string; rows: Log[]; counts: Record<string, number>; total: number }

export function SmsLogs({ ownerId, childId }: { ownerId: string; childId: string }) {
  const [filters, setFilters] = useState({ program: '', status: '', from: '', through: '', page: 0 })
  const [range, setRange] = useState({ from: '', through: '' })
  const [rangeOpen, setRangeOpen] = useState(false)
  const invalidRange = Boolean(range.from && range.through && range.from > range.through)
  const [reload, setReload] = useState(0)
  // A result counts only for the request it answers, so changing filters shows the loader again.
  const requestKey = JSON.stringify([ownerId, childId, filters, reload])
  const [result, setResult] = useState<{ key: string; data?: LogPage; error?: string }>()
  const data = result?.key === requestKey ? result.data : undefined
  const error = result?.key === requestKey ? result.error ?? '' : ''
  useEffect(() => {
    const controller = new AbortController()
    const setData = (body: LogPage) => setResult({ key: requestKey, data: body })
    const setError = (message: string) => setResult({ key: requestKey, error: message })
    const params = new URLSearchParams({
      program: filters.program, status: filters.status, from: filters.from, through: filters.through,
      page: String(filters.page + 1), child: childId,
    })
    void (async () => {
      try {
        const response = await fetch('/api/sms/logs?' + params, { cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Unable to load SMS logs.')
        if (body.currentUserId !== ownerId || !Array.isArray(body.rows)) throw new Error('Session changed. Refresh this page.')
        if (!controller.signal.aborted) setData(body)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load SMS logs.')
      }
    })()
    return () => controller.abort()
  }, [ownerId, childId, filters, requestKey])

  function filter(key: 'program' | 'status', value: string) {
    setFilters((old) => ({ ...old, [key]: value, page: 0 }))
  }

  function applyRange(from: string, through: string) {
    setFilters((old) => ({ ...old, from, through, page: 0 }))
    setRangeOpen(false)
  }

  return <section className="space-y-4">
    <SectionHeader title="SMS logs" subtitle="Track guardian reminders submitted within your work scope."
      actions={<Button variant="secondary" onClick={() => setReload((old) => old + 1)}>Refresh</Button>} />
    {childId && <p className="text-sm text-brand-muted">Filtered to child #{childId}</p>}
    <FilterCard>
      <Select aria-label="SMS program" value={filters.program} onChange={(event) => filter('program', event.target.value)}>
        <option value="">All programs</option>
        {Object.entries(programNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </Select>
      <Select aria-label="SMS status" value={filters.status} onChange={(event) => filter('status', event.target.value)}>
        <option value="">All statuses</option>
        {statusKeys.map((value) => <option key={value} value={value}>{statuses[value]}</option>)}
      </Select>
      <Button variant="secondary" aria-haspopup="dialog" aria-expanded={rangeOpen}
        onClick={() => { setRange({ from: filters.from, through: filters.through }); setRangeOpen(true) }}>
        <CalendarDays size={16} aria-hidden="true" /> Custom date range
      </Button>
    </FilterCard>
    {(filters.from || filters.through) && <p className="text-sm text-brand-muted">
      {filters.from && filters.through ? `${filters.from} to ${filters.through}` : filters.from ? `From ${filters.from}` : `Through ${filters.through}`}
    </p>}
    <Modal open={rangeOpen} onClose={() => setRangeOpen(false)} title="Custom date range"
      size="sm" confirmDiscard={false}
      onSubmit={(event) => { event.preventDefault(); if (!invalidRange) applyRange(range.from, range.through) }}
      footer={<>
        <Button type="button" variant="secondary" onClick={() => applyRange('', '')}>Clear dates</Button>
        <Button type="submit" disabled={invalidRange || (!range.from && !range.through)}>Apply</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">From
          <DateInput value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} />
        </label>
        <label className="space-y-1 text-sm">Through
          <DateInput value={range.through} onChange={(event) => setRange({ ...range, through: event.target.value })} />
        </label>
      </div>
      {invalidRange && <p role="alert" className="mt-2 text-sm text-danger">The end date must be on or after the start date.</p>}
    </Modal>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {!error && !data && <p role="status" className="text-sm text-brand-muted">Loading SMS logs…</p>}
    {data && <>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {statusKeys.map((status) => <div key={status} className="rounded-xl border border-brand-line bg-white p-3">
          <dt className="text-xs text-brand-muted">{statuses[status]}</dt><dd className="font-semibold">{data.counts[status] ?? 0}</dd>
        </div>)}
      </dl>
      <div className="overflow-x-auto rounded-xl border border-brand-line bg-white">
        <table className="data-grid w-full text-left text-sm">
          <thead><tr>{['Child', 'Program', 'Recipient', 'Status', 'Attempted', 'Provider reference', 'Batch'].map((value) =>
            <th className="whitespace-nowrap px-3 py-3" key={value} scope="col">{value}</th>)}</tr></thead>
          <tbody>
            {data.rows.map((row) => <tr key={row.id}>
              <td className="px-3 py-3"><Link className="text-link hover:underline" href={`/child-profiling/children/${row.child_id}`}>{row.child_name}</Link></td>
              <td className="whitespace-nowrap px-3 py-3">{programNames[row.program] ?? row.program}</td>
              <td className="whitespace-nowrap px-3 py-3">{row.masked_number ?? '—'}</td>
              <td className="px-3 py-3"><StatusBadge status={row.status} label={statuses[row.status]} />
                {row.needs_provider_check && <p className="mt-1 text-xs text-brand-muted">Check with iProg before resending.</p>}
                {row.error_code && <p className="mt-1 text-xs text-brand-muted">{row.error_code}</p>}
                {row.can_review_failure && <Link className="mt-1 inline-block text-xs text-link hover:underline"
                  href={`/child-profiling/sms?childId=${row.child_id}`}>Review reminder</Link>}
              </td>
              <td className="whitespace-nowrap px-3 py-3">{new Date(row.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
              <td className="px-3 py-3">{row.provider_uid ?? '—'}</td>
              <td className="px-3 py-3" title={row.batch_id ?? undefined}>{row.batch_id?.slice(0, 8) ?? '—'}</td>
            </tr>)}
            {!data.rows.length && <tr><td colSpan={7} className="p-5 text-center text-brand-muted">No SMS attempts match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination label="SMS log pages" page={filters.page} pageCount={Math.max(1, Math.ceil(data.total / 5))}
        total={data.total} pageSize={5} onChange={(page) => setFilters((old) => ({ ...old, page }))} />
      <p className="text-xs text-brand-muted">Submitted means iProg accepted the message.</p>
    </>}
  </section>
}
