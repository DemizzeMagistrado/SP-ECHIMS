'use client'

// RPT-USR001 polish — Collapsible sidebar.
// State persists in localStorage (`echims-sidebar-collapsed`) so the choice
// survives page reloads. When collapsed, the sidebar shrinks to a 72px rail
// showing icons only; tooltips appear on hover via title attribute. Logout
// moved to top-nav Settings menu — removed from here.

import Link from 'next/link'
import { usePathname } from '@/lib/offline/navigation'
import { useEffect, useState } from 'react'
import {
  Home, Baby, Syringe, Apple, Package, AlertCircle, FileText, Settings,
  User, Users, Activity, Map, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  moduleRoutes,
  roleModules,
  type UserRole,
} from '@/lib/echims-data'
import type { Role } from '@/lib/auth/permissions'
import Image from 'next/image'

const roleLabels: Record<Role, UserRole> = {
  Administrator: 'Administrator',
  PHN: 'Public Health Nurse',
  RHM: 'Rural Health Midwife',
  BHW: 'Barangay Health Worker',
  BNS: 'Barangay Nutrition Scholar',
}

type MenuItem = {
  icon: typeof Home
  label: string
  href: string
  matchPrefixes?: string[]
}

const menuItems: MenuItem[] = [
  { icon: Home, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'User Management', href: '/user-management' },
  {
    icon: Baby, label: 'Child Profiling', href: moduleRoutes['Child Profiling'],
    matchPrefixes: ['/child-profiling', '/children', '/geospatial', '/masterlist-upload'],
  },
  {
    icon: Syringe, label: 'Vaccination', href: moduleRoutes.Vaccination,
    matchPrefixes: ['/vaccination', '/vaccinations'],
  },
  { icon: Activity, label: 'Health Activities', href: '/health-activities' },
  {
    icon: Apple, label: 'Nutritional Assessment', href: moduleRoutes['Nutritional Assessment'],
    matchPrefixes: ['/nutritional-assessment', '/nutrition'],
  },
  {
    icon: Package, label: 'Supplementation', href: moduleRoutes.Supplementation,
    matchPrefixes: ['/supplementation', '/supplements'],
  },
  { icon: Map, label: 'Inventory', href: moduleRoutes.Inventory, matchPrefixes: ['/inventory'] },
  { icon: AlertCircle, label: 'Alerts', href: moduleRoutes.Alerts },
  { icon: FileText, label: 'Reports', href: moduleRoutes.Reports },
  { icon: Settings, label: 'Settings', href: moduleRoutes.Settings, matchPrefixes: ['/settings', '/organization'] },
]

const STORAGE_KEY = 'echims-sidebar-collapsed'

export function Sidebar({ role, fullName }: { role: Role; fullName: string }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Rehydrate collapse preference after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === '1') setCollapsed(true)
    } catch { /* localStorage can throw in some sandboxes; ignore */ }
    setMounted(true)
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const frontendRole = roleLabels[role]
  const visibleItems = menuItems.filter((item) => roleModules[frontendRole].includes(item.label))

  // During the pre-mount render we always use the expanded (56) width so SSR
  // and first client paint agree. Hydration swap happens after the useEffect.
  const widthClass = mounted && collapsed ? 'w-[72px]' : 'w-56'

  return (
    <aside className={`sticky top-0 flex max-h-screen min-h-screen ${widthClass} shrink-0 flex-col overflow-y-auto border-r border-[#0B4F8A] bg-[#075985] text-white transition-[width] duration-200`}>
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between border-b border-white/15 px-3 py-4">
        {!collapsed ? (
          <Image src="/sidebar-logo.png" alt="eCHIMS" width={200} height={64} priority
            className="h-auto max-h-12 w-auto object-contain" />
        ) : (
          <span className="mx-auto text-lg font-bold">e</span>
        )}
        <button type="button" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="shrink-0 rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Menu */}
      <nav className="flex-1 py-3">
        <ul className="space-y-1 px-2">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const prefixMatch = item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false
            const isActive = pathname === item.href || prefixMatch
            return (
              <li key={item.href}>
                <Link href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive ? 'bg-white text-[#075985] shadow-md' : 'text-sky-50 hover:bg-white/10 hover:text-white'
                  }`}>
                  <Icon size={20} strokeWidth={1.5} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User card — simplified in collapsed mode; logout moved to top-nav */}
      <div className="border-t border-white/15 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <User size={18} className="text-white" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{fullName}</p>
              <p className="truncate text-xs text-white/70">{roleLabels[role]}</p>
            </div>
          </div>
        ) : (
          <div title={`${fullName} · ${roleLabels[role]}`}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <User size={16} className="text-white" />
          </div>
        )}
      </div>
    </aside>
  )
}
