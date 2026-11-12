import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
import {
  NIP_CATALOG,
  nipVaccineTimeline,
  normalizeVaccineCode,
  manilaTodayYMD,
  nipDaysBetween,
} from '@/lib/nip-schedule'
// NIP-USR005 — Defaulters list.
// GET /api/vaccination/defaulters?vaccine=BCG&limit=100
//
// Returns children (RLS-scoped by barangay/RHU) with Missed doses (due date passed, not given,
// still eligible) against the NIP schedule, each with its rescheduled date. Computed on-demand — no scheduled job or new table.
// The same payload drives the dashboard overdue count tile and feeds the (future)
// alert engine.
//
// Scope: anyone with Vaccination 'view' can see — Admin all, PHN RHU, BHW/RHM barangay.
// BNS is excluded (no Vaccination in their role matrix).

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

type Status = 'OVERDUE'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in to view the defaulters list.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination', 'view')) {
    return invalid('You are not authorized to view the defaulters list.', 403)
  }

  const url = new URL(request.url)
  const vaccineFilter = (url.searchParams.get('vaccine') ?? '').toUpperCase()
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200) || 200, 10), 500)

  if (vaccineFilter && !NIP_CATALOG.some((v) => v.code === vaccineFilter)) {
    return invalid(`vaccine must be one of: ${NIP_CATALOG.filter((v) => v.routine_enabled !== false).map((v) => v.code).join(', ')}.`)
  }

  // Fetch all children in scope (RLS filters). We cap at 1,000 to protect compute.
  const childRes = await supabase.from('child')
    .select(`
      child_id, child_code, first_name, middle_name, last_name, date_of_birth, barangay_id, status,
      barangay:barangay(barangay_id, barangay_name), household:household(family_serial_no),
      assist:child_vaccination_assist(reason)
    `)
    .in('status', ['ACTIVE', 'MONITORING'])  // skip MOVED/LOST/DECEASED
    .limit(1000)

  if (childRes.error) return invalid(`Unable to load children. ${childRes.error.message ?? ''}`.trim(), 500)
  const children = childRes.data ?? []
  if (children.length === 0) {
    return NextResponse.json({
      defaulters: [],
      counts: { overdue: 0, unique_children_affected: 0, total_children_in_scope: 0, total_shown: 0, total_matched: 0 },
      role,
    })
  }

  // Fetch APPROVED records for those children in one shot
  const childIds = children.map((c) => c.child_id)
  const recRes = await supabase.from('vaccination_record')
    .select('vaccination_record_id, child_id, vaccine_id, dose_number, vaccination_date, status, vaccine:vaccine(vaccine_type)')
    .in('child_id', childIds)
    .eq('status', 'APPROVED')

  if (recRes.error) return invalid(`Unable to load vaccination records. ${recRes.error.message ?? ''}`.trim(), 500)
  const approvedRecords = recRes.data ?? []

  // Index approved records by (child_id → vaccine code → dose number → date given)
const doneMap = new Map<number, Map<string, Map<number, string>>>()

for (const rec of approvedRecords) {
  const vaccine = (
    Array.isArray(rec.vaccine) ? rec.vaccine[0] : rec.vaccine
  ) as { vaccine_type?: string } | null

  if (!vaccine?.vaccine_type) continue

  const code = normalizeVaccineCode(vaccine.vaccine_type)

  let perChild = doneMap.get(rec.child_id)
  if (!perChild) {
    perChild = new Map<string, Map<number, string>>()
    doneMap.set(rec.child_id, perChild)
  }

  let doses = perChild.get(code)
  if (!doses) {
    doses = new Map<number, string>()
    perChild.set(code, doses)
  }

  doses.set(rec.dose_number, String(rec.vaccination_date))
}
  const today = manilaTodayYMD()

  // Walk each child × each vaccine × each dose and compute status
  type DefaulterRow = {
    child_id: number
    child_name: string
    child_code: string | null
    family_serial_no: string | null
    bhw_assist: { reason: string | null } | null
    date_of_birth: string
    barangay_id: number | null
    barangay_name: string | null
    vaccine_code: string
    vaccine_type: string
    dose_number: number
    due_date: string
    days_overdue: number
    rescheduled_date: string | null
    status: Status
  }
  const defaulters: DefaulterRow[] = []

  for (const c of children) {
    const dob = String(c.date_of_birth)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = Array.isArray(c.barangay) ? c.barangay[0] : c.barangay

    for (const v of NIP_CATALOG) {
      if (v.routine_enabled === false) continue
      if (vaccineFilter && v.code !== vaccineFilter) continue
      const given = doneMap.get(c.child_id)?.get(v.code)
      // Same schedule and rules as the child profile (lib/nip-schedule).
      const timeline = nipVaccineTimeline(dob, v, Array.from({ length: v.total_doses }, (_, i) => given?.get(i + 1) ?? null), today)
      for (const t of timeline) {
        if (t.status !== 'OVERDUE') continue
        const daysPast = nipDaysBetween(t.due_date, today)
        if (!Number.isFinite(daysPast)) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h: any = Array.isArray(c.household) ? c.household[0] : c.household
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a: any = Array.isArray(c.assist) ? c.assist[0] : c.assist
        defaulters.push({
          child_id: c.child_id,
          child_name: [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' '),
          child_code: c.child_code ?? null,
          family_serial_no: h?.family_serial_no ?? null,
          bhw_assist: a ? { reason: a.reason ?? null } : null,
          date_of_birth: dob,
          barangay_id: c.barangay_id,
          barangay_name: b?.barangay_name ?? null,
          vaccine_code: v.code,
          vaccine_type: v.vaccine_type,
          dose_number: t.dose_number,
          due_date: t.due_date,
          days_overdue: daysPast,
          rescheduled_date: t.rescheduled_date,
          status: 'OVERDUE',
        })
      }
    }
  }

  // Sort: longest missed first, then by child name
  defaulters.sort((a, b) => {
    if (a.days_overdue !== b.days_overdue) return b.days_overdue - a.days_overdue
    return a.child_name.localeCompare(b.child_name)
  })

  const capped = defaulters.slice(0, limit)
  const overdueCount = defaulters.length
  const uniqueChildrenAffected = new Set(defaulters.map((d) => d.child_id)).size

  return NextResponse.json({
    defaulters: capped,
    counts: {
      overdue: overdueCount,
      unique_children_affected: uniqueChildrenAffected,
      total_children_in_scope: children.length,
      total_shown: capped.length,
      total_matched: defaulters.length,
    },
    filters: {
      vaccine: vaccineFilter || null,
      limit,
    },
    role,
  })
}
