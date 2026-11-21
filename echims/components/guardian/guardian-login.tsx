'use client'

import { useState, type FormEvent } from 'react'
import { notifyGuardianSessionChanged } from '@/lib/guardian/session-event'
import { AuthShell } from '@/components/auth/auth-shell'
import { GuardianAuthInput, GuardianAuthSubmit, submitGuardianAuth } from './guardian-auth-form'

export function GuardianLogin({ registered = false }: { registered?: boolean }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      await submitGuardianAuth('login', { identifier, password })
      const session = await fetch('/api/guardian/context', {
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
      })
      if (session.status === 401) throw new Error('The browser did not keep your guardian session. Allow cookies for this site and try signing in again.')
      if (!session.ok) throw new Error('Unable to verify your guardian session. Try signing in again.')

      notifyGuardianSessionChanged()
      window.location.replace('/guardian')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Unable to sign in.')
      setBusy(false)
    }
  }

  return (
    <AuthShell audience="guardian">
      <div className="auth-stagger">
        <h2 className="font-display text-3xl font-bold tracking-tight">Welcome back</h2>
        <p className="mt-2 text-[#5B6478]">Sign in to your guardian account.</p>
        {registered && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">Mobile number verified. Sign in with the password you created.</p>}
      </div>
      <form onSubmit={signIn} className="auth-stagger mt-8 space-y-5">
        <GuardianAuthInput label="Full name or mobile number" autoComplete="username" maxLength={302} required value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="Enter your full name or mobile number" />
        <GuardianAuthInput label="Password" password autoComplete="current-password" maxLength={256} required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" />
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <GuardianAuthSubmit busy={busy} label={busy ? 'Signing in…' : 'Sign in'} />
      </form>
      <div className="auth-stagger mt-7 space-y-3 text-center text-sm text-[#5B6478]">
        <p>New to eCHIMS? <a href="/guardian/register" className="font-semibold text-[#087DB9] hover:underline">Create an account</a></p>
        <p><a href="/guardian/register?activate=1" className="font-semibold text-[#087DB9] hover:underline">Set a password for an existing OTP account</a></p>
        <p><a href="/login" className="font-semibold text-[#087DB9] hover:underline">Health worker sign-in</a></p>
      </div>
    </AuthShell>
  )
}
