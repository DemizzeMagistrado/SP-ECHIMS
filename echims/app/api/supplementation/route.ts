import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Role = 'Administrator' | 'PHN' | 'RHM' | 'BHW' | 'BNS'

const aliases: Record<string, Role> = {
  admin: 'Administrator',
  administrator: 'Administrator',
  phn: 'PHN',
  'public health nurse': 'PHN',
  rhm: 'RHM',
  'rural health midwife': 'RHM',
  bhw: 'BHW',
  'barangay health worker': 'BHW',
  bns: 'BNS',
  'barangay nutrition scholar': 'BNS',
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })

function id(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (!/^\d+$/.test(String(value))) return null
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const d = new Date(value + 'T00:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function positive(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null
  }
  if (!/^\d+(?:\.\d+)?$/.test(String(value))) {
    return null
  }
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function auth() {
  const db = await createClient()
  const {
    data: { user },
    error,
  } = await db.auth.getUser()
  if (error || !user)
    return { response: json({ error: 'Please sign in.' }, 401) }
  const [profile, account] = await Promise.all([
    db.rpc('get_my_profile').maybeSingle(),
    db
      .from('users')
      .select('account_status')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])
  if (profile.error || account.error)
    return { response: json({ error: 'Unable to verify permissions.' }, 500) }
  if (account.data?.account_status !== 'ACTIVE')
    return { response: json({ error: 'An active account is required.' }, 403) }
  const p: unknown = profile.data
  const role =
    aliases[
      p && typeof p === 'object' && 'role' in p
        ? String(p.role).trim().toLowerCase()
        : ''
    ]
  if (!role)
    return {
      response: json(
        { error: 'You cannot access supplementation records.' },
        403,
      ),
    }
  let scope: number[] | null = null
  if (role === 'PHN') {
    const phn = await db
      .from('public_health_nurse')
      .select('rhu_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (phn.error)
      return {
        response: json({ error: 'Unable to load RHU assignment.' }, 500),
      }
    if (phn.data?.rhu_id == null) scope = []
    else {
      const b = await db
        .from('barangay')
        .select('barangay_id')
        .eq('rhu_id', phn.data.rhu_id)
      if (b.error)
        return {
          response: json({ error: 'Unable to load RHU barangays.' }, 500),
        }
      scope = (b.data ?? []).map((r) => Number(r.barangay_id))
    }
  } else if (role !== 'Administrator') {
    const a = await db
      .from('health_worker_assignment')
      .select('barangay_id')
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE')
    if (a.error)
      return { response: json({ error: 'Unable to load assignments.' }, 500) }
    scope = [...new Set((a.data ?? []).map((r) => Number(r.barangay_id)))]
  }
  return {
    db,
    userId: user.id,
    role,
    scope,
    permissions: {
      record: role === 'BHW' || role === 'BNS',
      stock: role === 'PHN' || role === 'RHM',
      clinical: role === 'RHM',
      monitor: role === 'PHN' || role === 'Administrator',
    },
  }
}

// Pagination keeps reports and options from stopping at the Supabase row limit.
async function pageRows(
  factory: (
    offset: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
) {
  const rows: Record<string, unknown>[] = []
  for (let n = 0; ; n += 1000) {
    const r = await factory(n)
    if (r.error) throw r.error
    rows.push(...((r.data ?? []) as Record<string, unknown>[]))
    if ((r.data?.length ?? 0) < 1000) return rows
  }
}

export async function GET(request: Request) {
  try {
    const a = await auth()
    if (a.response) return a.response
    const { db, scope } = a
    const wanted = new URL(request.url).searchParams.get('childId')
    const wantedId = wanted === null ? null : id(wanted)
    if (wanted !== null && !wantedId)
      return json({ error: 'Invalid child ID.' }, 400)
    const metadata = {
      currentUserId: a.userId,
      role: a.role,
      permissions: a.permissions,
    }
    if (scope?.length === 0)
      return json({
        ...metadata,
        children: [],
        barangays: [],
        products: [],
        protocols: [],
        inventory: [],
        batches: [],
        records: [],
        plans: [],
        assessments: [],
      })
    const barangays = await pageRows((n) => {
      let q = db
        .from('barangay')
        .select('barangay_id,barangay_name,rhu_id')
        .order('barangay_id')
        .range(n, n + 999)
      if (scope !== null) q = q.in('barangay_id', scope)
      return q
    })
    const children = await pageRows((n) => {
      let q = db
        .from('child')
        .select(
          'child_id,first_name,middle_name,last_name,date_of_birth,sex,barangay_id,status',
        )
        .order('child_id')
        .range(n, n + 999)
      if (scope !== null) q = q.in('barangay_id', scope)
      if (wantedId) q = q.eq('child_id', wantedId)
      return q
    })
    if (wantedId && !children.length)
      return json({ error: 'Child not found within your scope.' }, 404)
    const supplements = await pageRows((n) =>
      db
        .from('supplement')
        .select(
          'supplement_id,supplement_type,formulation,dose_strength,dose_unit,catalog_code,dispensing_only,child_min_months,child_max_months',
        )
        .order('supplement_id')
        .range(n, n + 999),
    )
    const items = await pageRows((n) =>
      db
        .from('item')
        .select('item_id,item_name,unit,status')
        .order('item_id')
        .range(n, n + 999),
    )
    const itemById = new Map(items.map((i) => [String(i.item_id), i]))
    const products = supplements.map((s) => ({
      ...s,
      item: itemById.get(String(s.supplement_id)) ?? null,
    }))
    const protocolRows = await pageRows((n) =>
      db
        .from('supplementation_protocol')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('protocol_id')
        .range(n, n + 999),
    )
    const supplementIds = supplements.map((s) => Number(s.supplement_id))
    const inventory: Record<string, unknown>[] = []
    for (let start = 0; start < supplementIds.length; start += 100) {
      inventory.push(
        ...(await pageRows((n) => {
          let q = db
            .from('inventory')
            .select(
              'inventory_id,item_id,barangay_id,quantity_on_hand,updated_at',
            )
            .in('item_id', supplementIds.slice(start, start + 100))
            .order('inventory_id')
            .range(n, n + 999)
          if (scope !== null) q = q.in('barangay_id', scope)
          return q
        })),
      )
    }
    const batches: Record<string, unknown>[] = []
    const invIds = inventory.map((i) => Number(i.inventory_id))
    for (let start = 0; start < invIds.length; start += 100) {
      batches.push(
        ...(await pageRows((n) =>
          db
            .from('inventory_batch')
            .select(
              'batch_id,inventory_id,batch_number,expiry_date,received_date,quantity_on_hand',
            )
            .in('inventory_id', invIds.slice(start, start + 100))
            .order('expiry_date')
            .order('batch_id')
            .range(n, n + 999),
        )),
      )
    }
    const records: Record<string, unknown>[] = []
    const childIds = children.map((c) => Number(c.child_id))
    for (let start = 0; start < childIds.length; start += 100) {
      records.push(
        ...(await pageRows((n) =>
          db
            .from('supplementation_record')
            .select(
              'supplementation_record_id,child_id,supplement_id,supplementation_date,quantity_given,dose_value,dose_unit,purpose,batch_number,inventory_batch_id,protocol_id,protocol_snapshot,recorded_by,remarks,source_assessment_id,schedule_id,record_type,plan_id,tier,order_reference,clinical_indication,course_reference,clinical_dose_number,course_start_date',
            )
            .in('child_id', childIds.slice(start, start + 100))
            .order('supplementation_date', { ascending: false })
            .order('supplementation_record_id', { ascending: false })
            .range(n, n + 999),
        )),
      )
    }
    const plans: Record<string, unknown>[] = []
    for (let start = 0; start < childIds.length; start += 100) {
      plans.push(
        ...(await pageRows((n) =>
          db
            .from('supplementation_plan')
            .select('*')
            .in('child_id', childIds.slice(start, start + 100))
            .order('plan_id', { ascending: false })
            .range(n, n + 999),
        )),
      )
    }
    const assessments: Record<string, unknown>[] = []
    for (let start = 0; start < childIds.length; start += 100) {
      const r = await db.rpc('msp_nutrition_basis', {
        p_child_ids: childIds.slice(start, start + 100),
      })
      if (r.error) throw r.error
      assessments.push(...((r.data ?? []) as Record<string, unknown>[]))
    }
    records.sort(
      (x, y) =>
        String(y.supplementation_date).localeCompare(
          String(x.supplementation_date),
        ) ||
        Number(y.supplementation_record_id) -
          Number(x.supplementation_record_id),
    )
    return json({
      ...metadata,
      children,
      barangays,
      products,
      protocols: protocolRows,
      inventory,
      batches,
      records,
      plans,
      assessments,
    })
  } catch (e) {
    console.error('Supplementation GET failed:', e)
    return json(
      {
        error:
          'Unable to load supplementation data. Check the migration and server terminal.',
      },
      500,
    )
  }
}

export async function POST(request: Request) {
  try {
    const a = await auth()
    if (a.response) return a.response
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return json({ error: 'Provide a valid JSON object.' }, 400)
    const b = body as Record<string, unknown>
    if (b.expectedUserId !== undefined && b.expectedUserId !== a.userId)
      return json(
        {
          error:
            'Account changed. Sign in with the draft owner before submitting.',
        },
        403,
      )
    let result: {
      data: unknown
      error: { code: string; message: string } | null
    }
    if (
      b.offlineSubmission !== undefined &&
      typeof b.offlineSubmission !== 'boolean'
    )
      return json({ error: 'Invalid offline submission flag.' }, 400)
    if (
      b.offlineSubmission === true &&
      b.action !== 'RECORD' &&
      b.action !== 'DISPENSE' &&
      b.action !== 'CLINICAL'
    )
      return json(
        {
          error:
            'Offline sync supports administration, clinical administration and dispensing only.',
        },
        400,
      )
    const submit = (
      action: 'RECORD' | 'DISPENSE' | 'CLINICAL',
      rpc: string,
      args: Record<string, unknown>,
    ) =>
      b.offlineSubmission === true
        ? action === 'CLINICAL'
          ? a.db.rpc('msp_sync_clinical_supplementation', { p_arguments: args })
          : a.db.rpc('msp_sync_supplementation', {
              p_action: action,
              p_arguments: args,
            })
        : a.db.rpc(rpc, args)
    if (b.action === 'PLAN') {
      if (!a.permissions.stock)
        return json(
          { error: 'Only assigned RHM/PHN can register supply plans.' },
          403,
        )
      const childId = id(b.childId),
        supplementId = id(b.supplementId),
        quantity = positive(b.quantity)
      if (
        !childId ||
        !supplementId ||
        !quantity ||
        !date(b.startDate) ||
        !date(b.endDate) ||
        !uuid(b.requestId)
      )
        return json(
          {
            error:
              'Choose child, commodity, dates and a positive whole quantity.',
          },
          400,
        )
      const sourceId =
        b.assessmentId == null || b.assessmentId === ''
          ? null
          : id(b.assessmentId)
      if (b.assessmentId != null && b.assessmentId !== '' && !sourceId)
        return json({ error: 'Invalid assessment reference.' }, 400)
      result = await a.db.rpc('msp_register_supply_plan', {
        p_child_id: childId,
        p_supplement_id: supplementId,
        p_start: b.startDate,
        p_end: b.endDate,
        p_quantity: quantity,
        p_remarks: text(b.remarks) || null,
        p_request_id: b.requestId,
        p_assessment_id: sourceId,
      })
    } else if (b.action === 'DISPENSE') {
      if (!a.permissions.record)
        return json({ error: 'Only assigned BHW/BNS record dispensing.' }, 403)
      const planId = id(b.planId),
        batchId = id(b.batchId),
        quantity = positive(b.quantity)
      if (
        !planId ||
        !batchId ||
        !quantity ||
        !date(b.date) ||
        !uuid(b.requestId)
      )
        return json(
          { error: 'Provide plan, batch, date, quantity and request UUID.' },
          400,
        )
      result = await submit('DISPENSE', 'msp_dispense', {
        p_plan_id: planId,
        p_batch_id: batchId,
        p_date: b.date,
        p_quantity: quantity,
        p_request_id: b.requestId,
        p_remarks: text(b.remarks) || null,
      })
    } else if (b.action === 'RECEIVE') {
      if (!a.permissions.stock)
        return json({ error: 'Only assigned PHNs and RHMs manage stock.' }, 403)
      const supplementId = id(b.supplementId),
        barangayId = id(b.barangayId),
        quantity = positive(b.quantity)
      if (
        !supplementId ||
        !barangayId ||
        !quantity ||
        !date(b.receivedDate) ||
        !date(b.expiryDate) ||
        !uuid(b.requestId) ||
        !text(b.batchNumber) ||
        typeof b.allocateExisting !== 'boolean'
      )
        return json(
          { error: 'Provide complete, valid batch receipt fields.' },
          400,
        )
      if (a.scope !== null && !a.scope.includes(barangayId))
        return json({ error: 'Barangay is outside your assignment.' }, 403)
      result = await a.db.rpc('msp_receive_batch', {
        p_supplement_id: supplementId,
        p_barangay_id: barangayId,
        p_batch_number: text(b.batchNumber),
        p_expiry_date: b.expiryDate,
        p_received_date: b.receivedDate,
        p_quantity: quantity,
        p_request_id: b.requestId,
        p_allocate_existing: b.allocateExisting,
      })
    } else if (b.action === 'CLINICAL') {
      if (a.role !== 'RHM' || !a.permissions.clinical)
        return json(
          {
            error:
              'Only an active assigned RHM can record clinical-tier supplementation.',
          },
          403,
        )
      const childId = id(b.childId),
        supplementId = id(b.supplementId),
        batchId = id(b.batchId),
        protocolId = id(b.protocolId),
        dose = positive(b.clinicalDoseValue),
        doseUnit = text(b.clinicalDoseUnit).toUpperCase(),
        clinicalDoseNumber = id(b.clinicalDoseNumber),
        clinicalIndication = text(b.clinicalIndication).toUpperCase(),
        courseReference = text(b.courseReference)
      if (
        !childId ||
        !supplementId ||
        !batchId ||
        !protocolId ||
        !dose ||
        !doseUnit ||
        !clinicalDoseNumber ||
        !clinicalIndication ||
        !courseReference ||
        !date(b.date) ||
        !uuid(b.requestId) ||
        !text(b.orderReference) ||
        b.confirmed !== true
      )
        return json(
          {
            error:
              'Provide child, verified clinical protocol, batch, actual date, matching dose/unit, indication, course reference, dose number, documented order and administration confirmation.',
          },
          400,
        )
      const assessmentId =
        b.assessmentId == null || b.assessmentId === ''
          ? null
          : id(b.assessmentId)
      const scheduleId =
        b.scheduleId == null || b.scheduleId === '' ? null : id(b.scheduleId)
      if (
        (b.assessmentId != null && b.assessmentId !== '' && !assessmentId) ||
        (b.scheduleId != null && b.scheduleId !== '' && !scheduleId)
      )
        return json({ error: 'Invalid assessment/activity reference.' }, 400)
      result = await submit('CLINICAL', 'msp_record_clinical_supplementation', {
        p_child_id: childId,
        p_supplement_id: supplementId,
        p_batch_id: batchId,
        p_protocol_id: protocolId,
        p_date: b.date,
        p_request_id: b.requestId,
        p_dose_value: dose,
        p_dose_unit: doseUnit,
        p_clinical_indication: clinicalIndication,
        p_course_reference: courseReference,
        p_clinical_dose_number: clinicalDoseNumber,
        p_remarks: text(b.remarks) || null,
        p_order_reference: text(b.orderReference),
        p_assessment_id: assessmentId,
        p_schedule_id: scheduleId,
      })
    } else if (b.action === 'RECORD') {
      if (!a.permissions.record)
        return json(
          { error: 'Only assigned BHW/BNS can record supplementation.' },
          403,
        )
      const childId = id(b.childId),
        supplementId = id(b.supplementId),
        batchId = id(b.batchId),
        protocolId = id(b.protocolId)
      if (
        !childId ||
        !supplementId ||
        !batchId ||
        !protocolId ||
        !date(b.date) ||
        !uuid(b.requestId)
      )
        return json(
          {
            error:
              'Choose child, product, protocol, batch and administration date.',
          },
          400,
        )
      const assessmentId =
        b.assessmentId == null || b.assessmentId === ''
          ? null
          : id(b.assessmentId)
      const scheduleId =
        b.scheduleId == null || b.scheduleId === '' ? null : id(b.scheduleId)
      if (
        (b.assessmentId != null && b.assessmentId !== '' && !assessmentId) ||
        (b.scheduleId != null && b.scheduleId !== '' && !scheduleId)
      )
        return json({ error: 'Invalid assessment/activity reference.' }, 400)
      result = await submit('RECORD', 'msp_record_supplementation', {
        p_child_id: childId,
        p_supplement_id: supplementId,
        p_batch_id: batchId,
        p_protocol_id: protocolId,
        p_date: b.date,
        p_request_id: b.requestId,
        p_remarks: text(b.remarks) || null,
        p_order_reference: text(b.orderReference) || null,
        p_assessment_id: assessmentId,
        p_schedule_id: scheduleId,
      })
    } else return json({ error: 'Invalid action.' }, 400)
    if (result.error) {
      const statuses: Record<string, number> = {
        '42501': 403,
        P0002: 404,
        '22023': 400,
        '23505': 409,
        '23514': 409,
      }
      const status = statuses[result.error.code]
      if (status) return json({ error: result.error.message }, status)
      console.error('Supplementation RPC failed:', result.error)
      return json(
        {
          error:
            'Unable to save. No partial stock deduction should be committed.',
        },
        500,
      )
    }
    return json(
      {
        message:
          b.action === 'CLINICAL'
            ? 'Clinical supplementation recorded and stock updated.'
            : b.action === 'RECORD'
              ? 'Supplementation recorded and stock updated.'
              : b.action === 'RECEIVE'
                ? 'Batch stock saved.'
                : b.action === 'PLAN'
                  ? 'Supply plan registered.'
                  : 'Supply issued; consumption and course completion are not recorded.',
        data: result.data,
      },
      (b.action === 'CLINICAL' ||
        b.action === 'RECORD' ||
        b.action === 'DISPENSE' ||
        b.action === 'PLAN') &&
        (result.data as { replayed?: boolean } | null)?.replayed
        ? 200
        : 201,
    )
  } catch (e) {
    console.error('Supplementation POST failed:', e)
    return json({ error: 'An unexpected error occurred.' }, 500)
  }
}
    