'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')
    setLoading(true)

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      setError('Please enter your email address.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    )

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSubmitted(true)
    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#CAF0F8] p-4 sm:p-8">
      <div className="flex w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-xl lg:min-h-[665px]">

        {/* LEFT SIDE */}
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
                <p className="mt-2 text-sm text-blue-100">
                  Children Tracked
                </p>
              </div>

              <div className="border-l border-white/20 pl-16">
                <p className="text-4xl font-bold text-cyan-300">50+</p>
                <p className="mt-2 text-sm text-blue-100">
                  Barangays
                </p>
              </div>
            </div>

            <div className="mt-12 border-t border-white/20 pt-8 text-center text-sm text-blue-100">
              <p>Bachelor of Science in Information Technology</p>
              <p className="mt-3">© 2025 Rural Health Units</p>
            </div>
          </div>
        </section>

        {/* RIGHT SIDE */}
        <section className="flex flex-1 flex-col justify-center px-7 py-10 sm:px-14 lg:w-1/2">
          <div className="mx-auto w-full max-w-md">

            <Link
              href="/login"
              className="text-sm font-semibold text-[#0077B6] hover:underline"
            >
              ← Back to Sign In
            </Link>

            <h2 className="mt-8 text-3xl font-bold text-[#03045E]">
              Reset Your Password
            </h2>

            <p className="mt-2 text-[#6B7280]">
              Enter the email address linked to your RHU account and we&apos;ll
              send you a password reset link.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"
              >
                {error}
              </div>
            )}

            {submitted ? (
              <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-700">
                <p className="font-semibold">
                  Check your inbox
                </p>

                <p className="mt-2">
                  If an account exists for that email address, a password
                  reset link has been sent.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="mt-9 space-y-5"
              >
                <div>
                  <label
                    htmlFor="email"
                    className="text-sm font-semibold text-[#03045E]"
                  >
                    Email Address
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-4 py-3 outline-none focus:border-[#0077B6] focus:ring-2 focus:ring-[#CAF0F8]"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#0784BE] py-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#056d9e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <p className="mt-8 text-center text-sm text-[#6B7280]">
              Remember your password?{' '}
              <Link
                href="/login"
                className="font-semibold text-[#0077B6] hover:underline"
              >
                Sign in
              </Link>
            </p>

            <p className="mt-8 text-center text-xs text-[#9CA3AF]">
              By using eCHIMS, you agree to our{' '}
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
        </section>
      </div>
    </main>
  )
}