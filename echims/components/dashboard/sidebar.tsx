'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Baby,
  Syringe,
  Apple,
  Package,
  AlertCircle,
  FileText,
  Settings,
  User,
  LogOut,
  Users,
  Activity,
  Map,
} from 'lucide-react'
import { moduleRoutes, roleModules, type UserRole } from '@/lib/echims-data'
import Image from 'next/image'
import { useAuth } from '@/components/auth/auth-provider'

// Flat top-level menu per the frontend guide. Each parent page renders its own sub-tabs
// (see moduleTabs in echims-data.ts) for Geospatial/Masterlist Import/Vaccination Schedule/
// Stock Allocation/Inventory Transactions/Organization.
// matchPrefixes keeps the parent highlighted when the user is on any of its sub-routes
// (e.g. /vaccination/schedule still highlights the Vaccination parent).
type MenuItem = { icon: typeof Home; label: string; href: string; matchPrefixes?: string[] }
const menuItems: MenuItem[] = [
  { icon: Home, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'User Management', href: moduleRoutes['User Management'] },
  { icon: Baby, label: 'Child Profiling', href: moduleRoutes['Child Profiling'], matchPrefixes: ['/child-profiling', '/children', '/geospatial', '/masterlist-upload'] },
  { icon: Syringe, label: 'Vaccination', href: moduleRoutes.Vaccination, matchPrefixes: ['/vaccination', '/vaccinations'] },
  { icon: Apple, label: 'Nutritional Assessment', href: moduleRoutes['Nutritional Assessment'], matchPrefixes: ['/nutritional-assessment', '/nutrition'] },
  { icon: Package, label: 'Supplementation', href: moduleRoutes.Supplementation, matchPrefixes: ['/supplementation', '/supplements'] },
  { icon: Map, label: 'Inventory', href: moduleRoutes.Inventory, matchPrefixes: ['/inventory'] },
  { icon: Activity, label: 'Health Activities', href: moduleRoutes['Health Activities'], matchPrefixes: ['/health-activities'] },
  { icon: AlertCircle, label: 'Alerts', href: moduleRoutes.Alerts },
  { icon: FileText, label: 'Reports', href: moduleRoutes.Reports },
  { icon: Settings, label: 'Settings', href: moduleRoutes.Settings, matchPrefixes: ['/settings', '/organization'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const { logout, user } = useAuth()
  // Hide every optional item until the role has loaded so pending-approval accounts and
  // early-render frames never flash a broader menu than the user is entitled to.
  const role = user?.role as UserRole | undefined
  const visibleItems = role ? menuItems.filter((item) => roleModules[role].includes(item.label)) : menuItems.filter((item) => item.label === 'Dashboard')

  async function handleLogout() {
    await logout()
    // replace (not assign) so the dashboard is overwritten in the browser history.
    // Otherwise the back arrow brings the user to /dashboard, which auth-redirects to
    // /login — looking like logout dumped them on login instead of the landing page.
    window.location.replace('/')
  }

  return (
    <aside className="sticky top-0 flex max-h-screen min-h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-[#0B4F8A] bg-[#075985] text-white">
      {/* Logo Section */}
      <div className="border-b border-white/15 px-5 pb-5 pt-5">
        <div className="flex h-14 items-center overflow-visible">
          <Image
            src="/sidebar-logo.png"
            alt="eCHIMS Logo"
            width={250}
            height={84}
            priority
            className="h-auto w-full max-w-[250px] object-contain object-left"
          />
        </div>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 py-3">
        <ul className="space-y-1 px-2">
          {visibleItems.map((item) => {
            const Icon = item.icon
            const prefixMatch = item.matchPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false
            const isActive = pathname === item.href || prefixMatch || (item.href === '/' && pathname === '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-white text-[#075985] shadow-md'
                      : 'text-sky-50 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={20} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User Profile Section */}
      <div className="border-t border-white/15 p-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
            <User size={18} className="text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user?.fullName ?? 'User'}</p>
            <p className="truncate text-xs text-white/70">{user?.requestedRole ?? user?.role ?? 'Authenticated User'}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="mt-3 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white">
          <LogOut size={18} strokeWidth={1.5} />
          <span>Logout</span>
        </button>
      </div>

      {/* Footer */}
      <div className="border-t border-white/15 p-4 text-center">
        <p className="text-xs font-medium text-white/60">eCHIMS v1.0</p>
      </div>
    </aside>
  )
}