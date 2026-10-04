'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { CheckCircle2, X, Plus, Trash2, UserCog } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'

type Assignment = { assignment_id: number; barangay_id: number; barangay_name: string }
type User = {
  user_id: string
  full_name: string | null
  username: string | null
  email: string | null
  contact_number: string | null
  account_status: string
  created_at: string
  role: 'Administrator' | 'Public Health Nurse' | 'Rural Health Midwife' | 'Barangay Health Worker' | 'Barangay Nutrition Scholar' | null
  employee_id: string | null
  license_number: string | null
  rhu_id: number | null
  rhu_name: string | null
  assignments: Assignment[]
}
type Barangay = { barangay_id: number; barangay_name: string }
type Rhu = { rhu_id: number; rhu_name: string; municipality: string; province: string }

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Request failed')
  return d
}

// Which roles need barangay assignments (per the hierarchy in the frontend guide:
// RHM/BHW/BNS = assigned barangays; PHN = assigned RHU; Admin = none).
const BARANGAY_ROLES: User['role'][] = ['Rural Health Midwife', 'Barangay Health Worker', 'Barangay Nutrition Scholar']

export default function UserManagementPage() {
  const { user: me, isReady } = useAuth()
  const isAdmin = me?.role === 'Administrator' && me?.accountStatus === 'APPROVED'

  const { data: users, error, mutate } = useSWR<User[]>(isAdmin ? '/api/users' : null, fetcher)
  const { data: barangays } = useSWR<Barangay[]>(isAdmin ? '/api/barangays' : null, fetcher)
  const { data: rhus } = useSWR<Rhu[]>(isAdmin ? '/api/rhus' : null, fetcher)

  const [managing, setManaging] = useState<User | null>(null)
  const [message, setMessage] = useState('')

  const pending = useMemo(() => (users ?? []).filter((u) => u.account_status === 'PENDING'), [users])
  const active = useMemo(() => (users ?? []).filter((u) => u.account_status !== 'PENDING'), [users])

  if (!isReady) return <div className="rounded-2xl border border-sky-200 bg-white p-10 text-center text-[#6B7280]">Loading...</div>
  if (!isAdmin) return <section className="rounded-xl border border-[#FECACA] bg-white p-8"><h1 className="text-2xl font-bold text-[#03045E]">Access restricted</h1><p className="mt-2 text-sm text-[#6B7280]">Only administrators can access User Management.</p></section>

  async function updateStatus(userId: string, status: string) {
    setMessage('')
    const r = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, account_status: status }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return setMessage(d.error || 'Unable to update account status.')
    setMessage(status === 'ACTIVE' ? 'Account approved.' : `Account set to ${status}.`)
    await mutate()
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-[#0077B6]">eCHIMS Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-[#03045E]">User Management</h1>
          <p className="mt-2 text-sm text-[#6B7280]">Approve registrations, assign roles to RHU / barangays, and manage account status.</p>
        </div>
      </header>

      {message && <p role="status" className="rounded-xl bg-[#E8F7EE] px-4 py-3 text-sm text-[#16803C]">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-[#FEECEC] px-4 py-3 text-sm text-[#B42318]">{error.message}</p>}

      {/* Pending Approvals */}
      <section className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#92400E]">Pending Approvals</p>
            <h2 className="mt-1 text-lg font-bold text-[#92400E]">{pending.length} account{pending.length === 1 ? '' : 's'} awaiting review</h2>
          </div>
        </div>
        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-[#92400E]">No pending registrations right now.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {pending.map((u) => (
              <div key={u.user_id} className="flex flex-col gap-3 rounded-xl border border-[#FDE68A] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-[#03045E]">{u.full_name || u.email}</p>
                  <p className="text-sm text-[#6B7280]">{u.email} · requested role: <span className="font-semibold text-[#0077B6]">{u.role ?? 'Unknown'}</span></p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateStatus(u.user_id, 'ACTIVE')} className="flex items-center gap-2 rounded-lg bg-[#16803C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13693a]"><CheckCircle2 size={16} />Approve</button>
                  <button type="button" onClick={() => updateStatus(u.user_id, 'INACTIVE')} className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-semibold text-[#6B7280] hover:bg-[#F8FAFC]"><X size={16} />Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All Users */}
      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#0077B6]">All Users</p>
            <h2 className="mt-1 text-lg font-bold text-[#03045E]">{active.length} account{active.length === 1 ? '' : 's'}</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wide text-[#6B7280]">
              <tr>{['Full Name', 'Email', 'Role', 'Assigned to', 'Status', 'Action'].map((h) => <th key={h} className="px-5 py-4 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {active.map((u) => (
                <tr key={u.user_id}>
                  <td className="px-5 py-4"><p className="font-semibold text-[#03045E]">{u.full_name || '—'}</p><p className="text-xs text-[#6B7280]">{u.username || ''}</p></td>
                  <td className="px-5 py-4 text-[#6B7280]">{u.email}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-[#E0F5FA] px-2.5 py-1 text-xs font-semibold text-[#0077B6]">{u.role ?? '—'}</span></td>
                  <td className="px-5 py-4 text-xs text-[#6B7280]">
                    {u.role === 'Public Health Nurse' ? (u.rhu_name ? `RHU: ${u.rhu_name}` : <span className="text-[#B42318]">No RHU assigned</span>)
                      : u.role === 'Administrator' ? '—'
                      : u.assignments.length > 0 ? u.assignments.map((a) => a.barangay_name).join(', ')
                      : <span className="text-[#B42318]">No barangay assigned</span>}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={u.account_status} /></td>
                  <td className="px-5 py-4">
                    {u.role && u.role !== 'Administrator' && (
                      <button type="button" onClick={() => setManaging(u)} className="flex items-center gap-2 font-semibold text-[#0077B6] hover:underline"><UserCog size={14} />Manage</button>
                    )}
                  </td>
                </tr>
              ))}
              {active.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-[#6B7280]">No active accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {managing && <ManageModal user={managing} barangays={barangays ?? []} rhus={rhus ?? []} onClose={() => setManaging(null)} onChange={() => { mutate(); setManaging(null) }} onMessage={setMessage} />}
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const style = status === 'ACTIVE' ? 'bg-[#E8F7EE] text-[#16803C]' : status === 'PENDING' ? 'bg-[#FFF7ED] text-[#C2410C]' : 'bg-[#FEECEC] text-[#B42318]'
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{status}</span>
}

function ManageModal({ user, barangays, rhus, onClose, onChange, onMessage }: { user: User; barangays: Barangay[]; rhus: Rhu[]; onClose: () => void; onChange: () => void; onMessage: (m: string) => void }) {
  const [barangayToAdd, setBarangayToAdd] = useState('')
  const [rhuToAssign, setRhuToAssign] = useState(user.rhu_id ? String(user.rhu_id) : '')
  const [saving, setSaving] = useState(false)
  const assignedBarangayIds = new Set(user.assignments.map((a) => a.barangay_id))
  const availableBarangays = barangays.filter((b) => !assignedBarangayIds.has(b.barangay_id))

  async function addBarangay() {
    if (!barangayToAdd) return
    setSaving(true)
    const r = await fetch('/api/users/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.user_id, barangay_id: Number(barangayToAdd) }) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) return onMessage(d.error || 'Unable to add assignment.')
    onMessage('Barangay assignment added.')
    onChange()
  }

  async function removeAssignment(assignmentId: number) {
    setSaving(true)
    const r = await fetch('/api/users/assignments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignment_id: assignmentId }) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) return onMessage(d.error || 'Unable to remove assignment.')
    onMessage('Barangay assignment removed.')
    onChange()
  }

  async function updateRhu() {
    setSaving(true)
    const r = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.user_id, rhu_id: rhuToAssign ? Number(rhuToAssign) : null }) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) return onMessage(d.error || 'Unable to update RHU.')
    onMessage('RHU assignment updated.')
    onChange()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#03045E]/30 p-4">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#03045E]">Manage assignments</h2>
            <p className="text-sm text-[#6B7280]">{user.full_name} · {user.role}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-[#6B7280]" aria-label="Close">×</button>
        </div>

        {user.role === 'Public Health Nurse' ? (
          <div className="mt-6 space-y-3">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold text-[#03045E]">Assigned RHU</span>
              <p className="text-xs text-[#6B7280]">A Public Health Nurse supervises one RHU.</p>
              <select value={rhuToAssign} onChange={(e) => setRhuToAssign(e.target.value)} className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3">
                <option value="">— No RHU —</option>
                {rhus.map((r) => <option key={r.rhu_id} value={r.rhu_id}>{r.rhu_name} ({r.municipality}, {r.province})</option>)}
              </select>
            </label>
            <button type="button" disabled={saving} onClick={updateRhu} className="rounded-lg bg-[#0077B6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save RHU</button>
          </div>
        ) : BARANGAY_ROLES.includes(user.role) ? (
          <div className="mt-6 space-y-5">
            <div>
              <p className="text-sm font-semibold text-[#03045E]">Current barangays</p>
              {user.assignments.length === 0 ? (
                <p className="mt-2 text-sm text-[#6B7280]">No barangays assigned yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB]">
                  {user.assignments.map((a) => (
                    <li key={a.assignment_id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-[#03045E]">{a.barangay_name}</span>
                      <button type="button" disabled={saving} onClick={() => removeAssignment(a.assignment_id)} className="flex items-center gap-1 text-xs font-semibold text-[#B42318] hover:underline disabled:opacity-60"><Trash2 size={14} />Remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#03045E]">Add barangay</p>
              <div className="mt-2 flex gap-2">
                <select value={barangayToAdd} onChange={(e) => setBarangayToAdd(e.target.value)} className="h-10 flex-1 rounded-lg border border-[#E5E7EB] bg-white px-3">
                  <option value="">Select barangay to assign</option>
                  {availableBarangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
                </select>
                <button type="button" disabled={saving || !barangayToAdd} onClick={addBarangay} className="flex items-center gap-2 rounded-lg bg-[#0077B6] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Plus size={16} />Add</button>
              </div>
              {user.role === 'Rural Health Midwife' && <p className="mt-2 text-xs text-[#6B7280]">An RHM normally covers one barangay but can cover more when the RHU is understaffed.</p>}
              {(user.role === 'Barangay Health Worker' || user.role === 'Barangay Nutrition Scholar') && <p className="mt-2 text-xs text-[#6B7280]">{user.role === 'Barangay Health Worker' ? 'A BHW' : 'A BNS'} is normally assigned to one specific barangay.</p>}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-[#6B7280]">This role does not have barangay or RHU assignments.</p>
        )}

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-semibold text-[#6B7280]">Close</button>
        </div>
      </div>
    </div>
  )
}