import type { ReactNode } from 'react'

/** Page title block: display title, one-line muted subtitle, actions on the right (below on mobile). */
export function PageHeader({ title, subtitle, actions, className = '', size = 'md' }: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  /** lg: 32px Inter title and 15px subtitle (data pages such as Nutritional Assessment). */
  size?: 'md' | 'lg'
}) {
  return (
    <header className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className={size === 'lg' ? 'text-[32px] font-bold leading-tight tracking-[-0.6px] text-brand-navy' : 'font-display text-3xl font-bold tracking-tight text-brand-navy'}>{title}</h1>
        {subtitle && <div className={size === 'lg' ? 'mt-1 max-w-3xl text-[15px] text-brand-muted' : 'mt-1.5 max-w-3xl text-sm text-brand-muted'}>{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </header>
  )
}
