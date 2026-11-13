// Self-check: node --experimental-strip-types scripts/check-nutrition-status.mts
// The one nutritional-status color map (lib/nutrition-status) gives the agreed tones.
import assert from 'node:assert/strict'
import { nutritionTone } from '../lib/nutrition-status.ts'

const expect = { NORMAL: 'good', NOT_STUNTED: 'good', UNDERWEIGHT: 'warn', MAM: 'warn', STUNTED: 'nutrition',
  WASTED: 'danger', SAM: 'danger', SEVERELY_STUNTED: 'danger', SEVERELY_UNDERWEIGHT: 'danger', OVERWEIGHT: 'info',
  obese: 'info', 'possible risk of overweight': 'info', NOT_EVALUATED: 'neutral', '': 'neutral' } as const
for (const [code, tone] of Object.entries(expect)) assert.equal(nutritionTone(code), tone, code)
assert.equal(nutritionTone(null), 'neutral')
console.log('nutrition-status ok')
