'use client'
import { createContext, useContext } from 'react'
import { usePathname as useNextPathname, useRouter as useNextRouter } from 'next/navigation'

// The offline shell supplies the requested route to the original navigation components.
export const OfflinePathContext = createContext<string | null>(null)
export function usePathname() {
  const requested = useContext(OfflinePathContext)
  const pathname = useNextPathname()
  return requested ?? pathname
}
export function useRouter() {
  const router = useNextRouter()
  const offlinePath = useContext(OfflinePathContext)
  return {
    ...router,
    push(href: string, options?: { scroll?: boolean }) {
      if (offlinePath || !navigator.onLine) window.location.assign(href)
      else router.push(href, options)
    },
    replace(href: string, options?: { scroll?: boolean }) {
      if (offlinePath || !navigator.onLine) window.location.replace(href)
      else router.replace(href, options)
    },
    refresh() {
      if (offlinePath || !navigator.onLine) window.location.reload()
      else router.refresh()
    },
  }
}

export function routeSearch() {
  if (window.location.pathname !== '/offline') return window.location.search
  const requested = new URLSearchParams(window.location.search).get('path')
  if (!requested || !requested.startsWith('/') || requested.startsWith('//')) return ''
  try {
    const url = new URL(requested, window.location.origin)
    return url.origin === window.location.origin ? url.search : ''
  } catch { return '' }
}
