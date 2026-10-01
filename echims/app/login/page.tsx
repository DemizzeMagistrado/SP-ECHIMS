'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth/auth-provider'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const result = await login(email, password)
    if (result.error) {
      setError(result.error)
      return
    }
    router.push('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#CAF0F8] p-4 sm:p-8">
      <div className="flex w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-xl lg:min-h-[665px]">
        <section className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#123C82] to-[#087DB9] p-14 text-white lg:flex">
          <div>
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/echimes%20white%20and%20blue-gtjr6RbRtIsj4rnx93fDvsrSwRYq5X.png" alt="eCHIMS logo" width={430} height={120} className="h-auto w-full max-w-[430px]" />
            <h1 className="mt-14 text-center text-2xl font-bold leading-relaxed">Early Child Health Information and Monitoring System</h1>
            <p className="mt-5 text-center text-base text-blue-100">Comprehensive healthcare management for Rural Health Units</p>
          </div>
          <div>
            <div className="flex justify-center gap-16 text-center">
              <div><p className="text-4xl font-bold text-cyan-300">500+</p><p className="mt-2 text-sm text-blue-100">Children Tracked</p></div>
              <div className="border-l border-white/20 pl-16"><p className="text-4xl font-bold text-cyan-300">50+</p><p className="mt-2 text-sm text-blue-100">Barangays</p></div>
            </div>
            <div className="mt-12 border-t border-white/20 pt-8 text-center text-sm text-blue-100">
              <p>Bachelor of Science in Information Technology</p>
              <p className="mt-3">© 2025 Rural Health Units</p>
            </div>
          </div>
        </section>

        <section className="flex flex-1 flex-col justify-center px-7 py-10 sm:px-14 lg:w-1/2">
          <div className="mx-auto w-full max-w-md">
            <h2 className="text-3xl font-bold text-[#03045E]">Welcome Back</h2>
            <p className="mt-2 text-[#6B7280]">Sign in to your RHU account</p>
            <form onSubmit={handleSubmit} className="mt-9 space-y-5">
              <div>
                <label htmlFor="email" className="text-sm font-semibold text-[#03045E]">Username or Email</label>
                <input id="email" type="text" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]" placeholder="you@example.com" required />
              </div>
              <div>
                <label htmlFor="password" className="text-sm font-semibold text-[#03045E]">Password</label>
                <div className="relative mt-2">
                  <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 pr-12 outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]" placeholder="Enter your password" required />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7280]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm"><label className="flex items-center gap-2 text-[#6B7280]"><input type="checkbox" className="h-4 w-4 accent-[#0077B6]" />Remember me</label><Link href="forgot-password/" className="font-semibold text-[#0077B6] hover:underline">Forgot Password?</Link></div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <button type="submit" className="w-full rounded-full bg-[#0784BE] py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#056d9e]">Sign In</button>
            </form>
            <div className="my-7 flex items-center gap-3 text-xs uppercase text-[#9CA3AF]"><span className="h-px flex-1 bg-[#E5E7EB]" />New User?<span className="h-px flex-1 bg-[#E5E7EB]" /></div>
            <p className="text-center text-sm text-[#6B7280]">Need an account? <Link href="/register" className="font-semibold text-[#0077B6] hover:underline">Register here</Link></p>
            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-[#0077B6]"><p className="font-semibold">Demo Credentials</p><p className="mt-2">Email: <strong>demo@rhu.gov.ph</strong></p><p>Password: <strong>Demo@123</strong></p></div>
            <p className="mt-8 text-center text-xs text-[#9CA3AF]">By signing in, you agree to our <Link href="/terms" className="text-[#0077B6]">Terms of Service</Link> and <Link href="/privacy" className="text-[#0077B6]">Privacy Policy</Link></p>
          </div>
        </section>
      </div>
    </main>
  )
}
