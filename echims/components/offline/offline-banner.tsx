'use client'

import { useEffect, useRef, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { toast } from '@/components/ui/toast'

/**
 * Slim notice under the top bar while offline. Coming back online shows "Back online"; the queue
 * drains (vaccination, nutrition, inventory usage) report through reportSync(), and results that
 * arrive within a few seconds of each other become one "Synced N records" or error toast.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const totals = useRef({ sent: 0, failed: 0 })
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setOffline(!navigator.onLine)
    const goOffline = () => setOffline(true)
    const goOnline = () => { setOffline(false); toast.success('Back online') }
    const synced = (event: Event) => {
      const { sent, failed } = (event as CustomEvent<{ sent: number; failed: number }>).detail
      totals.current.sent += sent
      totals.current.failed += failed
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        const t = totals.current
        totals.current = { sent: 0, failed: 0 }
        if (t.failed > 0) toast.error(`${t.failed} record${t.failed === 1 ? '' : 's'} could not sync. They stay saved on this device and will retry.`)
        if (t.sent > 0) toast.success(`Synced ${t.sent} record${t.sent === 1 ? '' : 's'}`)
      }, 1500)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    window.addEventListener('echims-synced', synced)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('echims-synced', synced)
      window.clearTimeout(timer.current)
    }
  }, [])

  if (!offline) return null
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-warn/15 bg-warn-soft px-4 py-1.5 text-center text-xs font-medium text-warn sm:text-sm print:hidden">
      <WifiOff size={14} aria-hidden="true" className="shrink-0" />
      You&rsquo;re offline. Changes will sync when you&rsquo;re back online.
    </div>
  )
}
