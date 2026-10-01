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
    password: string
  ) => Promise<{
    error?: string
  }>

  register: (
    form: RegistrationForm
  ) => Promise<{
    error?: string
    needsEmailConfirmation?: boolean
  }>

  logout: () => Promise<void>
}

/* =========================================================
   ROLE CONFIGURATION
========================================================= */

const DEFAULT_ROLE: UserRole =
  'Barangay Health Worker'

const roles: UserRole[] = [
  'Administrator',
  'Public Health Nurse',
  'Rural Health Midwife',
  'Barangay Health Worker',
  'Barangay Nutrition Scholar',
]

/* =========================================================
   CONVERT SUPABASE USER
========================================================= */

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

    province_id:
      metadata.province_id
        ? String(metadata.province_id)
        : '',

    municipality_id:
      metadata.municipality_id
        ? String(metadata.municipality_id)
        : '',

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

/* =========================================================
   AUTH CONTEXT
========================================================= */

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

/* =========================================================
   AUTH PROVIDER
========================================================= */

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

  /* =======================================================
     LOAD AUTH USER
  ======================================================= */

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

  /* =======================================================
     AUTH FUNCTIONS
  ======================================================= */

  const value =
    useMemo<AuthContextValue>(
      () => ({
        isAuthenticated:
          Boolean(user),

        isReady,

        user,

        /* =================================================
           LOGIN
        ================================================= */

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

        /* =================================================
           REGISTER
        ================================================= */

        register: async (form) => {
          try {
            /* ---------------------------------------------
               Normalize workplace data
            --------------------------------------------- */

            let provinceId:
              string | null =
              form.province_id?.trim() ||
              null

            let municipalityId:
              string | null =
              form.municipality_id?.trim() ||
              null

            let rhuId:
              string | null =
              form.rhu_id?.trim() ||
              null

            let barangayId:
              string | null =
              null

            let barangayIds:
              string[] = []

            /* ---------------------------------------------
               RHM
               One RHU + multiple barangays
            --------------------------------------------- */

            if (
              form.role ===
              'Rural Health Midwife'
            ) {
              barangayIds =
                (form.barangay_ids ?? [])
                  .map((id) => id.trim())
                  .filter(Boolean)

              barangayId = null
            }

            /* ---------------------------------------------
               BHW / BNS
               One RHU + one barangay
            --------------------------------------------- */

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

            /* ---------------------------------------------
               PHN
               One RHU
            --------------------------------------------- */

            if (
              form.role ===
              'Public Health Nurse'
            ) {
              barangayId = null
              barangayIds = []
            }

            /* ---------------------------------------------
               ADMIN
               No workplace
            --------------------------------------------- */

            if (
              form.role ===
              'Administrator'
            ) {
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
                  'Public Health Nurse' ||
                form.role ===
                  'Rural Health Midwife'
                  ? form.licenseNumber?.trim() ||
                    null
                  : null,

              province_id:
                provinceId,

              municipality_id:
                municipalityId,

              rhu_id:
                rhuId,

              barangay_id:
                barangayId,

              barangay_ids:
                barangayIds,
            }

            /* ---------------------------------------------
               CREATE SUPABASE AUTH ACCOUNT
            --------------------------------------------- */

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

        /* =================================================
           LOGOUT
        ================================================= */

        logout: async () => {
          await supabase.auth.signOut()
          setUser(null)
        },
      }),

      [isReady, supabase, user]
    )

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  )
}

/* =========================================================
   USE AUTH
========================================================= */

export function useAuth() {
  return useContext(AuthContext)
}