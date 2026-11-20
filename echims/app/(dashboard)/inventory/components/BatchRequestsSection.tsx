'use client'
// NIP-USR010 — vaccine batch requests (moved here from Vaccination; permission 'Vaccine Batch Requests').
// RHM requests a batch for a barangay; the PHN approves it (doses added to that barangay) or returns
// it for revision; the RHM edits and resubmits. Works from the offline snapshot read-only.
import { useMemo, useState } from 'react'
import { Package, Plus, RefreshCw, Search } from 'lucide-react'
import { refreshOfflineViews as globalMutate } from '@/lib/offline/refresh'
import { useVaccinationView } from '@/hooks/use-vaccination-view'
import { vaccinationKeyMatches } from '@/lib/vaccination-cache'
import type { UserRole } from '@/lib/echims-data'
import { VaccinationSnapshotNotice } from '@/components/vaccination/vaccination-offline-tools'
import { BatchRequestModal } from '@/components/vaccination/batch-request-modal'
import { BatchRequestDecisionModal, type BatchRequestRow } from '@/components/vaccination/batch-request-decision-modal'
import { ResubmitStockRequestModal } from '@/components/inventory/resubmit-stock-request-modal'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { FilterCard } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { GridTable, RowButton } from '@/components/ui/grid-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { LoadError } from '@/components/ui/load-error'
import { LogoLoader } from '@/components/brand/logo-loader'
import { InventorySection } from './InventorySection'
import { formatYmd, one } from './inventory-utils'

type BatchPayload = { requests: BatchRequestRow[]; role: UserRole; can_create: boolean; can_approve: boolean }

const URL_ = '/api/vaccination/batch-requests'

export function BatchRequestsSection({ userId, canTrace, onTrace, first }: { userId: string; canTrace: boolean; onTrace: (batch: string) => void; first?: boolean }) {
  const { data, error, isLoading, refreshing, readOnly, savedAt, mutate } = useVaccinationView<BatchPayload>(URL_)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [reviewing, setReviewing] = useState<BatchRequestRow | null>(null)
  const [resubmitting, setResubmitting] = useState<BatchRequestRow | null>(null)

  const all = useMemo(() => data?.requests ?? [], [data])
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((r) => (!status || r.status === status) && (!q || [one(r.item)?.item_name, one(r.vaccine)?.vaccine_type, r.batch_number, one(r.target_barangay)?.barangay_name, String(r.stock_request_id)].some((v) => v?.toLowerCase().includes(q))))
  }, [all, status, search])
  const canCreate = !readOnly && (data?.can_create ?? false)
  const canApprove = !readOnly && (data?.can_approve ?? false)
  const refresh = () => void globalMutate((key) => vaccinationKeyMatches(key, URL_))

  return (
    <InventorySection
      id="batch-requests"
      first={first}
      title="Batch requests"
      subtitle="Vaccine batches requested for a barangay. Approval adds the doses to that barangay's stock."
      about={<InfoContent
        title="Batch requests"
        description="An RHM requests a vaccine batch for a barangay; the PHN approves it or returns it for revision."
        sections={[
          { label: 'Values', value: ['Pending = waiting for PHN review', 'Needs revision = the RHM corrects and resubmits it', 'Approved = doses added to the barangay'] },
          { label: 'Tip', value: 'Select a batch number to trace where it went' },
        ]}
      />}
      actions={canCreate && <Button onClick={() => setCreateOpen(true)}><Plus size={17} aria-hidden="true" /> New request</Button>}
    >
      <VaccinationSnapshotNotice savedAt={savedAt} readOnly={readOnly} />

      <FilterCard
        refresh={<Button variant="secondary" size="icon" className="size-10" aria-label="Refresh" disabled={refreshing || readOnly} onClick={() => void mutate()} title="Refresh"><RefreshCw size={16} aria-hidden="true" className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} /></Button>}
      >
        <div className="relative sm:col-span-2">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search batch requests" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vaccine, batch or barangay…" className="pl-9" />
        </div>
        {/* Status filter (was the count buttons); same filtering. */}
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="NEEDS_REVISION">Needs revision</option>
          <option value="APPROVED">Approved</option>
        </Select>
      </FilterCard>

      {isLoading ? (
        <LogoLoader size="section" label="Loading requests…" />
      ) : error && !data ? (
        <LoadError what="batch requests" error={error} retrying={refreshing} onRetry={() => void mutate()} />
      ) : (
        <GridTable
          caption="Vaccine batch requests"
          pageSize={5}
          rows={rows}
          rowKey={(r) => r.stock_request_id}
          onRowClick={readOnly ? undefined : setReviewing}
          empty={{ icon: Package, title: all.length ? 'No requests match these filters' : 'No batch requests yet', description: canCreate ? 'Use "New request" to request a vaccine batch.' : 'Nothing to review right now.' }}
          columns={[
            {
              key: 'vaccine', header: 'Vaccine · Batch', width: '24%',
              cell: (r) => <>
                <span className="block truncate font-semibold text-[#0C1260]">{one(r.item)?.item_name ?? one(r.vaccine)?.vaccine_type ?? '—'}</span>
                <span className="block text-xs text-[#8896B0]">
                  {r.batch_number && canTrace
                    ? <button type="button" onClick={(e) => { e.stopPropagation(); onTrace(r.batch_number!) }} className="font-mono font-medium text-[#0B759A] hover:underline">{r.batch_number}</button>
                    : <span className="font-mono">{r.batch_number ?? '—'}</span>}
                  {' '}· #{r.stock_request_id}
                </span>
              </>,
            },
            { key: 'qty', header: 'Quantity', width: '11%', align: 'right', cell: (r) => <><span className="font-semibold text-[#0C1260]">{r.requested_quantity}</span> <span className="text-xs text-[#8896B0]">{one(r.item)?.unit ?? 'doses'}</span></> },
            { key: 'barangay', header: 'Barangay', width: '17%', cell: (r) => <span className="block truncate">{one(r.target_barangay)?.barangay_name ?? '—'}</span> },
            { key: 'date', header: 'Requested', width: '14%', cell: (r) => formatYmd(r.request_date) },
            { key: 'status', header: 'Status', width: '14%', cell: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: 'Actions', width: '20%', sticky: true,
              cell: (r) => r.status === 'NEEDS_REVISION' && r.requested_by === userId && !readOnly
                ? <RowButton onClick={(e) => { e.stopPropagation(); setResubmitting(r) }}>Edit and resubmit</RowButton>
                : <RowButton disabled={readOnly} onClick={(e) => { e.stopPropagation(); setReviewing(r) }}>{canApprove && r.status === 'PENDING' ? 'Review' : 'View details'}</RowButton>,
            },
          ]}
        />
      )}

      <BatchRequestModal open={createOpen && !readOnly} onClose={() => setCreateOpen(false)} onSaved={refresh} />
      <BatchRequestDecisionModal open={!!reviewing && !readOnly} onClose={() => setReviewing(null)} onDecided={refresh} request={reviewing} canDecide={canApprove} />
      {resubmitting && (
        <ResubmitStockRequestModal
          request={{ ...resubmitting, request_type: 'VACCINE_BATCH', requested_quantity: Number(resubmitting.requested_quantity), item_name: one(resubmitting.item)?.item_name ?? one(resubmitting.vaccine)?.vaccine_type, unit: one(resubmitting.item)?.unit }}
          onClose={() => setResubmitting(null)}
          onDone={() => { setResubmitting(null); refresh() }}
        />
      )}
    </InventorySection>
  )
}
