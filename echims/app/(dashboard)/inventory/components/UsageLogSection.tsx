'use client'
// INV-USR004 — usage and waste history + Log usage/waste (RHM). Offline-queued entries replay on mount.
import { useEffect, useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { CloudOff, PackageMinus, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { CountsStrip } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { GridTable, RowButton } from '@/components/ui/grid-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { LoadError } from '@/components/ui/load-error'
import { LogoLoader } from '@/components/brand/logo-loader'
import { toast } from '@/components/ui/toast'
import { LogUsageModal } from '@/components/inventory/log-usage-modal'
import { getQueuedUsageCount, replayQueuedUsage } from '@/lib/inventory-offline'
import { InventorySection } from './InventorySection'
import { fetcher, formatDateTime } from './inventory-utils'

type Entry = {
  id: number
  date: string
  subtype: 'USAGE' | 'WASTE' | string
  item_name: string | null
  unit: string | null
  batch_number: string | null
  barangay_name: string | null
  quantity: number
  remarks: string | null
  recorded_by: string | null
}

const URL_ = '/api/inventory/transactions?kind=usage'

export function UsageLogSection({ canLog, canTrace, onTrace, first }: { canLog: boolean; canTrace: boolean; onTrace: (batch: string) => void; first?: boolean }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('')
  const [queued, setQueued] = useState(0)
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ entries: Entry[] }>(URL_, fetcher, { keepPreviousData: true })

  // Replay entries queued offline, then refresh. The RPC is idempotent: a resend is a safe 409.
  useEffect(() => {
    void replayQueuedUsage().then(({ sent }) => {
      if (sent > 0) {
        toast.success(`Synced ${sent} offline-queued ${sent === 1 ? 'entry' : 'entries'}.`)
        void mutate()
        void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/inventory/stock-overview'))
      }
      setQueued(getQueuedUsageCount())
    })
  }, [mutate])

  const all = useMemo(() => data?.entries ?? [], [data])
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((e) => (!kind || e.subtype === kind) && (!q || [e.item_name, e.batch_number, e.barangay_name, e.remarks, e.recorded_by].some((v) => v?.toLowerCase().includes(q))))
  }, [all, search, kind])

  return (
    <InventorySection
      id="usage-log"
      first={first}
      title="Usage log"
      subtitle="Stock used or wasted at each barangay, newest first."
      about={<InfoContent
        title="Usage log"
        description="Every usage or waste entry deducts the batch and the barangay's on-hand stock right away."
        sections={[{ label: 'Values', value: ['Usage = consumed in normal work (vaccinations, supplementation, walk-ins)', 'Waste = lost stock (expired, broken vial, cold-chain break); needs a reason'] }]}
        bullets={['Offline entries queue on this device and sync on your next visit']}
        note="Only the RHM logs usage and waste."
      />}
      actions={<>{canLog && <Button onClick={() => setOpen(true)}><Plus size={17} aria-hidden="true" /> Log usage/waste</Button>}<Button variant="outline" size="icon" className="size-10" aria-label="Refresh usage log" title="Refresh" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={16} aria-hidden="true" className={isValidating ? 'animate-spin motion-reduce:animate-none' : undefined} /></Button></>}
    >
      {queued > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-[#F3D9A4] bg-[#FFF4DB] px-4 py-3 text-sm text-[#9C6B10]">
          <CloudOff size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span><strong>{queued}</strong> {queued === 1 ? 'entry is' : 'entries are'} still queued offline. They sync on your next visit while online.</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search usage" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, batch or barangay…" className="pl-9" />
        </div>
        <Select aria-label="Entry type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Usage and waste</option>
          <option value="USAGE">Usage only</option>
          <option value="WASTE">Waste only</option>
        </Select>
      </div>
      {data && <CountsStrip label="Usage counts" selected={kind} onSelect={(k) => setKind(kind === k ? '' : k)} items={[
          { key: 'USAGE', label: 'Usage entries', value: all.filter((e) => e.subtype === 'USAGE').length },
          { key: 'WASTE', label: 'Waste entries', value: all.filter((e) => e.subtype === 'WASTE').length, tone: 'severe' },
          { key: '', label: 'All entries', value: all.length },
        ]} />}

      {isLoading && !data ? (
        <LogoLoader size="section" label="Loading usage…" />
      ) : error && !data ? (
        <LoadError what="the usage log" error={error} retrying={isValidating} onRetry={() => void mutate()} />
      ) : (
        <GridTable
          caption="Usage and waste"
          pageSize={5}
          rows={rows}
          rowKey={(e) => e.id}
          empty={{ icon: PackageMinus, title: search || kind ? 'No entries match these filters' : 'No usage logged yet', description: canLog ? 'Use "Log usage/waste" after a session.' : 'Usage and waste logged by midwives appear here.' }}
          columns={[
            { key: 'date', header: 'Date', width: '15%', cell: (e) => formatDateTime(e.date) },
            { key: 'item', header: 'Item · Batch', width: '21%', cell: (e) => <><span className="block truncate font-semibold text-[#0C1260]">{e.item_name ?? '—'}</span><span className="block font-mono text-xs text-[#8896B0]">{e.batch_number ?? '—'}</span></> },
            { key: 'barangay', header: 'Barangay', width: '14%', cell: (e) => <span className="block truncate">{e.barangay_name ?? '—'}</span> },
            { key: 'type', header: 'Type', width: '10%', cell: (e) => <StatusBadge status={e.subtype} tone={e.subtype === 'WASTE' ? 'danger' : 'info'} label={e.subtype === 'WASTE' ? 'Waste' : 'Usage'} /> },
            { key: 'qty', header: 'Quantity', width: '10%', align: 'right', cell: (e) => <><span className="font-semibold text-[#0C1260]">{e.quantity.toLocaleString()}</span> <span className="text-xs text-[#8896B0]">{e.unit ?? ''}</span></> },
            { key: 'by', header: 'Recorded by · Remarks', width: '18%', cell: (e) => <><span className="block truncate">{e.recorded_by ?? '—'}</span>{e.remarks && <span className="block truncate text-xs text-[#8896B0]" title={e.remarks}>{e.remarks}</span>}</> },
            {
              key: 'actions', header: 'Actions', width: '12%', sticky: true,
              cell: (e) => canTrace && e.batch_number ? <RowButton onClick={() => onTrace(e.batch_number!)} aria-label={`Trace batch ${e.batch_number}`}>Trace batch</RowButton> : <span className="text-[#8896B0]">—</span>,
            },
          ]}
        />
      )}

      <LogUsageModal open={open} onClose={() => setOpen(false)} onSaved={() => { void mutate(); setQueued(getQueuedUsageCount()); void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/inventory/stock-overview')) }} />
    </InventorySection>
  )
}
