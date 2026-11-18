'use client'

import {withTransferInbox} from '@/lib/child-profiling-tabs'
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
  if (parent === 'Child Profiling' && ['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(role)) {
    if (!tabs.some(tab => tab.href === '/child-profiling/archived')) tabs.push({label:'Archived Children',href:'/child-profiling/archived',module:'Child Profiling'})
    tabs.splice(0,tabs.length,...withTransferInbox(tabs,role))
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
