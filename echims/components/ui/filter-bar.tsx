import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Layout for pages with many filters: chips on top, search on its own full-width row, the other
// filters in a 2-column grid (1 column on phones), then a right-aligned row for actions (with
// optional info on the left).
//   <FilterBar chips={<FilterChips … />} search={<SearchInput … />} actions={<Button … />}>
//     <Select …/> <Select …/> <DateInput …/> <DateInput …/>
//   </FilterBar>

export function FilterBar({ chips, search, children, info, actions, className }: {
  chips?: ReactNode
  search?: ReactNode
  /** Filters; each direct child is one grid cell, filled in pairs side by side. */
  children?: ReactNode
  /** Small text on the left of the actions row. */
  info?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {chips}
      {search}
      {children && <div className="grid gap-3 sm:grid-cols-2">{children}</div>}
      {(info || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-xs text-muted-foreground">{info}</div>
          {actions}
        </div>
      )}
    </div>
  )
}
