'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { TabIndicator } from '@/components/dashboard/tab-indicator'
import { cn } from '@/lib/utils'

export type TabItem<T extends string = string> = {
  value: T
  label: ReactNode
  /** Route tab: renders a link (aria-current) instead of a tab button. */
  href?: string
  disabled?: boolean
}

/**
 * The module tab row (Alerts is the reference): navy pill slides under the active tab, inactive
 * tabs are white with a soft border. Scrolls sideways on small screens instead of wrapping.
 * State tabs: pass onChange and wrap the content in <TabPanel tabKey={value}> for the fade.
 */
export function TabBar<T extends string>({ items, value, onChange, label, group, idBase, className }: {
  items: readonly TabItem<T>[]
  value: T
  onChange?: (value: T) => void
  /** Accessible name, e.g. "Vaccination sections". */
  label: string
  /** Keeps the slide position across remounts (route tabs); defaults to label. */
  group?: string
  /** Gives tabs ids `${idBase}-tab-${value}` and aria-controls `${idBase}-panel-${value}`. */
  idBase?: string
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)

  // Keep the active tab in view when the row scrolls (phones).
  useEffect(() => {
    const list = row.current
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]')
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return
    const left = tab.offsetLeft - 16
    const right = tab.offsetLeft + tab.offsetWidth + 16 - list.clientWidth
    if (list.scrollLeft > left) list.scrollLeft = left
    else if (list.scrollLeft < right) list.scrollLeft = right
  }, [value])

  const tabClass = (active: boolean) => cn(
    'relative z-10 shrink-0 whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    active ? 'border-transparent text-white' : 'border-border bg-white text-foreground shadow-sm hover:bg-muted',
  )
  const links = items.some((i) => i.href)

  return (
    <div className={cn('border-b border-border pb-3', className)}>
      <div
        ref={row}
        role={links ? undefined : 'tablist'}
        aria-label={links ? undefined : label}
        className="relative -m-1 flex gap-2 overflow-x-auto p-1"
      >
        {links ? (
          <nav aria-label={label} data-arrow-nav className="contents">
            {items.map((item) => (
              <Link key={item.value} href={item.href!} aria-current={item.value === value ? 'page' : undefined} className={tabClass(item.value === value)}>
                {item.label}
              </Link>
            ))}
          </nav>
        ) : items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={item.value === value}
            id={idBase && `${idBase}-tab-${item.value}`}
            aria-controls={idBase && `${idBase}-panel-${item.value}`}
            tabIndex={item.value === value ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange?.(item.value)}
            className={tabClass(item.value === value)}
          >
            {item.label}
          </button>
        ))}
        <TabIndicator group={group ?? label} activeKey={value} variant="pill" className="rounded-lg bg-primary" />
      </div>
    </div>
  )
}

/** Filter chips under the page header: smaller and rounder than the tabs so they read as filters. */
export function FilterChips<T extends string>({ options, value, onChange, label, className }: {
  options: readonly { value: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-foreground hover:bg-muted',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tabular-nums', active ? 'bg-white/20' : 'bg-muted text-muted-foreground')}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
