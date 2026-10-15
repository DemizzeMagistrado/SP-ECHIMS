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
  const [offline, setOffline] = useState(false)
  const [snapshot, setSnapshot] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const update = () => { setOffline(!navigator.onLine); if (navigator.onLine) setSnapshot('') }
    update()
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
    const saved = (event: Event) => setSnapshot(String((event as CustomEvent<string>).detail))
    const storageError = () => setError('This device could not save the latest view. Check available browser storage before going offline.')
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('echims-offline-snapshot', saved)
    window.addEventListener('echims-offline-storage-error', storageError)
    document.addEventListener('click', navigate, true)
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => setError('Offline page preparation failed. Retry while online.'))
    }
    return () => {
      window.removeEventListener('online', update); window.removeEventListener('offline', update)
      window.removeEventListener('echims-offline-snapshot', saved); window.removeEventListener('echims-offline-storage-error', storageError)
      document.removeEventListener('click', navigate, true)
    }
  }, [])
  const accountKey = user ? user.id + ':' + offlineScope(user) : 'signed-out'
  return <>{(offline || snapshot) && <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
    {offline ? 'Offline' : 'Connection interrupted'} — saved views may be out of date. Vaccination, nutrition, and supplementation entries use their draft queues. Other changes and actual SMS delivery require a connection.
    {snapshot && <> Saved view: {new Date(snapshot).toLocaleString('en-PH')}.</>}
  </div>}{error && <div role="alert" className="bg-rose-50 p-2 text-sm text-rose-700">{error}</div>}
    <SWRConfig key={accountKey} value={{ provider: () => new Map() }}><AccountRevalidation><AutomaticPreparation/>{children}</AccountRevalidation></SWRConfig>
  </>
}
