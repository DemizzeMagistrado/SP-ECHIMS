'use client'
// INV-USR001/USR002 — stock levels: one row per item × barangay; View batches opens its batches with expiry.
import { useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { AlertCircle, Layers, Package, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { CountsStrip, FilterCard } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { GridTable, RowButton } from '@/components/ui/grid-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { LoadError } from '@/components/ui/load-error'
import { LogoLoader } from '@/components/brand/logo-loader'
import { Modal } from '@/components/ui/modal'
import { StockInModal } from '@/components/inventory/stock-in-modal'
import { InventorySection } from './InventorySection'
import { daysUntil, fetcher, formatYmd, one } from './inventory-utils'

type Batch = { batch_id: number; batch_number: string; expiry_date: string; received_date: string; quantity_on_hand: number }
type Item = { item_name: string; unit: string }
type InventoryRow = {
  inventory_id: number
  quantity_on_hand: number
  item: Item | Item[] | null
  barangay: { barangay_name: string } | { barangay_name: string }[] | null
  batches: Batch[]
  batch_sum: number
  has_drift: boolean
}
type Barangay = { barangay_id: number; barangay_name: string }

// Same marker the old page used: the alert evaluator has its own rule thresholds.
const LOW_STOCK = 10
const NEAR_EXPIRY_DAYS = 90

const item = (r: InventoryRow) => one(r.item)
const barangay = (r: InventoryRow) => one(r.barangay)
const liveBatches = (r: InventoryRow) => r.batches.filter((b) => Number(b.quantity_on_hand) > 0)

function expiryStatus(ymd: string) {
  const d = daysUntil(ymd)
  return d <= 0 ? { label: 'Expired', tone: 'danger' as const } : d <= NEAR_EXPIRY_DAYS ? { label: `Expires in ${d}d`, tone: 'warn' as const } : { label: 'OK', tone: 'good' as const }
}

export function StockOverviewSection({ canStockIn, first }: { canStockIn: boolean; first?: boolean }) {
  const [itemFilter, setItemFilter] = useState('')
  const [brgyFilter, setBrgyFilter] = useState('')
  const [stockInOpen, setStockInOpen] = useState(false)
  const [open, setOpen] = useState<InventoryRow | null>(null)

  const url = useMemo(() => {
    const qs = new URLSearchParams()
    if (itemFilter) qs.set('item_id', itemFilter)
    if (brgyFilter) qs.set('barangay_id', brgyFilter)
    return `/api/inventory/stock-overview${qs.size ? `?${qs}` : ''}`
  }, [itemFilter, brgyFilter])

  const { data, error, isLoading, isValidating, mutate } = useSWR<{ inventories: InventoryRow[] }>(url, fetcher, { keepPreviousData: true })
  const items = useSWR<{ items: { item_id: number; item_name: string }[] }>('/api/inventory/items', fetcher).data?.items ?? []
  const brgyData = useSWR<Barangay[] | { barangays: Barangay[] }>('/api/barangays', fetcher).data
  const barangays = Array.isArray(brgyData) ? brgyData : (brgyData?.barangays ?? [])
  const rows = useMemo(() => data?.inventories ?? [], [data])

  const counts = useMemo(() => {
    const batches = rows.flatMap(liveBatches)
    return {
      lines: rows.length,
      low: rows.filter((r) => Number(r.quantity_on_hand) <= LOW_STOCK).length,
      expiring: batches.filter((b) => { const d = daysUntil(b.expiry_date); return d > 0 && d <= NEAR_EXPIRY_DAYS }).length,
      expired: batches.filter((b) => daysUntil(b.expiry_date) <= 0).length,
    }
  }, [rows])

  return (
    <InventorySection
      id="stock-overview"
      first={first}
      title="Stock overview"
      subtitle="Quantity on hand per item and barangay, with each batch's expiry."
      about={<InfoContent
        title="Stock overview"
        description="Current stock levels by item and barangay, from the latest saved transactions."
        sections={[{ label: 'Values', value: [`Low stock = ${LOW_STOCK} or fewer on hand`, `Expiring = within ${NEAR_EXPIRY_DAYS} days`, 'Batch drift = batch totals differ from the on-hand figure'] }]}
        bullets={['Open a row to see its batches, received and expiry dates']}
        note="Only Admin and the PHN record stock-in."
      />}
      actions={canStockIn && <Button onClick={() => setStockInOpen(true)}><Plus size={17} aria-hidden="true" /> Record stock-in</Button>}
    >
      <FilterCard
        refresh={<Button variant="outline" size="icon" className="size-10" aria-label="Refresh stock" title="Refresh" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={16} aria-hidden="true" className={isValidating ? 'animate-spin motion-reduce:animate-none' : undefined} /></Button>}
        below={<CountsStrip label="Stock counts" items={[
          { label: 'Stock lines', value: data ? counts.lines : '–' },
          { label: 'Low stock', value: data ? counts.low : '–', tone: 'review' },
          { label: `Expiring within ${NEAR_EXPIRY_DAYS} days`, value: data ? counts.expiring : '–', tone: 'review' },
          { label: 'Expired batches', value: data ? counts.expired : '–', tone: 'severe' },
        ]} />}
      >
        <Select aria-label="Item" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
          <option value="">All items</option>
          {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
        </Select>
        <Select aria-label="Barangay" value={brgyFilter} onChange={(e) => setBrgyFilter(e.target.value)}>
          <option value="">All barangays</option>
          {barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
        </Select>
      </FilterCard>

      {isLoading && !data ? (
        <LogoLoader size="section" label="Loading stock…" />
      ) : error && !data ? (
        <LoadError what="stock levels" error={error} retrying={isValidating} onRetry={() => void mutate()} />
      ) : (
        <GridTable
          caption="Stock levels"
          pageSize={5}
          rows={rows}
          rowKey={(r) => r.inventory_id}
          onRowClick={setOpen}
          empty={{ icon: Package, title: 'No stock to show', description: canStockIn ? 'Use "Record stock-in" to receive your first shipment.' : 'Ask the PHN to record a stock-in for this barangay.' }}
          columns={[
            { key: 'item', header: 'Item', width: '24%', cell: (r) => <><span className="block truncate font-semibold text-[#0C1260]">{item(r)?.item_name ?? '—'}</span><span className="block text-xs text-[#8896B0]">{item(r)?.unit ?? ''}</span></> },
            { key: 'barangay', header: 'Barangay', width: '18%', cell: (r) => <span className="block truncate">{barangay(r)?.barangay_name ?? '—'}</span> },
            { key: 'qty', header: 'On hand', width: '11%', align: 'right', cell: (r) => <span className="font-semibold text-[#0C1260]">{Number(r.quantity_on_hand).toLocaleString()}</span> },
            {
              key: 'expiry', header: 'Nearest expiry', width: '17%',
              cell: (r) => {
                const next = [...liveBatches(r)].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0]
                return next ? <><span className="block">{formatYmd(next.expiry_date)}</span><span className="block text-xs text-[#8896B0]">{liveBatches(r).length} {liveBatches(r).length === 1 ? 'batch' : 'batches'}</span></> : <span className="text-[#8896B0]">No batches</span>
              },
            },
            {
              key: 'status', header: 'Status', width: '16%',
              cell: (r) => {
                const next = [...liveBatches(r)].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0]
                const exp = next ? expiryStatus(next.expiry_date) : null
                return <span className="flex flex-wrap gap-1.5">
                  {Number(r.quantity_on_hand) <= LOW_STOCK && <StatusBadge status="low-stock" label="Low stock" />}
                  {exp && exp.tone !== 'good' && <StatusBadge status="expiry" tone={exp.tone} label={exp.label} />}
                  {r.has_drift && <StatusBadge status="drift" tone="warn" label="Batch drift" />}
                  {Number(r.quantity_on_hand) > LOW_STOCK && (!exp || exp.tone === 'good') && !r.has_drift && <StatusBadge status="ok" tone="good" label="OK" />}
                </span>
              },
            },
            { key: 'actions', header: 'Actions', width: '14%', sticky: true, cell: (r) => <RowButton aria-label={`View batches of ${item(r)?.item_name ?? 'item'} in ${barangay(r)?.barangay_name ?? 'barangay'}`} onClick={(e) => { e.stopPropagation(); setOpen(r) }}>View batches</RowButton> },
          ]}
        />
      )}

      {open && (
        <Modal
          open
          size="form"
          onClose={() => setOpen(null)}
          cancelLabel="Close"
          icon={<Layers />}
          title={item(open)?.item_name ?? 'Item'}
          subtitle={`${barangay(open)?.barangay_name ?? '—'} · ${Number(open.quantity_on_hand).toLocaleString()} ${item(open)?.unit ?? ''} on hand`}
        >
          <div className="space-y-3">
            {open.has_drift && (
              <p className="flex items-start gap-2 rounded-xl border border-[#F3D9A4] bg-[#FFF4DB] p-3 text-sm text-[#9C6B10]">
                <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                Batches add up to {open.batch_sum.toLocaleString()}, but the on-hand figure is {Number(open.quantity_on_hand).toLocaleString()}.
              </p>
            )}
            <GridTable
              caption="Batches"
              rows={open.batches}
              rowKey={(b) => b.batch_id}
              minWidth={520}
              pageSize={5}
              empty={{ icon: Layers, title: 'No batches recorded yet', description: 'Batches appear here after a stock-in.' }}
              columns={[
                { key: 'batch', header: 'Batch', cell: (b) => <span className="font-mono text-xs text-[#0C1260]">{b.batch_number}</span> },
                { key: 'qty', header: 'On hand', align: 'right', cell: (b) => Number(b.quantity_on_hand).toLocaleString() },
                { key: 'received', header: 'Received', cell: (b) => formatYmd(b.received_date) },
                { key: 'expiry', header: 'Expiry', cell: (b) => { const s = expiryStatus(b.expiry_date); return <><span className="block">{formatYmd(b.expiry_date)}</span><StatusBadge status="expiry" tone={s.tone} label={s.label} className="mt-1" /></> } },
              ]}
            />
          </div>
        </Modal>
      )}

      <StockInModal open={stockInOpen} onClose={() => setStockInOpen(false)} onSaved={() => { void globalMutate(url) }} />
    </InventorySection>
  )
}
