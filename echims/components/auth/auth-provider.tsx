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
  requestedRole: UserRole | null
  accountStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'UNKNOWN'
  contactNumber: string
  employeeId: string
  licenseNumber: string
}

export type RegistrationInput = {
  fullName: string
  username: string
  contactNumber: string
  email: string
  role: UserRole
  employeeId: string
  licenseNumber: string
  password: string
}

type AuthContextValue = {
  isAuthenticated: boolean
  isReady: boolean
  user: AuthUser | null
  login: (email: string, password: string) => Promise<{ error?: string }>
  register: (input: RegistrationInput) => Promise<{ error?: string; needsEmailConfirmation?: boolean }>
  logout: () => Promise<void>
}

const DEFAULT_ROLE: UserRole = 'Barangay Health Worker'
const roles: UserRole[] = ['Administrator', 'Public Health Nurse', 'Barangay Health Worker', 'Rural Health Midwife', 'Barangay Nutrition Scholar']
const roleAliases: Record<string, UserRole> = {
  admin: 'Administrator', administrator: 'Administrator',
  phn: 'Public Health Nurse', 'public health nurse': 'Public Health Nurse',
  bhw: 'Barangay Health Worker', 'barangay health worker': 'Barangay Health Worker',
  rhm: 'Rural Health Midwife', midwife: 'Rural Health Midwife', 'rural health midwife': 'Rural Health Midwife',
  bns: 'Barangay Nutrition Scholar', 'barangay nutrition scholar': 'Barangay Nutrition Scholar',
}

function resolveTrustedRole(value: unknown): UserRole {
  const normalized = String(value ?? '').trim().toLowerCase()
  return roleAliases[normalized] ?? DEFAULT_ROLE
}

type ProfileRow = {
  user_id: string
  full_name: string | null
  username: string | null
  email: string | null
  contact_number: string | null
  account_status: string | null
  role: string | null
  employee_id: string | null
  license_number: string | null
}

// role/account_status come from public.get_my_profile(), which reads the trusted
// administrator/health_worker/* tables server-side (RLS + SECURITY DEFINER), not from
// client-editable JWT metadata.
function toAuthUser(user: User, profile: ProfileRow | null): AuthUser {
  const userMetadata = user.user_metadata ?? {}
  const requestedRole = roles.includes(userMetadata.requested_role as UserRole) ? userMetadata.requested_role as UserRole : null
  const role = resolveTrustedRole(profile?.role)
  const accountStatus = profile?.account_status === 'PENDING' ? 'PENDING_APPROVAL' : profile?.account_status === 'ACTIVE' ? 'APPROVED' : 'UNKNOWN'
  return {
    id: user.id,
    fullName: profile?.full_name ?? userMetadata.full_name ?? user.email?.split('@')[0] ?? 'RHU User',
    username: profile?.username ?? userMetadata.username ?? user.email?.split('@')[0] ?? '',
    email: profile?.email ?? user.email ?? '',
    role,
    requestedRole,
    accountStatus,
    contactNumber: profile?.contact_number ?? userMetadata.contact_number ?? '',
    employeeId: profile?.employee_id ?? userMetadata.employee_id ?? '',
    licenseNumber: profile?.license_number ?? userMetadata.license_number ?? '',
  }
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isReady: false,
  user: null,
  login: async () => ({ error: 'Unable to sign in.' }),
  register: async () => ({ error: 'Unable to register.' }),
  logout: async () => undefined,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let mounted = true

    async function loadUser(authUser: User | null) {
      if (!authUser) {
        if (mounted) setUser(null)
        return
      }
      const { data: profile } = await supabase.rpc('get_my_profile').maybeSingle() as { data: ProfileRow | null }
      if (mounted) setUser(toAuthUser(authUser, profile))
    }

    supabase.auth.getUser().then(async ({ data }: { data: { user: User | null } }) => {
      await loadUser(data.user)
      if (mounted) setIsReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      loadUser(session?.user ?? null)
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
    register: async (input) => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
          data: {
            full_name: input.fullName.trim(),
            username: input.username.trim(),
            contact_number: input.contactNumber.trim(),
            employee_id: input.employeeId.trim(),
            license_number: input.licenseNumber.trim(),
            requested_role: input.role,
            account_status: 'PENDING_APPROVAL',
          },
        },
      })
      if (error) {
        const message = error.message.toLowerCase()
        const code = error.code?.toLowerCase() ?? ''
        if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already') || message.includes('registered') || message.includes('duplicate') || message.includes('user already exists')) return { error: 'An account with this email already exists. Try signing in instead.' }
        if (code === 'email_address_invalid' || message.includes('invalid email')) return { error: 'Enter a valid email address.' }
        if (code === 'weak_password' || message.includes('password')) return { error: 'Choose a stronger password with at least 8 characters, including a number and symbol.' }
        if (code === 'signup_disabled' || message.includes('signup is disabled')) return { error: 'Registration is currently unavailable. Please contact your administrator.' }
        if (code === 'over_email_send_rate_limit' || message.includes('rate limit')) return { error: 'Too many registration attempts. Please wait a while and try again.' }
        if (code === 'email_provider_disabled' || message.includes('email provider')) return { error: 'Email registration is not enabled. Please contact your administrator.' }
        return { error: 'We could not create your account. Please check your details and try again.' }
      }
      if (data.user && data.user.identities?.length === 0) return { error: 'An account with this email already exists. Try signing in instead.' }
      return { needsEmailConfirmation: !data.session }
    },
    logout: async () => {
      await supabase.auth.signOut()
      setUser(null)
    },
  }), [isReady, supabase, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }