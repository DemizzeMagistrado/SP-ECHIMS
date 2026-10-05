'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import type {
  AuthChangeEvent,
  Session,
  User,
} from '@supabase/supabase-js'

import type { UserRole } from '@/lib/echims-data'
import { createClient } from '@/lib/supabase/client'

/* =========================================================
   TYPES
========================================================= */

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

  province_id?: string
  municipality_id?: string
  rhu_id?: string

  barangay_id: string
  barangay_ids: string[]
}

export type RegistrationForm = {
  fullName: string
  username: string
  contactNumber: string
  email: string
  role: UserRole

  employeeId?: string
  licenseNumber?: string

  /*
   * Geographic / workplace IDs
   */
  province_id?: string
  municipality_id?: string
  rhu_id?: string

  /*
   * BHW / BNS = one barangay
   * RHM = multiple barangays
   */
  barangay_id?: string
  barangay_ids?: string[]

  password: string
}

type AuthContextValue = {
  isAuthenticated: boolean
  isReady: boolean
  user: AuthUser | null

  login: (
    email: string,
    password: string,
  ) => Promise<{ error?: string }>

  register: (
    form: RegistrationForm,
  ) => Promise<{
    error?: string
    needsEmailConfirmation?: boolean
  }>

  logout: () => Promise<void>
}

/* =========================================================
   ROLE CONFIGURATION
========================================================= */

const DEFAULT_ROLE: UserRole = 'Barangay Health Worker'

const roles: UserRole[] = [
  'Administrator',
  'Public Health Nurse',
  'Rural Health Midwife',
  'Barangay Health Worker',
  'Barangay Nutrition Scholar',
]

const roleAliases: Record<string, UserRole> = {
  admin: 'Administrator',
  administrator: 'Administrator',
  phn: 'Public Health Nurse',
  'public health nurse': 'Public Health Nurse',
  bhw: 'Barangay Health Worker',
  'barangay health worker': 'Barangay Health Worker',
  rhm: 'Rural Health Midwife',
  midwife: 'Rural Health Midwife',
  'rural health midwife': 'Rural Health Midwife',
  bns: 'Barangay Nutrition Scholar',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar',
}

function resolveTrustedRole(value: unknown): UserRole | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return roleAliases[normalized] ?? null
}

/* =========================================================
   PROFILE ROW (from get_my_profile RPC)

   role/account_status come from public.get_my_profile(),
   which reads the trusted administrator/health_worker/* tables
   server-side (RLS + SECURITY DEFINER), not from client-editable
   JWT metadata.
========================================================= */

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

/* =========================================================
   CONVERT SUPABASE USER
========================================================= */

function toAuthUser(user: User, profile: ProfileRow | null): AuthUser {
  const metadata = user.user_metadata ?? {}

  // Trusted role from the server-side profile when available.
  // Falls back to the registration-time metadata.role for brand-new users
  // whose profile row hasn't been seeded yet.
  const trustedRole = resolveTrustedRole(profile?.role)
  const metadataRole = roles.includes(metadata.role as UserRole)
    ? (metadata.role as UserRole)
    : null
  const role = trustedRole ?? metadataRole ?? DEFAULT_ROLE

  const requestedRole = roles.includes(metadata.requested_role as UserRole)
    ? (metadata.requested_role as UserRole)
    : metadataRole

  const accountStatus =
    profile?.account_status === 'PENDING'
      ? 'PENDING_APPROVAL'
      : profile?.account_status === 'ACTIVE'
        ? 'APPROVED'
        : 'UNKNOWN'

  const barangayIds = Array.isArray(metadata.barangay_ids)
    ? metadata.barangay_ids.map(String)
    : metadata.barangay_id
      ? [String(metadata.barangay_id)]
      : []

  return {
    id: user.id,
    fullName:
      profile?.full_name ??
      metadata.full_name ??
      user.email?.split('@')[0] ??
      'RHU User',
    username:
      profile?.username ??
      metadata.username ??
      user.email?.split('@')[0] ??
      '',
    email: profile?.email ?? user.email ?? '',
    role,
    requestedRole,
    accountStatus,
    contactNumber: profile?.contact_number ?? metadata.contact_number ?? '',
    employeeId: profile?.employee_id ?? metadata.employee_id ?? '',
    licenseNumber: profile?.license_number ?? metadata.license_number ?? '',
    province_id: metadata.province_id ? String(metadata.province_id) : '',
    municipality_id: metadata.municipality_id
      ? String(metadata.municipality_id)
      : '',
    rhu_id: metadata.rhu_id ? String(metadata.rhu_id) : '',
    barangay_id: metadata.barangay_id ? String(metadata.barangay_id) : '',
    barangay_ids: barangayIds,
  }
}

/* =========================================================
   AUTH CONTEXT
========================================================= */

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isReady: false,
  user: null,

  login: async () => ({
    error: 'Unable to sign in.',
  }),

  register: async () => ({
    error: 'Unable to register.',
  }),

  logout: async () => undefined,
})

/* =========================================================
   AUTH PROVIDER
========================================================= */

export function AuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)
  const supabase = createClient()

  /* =======================================================
     LOAD AUTH USER
  ======================================================= */

  useEffect(() => {
    let mounted = true

    async function loadUser(authUser: User | null) {
      if (!authUser) {
        if (mounted) setUser(null)
        return
      }
      // Fetch the trusted profile (role + account_status) via SECURITY DEFINER
      // RPC so the UI matches what the server-side authorization sees.
      const { data: profile } = (await supabase
        .rpc('get_my_profile')
        .maybeSingle()) as { data: ProfileRow | null }
      if (mounted) setUser(toAuthUser(authUser, profile))
    }

    supabase.auth
      .getUser()
      .then(async ({ data }: { data: { user: User | null } }) => {
        await loadUser(data.user)
        if (mounted) setIsReady(true)
      })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        loadUser(session?.user ?? null)
      },
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  /* =======================================================
     AUTH FUNCTIONS
  ======================================================= */

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(user),
      isReady,
      user,

      /* =================================================
         LOGIN
      ================================================= */

      login: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })

        if (error) {
          if (error.message.toLowerCase().includes('confirm')) {
            return {
              error: 'Please confirm your email before signing in.',
            }
          }

          return {
            error: 'Invalid email or password.',
          }
        }

        return {}
      },

      /* =================================================
         REGISTER
      ================================================= */

      register: async (form) => {
        try {
          /* ---------------------------------------------
             Normalize workplace data
          --------------------------------------------- */

          let provinceId: string | null = form.province_id?.trim() || null
          let municipalityId: string | null =
            form.municipality_id?.trim() || null
          let rhuId: string | null = form.rhu_id?.trim() || null
          let barangayId: string | null = null
          let barangayIds: string[] = []

          /* ---------------------------------------------
             RHM — One RHU + multiple barangays
          --------------------------------------------- */

          if (form.role === 'Rural Health Midwife') {
            barangayIds = (form.barangay_ids ?? [])
              .map((id) => id.trim())
              .filter(Boolean)
            barangayId = null
          }

          /* ---------------------------------------------
             BHW / BNS — One RHU + one barangay
          --------------------------------------------- */

          if (
            form.role === 'Barangay Health Worker' ||
            form.role === 'Barangay Nutrition Scholar'
          ) {
            barangayId = form.barangay_id?.trim() || null
            barangayIds = barangayId ? [barangayId] : []
          }

          /* ---------------------------------------------
             PHN — One RHU
          --------------------------------------------- */

          if (form.role === 'Public Health Nurse') {
            barangayId = null
            barangayIds = []
          }

          /* ---------------------------------------------
             ADMIN — No workplace
          --------------------------------------------- */

          if (form.role === 'Administrator') {
            provinceId = null
            municipalityId = null
            rhuId = null
            barangayId = null
            barangayIds = []
          }

          /* ---------------------------------------------
             SUPABASE AUTH METADATA
          --------------------------------------------- */

          const metadata = {
            full_name: form.fullName.trim(),
            username: form.username.trim(),
            contact_number: form.contactNumber.trim(),
            requested_role: form.role,
            role: form.role,
            employee_id:
              form.role === 'Administrator'
                ? null
                : form.employeeId?.trim() || null,
            license_number:
              form.role === 'Public Health Nurse' ||
              form.role === 'Rural Health Midwife'
                ? form.licenseNumber?.trim() || null
                : null,
            province_id: provinceId,
            municipality_id: municipalityId,
            rhu_id: rhuId,
            barangay_id: barangayId,
            barangay_ids: barangayIds,
          }

          /* ---------------------------------------------
             CREATE SUPABASE AUTH ACCOUNT
          --------------------------------------------- */

          const { data, error } = await supabase.auth.signUp({
            email: form.email.trim().toLowerCase(),
            password: form.password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback?next=/login`,
              data: metadata,
            },
          })

          if (error) {
            return { error: error.message }
          }

          return { needsEmailConfirmation: !data.session }
        } catch (error) {
          console.error('REGISTRATION ERROR:', error)
          return {
            error:
              'Unable to complete registration. Check your connection and try again.',
          }
        }
      },

      /* =================================================
         LOGOUT
      ================================================= */

      logout: async () => {
        await supabase.auth.signOut()
        setUser(null)
      },
    }),

    [isReady, supabase, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/* =========================================================
   USE AUTH
========================================================= */

export function useAuth() {
  return useContext(AuthContext)
}