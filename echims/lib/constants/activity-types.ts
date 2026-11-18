// Health activity types: the three the database allows (health_activity_schedule_activity_type_check).

export type ActivityType = 'VACCINATION' | 'NUTRITIONAL_ASSESSMENT' | 'SUPPLEMENTATION'

/** bg / fg: the type pill; fg is also the calendar chip bar, dot and upcoming-card border. */
export const ACTIVITY_TYPE_META: Record<ActivityType, { label: string; short: string; bg: string; fg: string }> = {
  VACCINATION: { label: 'Vaccination', short: 'Vaccination', bg: '#FDEAEF', fg: '#A5304D' },
  NUTRITIONAL_ASSESSMENT: { label: 'Nutritional assessment', short: 'Nutritional', bg: '#E9F3FD', fg: '#1A5FB8' },
  SUPPLEMENTATION: { label: 'Supplementation', short: 'Supplementation', bg: '#E8F0FE', fg: '#2A6A8C' },
}

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_META) as ActivityType[]

export function activityTypeMeta(type: string) {
  return ACTIVITY_TYPE_META[type as ActivityType] ?? { label: type.replaceAll('_', ' '), short: type.replaceAll('_', ' '), bg: '#F0F2F5', fg: '#55617F' }
}
