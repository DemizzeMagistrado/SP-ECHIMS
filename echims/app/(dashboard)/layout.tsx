'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/dashboard/sidebar'
import { TopNav } from '@/components/dashboard/top-nav'
import { useAuth } from '@/components/auth/auth-provider'
import { canAccess, type UserRole } from '@/lib/echims-data'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isReady, user } = useAuth()

  useEffect(() => {
    if (!isReady) return
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    if (user && !canAccess(user.role as UserRole, pathname)) router.replace('/dashboard')
  }, [isAuthenticated, isReady, pathname, router, user])

  if (!isReady || !isAuthenticated || !user) return null

  return (
    <div className="flex min-h-screen items-stretch bg-[#CAF0F8]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Top Navigation */}
        <TopNav />

        {/* Page content */}
        <main className="min-h-0 flex-1 overflow-y-auto bg-[#CAF0F8] p-8">
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
