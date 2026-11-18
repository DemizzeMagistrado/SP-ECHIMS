import type { ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'

// "Nothing here" for tables, lists and widgets. page = a module's main area; section = a card or table body.
export function EmptyState({ icon: Icon = Inbox, title, description, action, size = 'section', className = '' }: {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  size?: 'page' | 'section'
  className?: string
}) {
  const page = size === 'page'
  return (
    <div className={`flex flex-col items-center justify-center text-center ${page ? 'gap-3 px-6 py-16' : 'gap-2 px-4 py-8'} ${className}`}>
      <span className={`flex items-center justify-center rounded-full bg-brand-mist/60 text-brand-sky ${page ? 'mb-1 size-14' : 'size-11'}`}>
        <Icon size={page ? 26 : 20} aria-hidden="true" />
      </span>
      <p className={page ? 'font-display text-lg font-bold text-brand-navy' : 'text-sm font-semibold text-brand-navy'}>{title}</p>
      {description && <p className={`max-w-sm text-brand-muted ${page ? 'text-sm' : 'text-xs'}`}>{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
