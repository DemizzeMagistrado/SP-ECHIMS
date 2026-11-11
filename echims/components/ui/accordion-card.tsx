'use client'

// Collapsible card (the NIP vaccine-card pattern): white header with a soft hover tint; open
// header tinted with a navy left accent; body in a light panel. Height and opacity animate
// together (~220ms ease-out), instant with reduced motion. The header is a button with
// aria-expanded, so Enter / Space toggle it.

import type { ReactNode } from 'react'
import { ChevronDown, ChevronsDown, ChevronsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        onClick={onToggle}
        className={cn(
          'flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1.5 border-l-4 px-4 py-3 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          open ? 'border-l-primary bg-brand-ice' : 'border-l-transparent bg-white hover:bg-brand-ice/50',
        )}
      >
        <ChevronDown size={16} aria-hidden="true" className={cn('shrink-0 text-brand-muted transition-transform duration-200 ease-out motion-reduce:transition-none', open && 'rotate-180')} />
        {header}
      </button>
      <div id={panelId} className={cn('grid transition-[grid-template-rows,opacity] duration-[220ms] ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden" inert={!open}>
          <div className="border-t border-primary/15 bg-slate-50 px-3 py-3 sm:px-4">{children}</div>
        </div>
      </div>
    </li>
  )
}

/** Expand all / Collapse all, each disabled when it would do nothing. */
export function ExpandCollapseAll({ allOpen, noneOpen, onSet }: { allOpen: boolean; noneOpen: boolean; onSet: (open: boolean) => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" size="sm" onClick={() => onSet(true)} disabled={allOpen}>
        <ChevronsDown size={14} aria-hidden="true" />Expand all
      </Button>
      <Button variant="secondary" size="sm" onClick={() => onSet(false)} disabled={noneOpen}>
        <ChevronsUp size={14} aria-hidden="true" />Collapse all
      </Button>
    </div>
  )
}
