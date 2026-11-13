'use client'

// Collapsible card (the NIP vaccine-card pattern): white header with a soft hover tint; open
// header tinted with a navy left accent; body in a light panel. Height and opacity animate
// together (~220ms ease-out), instant with reduced motion. The header is a button with
// aria-expanded, so Enter / Space toggle it. Lists open one card at a time (useSingleOpen).

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
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

/** Single-open accordion state: opening one card closes the open one; clicking the open one
 *  closes it. Starts collapsed (or on `initial`) on every visit, never remembered. */
export function useSingleOpen<K extends string | number>(initial: K | null = null) {
  const [openKey, setOpenKey] = useState<K | null>(initial)
  return {
    isOpen: (key: K) => openKey === key,
    toggle: (key: K) => setOpenKey((cur) => (cur === key ? null : key)),
  }
}
