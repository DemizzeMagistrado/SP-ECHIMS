'use client'

import { useState, type FormEvent } from 'react'
import { Lock, LogOut, Shield, User } from 'lucide-react'
import { SectionCard } from '@/components/children/child-profile-cards'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { TabBar } from '@/components/ui/module-tabs'
import type { GuardianContext } from '@/lib/guardian/types'

type SettingsTab = 'profile' | 'security'

export function GuardianSettings({
  context,
  onBack,
  onLogout,
}: {
  context: GuardianContext
  onBack: () => void
  onLogout: () => void
}) {
  const [tab, setTab] = useState<SettingsTab>('profile')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError('')
    setSuccess('')
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }
    if (newPassword.length < 8 || new TextEncoder().encode(newPassword).length > 72) {
      setError('Use a password with at least 8 characters and no more than 72 bytes.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/guardian/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to update your password.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Your password has been updated.')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Unable to update your password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-brand-navy">Profile &amp; settings</h1>
          <p className="mt-1.5 text-sm text-brand-muted">Manage your guardian account and sign-in security.</p>
        </div>
        <Button variant="secondary" onClick={onBack}>Back to children</Button>
      </div>
      <TabBar
        label="Guardian settings sections"
        group="guardian-settings"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'profile', label: <span className="inline-flex items-center gap-2"><User size={16} aria-hidden="true" />Profile</span> },
          { value: 'security', label: <span className="inline-flex items-center gap-2"><Lock size={16} aria-hidden="true" />Security</span> },
        ]}
      />

      {tab === 'profile' ? (
        <div className="space-y-6">
          <SectionCard title="Guardian profile" subtitle="Account details used to verify your guardian access">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-brand-navy">Full name</dt>
                <dd className="mt-1 break-words text-sm text-brand-muted">{context.name || 'Not available'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-brand-navy">Verified mobile number</dt>
                <dd className="mt-1 break-words text-sm text-brand-muted">{context.phone || 'Not available'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-brand-navy">Account type</dt>
                <dd className="mt-1 text-sm text-brand-muted">Guardian</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-brand-navy">Child access</dt>
                <dd className="mt-1 text-sm text-brand-muted">{context.linked ? 'Verified linked-child access' : 'Awaiting BHS/RHU verification'}</dd>
              </div>
            </dl>
            <p className="mt-5 border-t border-border pt-4 text-sm text-brand-muted">
              For changes to your name or mobile number, contact your BHS/RHU so your linked records can be verified.
            </p>
          </SectionCard>
          <SectionCard title="Current session" subtitle="Guardian access is verified when your session is refreshed" icon={<Shield size={18} />}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium text-brand-navy">This device</p>
                <p className="mt-1 text-sm text-brand-muted">Your current guardian session is active.</p>
              </div>
              <Button variant="secondary" onClick={onLogout}><LogOut size={16} />Log out</Button>
            </div>
          </SectionCard>
        </div>
      ) : (
        <div className="space-y-6">
          <SectionCard title="Change password" subtitle="Confirm your current password before choosing a new one" icon={<Lock size={18} />}>
            <form onSubmit={changePassword} className="max-w-xl space-y-4">
              <Field label="Current password" required>
                <Input type="password" autoComplete="current-password" maxLength={256} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
              </Field>
              <Field label="New password" hint="At least 8 characters; up to 72 bytes." required>
                <Input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={newPassword} onChange={event => setNewPassword(event.target.value)} />
              </Field>
              <Field label="Confirm new password" required>
                <Input type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
              </Field>
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
              {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
              <Button type="submit" loading={saving}>Update password</Button>
            </form>
          </SectionCard>
          <SectionCard title="Session security" subtitle="You can end this guardian session from any portal screen" icon={<Shield size={18} />}>
            <p className="text-sm text-brand-muted">Signing out clears this device's guardian session. Worker accounts use a separate sign-in.</p>
            <Button className="mt-4" variant="secondary" onClick={onLogout}><LogOut size={16} />Log out</Button>
          </SectionCard>
        </div>
      )}
    </div>
  )
}
