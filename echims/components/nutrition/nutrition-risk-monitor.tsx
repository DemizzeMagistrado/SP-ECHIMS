'use client'
import { Checkbox, Field, Select } from '@/components/ui/form'
import { StatCard } from '@/components/ui/stat-card'
import { useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, SearchX, CheckCircle2 } from 'lucide-react'
import { labelClassification } from '@/lib/nutrition-history'
import type { RiskMonitoring } from '@/lib/nutrition-risk'
import { formatChildId } from '@/lib/formatters'
import { nutritionProfileHref } from '@/lib/nutrition-status'
import { Spinner } from '@/components/brand/logo-loader'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { FilterBar } from '@/components/ui/filter-bar'
import { InfoTip } from '@/components/ui/info-tip'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'

const PRIORITY_TONE = { CRITICAL: 'danger', HIGH: 'warn', MEDIUM: 'warn', LOW: 'neutral' } as const

// Refresh lives in the page header (it reloads the same data as the assessments).
export function NutritionRiskMonitor({ monitoring, error, loading, offline }: { monitoring?: RiskMonitoring; error?: string; loading: boolean; offline: boolean }) {
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
  return <section className="nutrition-no-print space-y-6" aria-label="Nutritional risk monitoring">
    <div>
      <h2 className="flex items-center gap-1.5 text-lg font-semibold text-brand-navy">Nutritional risk monitoring
        <InfoTip label="About risk monitoring">Current risks use the latest saved assessment per active child across all years. Counts cover your full accessible scope. Needs review includes unavailable risk flags or incomplete latest evaluations; those children are not assumed to be normal.</InfoTip>
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Latest saved assessment per active child</p>
    </div>
    {offline && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Offline: this is the last account-specific snapshot. Reconnect and refresh to verify current risks and assignments.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}{monitoring && ' Showing the last available results; refresh successfully before treating them as current.'}</p>}
    {loading && !monitoring ? <Spinner showLabel label="Loading risk monitoring…" className="w-full justify-center py-6 text-sm text-muted-foreground" /> : !monitoring ? <p className="rounded-lg bg-muted p-4 text-sm">Risk monitoring data is unavailable. Refresh online after installing the updated API and SQL migration.</p> : <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{[['At-risk children', counts!.at_risk], ['Critical', counts!.critical], ['High priority', counts!.high], ['Worsened', counts!.worsened], ['Needs review', counts!.needs_review]].map(([label, count], i) => <StatCard key={label} label={label} value={count} tone={(['nutrition', 'danger', 'warn', 'danger', 'warn'] as const)[i]} />)}</div>
      <FilterBar>
        <Field label="Barangay"><Select value={barangay} onChange={(event) => setBarangay(event.target.value)}><option value="All">All accessible barangays</option>{barangays.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></Field>
        <Field label="Classification"><Select value={classification} onChange={(event) => setClassification(event.target.value)}><option value="All">All classifications</option>{codes.map((code) => <option key={code} value={code}>{labelClassification(code)}</option>)}</Select></Field>
        <Field label="Priority"><Select value={severity} onChange={(event) => setSeverity(event.target.value)}>{['All', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value === 'All' ? 'All priorities' : value}</option>)}</Select></Field>
        <div className="flex items-end pb-2"><Checkbox label="Worsened only" checked={worsenedOnly} onChange={(event) => setWorsenedOnly(event.target.checked)} /></div>
      </FilterBar>
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div ref={bindList} style={listStyle} className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr>{['Child', 'Barangay', 'Latest assessment', 'Recorded risks', 'Priority', 'Change', 'Action'].map((title) => <th key={title} scope="col" className="px-4 py-3 text-left text-xs font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-border">{page.map((row) => <tr key={row.child_id} onClick={(event) => openRow(event, row.child_id)} className={`cursor-pointer transition-colors hover:bg-brand-ice/60 ${row.worsening.length ? 'bg-red-50/40' : ''}`}>
          <td className="px-4 py-3"><Link href={nutritionProfileHref(row.child_id)} className="font-medium text-brand-navy underline-offset-4 hover:text-brand-blue hover:underline">{row.child_name}</Link><span className="block text-xs text-muted-foreground">{formatChildId(row.child_id)}</span></td><td className="px-4 py-3">{row.barangay_name}</td><td className="whitespace-nowrap px-4 py-3">#{row.assessment_id}<br />{row.assessment_date}</td>
          <td className="min-w-[220px] px-4 py-3">{row.classifications.length ? row.classifications.map((item) => <p key={item.field} className="text-xs">{item.label}: {labelClassification(item.code)}</p>) : 'Stored risk flag requires review'}</td>
          <td className="px-4 py-3"><StatusBadge status={row.severity} tone={PRIORITY_TONE[row.severity as keyof typeof PRIORITY_TONE] ?? 'neutral'} /></td>
          <td className="min-w-[230px] px-4 py-3">{row.worsening.length ? <><StatusBadge status="worsened" tone="danger" />{row.worsening.map((item) => <p key={item.label} className="mt-1 text-xs">{item.label}: {labelClassification(item.previous)} → {labelClassification(item.current)}</p>)}<p className="mt-1 text-xs text-muted-foreground">Compared with #{row.previous_assessment_id} · {row.previous_date}</p></> : <span className="text-xs text-muted-foreground">{row.previous_assessment_id ? 'No comparable worsening detected' : 'No earlier assessment date'}</span>}</td>
          <td className="px-4 py-3"><Link href={nutritionProfileHref(row.child_id)} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>View <ArrowRight size={12} aria-hidden="true" /><span className="sr-only"> {row.child_name}&apos;s nutrition history</span></Link></td>
        </tr>)}{!visible.length && <tr><td colSpan={7}>{records.length ? <EmptyState icon={SearchX} title="No at-risk children match these filters" description="Try a different barangay or risk type." /> : <EmptyState icon={CheckCircle2} title="No children at risk right now" description="No child in your scope has a recorded current risk." />}</td></tr>}</tbody></table></div>
        <Pagination {...pager} label="Risk monitoring pages" />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">How priority and worsening are set
        <InfoTip label="About priority and worsening">Priority uses active alert-rule settings with a medium monitoring baseline. Worsening compares valid saved classifications from the same evaluator version and an earlier assessment date.</InfoTip>
      </p>
    </>}
  </section>
}
