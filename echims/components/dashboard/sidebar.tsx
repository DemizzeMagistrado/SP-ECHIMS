'use client'

// Sidebar: user identity at the top (name, with role directly under the eCHIMS logo),
// modules grouped by purpose. The top bar's hamburger collapses it to an icon rail on
// desktop and opens it as a drawer on mobile (state lives in ./shell).
// Logout lives in the top bar's account menu.

import Link from 'next/link'
import { usePathname } from '@/lib/offline/navigation'
import {
  Home, Baby, Syringe, Apple, Package, AlertCircle, FileText, Settings,
  Users, Activity, Boxes, X,
} from 'lucide-react'
import { moduleRoutes, roleModules, type UserRole } from '@/lib/echims-data'
import type { Role } from '@/lib/auth/permissions'
import Image from 'next/image'
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
    ],
  },
]

// Pinned to the bottom of the panel, below the scrolling menu.
const footerItems: MenuItem[] = [
  { icon: Settings, label: 'Settings', href: moduleRoutes.Settings, matchPrefixes: ['/settings', '/organization'] },
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export function Sidebar({ role, fullName }: { role: Role; fullName: string }) {
  const pathname = usePathname()
  const { mobileOpen, setMobileOpen, collapsed } = useShell()

  const label = roleLabels[role]
  const groups = menuGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => roleModules[label].includes(item.label)) }))
    .filter((g) => g.items.length > 0)
  const footer = footerItems.filter((item) => roleModules[label].includes(item.label))

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
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-hidden rounded-r-3xl bg-[#03045E] text-white shadow-2xl transition-[transform,width] duration-300 ease-out motion-reduce:transition-none
          lg:sticky lg:top-3 lg:z-auto lg:m-3 lg:mr-0 lg:h-[calc(100dvh-1.5rem)] lg:shrink-0 lg:self-start lg:translate-x-0 lg:rounded-3xl lg:shadow-[0_20px_44px_-24px_rgba(3,4,94,0.7)]
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${rail ? 'lg:w-[76px]' : 'lg:w-64'}`}
      >
        {/* Brand + user identity, visible as soon as the dashboard opens */}
        <div className="px-3 pb-4 pt-4">
          <div className={`flex items-center ${rail ? 'justify-center' : 'justify-between'} gap-2 px-1`}>
            {!rail && (
              <Image src="/sidebar-logo.png" alt="eCHIMS" width={200} height={64} priority className="h-auto max-h-10 w-auto object-contain" />
            )}
            {rail && (
              <span aria-label="eCHIMS" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#087DB9] text-lg font-extrabold">e</span>
            )}
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
            className={`mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.07] ${rail ? 'justify-center p-2' : 'p-3'}`}
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
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.title} className="mt-4 first:mt-1">
              {rail ? (
                <div aria-hidden className="mx-auto mb-2 h-px w-8 bg-white/10" />
              ) : (
                <p className="mb-1.5 px-3 text-xs font-semibold text-white/45">{group.title}</p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}><NavLink item={item} rail={rail} active={isActive(item, pathname)} /></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {footer.length > 0 && (
          <ul className="space-y-1 border-t border-white/10 px-3 py-3">
            {footer.map((item) => (
              <li key={item.href}><NavLink item={item} rail={rail} active={isActive(item, pathname)} /></li>
            ))}
          </ul>
        )}
      </aside>
    </>
  )
}

function isActive(item: MenuItem, pathname: string) {
  return pathname === item.href || (item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false)
}

// Rail: a centered icon tile, filled sky when active. Expanded: a full-width row with a rounded pill when active.
function NavLink({ item, rail, active }: { item: MenuItem; rail: boolean; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      title={rail ? item.label : undefined}
      aria-label={rail ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#90E0EF] ${
        rail ? 'mx-auto h-11 w-11 justify-center rounded-xl' : 'gap-3 rounded-full px-3.5 py-2.5'
      } ${
        active
          ? rail ? 'bg-[#087DB9] text-white shadow-[0_8px_18px_-10px_rgba(8,125,185,0.9)]' : 'bg-white text-[#03045E]'
          : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
      }`}
    >
      <Icon size={19} strokeWidth={1.75} className={active && !rail ? 'text-[#087DB9]' : ''} />
      {!rail && <span className="truncate">{item.label}</span>}
    </Link>
  )
}
