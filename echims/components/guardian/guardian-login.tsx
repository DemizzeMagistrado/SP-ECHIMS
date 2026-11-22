'use client'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { GuardianAddress } from '@/components/guardian/guardian-address'
import { guardianRelationships } from '@/lib/guardian/registration'
import { createClient } from '@/lib/supabase/client'

const empty = { first_name: '', middle_name: '', last_name: '', address: '', relationship_to_child: '' }
function phoneOf(value: string) {
  const digits = value.replace(/[^0-9]/g, '')
  if (/^09\d{9}$/.test(digits)) return '+63' + digits.slice(1)
  return /^639\d{9}$/.test(digits) ? '+' + digits : null
}
export function GuardianLogin({ initialRegister = false }: { initialRegister?: boolean }) {
  const router = useRouter()
  const [registering, setRegistering] = useState(initialRegister)
  const [form, setForm] = useState(empty)
  const updateAddress = useCallback((address: string) => setForm(current => current.address === address ? current : { ...current, address }), [])
  const [phone, setPhone] = useState('')
  const [sentPhone, setSentPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [online, setOnline] = useState(true)
  const [existing, setExisting] = useState(false)
  useEffect(() => {
    const connection = () => setOnline(navigator.onLine)
    connection(); window.addEventListener('online', connection); window.addEventListener('offline', connection)
    let active = true
    void createClient().auth.getUser().then(({ data }: { data: { user: User | null } }) => { if (active) setExisting(Boolean(data.user)) })
    return () => { active = false; window.removeEventListener('online', connection); window.removeEventListener('offline', connection) }
  }, [])
  useEffect(() => {
    if (!cooldown) return
    const timer = window.setTimeout(() => setCooldown(v => Math.max(0, v - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])
  async function send(event?: FormEvent) {
    event?.preventDefault()
    if (busy || cooldown || !online) return
    if (registering && (!form.address || form.address.length > 500 || !guardianRelationships.some(value => value === form.relationship_to_child))) { setError('Complete the address dropdowns, street/purok details, and relationship before requesting a code.'); return }
    const normalized = sentPhone || phoneOf(phone)
    if (!normalized) { setError('Enter a valid Philippine mobile number, such as 09171234567.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: problem } = await createClient().auth.signInWithOtp({ phone: normalized, options: {
        shouldCreateUser: registering,
        ...(registering ? { data: { account_type: 'guardian', ...form } } : {}),
      } })
      if (problem) { setError('Unable to send a code. Check your number, wait a minute, or use Register if you have no guardian account.'); return }
      setSentPhone(normalized); setCooldown(60); setNotice('If your request is eligible, a login code will arrive by SMS. Never share it.')
    } catch { setError('Unable to connect. Check your internet and try again.') }
    finally { setBusy(false) }
  }
  async function verify(event: FormEvent) {
    event.preventDefault()
    if (busy || !online) return
    if (!/^\d{6}$/.test(code)) { setError('Enter the six-digit code.'); return }
    setBusy(true); setError('')
    try {
      const { error: problem } = await createClient().auth.verifyOtp({ phone: sentPhone, token: code, type: 'sms' })
      if (problem) { setError('The code is invalid or expired. Check it or request another code.'); return }
      const response = await fetch('/api/guardian/register', { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) {
        // An established account may no longer have signup metadata; its link is
        // still resolved independently by the portal context RPC.
        const check = await fetch('/api/guardian/context', { cache: 'no-store' })
        const result = await check.json().catch(() => ({}))
        if (!check.ok || !result.registered) { setError('Phone verified, but registration could not be completed. Contact your BHS/RHU.'); setExisting(true); return }
      }
      router.replace('/guardian'); router.refresh()
    } catch { setError('Unable to finish sign-in. Check your internet and try again.') }
    finally { setBusy(false); setCode('') }
  }
  async function signOut() {
    setBusy(true); setError('')
    try {
      const { error: problem } = await createClient().auth.signOut({ scope: 'local' })
      if (problem) { setError('Unable to sign out. Try again.'); return }
      setExisting(false); setSentPhone(''); setNotice('Signed out on this browser.')
    } finally { setBusy(false) }
  }
  return <AuthShell audience="guardian" scrollable>
    <h2 className="font-display text-3xl font-bold tracking-tight">Guardian access</h2>
    <p className="mt-2 text-brand-muted">View your own children’s profiles and health history.</p>
    {!online && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Connect to the internet to sign in and view current records.</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-brand-ice p-3 text-sm">{notice}</p>}
    {existing ? <div className="mt-6 space-y-4"><p className="text-sm">An account is already signed in on this browser.</p><div className="flex flex-wrap gap-2"><Button onClick={() => router.replace('/guardian')}>Open guardian portal</Button><Button variant="secondary" loading={busy} onClick={signOut}>Sign out first</Button></div><Link href="/login" className="text-sm underline">Worker sign-in</Link></div> : sentPhone ?
      <form onSubmit={verify} className="mt-6 space-y-5">
        <p className="text-sm text-brand-muted">Code requested for {sentPhone.replace(/.(?=.{4})/g, '*')}.</p>
        <Field label="SMS login code" required><Input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
        <Button type="submit" loading={busy} disabled={!online} className="w-full">Verify and sign in</Button>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !online || cooldown > 0} onClick={() => void send()}>Resend code{cooldown ? ` (${cooldown}s)` : ''}</Button><Button variant="ghost" disabled={busy} onClick={() => { setSentPhone(''); setCode(''); setError('') }}>Change number</Button></div>
      </form> : <>
      <div className="mt-6 flex gap-2" aria-label="Guardian account options"><Button variant={!registering ? 'primary' : 'secondary'} disabled={busy} onClick={() => { setRegistering(false); setError('') }}>Sign in</Button><Button variant={registering ? 'primary' : 'secondary'} disabled={busy} onClick={() => { setRegistering(true); setError('') }}>Register</Button></div>
      <form onSubmit={send} className="mt-5 space-y-4">
        {registering && <>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="First name" required><Input autoComplete="given-name" maxLength={100} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></Field><Field label="Last name" required><Input autoComplete="family-name" maxLength={100} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></Field></div>
          <Field label="Middle name (optional)"><Input autoComplete="additional-name" maxLength={100} value={form.middle_name} onChange={e => setForm({ ...form, middle_name: e.target.value })} /></Field>
          <GuardianAddress onChange={updateAddress} />
          <Field label="Relationship to child/children" required><Select value={form.relationship_to_child} onChange={e => setForm({ ...form, relationship_to_child: e.target.value })}><option value="">Select relationship</option>{guardianRelationships.map(value => <option key={value} value={value}>{value}</option>)}</Select></Field>
        </>}
        <Field label="Mobile number" required hint="Use the same current number recorded and verified at your BHS/RHU."><Input type="tel" autoComplete="tel" maxLength={20} placeholder="09171234567" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        {registering && <label className="flex gap-2 text-sm"><input type="checkbox" required className="mt-1" /><span>I agree to the <Link href="/terms" target="_blank" className="underline">terms</Link> and have read the <Link href="/privacy" target="_blank" className="underline">privacy notice</Link>.</span></label>}
        <Button type="submit" loading={busy} disabled={!online || cooldown > 0} className="w-full">Send login code{cooldown ? ` (${cooldown}s)` : ''}</Button>
      </form></>}
    <p className="mt-6 text-xs leading-5 text-brand-muted">Records are linked automatically after verification. If no matching record is found, contact your BHS/RHU. Registering here does not register a new child.</p>
    <Link href="/login" className="mt-4 inline-block text-sm font-medium underline">Health worker sign-in</Link>
  </AuthShell>
}
