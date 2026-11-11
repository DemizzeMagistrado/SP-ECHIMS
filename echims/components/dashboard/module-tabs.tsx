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

  const existingTabs = (moduleTabs[parent] ?? []).filter(
    (tab) =>
      !(
        parent === 'Vaccination' &&
        tab.href === '/vaccination/sms'
      ),
  )

  const tabs = [
    ...existingTabs,
    ...(parent === 'Vaccination'
      ? [
          {
            label: 'SMS Reminders',
            href: '/vaccination/sms',
            module: 'Vaccination' as const,
          },
        ]
      : []),
  ]

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
