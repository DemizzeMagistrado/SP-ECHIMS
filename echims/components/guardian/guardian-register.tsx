'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Field, Select } from '@/components/ui/form'
import { guardianPhone, guardianRelationships } from '@/lib/guardian/registration'
import { GuardianAddress } from './guardian-address'
import { GuardianAuthInput, GuardianAuthSubmit, submitGuardianAuth } from './guardian-auth-form'

const empty = { first_name: '', middle_name: '', last_name: '', address: '', relationship_to_child: '' }

export function GuardianRegister({ activation }: { activation: boolean }) {
  const [details, setDetails] = useState(empty)
  const [phone, setPhone] = useState('')
  const [sentPhone, setSentPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const updateAddress = useCallback((address: string) => {
    setDetails(current => current.address === address ? current : { ...current, address })
  }, [])

  useEffect(() => {
    if (!cooldown) return
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function send(resending = false) {
    if (busy || (resending && cooldown)) return
    const number = sentPhone || guardianPhone(phone)
    if (!number) { setError('Enter a valid Philippine mobile number.'); return }
    if (!resending) {
      if (!activation && !details.address) { setError('Complete all the address fields.'); return }
      if (password.length < 8 || password !== confirmPassword) {
        setError(password.length < 8 ? 'Use at least 8 characters for your password.' : 'Passwords do not match.')
        return
      }
    }
    setBusy(true)
    setError('')
    try {
      await submitGuardianAuth('register', activation
        ? { action: 'activate', phone: number }
        : resending
          ? { action: 'resend', phone: number }
          : { action: 'start', phone: number, password, details, acceptedTerms })
      setSentPhone(number)
      setCooldown(60)
      setCode('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Unable to send a verification code.')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sentPhone) { await send(); return }
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await submitGuardianAuth('register', { action: 'verify', phone: sentPhone, code, activation, ...(activation ? { password } : {}) })
      window.location.replace('/guardian/login?registered=1')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Unable to verify your mobile number.')
      setBusy(false)
    }
  }

  return (
    <AuthShell audience="guardian" scrollable>
      <div className="auth-stagger">
        <h2 className="font-display text-3xl font-bold tracking-tight">{sentPhone ? 'Verify your mobile number' : activation ? 'Set up your guardian password' : 'Create an account'}</h2>
        <p className="mt-2 text-[#5B6478]">{sentPhone ? `Enter the code sent to the number ending in ${sentPhone.slice(-4)}.` : 'Register to view your linked child’s health information.'}</p>
      </div>
      <form onSubmit={submit} className="auth-stagger mt-8 space-y-5">
        {!sentPhone && <>
          {!activation && <>
            <GuardianAuthInput label="First Name" autoComplete="given-name" required maxLength={100} value={details.first_name} onChange={event => setDetails({ ...details, first_name: event.target.value })} />
            <GuardianAuthInput label="Middle Name (Optional)" autoComplete="additional-name" maxLength={100} value={details.middle_name} onChange={event => setDetails({ ...details, middle_name: event.target.value })} />
            <GuardianAuthInput label="Last Name" autoComplete="family-name" required maxLength={100} value={details.last_name} onChange={event => setDetails({ ...details, last_name: event.target.value })} />
          </>}
          <GuardianAuthInput label="Mobile Number" type="tel" autoComplete="tel" required maxLength={24} value={phone} onChange={event => setPhone(event.target.value)} placeholder="09171234567" hint="Use the mobile number recorded at your BHS or RHU." />
          {!activation && <>
            <GuardianAddress onChange={updateAddress} />
            <Field label="Relationship to Child" required><Select value={details.relationship_to_child} onChange={event => setDetails({ ...details, relationship_to_child: event.target.value })}><option value="">Select relationship</option>{guardianRelationships.map(relationship => <option key={relationship} value={relationship}>{relationship}</option>)}</Select></Field>
          </>}
          <GuardianAuthInput label="Password" password autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" />
          <GuardianAuthInput label="Confirm Password" password autoComplete="new-password" required minLength={8} maxLength={72} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Re-enter password" />
          {!activation && <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600">
            <input type="checkbox" required checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} className="mt-1 h-4 w-4 accent-[#0077B6]" />
            <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-[#0077B6] hover:underline">Terms and Conditions</a> and have read the <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-[#0077B6] hover:underline">Privacy Notice</a>.</span>
          </label>}
        </>}
        {sentPhone && <GuardianAuthInput label="SMS Verification Code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} />}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <GuardianAuthSubmit busy={busy} label={busy ? 'Please wait…' : sentPhone ? 'Verify mobile number' : activation ? 'Send verification code' : 'Create account'} />
        {sentPhone && <button type="button" disabled={busy || cooldown > 0} onClick={() => void send(true)} className="text-sm font-semibold text-[#087DB9] enabled:hover:underline disabled:opacity-60">Resend code{cooldown > 0 && ` (${cooldown}s)`}</button>}
      </form>
      <p className="mt-6 text-center text-sm text-[#5B6478]">Already have an account? <a href="/guardian/login" className="font-semibold text-[#087DB9] hover:underline">Sign in</a></p>
    </AuthShell>
  )
}
