'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { LoadingGate } from '@/components/brand/loading-gate'
import { createClient } from '@/lib/supabase/client'

/**
 * Dashboard content renders only for a resolved, signed-in user. While auth is resolving, while
 * signing out, or once the session is gone (expiry, sign-out in another tab) it shows the loader,
 * so role guards never flash "not authorized" for a user who simply is not there. Without a session
 * it sends the user to /login. A signed-in user whose profile failed to load still reaches the pages,
 * whose own messages then apply.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const { user, isReady, signingOut } = useAuth()
  const router = useRouter()
  const missing = isReady && !user && !signingOut
  const [sessionWithoutUser, setSessionWithoutUser] = useState(false)

  useEffect(() => {
    if (!missing) { setSessionWithoutUser(false); return }
    // Offline the device lock and the offline shell decide access; nothing to check here.
    if (!navigator.onLine) { setSessionWithoutUser(true); return }
    let live = true
    void createClient().auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (!live) return
      if (data.session) setSessionWithoutUser(true)
      else router.replace('/login')
    })
    return () => { live = false }
  }, [missing, router])

  const ready = isReady && !signingOut && Boolean(user || sessionWithoutUser)
  return <LoadingGate ready={ready} keepMounted={false}>{children}</LoadingGate>
}
