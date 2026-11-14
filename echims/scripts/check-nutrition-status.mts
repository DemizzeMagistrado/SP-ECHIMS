// Self-check: node --experimental-strip-types scripts/check-nutrition-status.mts
// The one nutritional-status color map (lib/nutrition-status) gives the agreed tones.
import assert from 'node:assert/strict'
import { nutritionTone } from '../lib/nutrition-status.ts'

const expect = { NORMAL: 'healthy', NOT_STUNTED: 'healthy', NO_FLAGGED_INDICATORS: 'healthy', UNDERWEIGHT: 'warn', MAM: 'warn',
  STUNTED: 'nutrition', WASTED: 'severe', SAM: 'severe', INFANT_URGENT_REVIEW: 'severe', SEVERELY_STUNTED: 'severe',
  SEVERELY_UNDERWEIGHT: 'severe', OVERWEIGHT: 'info', obese: 'info', 'possible risk of overweight': 'risk',
  NOT_EVALUATED: 'neutral', '': 'neutral' } as const
for (const [code, tone] of Object.entries(expect)) assert.equal(nutritionTone(code), tone, code)
assert.equal(nutritionTone(null), 'neutral')
console.log('nutrition-status ok')
