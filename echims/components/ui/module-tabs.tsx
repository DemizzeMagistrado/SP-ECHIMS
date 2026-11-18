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
 * Tab rows, two levels that must look different at a glance:
 *  - main (default): page-level tabs under the title, on the page (no strip): active = solid #07075F
 *    with white text; inactive = white with a #D5E2EA border. Wraps on phones.
 *  - sub: tabs nested in a section, card or dialog (and the sticky section bar). A gray #F0F2F5 strip;
 *    a white pill slides under the active tab (#07075F text); inactive tabs are transparent. 13px.
 * State tabs: pass onChange and wrap the content in <TabPanel tabKey={value}> for the fade.
 */
export function TabBar<T extends string>({ items, value, onChange, label, group, idBase, className, variant = 'main' }: {
  items: readonly TabItem<T>[]
  value: T
  onChange?: (value: T) => void
  /** Accessible name, e.g. "Vaccination sections". */
  label: string
  /** Keeps the slide position across remounts (sub tabs); defaults to label. */
  group?: string
  /** Gives tabs ids `${idBase}-tab-${value}` and aria-controls `${idBase}-panel-${value}`. */
  idBase?: string
  className?: string
  variant?: 'main' | 'sub'
}) {
  const row = useRef<HTMLDivElement>(null)
  const sub = variant === 'sub'

  // Sub strips scroll sideways on phones: keep the active tab in view.
  useEffect(() => {
    const list = row.current
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]')
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return
    const left = tab.offsetLeft - 16
    const right = tab.offsetLeft + tab.offsetWidth + 16 - list.clientWidth
    if (list.scrollLeft > left) list.scrollLeft = left
    else if (list.scrollLeft < right) list.scrollLeft = right
  }, [value])

  const tabClass = (active: boolean) => sub
    ? cn(
      'relative z-10 shrink-0 whitespace-nowrap rounded-lg px-4 py-1.5 text-[13px] transition-all duration-150 outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-60',
      active ? 'font-semibold text-[#07075F]' : 'font-medium text-[#55617F] hover:bg-[rgba(7,7,95,0.05)] hover:text-[#0C1260]',
    )
    : cn(
      'shrink-0 whitespace-nowrap rounded-lg border px-5 py-2 text-sm transition-all duration-150 outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-60',
      active ? 'border-[#07075F] bg-[#07075F] font-semibold text-white' : 'border-[#D5E2EA] bg-white font-medium text-[#55617F] hover:border-[#8896B0] hover:bg-[#F5F8FA]',
    )
  const links = items.some((i) => i.href)

  return (
    <div className={cn(!sub && 'border-b border-border pb-3', className)}>
      <div
        ref={row}
        role={links ? undefined : 'tablist'}
        aria-label={links ? undefined : label}
        className={sub
          ? 'relative flex w-fit max-w-full gap-1 overflow-x-auto rounded-[10px] bg-[#F0F2F5] p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'flex flex-wrap gap-1.5'}
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
        {sub && <TabIndicator group={group ?? label} activeKey={value} className="rounded-lg bg-white shadow-[0_1px_3px_rgba(12,18,96,0.08)]" />}
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
