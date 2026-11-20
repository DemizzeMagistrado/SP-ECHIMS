'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TabIndicator } from '@/components/dashboard/tab-indicator'

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
 *  - sub: tabs nested in a section, card or dialog (and the sticky section bar). No strip: separate
 *    13px pills (subPill), inactive = white with the main tabs' light border, active = solid navy.
 * State tabs: pass onChange and wrap the content in <TabPanel tabKey={value}> for the fade.
 *
 * Every strip (main and sub tabs, view switches, joined strips, the sticky section bar) slides one
 * navy fill (TabIndicator) behind the active item instead of recolouring it in place. Items keep a
 * white (or clear) background in both states and wrap their label in <PillLabel>, so the fill
 * crosses neighbours visibly and the text stays on top. Text and border colours change over the
 * same 250ms as the slide; both states share one font weight, so the pill never changes size.
 */
const slideColors = 'transition-[color,border-color,background-color] duration-[250ms] [transition-timing-function:var(--ease-smooth)] motion-reduce:transition-none'
/** The strip around the items: the sliding fill is positioned inside it. */
export const strip = 'relative isolate'
/** Label inside a strip item: above the sliding fill. */
export function PillLabel({ children }: { children: ReactNode }) {
  return <span className="relative z-[1] inline-flex items-center gap-1.5">{children}</span>
}
/** Sliding fill for pills (sub tabs, view switches, sticky bar) and for the main tabs. */
export const pillFill = 'rounded-lg bg-[#07075F] shadow-[0_1px_3px_rgba(12,18,96,0.18)]'

/** Sub-level pill shared by sub tabs, view switches and the sticky section bar. */
export const subPill = (active: boolean) => cn(
  'relative inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border bg-white px-4 py-1.5 text-[13px] font-semibold outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-60',
  slideColors,
  active
    ? 'border-[#07075F] text-white'
    : 'border-[#D5E2EA] text-[#55617F] hover:border-[#8896B0] hover:bg-[#F5F8FA] hover:text-[#0C1260] active:bg-brand-ice',
)

/** Joined strip for short toggles (2-3 options, e.g. Month / Week): no border; a light brand-ice
 *  track with a soft inner shadow, so it reads as one recessed control. The navy fill
 *  (segmentFill) slides to the selected segment. */
export const segmentGroup = 'relative isolate inline-flex gap-0.5 rounded-lg bg-brand-ice p-0.5 shadow-[inset_0_1px_3px_rgba(12,18,96,0.12)]'
export const segmentFill = 'rounded-md bg-[#07075F] shadow-[0_1px_3px_rgba(12,18,96,0.25)]'
export const segmentButton = (active: boolean) => cn(
  'relative inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 py-1.5 text-[13px] font-semibold outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-link',
  slideColors,
  active ? 'text-white' : 'text-[#07075F] hover:bg-white/70 active:bg-white',
)

export function TabBar<T extends string>({ items, value, onChange, label, group, idBase, className, variant = 'main' }: {
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
    ? subPill(active)
    : cn(
      'relative shrink-0 whitespace-nowrap rounded-lg border bg-white px-5 py-2 text-sm font-semibold outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-60',
      slideColors,
      active ? 'border-[#07075F] text-white' : 'border-[#D5E2EA] text-[#55617F] hover:border-[#8896B0] hover:bg-[#F5F8FA]',
    )
  const links = items.some((i) => i.href)

  return (
    <div className={cn(!sub && 'border-b border-border pb-3', className)}>
      <div
        ref={row}
        role={links ? undefined : 'tablist'}
        aria-label={links ? undefined : label}
        className={cn(strip, sub
          ? 'flex w-fit max-w-full gap-1.5 overflow-x-auto p-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'flex flex-wrap gap-1.5')}
      >
        {links ? (
          <nav aria-label={label} data-arrow-nav className="contents">
            {items.map((item) => (
              <Link key={item.value} href={item.href!} aria-current={item.value === value ? 'page' : undefined} className={tabClass(item.value === value)}>
                <PillLabel>{item.label}</PillLabel>
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
            <PillLabel>{item.label}</PillLabel>
          </button>
        ))}
        <TabIndicator group={group ?? label} activeKey={value} className={pillFill} />
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
    // Same button-like pills and sliding navy fill as the sub tabs (subPill + TabIndicator).
    <div role="group" aria-label={label} className={cn(strip, 'flex flex-wrap items-center gap-1.5', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(subPill(active), 'shadow-[0_1px_2px_rgba(12,18,96,0.06)]')}
          >
            <PillLabel>
              {o.label}
              {o.count !== undefined && (
                <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tabular-nums', slideColors, active ? 'bg-white/20 text-white' : 'bg-brand-ice text-[#55617F]')}>{o.count}</span>
              )}
            </PillLabel>
          </button>
        )
      })}
      <TabIndicator group={`chips:${label}`} activeKey={value} className={pillFill} />
    </div>
  )
}
