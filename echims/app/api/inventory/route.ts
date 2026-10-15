import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// INV-USR001 — Inventory read + Record Stock-In.
// GET  /api/inventory  -> role-scoped stock (items, barangays, batches)
// POST /api/inventory  -> record stock-in (PHN only, calls inv_receive_stock)
// Business rules live in the DB function; this route only authenticates,
// restricts the role, and shapes errors for the UI.

type Role = 'Administrator' | 'Public Health Nurse' | 'Rural Health Midwife' | 'Barangay Health Worker' | 'Barangay Nutrition Scholar'

const roleAliases: Record<string, Role> = {
  administrator: 'Administrator',
  'public health nurse': 'Public Health Nurse',
  'rural health midwife': 'Rural Health Midwife',
  'barangay health worker': 'Barangay Health Worker',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar',
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN)
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

async function authenticate() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: json({ error: 'Please sign in.' }, 401) }
  const account = await db.from('users').select('account_status').eq('user_id', user.id).maybeSingle()
  if (account.error) return { error: json({ error: 'Unable to verify your account.' }, 500) }
  if (account.data?.account_status !== 'ACTIVE') return { error: json({ error: 'An active account is required.' }, 403) }
  const profile = await db.rpc('get_my_profile').maybeSingle()
  const role = roleAliases[String((profile.data as { role?: string } | null)?.role ?? '').trim().toLowerCase()]
  if (!role) return { error: json({ error: 'You cannot access inventory.' }, 403) }
  return { db, user, role }
}

export async function GET() {
  const a = await authenticate()
  if ('error' in a) return a.error
  const { db, user, role } = a

  // Barangay scope: Admin = all, PHN = their RHU, everyone else = assignments.
  let barangayQuery = db.from('barangay').select('barangay_id,barangay_name').order('barangay_name')
  if (role === 'Public Health Nurse') {
    const phn = await db.from('public_health_nurse').select('rhu_id').eq('user_id', user.id).maybeSingle()
    if (phn.error) return json({ error: 'Unable to load your RHU assignment.' }, 500)
    if (phn.data?.rhu_id == null) return json({ role, canStockIn: true, barangays: [], items: [], stock: [] })
    barangayQuery = barangayQuery.eq('rhu_id', phn.data.rhu_id)
  } else if (role !== 'Administrator') {
    const asg = await db.from('health_worker_assignment').select('barangay_id').eq('user_id', user.id).eq('status', 'ACTIVE')
    if (asg.error) return json({ error: 'Unable to load your assignments.' }, 500)
    const ids = [...new Set((asg.data ?? []).map((r) => Number(r.barangay_id)))]
    if (!ids.length) return json({ role, canStockIn: false, barangays: [], items: [], stock: [] })
    barangayQuery = barangayQuery.in('barangay_id', ids)
  }
  const barangays = await barangayQuery
  if (barangays.error) return json({ error: 'Unable to load barangays.' }, 500)
  const barangayIds = (barangays.data ?? []).map((b) => Number(b.barangay_id))

  const [vaccines, supplements] = await Promise.all([
    db.from('vaccine').select('vaccine_id'),
    db.from('supplement').select('supplement_id').not('catalog_code', 'is', null),
  ])
  if (vaccines.error || supplements.error) return json({ error: 'Unable to load item catalog.' }, 500)
  const kind = new Map<number, 'Vaccine' | 'Supplement'>()
  for (const v of vaccines.data ?? []) kind.set(Number(v.vaccine_id), 'Vaccine')
  for (const s of supplements.data ?? []) kind.set(Number(s.supplement_id), 'Supplement')

  const itemRows = await db.from('item').select('item_id,item_name,unit,status').eq('status', 'ACTIVE').in('item_id', [...kind.keys()]).order('item_name')
  if (itemRows.error) return json({ error: 'Unable to load items.' }, 500)
  const items = (itemRows.data ?? []).map((i) => ({
    item_id: Number(i.item_id), item_name: i.item_name as string, unit: i.unit as string, kind: kind.get(Number(i.item_id))!,
  }))

  const stockRows = barangayIds.length
    ? await db.from('inventory').select('inventory_id,item_id,barangay_id,quantity_on_hand,updated_at').in('barangay_id', barangayIds).in('item_id', items.map((i) => i.item_id))
    : { data: [], error: null }
  if (stockRows.error) return json({ error: 'Unable to load stock.' }, 500)
  const inventoryIds = (stockRows.data ?? []).map((r) => Number(r.inventory_id))
  const batchRows = inventoryIds.length
    ? await db.from('inventory_batch').select('batch_id,inventory_id,batch_number,expiry_date,received_date,quantity_on_hand').in('inventory_id', inventoryIds).order('expiry_date')
    : { data: [], error: null }
  if (batchRows.error) return json({ error: 'Unable to load batches.' }, 500)

  const stock = (stockRows.data ?? []).map((r) => ({
    inventory_id: Number(r.inventory_id),
    item_id: Number(r.item_id),
    barangay_id: Number(r.barangay_id),
    quantity_on_hand: Number(r.quantity_on_hand),
    updated_at: r.updated_at as string,
    batches: (batchRows.data ?? [])
      .filter((b) => Number(b.inventory_id) === Number(r.inventory_id))
      .map((b) => ({
        batch_id: Number(b.batch_id), batch_number: b.batch_number as string, expiry_date: b.expiry_date as string,
        received_date: b.received_date as string, quantity_on_hand: Number(b.quantity_on_hand),
      })),
  }))

  return json({
    role,
    canStockIn: role === 'Public Health Nurse',
    barangays: (barangays.data ?? []).map((b) => ({ barangay_id: Number(b.barangay_id), barangay_name: b.barangay_name as string })),
    items,
    stock,
  })
}

type StockInBody = {
  item_id?: unknown; barangay_id?: unknown; batch_number?: unknown
  quantity?: unknown; expiry_date?: unknown; received_date?: unknown; request_id?: unknown
}

export async function POST(request: Request) {
  const a = await authenticate()
  if ('error' in a) return a.error
  const { db, role } = a
  if (role !== 'Public Health Nurse') {
    return json({ error: 'Only Public Health Nurses can record stock-in.' }, 403)
  }

  const body = (await request.json().catch(() => null)) as StockInBody | null
  if (!body) return json({ error: 'Invalid request.' }, 400)

  const itemId = num(body.item_id)
  const barangayId = num(body.barangay_id)
  const batchNumber = text(body.batch_number)
  const quantity = num(body.quantity)
  const expiry = text(body.expiry_date)
  const received = text(body.received_date)
  const requestId = text(body.request_id)

  const fieldErrors: Record<string, string> = {}
  if (!Number.isSafeInteger(itemId) || itemId <= 0) fieldErrors.item_id = 'Select an item.'
  if (!Number.isSafeInteger(barangayId) || barangayId <= 0) fieldErrors.barangay_id = 'Select a barangay.'
  if (!batchNumber) fieldErrors.batch_number = 'Batch number is required.'
  if (!Number.isFinite(quantity) || quantity <= 0) fieldErrors.quantity = 'Enter a quantity greater than 0.'
  else if (quantity > 1_000_000) fieldErrors.quantity = 'Quantity cannot exceed 1,000,000.'
  if (!isDate(received)) fieldErrors.received_date = 'Received date is required.'
  if (!isDate(expiry)) fieldErrors.expiry_date = 'Expiry date is required.'
  if (!isUuid(requestId)) return json({ error: 'Missing request id. Please try again.' }, 400)
  if (Object.keys(fieldErrors).length) return json({ error: 'Please fix the highlighted fields.', fieldErrors }, 400)

  const { data, error } = await db.rpc('inv_receive_stock', {
    p_item_id: itemId,
    p_barangay_id: barangayId,
    p_batch_number: batchNumber,
    p_expiry_date: expiry,
    p_received_date: received,
    p_quantity: quantity,
    p_request_id: requestId,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '23505' ? 409 : error.code === '22023' || error.code === 'P0002' ? 422 : 500
    return json({ error: status === 500 ? 'Unable to save stock-in. Please try again.' : error.message }, status)
  }
  return json({ ok: true, result: data }, 201)
}
