'use client'
// INV-USR003 — batch moves between barangays (history) + New allocation (PHN).
import { useMemo, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { ArrowRight, Plus, RefreshCw, Search, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { CountsStrip } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { GridTable, RowButton } from '@/components/ui/grid-table'
import { LoadError } from '@/components/ui/load-error'
import { LogoLoader } from '@/components/brand/logo-loader'
import { AllocateStockModal } from '@/components/inventory/allocate-stock-modal'
import { InventorySection } from './InventorySection'
import { fetcher, formatDateTime } from './inventory-utils'

type Move = {
  id: string
  date: string
  item_name: string | null
  unit: string | null
  batch_number: string | null
  expiry_date: string | null
  quantity: number
  from: string | null
  to: string | null
  recorded_by: string | null
}

const URL_ = '/api/inventory/transactions?kind=allocation'

export function AllocationSection({ canAllocate, canTrace, onTrace, first }: { canAllocate: boolean; canTrace: boolean; onTrace: (batch: string) => void; first?: boolean }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ entries: Move[] }>(URL_, fetcher, { keepPreviousData: true })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = data?.entries ?? []
    return q ? all.filter((m) => [m.item_name, m.batch_number, m.from, m.to, m.recorded_by].some((v) => v?.toLowerCase().includes(q))) : all
  }, [data, search])
  // Counts row like the sibling sections (Stock overview, Usage log): from the loaded entries only.
  const counts = useMemo(() => {
    const all = data?.entries ?? []
    return {
      allocations: all.length,
      barangays: new Set(all.map((m) => m.to).filter(Boolean)).size,
      batches: new Set(all.map((m) => m.batch_number).filter(Boolean)).size,
      units: all.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0),
    }
  }, [data])

  return (
    <InventorySection
      id="allocation"
      first={first}
      title="Allocation"
      subtitle="Batches moved from one barangay to another, newest first."
      about={<InfoContent
        title="Allocation"
        description="Each move takes stock from one barangay's batch and adds it to another; the batch number and expiry carry over."
        sections={[{ label: 'Format', value: 'ALLOC:[reference]' }, { label: 'Tip', value: 'Trace batch shows where a batch went and which children received it' }]}
        note="Only the PHN allocates stock. Both barangays' on-hand figures update together."
      />}
      actions={<>{canAllocate && <Button onClick={() => setOpen(true)}><Plus size={17} aria-hidden="true" /> New allocation</Button>}<Button variant="outline" size="icon" className="size-10" aria-label="Refresh allocations" title="Refresh" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={16} aria-hidden="true" className={isValidating ? 'animate-spin motion-reduce:animate-none' : undefined} /></Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search allocations" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, batch or barangay…" className="pl-9" />
        </div>
      </div>
      {data && <CountsStrip label="Allocation counts" items={[
          { label: 'Allocations', value: counts.allocations },
          { label: 'Barangays', value: counts.barangays },
          { label: 'Batches', value: counts.batches },
          { label: 'Units allocated', value: counts.units.toLocaleString() },
        ]} />}

      {isLoading && !data ? (
        <LogoLoader size="section" label="Loading allocations…" />
      ) : error && !data ? (
        <LoadError what="allocations" error={error} retrying={isValidating} onRetry={() => void mutate()} />
      ) : (
        <GridTable
          caption="Allocations"
          pageSize={5}
          rows={rows}
          rowKey={(m) => m.id}
          empty={{ icon: Send, title: search ? 'No allocations match this search' : 'No allocations yet', description: canAllocate ? 'Use "New allocation" to move a batch to another barangay.' : 'Batch moves to and from your barangays appear here.' }}
          columns={[
            { key: 'date', header: 'Date', width: '15%', cell: (m) => formatDateTime(m.date) },
            { key: 'item', header: 'Item · Batch', width: '22%', cell: (m) => <><span className="block truncate font-semibold text-[#0C1260]">{m.item_name ?? '—'}</span><span className="block font-mono text-xs text-[#8896B0]">{m.batch_number ?? '—'}</span></> },
            { key: 'route', header: 'From → To', width: '24%', cell: (m) => <span className="flex flex-wrap items-center gap-1.5"><span>{m.from ?? 'Another barangay'}</span><ArrowRight size={13} aria-hidden="true" className="text-[#8896B0]" /><span>{m.to ?? 'Another barangay'}</span></span> },
            { key: 'qty', header: 'Quantity', width: '11%', align: 'right', cell: (m) => <><span className="font-semibold text-[#0C1260]">{m.quantity.toLocaleString()}</span> <span className="text-xs text-[#8896B0]">{m.unit ?? ''}</span></> },
            { key: 'by', header: 'Recorded by', width: '14%', cell: (m) => <span className="block truncate">{m.recorded_by ?? '—'}</span> },
            {
              key: 'actions', header: 'Actions', width: '14%', sticky: true,
              cell: (m) => canTrace && m.batch_number ? <RowButton onClick={() => onTrace(m.batch_number!)} aria-label={`Trace batch ${m.batch_number}`}>Trace batch</RowButton> : <span className="text-[#8896B0]">—</span>,
            },
          ]}
        />
      )}

      <AllocateStockModal open={open} onClose={() => setOpen(false)} onSaved={() => { void mutate(); void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/inventory/stock-overview')) }} />
    </InventorySection>
  )
}
