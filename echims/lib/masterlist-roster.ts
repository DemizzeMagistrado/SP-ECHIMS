import { childProgramEligibility, manilaDate } from '@/lib/child-program-eligibility'
import { normalizePhMobile } from '@/lib/phone'

export const masterlistFields = [
  'child_first_name', 'child_middle_name', 'child_last_name', 'child_sex', 'child_date_of_birth',
  'child_birth_place', 'barangay_name', 'municipality', 'province', 'household_address',
  'purok', 'household_no', 'is_4ps_member', 'guardian_first_name', 'guardian_middle_name',
  'guardian_last_name', 'guardian_contact_number', 'guardian_relationship',
] as const

export type MasterlistLocation = {
  barangay_id: number
  barangay_name: string
  municipality: string
  province: string
  allowed: boolean
}

export type RosterRow = { rowNumber: number; raw: Record<string, string> }

const key = (value = '') => value.trim().replace(/\s+/g, ' ').toLowerCase()
const clean = (value = '') => /^#(NAME\?|REF!|DIV\/0!|N\/A|VALUE!|NUM!|NULL!|ERROR!)$/i.test(value.trim()) ? '' : value.trim()

function parseCsv(text: string) {
  const rows: string[][] = []
  let field = '', row: string[] = [], quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (!quoted && c === ',') {
      row.push(field); field = ''
    } else if (!quoted && c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (quoted || c !== '\r') field += c
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted field.')
  if (field || row.length) rows.push([...row, field])
  return rows
}

export function masterlistRaw(input: Record<string, unknown>) {
  return Object.fromEntries(masterlistFields.map(field => [field, typeof input[field] === 'string' ? clean(input[field]) : '']))
}

function dob(value: string) {
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (!slashed) return value
  const [, month, day, year] = slashed
  return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-')
}

function rosterName(value: string) {
  const split = value.indexOf(',')
  if (split < 0) return { first: value.trim(), last: '' }
  return { first: value.slice(split + 1).trim(), last: value.slice(0, split).trim() }
}

export function readMasterlist(text: string, filename: string, selected: MasterlistLocation | undefined, today = manilaDate()) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  const header = rows.findIndex(row => row.some(cell => cell.trim()))
  if (header < 0) throw new Error('The CSV has no data.')
  if (key(rows[header][0]) === 'household profile summary') {
    throw new Error('This CSV is a Household Profile Summary. Upload the Consolidation or OPT+ child roster to import individual profiles.')
  }

  const consolidation = rows.findIndex(row => key(row[2]) === 'barangay' && key(row[4]) === 'name of household members' && key(row[9]) === 'date of birth')
  const opt = rows.findIndex(row => key(row[0]) === 'child seq.' && key(row[2]) === 'name of mother or caregiver' && key(row[3]) === "child's full name" && key(row[6]) === 'date of birth')
  const result: RosterRow[] = []
  let outsideAge = 0

  if (consolidation >= 0) {
    let household = { household_no: '', barangay_name: '' }
    for (let index = consolidation + 2; index < rows.length; index++) {
      const row = rows[index].map(clean)
      if (!row[4] && !row[5] && !row[6]) continue
      // A household marker or a new head ends the previous group, even when its location is blank.
      if (row[0] || row[1] || row[2] || /^(?:1\s*-\s*)?head$/i.test(row[7])) {
        household = { household_no: row[1] ?? '', barangay_name: row[2] ?? '' }
      }
      const birth = dob(row[9] ?? '')
      const age = childProgramEligibility(birth || null, 'ACTIVE', today)
      if (age.ageScope === 'AGED_OUT') { outsideAge++; continue }
      const reportedYears = /^(\d+)\s+years?/i.exec(row[10] ?? '')
      if (age.ageScope === 'NEEDS_REVIEW' && reportedYears && Number(reportedYears[1]) >= 5) {
        outsideAge++; continue
      }
      if (age.ageScope === 'NEEDS_REVIEW' && !reportedYears && !/\b(?:son|daughter|child)\b/i.test(row[7] ?? '')) continue
      result.push({ rowNumber: index + 1, raw: masterlistRaw({
        ...household, child_last_name: row[4], child_first_name: row[5], child_middle_name: row[6],
        child_date_of_birth: birth, child_sex: row[11], is_4ps_member: row[16],
      }) })
    }
  } else if (opt >= 0) {
    if (!selected?.allowed) throw new Error('Select the barangay named on the OPT+ roster from your assigned locations.')
    const sourceName = /\bOPT\s+VERSION\s+\d+\s+(.+?)\s+20\d{2}\b/i.exec(filename)?.[1]
    if (sourceName && key(sourceName) !== key(selected.barangay_name)) {
      throw new Error('The barangay in the OPT+ filename differs from the selected barangay.')
    }
    for (let index = opt + 3; index < rows.length; index++) {
      const row = rows[index].map(clean)
      if (!row[3]) continue
      const child = rosterName(row[3])
      const guardian = rosterName(row[2] ?? '')
      const location = row[1] ?? ''
      const birth = dob(row[6] ?? '')
      if (childProgramEligibility(birth || null, 'ACTIVE', today).ageScope === 'AGED_OUT') { outsideAge++; continue }
      result.push({ rowNumber: index + 1, raw: masterlistRaw({
        child_first_name: child.first, child_last_name: child.last, child_sex: row[5], child_date_of_birth: birth,
        barangay_name: selected.barangay_name, municipality: selected.municipality, province: selected.province,
        purok: location, guardian_first_name: guardian.first, guardian_last_name: guardian.last,
      }) })
    }
  } else {
    const headers = rows[header].map(key)
    if (!headers.some(value => value === 'child_first_name' || value === 'child_last_name')) {
      throw new Error('Use the eCHIMS template, the Household Profiling Consolidation roster, or the OPT+ Clean&Update roster.')
    }
    for (let index = header + 1; index < rows.length; index++) {
      if (!rows[index].some(cell => cell.trim())) continue
      const entries = headers.map((name, column) => [name, rows[index][column]])
      result.push({ rowNumber: index + 1, raw: masterlistRaw(Object.fromEntries(entries)) })
    }
  }

  return { rows: result, outsideAge }
}

export function validateMasterlistRow(raw: Record<string, string>, locations: MasterlistLocation[], today = manilaDate()) {
  const errors: string[] = []
  const matchingLocations = locations.filter(location =>
    key(location.barangay_name) === key(raw.barangay_name)
    && (!raw.municipality || key(location.municipality) === key(raw.municipality))
    && (!raw.province || key(location.province) === key(raw.province)))
  const location = matchingLocations.length === 1 ? matchingLocations[0] : null
  if (!location) errors.push(matchingLocations.length > 1 ? 'Confirm which municipality and province this barangay belongs to.' : 'Confirm the child’s barangay.')
  if (location && !location.allowed) errors.push('Barangay is outside your assignment.')

  if (!raw.child_first_name || !raw.child_last_name) errors.push('Complete the child’s first and last names.')
  const sex = key(raw.child_sex).replace(/^[mf]\s*-\s*/, '')
  const normalizedSex = sex === 'm' || sex === 'male' ? 'MALE' : sex === 'f' || sex === 'female' ? 'FEMALE' : ''
  if (!normalizedSex) errors.push('Verify the child’s sex.')
  const birth = dob(raw.child_date_of_birth)
  const age = childProgramEligibility(birth || null, 'ACTIVE', today)
  if (age.ageScope === 'NEEDS_REVIEW') errors.push('Verify the child’s date of birth.')
  if (age.ageScope === 'AGED_OUT') errors.push('Child is outside the 0–59 month age range.')

  const mobile = raw.guardian_contact_number ? normalizePhMobile(raw.guardian_contact_number) : ''
  const fourPs = key(raw.is_4ps_member)
  return {
    errors,
    location,
    normalized: {
      ...raw,
      child_address: raw.household_address || raw.purok,
      child_date_of_birth: birth,
      child_sex: normalizedSex,
      guardian_contact_number: mobile || '',
      is_4ps_member: ['1', 'yes', 'true'].includes(fourPs) ? 'true' : ['0', 'no', 'false'].includes(fourPs) ? 'false' : '',
      barangay_id: location?.allowed ? String(location.barangay_id) : '',
    },
  }
}
