import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { NIP_CATALOG, GRACE_PERIOD_DAYS } from '@/lib/nip-schedule'

// NIP-USR005 — Defaulters list.
// GET /api/vaccination/defaulters?status=OVERDUE&vaccine=BCG&limit=100
//
// Returns children (RLS-scoped by barangay/RHU) with doses that are DUE or OVERDUE
// against the NIP schedule. Computed on-demand — no scheduled job or new table.
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

type Status = 'DUE' | 'OVERDUE'

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00').getTime()
  const b = new Date(toISO + 'T00:00:00').getTime()
  return Math.floor((b - a) / 86400000)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return invalid('Please sign in to view the defaulters list.', 401)
  const role = await trustedRole(supabase)
  if (!role || !canPerform(role, 'Vaccination', 'view')) {
    return invalid('You are not authorized to view the defaulters list.', 403)
  }

  const url = new URL(request.url)
  const statusFilter = (url.searchParams.get('status') ?? '').toUpperCase() as Status | ''
  const vaccineFilter = (url.searchParams.get('vaccine') ?? '').toUpperCase()
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200) || 200, 10), 500)

  if (statusFilter && statusFilter !== 'DUE' && statusFilter !== 'OVERDUE') {
    return invalid('status must be DUE or OVERDUE.')
  }
  if (vaccineFilter && !NIP_CATALOG.some((v) => v.code === vaccineFilter)) {
    return invalid('vaccine must be a valid NIP code (BCG, HEPB, PENTA, OPV, IPV, PCV13, ROTA, MMR).')
  }

  // Fetch all children in scope (RLS filters). We cap at 1,000 to protect compute.
  const childRes = await supabase.from('child')
    .select(`
      child_id, first_name, middle_name, last_name, date_of_birth, barangay_id, status,
      barangay:barangay(barangay_id, barangay_name)
    `)
    .in('status', ['ACTIVE', 'MONITORING'])  // skip MOVED/LOST/DECEASED
    .limit(1000)

  if (childRes.error) return invalid(`Unable to load children. ${childRes.error.message ?? ''}`.trim(), 500)
  const children = childRes.data ?? []
  if (children.length === 0) {
    return NextResponse.json({
      defaulters: [],
      counts: { overdue: 0, due: 0, total_children_evaluated: 0, total_children_in_scope: 0 },
      role, grace_period_days: GRACE_PERIOD_DAYS,
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

  // Index approved records by (child_id → vaccine_type → set of done dose_numbers)
  const doneMap = new Map<number, Map<string, Set<number>>>()
  for (const rec of approvedRecords) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v: any = Array.isArray(rec.vaccine) ? rec.vaccine[0] : rec.vaccine
    if (!v?.vaccine_type) continue
    if (!doneMap.has(rec.child_id)) doneMap.set(rec.child_id, new Map())
    const perChild = doneMap.get(rec.child_id)!
    if (!perChild.has(v.vaccine_type)) perChild.set(v.vaccine_type, new Set())
    perChild.get(v.vaccine_type)!.add(rec.dose_number)
  }

  const today = todayYMD()

  // Walk each child × each vaccine × each dose and compute status
  type DefaulterRow = {
    child_id: number
    child_name: string
    date_of_birth: string
    barangay_id: number | null
    barangay_name: string | null
    vaccine_code: string
    vaccine_type: string
    dose_number: number
    due_date: string
    days_overdue: number
    status: Status
  }
  const defaulters: DefaulterRow[] = []

  for (const c of children) {
    const dob = String(c.date_of_birth)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = Array.isArray(c.barangay) ? c.barangay[0] : c.barangay

    for (const v of NIP_CATALOG) {
      if (vaccineFilter && v.code !== vaccineFilter) continue
      const doneForVaccine = doneMap.get(c.child_id)?.get(v.code) ?? new Set<number>()

      for (let n = 1; n <= v.total_doses; n++) {
        if (doneForVaccine.has(n)) continue   // already administered — not a defaulter
        const offsetDays = v.min_age_days + (v.interval_days ? (n - 1) * v.interval_days : 0)
        const dueDate = addDays(dob, offsetDays)
        if (dueDate > today) continue          // not due yet — upcoming, not a defaulter
        const daysPast = daysBetween(dueDate, today)
        const status: Status = daysPast > GRACE_PERIOD_DAYS ? 'OVERDUE' : 'DUE'
        if (statusFilter && status !== statusFilter) continue

        defaulters.push({
          child_id: c.child_id,
          child_name: [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' '),
          date_of_birth: dob,
          barangay_id: c.barangay_id,
          barangay_name: b?.barangay_name ?? null,
          vaccine_code: v.code,
          vaccine_type: v.vaccine_type,
          dose_number: n,
          due_date: dueDate,
          days_overdue: daysPast,
          status,
        })
      }
    }
  }

  // Sort: OVERDUE first, most-overdue first, then by child name
  defaulters.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'OVERDUE' ? -1 : 1
    if (a.days_overdue !== b.days_overdue) return b.days_overdue - a.days_overdue
    return a.child_name.localeCompare(b.child_name)
  })

  const capped = defaulters.slice(0, limit)
  const overdueCount = defaulters.filter((d) => d.status === 'OVERDUE').length
  const dueCount = defaulters.filter((d) => d.status === 'DUE').length
  const uniqueChildrenAffected = new Set(defaulters.map((d) => d.child_id)).size

  return NextResponse.json({
    defaulters: capped,
    counts: {
      overdue: overdueCount,
      due: dueCount,
      unique_children_affected: uniqueChildrenAffected,
      total_children_in_scope: children.length,
      total_shown: capped.length,
      total_matched: defaulters.length,
    },
    filters: {
      status: statusFilter || null,
      vaccine: vaccineFilter || null,
      limit,
    },
    role,
    grace_period_days: GRACE_PERIOD_DAYS,
  })
}