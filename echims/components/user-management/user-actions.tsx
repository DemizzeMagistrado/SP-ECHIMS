// echims/components/user-management/user-actions.tsx
// Profile editor + soft-delete behind the shared ConfirmDialog.

'use client'

import { useState } from 'react'
import { Pencil, Trash2, Save, X, AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/brand/logo-loader'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'

type UserRow = {
  user_id: string
  full_name: string
  username: string
  email: string
  contact_number: string | null
  account_status: string
  role: string | null
}

type Props = {
  user: UserRow
  currentUserId: string
  onChanged?: () => void
}

export function UserActions({ user, currentUserId, onChanged }: Props) {
  const [editing, setEditing] = useState(false)
  const confirm = useConfirm()
  const [draft, setDraft] = useState({
    fullName: user.full_name,
    email: user.email,
    contactNumber: user.contact_number ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.user_id,
          profile: {
            fullName: draft.fullName,
            email: draft.email,
            contactNumber: draft.contactNumber,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Unable to save changes.')
      toast.success('Profile updated.')
      setEditing(false)
      onChanged?.()
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' })
    } finally {
      setBusy(false)
    }
  }

  async function requestDelete() {
    setMsg(null)
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
              <li>Reversible: toggle &quot;Show deleted accounts&quot; to restore later.</li>
            </ul>
          </>
        ),
        action: async () => {
          const res = await fetch('/api/admin/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.user_id }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data?.error ?? 'Unable to delete account.')
        },
      })
      if (!deleted) return
      toast.success('Account deleted.')
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  const isSelf = user.user_id === currentUserId
  const canDelete = user.account_status === 'INACTIVE' && !isSelf

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={
            'rounded-xl border px-3 py-2 text-sm ' +
            (msg.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800')
          }
        >
          {msg.text}
        </div>
      )}

      {editing && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-primary">Edit profile</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Full name</span>
              <Input
                value={draft.fullName}
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Username (read-only)</span>
              <input
                disabled
                className="rounded-lg border border-border bg-muted px-3 py-2 text-muted-foreground"
                value={user.username}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Email</span>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
              <span className="flex items-center gap-1 text-[11px] text-amber-700">
                <AlertTriangle size={11} /> This is also the login identifier.
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Contact number</span>
              <Input
                value={draft.contactNumber}
                onChange={(e) => setDraft({ ...draft, contactNumber: e.target.value })}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm"
              onClick={() => {
                setEditing(false)
                setDraft({
                  fullName: user.full_name,
                  email: user.email,
                  contactNumber: user.contact_number ?? '',
                })
                setMsg(null)
              }}
              disabled={busy}
            >
              <X size={14} /> Cancel
            </Button>
            <Button size="sm"
              onClick={save}
              disabled={busy}
            >
              {busy ? <Spinner /> : <Save size={14} />} {busy ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" size="sm"
            onClick={() => {
              setDraft({
                fullName: user.full_name,
                email: user.email,
                contactNumber: user.contact_number ?? '',
              })
              setEditing(true)
              setMsg(null)
            }}
           
          >
            <Pencil size={14} /> Edit profile
          </Button>

          {canDelete && (
            <button
              onClick={() => void requestDelete()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              <Trash2 size={14} /> Delete account
            </button>
          )}

          {user.account_status === 'INACTIVE' && isSelf && (
            <span className="text-xs text-muted-foreground">You cannot delete your own account.</span>
          )}
        </div>
      )}

    </div>
  )
}
