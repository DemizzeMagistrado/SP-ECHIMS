'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

const names: Record<string, string> = {
  VACCINATION: 'Vaccination', SUPPLEMENTATION: 'Supplementation', CHECKUP: 'Follow-up checkup',
}
const statuses: Record<string, string> = { SUBMITTED: 'Submitted', IN_PROGRESS: 'In progress', FAILED: 'Failed' }

type Attempt = {
  id: string
  program: string
  status: string
  created_at: string
  masked_number: string | null
  provider_uid: string | null
  error_code: string | null
  needs_provider_check: boolean
}

export function GuardianSmsHistory({ childId, guardianId }: { childId: number; guardianId: number }) {
  const { user, isReady } = useAuth()
  const owner = isReady ? user?.id : undefined
  return <GuardianSmsHistoryPanel key={`${owner ?? ''}:${childId}:${guardianId}`} owner={owner} childId={childId} guardianId={guardianId} />
}

function GuardianSmsHistoryPanel({ childId, guardianId, owner }: {
  childId: number
  guardianId: number
  owner?: string
}) {
  const [open, setOpen] = useState(false)
  const [reload, setReload] = useState(0)
  const [result, setResult] = useState<{ rows: Attempt[] } | { error: string } | null>(null)

  useEffect(() => {
    if (!owner || !open) return
    const request = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/children/${childId}/guardian-sms?guardian_id=${guardianId}`, {
          cache: 'no-store', signal: request.signal,
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error || 'Unable to load the selected guardian’s SMS history.')
        if (body?.currentUserId !== owner || body.childId !== childId || body.guardianId !== guardianId || !Array.isArray(body.rows)) {
          throw new Error('The selected child or guardian changed. Refresh the profile.')
        }
        if (!request.signal.aborted) setResult({ rows: body.rows })
      } catch (cause) {
        if (!request.signal.aborted) setResult({
          error: navigator.onLine && cause instanceof Error ? cause.message : 'Reconnect to load SMS history.',
        })
      }
    })()
    return () => request.abort()
  }, [owner, open, childId, guardianId, reload])

  return <details className="group mt-4 rounded-xl border border-border" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
      Guardian SMS status <span className="text-xs font-medium text-primary"><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span></span>
    </summary>
    <div className="space-y-3 border-t border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Message history</h3>
        <Button variant="secondary" size="icon" aria-label="Refresh SMS history" disabled={!owner} onClick={() => { setResult(null); setReload((value) => value + 1) }}><RefreshCw size={16} /></Button>
      </div>
      {!owner && <p className="text-sm text-brand-muted">Sign in online to see SMS history.</p>}
      {owner && !result && <p role="status" className="text-sm text-brand-muted">Loading SMS history…</p>}
      {result && 'error' in result && <p role="alert" className="text-sm text-danger">{result.error}</p>}
      {result && 'rows' in result && <>
        {!result.rows.length && <p className="text-sm text-brand-muted">No SMS attempts for this child and guardian.</p>}
        {result.rows.map((row) => <article key={row.id} className="space-y-1 rounded-lg bg-muted/30 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{names[row.program] ?? row.program}</span>
            <StatusBadge status={row.status} label={statuses[row.status] ?? row.status} />
          </div>
          <p>{new Date(row.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} · {row.masked_number ?? '—'}</p>
          {row.provider_uid && <p className="text-brand-muted">iProg reference {row.provider_uid}</p>}
          {row.error_code && <p className="text-brand-muted">{row.error_code}</p>}
          {row.needs_provider_check && <p className="text-brand-muted">Check with iProg before resending.</p>}
        </article>)}
      </>}
      <Link href={`/alerts?tab=SMS_LOGS&child=${childId}`} className="text-xs font-medium text-link hover:underline">View child SMS logs</Link>
    </div>
  </details>
}
