'use client'

import Link from 'next/link'
import {
  Eye,
  EyeOff,
  ChevronDown,
  Check,
} from 'lucide-react'
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'

import { useAuth } from '@/components/auth/auth-provider'
import type { UserRole } from '@/lib/echims-data'

/* =========================================================
   TYPES
========================================================= */

type Barangay = {
  barangay_id: number
  barangay_name: string
}

type WorkplaceOption = {
  rhu_id: number
  rhu_name: string
  province: string
  municipality: string
  city: string
  barangays: Barangay[]
}

/* =========================================================
   WORKPLACE DATA
========================================================= */

const workplaceOptions: WorkplaceOption[] = [
  {
    rhu_id: 2,
    rhu_name: 'RHU 1',
    province: 'Camarines Norte',
    municipality: 'Daet',
    city: '',
    barangays: [
      {
        barangay_id: 6,
        barangay_name: 'Barangay II',
      },
      {
        barangay_id: 8,
        barangay_name: 'Calasgasan',
      },
      {
        barangay_id: 9,
        barangay_name: 'Camambugan',
      },
      {
        barangay_id: 10,
        barangay_name: 'Alawihao',
      },
      {
        barangay_id: 11,
        barangay_name: 'Dogongan',
      },
      {
        barangay_id: 12,
        barangay_name: 'Bibirao',
      },
      {
        barangay_id: 13,
        barangay_name: 'Pamorangon',
      },
      {
        barangay_id: 14,
        barangay_name: 'Magang',
      },
      {
        barangay_id: 15,
        barangay_name: 'Mancruz',
      },
    ],
  },

  {
    rhu_id: 4,
    rhu_name: 'RHU 2',
    province: 'Camarines Norte',
    municipality: 'Daet',
    city: '',
    barangays: [
      {
        barangay_id: 16,
        barangay_name: 'Barangay VI',
      },
      {
        barangay_id: 17,
        barangay_name: 'Barangay I',
      },
      {
        barangay_id: 18,
        barangay_name: 'Barangay VIII',
      },
      {
        barangay_id: 19,
        barangay_name: 'Barangay VII',
      },
      {
        barangay_id: 20,
        barangay_name: 'Gubat',
      },
      {
        barangay_id: 21,
        barangay_name: 'San Isidro',
      },
      {
        barangay_id: 22,
        barangay_name: 'Mambalite',
      },
      {
        barangay_id: 23,
        barangay_name: 'Bagasbas',
      },
      {
        barangay_id: 24,
        barangay_name: 'Cobangbang',
      },
    ],
  },

  {
    rhu_id: 5,
    rhu_name: 'RHU 3',
    province: 'Camarines Norte',
    municipality: 'Daet',
    city: '',
    barangays: [
      {
        barangay_id: 25,
        barangay_name: 'Awitan',
      },
      {
        barangay_id: 26,
        barangay_name: 'Borabod',
      },
      {
        barangay_id: 27,
        barangay_name: 'Lag-On',
      },
      {
        barangay_id: 28,
        barangay_name: 'Barangay V',
      },
      {
        barangay_id: 29,
        barangay_name: 'Barangay IV',
      },
      {
        barangay_id: 30,
        barangay_name: 'Barangay III',
      },
      {
        barangay_id: 31,
        barangay_name: 'Gahonon',
      },
    ],
  },
]

/* =========================================================
   ROLES
========================================================= */

const roles: UserRole[] = [
  'Administrator',
  'Public Health Nurse',
  'Rural Health Midwife',
  'Barangay Health Worker',
  'Barangay Nutrition Scholar',
]

/* =========================================================
   FORM STATE
========================================================= */

type RegistrationState = {
  fullName: string
  username: string
  contactNumber: string
  email: string

  role: UserRole

  employeeId: string
  licenseNumber: string

  province: string
  municipality: string
  city: string

  rhu_id: string

  barangay_id: string
  barangay_ids: string[]

  password: string
  confirmPassword: string

  acceptedTerms: boolean
}

const initialForm: RegistrationState = {
  fullName: '',
  username: '',
  contactNumber: '',
  email: '',

  role: 'Barangay Health Worker',

  employeeId: '',
  licenseNumber: '',

  province: '',
  municipality: '',
  city: '',

  rhu_id: '',

  barangay_id: '',
  barangay_ids: [],

  password: '',
  confirmPassword: '',

  acceptedTerms: false,
}

const STORAGE_KEY = 'echims-registration-form'

/* =========================================================
   REGISTER PAGE
========================================================= */

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()

  const [form, setForm] =
    useState<RegistrationState>(initialForm)

  const [showPassword, setShowPassword] =
    useState(false)

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false)

  const [showRoleMenu, setShowRoleMenu] =
    useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [emailConfirmation, setEmailConfirmation] =
    useState(false)

  /* =======================================================
     EMAIL CONFIRMATION MESSAGE
  ======================================================= */

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    )

    setEmailConfirmation(
      params.get('success') === 'email'
    )
  }, [])

  /* =======================================================
     RESTORE FORM
  ======================================================= */

  useEffect(() => {
    try {
      const saved =
        sessionStorage.getItem(STORAGE_KEY)

      if (!saved) return

      const parsed = JSON.parse(saved)

      setForm({
        ...initialForm,
        ...parsed,
        barangay_ids:
          parsed.barangay_ids ?? [],
      })
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  /* =======================================================
     SAVE FORM
  ======================================================= */

  useEffect(() => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(form)
    )
  }, [form])

  /* =======================================================
     ROLE HELPERS
  ======================================================= */

  const isAdministrator =
    form.role === 'Administrator'

  const isPHN =
    form.role === 'Public Health Nurse'

  const isRHM =
    form.role === 'Rural Health Midwife'

  const isBarangayWorker =
    form.role === 'Barangay Health Worker' ||
    form.role === 'Barangay Nutrition Scholar'

  /* =======================================================
     SELECTED RHU
  ======================================================= */

  const selectedRhu = useMemo(
    () =>
      workplaceOptions.find(
        (rhu) =>
          String(rhu.rhu_id) === form.rhu_id
      ),
    [form.rhu_id]
  )

  /* =======================================================
     UPDATE FIELD
  ======================================================= */

  function update(
    field: keyof RegistrationState,
    value: string | boolean | string[]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  /* =======================================================
     ROLE CHANGE
  ======================================================= */

  function handleRoleChange(role: UserRole) {
    setForm((current) => ({
      ...current,
      role,

      employeeId: '',
      licenseNumber: '',

      province: '',
      municipality: '',
      city: '',

      rhu_id: '',

      barangay_id: '',
      barangay_ids: [],
    }))

    setShowRoleMenu(false)
  }

  /* =======================================================
     RHU CHANGE
  ======================================================= */

  function handleRhuChange(value: string) {
    const rhu = workplaceOptions.find(
      (item) =>
        String(item.rhu_id) === value
    )

    setForm((current) => ({
      ...current,

      rhu_id: value,

      province: rhu?.province ?? '',
      municipality: rhu?.municipality ?? '',
      city: rhu?.city ?? '',

      barangay_id: '',
      barangay_ids: [],
    }))
  }

  /* =======================================================
     RHM BARANGAY SELECTION
  ======================================================= */

  function toggleBarangay(
    barangayId: string
  ) {
    setForm((current) => {
      const exists =
        current.barangay_ids.includes(
          barangayId
        )

      return {
        ...current,

        barangay_ids: exists
          ? current.barangay_ids.filter(
              (id) => id !== barangayId
            )
          : [
              ...current.barangay_ids,
              barangayId,
            ],
      }
    })
  }

  /* =======================================================
     VALIDATION
  ======================================================= */

  function validate() {
    if (!form.fullName.trim()) {
      return 'Full name is required.'
    }

    if (!form.username.trim()) {
      return 'Username is required.'
    }

    if (!form.contactNumber.trim()) {
      return 'Contact number is required.'
    }

    if (!form.email.trim()) {
      return 'Email is required.'
    }

    if (!form.password) {
      return 'Password is required.'
    }

    if (form.password !== form.confirmPassword) {
      return 'Passwords do not match.'
    }

    if (!form.acceptedTerms) {
      return 'You must accept the Terms and Conditions and Privacy Policy.'
    }

    /* Administrator does not need workplace */
    if (isAdministrator) {
      return null
    }

    if (!form.rhu_id) {
      return 'Please select your RHU.'
    }

    /* PHN selects RHU only */
    if (isPHN) {
      return null
    }

    /* RHM can select multiple barangays */
    if (isRHM) {
      if (form.barangay_ids.length === 0) {
        return 'Please select at least one barangay.'
      }

      return null
    }

    /* BHW / BNS select one barangay */
    if (isBarangayWorker) {
      if (!form.barangay_id) {
        return 'Please select your assigned barangay.'
      }
    }

    return null
  }

  /* =======================================================
     SUBMIT
  ======================================================= */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')

    const validationError = validate()

    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)

    const result = await register({
      fullName: form.fullName,
      username: form.username,
      contactNumber: form.contactNumber,
      email: form.email,
      role: form.role,

      employeeId: isAdministrator
        ? undefined
        : form.employeeId,

      licenseNumber: isAdministrator
        ? undefined
        : form.licenseNumber,

      province: form.province,
      municipality: form.municipality,
      city: form.city,

      rhu_id: isAdministrator
        ? undefined
        : form.rhu_id,

      barangay_id: isBarangayWorker
        ? form.barangay_id
        : undefined,

      barangay_ids: isRHM
        ? form.barangay_ids
        : [],

      password: form.password,
    })

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    sessionStorage.removeItem(
      STORAGE_KEY
    )

    if (result.needsEmailConfirmation) {
      router.push(
        '/register?success=email'
      )
      return
    }

    router.push('/login')
  }

  /* =========================================================
     SHARED LOGIN STYLES
  ========================================================= */

  const inputClass =
    'mt-2 w-full rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 text-sm outline-none transition focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]'

  const labelClass =
    'text-sm font-semibold text-[#03045E]'

  /* =========================================================
     PAGE
  ========================================================= */

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#CAF0F8] p-4 sm:p-8">

      {/* =====================================================
          MAIN CARD
          SAME DESIGN AS LOGIN
          BUT TALLER FOR REGISTRATION
      ===================================================== */}

      <div className="flex w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-xl lg:min-h-[800px]">

        {/* ===================================================
            LEFT BRANDING PANEL
            SAME AS LOGIN
        =================================================== */}

        <section className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#123C82] to-[#087DB9] p-14 text-white lg:flex">

          {/* TOP CONTENT */}

          <div>

            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/echimes%20white%20and%20blue-gtjr6RbRtIsj4rnx93fDvsrSwRYq5X.png"
              alt="eCHIMS logo"
              width={430}
              height={120}
              className="h-auto w-full max-w-[430px]"
            />

            <h1 className="mt-14 text-center text-2xl font-bold leading-relaxed">
              Early Child Health Information and Monitoring System
            </h1>

            <p className="mt-5 text-center text-base text-blue-100">
              Comprehensive healthcare management for Rural Health Units
            </p>

          </div>

          {/* BOTTOM CONTENT */}

          <div>

            <div className="flex justify-center gap-16 text-center">

              <div>
                <p className="text-4xl font-bold text-cyan-300">
                  500+
                </p>

                <p className="mt-2 text-sm text-blue-100">
                  Children Tracked
                </p>
              </div>

              <div className="border-l border-white/20 pl-16">

                <p className="text-4xl font-bold text-cyan-300">
                  50+
                </p>

                <p className="mt-2 text-sm text-blue-100">
                  Barangays
                </p>

              </div>

            </div>

            <div className="mt-12 border-t border-white/20 pt-8 text-center text-sm text-blue-100">

              <p>
                Bachelor of Science in Information Technology
              </p>

              <p className="mt-3">
                © 2025 Rural Health Units
              </p>

            </div>

          </div>

        </section>

        {/* ===================================================
            RIGHT REGISTRATION PANEL
            ONLY THIS SIDE SCROLLS
        =================================================== */}

        <section className="flex flex-1 flex-col lg:w-1/2 lg:max-h-[800px] lg:overflow-y-auto">

          <div className="flex flex-col px-7 py-10 sm:px-14">

            <div className="mx-auto w-full max-w-md">

              {/* =================================================
                  HEADER
              ================================================= */}

              <h2 className="text-3xl font-bold text-[#03045E]">
                Create Account
              </h2>

              <p className="mt-2 text-[#6B7280]">
                Register for your RHU account
              </p>

              {/* =================================================
                  EMAIL CONFIRMATION
              ================================================= */}

              {emailConfirmation && (
                <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-[#0077B6]">

                  <p className="font-semibold">
                    Registration submitted
                  </p>

                  <p className="mt-1 leading-5">
                    Please check your email and confirm
                    your account before signing in.
                    Your account will also require
                    administrator approval.
                  </p>

                </div>
              )}

              {/* =================================================
                  FORM
              ================================================= */}

              <form
                onSubmit={handleSubmit}
                className="mt-8 space-y-7"
              >

                {/* =================================================
                    PERSONAL INFORMATION
                ================================================= */}

                <section>

                  <h3 className="mb-4 text-base font-bold text-[#03045E]">
                    Personal Information
                  </h3>

                  <div className="space-y-4">

                    {/* FULL NAME */}

                    <div>

                      <label
                        htmlFor="fullName"
                        className={labelClass}
                      >
                        Full Name
                      </label>

                      <input
                        id="fullName"
                        type="text"
                        value={form.fullName}
                        onChange={(event) =>
                          update(
                            'fullName',
                            event.target.value
                          )
                        }
                        className={inputClass}
                        placeholder="Enter your full name"
                        required
                      />

                    </div>

                    {/* USERNAME */}

                    <div>

                      <label
                        htmlFor="username"
                        className={labelClass}
                      >
                        Username
                      </label>

                      <input
                        id="username"
                        type="text"
                        value={form.username}
                        onChange={(event) =>
                          update(
                            'username',
                            event.target.value
                          )
                        }
                        className={inputClass}
                        placeholder="Enter username"
                        required
                      />

                    </div>

                    {/* CONTACT NUMBER */}

                    <div>

                      <label
                        htmlFor="contactNumber"
                        className={labelClass}
                      >
                        Contact Number
                      </label>

                      <input
                        id="contactNumber"
                        type="tel"
                        value={form.contactNumber}
                        onChange={(event) =>
                          update(
                            'contactNumber',
                            event.target.value
                          )
                        }
                        className={inputClass}
                        placeholder="09XXXXXXXXX"
                        required
                      />

                    </div>

                    {/* EMAIL */}

                    <div>

                      <label
                        htmlFor="email"
                        className={labelClass}
                      >
                        Email Address
                      </label>

                      <input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          update(
                            'email',
                            event.target.value
                          )
                        }
                        className={inputClass}
                        placeholder="you@example.com"
                        required
                      />

                    </div>

                  </div>

                </section>

                {/* =================================================
                    ACCOUNT ROLE
                ================================================= */}

                <section>

                  <label
                    htmlFor="role"
                    className={labelClass}
                  >
                    Account Role
                  </label>

                  <div className="relative mt-2">

                    <button
                      type="button"
                      onClick={() =>
                        setShowRoleMenu(
                          (visible) => !visible
                        )
                      }
                      className="flex w-full items-center justify-between rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 text-left text-sm outline-none transition focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]"
                    >

                      <span className="text-[#374151]">
                        {form.role}
                      </span>

                      <ChevronDown
                        size={18}
                        className="text-[#6B7280]"
                      />

                    </button>

                    {showRoleMenu && (
                      <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-lg">

                        {roles.map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() =>
                              handleRoleChange(role)
                            }
                            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-[#374151] transition hover:bg-[#CAF0F8]"
                          >

                            <span>
                              {role}
                            </span>

                            {form.role === role && (
                              <Check
                                size={17}
                                className="text-[#0077B6]"
                              />
                            )}

                          </button>
                        ))}

                      </div>
                    )}

                  </div>

                </section>

                {/* =================================================
                    ASSIGNED WORKPLACE
                ================================================= */}

                {!isAdministrator && (
                  <section>

                    <h3 className="text-base font-bold text-[#03045E]">
                      Assigned Workplace
                    </h3>

                    <p className="mt-1 mb-4 text-xs leading-5 text-[#6B7280]">
                      Select your workplace. This information
                      will be verified and approved by an
                      administrator.
                    </p>

                    {/* PROVINCE */}

                    <div className="mb-4">

                      <label
                        className={labelClass}
                      >
                        Province
                      </label>

                      <input
                        type="text"
                        value={form.province}
                        readOnly
                        className={`${inputClass} cursor-not-allowed bg-[#E5E7EB]`}
                        placeholder="Select RHU first"
                      />

                    </div>

                    {/* MUNICIPALITY */}

                    <div className="mb-4">

                      <label
                        className={labelClass}
                      >
                        Municipality
                      </label>

                      <input
                        type="text"
                        value={form.municipality}
                        readOnly
                        className={`${inputClass} cursor-not-allowed bg-[#E5E7EB]`}
                        placeholder="Select RHU first"
                      />

                    </div>

                    {/* CITY */}

                    <div className="mb-4">

                      <label
                        className={labelClass}
                      >
                        City
                      </label>

                      <input
                        type="text"
                        value={
                          form.city ||
                          'Not applicable'
                        }
                        readOnly
                        className={`${inputClass} cursor-not-allowed bg-[#E5E7EB]`}
                      />

                    </div>

                    {/* RHU */}

                    <div>

                      <label
                        htmlFor="rhu"
                        className={labelClass}
                      >
                        Rural Health Unit
                      </label>

                      <select
                        id="rhu"
                        value={form.rhu_id}
                        onChange={(event) =>
                          handleRhuChange(
                            event.target.value
                          )
                        }
                        className={inputClass}
                        required
                      >

                        <option value="">
                          Select RHU
                        </option>

                        {workplaceOptions.map(
                          (rhu) => (
                            <option
                              key={rhu.rhu_id}
                              value={rhu.rhu_id}
                            >
                              {rhu.rhu_name}
                            </option>
                          )
                        )}

                      </select>

                    </div>

                    {/* =================================================
                        RHM — MULTIPLE BARANGAYS
                    ================================================= */}

                    {isRHM && (
                      <div className="mt-4">

                        <label
                          className={labelClass}
                        >
                          Assigned Barangays
                        </label>

                        <p className="mt-1 text-xs text-[#6B7280]">
                          Select all barangays assigned
                          to you.
                        </p>

                        <div className="mt-2 max-h-52 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-[#F3F4F6] p-2">

                          {!selectedRhu ? (
                            <p className="p-3 text-sm text-[#9CA3AF]">
                              Select RHU first.
                            </p>
                          ) : (
                            selectedRhu.barangays.map(
                              (barangay) => {
                                const id =
                                  String(
                                    barangay.barangay_id
                                  )

                                const selected =
                                  form.barangay_ids.includes(
                                    id
                                  )

                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() =>
                                      toggleBarangay(
                                        id
                                      )
                                    }
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                                      selected
                                        ? 'bg-[#CAF0F8] text-[#03045E]'
                                        : 'text-[#374151] hover:bg-white'
                                    }`}
                                  >

                                    <span
                                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                        selected
                                          ? 'border-[#0077B6] bg-[#0077B6] text-white'
                                          : 'border-[#D1D5DB] bg-white'
                                      }`}
                                    >
                                      {selected && (
                                        <Check
                                          size={13}
                                        />
                                      )}
                                    </span>

                                    {
                                      barangay.barangay_name
                                    }

                                  </button>
                                )
                              }
                            )
                          )}

                        </div>

                      </div>
                    )}

                    {/* =================================================
                        BHW / BNS — ONE BARANGAY
                    ================================================= */}

                    {isBarangayWorker && (
                      <div className="mt-4">

                        <label
                          htmlFor="barangay"
                          className={labelClass}
                        >
                          Assigned Barangay
                        </label>

                        <select
                          id="barangay"
                          value={form.barangay_id}
                          onChange={(event) =>
                            update(
                              'barangay_id',
                              event.target.value
                            )
                          }
                          disabled={!selectedRhu}
                          className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#E5E7EB]`}
                          required
                        >

                          <option value="">
                            {selectedRhu
                              ? 'Select barangay'
                              : 'Select RHU first'}
                          </option>

                          {selectedRhu?.barangays.map(
                            (barangay) => (
                              <option
                                key={
                                  barangay.barangay_id
                                }
                                value={
                                  barangay.barangay_id
                                }
                              >
                                {
                                  barangay.barangay_name
                                }
                              </option>
                            )
                          )}

                        </select>

                      </div>
                    )}

                    {/* =================================================
                        PHN
                    ================================================= */}

                    {isPHN && (
                      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-[#0077B6]">

                        Public Health Nurses are assigned
                        to an RHU and do not select an
                        individual barangay during
                        registration.

                      </div>
                    )}

                  </section>
                )}

                {/* =================================================
                    EMPLOYMENT / PROFESSIONAL INFORMATION
                ================================================= */}

                {!isAdministrator && (
                  <section>

                    <h3 className="mb-4 text-base font-bold text-[#03045E]">
                      Employment / Professional Information
                    </h3>

                    <div className="space-y-4">

                      {/* EMPLOYEE ID */}

                      <div>

                        <label
                          htmlFor="employeeId"
                          className={labelClass}
                        >
                          Employee ID
                        </label>

                        <input
                          id="employeeId"
                          type="text"
                          value={form.employeeId}
                          onChange={(event) =>
                            update(
                              'employeeId',
                              event.target.value
                            )
                          }
                          className={inputClass}
                          placeholder="Enter employee ID"
                        />

                      </div>

                      {/* LICENSE NUMBER */}

                      <div>

                        <label
                          htmlFor="licenseNumber"
                          className={labelClass}
                        >
                          License Number
                        </label>

                        <input
                          id="licenseNumber"
                          type="text"
                          value={form.licenseNumber}
                          onChange={(event) =>
                            update(
                              'licenseNumber',
                              event.target.value
                            )
                          }
                          className={inputClass}
                          placeholder="Enter license number"
                        />

                      </div>

                    </div>

                  </section>
                )}

                {/* =================================================
                    ADMINISTRATOR INFORMATION
                ================================================= */}

                {isAdministrator && (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-[#0077B6]">

                    <p className="font-semibold">
                      Administrator Account
                    </p>

                    <p className="mt-1 text-xs leading-5">
                      Administrator accounts do not
                      require an RHU, barangay, Employee
                      ID, or License Number.
                    </p>

                  </div>
                )}

                {/* =================================================
                    ACCOUNT SECURITY
                ================================================= */}

                <section>

                  <h3 className="mb-4 text-base font-bold text-[#03045E]">
                    Account Security
                  </h3>

                  <div className="space-y-4">

                    {/* PASSWORD */}

                    <div>

                      <label
                        htmlFor="password"
                        className={labelClass}
                      >
                        Password
                      </label>

                      <div className="relative mt-2">

                        <input
                          id="password"
                          type={
                            showPassword
                              ? 'text'
                              : 'password'
                          }
                          value={form.password}
                          onChange={(event) =>
                            update(
                              'password',
                              event.target.value
                            )
                          }
                          className="w-full rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 pr-12 text-sm outline-none transition focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]"
                          placeholder="Create your password"
                          required
                        />

                        <button
                          type="button"
                          aria-label={
                            showPassword
                              ? 'Hide password'
                              : 'Show password'
                          }
                          onClick={() =>
                            setShowPassword(
                              (visible) =>
                                !visible
                            )
                          }
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] transition hover:text-[#0077B6]"
                        >
                          {showPassword ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>

                      </div>

                    </div>

                    {/* CONFIRM PASSWORD */}

                    <div>

                      <label
                        htmlFor="confirmPassword"
                        className={labelClass}
                      >
                        Confirm Password
                      </label>

                      <div className="relative mt-2">

                        <input
                          id="confirmPassword"
                          type={
                            showConfirmPassword
                              ? 'text'
                              : 'password'
                          }
                          value={
                            form.confirmPassword
                          }
                          onChange={(event) =>
                            update(
                              'confirmPassword',
                              event.target.value
                            )
                          }
                          className="w-full rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 pr-12 text-sm outline-none transition focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]"
                          placeholder="Confirm your password"
                          required
                        />

                        <button
                          type="button"
                          aria-label={
                            showConfirmPassword
                              ? 'Hide password'
                              : 'Show password'
                          }
                          onClick={() =>
                            setShowConfirmPassword(
                              (visible) =>
                                !visible
                            )
                          }
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280] transition hover:text-[#0077B6]"
                        >
                          {showConfirmPassword ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>

                      </div>

                    </div>

                  </div>

                </section>

                {/* =================================================
                    TERMS AND CONDITIONS
                ================================================= */}

                <label className="flex items-start gap-2 text-sm text-[#6B7280]">

                  <input
                    type="checkbox"
                    checked={
                      form.acceptedTerms
                    }
                    onChange={(event) =>
                      update(
                        'acceptedTerms',
                        event.target.checked
                      )
                    }
                    className="mt-1 h-4 w-4 accent-[#0077B6]"
                  />

                  <span className="leading-5">

                    I agree to our{' '}

                    <Link
                      href="/terms"
                      className="font-semibold text-[#0077B6] hover:underline"
                    >
                      Terms of Service
                    </Link>{' '}

                    and{' '}

                    <Link
                      href="/privacy"
                      className="font-semibold text-[#0077B6] hover:underline"
                    >
                      Privacy Policy
                    </Link>

                  </span>

                </label>

                {/* =================================================
                    ERROR
                ================================================= */}

                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-600"
                  >
                    {error}
                  </div>
                )}

                {/* =================================================
                    SUBMIT BUTTON
                ================================================= */}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#0784BE] py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#056d9e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? 'Creating Account...'
                    : 'Create Account'}
                </button>

              </form>

              {/* =================================================
                  LOGIN DIVIDER
              ================================================= */}

              <div className="my-7 flex items-center gap-3 text-xs uppercase text-[#9CA3AF]">

                <span className="h-px flex-1 bg-[#E5E7EB]" />

                <span>
                  Already Registered?
                </span>

                <span className="h-px flex-1 bg-[#E5E7EB]" />

              </div>

              {/* =================================================
                  LOGIN LINK
              ================================================= */}

              <p className="text-center text-sm text-[#6B7280]">

                Already have an account?{' '}

                <Link
                  href="/login"
                  className="font-semibold text-[#0077B6] hover:underline"
                >
                  Sign In
                </Link>

              </p>

              {/* =================================================
                  FOOTER
              ================================================= */}

              <p className="mt-8 pb-8 text-center text-xs leading-5 text-[#9CA3AF]">

                By registering, you agree to our{' '}

                <Link
                  href="/terms"
                  className="text-[#0077B6] hover:underline"
                >
                  Terms of Service
                </Link>{' '}

                and{' '}

                <Link
                  href="/privacy"
                  className="text-[#0077B6] hover:underline"
                >
                  Privacy Policy
                </Link>

              </p>

            </div>

          </div>

        </section>

      </div>

    </main>
  )
}