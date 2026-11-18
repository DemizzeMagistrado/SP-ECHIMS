import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SectionHeader } from '@/components/ui/report-parts'

/** One section of an Inventory tab: jump target for the sticky section bar, SectionHeader with
 *  "About this view", and a 2px divider (40px above, 32px inside) before every section but the first. */
export function InventorySection({ id, title, subtitle, about, actions, first = false, children }: {
  id: string
  title: string
  subtitle: string
  about: ReactNode
  actions?: ReactNode
  first?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-[var(--subnav-offset,8rem)] space-y-4', !first && 'mt-10 border-t-2 border-[#EAF0F4] pt-8')}
    >
      <SectionHeader title={<span id={`${id}-title`}>{title}</span>} subtitle={subtitle} about={about} actions={actions} />
      {children}
    </section>
  )
}
