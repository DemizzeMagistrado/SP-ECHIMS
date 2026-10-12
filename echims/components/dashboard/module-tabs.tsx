'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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

  return (
    <nav
      aria-label={`${parent} sections`}
      className="flex flex-wrap gap-1 border-b border-[#E5E7EB]"
    >
      {visibleTabs.map((tab) => {
        const active =
          pathname === tab.href ||
          pathname.startsWith(`${tab.href}/`)

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              active
                ? 'border-[#0077B6] text-[#0077B6]'
                : 'border-transparent text-[#6B7280] hover:text-[#03045E]'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}