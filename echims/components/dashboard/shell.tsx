'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from '@/lib/offline/navigation'

// One hamburger button (in the top bar) drives the sidebar on every screen size:
// desktop toggles full sidebar <-> icon rail (remembered), mobile opens a drawer.
type ShellState = {
  inShell: boolean
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  collapsed: boolean
  toggleMenu: () => void
}

const ShellContext = createContext<ShellState>({
  inShell: false, mobileOpen: false, setMobileOpen: () => {}, collapsed: false, toggleMenu: () => {},
})
export const useShell = () => useContext(ShellContext)

const STORAGE_KEY = 'echims-sidebar-collapsed'

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  // Rehydrate the desktop preference after mount (avoids SSR mismatch).
  useEffect(() => {
    try { if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true) } catch { /* storage blocked; ignore */ }
  }, [])

  const toggleMenu = useCallback(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((c) => {
        try { localStorage.setItem(STORAGE_KEY, c ? '0' : '1') } catch { /* ignore */ }
        return !c
      })
    } else {
      setMobileOpen((o) => !o)
    }
  }, [])

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

  return (
    <ShellContext.Provider value={{ inShell: true, mobileOpen, setMobileOpen, collapsed, toggleMenu }}>
      {children}
    </ShellContext.Provider>
  )
}
