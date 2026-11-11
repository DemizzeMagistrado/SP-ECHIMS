'use client'

// Sidebar: user identity at the top (name, with role directly under the eCHIMS logo),
// modules grouped by purpose. The top bar's hamburger collapses it to an icon rail on
// desktop and opens it as a drawer on mobile (state lives in ./shell).
// Logout lives in the top bar's account menu.

import Link from 'next/link'
import { usePathname, useRouter } from '@/lib/offline/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Home, Baby, Syringe, Apple, Package, AlertCircle, FileText, Settings,
  Users, Activity, Boxes, X,
} from 'lucide-react'
import { moduleRoutes, roleModules, type UserRole } from '@/lib/echims-data'
import type { Role } from '@/lib/auth/permissions'
import { Logo } from '@/components/brand/logo'
import { useShell } from './shell'

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

const menuGroups: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { icon: Home, label: 'Dashboard', href: '/dashboard' },
      { icon: AlertCircle, label: 'Alerts', href: moduleRoutes.Alerts },
    ],
  },
  {
    title: 'Child health',
    items: [
      {
        icon: Baby, label: 'Child Profiling', href: moduleRoutes['Child Profiling'],
        matchPrefixes: ['/child-profiling', '/children', '/geospatial', '/masterlist-upload'],
      },
      { icon: Syringe, label: 'Vaccination', href: moduleRoutes.Vaccination, matchPrefixes: ['/vaccination', '/vaccinations'] },
      {
        icon: Apple, label: 'Nutritional Assessment', href: moduleRoutes['Nutritional Assessment'],
        matchPrefixes: ['/nutritional-assessment', '/nutrition'],
      },
      { icon: Package, label: 'Supplementation', href: moduleRoutes.Supplementation, matchPrefixes: ['/supplementation', '/supplements'] },
      { icon: Activity, label: 'Health Activities', href: '/health-activities' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: Boxes, label: 'Inventory', href: moduleRoutes.Inventory, matchPrefixes: ['/inventory'] },
      { icon: FileText, label: 'Reports', href: moduleRoutes.Reports },
    ],
  },
  {
    title: 'Administration',
    items: [
      { icon: Users, label: 'User Management', href: '/user-management' },
      { icon: Settings, label: 'Settings', href: moduleRoutes.Settings, matchPrefixes: ['/settings', '/organization'] },
    ],
  },
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export function Sidebar({ role, fullName }: { role: Role; fullName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { mobileOpen, setMobileOpen, collapsed } = useShell()
  // The clicked item turns active at once; the real pathname takes over when the route commits.
  const [clicked, setClicked] = useState<string | null>(null)
  useEffect(() => setClicked(null), [pathname])
  // Next prefetches visible links in production; hover/focus also covers the collapsed rail and dev.
  const prefetch = (href: string) => { if (navigator.onLine) router.prefetch(href) }

  const label = roleLabels[role]
  const groups = useMemo(() => menuGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => roleModules[label].includes(item.label)) }))
    .filter((g) => g.items.length > 0), [label])

  // The rail only applies on desktop; the mobile drawer is always full width.
  const rail = collapsed && !mobileOpen

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={`fixed inset-0 z-40 bg-[#03045E]/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        id="main-sidebar"
        aria-label="Main navigation"
        className={`scroll-subtle-dark fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#03045E] text-white shadow-2xl transition-[transform,width] duration-300 ease-out
          lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 lg:shadow-none
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${rail ? 'lg:w-[76px]' : 'lg:w-64'}`}
      >
        {/* Brand + user identity, visible as soon as the dashboard opens */}
        <div className="px-3 pb-4 pt-4">
          <div className="flex items-center justify-between gap-2 px-1">
            {/* Wordmark and icon sit on top of each other and crossfade as the rail opens or closes. */}
            <div className="relative h-10 min-w-0 flex-1 overflow-hidden">
              {/* left-2 lines the wordmark up with the nav items' icon column (12px nav + 12px item padding). */}
              <span aria-hidden={rail} className={`absolute inset-y-0 left-2 flex items-center transition-opacity duration-300 ${rail ? 'opacity-0' : 'opacity-100'}`}>
                <Logo tone="light" size={30} priority />
              </span>
              {/* 6px + 16px header padding + half of 32px = 38px, the centre of the 76px rail. */}
              <span aria-hidden={!rail} className={`absolute inset-y-0 left-[6px] flex items-center transition-opacity duration-300 ${rail ? 'opacity-100' : 'opacity-0'}`}>
                <Logo variant="icon" tone="light" size={32} />
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="shrink-0 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#90E0EF] lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          <div
            title={rail ? `${fullName}, ${label}` : undefined}
            className={`mt-4 flex items-center gap-3 rounded-xl bg-white/[0.07] ${rail ? 'justify-center p-2' : 'p-3'}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#087DB9] text-sm font-bold">
              {initials(fullName)}
            </span>
            {!rail && (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{fullName}</p>
                <p className="truncate text-xs text-[#90E0EF]">{label}</p>
              </div>
            )}
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.title} className="mt-4 first:mt-1">
              {rail ? (
                <div aria-hidden className="mx-auto mb-2 h-px w-8 bg-white/10" />
              ) : (
                <p className="mb-1.5 px-3 text-xs font-semibold text-white/60">{group.title}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const prefixMatch = item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false
                  const isActive = clicked ? clicked === item.href : pathname === item.href || prefixMatch
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={rail ? item.label : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) setClicked(item.href) }}
                        onMouseEnter={() => prefetch(item.href)}
                        onFocus={() => prefetch(item.href)}
                        className={`group relative flex items-center ${rail ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#90E0EF] ${
                          isActive ? 'bg-white text-[#03045E]' : 'text-white/75 hover:bg-white/[0.08] hover:text-white'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#90E0EF] transition-transform duration-300 ${
                            isActive ? 'scale-y-100' : 'scale-y-0'
                          }`}
                        />
                        <Icon size={19} strokeWidth={1.75} className={isActive ? 'text-[#087DB9]' : ''} />
                        {!rail && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
