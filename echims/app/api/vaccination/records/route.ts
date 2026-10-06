import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// NIP-USR002 — Vaccination records backend.
// GET /api/vaccination/records?q=juan
//
// Returns actual vaccination_record rows (shots that were administered), with child
// and vaccine joined. RLS on vaccination_record scopes rows to the signed-in user's
// barangay/RHU — Admin sees all, PHN sees their RHU, BHW/RHM/BNS see their barangay.
// Empty table → empty state in the UI, which is correct until shots start being logged.

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator', admin: 'Administrator',
  'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any): Promise<UserRole | undefined> {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle()
  return roleAliases[String(data?.role ?? '').trim().toLowerCase()]
}

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in to view vaccination records.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination', 'view')) {
    return invalid('You are not authorized to view vaccination records.', 403)
  }

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim() ?? ''

  // vaccine_id FKs to item; item has vaccine_type, dose_volume, route, target_age.
  const { data, error } = await supabase.from('vaccination_record')
    .select(`
      vaccination_record_id, vaccination_date, dose_number, batch_number,
      vaccination_site, remarks, created_at, schedule_id,
      child:child(child_id, first_name, middle_name, last_name, date_of_birth),
      vaccine:vaccine(vaccine_id, vaccine_type, dose_volume, route, target_age,
        item:item(item_id, item_name))
    `)
    .order('vaccination_date', { ascending: false })
    .limit(200)

  if (error) return invalid('Unable to load vaccination records.', 500)

  const rows = (data ?? []).filter((row) => {
    if (!q) return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = Array.isArray(row.child) ? row.child[0] : row.child
    if (!c) return false
    const name = `${c.first_name ?? ''} ${c.middle_name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
    return name.includes(q.toLowerCase())
  })

  const canCreate = canPerform(role, 'Vaccination', 'create')
  const canExport = canPerform(role, 'Vaccination', 'export')

  return NextResponse.json({
    rows,
    can_create: canCreate,
    can_export: canExport,
    role,
  })
}