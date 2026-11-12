import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadBatchRule } from '@/lib/batch-rule-server'
import { BATCH_SEPARATOR_CHOICES, batchPattern, normalizeBatchNumber, type BatchRule } from '@/lib/vaccination-config'

// NIP-REV01 — vaccination settings (Vaccination › Vaccines (Catalog settings)).
// GET  /api/vaccination/settings  → { batch_number_format } for any signed-in user (forms use it)
// POST /api/vaccination/settings  → Admin / PHN save { batch_number_format: { min, max, separators, example } }
// RLS on vaccination_setting allows writes for Admin and PHN only.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function GET() {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Please sign in.' }, 401)
  return json({ batch_number_format: await loadBatchRule(db) })
}

export async function POST(request: Request) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Please sign in.' }, 401)
  const { data: profile } = await db.rpc('get_my_profile').maybeSingle()
  const role = String((profile as { role?: string } | null)?.role ?? '').trim().toLowerCase()
  if (!['administrator', 'admin', 'phn', 'public health nurse'].includes(role)) return json({ error: 'Only Administrators and PHNs can change vaccination settings.' }, 403)

  const body = await request.json().catch(() => null) as { batch_number_format?: Partial<BatchRule> } | null
  const f = body?.batch_number_format
  const min = Number(f?.min), max = Number(f?.max)
  const separators = typeof f?.separators === 'string' ? f.separators : ''
  const example = normalizeBatchNumber(typeof f?.example === 'string' ? f.example : '') ?? ''
  const errors: Record<string, string> = {}
  if (!Number.isInteger(min) || min < 1 || min > 60) errors.min = 'Enter a whole number from 1 to 60.'
  if (!Number.isInteger(max) || max < 1 || max > 60) errors.max = 'Enter a whole number from 1 to 60.'
  else if (Number.isInteger(min) && min > max) errors.max = 'Must be at least the minimum length.'
  if ([...separators].some((c) => !(BATCH_SEPARATOR_CHOICES as readonly string[]).includes(c))) errors.separators = 'Choose from dash, slash and dot.'
  const rule: BatchRule = { min, max, separators: [...new Set(separators)].join(''), example }
  if (!example) errors.example = 'Enter an example batch number.'
  else if (!errors.min && !errors.max && !errors.separators && !batchPattern(rule).test(example)) errors.example = 'The example does not match this format.'
  if (Object.keys(errors).length) return json({ error: 'Check the highlighted fields.', fieldErrors: errors }, 400)

  const saved = await db.from('vaccination_setting')
    .upsert({ key: 'batch_number_format', value: rule, updated_by: user.id, updated_at: new Date().toISOString() })
    .select('value').maybeSingle()
  if (saved.error || !saved.data) {
    if (saved.error?.code === '42501') return json({ error: 'Your account cannot change vaccination settings.' }, 403)
    console.error('Vaccination settings:', saved.error)
    return json({ error: 'Unable to save the batch number format. Try again.' }, 500)
  }
  return json({ batch_number_format: rule })
}
