'use client'

// RPT-USR001 — Lightweight charts for the dashboard, no chart library.
//   • Donut — one percentage, arc draws in on mount
//   • TrendBars — monthly bars that stretch to the card width and grow in on mount

type DonutProps = { percentage: number; label: string; color?: string; size?: number }

export function Donut({ percentage, label, color = 'var(--brand-sky)', size = 132 }: DonutProps) {
  const pct = Math.max(0, Math.min(100, percentage))
  const radius = size / 2 - 10
  const circ = 2 * Math.PI * radius
  const dash = (pct / 100) * circ
  const center = size / 2
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${pct}%`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#E3EEF3" strokeWidth="10" />
        <circle
          className="donut-arc"
          cx={center} cy={center} r={radius} fill="none"
          style={{ stroke: color }} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap={pct > 0 ? 'round' : 'butt'}
          transform={`rotate(-90 ${center} ${center})`}
        />
        <text x={center} y={center} textAnchor="middle" dy="0.35em" fontSize="24" fontWeight="700" fill="#03045E" className="font-display">
          {pct}%
        </text>
      </svg>
      <p className="text-center text-sm text-[#5B6478]">{label}</p>
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function TrendBars({ data, color = 'var(--brand-sky)', label }: { data: { month: string; count: number }[]; color?: string; label: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-[#F8FCFD] text-sm text-[#5B6478]">
        No records in this date range.
      </div>
    )
  }
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div role="img" aria-label={`${label} per month: ${data.map((d) => `${d.month} ${d.count}`).join(', ')}`}>
      <div className="flex h-48 items-end gap-1.5 border-b border-[#E3EEF3] sm:gap-3">
        {data.map((d, i) => (
          <div key={d.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold tabular-nums text-[#2D3A55]">{d.count}</span>
            <div
              className="grow-y w-full max-w-12 rounded-t-md"
              style={{ height: `${Math.max(2, (d.count / max) * 100)}%`, background: color, animationDelay: `${i * 50}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-3">
        {data.map((d) => (
          <span key={d.month} className="min-w-0 flex-1 truncate text-center text-xs text-[#5B6478]">
            {MONTHS[Number(d.month.slice(5, 7)) - 1] ?? d.month}
          </span>
        ))}
      </div>
    </div>
  )
}
