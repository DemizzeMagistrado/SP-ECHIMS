import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'
import {
  NIP_CATALOG,
  GRACE_PERIOD_DAYS,
  getNipDoseDate,
  normalizeVaccineCode,
  manilaTodayYMD,
  nipDaysBetween,
} from '@/lib/nip-schedule'

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator',
  admin: 'Administrator',
  'public health nurse': 'Public Health Nurse',
  phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker',
  bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife',
  rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar',
  bns: 'Barangay Nutrition Scholar',
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function trustedRole(
  supabase: SupabaseClient,
): Promise<UserRole | undefined> {
  const { data, error } = await supabase
    .rpc('get_my_profile')
    .maybeSingle()

  if (error) return undefined

  const profile = data as { role?: unknown } | null

  return roleAliases[
    String(profile?.role ?? '').trim().toLowerCase()
  ]
}

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

type DoseStatus = 'COMPLETE' | 'DUE' | 'OVERDUE' | 'UPCOMING'

type DoseRow = {
  dose_number: number
  status: DoseStatus
  due_date: string
  given_date: string | null
  batch_number: string | null
  vaccination_site: string | null
  vaccination_record_id: number | null
  is_prior: boolean
  prior_source: string | null
}

type VaccineStatusRow = {
  code: string
  vaccine_type: string
  route: string
  dose_volume: string
  total_doses: number
  doses: DoseRow[]
}

function joinedVaccineCode(value: unknown): string | null {
  const vaccine = Array.isArray(value) ? value[0] : value

  if (!vaccine || typeof vaccine !== 'object') return null

  const type = (vaccine as { vaccine_type?: unknown }).vaccine_type

  return typeof type === 'string'
    ? normalizeVaccineCode(type)
    : null
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return invalid(
        'Please sign in to view immunization history.',
        401,
      )
    }

    const role = await trustedRole(supabase)

    if (!role || !canPerform(role, 'Child Profiling', 'view')) {
      return invalid(
        'You are not authorized to view immunization history.',
        403,
      )
    }

    const url = new URL(request.url)
    const childId = Number(url.searchParams.get('child_id'))

    if (!Number.isSafeInteger(childId) || childId <= 0) {
      return invalid('A valid child_id is required.')
    }

    const childRes = await supabase
      .from('child')
      .select(
        'child_id, first_name, middle_name, last_name, date_of_birth, barangay_id',
      )
      .eq('child_id', childId)
      .maybeSingle()

    if (childRes.error) {
      console.error('Immunization child lookup:', childRes.error)
      return invalid('Unable to load the child record.', 500)
    }

    if (!childRes.data) {
      return invalid('Child not found or outside your scope.', 404)
    }

    const dob = String(childRes.data.date_of_birth)

    const recRes = await supabase
      .from('vaccination_record')
      .select(`
        vaccination_record_id,
        vaccination_date,
        dose_number,
        batch_number,
        vaccination_site,
        remarks,
        created_at,
        is_prior,
        prior_source,
        vaccine:vaccine(
          vaccine_id,
          vaccine_type,
          dose_volume,
          route,
          target_age,
          item:item(item_id, item_name)
        )
      `)
      .eq('child_id', childId)
      .eq('status', 'APPROVED')
      .order('vaccination_date', { ascending: false })
      .order('vaccination_record_id', { ascending: false })

    if (recRes.error) {
      console.error('Immunization history lookup:', recRes.error)
      return invalid('Unable to load immunization history.', 500)
    }

    // Retain all approved records, including non-routine vaccines.
    const approvedRecords = recRes.data ?? []
    const today = manilaTodayYMD()
    const vaccineStatus: VaccineStatusRow[] = []

    for (const vaccine of NIP_CATALOG) {
      if (vaccine.routine_enabled === false) continue

      const doses: DoseRow[] = []

      for (let dose = 1; dose <= vaccine.total_doses; dose++) {
        const dueDate = getNipDoseDate(dob, vaccine, dose)

        if (!dueDate) {
          return invalid(
            'Unable to calculate the schedule. Check the child’s birth date and vaccine configuration.',
            500,
          )
        }

        const match = approvedRecords.find(
          (record) =>
            joinedVaccineCode(record.vaccine) === vaccine.code &&
            Number(record.dose_number) === dose,
        )

        let status: DoseStatus

        if (match) {
          status = 'COMPLETE'
        } else if (dueDate > today) {
          status = 'UPCOMING'
        } else {
          const daysPastDue = nipDaysBetween(dueDate, today)

          if (!Number.isFinite(daysPastDue)) {
            return invalid('Unable to calculate dose status.', 500)
          }

          status =
            daysPastDue > GRACE_PERIOD_DAYS ? 'OVERDUE' : 'DUE'
        }

        doses.push({
          dose_number: dose,
          status,
          due_date: dueDate,
          given_date: match
            ? String(match.vaccination_date)
            : null,
          batch_number: match?.batch_number ?? null,
          vaccination_site: match?.vaccination_site ?? null,
          vaccination_record_id:
            match?.vaccination_record_id ?? null,
          is_prior: Boolean(match?.is_prior),
          prior_source: match?.prior_source ?? null,
        })
      }

      vaccineStatus.push({
        code: vaccine.code,
        vaccine_type: vaccine.vaccine_type,
        route: vaccine.route,
        dose_volume: vaccine.dose_volume,
        total_doses: vaccine.total_doses,
        doses,
      })
    }

    const pendingDoses = vaccineStatus
      .flatMap((vaccine) =>
        vaccine.doses
          .filter(
            (dose) =>
              dose.status === 'OVERDUE' || dose.status === 'DUE',
          )
          .map((dose) => ({
            vaccine_code: vaccine.code,
            vaccine_type: vaccine.vaccine_type,
            ...dose,
          })),
      )
      .sort((a, b) => a.due_date.localeCompare(b.due_date))

    function countStatus(status: DoseStatus): number {
      return vaccineStatus.reduce(
        (total, vaccine) =>
          total +
          vaccine.doses.filter((dose) => dose.status === status)
            .length,
        0,
      )
    }

    return NextResponse.json(
      {
        child: childRes.data,
        approved_records: approvedRecords,
        vaccine_status: vaccineStatus,
        next_due: pendingDoses[0] ?? null,
        counts: {
          complete: countStatus('COMPLETE'),
          due: countStatus('DUE'),
          overdue: countStatus('OVERDUE'),
          upcoming: countStatus('UPCOMING'),
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    )
  } catch (error) {
    console.error('Immunization history GET:', error)

    return invalid(
      'An unexpected error occurred while loading immunization history.',
      500,
    )
  }
}