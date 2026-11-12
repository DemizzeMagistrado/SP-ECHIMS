// Self-check: node --experimental-strip-types scripts/check-nip-schedule.mts
import assert from 'node:assert/strict'
import { NIP_CATALOG, nipVaccineTimeline, nipNextDose } from '../lib/nip-schedule.ts'
import { normalizeBatchNumber, batchNumberError, parseBatchRule, DEFAULT_BATCH_RULE } from '../lib/vaccination-config.ts'

const v = (code: string) => NIP_CATALOG.find((x) => x.code === code)!

// Penta: born 2026-01-01 → due 02-12, 03-12, 04-09. Nothing given, today 2026-03-20.
let t = nipVaccineTimeline('2026-01-01', v('PENTA'), [], '2026-03-20')
assert.deepEqual(t.map((d) => [d.status, d.rescheduled_date]), [
  ['OVERDUE', '2026-03-20'],   // dose 1 missed → today
  ['OVERDUE', '2026-04-17'],   // dose 2 missed → dose 1 + 28 days
  ['UPCOMING', '2026-05-15'],  // dose 3 pending, pushed after dose 2
])
assert.equal(nipNextDose(t)?.date, '2026-03-20')

// Dose 1 given late: dose 2 pending but pushed to dose 1 + 28.
t = nipVaccineTimeline('2026-01-01', v('PENTA'), ['2026-03-01'], '2026-03-05')
assert.deepEqual(t.map((d) => [d.status, d.rescheduled_date]), [['COMPLETE', null], ['UPCOMING', '2026-03-29'], ['UPCOMING', '2026-04-26']])

// BCG after the first birthday: Not eligible, not Missed.
t = nipVaccineTimeline('2025-01-01', v('BCG'), [], '2026-01-02')
assert.equal(t[0].status, 'NOT_ELIGIBLE')
t = nipVaccineTimeline('2025-06-01', v('BCG'), [], '2026-01-02')
assert.deepEqual([t[0].status, t[0].rescheduled_date], ['OVERDUE', '2026-01-02'])

// Due today = Pending; day after = Missed.
assert.equal(nipVaccineTimeline('2026-01-01', v('HEPB'), [], '2026-01-01')[0].status, 'UPCOMING')
assert.equal(nipVaccineTimeline('2026-01-01', v('HEPB'), [], '2026-01-02')[0].status, 'OVERDUE')

assert.equal(normalizeBatchNumber('  bt  2026--0012 '), 'BT-2026-0012')
assert.equal(batchNumberError('bt 2026 0012'), null)
assert.ok(batchNumberError('BT/2026'))
assert.equal(batchNumberError(''), null)
// Configurable rule (Settings › Vaccine Catalog): slash allowed, 4–10 characters.
const slash = parseBatchRule({ min: 4, max: 10, separators: '/-', example: 'AB/12' })
assert.equal(batchNumberError('ab/12', slash), null)
assert.ok(batchNumberError('ab/12', DEFAULT_BATCH_RULE))
assert.ok(batchNumberError('A1', slash))                       // too short
assert.deepEqual(parseBatchRule({ min: 9, max: 3, separators: '-' }), DEFAULT_BATCH_RULE) // insane → default
assert.deepEqual(parseBatchRule({ min: 2, max: 30, separators: '-x' }).separators, '-')
console.log('nip-schedule ok')
