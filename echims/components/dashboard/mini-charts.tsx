'use client'

// RPT-USR001 — Lightweight inline-SVG charts for the dashboard. No external
// dep (Recharts, Chart.js, etc.) so bundle stays small. Two shapes:
//   • Donut — shows one percentage with a label underneath
//   • Bars  — simple vertical bars for a monthly series

type DonutProps = { percentage: number; label: string; color?: string; size?: number }

export function Donut({ percentage, label, color = '#0ea5e9', size = 120 }: DonutProps) {
  const pct = Math.max(0, Math.min(100, percentage))
  const radius = size / 2 - 10
  const circ = 2 * Math.PI * radius
  const dash = (pct / 100) * circ
  const center = size / 2
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${pct}%`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx={center} cy={center} r={radius} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}   // start at top
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
        <text x={center} y={center} textAnchor="middle" dy="0.35em" fontSize="20" fontWeight="700" fill="#0f172a">
          {pct}%
        </text>
      </svg>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}

type BarsProps = {
  data: { month: string; count: number }[]
  color?: string
  height?: number
}

export function MiniBars({ data, color = '#0ea5e9', height = 100 }: BarsProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-xs italic text-muted-foreground">
        No data in this range.
      </div>
    )
  }
  const max = Math.max(1, ...data.map((d) => d.count))
  const barWidth = Math.max(14, 220 / data.length)
  const totalWidth = Math.max(220, data.length * (barWidth + 6))
  return (
    <div className="overflow-x-auto">
      <svg width={totalWidth} height={height + 24} role="img" aria-label="Vaccinations per month">
        {data.map((d, i) => {
          const h = (d.count / max) * height
          const x = i * (barWidth + 6)
          const y = height - h
          const monthShort = d.month.slice(5) // "01".."12"
          return (
            <g key={d.month}>
              <rect x={x} y={y} width={barWidth} height={h} rx={3} fill={color} />
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">
                {d.count}
              </text>
              <text x={x + barWidth / 2} y={height + 14} textAnchor="middle" fontSize="10" fill="#64748b">
                {monthShort}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
