'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import type { UserRole } from '@/lib/echims-data'
import { createClient } from '@/lib/supabase/client'

export type AuthUser = {
  id: string
  fullName: string
  username: string
  email: string
  role: UserRole
  contactNumber: string
  employeeId: string
  licenseNumber: string
}

type AuthContextValue = {
  isAuthenticated: boolean
  isReady: boolean
  user: AuthUser | null
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
}

const DEFAULT_ROLE: UserRole = 'Barangay Health Worker'
const roles: UserRole[] = ['Administrator', 'Public Health Nurse', 'Barangay Health Worker', 'Rural Health Midwife', 'Barangay Nutrition Scholar']

function toAuthUser(user: User): AuthUser {
  const metadata = user.app_metadata ?? {}
  const userMetadata = user.user_metadata ?? {}
  const role = roles.includes(metadata.role as UserRole) ? metadata.role as UserRole : DEFAULT_ROLE
  return {
    id: user.id,
    fullName: userMetadata.full_name ?? user.email?.split('@')[0] ?? 'RHU User',
    username: userMetadata.username ?? user.email?.split('@')[0] ?? '',
    email: user.email ?? '',
    role,
    contactNumber: userMetadata.contact_number ?? '',
    employeeId: userMetadata.employee_id ?? '',
    licenseNumber: userMetadata.license_number ?? '',
  }
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isReady: false,
  user: null,
  login: async () => ({ error: 'Unable to sign in.' }),
  logout: async () => undefined,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      if (mounted) {
        setUser(data.user ? toAuthUser(data.user) : null)
        setIsReady(true)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (mounted) setUser(session?.user ? toAuthUser(session.user) : null)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated: Boolean(user),
    isReady,
    user,
    login: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        if (error.message.toLowerCase().includes('confirm')) return { error: 'Please confirm your email before signing in.' }
        return { error: 'Invalid email or password.' }
      }
      return {}
    },
    logout: async () => {
      await supabase.auth.signOut()
      setUser(null)
    },
  }), [isReady, supabase, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
