import type { ReactNode } from 'react'

/** Page title block: display title, one-line muted subtitle, actions on the right (below on mobile). */
export function PageHeader({ title, subtitle, actions, className = '' }: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold tracking-tight text-brand-navy">{title}</h1>
        {subtitle && <div className="mt-1.5 max-w-3xl text-sm text-brand-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </header>
  )
}
