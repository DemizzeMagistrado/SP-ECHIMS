'use client'
// INV-USR005 — replenishment requests. RHM: own requests, New request, Edit and resubmit when returned.
// PHN: RHU inbox, Review (Approve / Return for revision), then fulfil through Allocation.
import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { PackagePlus, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { FilterCard } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { GridTable, RowButton } from '@/components/ui/grid-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { LoadError } from '@/components/ui/load-error'
import { LogoLoader } from '@/components/brand/logo-loader'
import { ReplenishmentRequestModal } from '@/components/inventory/replenishment-request-modal'
import { ReplenishmentDecisionModal, type ReplenishmentRequest } from '@/components/inventory/replenishment-decision-modal'
import { ResubmitStockRequestModal } from '@/components/inventory/resubmit-stock-request-modal'
import { InventorySection } from './InventorySection'
import { fetcher, formatYmd, one, stripReqMarker } from './inventory-utils'

const URL_ = '/api/inventory/replenishment'

export function ReplenishmentSection({ userId, canRequest, canReview, first }: { userId: string; canRequest: boolean; canReview: boolean; first?: boolean }) {
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [reviewing, setReviewing] = useState<ReplenishmentRequest | null>(null)
  const [resubmitting, setResubmitting] = useState<ReplenishmentRequest | null>(null)
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ requests: ReplenishmentRequest[] }>(URL_, fetcher, { keepPreviousData: true })

  const all = useMemo(() => data?.requests ?? [], [data])
  const count = (s: string) => all.filter((r) => r.status === s).length
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((r) => (!status || r.status === status) && (!q || [one(r.item)?.item_name, one(r.target_barangay)?.barangay_name, r.requester?.full_name, String(r.stock_request_id), stripReqMarker(r.remarks)].some((v) => v?.toLowerCase().includes(q))))
  }, [all, status, search])

  const refresh = () => void mutate()

  return (
    <InventorySection
      id="replenishment"
      first={first}
      title="Replenishment"
      subtitle="Restock requests from midwives; the PHN reviews them and fulfils approved ones through Allocation."
      about={<InfoContent
        title="Replenishment"
        description="An RHM asks for more stock for a barangay; the PHN approves it or returns it for revision."
        sections={[
          { label: 'Values', value: ['Pending = waiting for PHN review', 'Needs revision = the RHM edits and resubmits it', 'Approved = fulfil it through Allocation'] },
          { label: 'Tip', value: 'Use Status to show only one status' },
        ]}
        note="Approving does not move stock by itself; allocate it to the barangay after."
      />}
      actions={canRequest && <Button onClick={() => setCreateOpen(true)}><Plus size={17} aria-hidden="true" /> New request</Button>}
    >
      <FilterCard
        refresh={<Button variant="secondary" size="icon" className="size-10" aria-label="Refresh" disabled={isValidating} onClick={refresh} title="Refresh"><RefreshCw size={16} aria-hidden="true" className={isValidating ? "animate-spin motion-reduce:animate-none" : undefined} /></Button>}
      >
        <div className="relative sm:col-span-2">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search replenishment requests" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, barangay or requester…" className="pl-9" />
        </div>
        {/* Status filter (was the Pending / Needs revision / Approved count buttons); same filtering. */}
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending{data ? ` (${count('PENDING')})` : ''}</option>
          <option value="NEEDS_REVISION">Needs revision{data ? ` (${count('NEEDS_REVISION')})` : ''}</option>
          <option value="APPROVED">Approved{data ? ` (${count('APPROVED')})` : ''}</option>
        </Select>
      </FilterCard>

      {isLoading && !data ? (
        <LogoLoader size="section" label="Loading requests…" />
      ) : error && !data ? (
        <LoadError what="replenishment requests" error={error} retrying={isValidating} onRetry={refresh} />
      ) : (
        <GridTable
          caption="Replenishment requests"
          pageSize={5}
          rows={rows}
          rowKey={(r) => r.stock_request_id}
          onRowClick={setReviewing}
          empty={{ icon: PackagePlus, title: all.length ? 'No requests match these filters' : canRequest ? 'No replenishment requests yet' : 'No requests to review', description: canRequest ? 'Use "New request" when your stock runs low.' : 'Requests from midwives appear here.' }}
          columns={[
            { key: 'request', header: 'Request', width: '15%', cell: (r) => <><span className="block font-semibold text-[#0C1260]">#{r.stock_request_id}</span><span className="block text-xs text-[#8896B0]">{formatYmd(r.request_date)}</span></> },
            { key: 'item', header: 'Item', width: '20%', cell: (r) => <span className="block truncate">{one(r.item)?.item_name ?? '—'}</span> },
            { key: 'qty', header: 'Quantity', width: '11%', align: 'right', cell: (r) => <><span className="font-semibold text-[#0C1260]">{Number(r.requested_quantity).toLocaleString()}</span> <span className="text-xs text-[#8896B0]">{one(r.item)?.unit ?? ''}</span></> },
            { key: 'barangay', header: 'Barangay', width: '15%', cell: (r) => <span className="block truncate">{one(r.target_barangay)?.barangay_name ?? '—'}</span> },
            { key: 'by', header: 'Requested by', width: '14%', cell: (r) => <span className="block truncate">{r.requester?.full_name ?? r.requester?.email ?? '—'}</span> },
            { key: 'status', header: 'Status', width: '11%', cell: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: 'Actions', width: '14%', sticky: true,
              cell: (r) => r.status === 'NEEDS_REVISION' && r.requested_by === userId
                ? <RowButton onClick={(e) => { e.stopPropagation(); setResubmitting(r) }}>Edit and resubmit</RowButton>
                : <RowButton onClick={(e) => { e.stopPropagation(); setReviewing(r) }}>{canReview && r.status === 'PENDING' ? 'Review' : 'View details'}</RowButton>,
            },
          ]}
        />
      )}

      <ReplenishmentRequestModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={refresh} />
      <ReplenishmentDecisionModal open={!!reviewing} onClose={() => setReviewing(null)} onDecided={refresh} request={reviewing} canDecide={canReview} />
      {resubmitting && (
        <ResubmitStockRequestModal
          request={{ ...resubmitting, request_type: 'REPLENISHMENT', item_name: one(resubmitting.item)?.item_name, unit: one(resubmitting.item)?.unit }}
          onClose={() => setResubmitting(null)}
          onDone={() => { setResubmitting(null); refresh() }}
        />
      )}
    </InventorySection>
  )
}
