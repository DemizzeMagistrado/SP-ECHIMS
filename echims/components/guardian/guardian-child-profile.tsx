import { Baby, Home, Users } from 'lucide-react'
import { ChildProfileBanner, InfoRow, SectionCard } from '@/components/children/child-profile-cards'
import { StatusBadge } from '@/components/ui/status-badge'
import { ageDescription, classificationForDob } from '@/lib/children/profile-age'
import { childName, type GuardianChild, type GuardianNutritionSummary } from '@/lib/guardian/types'

export function guardianDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—'
  return new Date(value + 'T00:00:00Z').toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila',
  })
}

export function guardianLabel(value?: string | null) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/^./, first => first.toUpperCase()) : '—'
}

export function GuardianChildBanner({ child }: { child: GuardianChild }) {
  const status = child.status
  const tone = status === 'ACTIVE' ? 'good' : status === 'DECEASED' ? 'danger' : status === 'MOVED' || status === 'LOST' ? 'warn' : 'neutral'
  return (
    <ChildProfileBanner>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="hidden rounded-xl bg-brand-ice p-3 text-primary sm:block"><Baby size={28} aria-hidden="true" /></div>
          <div className="min-w-0">
            <h1 className="break-words font-display text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">{childName(child)}</h1>
            <p className="mt-1 text-sm text-brand-muted">{guardianLabel(child.sex)} · {ageDescription(child.dateOfBirth)} · Born {guardianDate(child.dateOfBirth)}</p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              <div className="flex items-center gap-1.5"><dt className="text-brand-muted">Child ID</dt><dd className="font-mono font-semibold text-brand-navy">{child.childCode ?? '—'}</dd></div>
              <div className="flex items-center gap-1.5"><dt className="text-brand-muted">Family Serial Number (FSN)</dt><dd className="font-mono font-semibold text-brand-navy">{child.household?.familySerialNo ?? '—'}</dd></div>
            </dl>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status && <StatusBadge status={status} tone={tone} dot />}
          <StatusBadge status="age" tone="info" label={classificationForDob(child.dateOfBirth)} />
        </div>
      </div>
    </ChildProfileBanner>
  )
}

export function GuardianChildInformation({ child, guardianName, nutrition }: {
  child: GuardianChild
  guardianName?: string
  nutrition?: GuardianNutritionSummary
}) {
  return (
    <>
      <SectionCard title="Child Information" subtitle="Details of the registered child" icon={<Baby size={18} />}>
        <dl className="grid gap-x-8 divide-y divide-border md:grid-cols-2 md:divide-y-0">
          <div className="divide-y divide-border">
            <InfoRow label="Full name" value={childName(child)} />
            <InfoRow label="Sex" value={guardianLabel(child.sex)} />
            <InfoRow label="Date of birth" value={guardianDate(child.dateOfBirth)} />
            <InfoRow label="Age group" value={classificationForDob(child.dateOfBirth)} />
          </div>
          <div className="divide-y divide-border">
            <InfoRow label="Place of birth" value={child.birthPlace} />
            <InfoRow label="Birth weight" value={child.birthWeightKg != null ? `${child.birthWeightKg} kg` : null} />
            <InfoRow label="Birth height" value={child.birthLengthCm != null ? `${child.birthLengthCm} cm` : null} />
            <InfoRow label="Registered" value={guardianDate(child.registeredAt)} />
          </div>
        </dl>
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="font-semibold text-primary">Latest nutritional assessment</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {nutrition ? `${guardianDate(nutrition.date)} · ${guardianLabel(nutrition.status)}` : 'No nutritional assessment yet'}
          </p>
        </div>
      </SectionCard>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Guardian Information" subtitle="Your linked guardian account" icon={<Users size={18} />}>
          <dl><InfoRow label="Full name" value={guardianName} /></dl>
        </SectionCard>
        <SectionCard title="Household Information" subtitle="Where the child lives" icon={<Home size={18} />}>
          <dl className="divide-y divide-border">
            <InfoRow label="Family Serial Number (FSN)" value={child.household?.familySerialNo} />
            <InfoRow label="Household address" value={child.household?.address} />
            <InfoRow label="Child’s address" value={child.address} />
          </dl>
        </SectionCard>
      </div>
    </>
  )
}
