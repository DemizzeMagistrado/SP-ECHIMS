'use client'
import { Checkbox, Select } from '@/components/ui/form'
import { useState, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SearchX, CheckCircle2, ChevronDown, FileText, Info } from 'lucide-react'
import { labelClassification } from '@/lib/nutrition-history'
import type { RiskMonitoring } from '@/lib/nutrition-risk'
import { formatChildId } from '@/lib/formatters'
import { nutritionProfileHref, nutritionTone, nutritionToneText } from '@/lib/nutrition-status'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/brand/logo-loader'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
import { CountsStrip, FilterCard, REPORT_CARD, SectionHeader } from '@/components/nutrition/report-parts'

const PRIORITY_TONE = { CRITICAL: 'severe', HIGH: 'review', MEDIUM: 'neutral', LOW: 'neutral' } as const
// Same table styling as All assessments: 13px headers, row hover with a navy bar, pinned Action column.
const HEAD = 'border-b border-brand-line bg-white px-4 py-3 text-left align-bottom text-[13px] font-semibold text-brand-navy'
const CELL = 'border-b border-brand-line/70 px-4 py-3.5 align-top'
const PINNED = 'sm:sticky right-0 w-[208px] min-w-[208px] border-l sm:shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.18)]'

// Refresh comes from the page (it reloads the same data as the assessments) and sits in the filter card.
export function NutritionRiskMonitor({ monitoring, error, loading, offline, refresh }: { monitoring?: RiskMonitoring; error?: string; loading: boolean; offline: boolean; refresh?: ReactNode }) {
  const router = useRouter()
  const [barangay, setBarangay] = useState('All')
  const [classification, setClassification] = useState('All')
  const [severity, setSeverity] = useState('All')
  const [worsenedOnly, setWorsenedOnly] = useState(false)
  const records = monitoring?.records ?? []
  const barangays = Array.from(new Map(records.map((row) => [String(row.barangay_id), row.barangay_name])).entries()).sort((a, b) => a[1].localeCompare(b[1]))
  const codes = Array.from(new Set(records.flatMap((row) => row.classifications.map((item) => item.code)))).sort()
  const visible = records.filter((row) => (barangay === 'All' || String(row.barangay_id) === barangay)
    && (classification === 'All' || row.classifications.some((item) => item.code === classification))
    && (severity === 'All' || row.severity === severity) && (!worsenedOnly || row.worsening.length > 0))
  const { visible: page, bindList, listStyle, props: pager } = usePagination(visible)
  const counts = monitoring?.counts
  // The whole row opens the profile; links inside it keep their own target.
  const openRow = (event: MouseEvent, childId: number) => { if (!(event.target as HTMLElement).closest('a,button')) router.push(nutritionProfileHref(childId)) }
  return <section className="nutrition-no-print space-y-5" aria-label="Nutritional risk monitoring">
    <SectionHeader
      title="Nutritional risk monitoring"
      subtitle="Children whose latest saved assessment shows a nutritional risk. One row per active child."
      about="Current risks use the latest saved assessment per active child across all years. Counts cover your full accessible scope. Needs review includes unavailable risk flags or incomplete latest evaluations; those children are not assumed to be normal."
    />
    {offline && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Offline: this is the last account-specific snapshot. Reconnect and refresh to verify current risks and assignments.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}{monitoring && ' Showing the last available results; refresh successfully before treating them as current.'}</p>}
    {loading && !monitoring ? <Spinner showLabel label="Loading risk monitoring…" className="w-full justify-center py-6 text-sm text-muted-foreground" /> : !monitoring ? <p className="rounded-lg bg-muted p-4 text-sm">Risk monitoring data is unavailable. Refresh online after installing the updated API and SQL migration.</p> : <>
      <FilterCard
        refresh={refresh}
        extra={<Checkbox label="Worsened only" checked={worsenedOnly} onChange={(event) => setWorsenedOnly(event.target.checked)} />}
        below={<CountsStrip label="Risk counts" items={[
          { label: 'At-risk children', value: counts!.at_risk },
          { label: 'Critical', value: counts!.critical, tone: 'severe' },
          { label: 'High priority', value: counts!.high, tone: 'review' },
          { label: 'Worsened', value: counts!.worsened, tone: 'severe' },
          { label: 'Needs review', value: counts!.needs_review, tone: 'review' },
        ]} />}
      >
        <Select aria-label="Barangay" value={barangay} onChange={(event) => setBarangay(event.target.value)}><option value="All">All accessible barangays</option>{barangays.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
        <Select aria-label="Classification" value={classification} onChange={(event) => setClassification(event.target.value)}><option value="All">All classifications</option>{codes.map((code) => <option key={code} value={code}>{labelClassification(code)}</option>)}</Select>
        <Select aria-label="Priority" value={severity} onChange={(event) => setSeverity(event.target.value)}>{['All', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value === 'All' ? 'All priorities' : value}</option>)}</Select>
      </FilterCard>
      <div className={REPORT_CARD}>
        <div ref={bindList} style={listStyle} className="scroll-subtle overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm text-brand-navy">
            <thead><tr>
              {['Child', 'Barangay', 'Latest assessment', 'Recorded risks', 'Priority', 'Change'].map((title) => <th key={title} scope="col" className={HEAD}>{title}</th>)}
              <th scope="col" className={cn(HEAD, PINNED, 'z-[2] border-l-brand-line')}>Action</th>
            </tr></thead>
            <tbody>
              {page.map((row) => {
                const rowBg = row.worsening.length ? 'bg-severe-row' : 'bg-white'
                // Screening (SAM/MAM) first, as a pill; each other indicator as "name  classification".
                const risks = [...row.classifications].sort((a, b) => Number(b.field === 'nutritional_status') - Number(a.field === 'nutritional_status'))
                return <tr key={row.child_id} onClick={(event) => openRow(event, row.child_id)} className={cn('group cursor-pointer transition-colors duration-[120ms] hover:bg-brand-ice [&:last-child>td]:border-b-0', rowBg)}>
                  <td className={cn(CELL, 'min-w-44 transition-[box-shadow] duration-[120ms] group-hover:shadow-[inset_3px_0_0_var(--brand-navy)]')}>
                    <span className="font-semibold">{row.child_name}</span>
                    <span className="block text-xs text-brand-muted">{formatChildId(row.child_id)}</span>
                  </td>
                  <td className={CELL}>{row.barangay_name}</td>
                  <td className={cn(CELL, 'whitespace-nowrap')}>
                    {row.assessment_date}
                    <span className="block text-xs text-brand-muted">Assessment #{row.assessment_id}</span>
                  </td>
                  <td className={cn(CELL, 'min-w-[220px]')}>
                    {risks.length ? <ul className="space-y-1">{risks.map((item) => <li key={item.field}>
                      {item.field === 'nutritional_status'
                        ? <StatusBadge status={item.code} tone={nutritionTone(item.code)} label={`Screening: ${labelClassification(item.code)}`} />
                        : <><span className="text-brand-muted">{item.label}</span> <span className={cn('font-semibold', nutritionToneText(item.code))}>{labelClassification(item.code)}</span></>}
                    </li>)}</ul> : <span className="text-brand-muted">Stored risk flag requires review</span>}
                  </td>
                  <td className={CELL}><StatusBadge status={row.severity} tone={PRIORITY_TONE[row.severity as keyof typeof PRIORITY_TONE] ?? 'neutral'} /></td>
                  <td className={cn(CELL, 'min-w-[230px]')}>
                    {row.worsening.length ? <div className="space-y-1">
                      <StatusBadge status="worsened" tone="severe" />
                      {row.worsening.map((item) => <p key={item.label}><span className="text-brand-muted">{item.label}</span> {labelClassification(item.previous)} → <span className={cn('font-semibold', nutritionToneText(item.current))}>{labelClassification(item.current)}</span></p>)}
                      <p className="text-xs text-brand-muted">Compared with assessment #{row.previous_assessment_id}, {row.previous_date}</p>
                    </div> : <span className="text-brand-muted">{row.previous_assessment_id ? 'No comparable worsening detected' : 'No earlier assessment date'}</span>}
                  </td>
                  <td className={cn(CELL, PINNED, 'z-[1] border-l-brand-line/70 transition-colors duration-[120ms] group-hover:bg-brand-ice', rowBg)}>
                    <Link href={nutritionProfileHref(row.child_id)} className={cn(buttonVariants({ variant: 'row', size: 'row' }), 'w-full')}>
                      <FileText aria-hidden="true" />View child record<span className="sr-only"> for {row.child_name}</span>
                    </Link>
                  </td>
                </tr>
              })}
              {!visible.length && <tr><td colSpan={7}>{records.length ? <EmptyState icon={SearchX} title="No at-risk children match these filters" description="Try a different barangay or risk type." /> : <EmptyState icon={CheckCircle2} title="No children at risk right now" description="No child in your scope has a recorded current risk." />}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} label="Risk monitoring pages" />
      </div>
      {/* Same collapsed card as Follow-up guidance; text unchanged. */}
      <details className={cn(REPORT_CARD, 'group')}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-brand-navy outline-none focus-visible:ring-2 focus-visible:ring-brand-sky [&::-webkit-details-marker]:hidden">
          <Info size={16} aria-hidden="true" className="shrink-0 text-brand-muted" />
          How priority and worsening are set
          <ChevronDown size={16} aria-hidden="true" className="ml-auto text-brand-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <p className="border-t border-brand-line/70 px-4 py-3 text-sm text-brand-navy">
          Priority uses active alert-rule settings with a medium monitoring baseline. Worsening compares valid saved classifications from the same evaluator version and an earlier assessment date.
        </p>
      </details>
    </>}
  </section>
}
