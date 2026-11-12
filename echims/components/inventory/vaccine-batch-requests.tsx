'use client'
import { StatCard } from '@/components/ui/stat-card'

// (moved out of the Vaccination page)
// Sections: Records · Schedule · Defaulters · SMS Reminders · NIP Catalog · Batch Requests.
// Each section keeps its own permission check, data fetching and modals.
// Only the active section is mounted, so only its API calls fire.

import React, { Fragment, useState } from 'react'
import { refreshOfflineViews as globalMutate } from '@/lib/offline/refresh'
import { useVaccinationView } from '@/hooks/use-vaccination-view'
import { vaccinationKeyMatches } from '@/lib/vaccination-cache'
import { VaccinationSnapshotNotice } from '@/components/vaccination/vaccination-offline-tools'
import Link from 'next/link'
import { Plus, Package, AlertCircle, Hash, MapPin, CalendarClock, CheckCircle2, Clock, XCircle, Search } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { BatchRequestModal } from '@/components/vaccination/batch-request-modal'
import { BatchRequestDecisionModal, type BatchRequestRow } from '@/components/vaccination/batch-request-decision-modal'
import { LogoLoader } from '@/components/brand/logo-loader'
import { FilterChips } from '@/components/ui/module-tabs'
import { PageHeader } from '@/components/ui/page-header'
import { LoadError } from '@/components/ui/load-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { DataTable } from '@/components/ui/data-table'

/* ═════════════════════════ Shared helpers ═════════════════════════ */

function revalidateVaccination(url: string) {
 return globalMutate(key => vaccinationKeyMatches(key,url))
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Date-only strings (YYYY-MM-DD)
function formatYmd(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}




/* ═════════════════════════ Batch Requests (NIP-USR010) ═════════════════════════ */

type BatchPayload = {
  requests: BatchRequestRow[]
  role: UserRole
  can_create: boolean
  can_approve: boolean
}

const BATCH_STATUS_META: Record<string, { label: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', icon: <Clock size={11} /> },
  APPROVED: { label: 'Approved', icon: <CheckCircle2 size={11} /> },
  REJECTED: { label: 'Rejected', icon: <XCircle size={11} /> },
  COMPLETED: { label: 'Completed', icon: <CheckCircle2 size={11} /> },
  CANCELLED: { label: 'Cancelled', icon: <XCircle size={11} /> },
}

export function BatchRequestsSection() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const canView = role ? canPerform(role, 'Vaccine Batch Requests', 'view') : false
  const canTrace = role === 'Public Health Nurse' || role === 'Administrator'

  const [statusFilter, setStatusFilter] = useState<string>('')
  const url = statusFilter
    ? `/api/vaccination/batch-requests?status=${statusFilter}`
    : '/api/vaccination/batch-requests'

  const { data, error, isLoading, refreshing, readOnly, savedAt, mutate } = useVaccinationView<BatchPayload>(isReady && canView ? url : null)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [decisionTarget, setDecisionTarget] = useState<BatchRequestRow | null>(null)

  if (!isReady) {
    return <LogoLoader />
  }
  if (!canView) {
    return (
      <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-rose-700" />
          <div>
            <h2 className="text-lg font-bold text-rose-900">Not authorized</h2>
            <p className="mt-1 text-sm text-rose-700">You do not have access to vaccine batch requests.</p>
          </div>
        </div>
      </div>
    )
  }

  const allRows = data?.requests ?? []
  const q = search.trim().toLowerCase()
  const rows = q ? allRows.filter((r) => [one(r.item)?.item_name, one(r.vaccine)?.vaccine_type, r.batch_number, one(r.target_barangay)?.barangay_name, String(r.stock_request_id)]
    .some((x) => x?.toLowerCase().includes(q))) : allRows
  const canCreate = !readOnly && (data?.can_create ?? false)
  const canApprove = !readOnly && (data?.can_approve ?? false)
  const count = (st: string) => allRows.filter((r) => r.status === st).length

  function refresh() {
    revalidateVaccination(url)
  }

  return (
    <div className="space-y-6">
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />
      <PageHeader
        title="Vaccine Batch Requests"
        subtitle={<>RHMs request vaccine batches for a barangay; the PHN reviews them. Approval adds the doses to that barangay&rsquo;s inventory.</>}
        actions={canCreate && <Button onClick={() => setCreateOpen(true)}><Plus size={17} aria-hidden="true" /> New request</Button>}
      />

      {isLoading ? (
        <LogoLoader size="section" label="Loading requests…" />
      ) : error && !data ? (
        <LoadError what="batch requests" error={error} retrying={refreshing} onRetry={() => void mutate()} />
      ) : (<>
        {!statusFilter && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Requests" value={allRows.length} />
            <StatCard label="Pending review" value={count('PENDING')} tone="warn" />
            <StatCard label="Approved" value={count('APPROVED')} tone="good" />
            <StatCard label="Rejected" value={count('REJECTED')} tone="danger" />
          </div>
        )}
        <DataTable
          rows={rows}
          rowKey={(r) => r.stock_request_id}
          caption="Vaccine batch requests"
          refreshing={refreshing}
          mobile="cards"
          onRowClick={readOnly ? undefined : (r) => setDecisionTarget(r)}
          rowLabel={(r) => `Open request #${r.stock_request_id}`}
          toolbar={
            <fieldset disabled={readOnly} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <FilterChips
                label="Filter by status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={(['', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => ({ value: st, label: st === '' ? 'All' : BATCH_STATUS_META[st]?.label ?? st }))}
              />
              <div className="relative lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                <Input aria-label="Search requests" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vaccine, batch or barangay…" className="pl-9" />
              </div>
            </fieldset>
          }
          empty={{
            icon: Package,
            title: q ? 'No requests match this search' : statusFilter ? `No ${BATCH_STATUS_META[statusFilter]?.label.toLowerCase() ?? statusFilter.toLowerCase()} requests` : 'No batch requests yet',
            description: canCreate ? 'Use “New request” to submit a batch request.' : 'Nothing to review right now.',
          }}
          columns={[
            {
              key: 'vaccine', header: 'Vaccine · Batch', sortValue: (r) => one(r.item)?.item_name ?? one(r.vaccine)?.vaccine_type ?? '',
              cell: (r) => (
                <div>
                  <div className="font-semibold text-brand-navy">{one(r.item)?.item_name ?? one(r.vaccine)?.vaccine_type ?? '—'}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash size={10} aria-hidden="true" />
                    {r.batch_number && canTrace ? <Link href={`/inventory/batch-trace?batch_number=${encodeURIComponent(r.batch_number)}`} className="font-medium text-brand-blue hover:underline">{r.batch_number}</Link> : r.batch_number ?? '—'}
                    <span className="font-mono">· #{r.stock_request_id}</span>
                  </div>
                </div>
              ),
            },
            { key: 'qty', header: 'Qty', align: 'right', sortValue: (r) => r.requested_quantity, cell: (r) => <span><strong>{r.requested_quantity}</strong> <span className="text-xs text-muted-foreground">{one(r.item)?.unit ?? 'dose(s)'}</span></span> },
            {
              key: 'barangay', header: 'Barangay · requested', sortValue: (r) => r.request_date,
              cell: (r) => (
                <span className="flex flex-col items-end text-muted-foreground sm:items-start">
                  <span className="flex items-center gap-1"><MapPin size={11} aria-hidden="true" /> {one(r.target_barangay)?.barangay_name ?? '—'}</span>
                  <span className="flex items-center gap-1 text-xs"><CalendarClock size={10} aria-hidden="true" /> {formatYmd(r.request_date)}</span>
                </span>
              ),
            },
            { key: 'status', header: 'Status', sortValue: (r) => r.status, cell: (r) => { const meta = BATCH_STATUS_META[r.status] ?? BATCH_STATUS_META.PENDING; return <StatusBadge status={r.status} label={meta.label} icon={meta.icon} /> } },
            {
              key: 'action', header: 'Action',
              cell: (r) => (
                <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setDecisionTarget(r)}>
                  {canApprove && r.status === 'PENDING' ? 'Review' : 'View'}
                </Button>
              ),
            },
          ]}
        />
      </>)}

      {/* Modals */}
      <BatchRequestModal
        open={createOpen && !readOnly}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />
      <BatchRequestDecisionModal
        open={!!decisionTarget && !readOnly}
        onClose={() => setDecisionTarget(null)}
        onDecided={refresh}
        request={decisionTarget}
      />
    </div>
  )
}
