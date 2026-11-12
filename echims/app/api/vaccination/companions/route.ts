import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// NIP-REV01 — companion medicines per vaccine (e.g. Paracetamol Drops with Pentavalent).
// GET  /api/vaccination/companions  → vaccines, medicine items and the current links
// POST /api/vaccination/companions  → Admin / PHN: { action: 'save', vaccine_id, item_id, quantity, note, active }
//                                     or { action: 'remove', vaccine_id, item_id }
// The review RPC dispenses active links on approval. RLS (vci_manage) allows Admin / PHN writes.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const id = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null)

async function context() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: json({ error: 'Please sign in.' }, 401) }
  const { data: profile } = await db.rpc('get_my_profile').maybeSingle()
  const role = String((profile as { role?: string } | null)?.role ?? '').trim().toLowerCase()
  return { db, canManage: ['administrator', 'admin', 'phn', 'public health nurse'].includes(role) }
}

export async function GET() {
  const c = await context()
  if ('error' in c) return c.error
  const [vaccines, links, items] = await Promise.all([
    c.db.from('vaccine').select('vaccine_id, vaccine_type, item:item!fk_vaccine_item(item_name, status)').order('vaccine_id'),
    c.db.from('vaccine_companion_item').select('vaccine_id, item_id, quantity, note, active, item:item(item_name, unit, status)'),
    c.db.from('item').select('item_id, item_name, unit').eq('status', 'ACTIVE').order('item_name'),
  ])
  if (vaccines.error || links.error || items.error) return json({ error: 'Unable to load companion medicines.' }, 500)
  // Medicines = active items that are not vaccines (vaccine_id is the vaccine's item_id).
  const vaccineIds = new Set((vaccines.data ?? []).map((v) => v.vaccine_id))
  return json({
    can_manage: c.canManage,
    vaccines: vaccines.data,
    medicines: (items.data ?? []).filter((i) => !vaccineIds.has(i.item_id)),
    links: links.data,
  })
}

export async function POST(request: Request) {
  const c = await context()
  if ('error' in c) return c.error
  if (!c.canManage) return json({ error: 'Only Administrators and PHNs can change companion medicines.' }, 403)
  const b = await request.json().catch(() => null) as Record<string, unknown> | null
  const vaccineId = id(b?.vaccine_id), itemId = id(b?.item_id)
  if (!vaccineId || !itemId) return json({ error: 'Choose a vaccine and a medicine.' }, 400)
  if (b?.action === 'remove') {
    const r = await c.db.from('vaccine_companion_item').delete().eq('vaccine_id', vaccineId).eq('item_id', itemId).select('vaccine_id')
    if (r.error) return json({ error: 'Unable to remove it. Try again.' }, r.error.code === '42501' ? 403 : 500)
    return json({ removed: (r.data ?? []).length })
  }
  if (b?.action !== 'save') return json({ error: 'action must be save or remove.' }, 400)
  const quantity = Number(b.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) return json({ error: 'Enter a quantity more than 0 and up to 100.', fieldErrors: { quantity: 'Enter a quantity more than 0 and up to 100.' } }, 400)
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 200) || null : null
  const r = await c.db.from('vaccine_companion_item')
    .upsert({ vaccine_id: vaccineId, item_id: itemId, quantity, note, active: b.active !== false })
    .select('vaccine_id').maybeSingle()
  if (r.error) {
    if (r.error.code === '23503') return json({ error: 'That vaccine or medicine no longer exists.' }, 400)
    return json({ error: 'Unable to save. Try again.' }, r.error.code === '42501' ? 403 : 500)
  }
  if (!r.data) return json({ error: 'Your account cannot change companion medicines.' }, 403)
  return json({ saved: true })
}
