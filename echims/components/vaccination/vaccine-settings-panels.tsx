'use client'

// Vaccination › Vaccines (Catalog settings) extras (Admin / PHN): companion medicines per vaccine and the batch
// number format. Both used to be database-only.

import { useState } from 'react'
import useSWR from 'swr'
import { Hash, Pill, Plus, Trash2 } from 'lucide-react'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/form'
import { Modal } from '@/components/ui/modal'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/brand/logo-loader'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'
import { BATCH_SEPARATOR_CHOICES, batchPattern, describeBatchRule, normalizeBatchNumber, parseBatchRule, type BatchRule } from '@/lib/vaccination-config'

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Unable to load.')
  return d
}
function one<T>(v: T | T[] | null | undefined): T | null { return (Array.isArray(v) ? v[0] : v) ?? null }

type Item = { item_name: string; unit?: string | null; status?: string } | null
type CompanionsPayload = {
  can_manage: boolean
  vaccines: { vaccine_id: number; vaccine_type: string; item: Item | Item[] }[]
  medicines: { item_id: number; item_name: string; unit: string | null }[]
  links: { vaccine_id: number; item_id: number; quantity: number; note: string | null; active: boolean; item: Item | Item[] }[]
}
type Draft = { vaccine_id: string; item_id: string; quantity: string; note: string; active: boolean; editing: boolean }

export function CompanionMedicinesPanel() {
  const { data, error, isLoading, mutate } = useSWR<CompanionsPayload>('/api/vaccination/companions', fetcher)
  const confirm = useConfirm()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const canManage = data?.can_manage ?? false
  const vaccineName = (id: number) => { const v = data?.vaccines.find((x) => x.vaccine_id === id); return one(v?.item)?.item_name ?? v?.vaccine_type ?? `Vaccine #${id}` }

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/vaccination/companions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { if (d.fieldErrors) setErrors(d.fieldErrors); throw new Error(d.error || 'Unable to save.') }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    const errs: Record<string, string> = {}
    if (!draft.vaccine_id) errs.vaccine_id = 'Choose the vaccine.'
    if (!draft.item_id) errs.item_id = 'Choose the medicine.'
    const q = Number(draft.quantity)
    if (!Number.isFinite(q) || q <= 0 || q > 100) errs.quantity = 'Enter a quantity more than 0 and up to 100.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      await post({ action: 'save', vaccine_id: Number(draft.vaccine_id), item_id: Number(draft.item_id), quantity: q, note: draft.note, active: draft.active })
      toast.success('Companion medicine saved. It applies to doses approved from now on.')
      setDraft(null); void mutate()
    } catch (err) { toast.error(`${err instanceof Error ? err.message : 'Unable to save.'} Nothing was changed.`) }
    finally { setSaving(false) }
  }
  async function remove(link: CompanionsPayload['links'][number]) {
    const name = one(link.item)?.item_name ?? 'this medicine'
    try {
      const ok = await confirm({ title: `Remove ${name} from ${vaccineName(link.vaccine_id)}?`, description: 'Doses approved from now on will not include it. Records already approved keep it.', confirmLabel: 'Remove', tone: 'danger', action: () => post({ action: 'remove', vaccine_id: link.vaccine_id, item_id: link.item_id }) })
      if (ok) { toast.success(`${name} removed.`); void mutate() }
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Unable to remove it.') }
  }

  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-brand-navy"><Pill size={18} aria-hidden="true" /> Companion medicines</h2>
          <p className="mt-0.5 text-sm text-brand-muted">Given with a vaccine dose (e.g. Paracetamol Drops with Pentavalent) and deducted from the same barangay stock when the PHN approves the dose.</p>
        </div>
        {canManage && <Button onClick={() => { setErrors({}); setDraft({ vaccine_id: '', item_id: '', quantity: '1', note: '', active: true, editing: false }) }}><Plus size={16} aria-hidden="true" /> Add companion medicine</Button>}
      </div>
      <div className="mt-4">
        {isLoading ? <Spinner showLabel label="Loading companion medicines…" className="w-full justify-center py-6 text-sm text-brand-muted" />
          : error ? <p role="alert" className="text-sm text-danger">{error.message}</p>
          : !data?.links.length ? <EmptyState icon={Pill} size="section" title="No companion medicines yet" description="Add one so it is recorded and deducted with the vaccine dose." />
          : (
            <ul className="divide-y divide-brand-line rounded-xl border border-brand-line">
              {data.links.map((l) => (
                <li key={`${l.vaccine_id}-${l.item_id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-brand-navy">{vaccineName(l.vaccine_id)}</span> → {one(l.item)?.item_name} · {l.quantity} {one(l.item)?.unit ?? 'unit'} per dose
                    {l.note && <span className="block text-xs text-brand-muted">{l.note}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={l.active ? 'active' : 'inactive'} label={l.active ? 'Active' : 'Off'} />
                    {canManage && <>
                      <Button size="sm" variant="secondary" onClick={() => { setErrors({}); setDraft({ vaccine_id: String(l.vaccine_id), item_id: String(l.item_id), quantity: String(l.quantity), note: l.note ?? '', active: l.active, editing: true }) }}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => void remove(l)} aria-label={`Remove ${one(l.item)?.item_name}`}><Trash2 size={14} aria-hidden="true" /></Button>
                    </>}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </div>
      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        busy={saving}
        icon={<Pill />}
        title={draft?.editing ? 'Edit companion medicine' : 'Add companion medicine'}
        subtitle="Recorded with every approved dose of the vaccine."
        onSubmit={save}
        noValidate
        bodyClassName="space-y-4"
        footer={<Button type="submit" loading={saving}>Save</Button>}
      >
        {draft && <>
          <Field label="Vaccine" required error={errors.vaccine_id}>
            <Select value={draft.vaccine_id} disabled={draft.editing} onChange={(e) => setDraft({ ...draft, vaccine_id: e.target.value })}>
              <option value="">Select a vaccine</option>
              {data?.vaccines.filter((v) => one(v.item)?.status !== 'INACTIVE').map((v) => <option key={v.vaccine_id} value={v.vaccine_id}>{one(v.item)?.item_name ?? v.vaccine_type} ({v.vaccine_type})</option>)}
            </Select>
          </Field>
          <Field label="Medicine" required error={errors.item_id} hint="Items from the inventory catalog (not vaccines).">
            <Select value={draft.item_id} disabled={draft.editing} onChange={(e) => setDraft({ ...draft, item_id: e.target.value })}>
              <option value="">Select a medicine</option>
              {data?.medicines.map((m) => <option key={m.item_id} value={m.item_id}>{m.item_name}{m.unit ? ` (${m.unit})` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Quantity per dose" required error={errors.quantity}>
            <Input type="number" min="0.1" step="any" inputMode="decimal" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
          </Field>
          <Field label="Note shown on the record form (optional)">
            <Input value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. Paracetamol drops will be recorded with this dose" />
          </Field>
          <Checkbox label="Active" hint="Turn off to stop adding it without deleting the setting." checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
        </>}
      </Modal>
    </section>
  )
}

export function BatchFormatPanel({ canManage }: { canManage: boolean }) {
  const { data, mutate } = useSWR<{ batch_number_format: BatchRule }>('/api/vaccination/settings', fetcher)
  const saved = parseBatchRule(data?.batch_number_format)
  const [form, setForm] = useState<{ min: string; max: string; separators: string; example: string } | null>(null)
  const [test, setTest] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const f = form ?? { min: String(saved.min), max: String(saved.max), separators: saved.separators, example: saved.example }
  const draftRule: BatchRule = parseBatchRule({ min: Number(f.min), max: Number(f.max), separators: f.separators, example: f.example })
  const testValue = normalizeBatchNumber(test)
  const dirty = form !== null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErrors({})
    try {
      const r = await fetch('/api/vaccination/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_number_format: { min: Number(f.min), max: Number(f.max), separators: f.separators, example: f.example } }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErrors(d.fieldErrors ?? {}); throw new Error(d.error || 'Unable to save.') }
      toast.success('Batch number format saved. Forms and APIs use it from now on.')
      setForm(null); void mutate()
    } catch (err) { toast.error(`${err instanceof Error ? err.message : 'Unable to save.'} The previous format still applies.`) }
    finally { setSaving(false) }
  }

  return (
    <section className="rounded-2xl border border-brand-line bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-brand-navy"><Hash size={18} aria-hidden="true" /> Batch number format</h2>
      <p className="mt-0.5 text-sm text-brand-muted">One format for vaccines, supplements and stock. Entries are trimmed, uppercased and spaces become dashes. Current: {describeBatchRule(saved)}</p>
      <form onSubmit={save} noValidate className="mt-4 space-y-4">
        <fieldset disabled={!canManage || saving} className="grid gap-4 sm:grid-cols-3">
          <Field label="Shortest length" required error={errors.min}>
            <Input type="number" min={1} max={60} value={f.min} onChange={(e) => setForm({ ...f, min: e.target.value })} />
          </Field>
          <Field label="Longest length" required error={errors.max}>
            <Input type="number" min={1} max={60} value={f.max} onChange={(e) => setForm({ ...f, max: e.target.value })} />
          </Field>
          <Field label="Example" required error={errors.example} hint="Shown as the placeholder and in messages.">
            <Input value={f.example} onChange={(e) => setForm({ ...f, example: e.target.value })} className="uppercase" />
          </Field>
          <fieldset className="sm:col-span-3">
            <legend className="text-sm font-semibold text-brand-navy">Allowed between letter/number groups</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {BATCH_SEPARATOR_CHOICES.map((c) => (
                <Checkbox key={c} label={c === '-' ? 'Dash (-)' : c === '/' ? 'Slash (/)' : 'Dot (.)'} checked={f.separators.includes(c)}
                  onChange={(e) => setForm({ ...f, separators: e.target.checked ? f.separators + c : f.separators.replace(c, '') })} />
              ))}
            </div>
            {errors.separators && <p className="mt-1 text-xs font-medium text-danger">{errors.separators}</p>}
          </fieldset>
        </fieldset>
        <Field label="Try a batch number" hint={testValue ? (batchPattern(draftRule).test(testValue) ? `${testValue} matches this format.` : `${testValue} does not match this format.`) : 'Type one to check it against the format above.'}>
          <Input value={test} onChange={(e) => setTest(e.target.value)} placeholder={draftRule.example} />
        </Field>
        {canManage ? (
          <div className="flex justify-end gap-2">
            {dirty && <Button variant="secondary" onClick={() => { setForm(null); setErrors({}) }}>Reset</Button>}
            <Button type="submit" loading={saving} disabled={!dirty}>Save format</Button>
          </div>
        ) : <p className="text-xs text-brand-muted">Only Administrators and PHNs can change the format.</p>}
      </form>
    </section>
  )
}
