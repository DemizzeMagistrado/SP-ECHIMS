'use client'

// Collapsible card (the NIP vaccine-card pattern): white header with a soft hover tint; open
// header tinted with a navy left accent; body in a light panel. Height and opacity animate
// together (~220ms ease-out), instant with reduced motion. The header is a button with
// aria-expanded, so Enter / Space toggle it.

import type { ReactNode } from 'react'
import { ChevronDown, ChevronsDown, ChevronsUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AccordionCard({ id, open, onToggle, header, children, className }: {
  /** Unique id; the panel gets `${id}-panel`. */
  id: string
  open: boolean
  onToggle: () => void
  /** Header content to the right of the chevron (title on the left, summary on the right). */
  header: ReactNode
  children: ReactNode
  className?: string
}) {
  const panelId = `${id}-panel`
  return (
    <li className={cn('overflow-hidden rounded-xl border transition-colors duration-200', open ? 'border-primary/25 shadow-sm' : 'border-border', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        data-accordion-header=""
        onClick={onToggle}
        className={cn(
          'flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1.5 border-l-4 px-4 py-3 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          open ? 'border-l-primary bg-brand-ice' : 'border-l-transparent bg-white hover:bg-brand-ice/50',
        )}
      >
        <ChevronDown size={16} aria-hidden="true" className={cn('shrink-0 text-brand-muted transition-transform duration-200 ease-out motion-reduce:transition-none', open && 'rotate-180')} />
        {header}
      </button>
      <div id={panelId} data-accordion-panel="" className={cn('grid transition-[grid-template-rows,opacity] duration-[220ms] ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden" inert={!open}>
          <div className="border-t border-primary/15 bg-slate-50 px-3 py-3 sm:px-4">{children}</div>
        </div>
      </div>
    </li>
  )
}

/** Expand all / Collapse all as one small segmented pair, each half disabled when it would do
 *  nothing. Lists using it start fully collapsed on every visit (keep open state in component
 *  state, never storage). */
export function ExpandCollapseAll({ allOpen, noneOpen, onSet }: { allOpen: boolean; noneOpen: boolean; onSet: (open: boolean) => void }) {
  const half = 'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-brand-navy outline-none transition-colors hover:bg-white hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand-blue/35 disabled:pointer-events-none disabled:text-slate-500 [&_svg]:text-brand-blue disabled:[&_svg]:text-slate-400'
  return (
    <div role="group" aria-label="Expand or collapse all" className="inline-flex items-center gap-0.5 rounded-lg bg-brand-blue/[0.07] p-0.5">
      <button type="button" className={half} onClick={() => onSet(true)} disabled={allOpen}>
        <ChevronsDown size={14} aria-hidden="true" />Expand all
      </button>
      <span aria-hidden="true" className="h-4 w-px bg-brand-blue/15" />
      <button type="button" className={half} onClick={() => onSet(false)} disabled={noneOpen}>
        <ChevronsUp size={14} aria-hidden="true" />Collapse all
      </button>
    </div>
  )
}
