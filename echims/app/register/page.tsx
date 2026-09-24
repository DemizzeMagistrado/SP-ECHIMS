'use client'

import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import type { UserRole } from '@/lib/echims-data'

const roleOptions: { value: UserRole; description: string }[] = [
  { value: 'Administrator', description: 'Manages RHU users, permissions, and system operations.' },
  { value: 'Public Health Nurse', description: 'Public health nurses coordinate approved RHU activities.' },
  { value: 'Barangay Health Worker', description: 'Supports household visits and community health records.' },
  { value: 'Rural Health Midwife', description: 'Coordinates maternal and child health services.' },
  { value: 'Barangay Nutrition Scholar', description: 'Supports nutrition monitoring and supplementation.' },
]

const initialForm = { fullName: '', username: '', contactNumber: '', email: '', role: 'Barangay Health Worker' as UserRole, employeeId: '', licenseNumber: '', password: '', confirmPassword: '' }

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [form, setForm] = useState(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })) }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    if (form.password !== form.confirmPassword) return setError('Password and Confirm Password must match.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Enter a valid email address.')
    if (!agreedToTerms) return setError('You must agree to the terms and conditions.')
    setIsSubmitting(true)
    const result = await register(form)
    setIsSubmitting(false)
    if (result.error) return setError(result.error)
    if (result.needsEmailConfirmation) {
      setSuccess('Registration submitted. Check your email to verify your account. Your selected role will be reviewed by an administrator.')
      setForm(initialForm)
      return
    }
    router.push('/dashboard')
  }

  const selectedRole = roleOptions.find((role) => role.value === form.role)
  const inputClass = 'mt-2 w-full rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 text-sm outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]'

  return <main className="flex min-h-screen items-center justify-center bg-[#CAF0F8] p-4 sm:p-8"><div className="flex w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-xl lg:min-h-[665px]">
    <section className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#123C82] to-[#087DB9] p-14 text-white lg:flex"><div><img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/echimes%20white%20and%20blue-gtjr6RbRtIsj4rnx93fDvsrSwRYq5X.png" alt="eCHIMS logo" width={430} height={120} className="h-auto w-full max-w-[430px]" /><h1 className="mt-14 text-center text-2xl font-bold leading-relaxed">Early Child Health Information and Monitoring System</h1><p className="mt-5 text-center text-base text-blue-100">Comprehensive healthcare management for Rural Health Units</p></div><div><div className="flex justify-center gap-16 text-center"><div><p className="text-4xl font-bold text-cyan-300">500+</p><p className="mt-2 text-sm text-blue-100">Children Tracked</p></div><div className="border-l border-white/20 pl-16"><p className="text-4xl font-bold text-cyan-300">50+</p><p className="mt-2 text-sm text-blue-100">Barangays</p></div></div><div className="mt-12 border-t border-white/20 pt-8 text-center text-sm text-blue-100"><p>Bachelor of Science in Information Technology</p><p className="mt-3">© 2025 Rural Health Units</p></div></div></section>
    <section className="flex flex-1 flex-col justify-center px-7 py-10 sm:px-14 lg:w-1/2"><div className="mx-auto w-full max-w-md"><h2 className="text-3xl font-bold text-[#03045E]">Create your account</h2><p className="mt-2 text-[#6B7280]">Register for the eCHIMS health network</p><form onSubmit={handleSubmit} className="mt-7 space-y-5">
      <div><p className="text-xs font-bold uppercase tracking-wide text-[#0077B6]">Personal Information</p><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-[#03045E] sm:col-span-2">Full Name<input className={inputClass} value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required /></label><label className="text-sm font-semibold text-[#03045E]">Username<input className={inputClass} value={form.username} onChange={(e) => update('username', e.target.value)} required /></label><label className="text-sm font-semibold text-[#03045E]">Contact Number<input className={inputClass} value={form.contactNumber} onChange={(e) => update('contactNumber', e.target.value)} required /></label><label className="text-sm font-semibold text-[#03045E] sm:col-span-2">Email Address<input className={inputClass} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required /></label></div></div>
      <div><label htmlFor="role" className="text-sm font-semibold text-[#03045E]">Account Role</label><select id="role" className={inputClass} value={form.role} onChange={(e) => update('role', e.target.value as UserRole)}>{roleOptions.map((role) => <option key={role.value}>{role.value}</option>)}</select><p className="mt-2 text-xs text-[#6B7280]">{selectedRole?.description}</p></div>
      <div><p className="text-xs font-bold uppercase tracking-wide text-[#0077B6]">Employment / Professional Information</p><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-[#03045E]">Employee ID<input className={inputClass} value={form.employeeId} onChange={(e) => update('employeeId', e.target.value)} /></label><label className="text-sm font-semibold text-[#03045E]">License Number<input className={inputClass} value={form.licenseNumber} onChange={(e) => update('licenseNumber', e.target.value)} /></label></div></div>
      <div><p className="text-xs font-bold uppercase tracking-wide text-[#0077B6]">Password</p><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-[#03045E]">Password<div className="relative"><input className={`${inputClass} pr-12`} type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => update('password', e.target.value)} required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><label className="text-sm font-semibold text-[#03045E]">Confirm Password<div className="relative"><input className={`${inputClass} pr-12`} type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} required /><button type="button" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280]">{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label></div></div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{success && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{success}</p>}<button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-[#0784BE] py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#056d9e] disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Submitting Registration...' : 'Submit Registration'}</button>
    </form><div className="my-7 flex items-center gap-3 text-xs uppercase text-[#9CA3AF]"><span className="h-px flex-1 bg-[#E5E7EB]" />Already Registered?<span className="h-px flex-1 bg-[#E5E7EB]" /></div><p className="text-center text-sm text-[#6B7280]">Already have an account? <Link href="/login" className="font-semibold text-[#0077B6] hover:underline">Sign in</Link></p><p className="mt-8 text-center text-xs text-[#9CA3AF]">By registering, you agree to our <Link href="/terms" className="text-[#0077B6]">Terms of Service</Link> and <Link href="/privacy" className="text-[#0077B6]">Privacy Policy</Link></p></div></section>
  </div></main>
}
