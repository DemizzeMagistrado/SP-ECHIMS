'use client'

import { usePathname } from '@/lib/offline/navigation'
import { TabBar } from '@/components/ui/module-tabs'
import {
  canPerform,
  moduleTabs,
  type UserRole,
} from '@/lib/echims-data'

export function ModuleTabs({
  parent,
  role,
}: {
  parent: keyof typeof moduleTabs
  role: UserRole | undefined
}) {
  const pathname = usePathname()

  if (!role) return null

  const tabs = [...(moduleTabs[parent] ?? [])]
  // FINAL-POLISH: Child Profiling is a strict three-tab layout.
  //   Children · Map · Transfer Inbox (for PHN / RHM / BHW).
  // Archived-children now lives inside the Children tab as a view toggle, so no
  // Archived Children tab is pushed. Admin and BNS see only Children · Map.
  if (parent === 'Child Profiling' && ['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(role)) {
    tabs.push({label:'Transfer Inbox',href:'/child-profiling/transfers',module:'Child Profiling'})
  }

  const visibleTabs = tabs.filter((tab) =>
    canPerform(role, tab.module, 'view'),
  )

  if (visibleTabs.length <= 1) return null

  const active = visibleTabs.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))

  // Route tabs: the page (and this bar) remounts per tab; the pill slides from its last spot.
  return (
    <TabBar
      label={`${parent} sections`}
      group={parent}
      value={active?.href ?? ''}
      items={visibleTabs.map((tab) => ({ value: tab.href, label: tab.label, href: tab.href }))}
    />
  )
}
