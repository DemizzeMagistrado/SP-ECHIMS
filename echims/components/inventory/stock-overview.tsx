'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, PackagePlus, Search, X } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { ModuleTabs } from '@/components/dashboard/module-tabs'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/lib/echims-data'

// INV-USR001 — Stock Overview + Record Stock-In.
// What the user sees depends on role: PHN can record stock-in; Administrator,
// RHM, BHW and BNS get a read-only view scoped to what they may see.

type Item = { item_id: number; item_name: string; unit: string; kind: 'Vaccine' | 'Supplement' }
type Barangay = { barangay_id: number; barangay_name: string }
type Batch = { batch_id: number; batch_number: string; expiry_date: string; received_date: string; quantity_on_hand: number }
type StockRow = { inventory_id: number; item_id: number; barangay_id: number; quantity_on_hand: number; updated_at: string; batches: Batch[] }
type Payload = { role: string; canStockIn: boolean; barangays: Barangay[]; items: Item[]; stock: StockRow[] }
type FormState = { item_id: string; barangay_id: string; batch_number: string; quantity: string; received_date: string; expiry_date: string }
type Errors = Partial<Record<keyof FormState, string>>
type Row = Record<string, unknown>

const manilaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
const fmtQty = (n: number) => new Intl.NumberFormat('en-PH').format(n)
const daysUntil = (d: string) => Math.round((Date.parse(`${d}T00:00:00`) - Date.parse(`${manilaToday()}T00:00:00`)) / 86_400_000)

const descriptions: Record<string, string> = {
  'Public Health Nurse': 'Manage vaccine and supplement stock for the barangays in your RHU.',
  Administrator: 'Stock across all barangays. View only.',
  'Rural Health Midwife': 'Stock available in your assigned barangays.',
  'Barangay Health Worker': 'Stock available in your assigned barangay.',
  'Barangay Nutrition Scholar': 'Stock available in your assigned barangay.',
}

// Reads go straight to Supabase (RLS applies); the barangay scope below only
// decides what this role should see. Writes go through the inv_receive_stock
// database function, which enforces PHN-only access and every stock-in rule.
async function loadInventory(role: UserRole, userId: string): Promise<Payload> {
  const db = createClient()
  const empty: Payload = { role, canStockIn: role === 'Public Health Nurse', barangays: [], items: [], stock: [] }

  let barangayQuery = db.from('barangay').select('barangay_id,barangay_name').order('barangay_name')
  if (role === 'Public Health Nurse') {
    const phn = await db.from('public_health_nurse').select('rhu_id').eq('user_id', userId).maybeSingle()
    if (phn.error) throw new Error('Unable to load your RHU assignment.')
    if (phn.data?.rhu_id == null) return empty
    barangayQuery = barangayQuery.eq('rhu_id', phn.data.rhu_id)
  } else if (role !== 'Administrator') {
    const asg = await db.from('health_worker_assignment').select('barangay_id').eq('user_id', userId).eq('status', 'ACTIVE')
    if (asg.error) throw new Error('Unable to load your assignments.')
    const ids = [...new Set((asg.data ?? []).map((r: Row) => Number(r.barangay_id)))]
    if (!ids.length) return empty
    barangayQuery = barangayQuery.in('barangay_id', ids)
  }
  const barangays = await barangayQuery
  if (barangays.error) throw new Error('Unable to load barangays.')
  const barangayIds = (barangays.data ?? []).map((b: Row) => Number(b.barangay_id))

  const [vaccines, supplements] = await Promise.all([
    db.from('vaccine').select('vaccine_id'),
    db.from('supplement').select('supplement_id').not('catalog_code', 'is', null),
  ])
  if (vaccines.error || supplements.error) throw new Error('Unable to load the item catalog.')
  const kind = new Map<number, Item['kind']>()
  for (const v of vaccines.data ?? []) kind.set(Number(v.vaccine_id), 'Vaccine')
  for (const x of supplements.data ?? []) kind.set(Number(x.supplement_id), 'Supplement')

  const itemRows = await db.from('item').select('item_id,item_name,unit').eq('status', 'ACTIVE').in('item_id', [...kind.keys()]).order('item_name')
  if (itemRows.error) throw new Error('Unable to load items.')
  const items: Item[] = (itemRows.data ?? []).map((i: Row) => ({
    item_id: Number(i.item_id), item_name: i.item_name as string, unit: i.unit as string, kind: kind.get(Number(i.item_id))!,
  }))

  let stock: StockRow[] = []
  if (barangayIds.length && items.length) {
    const inv = await db.from('inventory').select('inventory_id,item_id,barangay_id,quantity_on_hand,updated_at')
      .in('barangay_id', barangayIds).in('item_id', items.map((i: Row) => i.item_id))
    if (inv.error) throw new Error('Unable to load stock.')
    const invIds = (inv.data ?? []).map((r: Row) => Number(r.inventory_id))
    const batches = invIds.length
      ? await db.from('inventory_batch').select('batch_id,inventory_id,batch_number,expiry_date,received_date,quantity_on_hand').in('inventory_id', invIds).order('expiry_date')
      : { data: [], error: null }
    if (batches.error) throw new Error('Unable to load batches.')
    stock = (inv.data ?? []).map((r: Row) => ({
      inventory_id: Number(r.inventory_id), item_id: Number(r.item_id), barangay_id: Number(r.barangay_id),
      quantity_on_hand: Number(r.quantity_on_hand), updated_at: r.updated_at as string,
      batches: (batches.data ?? []).filter((b: Row) => Number(b.inventory_id) === Number(r.inventory_id)).map((b: Row) => ({
        batch_id: Number(b.batch_id), batch_number: b.batch_number as string, expiry_date: b.expiry_date as string,
        received_date: b.received_date as string, quantity_on_hand: Number(b.quantity_on_hand),
      })),
    }))
  }

  return {
    role,
    canStockIn: role === 'Public Health Nurse',
    barangays: (barangays.data ?? []).map((b: Row) => ({ barangay_id: Number(b.barangay_id), barangay_name: b.barangay_name as string })),
    items,
    stock,
  }
}

function expiryBadge(batches: Batch[]) {
  const live = batches.filter((b) => b.quantity_on_hand > 0)
  if (!live.length) return null
  const next = live.reduce((a, b) => (a.expiry_date <= b.expiry_date ? a : b))
  const d = daysUntil(next.expiry_date)
  if (d < 0) return { label: 'Expired batch', cls: 'bg-red-50 text-red-700' }
  if (d <= 30) return { label: `Expires in ${d}d`, cls: 'bg-amber-50 text-amber-700' }
  return null
}

export function StockOverview() {
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const [data, setData] = useState<Payload | null>(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'All' | 'Vaccine' | 'Supplement'>('All')
  const [barangayFilter, setBarangayFilter] = useState('all')
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    if (!role || !user) return
    try {
      setData(await loadInventory(role, user.id))
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Unable to load inventory.')
    }
  }, [role, user])

  useEffect(() => { if (isReady && role) void load() }, [isReady, role, load])

  const itemById = useMemo(() => new Map((data?.items ?? []).map((i) => [i.item_id, i])), [data])
  const barangayById = useMemo(() => new Map((data?.barangays ?? []).map((b) => [b.barangay_id, b.barangay_name])), [data])

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.stock
      .filter((r) => itemById.has(r.item_id))
      .filter((r) => kind === 'All' || itemById.get(r.item_id)!.kind === kind)
      .filter((r) => barangayFilter === 'all' || String(r.barangay_id) === barangayFilter)
      .filter((r) => !q || itemById.get(r.item_id)!.item_name.toLowerCase().includes(q))
      .sort((a, b) => itemById.get(a.item_id)!.item_name.localeCompare(itemById.get(b.item_id)!.item_name))
  }, [data, itemById, query, kind, barangayFilter])

  const summary = useMemo(() => {
    const batches = rows.flatMap((r) => r.batches.filter((b) => b.quantity_on_hand > 0))
    return {
      lines: rows.length,
      batches: batches.length,
      expiring: batches.filter((b) => { const d = daysUntil(b.expiry_date); return d >= 0 && d <= 30 }).length,
      expired: batches.filter((b) => daysUntil(b.expiry_date) < 0).length,
    }
  }, [rows])

  if (!isReady || !role) return <section className="rounded-xl border border-[#E5E7EB] bg-white p-10 text-center text-[#6B7280]">Loading workspace...</section>

  const toggle = (id: number) => setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#03045E]">Inventory</h1>
          <p className="mt-1 text-sm text-[#6B7280]">{descriptions[role] ?? 'Review available stock.'}</p>
        </div>
        {data?.canStockIn && (
          <button type="button" onClick={() => { setSuccess(''); setShowForm(true) }}
            className="flex items-center gap-2 rounded-lg bg-[#0077B6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#03045E]">
            <PackagePlus size={17} /> Record stock-in
          </button>
        )}
      </div>

      <ModuleTabs parent="Inventory" role={role} />

      {success && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <p className="flex-1">{success}</p>
          <button type="button" aria-label="Dismiss" onClick={() => setSuccess('')}><X size={16} /></button>
        </div>
      )}
      {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Stock lines', summary.lines],
          ['Active batches', summary.batches],
          ['Expiring within 30 days', summary.expiring],
          ['Expired batches', summary.expired],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-[#6B7280]">{label}</p>
            <p className="mt-1 text-2xl font-bold text-[#03045E]">{data ? value : '–'}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items"
            className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0077B6]" />
        </label>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Item type"
          className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm">
          <option value="All">All items</option><option value="Vaccine">Vaccines</option><option value="Supplement">Supplements</option>
        </select>
        {(data?.barangays.length ?? 0) > 1 && (
          <select value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)} aria-label="Barangay"
            className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm">
            <option value="all">All barangays</option>
            {data!.barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
          </select>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-xs uppercase tracking-wide text-[#6B7280]">
            <tr><th className="w-10 px-3 py-3" /><th className="px-3 py-3">Item</th><th className="px-3 py-3">Barangay</th><th className="px-3 py-3 text-right">On hand</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Updated</th></tr>
          </thead>
          <tbody>
            {!data && !loadError && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#6B7280]">Loading stock...</td></tr>}
            {data && !rows.length && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[#6B7280]">
                No stock recorded yet.{data.canStockIn ? ' Use “Record stock-in” to add the first batch.' : ''}
              </td></tr>
            )}
            {rows.map((r) => {
              const item = itemById.get(r.item_id)!
              const badge = expiryBadge(r.batches)
              const expanded = open.has(r.inventory_id)
              return (
                <Fragment key={r.inventory_id}>
                  <tr className="cursor-pointer border-b border-[#F3F4F6] hover:bg-[#F9FAFB]" onClick={() => toggle(r.inventory_id)}>
                    <td className="px-3 py-3 text-[#6B7280]">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                    <td className="px-3 py-3"><p className="font-semibold text-[#03045E]">{item.item_name}</p><p className="text-xs text-[#6B7280]">{item.kind}</p></td>
                    <td className="px-3 py-3 text-[#374151]">{barangayById.get(r.barangay_id) ?? '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-[#03045E]">{fmtQty(r.quantity_on_hand)} <span className="text-xs font-normal text-[#6B7280]">{item.unit}</span></td>
                    <td className="px-3 py-3">
                      {r.quantity_on_hand <= 0
                        ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Out of stock</span>
                        : badge ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                        : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">In stock</span>}
                    </td>
                    <td className="px-3 py-3 text-[#6B7280]">{fmtDate(r.updated_at.slice(0, 10))}</td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB]">
                      <td />
                      <td colSpan={5} className="px-3 py-3">
                        {r.batches.length ? (
                          <table className="w-full text-xs">
                            <thead className="text-[#6B7280]"><tr><th className="py-1 text-left font-medium">Batch</th><th className="py-1 text-left font-medium">Received</th><th className="py-1 text-left font-medium">Expiry</th><th className="py-1 text-right font-medium">Quantity</th></tr></thead>
                            <tbody>{r.batches.map((b) => (
                              <tr key={b.batch_id} className="text-[#374151]"><td className="py-1 font-medium">{b.batch_number}</td><td className="py-1">{fmtDate(b.received_date)}</td><td className="py-1">{fmtDate(b.expiry_date)}</td><td className="py-1 text-right">{fmtQty(b.quantity_on_hand)}</td></tr>
                            ))}</tbody>
                          </table>
                        ) : <p className="text-xs text-[#6B7280]">No batch details for this stock line.</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {showForm && data && (
        <StockInForm
          items={data.items}
          barangays={data.barangays}
          onClose={() => setShowForm(false)}
          onSaved={async (message) => { setShowForm(false); setSuccess(message); await load() }}
        />
      )}
    </section>
  )
}

function StockInForm({ items, barangays, onClose, onSaved }: {
  items: Item[]; barangays: Barangay[]; onClose: () => void; onSaved: (message: string) => Promise<void>
}) {
  const [form, setForm] = useState<FormState>({
    item_id: '', barangay_id: barangays.length === 1 ? String(barangays[0].barangay_id) : '',
    batch_number: '', quantity: '', received_date: manilaToday(), expiry_date: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  // One id per form session so a double-click or retry can't double-receive.
  const [requestId] = useState(() => crypto.randomUUID())

  const today = manilaToday()
  const selected = items.find((i) => String(i.item_id) === form.item_id)
  const set = (k: keyof FormState, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }

  function validate(): Errors {
    const e: Errors = {}
    const qty = Number(form.quantity)
    if (!form.item_id) e.item_id = 'Select an item.'
    if (!form.barangay_id) e.barangay_id = 'Select a barangay.'
    if (!form.batch_number.trim()) e.batch_number = 'Batch number is required.'
    if (!form.quantity.trim() || !Number.isFinite(qty) || qty <= 0) e.quantity = 'Enter a quantity greater than 0.'
    else if (qty > 1_000_000) e.quantity = 'Quantity cannot exceed 1,000,000.'
    if (!form.received_date) e.received_date = 'Received date is required.'
    else if (form.received_date > today) e.received_date = 'Received date cannot be in the future.'
    if (!form.expiry_date) e.expiry_date = 'Expiry date is required.'
    else if (form.expiry_date <= today) e.expiry_date = 'This batch is already expired.'
    else if (form.received_date && form.expiry_date < form.received_date) e.expiry_date = 'Expiry cannot be before the received date.'
    return e
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (saving) return
    setFormError('')
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const { data: r, error } = await createClient().rpc('inv_receive_stock', {
        p_item_id: Number(form.item_id),
        p_barangay_id: Number(form.barangay_id),
        p_batch_number: form.batch_number.trim(),
        p_expiry_date: form.expiry_date,
        p_received_date: form.received_date,
        p_quantity: Number(form.quantity),
        p_request_id: requestId,
      })
      if (error) {
        // 42501 = not a PHN for this barangay; 22023/P0002/23505 = rule violations with a clear message.
        const known = ['42501', '22023', 'P0002', '23505'].includes(error.code)
        setFormError(known ? error.message : 'Unable to save stock-in. Please try again.')
        return
      }
      await onSaved(`Recorded ${fmtQty(Number(form.quantity))} ${selected?.unit ?? ''} of ${selected?.item_name} (batch ${r.batch_number}). Quantity on hand is now ${fmtQty(r.quantity_on_hand)}.`)
    } catch {
      setFormError('Network error. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0077B6]'
  const border = (k: keyof FormState) => (errors[k] ? 'border-red-400' : 'border-[#E5E7EB]')
  const Err = ({ k }: { k: keyof FormState }) => (errors[k] ? <p className="mt-1 text-xs text-red-600">{errors[k]}</p> : null)
  const vaccines = items.filter((i) => i.kind === 'Vaccine')
  const supplements = items.filter((i) => i.kind === 'Supplement')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="stock-in-title">
      <form onSubmit={submit} noValidate className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id="stock-in-title" className="text-xl font-bold text-[#03045E]">Record stock-in</h2>
            <p className="mt-1 text-sm text-[#6B7280]">Log stock received. Quantity on hand updates when saved.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#6B7280] hover:text-[#03045E]"><X size={20} /></button>
        </div>

        {formError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-[#374151]">Item</span>
            <select value={form.item_id} onChange={(e) => set('item_id', e.target.value)} className={`${field} ${border('item_id')}`}>
              <option value="">Select vaccine or supplement</option>
              {vaccines.length > 0 && <optgroup label="Vaccines">{vaccines.map((i) => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}</optgroup>}
              {supplements.length > 0 && <optgroup label="Supplements">{supplements.map((i) => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}</optgroup>}
            </select>
            <Err k="item_id" />
          </label>

          {barangays.length !== 1 && (
            <label className="sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-[#374151]">Barangay</span>
              <select value={form.barangay_id} onChange={(e) => set('barangay_id', e.target.value)} className={`${field} ${border('barangay_id')}`}>
                <option value="">Select barangay</option>
                {barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
              </select>
              <Err k="barangay_id" />
            </label>
          )}

          <label>
            <span className="mb-1 block text-sm font-medium text-[#374151]">Batch number</span>
            <input value={form.batch_number} onChange={(e) => set('batch_number', e.target.value)} maxLength={60} autoComplete="off" className={`${field} ${border('batch_number')}`} />
            <Err k="batch_number" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-[#374151]">Quantity{selected ? ` (${selected.unit})` : ''}</span>
            <input type="number" inputMode="decimal" min="0" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className={`${field} ${border('quantity')}`} />
            <Err k="quantity" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-[#374151]">Received date</span>
            <input type="date" max={today} value={form.received_date} onChange={(e) => set('received_date', e.target.value)} className={`${field} ${border('received_date')}`} />
            <Err k="received_date" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-[#374151]">Expiry date</span>
            <input type="date" min={today} value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className={`${field} ${border('expiry_date')}`} />
            <Err k="expiry_date" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#E5E7EB] px-4 py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#F9FAFB]">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-[#0077B6] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#03045E] disabled:opacity-60">
            {saving ? 'Saving...' : 'Save stock-in'}
          </button>
        </div>
      </form>
    </div>
  )
}
