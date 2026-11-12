'use client'

// Page access from the one role matrix (lib/echims-data canAccess): a page whose module the role
// cannot 'view' shows "Not available for your role" instead of rendering (before NIP-REV01 only the
// sidebar hid links; typing a URL opened the page). Paths outside the matrix render as before.
// The APIs and RLS still enforce access on their own; this only keeps the UI consistent.

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth/auth-provider'
import { usePathname } from '@/lib/offline/navigation'
import { canAccess, routeModule, toUserRole } from '@/lib/echims-data'
import { StatusPage } from '@/components/ui/status-page'
import { buttonVariants } from '@/components/ui/button'

export function RouteGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname() ?? ''
  const role = toUserRole(user?.role)
  if (!role || !routeModule(pathname) || canAccess(role, pathname)) return <>{children}</>
  return (
    <StatusPage
      area="content"
      title="Not available for your role"
      message="Your account cannot open this page. Ask your administrator if you need access."
      actions={<Link href="/dashboard" className={buttonVariants({ variant: 'secondary' })}>Back to Dashboard</Link>}
    />
  )
}
