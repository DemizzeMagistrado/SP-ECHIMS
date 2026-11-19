'use client'
// INV-USR006 — enter a batch number: barangays holding it, every transaction, and every child who
// received a dose from it. PHN/Admin only. CSV export of the transactions and children.
import { useState, useSyncExternalStore, type FormEvent } from 'react'
import useSWR from 'swr'
import { Clock, Download, Hash, MapPin, Package, Search, Users } from 'lucide-react'
import { normalizeBatchNumber } from '@/lib/vaccination-config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { CountsStrip, REPORT_CARD } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { GridTable } from '@/components/ui/grid-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { LoadError } from '@/components/ui/load-error'
import { LogoLoader } from '@/components/brand/logo-loader'
import { InventorySection } from './InventorySection'
import { fetcher, formatDateTime, formatYmd, one } from './inventory-utils'

/* eslint-disable @typescript-eslint/no-explicit-any -- batch-trace API rows are loosely typed embeds */
type TracePayload = {
  batch_number: string
  batches: any[]
  transactions: any[]
  vaccinations: any[]
  supplementations: any[]
  counts: { batches: number; transactions: number; children_vaccinated: number; children_supplemented: number }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const fullName = (c: { first_name?: string; middle_name?: string; last_name?: string } | null) =>
  c ? [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ') : '—'

function csvEscape(v: unknown) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}


export function BatchTraceSection({ first }: { first?: boolean }) {
  // Opened with ?batch_number=… (Trace batch, vaccination records): start on that batch.
  const linked = useSyncExternalStore(() => () => {}, () => normalizeBatchNumber(new URLSearchParams(window.location.search).get('batch_number')) ?? '', () => '')
  const [typed, setTyped] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const query = typed ?? linked
  const submitted = chosen ?? linked

  const { data, error, isLoading, isValidating, mutate } = useSWR<TracePayload>(
    submitted ? `/api/inventory/batch-trace?batch_number=${encodeURIComponent(submitted)}` : null,
    fetcher,
  )

  function search(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q) setChosen(q)
  }

  function downloadCsv() {
    if (!data) return
    const rows: string[][] = [['section', 'date', 'child_or_barangay', 'details', 'quantity']]
    for (const t of data.transactions) rows.push(['transaction', t.transaction_date, one(one(t.inventory)?.barangay)?.barangay_name ?? '', `${t.transaction_type}${t.movement_subtype ? '/' + t.movement_subtype : ''} · ${t.remarks ?? ''}`, String(t.quantity)])
    for (const v of data.vaccinations) rows.push(['vaccination', v.vaccination_date, fullName(one(v.child)), `${one(v.vaccine)?.vaccine_type ?? ''} · dose ${v.dose_number} · ${v.status}`, '1'])
    for (const s of data.supplementations) rows.push(['supplementation', s.supplementation_date, fullName(one(s.child)), one(s.supplement)?.supplement_type ?? '', String(s.quantity_given ?? 1)])
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvEscape).join(',')).join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `batch-trace-${data.batch_number}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const children = data ? [
    ...data.vaccinations.map((v) => ({ key: `v-${v.vaccination_record_id}`, date: v.vaccination_date, child: one(v.child), what: `${one(v.vaccine)?.vaccine_type ?? 'Vaccine'} dose ${v.dose_number}`, kind: 'Vaccination', status: v.status as string | null, qty: 1 })),
    ...data.supplementations.map((s) => ({ key: `s-${s.supplementation_record_id}`, date: s.supplementation_date, child: one(s.child), what: one(s.supplement)?.supplement_type ?? 'Supplement', kind: 'Supplementation', status: null, qty: s.quantity_given ?? 1 })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))) : []

  return (
    <InventorySection
      id="batch-trace"
      first={first}
      title="Batch trace"
      subtitle="Follow one batch from receipt to the children who received it."
      about={<InfoContent
        title="Batch trace"
        description="Where a batch was received and allocated, how it was used, and which children got a dose from it."
        sections={[{ label: 'Example', value: 'BCG-2026-001' }, { label: 'Tip', value: 'Export CSV gives the transactions and children for a recall or defect report' }]}
        note="PHN and Admin only."
      />}
    >
      <section aria-label="Batch search" className={REPORT_CARD}>
        <form onSubmit={search} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.5px] text-[#55617F]">Batch number</span>
            <span className="relative block">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setTyped(e.target.value)} required placeholder="e.g. BCG-2026-001" className="pl-9" />
            </span>
          </label>
          <Button type="submit"><Search size={16} aria-hidden="true" /> Trace</Button>
          {data && <Button variant="outline" onClick={downloadCsv}><Download size={16} aria-hidden="true" /> Export CSV</Button>}
        </form>
        {data && (
          <CountsStrip label="Batch counts" items={[
            { label: 'Barangays holding', value: data.counts.batches.toLocaleString() },
            { label: 'Transactions', value: data.counts.transactions.toLocaleString() },
            { label: 'Children vaccinated', value: data.counts.children_vaccinated.toLocaleString() },
            { label: 'Children supplemented', value: data.counts.children_supplemented.toLocaleString() },
          ]} />
        )}
      </section>

      {!submitted ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D5E2EA] bg-white p-8 text-center">
          <Hash size={24} aria-hidden="true" className="text-[#8896B0]" />
          <p className="text-sm text-[#55617F]">Enter a batch number to trace it.</p>
        </div>
      ) : isLoading ? (
        <LogoLoader size="section" label="Tracing the batch…" />
      ) : error ? (
        <LoadError what="the batch trace" error={error} retrying={isValidating} onRetry={() => void mutate()} />
      ) : data && (
        <div className="space-y-3 animate-in fade-in duration-150 motion-reduce:animate-none">
          <GridTable
              title={<><MapPin size={14} aria-hidden="true" /> Barangay distribution</>}
              caption="Barangays holding this batch"
              pageSize={5}
              rows={data.batches}
              rowKey={(b) => b.batch_id}
              minWidth={600}
              empty={{ icon: Package, title: 'No active batches with this number', description: 'Check the batch number and search again.' }}
              columns={[
                { key: 'barangay', header: 'Barangay', cell: (b) => one(one(b.inventory)?.barangay)?.barangay_name ?? '—' },
                { key: 'item', header: 'Item', cell: (b) => one(one(b.inventory)?.item)?.item_name ?? '—' },
                { key: 'qty', header: 'On hand', align: 'right', cell: (b) => <><span className="font-semibold text-[#0C1260]">{Number(b.quantity_on_hand).toLocaleString()}</span> <span className="text-xs text-[#8896B0]">{one(one(b.inventory)?.item)?.unit ?? ''}</span></> },
                { key: 'expiry', header: 'Expiry', cell: (b) => formatYmd(b.expiry_date) },
                { key: 'received', header: 'Received', cell: (b) => formatYmd(b.received_date) },
              ]}
            />

          <GridTable
              title={<><Clock size={14} aria-hidden="true" /> Transactions</>}
              caption="Batch transactions"
              pageSize={5}
              rows={data.transactions}
              rowKey={(t) => t.transaction_id}
              minWidth={720}
              empty={{ icon: Clock, title: 'No transactions recorded', description: 'Stock-in, allocation and usage entries for this batch appear here.' }}
              columns={[
                { key: 'when', header: 'When', cell: (t) => formatDateTime(t.transaction_date) },
                { key: 'type', header: 'Type', cell: (t) => <StatusBadge status={t.movement_subtype ?? t.transaction_type} tone={t.movement_subtype === 'WASTE' ? 'danger' : t.transaction_type === 'STOCK_IN' ? 'good' : 'info'} label={String(t.movement_subtype ?? t.transaction_type).replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())} /> },
                { key: 'barangay', header: 'Barangay', cell: (t) => one(one(t.inventory)?.barangay)?.barangay_name ?? '—' },
                { key: 'qty', header: 'Quantity', align: 'right', cell: (t) => <span className="font-semibold text-[#0C1260]">{Number(t.quantity).toLocaleString()}</span> },
                { key: 'ref', header: 'Reference', cell: (t) => <span className="font-mono text-xs text-[#8896B0]">{t.reference_number ?? '—'}</span> },
                { key: 'remarks', header: 'Remarks', cell: (t) => <span className="text-xs text-[#55617F]">{t.remarks ?? ''}</span> },
              ]}
            />

          <GridTable
              title={<><Users size={14} aria-hidden="true" /> Children who received this batch</>}
              caption="Children who received this batch"
              pageSize={5}
              rows={children}
              rowKey={(c) => c.key}
              minWidth={720}
              empty={{ icon: Users, title: 'No children received this batch yet', description: 'Doses given from this batch are listed here.' }}
              columns={[
                { key: 'date', header: 'Date', cell: (c) => formatYmd(c.date) },
                { key: 'child', header: 'Child', cell: (c) => <span className="font-semibold text-[#0C1260]">{fullName(c.child)}</span> },
                { key: 'barangay', header: 'Barangay', cell: (c) => one(c.child?.barangay)?.barangay_name ?? '—' },
                { key: 'what', header: 'Given', cell: (c) => <><span className="block">{c.what}</span><span className="block text-xs text-[#8896B0]">{c.kind}</span></> },
                { key: 'status', header: 'Status · Qty', cell: (c) => c.status ? <StatusBadge status={c.status} /> : <span className="font-semibold">{c.qty}</span> },
              ]}
            />
        </div>
      )}
    </InventorySection>
  )
}
