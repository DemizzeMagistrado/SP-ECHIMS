import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

// POST /api/children/[childId]/movement
// Changes a child's record status (ACTIVE / INACTIVE / MOVED / LOST / DECEASED) and,
// where applicable, logs the event into child_movement so there's a full audit trail
// of why the child left / returned to active monitoring.
//
// Status → movement_type mapping:
//   MOVED     → MIGRATED  (child relocated outside the catchment),
//               or TRANSFERRED if a target household in the system is provided
//   LOST      → LOST      (whereabouts unknown; lost to follow-up)
//   DECEASED  → no movement row (DECEASED is terminal and not a movement — recorded on child.status only)
//   INACTIVE  → no movement row (reason-only status change; stays on child.status)
//   ACTIVE    → RETURNED  (child came back after a prior MOVED/LOST/INACTIVE spell)
//
// GET /api/children/[childId]/movement
// Returns the movement history for the child, newest first, for the profile page.

const roleAliases: Record<string, UserRole> = { administrator: 'Administrator', admin: 'Administrator', 'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse', 'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker', 'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife', 'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any) {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle()
  return roleAliases[String(data?.role ?? '').trim().toLowerCase()]
}

function invalid(message: string, status = 400) { return NextResponse.json({ error: message }, { status }) }

function parseChildId(value: string | undefined) {
  const n = Number(String(value ?? '').replace(/^CH-/i, ''))
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

const ALLOWED_STATUSES = ['ACTIVE', 'INACTIVE', 'MOVED', 'LOST', 'DECEASED'] as const
type ChildStatus = typeof ALLOWED_STATUSES[number]

// Decide which (if any) child_movement.movement_type to record for the new status.
// Returns null when the status change should only update child.status, not log a movement row.
function movementTypeFor(newStatus: ChildStatus, previousStatus: string | null | undefined, hasTargetHousehold: boolean): string | null {
  if (newStatus === 'DECEASED' || newStatus === 'INACTIVE') return null
  if (newStatus === 'MOVED') return hasTargetHousehold ? 'TRANSFERRED' : 'MIGRATED'
  if (newStatus === 'LOST') return 'LOST'
  if (newStatus === 'ACTIVE' && previousStatus && previousStatus !== 'ACTIVE') return 'RETURNED'
  return null
}

export async function GET(_request: Request, { params }: { params: Promise<{ childId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before accessing child records.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Child Profiling', 'view')) return invalid('You are not authorized to view movement history.', 403)
  const { childId: childIdParam } = await params
  const childId = parseChildId(childIdParam)
  if (!childId) return invalid('A valid child is required.')
  const { data, error } = await supabase
    .from('child_movement')
    .select('movement_id, movement_type, movement_date, reason, status, previous_address, new_address, remarks, recorded_at, from_household_id, to_household_id')
    .eq('child_id', childId)
    .order('movement_date', { ascending: false })
    .order('recorded_at', { ascending: false })
  if (error) return invalid('Unable to load movement history.', 500)
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request, { params }: { params: Promise<{ childId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in before changing a child\'s status.', 401)
  const role = await trustedRole(supabase)
  // Same permission bar as editing — anyone who can edit a child record can change its status.
  if (!role || !canPerform(role, 'Child Profiling', 'edit')) return invalid('You are not authorized to change child status.', 403)

  const { childId: childIdParam } = await params
  const childId = parseChildId(childIdParam)
  if (!childId) return invalid('A valid child is required.')

  const body = await request.json().catch(() => null) as {
    new_status?: string
    reason?: string
    remarks?: string
    movement_date?: string
    new_address?: string
    to_household_id?: number | string | null
  } | null
  const newStatus = String(body?.new_status ?? '').trim().toUpperCase() as ChildStatus
  if (!ALLOWED_STATUSES.includes(newStatus)) return invalid('Invalid status. Choose ACTIVE, INACTIVE, MOVED, LOST, or DECEASED.')
  const reason = String(body?.reason ?? '').trim()
  // A reason is required for anything that is not just reactivating the child.
  if (newStatus !== 'ACTIVE' && !reason) return invalid('A reason is required when changing status away from ACTIVE.')

  // Fetch the child so we know the previous status + household (for the movement log).
  const existing = await supabase.from('child').select('child_id, status, household_id').eq('child_id', childId).maybeSingle()
  if (existing.error) return invalid('Unable to load the child record.', 500)
  if (!existing.data) return invalid('Child could not be found.', 404)
  if (existing.data.status === newStatus) return invalid(`This child is already marked ${newStatus}.`)

  const toHouseholdId = body?.to_household_id ? Number(body.to_household_id) : null
  if (body?.to_household_id && (!Number.isSafeInteger(toHouseholdId) || !toHouseholdId || toHouseholdId <= 0)) {
    return invalid('Invalid destination household.')
  }
  const movementType = movementTypeFor(newStatus, existing.data.status, Boolean(toHouseholdId))
  const movementDate = body?.movement_date ? String(body.movement_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  const newAddress = String(body?.new_address ?? '').trim() || null
  const remarks = String(body?.remarks ?? '').trim() || null

  // 1. Flip the child's status. Chain .select().maybeSingle() so a silent RLS block
  //    (zero rows affected) is caught here and reported, matching the pattern used in
  //    the main PATCH /api/children endpoint.
  const statusUpdate = await supabase.from('child').update({ status: newStatus }).eq('child_id', childId).select('child_id').maybeSingle()
  if (statusUpdate.error) {
    const code = statusUpdate.error.code
    const message = code === '42501'
      ? 'You are not authorized to change this child\'s status. Your account may not be assigned to the child\'s barangay.'
      : `Unable to update the child's status. [${code ?? 'unknown'}] ${statusUpdate.error.message ?? ''}`.trim()
    return invalid(message, code === '42501' ? 403 : 500)
  }
  if (!statusUpdate.data) return invalid('Status change was not applied. Your account may not be assigned to this child\'s barangay.', 403)

  // 2. Log the movement when it maps to a tracked movement_type. Terminal statuses
  //    (DECEASED/INACTIVE) don't produce a movement row; the reason lives on the status
  //    change only. If the movement insert fails, we still return success for the status
  //    flip but note the audit log did not persist.
  let movementInserted = false
  let movementWarning: string | null = null
  if (movementType) {
    const movementInsert = await supabase.from('child_movement').insert({
      child_id: childId,
      movement_type: movementType,
      movement_date: movementDate,
      reason: reason || null,
      status: newStatus,
      previous_address: null,
      new_address: newAddress,
      from_household_id: existing.data.household_id ?? null,
      to_household_id: toHouseholdId,
      remarks,
    }).select('movement_id').maybeSingle()
    if (movementInsert.error) {
      movementWarning = `Status updated, but movement history could not be logged. [${movementInsert.error.code ?? 'unknown'}] ${movementInsert.error.message ?? ''}`.trim()
    } else {
      movementInserted = Boolean(movementInsert.data)
    }
  }

  return NextResponse.json({ ok: true, new_status: newStatus, movement_logged: movementInserted, movement_type: movementType, warning: movementWarning })
}