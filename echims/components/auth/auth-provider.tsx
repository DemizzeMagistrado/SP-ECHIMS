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

export type AuthUser = {
  id: string
  fullName: string
  username: string
  email: string
  role: UserRole
  contactNumber: string
  employeeId: string
  licenseNumber: string

  province: string
  municipality: string
  city: string

  rhu_id: string
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

  province: string
  municipality: string
  city: string

  rhu_id?: string
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
    password: string
  ) => Promise<{ error?: string }>

  register: (
    form: RegistrationForm
  ) => Promise<{
    error?: string
    needsEmailConfirmation?: boolean
  }>

  logout: () => Promise<void>
}

const DEFAULT_ROLE: UserRole =
  'Barangay Health Worker'

const roles: UserRole[] = [
  'Administrator',
  'Public Health Nurse',
  'Barangay Health Worker',
  'Rural Health Midwife',
  'Barangay Nutrition Scholar',
]

function toAuthUser(user: User): AuthUser {
  const metadata = user.user_metadata ?? {}

  const role = roles.includes(
    metadata.role as UserRole
  )
    ? (metadata.role as UserRole)
    : DEFAULT_ROLE

  const barangayIds = Array.isArray(
    metadata.barangay_ids
  )
    ? metadata.barangay_ids.map(String)
    : metadata.barangay_id
      ? [String(metadata.barangay_id)]
      : []

  return {
    id: user.id,

    fullName:
      metadata.full_name ??
      user.email?.split('@')[0] ??
      'RHU User',

    username:
      metadata.username ??
      user.email?.split('@')[0] ??
      '',

    email: user.email ?? '',

    role,

    contactNumber:
      metadata.contact_number ?? '',

    employeeId:
      metadata.employee_id ?? '',

    licenseNumber:
      metadata.license_number ?? '',

    province:
      metadata.province ?? '',

    municipality:
      metadata.municipality ?? '',

    city:
      metadata.city ?? '',

    rhu_id:
      metadata.rhu_id
        ? String(metadata.rhu_id)
        : '',

    barangay_id:
      metadata.barangay_id
        ? String(metadata.barangay_id)
        : '',

    barangay_ids: barangayIds,
  }
}

const AuthContext =
  createContext<AuthContextValue>({
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

export function AuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] =
    useState<AuthUser | null>(null)

  const [isReady, setIsReady] =
    useState(false)

  const supabase = createClient()

  useEffect(() => {
  let mounted = true

  const loadUser = async () => {
    const result =
      await supabase.auth.getUser()

    if (!mounted) return

    const authUser =
      result.data?.user ?? null

    setUser(
      authUser
        ? toAuthUser(authUser)
        : null
    )

    setIsReady(true)
  }

  loadUser()

  const {
    data: listener,
  } =
    supabase.auth.onAuthStateChange(
      (
        _event: AuthChangeEvent,
        session: Session | null
      ) => {
        if (!mounted) return

        setUser(
          session?.user
            ? toAuthUser(session.user)
            : null
        )
      }
    )

  return () => {
    mounted = false
    listener.subscription.unsubscribe()
  }
}, [supabase])

  const value =
    useMemo<AuthContextValue>(
      () => ({
        isAuthenticated:
          Boolean(user),

        isReady,

        user,

        login: async (
          email,
          password
        ) => {
          const {
            error,
          } =
            await supabase.auth.signInWithPassword(
              {
                email: email
                  .trim()
                  .toLowerCase(),

                password,
              }
            )

          if (error) {
            if (
              error.message
                .toLowerCase()
                .includes('confirm')
            ) {
              return {
                error:
                  'Please confirm your email before signing in.',
              }
            }

            return {
              error:
                'Invalid email or password.',
            }
          }

          return {}
        },

        register: async (form) => {
          try {
            /*
             * Normalize workplace data according
             * to the selected role.
             */

            let rhuId: string | null =
              form.rhu_id?.trim() || null

            let barangayId: string | null =
              null

            let barangayIds: string[] = []

            if (
              form.role ===
              'Rural Health Midwife'
            ) {
              barangayIds =
                form.barangay_ids ?? []

              barangayIds =
                barangayIds
                  .map((id) => id.trim())
                  .filter(Boolean)

              /*
               * Keep barangay_id empty for RHM
               * because RHM can have multiple.
               */
              barangayId = null
            }

            if (
              form.role ===
                'Barangay Health Worker' ||
              form.role ===
                'Barangay Nutrition Scholar'
            ) {
              barangayId =
                form.barangay_id?.trim() ||
                null

              barangayIds =
                barangayId
                  ? [barangayId]
                  : []
            }

            /*
             * PHN selects RHU only.
             */
            if (
              form.role ===
              'Public Health Nurse'
            ) {
              barangayId = null
              barangayIds = []
            }

            /*
             * Administrator has no workplace.
             */
            if (
              form.role ===
              'Administrator'
            ) {
              rhuId = null
              barangayId = null
              barangayIds = []
            }

            const metadata = {
              full_name:
                form.fullName.trim(),

              username:
                form.username.trim(),

              contact_number:
                form.contactNumber.trim(),

              requested_role:
                form.role,

              role:
                form.role,

              employee_id:
                form.role ===
                  'Administrator'
                  ? null
                  : form.employeeId?.trim() ||
                    null,

              license_number:
                form.role ===
                  'Administrator'
                  ? null
                  : form.licenseNumber?.trim() ||
                    null,

              province:
                form.province.trim(),

              municipality:
                form.municipality.trim(),

              city:
                form.city.trim(),

              rhu_id: rhuId,

              barangay_id:
                barangayId,

              barangay_ids:
                barangayIds,
            }

            const {
              data,
              error,
            } =
              await supabase.auth.signUp({
                email: form.email
                  .trim()
                  .toLowerCase(),

                password:
                  form.password,

                options: {
                  emailRedirectTo:
                    `${window.location.origin}/auth/callback?next=/login`,

                  data: metadata,
                },
              })

            if (error) {
              return {
                error: error.message,
              }
            }

            return {
              needsEmailConfirmation:
                !data.session,
            }
          } catch (error) {
            console.error(
              'REGISTRATION ERROR:',
              error
            )

            return {
              error:
                'Unable to complete registration. Check your connection and try again.',
            }
          }
        },

        logout: async () => {
          await supabase.auth.signOut()
          setUser(null)
        },
      }),
      [isReady, supabase, user]
    )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}