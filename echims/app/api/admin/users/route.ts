// echims/app/api/admin/users/route.ts
// Admin + PHN user administration endpoint.
//
// PATCH:
//   { userId, accountStatus }                → change account_status (Admin only, workplace validated)
//   { userId, profile: {...} }               → edit full_name / email / contact_number (Admin or PHN)
// DELETE:
//   { userId }                               → soft-delete (set account_status='DELETED', requires INACTIVE)
//                                              Admin or PHN. Can't delete self. Can't delete the last Admin.
// GET:
//   ?includeDeleted=1                        → include soft-deleted users
//
// NOTE: hard delete is intentionally NOT exposed — too many FKs reference users.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthorizationContext } from '@/lib/auth/authorization'

const ALLOWED_STATUSES = ['ACTIVE','INACTIVE','SUSPENDED'] as const
type AccountStatus = typeof ALLOWED_STATUSES[number]

type Ctx = NonNullable<Awaited<ReturnType<typeof getAuthorizationContext>>>

// Role gate helper — Admin always allowed; PHN allowed for the actions
// this file enables (profile edit, soft-delete).
async function allowAdminOrPhn(context: Ctx) {
  if (context.role === 'Administrator') return { role: 'Administrator' as const }
  if (context.role === 'PHN') return { role: 'PHN' as const }
  return null
}

// Fetch the target user's role + basic info (used by every write path).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTarget(supabase: any, userId: string) {
  const { data: target } = await supabase
    .from('users')
    .select('user_id, full_name, email, contact_number, account_status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!target) return null
  const [{ data: isAdmin }, { data: isPhn }] = await Promise.all([
    supabase.from('administrator').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('public_health_nurse').select('user_id, rhu_id').eq('user_id', userId).maybeSingle(),
  ])
  return { target, isAdmin: !!isAdmin, isPhn: !!isPhn }
}

/* ------------------------- PATCH ------------------------- */

export async function PATCH(request: Request) {
  try {
    const context = await getAuthorizationContext()
    if (!context) return NextResponse.json({ error: 'Your account is not authorized.' }, { status: 401 })

    const allow = await allowAdminOrPhn(context)
    if (!allow) return NextResponse.json({ error: 'Administrator or PHN permission is required.' }, { status: 403 })

    let payload: unknown
    try { payload = await request.json() } catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }) }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

    const body = payload as Record<string, unknown>
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: 'A valid user ID is required.' }, { status: 400 })
    }

    const supabase = await createClient()
    const info = await fetchTarget(supabase, userId)
    if (!info) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

    // ─────────── PROFILE EDIT branch ───────────
    if (body.profile && typeof body.profile === 'object') {
      const profile = body.profile as Record<string, unknown>

      // PHN can't edit an Administrator's profile
      if (allow.role === 'PHN' && info.isAdmin) {
        return NextResponse.json({ error: 'PHNs cannot edit Administrator accounts.' }, { status: 403 })
      }

      const updates: Record<string, string> = {}

      if ('fullName' in profile) {
        const v = String(profile.fullName ?? '').trim()
        if (!v || v.length < 2) return NextResponse.json({ error: 'Full name must be at least 2 characters.' }, { status: 400 })
        if (v.length > 120) return NextResponse.json({ error: 'Full name is too long.' }, { status: 400 })
        updates.full_name = v
      }
      if ('contactNumber' in profile) {
        const v = String(profile.contactNumber ?? '').trim()
        if (v && !/^[0-9+\-\s()]{7,20}$/.test(v)) return NextResponse.json({ error: 'Contact number must be 7–20 digits.' }, { status: 400 })
        updates.contact_number = v
      }
      if ('email' in profile) {
        const v = String(profile.email ?? '').trim().toLowerCase()
        if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return NextResponse.json({ error: 'Email must be a valid address.' }, { status: 400 })
        if (v.length > 254) return NextResponse.json({ error: 'Email is too long.' }, { status: 400 })
        updates.email = v
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No profile fields provided.' }, { status: 400 })
      }

      const { error } = await supabase.from('users').update(updates).eq('user_id', userId)
      if (error) return NextResponse.json({ error: 'Unable to save profile changes.' }, { status: 500 })
      return NextResponse.json({ success: true, userId, updated: Object.keys(updates) })
    }

    // ─────────── STATUS CHANGE branch (Admin only, with workplace rules) ───────────
    if (body.accountStatus !== undefined) {
      if (allow.role !== 'Administrator') {
        return NextResponse.json({ error: 'Only Administrators can change account status.' }, { status: 403 })
      }
      const accountStatus = String(body.accountStatus ?? '').trim().toUpperCase()
      if (!ALLOWED_STATUSES.includes(accountStatus as AccountStatus)) {
        return NextResponse.json({ error: 'Invalid account status.' }, { status: 400 })
      }
      if (userId === context.authUser.id) {
        return NextResponse.json({ error: 'You cannot change your own account status.' }, { status: 400 })
      }

      // Workplace validation for activation (preserved from original implementation)
      if (accountStatus === 'ACTIVE') {
        if (info.isAdmin) {
          // no workplace required
        } else if (info.isPhn) {
          const { data: phn } = await supabase.from('public_health_nurse').select('rhu_id').eq('user_id', userId).maybeSingle()
          if (!phn?.rhu_id) return NextResponse.json({ error: 'This Public Health Nurse has no RHU assignment. Assign an available RHU before activating.' }, { status: 400 })
          const { data: otherPhn } = await supabase.from('public_health_nurse').select('user_id').eq('rhu_id', phn.rhu_id).neq('user_id', userId).limit(1)
          if (otherPhn && otherPhn.length > 0) return NextResponse.json({ error: 'This RHU already has an assigned PHN.' }, { status: 409 })
          const { data: rhu } = await supabase.from('rhu').select('account_status').eq('rhu_id', phn.rhu_id).maybeSingle()
          if (!rhu) return NextResponse.json({ error: 'The assigned RHU no longer exists.' }, { status: 400 })
          if (rhu.account_status !== 'ACTIVE') return NextResponse.json({ error: 'The assigned RHU is not active.' }, { status: 400 })
        } else {
          const { data: existing } = await supabase.from('health_worker_assignment').select('assignment_id').eq('user_id', userId)
          if (!existing || existing.length === 0) return NextResponse.json({ error: 'This health worker does not have a workplace assignment.' }, { status: 400 })
        }
      }

      const { error: upErr } = await supabase.from('users').update({ account_status: accountStatus as AccountStatus }).eq('user_id', userId)
      if (upErr) return NextResponse.json({ error: 'Unable to update account status.' }, { status: 500 })

      // Sync RHM/BHW/BNS assignments
      if (!info.isAdmin && !info.isPhn && (accountStatus === 'ACTIVE' || accountStatus === 'INACTIVE')) {
        await supabase.from('health_worker_assignment')
          .update({ status: accountStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE' })
          .eq('user_id', userId)
          .in('status', ['PENDING','ACTIVE','INACTIVE'])
      }

      return NextResponse.json({ success: true, userId, accountStatus })
    }

    return NextResponse.json({ error: 'Nothing to update. Provide `accountStatus` or `profile`.' }, { status: 400 })
  } catch (error) {
    console.error('USER MANAGEMENT PATCH ERROR:', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}

/* ------------------------- DELETE (soft) ------------------------- */

export async function DELETE(request: Request) {
  try {
    const context = await getAuthorizationContext()
    if (!context) return NextResponse.json({ error: 'Your account is not authorized.' }, { status: 401 })

    const allow = await allowAdminOrPhn(context)
    if (!allow) return NextResponse.json({ error: 'Administrator or PHN permission is required.' }, { status: 403 })

    let payload: unknown
    try { payload = await request.json() } catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }) }
    const body = (payload ?? {}) as Record<string, unknown>
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: 'A valid user ID is required.' }, { status: 400 })
    }
    if (userId === context.authUser.id) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
    }

    const supabase = await createClient()
    const info = await fetchTarget(supabase, userId)
    if (!info) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

    // Must currently be INACTIVE
    if (info.target.account_status !== 'INACTIVE') {
      return NextResponse.json({ error: 'Only INACTIVE accounts can be deleted. Deactivate first.' }, { status: 400 })
    }

    // PHN can't delete Admin
    if (allow.role === 'PHN' && info.isAdmin) {
      return NextResponse.json({ error: 'PHNs cannot delete Administrator accounts.' }, { status: 403 })
    }

    // Last-Admin guard: never leave the system without a working Admin.
    if (info.isAdmin) {
      const { data: otherAdmins } = await supabase
        .from('administrator')
        .select('user_id, users:user_id(account_status)')
        .neq('user_id', userId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeOthers = (otherAdmins ?? []).filter((row: any) => {
        const u = Array.isArray(row.users) ? row.users[0] : row.users
        return u?.account_status === 'ACTIVE'
      })
      if (activeOthers.length === 0) {
        return NextResponse.json({ error: 'Cannot delete the last active Administrator.' }, { status: 400 })
      }
    }

    const { error } = await supabase.from('users').update({ account_status: 'DELETED' }).eq('user_id', userId)
    if (error) return NextResponse.json({ error: 'Unable to delete the account.' }, { status: 500 })

    return NextResponse.json({ success: true, userId, accountStatus: 'DELETED' })
  } catch (error) {
    console.error('USER MANAGEMENT DELETE ERROR:', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}