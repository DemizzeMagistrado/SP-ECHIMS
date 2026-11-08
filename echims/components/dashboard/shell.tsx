'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from '@/lib/offline/navigation'

// Shares the mobile menu state between the sidebar (drawer) and the top bar (menu button).
type ShellState = { mobileOpen: boolean; setMobileOpen: (open: boolean) => void; inShell: boolean }
const ShellContext = createContext<ShellState>({ mobileOpen: false, setMobileOpen: () => {}, inShell: false })
export const useShell = () => useContext(ShellContext)

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close the drawer after navigating, and on Escape.
  useEffect(() => setMobileOpen(false), [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  return <ShellContext.Provider value={{ mobileOpen, setMobileOpen, inShell: true }}>{children}</ShellContext.Provider>
}
