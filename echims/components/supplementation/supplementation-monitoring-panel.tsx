'use client'
import { Input, Select } from '@/components/ui/form'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { readPageCache, writePageCache } from '@/lib/page-cache'
import { RefreshCw, SearchX, CalendarClock, FileText, Search } from 'lucide-react'
import { Spinner } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { useRefreshSignal } from '@/components/brand/loader-state'
import { EmptyState } from '@/components/ui/empty-state'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { CountsStrip, REPORT_CARD, SectionHeader } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { cn } from '@/lib/utils'
import { nutritionLabel } from '@/lib/nutrition-status'
import { Pagination, usePagination } from '@/components/ui/pagination'

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

const tones: Record<Status, StatusTone> = {
  UPCOMING: 'info',
  DUE_TODAY: 'review',
  MISSED: 'danger',
  NEEDS_REVIEW: 'review',
  COURSE_COMPLETED: 'good',
  NOT_ELIGIBLE: 'neutral',
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
  // Revisiting the tab starts from the last result: only a first load holds the tab; a refresh
  // behind data on screen drives the top progress bar instead.
  const [result, setResult] = useState<Result | null>(() => readPageCache<Result>(ownerId, 'supplementation-follow-up') ?? null)
  const [loading, setLoading] = useState(true)
  usePageLoading(loading && !result)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [barangay, setBarangay] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [tier, setTier] = useState('ALL')
  const [status, setStatus] = useState<Status | 'ALL'>('MISSED')
  const [search, setSearch] = useState('')
  const refresh = useCallback(() => setReload((value) => value + 1), [])
  useRefreshSignal(loading && Boolean(result))
  useEffect(() => {
    // The list stays on screen while it reloads (the panel remounts for another account).
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
        if (!controller.signal.aborted) { setResult(body); writePageCache(ownerId, 'supplementation-follow-up', body) }
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
  const { visible: pagedRows, props: rowPager } = usePagination(filtered)
  const statuses = Object.keys(labels) as Status[]
  // A supplement type is shown as its product name (codes like VITAMIN_A would read "Vitamin a").
  const typeName = (type: string) => readable(rows.find((row) => row.supplement_type === type && row.supplement_name)?.supplement_name ?? type)
  const head = 'px-4 py-3 text-left align-bottom text-[13px] font-semibold text-brand-navy whitespace-nowrap'
  const cell = 'px-4 py-3.5 align-top'
  return (
    <section aria-label="Compliance monitoring" className="space-y-5">
      <SectionHeader
        title="Supplementation compliance monitoring"
        subtitle="Missed means a valid saved tracking date has passed. No grace period applies."
        about={<InfoContent
          title="Supplementation compliance monitoring"
          description="Uses saved administrations only; dispensing is not proof of administration."
          bullets={['Children without a saved schedule are not counted as missed', 'Clinical results require RHM review']}
          note="Counts are tracked schedules or courses, not unique children."
        />}
        actions={<Button variant="secondary" loading={loading} disabled={!online} onClick={refresh}>
                  {!loading && <RefreshCw size={16} aria-hidden="true" />}
                  Refresh
                </Button>}
      />
      {!online ? (
        <p role="status" className="rounded-2xl border border-review-line/40 bg-review-soft p-4 text-sm text-review">
          Monitoring requires an online connection. Cached data is not used to
          label children as missed.
        </p>
      ) : loading && !result ? (
        <Spinner showLabel label="Loading supplementation monitoring…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-brand-navy">
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>Retry</Button>
        </div>
      ) : (
        result && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select aria-label="Barangay" value={barangay} onChange={(e) => setBarangay(e.target.value)}>
                <option value="ALL">All barangays</option>
                {options.barangays.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </Select>
              <Select aria-label="Supplement type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="ALL">All types</option>
                {options.types.map((value) => (
                  <option key={value} value={value}>{typeName(value)}</option>
                ))}
              </Select>
              <Select aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="ALL">All tiers</option>
                {options.tiers.map((value) => (
                  <option key={value} value={value}>{nutritionLabel(value)}</option>
                ))}
              </Select>
              <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status | 'ALL')}>
                <option value="ALL">All statuses</option>
                {statuses.map((value) => (
                  <option key={value} value={value}>{labels[value]}</option>
                ))}
              </Select>
              <div className="relative sm:col-span-2 lg:col-span-2">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  aria-label="Child"
                  className="pl-10"
                  value={search}
                  placeholder="Name or database ID"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {
                <CountsStrip
                  label="Schedules by status"
                  selected={status}
                  onSelect={(key) => setStatus(status === key ? 'ALL' : (key as Status))}
                  items={statuses.map((value) => ({
                    key: value,
                    label: labels[value],
                    value: scoped.filter((row) => row.status === value).length,
                    tone: value === 'MISSED' ? 'severe' : value === 'DUE_TODAY' || value === 'NEEDS_REVIEW' ? 'review' : undefined,
                  }))}
                />
              }
            <section aria-label="Tracked schedules" className={REPORT_CARD}>
              <div className="scroll-subtle overflow-x-auto">
                <table className="data-grid w-full text-sm text-brand-navy">
                  <thead>
                    <tr>
                      {['Child', 'Barangay', 'Supplement / Tier', 'Due Date', 'Status', 'Review / Action'].map((title) => (
                        <th key={title} scope="col" className={head}>{title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!filtered.length ? (
                      <tr>
                        <td colSpan={6}>
                          {rows.length
                            ? <EmptyState icon={SearchX} title="No tracked schedules match these filters" description="Try a different status or barangay." />
                            : <EmptyState icon={CalendarClock} title="No schedules to monitor yet" description="Saved administration schedules will be tracked here." />}
                        </td>
                      </tr>
                    ) : (
                      pagedRows.map((row, i) => (
                        <tr key={row.tracking_key} data-zebra={i % 2 === 1 || undefined}>
                          <td className={cn(cell, 'min-w-44')}>
                            <span className="font-semibold">{row.child_name}</span>
                            <span className="block text-xs text-brand-muted">Child #{row.child_id}</span>
                          </td>
                          <td className={cell}>{row.barangay_name}</td>
                          <td className={cn(cell, 'min-w-44')}>
                            {row.supplement_name ? readable(row.supplement_name) : typeName(row.supplement_type)}
                            <span className="mt-0.5 block text-xs text-brand-muted">
                              {nutritionLabel(row.tier)} · {row.protocol_code ?? 'Saved protocol unavailable'}
                            </span>
                          </td>
                          <td className={cn(cell, 'whitespace-nowrap')}>
                            {row.due_date ?? <span className="text-brand-muted">Unavailable</span>}
                            {row.next_dose != null && (
                              <span className="block text-xs text-brand-muted">Course dose {row.next_dose}</span>
                            )}
                          </td>
                          <td className={cell}>
                            <StatusBadge status={row.status} tone={tones[row.status]} label={labels[row.status]} />
                          </td>
                          <td className={cn(cell, 'min-w-[240px]')}>
                            <p className="text-xs text-brand-muted">{row.detail}</p>
                            <Link
                              href={`/child-profiling/children/${row.child_id}`}
                              className={cn(buttonVariants({ variant: 'row', size: 'row' }), 'mt-2')}
                            >
                              <FileText aria-hidden="true" />View child record
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination {...rowPager} label="Schedule pages" />
              <p className="border-t border-brand-line/70 px-4 py-3 text-[13px] text-brand-muted">
                {new Set(scoped.filter((row) => row.status === 'MISSED').map((row) => row.child_id)).size}{' '}
                children have missed tracking dates. Evaluated on {result.evaluatedOn} (Asia/Manila).
              </p>
            </section>
          </>
        )
      )}
    </section>
  )
}
