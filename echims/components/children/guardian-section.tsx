'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, X } from 'lucide-react'

export function GuardianSection({ childId, childName }: { childId: string; childName: string }) {
  const fetcher = (url: string) => fetch(url).then((response) => response.json())
  const { data: guardian, mutate } = useSWR(childId ? `/api/guardians?childId=${encodeURIComponent(childId)}` : null, fetcher)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ firstName: '', middleName: '', lastName: '', relationshipToChild: '', contactNumber: '', address: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    if (!form.firstName.trim() || !form.lastName.trim() || !form.relationshipToChild) {
      setError('First name, last name, and relationship to the child are required.')
      return
    }
    setSaving(true)
    const response = await fetch('/api/guardians', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ childId, ...form }) })
    const result = await response.json()
    setSaving(false)
    if (!response.ok) {
      setError(result.error ?? 'Guardian could not be registered.')
      return
    }
    setMessage('Guardian registered successfully.')
    setForm({ firstName: '', middleName: '', lastName: '', relationshipToChild: '', contactNumber: '', address: '' })
    setOpen(false)
    await mutate()
  }

  // CP-USR001 — accept both legacy "CH-47" and new "CH-2026-00047" formats.
  if (!childId || !/^CH-\d+(-\d+)?$/i.test(childId)) return null
  return <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-foreground">Guardian Information</h2><p className="text-sm text-muted-foreground">Guardian details for {childName}</p></div>{!guardian && <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"><Plus size={16} />Add Guardian</button>}</div>{message && <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{message}</p>}{error && !open && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{guardian && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Relationship</th><th className="px-3 py-2 font-semibold">Contact</th><th className="px-3 py-2 font-semibold">Address</th></tr></thead><tbody><tr><td className="px-3 py-3 font-medium">{[guardian.first_name, guardian.middle_name, guardian.last_name].filter(Boolean).join(' ')}</td><td className="px-3 py-3">{guardian.relationship_to_child}</td><td className="px-3 py-3">{guardian.contact_number || '—'}</td><td className="px-3 py-3">{guardian.address || '—'}</td></tr></tbody></table></div>}{!guardian && !open && <p className="mt-4 text-sm text-muted-foreground">No guardian has been registered for this child.</p>}{open && <form onSubmit={submit} className="mt-5 grid gap-4 border-t border-border pt-5 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">First name *</label><input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} className="w-full rounded-lg border border-border px-3 py-2" required /></div><div><label className="mb-1 block text-sm font-medium">Middle name</label><input value={form.middleName} onChange={(event) => setForm({ ...form, middleName: event.target.value })} className="w-full rounded-lg border border-border px-3 py-2" /></div><div><label className="mb-1 block text-sm font-medium">Last name *</label><input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} className="w-full rounded-lg border border-border px-3 py-2" required /></div><div><label className="mb-1 block text-sm font-medium">Relationship to child *</label><select value={form.relationshipToChild} onChange={(event) => setForm({ ...form, relationshipToChild: event.target.value })} className="w-full rounded-lg border border-border bg-white px-3 py-2" required><option value="">Select relationship</option><option>Mother</option><option>Father</option><option>Grandparent</option><option>Other Relative</option><option>Legal Guardian</option></select></div><div><label className="mb-1 block text-sm font-medium">Contact information</label><input value={form.contactNumber} onChange={(event) => setForm({ ...form, contactNumber: event.target.value })} className="w-full rounded-lg border border-border px-3 py-2" /></div><div><label className="mb-1 block text-sm font-medium">Address</label><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="w-full rounded-lg border border-border px-3 py-2" /></div>{error && <p role="alert" className="text-sm text-red-600 md:col-span-2">{error}</p>}<div className="flex gap-2 md:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Register Guardian'}</button><button type="button" onClick={() => { setOpen(false); setError('') }} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold"><X size={16} />Cancel</button></div></form>}</section>
}