'use client'
// CHILD-USR003 — View Child Profile
// Centralized profile view that pulls the child record, their linked guardian,
// their household and barangay context, and every related health record
// (vaccinations, nutritional assessments, supplementations) in one page.
// Backed by GET /api/children?childId={id} which fans the queries out in parallel.
import { use, useState, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { NutritionHistorySection } from '@/components/children/nutrition-history-section'
import type { HistoryAssessment } from '@/lib/nutrition-history'
import { ArrowLeft, Pencil, Baby, Users, Syringe, Scale, Pill, MapPin, Phone, Home, ArrowRightLeft, History, AlertCircle } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { formatChildId } from '@/lib/formatters'
import { ChildFormModal } from '@/components/children/child-form-modal'
import { ChangeStatusModal } from '@/components/children/change-status-modal'
import { VaccinationScheduleSection } from '@/components/children/vaccination-schedule-section'
import { ImmunizationHistorySection } from '@/components/children/immunization-history-section'
import { useToast } from '@/components/ui/toast'
type ChildRow = {
  child_id: number
  first_name: string
  middle_name: string | null
  last_name: string
  date_of_birth: string
  sex: string
  birth_place: string | null
  address: string | null
  registration_date: string | null
  status: string | null
  household_id: number | null
  barangay_id: number | null
  guardian_id: number | null
}
type Guardian = {
  guardian_id: number
  first_name: string
  middle_name: string | null
  last_name: string
  contact_number: string | null
  address: string | null
  relationship_to_child: string | null
}
type Profile = {
  profile_record_id: number
  profiling_date: string | null
  relationship_to_household_head: string | null
  civil_status: string | null
  educational_attainment: string | null
  religion: string | null
  ethnicity: string | null
  philhealth_id_number: string | null
  philhealth_membership_type: string | null
  philhealth_category: string | null
  medical_history: string | null
  water_source_type: string | null
  toilet_facility_type: string | null
}
type BarangayRow = { barangay_id: number; barangay_name: string; municipality: string | null; province: string | null; rhu_id: number | null }
type HouseholdRow = { household_id: number; household_no: string | null; household_address: string | null; purok: string | null; is_4ps_member: boolean | null }
type RhuRow = { rhu_id: number; rhu_name: string | null }
type Vaccination = { vaccination_record_id: number; vaccination_date: string; dose_number: number | null; batch_number: string | null; vaccination_site: string | null; remarks: string | null; vaccine: { vaccine_type: string; dose_volume: string | null; route: string | null; target_age: string | null } | null }
type Assessment = HistoryAssessment & {
  assessment_id: number
  assessment_date: string
  weight: number | string | null
  height: number | string | null
  muac: number | string | null
  weight_for_age: string | null
  height_for_age: string | null
  weight_for_height: string | null
  nutritional_status: string | null
  remarks: string | null
  is_at_risk: boolean | null
  // Other saved evaluator fields supplied by the child API.
  bmi_for_age?: string | null
  muac_status?: string | null
  evaluation_status?: string | null
}
type Supplementation = { supplementation_record_id: number; supplementation_date: string; quantity_given: number | null; batch_number: string | null; remarks: string | null; supplement: { supplement_type: string; dosage: string | null; age_group: string | null } | null }
type MovementRow = { movement_id: number; movement_type: string; movement_date: string; reason: string | null; status: string; previous_address: string | null; new_address: string | null; remarks: string | null; recorded_at: string }
type ProfilePayload = {
  child: ChildRow
  guardian: Guardian | null
  profile: Profile | null
  monitoringStatus: string
  barangay: BarangayRow | null
  household: HouseholdRow | null
  rhu: RhuRow | null
  vaccinations: Vaccination[]
  assessments: Assessment[]
  supplementations: Supplementation[]
}
const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' })
  let data
  try { data = await response.json() }
  catch { throw new Error('The server returned an unreadable child profile response.') }
  if (!response.ok) throw new Error(data.error || 'Unable to load the child profile.')
  return data
}
function ageDescription(dob: string) {
  if (!dob) return '—'
  const birth = new Date(`${dob}T00:00:00Z`)
  if (isNaN(birth.getTime())) return '—'
  const now = new Date()
  const months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth() - (now.getUTCDate() < birth.getUTCDate() ? 1 : 0)
  if (months < 0) return 'Not yet born'
  if (months < 12) return `${months} months`
  const years = Math.floor(months / 12)
  const remainder = months % 12
  return remainder ? `${years} y ${remainder} mo` : `${years} years`
}
function classificationForDob(dob: string) {
  if (!dob) return '—'
  const birth = new Date(`${dob}T00:00:00Z`)
  if (isNaN(birth.getTime())) return '—'
  const days = Math.floor((Date.now() - birth.getTime()) / 86400000)
  const now = new Date()
  const months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth() - (now.getUTCDate() < birth.getUTCDate() ? 1 : 0)
  if (days < 0) return '—'
  if (days <= 28) return 'Newborn (0-28 days)'
  if (months < 12) return 'Infant (0-1 y/o)'
  if (months <= 59) return 'PSAC (1-4 y/o)'
  return 'Out of 0-59 months range'
}
function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function titleCase(value: string | null | undefined) {
  if (!value) return '—'
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}
function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const colors = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    danger: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${colors}`}>{children}</span>
}
type Tone = 'default' | 'success' | 'warning' | 'danger'
function classificationCode(value: string | null | undefined) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
}
const urgentNutritionCodes = new Set([
  'SAM', 'SEVERE_ACUTE_MALNUTRITION', 'INFANT_URGENT_REVIEW',
  'SEVERELY_UNDERWEIGHT', 'SEVERELY_STUNTED', 'SEVERELY_WASTED',
  'SEVERE_WASTING', 'SEVERE_THINNESS', 'SEVERELY_THIN',
])
const riskNutritionCodes = new Set([
  ...urgentNutritionCodes,
  'MAM', 'MODERATE_ACUTE_MALNUTRITION', 'UNDERWEIGHT', 'STUNTED',
  'WASTED', 'WASTING', 'THINNESS', 'THIN', 'OVERWEIGHT', 'OBESE',
  'OBESITY', 'POSSIBLE_RISK_OF_OVERWEIGHT', 'AT_RISK',
])
const nonRiskNutritionCodes = new Set([
  'NORMAL', 'NOT_UNDERWEIGHT', 'NOT_STUNTED',
  'NO_ACUTE_CRITERIA_IDENTIFIED', 'NOT_APPLICABLE',
])
function classificationLabel(value: string | null | undefined) {
  const code = classificationCode(value)
  if (!code) return 'Not available'
  if (code === 'SAM' || code === 'MAM') return code
  if (code === 'NOT_INTERPRETABLE_EDEMA') return 'Not interpretable (edema)'
  return code.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
}
function statusTone(status: string): Tone {
  const code = classificationCode(status)
  if (urgentNutritionCodes.has(code)) return 'danger'
  if (riskNutritionCodes.has(code) || code === 'NEEDS_VERIFICATION') return 'warning'
  if (nonRiskNutritionCodes.has(code) || code === 'HEALTHY') return 'success'
  return 'default'
}
function latestAssessment(rows: Assessment[]): Assessment | null {
  return [...rows].sort((a, b) =>
    b.assessment_date.localeCompare(a.assessment_date)
      || Number(b.assessment_id) - Number(a.assessment_id),
  )[0] ?? null
}
function nutritionSummary(record: Assessment | null): {
  label: string; tone: Tone; detail: string; reasons: string[]
} {
  if (!record) return {
    label: 'Nutrition: Not assessed', tone: 'default',
    detail: 'No saved nutritional assessment is available for this child.', reasons: [],
  }
  const values = [record.weight_for_age, record.height_for_age, record.weight_for_height,
    record.nutritional_status, record.bmi_for_age, record.muac_status]
  const codes = values.map(classificationCode)
  const reasons = [...new Set(codes.filter((code) => riskNutritionCodes.has(code)))].map(classificationLabel)
  if (record.is_at_risk === true) return {
    label: 'Nutrition: At risk',
    tone: codes.some((code) => urgentNutritionCodes.has(code)) ? 'danger' : 'warning',
    detail: codes.includes('NOT_INTERPRETABLE_EDEMA')
      ? 'The saved assessment is flagged for nutrition follow-up. Weight-based indicators are recorded as not interpretable because of edema.'
      : 'The latest saved assessment is flagged for nutrition follow-up. Review its classifications and related alerts.',
    reasons,
  }
  if (record.is_at_risk === false) return {
    label: 'Nutrition: No recorded risk', tone: 'success',
    detail: 'The latest saved assessment has no recorded nutritional risk. This describes that assessment only.', reasons: [],
  }
  return {
    label: 'Nutrition: Needs review', tone: 'warning',
    detail: 'The stored risk result is unavailable or incomplete. A normal result is not assumed.', reasons: [],
  }
}
function InfoRow({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-3 py-2">
      <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value ?? '—'}</dd>
    </div>
  )
}
function SectionCard({ title, subtitle, icon, children, action }: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {icon && <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>}
          <div>
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-sm text-muted-foreground">
        {label}
      </td>
    </tr>
  )
}
export default function ChildProfilePage({ params }: { params: Promise<{ childId: string }> }) {
  // Next 16 app-router: params is a Promise, unwrapped with React.use()
  const { childId } = use(params)
  const parsedId = Number(String(childId).replace(/^CH-/i, ''))
  const { user, isReady } = useAuth()
  const role = user?.role as UserRole | undefined
  const isApproved = user?.accountStatus === 'APPROVED'
  const canView = Boolean(role && isApproved && canPerform(role, 'Child Profiling', 'view'))
  const canEdit = Boolean(role && isApproved && canPerform(role, 'Child Profiling', 'edit'))
  const canViewNutrition = Boolean(role && isApproved && canPerform(role, 'Nutritional Assessment', 'view'))
  const { data, error, isLoading, mutate } = useSWR<ProfilePayload>(
    isReady && canView && Number.isSafeInteger(parsedId) && parsedId > 0 ? `/api/children?childId=${parsedId}` : null,
    fetcher,
  )
  // In-place edit modal: opens over this profile page, saves via PATCH /api/children,
  // and on success mutates the SWR cache so the profile re-renders with the new data
  // without the user leaving the page.
  const [editOpen, setEditOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const { showToast } = useToast()
  // Movement history — loaded alongside the main profile. Updates whenever the user
  // marks a status change via the ChangeStatusModal (we mutate() this on save).
  const { data: movements, mutate: mutateMovements } = useSWR<MovementRow[]>(
    isReady && canView && Number.isSafeInteger(parsedId) && parsedId > 0 ? `/api/children/${parsedId}/movement` : null,
    fetcher,
  )
  if (!isReady) {
    return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading child profile...</div>
  }
  if (!canView) {
    return (
      <div className="space-y-4">
        <Link href="/child-profiling/children" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back to Children</Link>
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">You are not authorized to view child profiles.</div>
      </div>
    )
  }
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
    return (
      <div className="space-y-4">
        <Link href="/child-profiling/children" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back to Children</Link>
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">Invalid child ID.</div>
      </div>
    )
  }
  if (isLoading || !data) {
    if (error) {
      return (
        <div className="space-y-4">
          <Link href="/child-profiling/children" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back to Children</Link>
          <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">{error.message}</div>
        </div>
      )
    }
    return <div className="rounded-2xl border border-border bg-white p-10 text-center text-muted-foreground">Loading child profile...</div>
  }
  const { child, guardian, profile, monitoringStatus, barangay, household, rhu, vaccinations, assessments, supplementations } = data
  const fullName = [child.first_name, child.middle_name, child.last_name].filter(Boolean).join(' ')
  const latestNutrition = latestAssessment(assessments ?? [])
  const nutrition = nutritionSummary(latestNutrition)
  const guardianName = guardian ? [guardian.first_name, guardian.middle_name, guardian.last_name].filter(Boolean).join(' ') : null
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/child-profiling/children" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back to Children</Link>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStatusOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
              <ArrowRightLeft size={16} />Change status
            </button>
            <button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5">
              <Pencil size={16} />Edit profile
            </button>
          </div>
        )}
      </div>
      {/* Hero card: child identity + quick status chips */}
      <section className="rounded-2xl border border-border bg-gradient-to-r from-primary/5 to-sky-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-4 text-primary">
              <Baby size={32} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Child ID · {formatChildId(child.child_id, child.registration_date)}</p>
              <h1 className="mt-1 text-3xl font-bold text-foreground">{fullName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {titleCase(child.sex)} · {ageDescription(child.date_of_birth)} · Born {formatDate(child.date_of_birth)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip tone="success">{classificationForDob(child.date_of_birth)}</Chip>
            <Chip tone={statusTone(monitoringStatus)}>Monitoring: {monitoringStatus}</Chip>
            <Chip>{child.status ?? 'ACTIVE'}</Chip>
            <Chip tone={nutrition.tone}>{nutrition.label}</Chip>
          </div>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal information */}
        <SectionCard title="Personal Information" subtitle="Profiling details collected during the home visit" icon={<Baby size={18} />}>
          <dl className="divide-y divide-border">
            <InfoRow label="Full name" value={fullName} />
            <InfoRow label="Date of birth" value={formatDate(child.date_of_birth)} />
            <InfoRow label="Sex" value={titleCase(child.sex)} />
            <InfoRow label="Birth place" value={child.birth_place || '—'} />
            <InfoRow label="Registration date" value={formatDate(child.registration_date)} />
            <InfoRow label="Address" value={child.address || '—'} icon={<MapPin size={14} />} />
            <InfoRow label="Barangay" value={barangay ? `${barangay.barangay_name}${barangay.municipality ? ` · ${barangay.municipality}` : ''}${barangay.province ? `, ${barangay.province}` : ''}` : '—'} />
            <InfoRow label="RHU" value={rhu?.rhu_name || '—'} />
            <InfoRow
              label="Household"
              value={household ? (
                <span>
                  {household.household_no ? <strong>HH-{household.household_no}</strong> : `HH-${household.household_id}`}
                  {household.household_address && <> · {household.household_address}</>}
                  {household.purok && <> · Purok {household.purok}</>}
                  {household.is_4ps_member && <> · <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">4Ps member</span></>}
                </span>
              ) : '—'}
              icon={<Home size={14} />}
            />
            {profile && (
              <>
                <InfoRow label="Civil status" value={profile.civil_status} />
                <InfoRow label="Educational attainment" value={profile.educational_attainment} />
                <InfoRow label="Religion" value={profile.religion} />
                <InfoRow label="Ethnicity" value={profile.ethnicity} />
                <InfoRow label="PhilHealth ID" value={profile.philhealth_id_number} />
                <InfoRow label="PhilHealth membership" value={profile.philhealth_membership_type ? `${profile.philhealth_membership_type}${profile.philhealth_category ? ` (${profile.philhealth_category})` : ''}` : '—'} />
                <InfoRow label="Water source" value={profile.water_source_type} />
                <InfoRow label="Toilet facility" value={profile.toilet_facility_type} />
                <InfoRow label="Medical history" value={profile.medical_history || '—'} />
              </>
            )}
          </dl>
        </SectionCard>
        {/* Guardian information */}
        <SectionCard title="Guardian Information" subtitle="Person responsible for the child's care" icon={<Users size={18} />}>
          {guardian ? (
            <dl className="divide-y divide-border">
              <InfoRow label="Guardian name" value={guardianName} />
              <InfoRow label="Relationship" value={guardian.relationship_to_child} />
              <InfoRow label="Contact number" value={guardian.contact_number} icon={<Phone size={14} />} />
              <InfoRow label="Address" value={guardian.address} icon={<MapPin size={14} />} />
            </dl>
          ) : (
            <div className="rounded-xl bg-muted/50 p-6 text-center text-sm text-muted-foreground">
              No guardian linked to this child yet. Use the Edit button to register or link one.
            </div>
          )}
        </SectionCard>
      </div>
      {/* NIP-USR001 — Vaccination Schedule request + preview. Computed from DOB + NIP
          catalog, already-administered doses excluded. BHW/RHM can request, PHN reviews. */}
      <VaccinationScheduleSection childId={child.child_id} />
      {/* NIP-USR004 — Immunization History with computed due/overdue status.
          Replaces the old plain table that showed any vaccination_record row. */}
      <ImmunizationHistorySection childId={child.child_id} />
      {/* Latest nutritional assessment */}
      <SectionCard
        title="Latest Nutritional Assessment"
        subtitle={latestNutrition
          ? `Assessment #${latestNutrition.assessment_id} · ${formatDate(latestNutrition.assessment_date)}`
          : 'Saved assessment results'}
        icon={<AlertCircle size={18} />}
        action={canViewNutrition
          ? <Link href="/nutritional-assessment/records" className="text-sm font-medium text-primary underline">View assessments</Link>
          : undefined}
      >
        <div className="space-y-3">
          <Chip tone={nutrition.tone}>{nutrition.label}</Chip>
          <p className="text-sm text-muted-foreground">{nutrition.detail}</p>
          {nutrition.reasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {nutrition.reasons.map((reason) => (
                <Chip key={reason} tone={statusTone(reason)}>{reason}</Chip>
              ))}
            </div>
          )}
          {latestNutrition && (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Weight-for-age', value: latestNutrition.weight_for_age },
                { label: 'Height-for-age', value: latestNutrition.height_for_age },
                { label: 'Weight-for-length/height', value: latestNutrition.weight_for_height },
                { label: 'Screening status', value: latestNutrition.nutritional_status },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-muted/40 p-3">
                  <dt className="mb-2 text-xs text-muted-foreground">{item.label}</dt>
                  <dd>
                    <Chip tone={statusTone(item.value ?? '')}>
                      {classificationLabel(item.value)}
                    </Chip>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-xs text-muted-foreground">
            Based on the latest saved assessment.
          </p>
        </div>
      </SectionCard>
      {/* Nutritional assessment history */}
      <NutritionHistorySection assessments={assessments ?? []} />
      {/* Supplementation history */}
      <SectionCard title="Supplementation History" subtitle={`${supplementations.length} record${supplementations.length === 1 ? '' : 's'}`} icon={<Pill size={18} />}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/60">
              <tr>
                {['Date', 'Supplement', 'Dosage', 'Qty', 'Batch', 'Remarks'].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {supplementations.length === 0 ? (
                <EmptyRow colSpan={6} label="No supplementations recorded yet." />
              ) : (
                supplementations.map((record) => (
                  <tr key={record.supplementation_record_id}>
                    <td className="px-4 py-3 text-sm">{formatDate(record.supplementation_date)}</td>
                    <td className="px-4 py-3 text-sm font-medium">{record.supplement?.supplement_type ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">{record.supplement?.dosage ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">{record.quantity_given ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">{record.batch_number ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{record.remarks ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      {/* Movement history — only renders when at least one movement is on file.
          Shows chronological audit trail of status changes (MOVED/LOST/RETURNED/TRANSFERRED). */}
      {movements && movements.length > 0 && (
        <SectionCard title="Movement History" subtitle={`${movements.length} record${movements.length === 1 ? '' : 's'}`} icon={<History size={18} />}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/60">
                <tr>
                  {['Date', 'Type', 'Status', 'Reason', 'New address', 'Remarks'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((record) => (
                  <tr key={record.movement_id}>
                    <td className="px-4 py-3 text-sm">{formatDate(record.movement_date)}</td>
                    <td className="px-4 py-3 text-sm font-medium">{record.movement_type}</td>
                    <td className="px-4 py-3 text-sm">{record.status}</td>
                    <td className="px-4 py-3 text-sm">{record.reason ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">{record.new_address ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{record.remarks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      {editOpen && canEdit && (
        <ChildFormModal
          mode="edit"
          childId={parsedId}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            // Re-fetch the profile so every section (personal info, guardian, history)
            // re-renders with the saved values. User stays on this page.
            mutate()
            showToast({ type: 'success', message: 'Changes saved' })
          }}
          onError={(message) => showToast({ type: 'error', message })}
        />
      )}
      {statusOpen && canEdit && (
        <ChangeStatusModal
          childId={parsedId}
          currentStatus={child.status ?? 'ACTIVE'}
          childName={fullName}
          onClose={() => setStatusOpen(false)}
          onSaved={() => {
            setStatusOpen(false)
            // Refetch both the profile (status chip updates) and movement history (new row).
            mutate()
            mutateMovements()
            showToast({ type: 'success', message: 'Status updated' })
          }}
          onError={(message) => showToast({ type: 'error', message })}
        />
      )}
    </div>
  )
}