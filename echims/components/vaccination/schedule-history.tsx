'use client'

// "View history" on a Schedule card: every vaccination schedule request for the child (the card
// shows only the latest), newest first, 6 per page.

import { useState } from 'react'
import useSWR from 'swr'
import { History } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadError } from '@/components/ui/load-error'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { Spinner } from '@/components/brand/logo-loader'

type HistoryRow = {
  schedule_id: number
  status: string
  schedule_date: string
  start_time: string | null
  end_time: string | null
  created_at: string
  remarks: string | null
  review_remarks: string | null
  reviewed_at: string | null
  cancellation_reason: string | null
  completion_date: string | null
  requested_by: string | null
  reviewed_by: string | null
}

const LABEL: Record<string, string> = {
  PENDING: 'Awaiting approval', APPROVED: 'Approved', NEEDS_REVISION: 'Needs new date', ONGOING: 'Ongoing',
  COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Rejected (old)',
}
const day = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
const stamp = (ts: string) => new Date(ts).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const time = (t: string | null) => (t ? new Date(`1970-01-01T${t}`).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : null)

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(d.error || 'Unable to load.'), { status: r.status })
  return d as { rows: HistoryRow[] }
}

function HistoryList({ childId }: { childId: number }) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(`/api/vaccination/schedule-history?child_id=${childId}`, fetcher)
  const { visible, bindList, listStyle, props } = usePagination(data?.rows ?? [])
  if (isLoading) return <Spinner showLabel label="Loading the request history…" className="w-full justify-center py-6 text-sm text-brand-muted" />
  if (error && !data) return <LoadError what="the request history" error={error} retrying={isValidating} onRetry={() => void mutate()} />
  if (!data?.rows.length) return <EmptyState icon={History} title="No schedule requests yet" description="Requests made from the child profile appear here." />
  return (
    <div className="overflow-hidden rounded-xl border border-brand-line">
      <ol ref={bindList} style={listStyle} className="divide-y divide-brand-line">
        {visible.map((r) => {
          const times = [time(r.start_time), time(r.end_time)].filter(Boolean).join('–')
          return (
            <li key={r.schedule_id} className="space-y-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-brand-navy">{day(r.schedule_date)}{times ? ` · ${times}` : ''}</span>
                <StatusBadge status={r.status === 'PENDING' ? 'pending' : r.status === 'NEEDS_REVISION' ? 'upcoming' : r.status} label={LABEL[r.status] ?? r.status} />
              </div>
              <p className="text-xs text-brand-muted">Requested by {r.requested_by ?? 'a health worker'} · {stamp(r.created_at)}</p>
              {r.remarks && <p className="text-brand-navy"><span className="text-brand-muted">Notes:</span> {r.remarks}</p>}
              {(r.reviewed_by || r.review_remarks) && (
                <p className="text-brand-navy"><span className="text-brand-muted">Review{r.reviewed_by ? ` by ${r.reviewed_by}` : ''}{r.reviewed_at ? ` · ${stamp(r.reviewed_at)}` : ''}:</span> {r.review_remarks ?? '—'}</p>
              )}
              {r.cancellation_reason && <p className="text-brand-navy"><span className="text-brand-muted">Cancelled:</span> {r.cancellation_reason}</p>}
              {r.completion_date && <p className="text-xs text-good">Completed on {day(r.completion_date)}</p>}
            </li>
          )
        })}
      </ol>
      <Pagination {...props} label="Request history pages" />
    </div>
  )
}

export function ScheduleHistoryButton({ childId, childName, variant = 'tonal' }: { childId: number; childName: string; variant?: 'tonal' | 'ghost' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}><History size={14} aria-hidden="true" /> View history</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg" icon={<History />} title="Schedule request history" subtitle={childName} cancelLabel="Close" confirmDiscard={false}>
        {open && <HistoryList childId={childId} />}
      </Modal>
    </>
  )
}
