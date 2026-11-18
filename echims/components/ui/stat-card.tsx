import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Summary count card (Alerts is the reference): white card, muted label, big number, semantic
// color on the number only. Put a row of them in `grid grid-cols-2 gap-4 md:grid-cols-4`.
const TONES = {
  default: 'text-foreground',
  good: 'text-good',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-[#035C8C]',
  nutrition: 'text-nutrition',
} as const

export type StatTone = keyof typeof TONES

export function StatCard({ label, value, tone = 'default', hint, icon, onClick, pressed, className }: {
  label: ReactNode
  value: ReactNode
  tone?: StatTone
  hint?: ReactNode
  icon?: ReactNode
  /** Makes the card a filter toggle (with `pressed`). */
  onClick?: () => void
  pressed?: boolean
  className?: string
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">{icon}{label}</p>
      <p className={cn('mt-2 text-3xl font-bold tabular-nums', TONES[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  )
  const box = 'rounded-2xl border border-border bg-white p-6 text-left'
  if (!onClick) return <div className={cn(box, className)}>{body}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(box, 'card-hover', pressed && 'border-primary ring-1 ring-primary', className)}
    >
      {body}
    </button>
  )
}
