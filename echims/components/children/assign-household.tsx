'use client'

// "Household not assigned" task (NIP-REV01): a child accepted on a transfer with only an address
// has no household. Shown on the child profile (and as a badge in the children list); the action
// links an existing household in the child's barangay or creates a new one.

import { useState } from 'react'
import useSWR from 'swr'
import { Home, Search } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type Household = { household_id: number; household_no: string | null; family_serial_no?: string | null; household_address: string | null; purok?: string | null }
const fetcher = async (url: string) => { const r = await fetch(url); const d = await r.json().catch(() => []); if (!r.ok) throw new Error(d.error || 'Unable to search households.'); return d as Household[] }

export function HouseholdNotAssigned({ childId, childName, barangayId, canEdit, onAssigned }: {
  childId: number; childName: string; barangayId: number | null; canEdit: boolean; onAssigned: () => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<Household | null>(null)
  const [address, setAddress] = useState('')
  const [householdNo, setHouseholdNo] = useState('')
  const [purok, setPurok] = useState('')
  const [fourPs, setFourPs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { data: matches = [], isLoading } = useSWR(open && mode === 'existing' && barangayId && q.trim().length > 1 ? `/api/households?q=${encodeURIComponent(q.trim())}&barangayId=${barangayId}` : null, fetcher)

  async function save() {
    setError(null)
    if (mode === 'existing' && !chosen) { setError('Choose a household from the list.'); return }
    if (mode === 'new' && !address.trim()) { setError('Enter the household address.'); return }
    if (!navigator.onLine) { toast.warning('Connect to the internet to assign a household.'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/children/assign-household', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'existing'
          ? { child_id: childId, household_id: chosen!.household_id }
          : { child_id: childId, new_household: { household_address: address.trim(), household_no: householdNo.trim() || null, purok: purok.trim() || null, is_4ps_member: fourPs } }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Unable to assign the household.')
      toast.success(`Household assigned to ${childName}.`)
      setOpen(false)
      onAssigned()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to assign the household.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-brand-navy">
      <span className="flex items-start gap-2">
        <Home size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
        <span><strong>Household not assigned.</strong> This child was received on a transfer without a household, so there is no Family Serial Number yet.</span>
      </span>
      {canEdit && <Button size="sm" onClick={() => { setMode('existing'); setQ(''); setChosen(null); setAddress(''); setHouseholdNo(''); setPurok(''); setFourPs(false); setError(null); setOpen(true) }}>Assign household</Button>}
      <Modal open={open} onClose={() => setOpen(false)} busy={saving} size="md" icon={<Home />} title="Assign a household" subtitle={childName}
        onSubmit={(e) => { e.preventDefault(); void save() }} bodyClassName="space-y-4"
        footer={<Button type="submit" loading={saving}>{mode === 'existing' ? 'Link household' : 'Create and link'}</Button>}>
        <div role="radiogroup" aria-label="Household" className="inline-flex rounded-lg bg-brand-blue/[0.07] p-0.5">
          {(['existing', 'new'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setError(null) }}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', mode === m ? 'bg-white text-brand-navy shadow-sm' : 'text-brand-muted hover:text-brand-navy')}>
              {m === 'existing' ? 'Existing household' : 'New household'}
            </button>
          ))}
        </div>
        {mode === 'existing' ? (
          <>
            <Field label="Search this barangay's households" hint="Household no., address or FSN">
              <div className="relative">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => { setQ(e.target.value); setChosen(null) }} className="pl-9" placeholder="e.g. Purok 1" />
              </div>
            </Field>
            {q.trim().length > 1 && (
              <ul className="max-h-56 divide-y divide-brand-line overflow-y-auto rounded-xl border border-brand-line">
                {isLoading && <li className="px-3 py-2 text-brand-muted">Searching…</li>}
                {!isLoading && matches.length === 0 && <li className="px-3 py-2 text-brand-muted">No household matches. Use “New household”.</li>}
                {matches.map((h) => (
                  <li key={h.household_id}>
                    <button type="button" onClick={() => setChosen(h)} aria-pressed={chosen?.household_id === h.household_id}
                      className={cn('w-full px-3 py-2 text-left hover:bg-brand-ice', chosen?.household_id === h.household_id && 'bg-brand-ice font-semibold')}>
                      {h.household_address ?? `Household ${h.household_id}`}
                      <span className="block text-xs font-normal text-brand-muted">{[h.family_serial_no, h.household_no ? `HH ${h.household_no}` : null, h.purok].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Household address" required className="sm:col-span-2"><Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} /></Field>
            <Field label="Household no."><Input value={householdNo} onChange={(e) => setHouseholdNo(e.target.value)} /></Field>
            <Field label="Purok"><Input value={purok} onChange={(e) => setPurok(e.target.value)} /></Field>
            <Checkbox label="4Ps member" checked={fourPs} onChange={(e) => setFourPs(e.target.checked)} />
          </div>
        )}
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </Modal>
    </div>
  )
}
