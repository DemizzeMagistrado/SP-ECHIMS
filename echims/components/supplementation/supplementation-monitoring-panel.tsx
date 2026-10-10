'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'

type Status =
  | 'UPCOMING'
  | 'DUE_TODAY'
  | 'MISSED'
  | 'NEEDS_REVIEW'
  | 'COURSE_COMPLETED'
  | 'NOT_ELIGIBLE'

type Row = {
  tracking_key: string
  child_id: number
  child_name: string
  supplement_id: number
  supplement_name: string
  supplement_type: string
  barangay_id: number
  barangay_name: string
  tier: string
  due_date: string | null
  next_dose: number | null
  status: Status
  detail: string
  protocol_code: string | null
}

type Result = {
  currentUserId: string
  rows: Row[]
  evaluatedOn: string
  evaluatedAt: string
}

const labels: Record<Status, string> = {
  UPCOMING: 'Upcoming',
  DUE_TODAY: 'Due Today',
  MISSED: 'Missed',
  NEEDS_REVIEW: 'Needs Review',
  COURSE_COMPLETED: 'Course Completed',
  NOT_ELIGIBLE: 'Not Eligible',
}

const tones: Record<Status, string> = {
  UPCOMING: 'bg-sky-50 text-sky-800',
  DUE_TODAY: 'bg-amber-50 text-amber-800',
  MISSED: 'bg-red-50 text-red-800',
  NEEDS_REVIEW: 'bg-orange-50 text-orange-800',
  COURSE_COMPLETED: 'bg-emerald-50 text-emerald-800',
  NOT_ELIGIBLE: 'bg-slate-100 text-slate-600',
}

const readable = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replace(/\bfor\s+children\b/gi, '')
    .trim()

export function SupplementationMonitoringPanel({
  ownerId,
  online,
}: {
  ownerId: string
  online: boolean
}) {
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [barangay, setBarangay] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [tier, setTier] = useState('ALL')
  const [status, setStatus] = useState<Status | 'ALL'>('MISSED')
  const [search, setSearch] = useState('')
  const refresh = useCallback(() => setReload((value) => value + 1), [])
  useEffect(() => {
    setResult(null)
    setError('')
    if (!online) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    void (async () => {
      try {
        const response = await fetch('/api/supplementation/compliance', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (
          !(response.headers.get('content-type') ?? '').includes(
            'application/json',
          )
        )
          throw new Error(
            `Monitoring API returned non-JSON (HTTP ${response.status}).`,
          )
        const body = await response.json()
        if (!response.ok)
          throw new Error(body.error ?? 'Unable to load monitoring.')
        if (body.currentUserId !== ownerId)
          throw new Error('Account changed. Refresh the page.')
        if (!Array.isArray(body.rows))
          throw new Error('Invalid monitoring response.')
        if (!controller.signal.aborted) setResult(body)
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Unable to load monitoring.',
          )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [ownerId, online, reload])

  const rows = useMemo(() => result?.rows ?? [], [result])
  const options = useMemo(
    () => ({
      barangays: [
        ...new Map(
          rows.map((row) => [String(row.barangay_id), row.barangay_name]),
        ).entries(),
      ],
      types: [...new Set(rows.map((row) => row.supplement_type))].sort(),
      tiers: [...new Set(rows.map((row) => row.tier))].sort(),
    }),
    [rows],
  )
  const scoped = rows.filter(
    (row) =>
      (barangay === 'ALL' || String(row.barangay_id) === barangay) &&
      (type === 'ALL' || row.supplement_type === type) &&
      (tier === 'ALL' || row.tier === tier) &&
      (!search.trim() ||
        row.child_name.toLowerCase().includes(search.trim().toLowerCase()) ||
        String(row.child_id) === search.trim()),
  )
  const filtered = scoped.filter(
    (row) => status === 'ALL' || row.status === status,
  )
  const statuses = Object.keys(labels) as Status[]
  const input =
    'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Supplementation Compliance Monitoring
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Missed means a valid saved tracking date has passed. No grace period
            applies.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || !online}
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      {!online ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800"
        >
          Monitoring requires an online connection. Cached data is not used to
          label children as missed.
        </p>
      ) : loading ? (
        <p role="status" className="py-6 text-sm text-muted-foreground">
          Loading supplementation monitoring…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <button type="button" onClick={refresh} className="ml-3 underline">
            Retry
          </button>
        </div>
      ) : (
        result && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs font-medium">
                Barangay
                <select
                  className={input}
                  value={barangay}
                  onChange={(e) => setBarangay(e.target.value)}
                >
                  <option value="ALL">All barangays</option>
                  {options.barangays.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                Supplement type
                <select
                  className={input}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="ALL">All types</option>
                  {options.types.map((value) => (
                    <option key={value} value={value}>
                      {readable(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                Tier
                <select
                  className={input}
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                >
                  <option value="ALL">All tiers</option>
                  {options.tiers.map((value) => (
                    <option key={value} value={value}>
                      {readable(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                Status
                <select
                  className={input}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status | 'ALL')}
                >
                  <option value="ALL">All statuses</option>
                  {statuses.map((value) => (
                    <option key={value} value={value}>
                      {labels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                Child
                <input
                  className={input}
                  value={search}
                  placeholder="Name or database ID"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {statuses.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                  className={`rounded-xl border p-3 text-left ${status === value ? 'border-primary ring-1 ring-primary' : 'border-border'} ${tones[value]}`}
                >
                  <p className="text-xs font-medium">{labels[value]}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {scoped.filter((row) => row.status === value).length}
                  </p>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Counts represent tracked schedules/courses, not unique children.{' '}
              {
                new Set(
                  scoped
                    .filter((row) => row.status === 'MISSED')
                    .map((row) => row.child_id),
                ).size
              }{' '}
              children have missed tracking dates. Evaluated on{' '}
              {result.evaluatedOn} (Asia/Manila).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {[
                      'Child',
                      'Barangay',
                      'Supplement / Tier',
                      'Due Date',
                      'Status',
                      'Review / Action',
                    ].map((title) => (
                      <th
                        key={title}
                        className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold"
                      >
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!filtered.length ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-8 text-center text-muted-foreground"
                      >
                        {rows.length
                          ? 'No tracked schedules match these filters.'
                          : 'No saved administration schedules to monitor yet.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.tracking_key}>
                        <td className="px-3 py-3">
                          <Link
                            href={`/child-profiling/children/${row.child_id}`}
                            className="font-medium text-primary underline"
                          >
                            {row.child_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            Child #{row.child_id}
                          </p>
                        </td>
                        <td className="px-3 py-3">{row.barangay_name}</td>
                        <td className="px-3 py-3">
                          {readable(row.supplement_name || row.supplement_type)}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {readable(row.tier)} ·{' '}
                            {row.protocol_code ?? 'Saved protocol unavailable'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {row.due_date ?? 'Unavailable'}
                          {row.next_dose != null && (
                            <p className="text-xs text-muted-foreground">
                              Course dose {row.next_dose}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${tones[row.status]}`}
                          >
                            {labels[row.status]}
                          </span>
                        </td>
                        <td className="min-w-[240px] px-3 py-3">
                          <p className="text-xs text-muted-foreground">
                            {row.detail}
                          </p>
                          <Link
                            href={`/child-profiling/children/${row.child_id}`}
                            className="mt-2 inline-block text-xs font-semibold text-primary underline"
                          >
                            View child record
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Monitoring uses saved administrations only. Dispensing is not
              proof of administration. Children without a saved schedule are not
              assumed to have missed a dose. Clinical results require RHM
              review.
            </p>
          </>
        )
      )}
    </section>
  )
}
