import { NextResponse } from 'next/server'
import { masterlistAccess } from '@/lib/masterlist-access'
import { normalizePhMobile } from '@/lib/phone'

export async function PATCH(request: Request) {
  const access = await masterlistAccess()
  if (access.error) return access.error
  const body = await request.json().catch(() => null)
  const id = Number(body?.childId)
  const section = body?.section
  const details = body?.details
  if (!Number.isSafeInteger(id) || id <= 0 || !body?.expected || !details || typeof details !== 'object'
    || !['guardian', 'household'].includes(section) || !Object.values(details).every(value => typeof value === 'string' && value.length <= 500)) {
    return NextResponse.json({ error: 'Check the edited profile details.' }, { status: 400 })
  }
  if (section === 'guardian' && details.contact_number?.trim()) {
    const mobile = normalizePhMobile(details.contact_number)
    if (!mobile) return NextResponse.json({ error: 'Enter a valid Philippine mobile number or leave it blank.' }, { status: 400 })
    details.contact_number = mobile
  }
  const { error } = await access.supabase.rpc('mlu_update_profile_section', {
    p_child_id: id, p_section: section, p_expected: body.expected, p_details: details,
  })
  if (!error) return NextResponse.json({ ok: true })
  const status = error.code === '42501' ? 403 : error.code === '40001' ? 409 : error.code === '22023' ? 400 : 500
  return NextResponse.json({ error: status === 500 ? 'Could not save these details. Check the fields and try again.' : error.message }, { status })
}
