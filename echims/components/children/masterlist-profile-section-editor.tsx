'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import type { Guardian, HouseholdRow } from '@/components/children/child-profile-details-view'

const labels = {
  first_name: 'First name',
  middle_name: 'Middle name',
  last_name: 'Last name',
  relationship_to_child: 'Relationship to child',
  contact_number: 'Contact number',
  address: 'Guardian address',
  household_address: 'Household address',
  household_no: 'Household number',
  purok: 'Purok',
}

type Section = 'guardian' | 'household'

export function MasterlistProfileSectionEditor({
  childId, section, guardian, household, onSaved,
}: {
  childId: number
  section: Section
  guardian: Guardian | null
  household: HouseholdRow | null
  onSaved: () => void
}) {
  const source = section === 'guardian' ? {
    first_name: guardian?.first_name ?? '',
    middle_name: guardian?.middle_name ?? '',
    last_name: guardian?.last_name ?? '',
    relationship_to_child: guardian?.relationship_to_child ?? '',
    contact_number: guardian?.contact_number ?? '',
    address: guardian?.address ?? '',
  } : {
    household_address: household?.household_address ?? '',
    household_no: household?.household_no ?? '',
    purok: household?.purok ?? '',
  }
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [expected, setExpected] = useState<Record<string, string | number | null> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const title = section === 'guardian' && !guardian ? 'Add guardian' : `Edit ${section}`

  async function save() {
    if (!draft || !expected) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/masterlist/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, section, expected, details: draft }),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      setDraft(null)
      onSaved()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <Button size="sm" variant="secondary" onClick={() => {
      const fields = Object.fromEntries(Object.entries(source).filter(([, value]) => typeof value === 'string')) as Record<string, string>
      setExpected({ ...fields, id: section === 'guardian' ? guardian?.guardian_id ?? null : household?.household_id ?? null })
      setDraft(fields)
      setError('')
    }}>{title}</Button>
    {draft && <Modal open onClose={() => { if (!saving) setDraft(null) }} title={title}
      subtitle="Changes apply to profiles linked to this record."
      footer={<Button onClick={save} loading={saving}>Save details</Button>}>
      <div className="space-y-3">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {Object.entries(draft).map(([field, value]) => <label key={field} className="block text-sm">
          {labels[field as keyof typeof labels]}
          <Input value={value} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />
        </label>)}
      </div>
    </Modal>}
  </>
}
