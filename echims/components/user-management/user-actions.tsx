// echims/components/user-management/user-actions.tsx
// Profile editor (dialog) and soft-delete (behind the shared ConfirmDialog) for User Management.

'use client'

import { useState, type FormEvent } from 'react'
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'

type UserRow = {
  user_id: string
  full_name: string
  username: string
  email: string
  contact_number: string | null
  account_status: string
  role: string | null
}

/** Edit full name, email and contact number (PATCH /api/admin/users { profile }). Username is fixed. */
export function EditProfileDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const initial = { fullName: user.full_name, email: user.email, contactNumber: user.contact_number ?? '' }
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = draft.fullName !== initial.fullName || draft.email !== initial.email || draft.contactNumber !== initial.contactNumber

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!draft.fullName.trim() || !draft.email.trim()) return setError('Full name and email are required.')
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id, profile: { fullName: draft.fullName.trim(), email: draft.email.trim(), contactNumber: draft.contactNumber.trim() } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Unable to save changes.')
      toast.success('Profile updated.')
      onSaved()
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'Unable to save changes.'} Nothing was changed.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      size="form"
      onClose={onClose}
      busy={busy}
      dirty={dirty}
      onSubmit={save}
      icon={<Pencil />}
      title="Edit profile"
      subtitle={user.full_name}
      footer={<Button type="submit" loading={busy}>Save changes</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} disabled={busy} />
        </Field>
        <Field label="Username" hint="Usernames cannot be changed.">
          <Input value={user.username} disabled readOnly />
        </Field>
        <Field label="Email" required hint={<span className="inline-flex items-center gap-1 text-[#9C6B10]"><AlertTriangle size={11} aria-hidden="true" /> This is also the sign-in identifier.</span>}>
          <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} disabled={busy} />
        </Field>
        <Field label="Contact number">
          <Input value={draft.contactNumber} onChange={(e) => setDraft({ ...draft, contactNumber: e.target.value })} disabled={busy} />
        </Field>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
    </Modal>
  )
}

/** Soft delete (account_status = DELETED). Only for inactive accounts, never your own. */
export function DeleteAccountButton({ user, currentUserId, onDeleted, className }: { user: UserRow; currentUserId: string; onDeleted: () => void; className?: string }) {
  const confirm = useConfirm()
  if (user.account_status !== 'INACTIVE') return null
  if (user.user_id === currentUserId) return <span className="text-xs text-[#8896B0]">You cannot delete your own account.</span>

  async function requestDelete() {
    try {
      const deleted = await confirm({
        title: 'Delete this account?',
        tone: 'danger',
        confirmLabel: 'Delete account',
        description: (
          <>
            <span className="font-semibold text-brand-navy">{user.full_name}</span> will no longer appear in the user list and cannot sign in.
            <ul className="mt-3 list-inside list-disc space-y-0.5 rounded-xl bg-warn-soft p-3 text-xs text-warn">
              <li>Account marked as deleted (soft delete).</li>
              <li>History preserved for audit — records they created remain intact.</li>
            </ul>
          </>
        ),
        action: async () => {
          const res = await fetch('/api/admin/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.user_id }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data?.error ?? 'Unable to delete account.')
        },
      })
      if (!deleted) return
      toast.success('Account deleted.')
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  return (
    <button type="button" onClick={() => void requestDelete()} className={className}>
      <Trash2 size={14} aria-hidden="true" /> Delete account
    </button>
  )
}
