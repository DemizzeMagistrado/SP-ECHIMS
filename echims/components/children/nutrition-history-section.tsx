'use client'
import { useId, useState, type KeyboardEvent } from 'react'
import { History, TrendingUp, AlertCircle } from 'lucide-react'
import { labelClassification, numericValue, withHistoryComparisons, type HistoryAssessment } from '@/lib/nutrition-history'
const metrics = [
  { key: 'weight', label: 'Weight', unit: 'kg', color: '#087DB9' },
  { key: 'height', label: 'Length / height', unit: 'cm', color: '#0F766E' },
  { key: 'waz', label: 'WAZ', unit: 'SD', color: '#087DB9' },
  { key: 'haz', label: 'HAZ', unit: 'SD', color: '#0F766E' },
  { key: 'whz', label: 'WLZ / WHZ', unit: 'SD', color: '#7C3AED' },
  { key: 'baz', label: 'BAZ', unit: 'SD', color: '#B45309' },
] as const
function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : value
}
function numberLabel(value: unknown) {
  const number = numericValue(value)
  return number === null ? '—' : number.toLocaleString('en-PH', { maximumFractionDigits: 2 })
}
function RecordedChart({ rows, metric }: { rows: HistoryAssessment[]; metric: typeof metrics[number] }) {
  const isScore = metric.unit === 'SD'
  const points = rows.map((row) => ({ row, value: isScore && row.evaluation_status !== 'EVALUATED' ? null : numericValue(row[metric.key]), time: Date.parse(`${row.assessment_date}T00:00:00Z`) }))
  const valid = points.filter((point) => point.value !== null && Number.isFinite(point.time))
  if (!valid.length) return <p className="rounded-xl bg-muted/40 p-6 text-sm text-muted-foreground">No available {metric.label} values to plot. Unavailable or edema-suppressed scores are not shown as zero.</p>
  const values = valid.map((point) => point.value as number)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const pad = Math.max((high - low) * 0.15, isScore ? 0.5 : 1)
  const min = low - pad
  const max = high + pad
  const times = points.filter((point) => Number.isFinite(point.time)).map((point) => point.time)
  const start = Math.min(...times)
  const end = Math.max(...times)
  const x = (time: number) => start === end ? 380 : 65 + (time - start) / (end - start) * 625
  const y = (value: number) => 215 - (value - min) / (max - min) * 185
  const paths: string[] = []
  let segment = ''
  for (const point of points) {
    if (point.value === null || !Number.isFinite(point.time)) {
      if (segment) paths.push(segment)
      segment = ''
    } else segment += `${segment ? ' L' : 'M'} ${x(point.time)} ${y(point.value)}`
  }
  if (segment) paths.push(segment)
  return <div>
    <svg viewBox="0 0 740 275" className="w-full min-w-[420px]" role="img" aria-label={`${metric.label} measurements over assessment dates`}>
      <title>{`${metric.label} (${metric.unit}) by assessment date`}</title>
      {[0, 1, 2, 3, 4].map((step) => {
        const value = min + (max - min) * step / 4
        return <g key={step}><line x1="65" x2="690" y1={y(value)} y2={y(value)} stroke="#E5E7EB" /><text x="57" y={y(value) + 4} textAnchor="end" fontSize="11" fill="#6B7280">{value.toFixed(1)}</text></g>
      })}
      <text x="65" y="15" fontSize="12" fill="#6B7280">{metric.unit}</text>
      {paths.map((path, index) => <path key={index} d={path} fill="none" stroke={metric.color} strokeWidth="2.5" />)}
      {valid.map(({ row, value, time }) => <circle key={row.assessment_id} cx={x(time)} cy={y(value as number)} r="4" fill={metric.color}><title>{`Assessment #${row.assessment_id}: ${dateLabel(row.assessment_date)} · ${value} ${metric.unit}`}</title></circle>)}
      <text x="65" y="245" fontSize="11" fill="#6B7280">{dateLabel(rows[0].assessment_date)}</text>
      {start !== end && <text x="690" y="245" textAnchor="end" fontSize="11" fill="#6B7280">{dateLabel(rows[rows.length - 1].assessment_date)}</text>}
    </svg>
    {new Set(valid.map((point) => point.row.assessment_date)).size < 2 && <p className="text-sm text-muted-foreground">A trend requires measurements on at least two different dates.</p>}
  </div>
}
function LatestAssessment({ assessment }: { assessment: HistoryAssessment }) {
  const risk = assessment.is_at_risk
  const summaryClass = risk === true ? 'bg-orange-50 text-orange-800' : risk === false ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
  const classifications = [
    { label: 'Weight-for-age', value: assessment.weight_for_age, score: assessment.waz },
    { label: 'Height-for-age', value: assessment.height_for_age, score: assessment.haz },
    { label: 'Weight-for-length/height', value: assessment.weight_for_height, score: assessment.whz },
    { label: 'BMI-for-age', value: assessment.bmi_for_age, score: assessment.baz },
    { label: 'Screening status', value: assessment.nutritional_status },
    { label: 'MUAC status', value: assessment.muac_status },
  ]
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">Latest Nutritional Assessment</h3><p className="mt-1 text-sm text-muted-foreground">Assessment #{assessment.assessment_id} · {dateLabel(assessment.assessment_date)}</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${summaryClass}`}>{risk === true ? 'Nutrition: At risk' : risk === false ? 'Nutrition: No recorded risk' : 'Nutrition: Needs review'}</span>
    </div>
    <p className="text-sm text-muted-foreground">{risk === true ? 'The latest saved assessment is flagged for nutrition follow-up. Review its classifications and related alerts.' : risk === false ? 'The latest saved assessment has no recorded nutritional risk. This describes that assessment only.' : 'The stored risk result is unavailable or incomplete. A normal result is not assumed.'}</p>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: 'Weight', value: `${numberLabel(assessment.weight)} kg` },
        { label: 'Length / height', value: `${numberLabel(assessment.height)} cm`, detail: assessment.measurement_type ?? 'Position not recorded' },
        { label: 'MUAC', value: assessment.muac == null ? 'Not recorded' : `${numberLabel(assessment.muac)} cm` },
        { label: 'Edema grade', value: assessment.edema_grade == null ? 'Not assessed' : assessment.edema_grade === 0 ? 'None (0)' : `+${assessment.edema_grade}` },
      ].map(item => <div key={item.label} className="rounded-xl bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-1 text-sm font-medium">{item.value}{item.detail && <span className="block text-xs font-normal text-muted-foreground">{item.detail}</span>}</dd></div>)}
    </dl>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {classifications.map(item => <div key={item.label} className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-2 text-sm font-medium">{labelClassification(item.value)}{item.score != null && <span className="mt-1 block text-xs font-normal text-muted-foreground">Z-score: {numberLabel(item.score)} SD</span>}</dd></div>)}
    </dl>
    <p className="text-xs text-muted-foreground">Evaluation: {labelClassification(assessment.evaluation_status)}</p>
    {assessment.remarks?.trim() && <div className="rounded-xl bg-muted/40 p-3"><h4 className="text-xs font-medium text-muted-foreground">Remarks</h4><p className="mt-1 whitespace-pre-wrap text-sm">{assessment.remarks}</p></div>}
    <p className="text-xs text-muted-foreground">Based on the latest saved assessment date, then the highest assessment ID on that date. Missing and edema-suppressed results remain unavailable.</p>
  </div>
}
export function NutritionHistorySection({ assessments, loading = false, error, onRetry }: { assessments: HistoryAssessment[]; loading?: boolean; error?: string; onRetry?: () => void }) {
  const [activeTab, setActiveTab] = useState<'LATEST' | 'HISTORY' | 'TRENDS' | 'CHANGES'>('LATEST')
  const tabId = useId()
  const tabs = [
    { key: 'LATEST', label: 'Latest Assessment' },
    { key: 'HISTORY', label: 'Assessment History' },
    { key: 'TRENDS', label: 'Growth Trends' },
    { key: 'CHANGES', label: 'Classification Changes' },
  ] as const
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    setActiveTab(tabs[next].key)
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[next]?.focus()
  }
  const [metricKey, setMetricKey] = useState<typeof metrics[number]['key']>('weight')
  const [newestFirst, setNewestFirst] = useState(true)
  const chronological = withHistoryComparisons(assessments)
  const display = newestFirst ? [...chronological].reverse() : chronological
  const metric = metrics.find((item) => item.key === metricKey) ?? metrics[0]
  const latest = chronological[chronological.length - 1]
  const comparison = latest?.history_comparison
  return <section className="overflow-hidden rounded-2xl border border-border bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-primary"><History size={18} />Nutritional Assessment</h2>
        <p className="mt-1 text-sm text-muted-foreground">{chronological.length} saved assessment{chronological.length === 1 ? '' : 's'} · Latest results, history, growth trends and classification changes</p>
      </div>
    </div>
    <div role="tablist" aria-label="Nutrition record sections" className="flex flex-wrap gap-2 border-b p-3">
      {tabs.map((tab, index) => <button
        key={tab.key}
        id={`${tabId}-tab-${tab.key}`}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.key}
        aria-controls={`${tabId}-panel-${tab.key}`}
        tabIndex={activeTab === tab.key ? 0 : -1}
        onClick={() => setActiveTab(tab.key)}
        onKeyDown={(event) => navigateTabs(event, index)}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-primary text-white' : 'bg-muted/40 text-foreground hover:bg-muted'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}
      >{tab.label}</button>)}
    </div>
    <div className="p-5">
      {tabs.map((tab) => <div
        key={tab.key}
        id={`${tabId}-panel-${tab.key}`}
        role="tabpanel"
        aria-labelledby={`${tabId}-tab-${tab.key}`}
        hidden={activeTab !== tab.key}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {activeTab === tab.key && (error
          ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}{onRetry && <button type="button" onClick={onRetry} className="ml-3 underline">Retry</button>}</div>
          : loading ? <p role="status" className="text-sm text-muted-foreground">Loading nutrition history...</p>
          : !chronological.length ? <p className="rounded-xl bg-muted/40 p-6 text-sm text-muted-foreground">No nutritional assessments recorded yet.</p>
          : tab.key === 'LATEST' ? <LatestAssessment assessment={latest} />
          : tab.key === 'HISTORY' ? <div><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Assessment history</h3><label className="text-sm">Order <select value={newestFirst ? 'newest' : 'oldest'} onChange={(event) => setNewestFirst(event.target.value === 'newest')} className="ml-2 rounded-lg border border-border bg-white px-3 py-2"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/60"><tr>{['Assessment / date', 'Weight (kg)', 'Length / height (cm)', 'MUAC (cm)', 'WFA', 'HFA', 'WFL / WFH', 'BMI-for-age', 'Screening', 'Change from earlier date'].map((title) => <th key={title} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-border">{display.map((row) => <tr key={row.assessment_id} className={row.history_comparison.changes.some((item) => item.change === 'Worsened') ? 'bg-red-50/60' : ''}>
            <td className="whitespace-nowrap px-3 py-3">#{row.assessment_id}<br />{dateLabel(row.assessment_date)}</td><td className="px-3 py-3">{numberLabel(row.weight)}</td><td className="px-3 py-3">{numberLabel(row.height)}<span className="block text-xs text-muted-foreground">{row.measurement_type ?? 'Position not recorded'}</span></td><td className="px-3 py-3">{numberLabel(row.muac)}</td>
            {[row.weight_for_age, row.height_for_age, row.weight_for_height, row.bmi_for_age, row.nutritional_status].map((value, index) => <td key={index} className="px-3 py-3">{labelClassification(value)}</td>)}
            <td className="min-w-[210px] px-3 py-3">{row.history_comparison.previous_assessment_id === null ? <span className="text-xs text-muted-foreground">No earlier assessment date</span> : row.history_comparison.changes.map((change) => <p key={change.label} className={`text-xs ${change.change === 'Worsened' ? 'font-semibold text-red-700' : change.change === 'Improved' ? 'text-emerald-700' : 'text-muted-foreground'}`}>{change.label}: {change.change}</p>)}</td>
          </tr>)}</tbody></table></div>
        </div>
          : tab.key === 'TRENDS' ? <div className="rounded-xl border border-border p-4"><h3 className="mb-3 flex items-center gap-2 font-semibold"><TrendingUp size={17} />Recorded growth measurements</h3>
          <div className="mb-4 flex flex-wrap gap-2">{metrics.map((item) => <button key={item.key} type="button" aria-pressed={metricKey === item.key} onClick={() => setMetricKey(item.key)} className={`rounded-lg border px-3 py-2 text-sm ${metricKey === item.key ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>{item.label}</button>)}</div>
          <div className="overflow-x-auto"><RecordedChart rows={chronological} metric={metric} /></div>
          <p className="mt-2 text-xs text-muted-foreground">Charts show recorded values, with gaps for unavailable results. Length and standing height use the recorded measurement position; changes in position can affect comparisons.</p>
        </div>
          : <div className="rounded-xl border border-border p-4"><h3 className="mb-2 font-semibold">Latest classification changes</h3>
          {!comparison?.previous_assessment_id ? <p className="text-sm text-muted-foreground">No assessment from an earlier date is available for comparison.</p> : <>
            <p className="mb-3 text-xs text-muted-foreground">Assessment #{latest.assessment_id} compared with #{comparison.previous_assessment_id} on {dateLabel(comparison.previous_date as string)}.</p>
            <div className="grid gap-3 sm:grid-cols-2">{comparison.changes.map((change) => <div key={change.label} className={`rounded-lg p-3 ${change.change === 'Worsened' ? 'bg-red-50 text-red-800' : change.change === 'Improved' ? 'bg-emerald-50 text-emerald-800' : 'bg-muted/40'}`}><p className="text-xs font-medium">{change.label}</p><p className="mt-1 text-sm">{labelClassification(change.previous)} → {labelClassification(change.current)}</p><p className="mt-1 text-xs font-semibold">{change.change}</p></div>)}</div>
          </>}
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><AlertCircle size={15} className="shrink-0" />Changes compare saved classifications from the same evaluator version. Missing results, different evaluator versions, and changes between low- and high-weight categories are not comparable. They do not establish a diagnosis or treatment outcome.</p>
        </div>)}
      </div>)}
    </div>
  </section>
}
