// Child Profiling form model: the three sections (Child → Guardian → Household), their option
// lists and per-step validation. Shared by the registration/edit form, the profile page and drafts.
// The child is the one registered; guardian and household details are given by the parent or
// guardian (the informant) and encoded by the health worker.

export type ChildForm = Record<string, string | boolean>

export const STEPS = [
  { key: 'child', label: 'Child', title: 'Child Information' },
  { key: 'guardian', label: 'Guardian', title: 'Guardian Information' },
  { key: 'household', label: 'Household', title: 'Household Information' },
  { key: 'review', label: 'Review', title: 'Review' },
] as const
export type StepKey = (typeof STEPS)[number]['key']

export const emptyChildForm: ChildForm = {
  // Child Information
  first_name: '', middle_name: '', last_name: '', date_of_birth: '', sex: '', birth_place: '',
  birth_weight_kg: '', birth_height_cm: '',
  relationship_to_household_head: '', relationship_to_household_head_other: '',
  civil_status: '', civil_status_other: '',
  religion: '', religion_other: '', ethnicity: '', ethnicity_other: '',
  philhealth_id_number: '', philhealth_membership_type: '', philhealth_membership_type_other: '',
  philhealth_category: '', philhealth_category_other: '',
  has_hypertension: false, has_diabetes_mellitus: false, has_tuberculosis: false, has_others: false,
  medical_history_other: '', medical_history_notes: '', medical_history: '', last_menstrual_period: '',
  // Guardian Information
  mother_name: '', father_name: '',
  guardian_id: '', guardian_first_name: '', guardian_middle_name: '', guardian_last_name: '',
  guardian_contact_number: '', guardian_address: '', guardian_relationship_to_child: '',
  informant_name: '', informant_relationship: '',
  // Household Information
  barangay_id: '', address: '', household_id: '', household_no: '', household_address: '', purok: '',
  is_4ps_member: false,
  water_source_type: '', water_source_type_other: '', toilet_facility_type: '', toilet_facility_type_other: '',
}

export const otherAwareFields = [
  'relationship_to_household_head', 'civil_status', 'religion', 'ethnicity',
  'philhealth_membership_type', 'philhealth_category', 'water_source_type', 'toilet_facility_type',
] as const

export const options = {
  relationship_to_household_head: [
    'Head', 'Spouse', 'Son', 'Daughter', 'Sister', 'Brother', 'Father', 'Mother', 'Grandmother',
    'Grandfather', 'Aunt', 'Uncle', 'Brother-in-Law', 'Sister-in-Law', 'Mother-in-Law', 'Father-in-Law',
    'Grandson', 'Granddaughter', 'Cousin', 'Step-Sibling', 'Step-Child', 'Son/Daughter-in-Law', 'Other',
  ],
  civil_status: ['Single', 'Married', 'Live-in', 'Widow/er', 'Separated', 'Cohabitation', 'Other'],
  religion: [
    'Roman Catholic', 'Christian', 'Iglesia ni Cristo', 'Catholic', 'Islam', 'Baptist', 'Born Again Christian',
    'Buddhism', 'Church of God', "Jehovah's Witness", 'Protestant', 'Seventh Day Adventist', 'LDS-Mormons',
    'Evangelical', 'Pentecostal', 'Unknown', 'Other',
  ],
  ethnicity: ['IP', 'Non-IP', 'Other'],
  philhealth_membership_type: ['Member', 'Dependent', 'N/A', 'No PhilHealth', 'Other'],
  philhealth_category: ['Direct Contributors', 'Indirect Contributors', 'Other'],
  water_source_type: ['Level 1', 'Level 2', 'Level 3', 'Unknown', 'Other'],
  toilet_facility_type: [
    'Pour/flush toilet connected to septic tank',
    'Pour/flush toilet connected to septic tank and sewerage system',
    'Ventilated Improved Pit (VIP) latrine or composting toilet',
    'Water-sealed connected to open drain', 'Overhung latrine', 'Open-pit latrine', 'Without toilet', 'Other',
  ],
  guardian_relationship_to_child: ['Mother', 'Father', 'Grandparent', 'Other Relative', 'Legal Guardian'],
}

/** No PhilHealth number or category applies to these memberships. */
export const NO_PHILHEALTH = new Set(['N/A', 'No PhilHealth'])

export function monthsOld(date: string) {
  const birth = new Date(`${date}T00:00:00Z`)
  const now = new Date()
  return (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth() -
    (now.getUTCDate() < birth.getUTCDate() ? 1 : 0)
}

export function classificationForDob(dob: string) {
  if (!dob) return ''
  const birth = new Date(`${dob}T00:00:00Z`)
  if (isNaN(birth.getTime())) return ''
  const days = Math.floor((Date.now() - birth.getTime()) / 86400000)
  const months = monthsOld(dob)
  if (days < 0) return ''
  if (days <= 28) return 'Newborn (0-28 days)'
  if (months < 12) return 'Infant (0-1 y/o)'
  if (months <= 59) return 'PSAC (1-4 y/o)'
  return 'Out of 0-59 months range'
}

export const MOBILE_PATTERN = /^(?:09[0-9]{9}|639[0-9]{9}|\+639[0-9]{9})$/

type StepContext = { mode: 'create' | 'edit'; newGuardian: boolean; newHousehold: boolean; contactChanged: boolean }

/** Plain-language errors for one step, keyed by form field. Empty object = step is valid. */
export function validateStep(step: StepKey, f: ChildForm, ctx: StepContext): Record<string, string> {
  const e: Record<string, string> = {}
  const s = (k: string) => String(f[k] ?? '').trim()
  if (step === 'child') {
    if (!s('first_name')) e.first_name = 'Enter the child’s first name.'
    if (!s('last_name')) e.last_name = 'Enter the child’s last name.'
    if (!s('sex')) e.sex = 'Choose the child’s sex.'
    const dob = s('date_of_birth')
    if (!dob) e.date_of_birth = 'Enter the date of birth.'
    else if (dob > new Date().toISOString().slice(0, 10)) e.date_of_birth = 'The date of birth cannot be in the future.'
    else if (monthsOld(dob) > 59) e.date_of_birth = 'eCHIMS covers children 0–59 months old. Check the year of birth.'
    const w = s('birth_weight_kg')
    if (w && !(Number(w) >= 0.3 && Number(w) <= 7)) e.birth_weight_kg = 'Enter birth weight in kilograms, between 0.3 and 7 (e.g. 3.2).'
    const h = s('birth_height_cm')
    if (h && !(Number(h) >= 20 && Number(h) <= 70)) e.birth_height_cm = 'Enter birth height in centimeters, between 20 and 70 (e.g. 49).'
  }
  if (step === 'guardian') {
    if (ctx.newGuardian) {
      if (!s('guardian_first_name')) e.guardian_first_name = 'Enter the guardian’s first name.'
      if (!s('guardian_last_name')) e.guardian_last_name = 'Enter the guardian’s last name.'
      if (!s('guardian_relationship_to_child')) e.guardian_relationship_to_child = 'Choose how the guardian is related to the child.'
    }
    const phone = s('guardian_contact_number')
    if (phone && (ctx.newGuardian || ctx.contactChanged) && !MOBILE_PATTERN.test(phone))
      e.guardian_contact_number = 'Use an 11-digit mobile number like 09171234567 (or 639… / +639…).'
    if (Boolean(s('informant_name')) !== Boolean(s('informant_relationship'))) {
      if (!s('informant_name')) e.informant_name = 'Enter who gave the information, or clear the relationship.'
      else e.informant_relationship = 'Enter how the informant is related to the child.'
    }
  }
  if (step === 'household') {
    if (!s('barangay_id')) e.barangay_id = 'Choose the barangay where the child lives.'
    if (ctx.mode === 'create' && !s('household_id') && !ctx.newHousehold)
      e.household_id = 'Search for the child’s household, or tick “Create new household”.'
    if (ctx.newHousehold && !s('household_address')) e.household_address = 'Enter the household address.'
  }
  return e
}
