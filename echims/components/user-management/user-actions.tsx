// echims/components/user-management/user-actions.tsx
// Profile editor + soft-delete with proper confirm modal (no native browser alert).

'use client'

import { useState } from 'react'
import { Pencil, Trash2, Save, X, AlertTriangle, ShieldAlert } from 'lucide-react'

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
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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
      setMsg({ kind: 'ok', text: 'Profile updated.' })
      setEditing(false)
      onChanged?.()
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' })
    } finally {
      setBusy(false)
    }
  }

  async function performDelete() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Unable to delete account.')
      setMsg({ kind: 'ok', text: 'Account deleted.' })
      setConfirmingDelete(false)
      onChanged?.()
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed.' })
    } finally {
      setBusy(false)
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
              <input
                className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
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
              <input
                type="email"
                className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
              <span className="flex items-center gap-1 text-[11px] text-amber-700">
                <AlertTriangle size={11} /> This is also the login identifier.
              </span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Contact number</span>
              <input
                className="rounded-lg border border-border px-3 py-2 outline-none focus:border-primary"
                value={draft.contactNumber}
                onChange={(e) => setDraft({ ...draft, contactNumber: e.target.value })}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <Save size={14} /> {busy ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <button
            onClick={() => {
              setDraft({
                fullName: user.full_name,
                email: user.email,
                contactNumber: user.contact_number ?? '',
              })
              setEditing(true)
              setMsg(null)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <Pencil size={14} /> Edit profile
          </button>

          {canDelete && (
            <button
              onClick={() => setConfirmingDelete(true)}
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

      {/* Proper confirm modal (replaces browser confirm()) */}
      {confirmingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-4 border-b border-border p-5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <ShieldAlert size={22} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-foreground">Delete this account?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{user.full_name}</span> will no longer appear in the user list and cannot sign in.
                </p>
              </div>
              <button
                onClick={() => { setConfirmingDelete(false); setMsg(null) }}
                aria-label="Close"
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="mb-1 font-semibold">What happens</div>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>Account marked as deleted (soft delete).</li>
                  <li>History preserved for audit — records they created remain intact.</li>
                  <li>Reversible: toggle &quot;Show deleted accounts&quot; to restore later.</li>
                </ul>
              </div>

              {msg?.kind === 'err' && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {msg.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border p-4">
              <button
                onClick={() => { setConfirmingDelete(false); setMsg(null) }}
                disabled={busy}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={performDelete}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <Trash2 size={14} /> {busy ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
