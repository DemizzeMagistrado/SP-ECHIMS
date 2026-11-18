// Self-check: node --experimental-strip-types scripts/check-permissions.mts
// The one role matrix (lib/echims-data) and everything derived from it (sidebar, page access,
// auth-layer permissions) match the NIP-REV01 decisions in docs/permissions.md.
import assert from 'node:assert/strict'
import { canAccess, canPerform, roleModules, ROLE_NAME } from '../lib/echims-data.ts'
// lib/auth/permissions.ts maps 'vaccination.create' etc. to these (module, action) pairs.
const hasPermission = (code: keyof typeof ROLE_NAME, p: 'vaccination.create' | 'users.manage') =>
  canPerform(ROLE_NAME[code], p === 'vaccination.create' ? 'Vaccination' : 'User Management', p === 'vaccination.create' ? 'create' : 'edit')

const PHN = 'Public Health Nurse', RHM = 'Rural Health Midwife', BHW = 'Barangay Health Worker', BNS = 'Barangay Nutrition Scholar'

// Sidebar
assert.ok(roleModules.Administrator.includes('User Management'))
assert.ok(roleModules[RHM].includes('Inventory'), 'RHM sees Inventory')
assert.ok(!roleModules[BHW].includes('Inventory') && !roleModules[BNS].includes('Inventory'), 'no Inventory for BHW / BNS')
assert.ok(roleModules[BHW].includes('Supplementation'), 'BHW sees Supplementation')
assert.ok(roleModules[PHN].includes('Health Activities'))
for (const r of [PHN, RHM, BHW, BNS] as const) assert.ok(!roleModules[r].includes('User Management'))

// Masterlist: PHN and Admin only
assert.ok(canAccess(PHN, '/masterlist-upload') && canAccess('Administrator', '/masterlist-upload'))
for (const r of [RHM, BHW, BNS] as const) assert.ok(!canAccess(r, '/masterlist-upload'), `${r} masterlist`)

// Vaccination: PHN never creates; RHM / BHW record
assert.ok(!canPerform(PHN, 'Vaccination', 'create') && canPerform(PHN, 'Vaccination', 'approve'))
assert.ok(canPerform(RHM, 'Vaccination', 'create') && canPerform(BHW, 'Vaccination', 'create'))
assert.ok(!hasPermission('PHN', 'vaccination.create') && hasPermission('BHW', 'vaccination.create'))

// Inventory: RHM views, requests and logs usage; no receiving / allocation
assert.ok(canAccess(RHM, '/inventory/stock-overview') && canAccess(RHM, '/inventory/usage') && canAccess(RHM, '/inventory/batch-requests'))
assert.ok(!canAccess(RHM, '/inventory/stock-allocation') && !canPerform(RHM, 'Inventory', 'create'))
assert.ok(canPerform(RHM, 'Inventory', 'request') && canPerform(RHM, 'Inventory Transactions', 'create'))
assert.ok(!canAccess(BHW, '/inventory/batch-requests') && !canAccess(BHW, '/inventory/stock-overview'))

// Settings: BHW Profile / Security only; vaccines tab for every Vaccination role
assert.ok(!canPerform(BHW, 'Organization', 'view') && canPerform(PHN, 'Organization', 'view'))
for (const r of [PHN, RHM, BHW] as const) assert.ok(canAccess(r, '/vaccination/vaccines'))
assert.ok(!canAccess(BNS, '/vaccination/records'))

// Role codes ↔ names
assert.equal(ROLE_NAME.PHN, PHN)
assert.ok(hasPermission('Administrator', 'users.manage') && !hasPermission('PHN', 'users.manage'))
console.log('permissions ok')
