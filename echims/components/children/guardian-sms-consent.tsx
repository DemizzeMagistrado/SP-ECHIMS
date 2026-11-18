'use client'
import { toSmsGatewayNumber } from '@/lib/phone'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useEffect, useRef, useState } from 'react'
type Props = {
  guardian: { guardian_id: number; contact_number: string | null; sms_opt_in?: boolean; sms_verified_contact_number?: string | null; sms_contact_verified_at?: string | null }
  canEdit: boolean
  onSaved: () => Promise<unknown> | void
}
const normalizeMobile = toSmsGatewayNumber;
async function read(response: Response) {
  const body = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object') throw new Error(body?.error ?? 'Unable to process guardian SMS preferences.')
  return body
}
export function GuardianSmsConsent({ guardian, canEdit, onSaved }: Props) {
  const [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [verified, setVerified] = useState(false), [liveEnabled, setLiveEnabled] = useState(false)
  const [challengeId, setChallengeId] = useState(''), [code, setCode] = useState(''), [refresh, setRefresh] = useState(0)
  const requestId = useRef<string | null>(null)
  const identity = `${guardian.guardian_id}:${guardian.contact_number}:${guardian.sms_opt_in}`
  const currentIdentity = useRef(identity); currentIdentity.current = identity
  const number = normalizeMobile(guardian.contact_number)
  const enabled = Boolean(number && guardian.sms_opt_in === true && guardian.sms_verified_contact_number === number && guardian.sms_contact_verified_at)
  const url = `/api/guardians/${guardian.guardian_id}/sms-otp`
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setVerified(false); setChallengeId(''); setCode(''); requestId.current = null
    void fetch(url, { cache: 'no-store', signal: controller.signal }).then(read).then(result => {
      if (active) { setVerified(result.verified === true); setLiveEnabled(result.liveEnabled === true) }
    }).catch(cause => { if (active && cause.name !== 'AbortError') setError(cause.message) })
    return () => { active = false; controller.abort() }
  }, [url, identity, refresh])
  async function save(optIn: boolean) {
    if (saving || !canEdit || (optIn && (!number || !confirmed))) return
    const snapshot = identity
    setSaving(true); setError(''); setNotice('')
    try {
      await read(await fetch(`/api/guardians/${guardian.guardian_id}/sms-consent`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optIn, contactNumber: guardian.contact_number, confirmedWithGuardian: optIn && confirmed }) }))
      if (currentIdentity.current !== snapshot) return
      setConfirmed(false); setNotice(optIn ? 'Consent saved. Verify the mobile number by OTP before live reminders.' : 'SMS reminders disabled.'); setRefresh(v => v + 1)
      await onSaved()
    } catch (cause) { if (currentIdentity.current === snapshot) setError(cause instanceof Error ? cause.message : 'Unable to save preferences.') }
    finally { setSaving(false) }
  }
  async function otp(action: 'REQUEST' | 'VERIFY') {
    if (saving || !canEdit || !enabled || (action === 'REQUEST' && !liveEnabled)) return
    const snapshot = identity
    setSaving(true); setError(''); setNotice('')
    try {
      if (action === 'REQUEST') requestId.current ??= crypto.randomUUID()
      const result = await read(await globalThis.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'REQUEST' ? { action, requestId: requestId.current } : { action, challengeId, code }) }))
      if (currentIdentity.current !== snapshot) return
      if (action === 'REQUEST') {
        setChallengeId(result.challengeId ?? ''); setNotice(result.message ?? 'Check the guardian phone.')
      } else { setVerified(true); setChallengeId(''); setCode(''); setNotice('Guardian mobile number verified.'); await onSaved() }
    } catch (cause) { if (currentIdentity.current === snapshot) setError(cause instanceof Error ? cause.message : 'Unable to verify mobile number.') }
    finally { setSaving(false) }
  }
  return <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Guardian SMS reminders</p><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${verified ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{verified ? 'Mobile verified by OTP' : enabled ? 'Consent saved - OTP required' : 'Not enabled'}</span></div>
    <p className="text-xs text-muted-foreground">Consent applies to children linked to this guardian. A changed mobile number requires verification again.</p>
    {canEdit && !enabled && <>{!number ? <p className="text-sm text-amber-800">Use Edit to save a valid Philippine mobile number first.</p> : <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving} onChange={e => setConfirmed(e.target.checked)} className="mt-1"/><span>The guardian confirmed {guardian.contact_number} and agrees to receive child health SMS reminders.</span></label>}<button type="button" disabled={!number || !confirmed || saving} onClick={() => void save(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving...' : 'Confirm SMS Consent'}</button></>}
    {canEdit && enabled && !verified && <div className="space-y-3 rounded-lg border bg-white p-3">
      <p className="text-sm">Send a verification code to the saved guardian number. Ask the guardian to read the code from their phone.</p>
      {!liveEnabled && <p className="text-xs text-amber-800">OTP sending becomes available when live iProg SMS sending is configured.</p>}
      <button type="button" disabled={saving || !liveEnabled} onClick={() => void otp('REQUEST')} className="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Processing...' : requestId.current ? 'Check existing OTP request' : 'Send OTP'}</button>
      {challengeId && <><label className="block text-sm">Verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="mt-1 block w-40 rounded-lg border p-2"/></label><button type="button" disabled={saving || code.length !== 6} onClick={() => void otp('VERIFY')} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Verify code</button><button type="button" disabled={saving} onClick={() => { requestId.current = null; setChallengeId(''); setCode(''); setNotice('You may request a new code after the resend cooldown.'); }} className="ml-2 rounded-lg border px-3 py-2 text-sm">Request a new code</button></>}
    </div>}
    {canEdit && (enabled || guardian.sms_opt_in === true) && <button type="button" disabled={saving} onClick={() => void save(false)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Disable SMS Reminders</button>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{notice && <p role="status" className="text-sm text-blue-700">{notice}</p>}
  </div>
}
