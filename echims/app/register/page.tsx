'use client'

import Link from 'next/link'

import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
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
   LOCATION TYPES
========================================================= */

type BarangayOption = {
  barangay_id: number
  barangay_name: string
}

type RHUOption = {
  rhu_id: number
  rhu_name: string
  barangays: BarangayOption[]
}

type MunicipalityOption = {
  municipality_id: number
  municipality_name: string
  type: 'Municipality' | 'City'
  rhus: RHUOption[]
}

type ProvinceOption = {
  province_id: number
  province_name: string
  municipalities: MunicipalityOption[]
}

/* =========================================================
   LOCATION DATA

   Temporary frontend master data.
   Later this should come from Supabase.
========================================================= */

const locationOptions: ProvinceOption[] = [
  {
    province_id: 1,
    province_name: 'Camarines Norte',

    municipalities: [
      {
        municipality_id: 1,
        municipality_name: 'Daet',
        type: 'Municipality',

        rhus: [
          {
            rhu_id: 1,
            rhu_name: 'Daet RHU 1',

            barangays: [
              { barangay_id: 1, barangay_name: 'Barangay I' },
              { barangay_id: 2, barangay_name: 'Barangay II' },
              { barangay_id: 3, barangay_name: 'Barangay III' },
              { barangay_id: 4, barangay_name: 'Barangay IV' },
              { barangay_id: 5, barangay_name: 'Barangay V' },
              { barangay_id: 6, barangay_name: 'Barangay VI' },
              { barangay_id: 7, barangay_name: 'Barangay VII' },
              { barangay_id: 8, barangay_name: 'Barangay VIII' },
            ],
          },

          {
            rhu_id: 2,
            rhu_name: 'Daet RHU 2',

            barangays: [
              { barangay_id: 9, barangay_name: 'Alawihao' },
              { barangay_id: 10, barangay_name: 'Awitan' },
              { barangay_id: 11, barangay_name: 'Bagasbas' },
              { barangay_id: 12, barangay_name: 'Bibirao' },
              { barangay_id: 13, barangay_name: 'Borabod' },
              { barangay_id: 14, barangay_name: 'Calasgasan' },
              { barangay_id: 15, barangay_name: 'Camambugan' },
            ],
          },

          {
            rhu_id: 3,
            rhu_name: 'Daet RHU 3',

            barangays: [
              { barangay_id: 16, barangay_name: 'Cobangbang' },
              { barangay_id: 17, barangay_name: 'Dogongan' },
              { barangay_id: 18, barangay_name: 'Gahonon' },
              { barangay_id: 19, barangay_name: 'Gubat' },
              { barangay_id: 20, barangay_name: 'Lag-on' },
              { barangay_id: 21, barangay_name: 'Magang' },
              { barangay_id: 22, barangay_name: 'Mambalite' },
              { barangay_id: 23, barangay_name: 'Mancruz' },
              { barangay_id: 24, barangay_name: 'Pamorangon' },
            ],
          },
        ],
      },
    ],
  },
]

/* =========================================================
   ROLE OPTIONS
========================================================= */

const roleOptions: {
  value: UserRole
  description: string
}[] = [
  { value: 'Administrator', description: 'Manages RHU users, permissions, and system operations.' },
  { value: 'Public Health Nurse', description: 'Coordinates RHU programs and approves health activities.' },
  { value: 'Rural Health Midwife', description: 'Provides maternal and child health services across assigned barangays.' },
  { value: 'Barangay Health Worker', description: 'Supports household visits and community health records.' },
  { value: 'Barangay Nutrition Scholar', description: 'Supports nutrition monitoring and supplementation.' },
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

  province_id: string
  municipality_id: string
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

  province_id: '',
  municipality_id: '',
  rhu_id: '',

  barangay_id: '',
  barangay_ids: [],

  password: '',
  confirmPassword: '',

  acceptedTerms: false,
}

const STORAGE_KEY = 'echims-registration-form'

/* =========================================================
   PAGE
========================================================= */

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()

  const [form, setForm] = useState<RegistrationState>(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  /* =======================================================
     ROLE HELPERS
  ======================================================= */

  const isAdministrator = form.role === 'Administrator'
  const isPHN = form.role === 'Public Health Nurse'
  const isRHM = form.role === 'Rural Health Midwife'
  const isBarangayWorker =
    form.role === 'Barangay Health Worker' ||
    form.role === 'Barangay Nutrition Scholar'
  const requiresLicense = isPHN || isRHM

  /* =======================================================
     RESTORE FORM
  ======================================================= */

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved)
      setForm((current) => ({
        ...current,
        ...parsed,
        password: '',
        confirmPassword: '',
        barangay_ids: Array.isArray(parsed.barangay_ids) ? parsed.barangay_ids : [],
      }))
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  /* =======================================================
     SAVE FORM
  ======================================================= */

  useEffect(() => {
    const { password, confirmPassword, ...safeForm } = form
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeForm))
  }, [form])

  /* =======================================================
     LOCATION SELECTIONS
  ======================================================= */

  const selectedProvince = useMemo(
    () => locationOptions.find((province) => String(province.province_id) === form.province_id),
    [form.province_id],
  )

  const selectedMunicipality = useMemo(
    () =>
      selectedProvince?.municipalities.find(
        (municipality) => String(municipality.municipality_id) === form.municipality_id,
      ),
    [selectedProvince, form.municipality_id],
  )

  const selectedRhu = useMemo(
    () =>
      selectedMunicipality?.rhus.find((rhu) => String(rhu.rhu_id) === form.rhu_id),
    [selectedMunicipality, form.rhu_id],
  )

  /* =======================================================
     FORM HANDLERS
  ======================================================= */

  function updateField<K extends keyof RegistrationState>(field: K, value: RegistrationState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleRoleChange(role: UserRole) {
    setForm((current) => ({
      ...current,
      role,
      employeeId: role === 'Administrator' ? '' : current.employeeId,
      licenseNumber:
        role === 'Public Health Nurse' || role === 'Rural Health Midwife'
          ? current.licenseNumber
          : '',
      province_id: role === 'Administrator' ? '' : current.province_id,
      municipality_id: role === 'Administrator' ? '' : current.municipality_id,
      rhu_id: role === 'Administrator' ? '' : current.rhu_id,
      barangay_id: '',
      barangay_ids: [],
    }))
  }

  function handleProvinceChange(value: string) {
    setForm((current) => ({
      ...current,
      province_id: value,
      municipality_id: '',
      rhu_id: '',
      barangay_id: '',
      barangay_ids: [],
    }))
  }

  function handleMunicipalityChange(value: string) {
    setForm((current) => ({
      ...current,
      municipality_id: value,
      rhu_id: '',
      barangay_id: '',
      barangay_ids: [],
    }))
  }

  function handleRhuChange(value: string) {
    setForm((current) => ({
      ...current,
      rhu_id: value,
      barangay_id: '',
      barangay_ids: [],
    }))
  }

  function toggleRhmBarangay(barangayId: string) {
    setForm((current) => {
      const exists = current.barangay_ids.includes(barangayId)
      return {
        ...current,
        barangay_ids: exists
          ? current.barangay_ids.filter((id) => id !== barangayId)
          : [...current.barangay_ids, barangayId],
      }
    })
  }

  /* =======================================================
     VALIDATION
  ======================================================= */

  function validateForm() {
    if (!form.fullName.trim()) return 'Please enter your full name.'
    if (!form.username.trim()) return 'Please enter a username.'
    if (!form.contactNumber.trim()) return 'Please enter your contact number.'
    if (!form.email.trim()) return 'Please enter your email address.'
    if (!isAdministrator && !form.employeeId.trim()) return 'Please enter your employee ID.'
    if (requiresLicense && !form.licenseNumber.trim()) return 'Please enter your license number.'
    if (!isAdministrator) {
      if (!form.province_id) return 'Please select your province.'
      if (!form.municipality_id) return 'Please select your municipality or city.'
      if (!form.rhu_id) return 'Please select your RHU.'
      if (isRHM && form.barangay_ids.length === 0) return 'Please select at least one barangay.'
      if (isBarangayWorker && !form.barangay_id) return 'Please select your barangay.'
    }
    if (form.password.length < 8) return 'Password must contain at least 8 characters.'
    if (form.password !== form.confirmPassword) return 'Passwords do not match.'
    if (!form.acceptedTerms) return 'Please accept the Terms and Conditions.'
    return null
  }

  /* =======================================================
     SUBMIT
  ======================================================= */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)

    const result = await register({
      fullName: form.fullName.trim(),
      username: form.username.trim(),
      contactNumber: form.contactNumber.trim(),
      email: form.email.trim(),
      role: form.role,
      employeeId: isAdministrator ? undefined : form.employeeId.trim(),
      licenseNumber: requiresLicense ? form.licenseNumber.trim() : undefined,
      province_id: isAdministrator ? undefined : form.province_id,
      municipality_id: isAdministrator ? undefined : form.municipality_id,
      rhu_id: isAdministrator ? undefined : form.rhu_id,
      barangay_id: isBarangayWorker ? form.barangay_id : undefined,
      barangay_ids: isRHM ? form.barangay_ids : [],
      password: form.password,
    })

    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    sessionStorage.removeItem(STORAGE_KEY)

    if (result.needsEmailConfirmation) {
      setSuccess('Registration submitted. Please check your email and confirm your account.')
      return
    }

    router.push('/login')
  }

  /* =======================================================
     STYLES
  ======================================================= */

  const inputClass =
    'w-full rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-5 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]'

  const selectClass = `${inputClass} appearance-none pr-12`

  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#CAF0F8] p-4 sm:p-8">
      <div className="flex w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-xl lg:min-h-[800px]">
        <section className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#123C82] to-[#087DB9] p-14 text-white lg:flex">
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
          <div>
            <div className="flex justify-center gap-16 text-center">
              <div>
                <p className="text-4xl font-bold text-cyan-300">500+</p>
                <p className="mt-2 text-sm text-blue-100">Children Tracked</p>
              </div>
              <div className="border-l border-white/20 pl-16">
                <p className="text-4xl font-bold text-cyan-300">50+</p>
                <p className="mt-2 text-sm text-blue-100">Barangays</p>
              </div>
            </div>
            <div className="mt-12 border-t border-white/20 pt-8 text-center text-sm text-blue-100">
              <p>Bachelor of Science in Information Technology</p>
              <p className="mt-3">© 2025 Rural Health Units</p>
            </div>
          </div>
        </section>

        <section className="flex flex-1 flex-col lg:w-1/2 lg:max-h-[800px] lg:overflow-y-auto">
          <div className="px-7 py-10 sm:px-14">
            <div className="mx-auto w-full max-w-md">
              <h2 className="text-3xl font-bold text-[#03045E]">Create Account</h2>
              <p className="mt-2 text-sm text-gray-500">Register your eCHIMS account for verification.</p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(event) => updateField('fullName', event.target.value)}
                    className={inputClass}
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(event) => updateField('username', event.target.value)}
                    className={inputClass}
                    placeholder="Enter username"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Contact Number</label>
                  <input
                    type="tel"
                    value={form.contactNumber}
                    onChange={(event) => updateField('contactNumber', event.target.value)}
                    className={inputClass}
                    placeholder="09XXXXXXXXX"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    className={inputClass}
                    placeholder="name@example.com"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">User Role</label>
                  <div className="relative">
                    <select
                      value={form.role}
                      onChange={(event) => handleRoleChange(event.target.value as UserRole)}
                      className={selectClass}
                    >
                      {roleOptions.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.value}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {roleOptions.find((role) => role.value === form.role)?.description}
                  </p>
                </div>

                {!isAdministrator && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Employee ID</label>
                    <input
                      type="text"
                      value={form.employeeId}
                      onChange={(event) => updateField('employeeId', event.target.value)}
                      className={inputClass}
                      placeholder="Enter employee ID"
                    />
                  </div>
                )}

                {requiresLicense && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">License Number</label>
                    <input
                      type="text"
                      value={form.licenseNumber}
                      onChange={(event) => updateField('licenseNumber', event.target.value)}
                      className={inputClass}
                      placeholder="Enter license number"
                    />
                  </div>
                )}

                {!isAdministrator && (
                  <div className="space-y-5 border-t border-gray-100 pt-5">
                    <div>
                      <h3 className="font-semibold text-[#03045E]">Workplace Assignment</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Your workplace will be verified by an administrator.
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Province</label>
                      <div className="relative">
                        <select
                          value={form.province_id}
                          onChange={(event) => handleProvinceChange(event.target.value)}
                          className={selectClass}
                        >
                          <option value="">Select province</option>
                          {locationOptions.map((province) => (
                            <option key={province.province_id} value={province.province_id}>
                              {province.province_name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Municipality / City</label>
                      <div className="relative">
                        <select
                          value={form.municipality_id}
                          disabled={!selectedProvince}
                          onChange={(event) => handleMunicipalityChange(event.target.value)}
                          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <option value="">Select municipality or city</option>
                          {selectedProvince?.municipalities.map((municipality) => (
                            <option key={municipality.municipality_id} value={municipality.municipality_id}>
                              {municipality.municipality_name} ({municipality.type})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Rural Health Unit</label>
                      <div className="relative">
                        <select
                          value={form.rhu_id}
                          disabled={!selectedMunicipality}
                          onChange={(event) => handleRhuChange(event.target.value)}
                          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <option value="">Select RHU</option>
                          {selectedMunicipality?.rhus.map((rhu) => (
                            <option key={rhu.rhu_id} value={rhu.rhu_id}>
                              {rhu.rhu_name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>

                    {isRHM && selectedRhu && (
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Assigned Barangays</label>
                        <p className="mb-3 text-xs text-gray-500">
                          Select one or more barangays assigned to you.
                        </p>
                        <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                          {selectedRhu.barangays.map((barangay) => {
                            const id = String(barangay.barangay_id)
                            const selected = form.barangay_ids.includes(id)
                            return (
                              <button
                                key={barangay.barangay_id}
                                type="button"
                                onClick={() => toggleRhmBarangay(id)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white"
                              >
                                <span
                                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                                    selected
                                      ? 'border-[#0077B6] bg-[#0077B6] text-white'
                                      : 'border-gray-300 bg-white'
                                  }`}
                                >
                                  {selected && <Check className="h-3 w-3" />}
                                </span>
                                <span>{barangay.barangay_name}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {isBarangayWorker && (
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Barangay</label>
                        <div className="relative">
                          <select
                            value={form.barangay_id}
                            disabled={!selectedRhu}
                            onChange={(event) => updateField('barangay_id', event.target.value)}
                            className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <option value="">Select barangay</option>
                            {selectedRhu?.barangays.map((barangay) => (
                              <option key={barangay.barangay_id} value={barangay.barangay_id}>
                                {barangay.barangay_name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        </div>
                      </div>
                    )}

                    {isPHN && selectedRhu && (
                      <div className="rounded-2xl bg-blue-50 px-4 py-3 text-xs text-[#03045E]">
                        As a Public Health Nurse, your requested workplace is{' '}
                        <strong>{selectedRhu.rhu_name}</strong>. Barangay assignments are not required
                        during registration.
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(event) => updateField('password', event.target.value)}
                      className={`${inputClass} pr-12`}
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={(event) => updateField('confirmPassword', event.target.value)}
                      className={`${inputClass} pr-12`}
                      placeholder="Re-enter password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.acceptedTerms}
                    onChange={(event) => updateField('acceptedTerms', event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#0077B6]"
                  />
                  <span>
                    I agree to the{' '}
                    <Link href="/terms" className="font-medium text-[#0077B6] hover:underline">
                      Terms and Conditions
                    </Link>
                    .
                  </span>
                </label>

                {error && (
                  <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                )}

                {success && (
                  <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#0784BE] px-5 py-3.5 font-semibold text-white transition hover:bg-[#056d9e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-[#0077B6] hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}