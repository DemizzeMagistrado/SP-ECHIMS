'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { SWRConfig, useSWRConfig } from 'swr'
import { useAuth } from '@/components/auth/auth-provider'
import { AutomaticPreparation } from '@/components/offline/automatic-preparation'
import { offlineScope } from '@/lib/offline/fetch'
function AccountRevalidation({children}: {children: ReactNode}) {
  const {mutate} = useSWRConfig()
  useEffect(() => {
    const refresh = (event: Event) => { void mutate((event as CustomEvent<(key: unknown) => boolean>).detail) }
    window.addEventListener('echims-revalidate', refresh)
    return () => window.removeEventListener('echims-revalidate', refresh)
  }, [mutate])
  return children
}
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [error, setError] = useState('')
  useEffect(() => {
    // Next client navigation needs RSC/server access. Offline links use documents
    // so the service worker can load the same page through the public shell.
    const navigate = (event: MouseEvent) => {
      if (navigator.onLine && window.location.pathname !== '/offline') return
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download || (anchor.target && anchor.target !== '_self')) return
      const url = new URL(anchor.href)
      if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) return
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return
      event.preventDefault()
      event.stopPropagation()
      window.location.assign(url.href)
    }
    const storageError = () => setError('This device could not save the latest view. Check available browser storage before going offline.')
    window.addEventListener('echims-offline-storage-error', storageError)
    document.addEventListener('click', navigate, true)
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/offline-worker', { scope: '/', updateViaCache: 'none' })
        .catch(() => setError('Offline page preparation failed. Retry while online.'))
    }
    return () => {
      window.removeEventListener('echims-offline-storage-error', storageError)
      document.removeEventListener('click', navigate, true)
    }
  }, [])
  const accountKey = user ? user.id + ':' + offlineScope(user) : 'signed-out'
  return <>{error && <div role="alert" className="bg-rose-50 p-2 text-sm text-rose-700">{error}</div>}
    <SWRConfig key={accountKey} value={{ provider: () => new Map() }}><AccountRevalidation><AutomaticPreparation/>{children}</AccountRevalidation></SWRConfig>
  </>
}
