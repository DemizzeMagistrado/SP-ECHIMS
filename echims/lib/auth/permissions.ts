// Auth-layer permission names (role codes PHN / RHM / BHW / BNS / Administrator), derived from the
// one role → module → actions matrix in lib/echims-data.ts (NIP-REV01). There is no second list
// here any more: each permission name maps to a (module, action) of that matrix.

import { canPerform, ROLE_NAME, type Permission as Action, type RoleCode } from '@/lib/echims-data'

export type Role = RoleCode

const PERMISSIONS = {
  'dashboard.view': ['Dashboard', 'view'],

  'health_activities.view': ['Health Activities', 'view'],
  'health_activities.request': ['Health Activities', 'create'],
  'health_activities.review': ['Health Activities', 'approve'],
  'health_activities.approve': ['Health Activities', 'approve'],
  'health_activities.announce': ['Health Activities', 'approve'],

  'gis.view': ['Geospatial', 'view'],
  'masterlist.import': ['Masterlist Upload', 'create'],

  'vaccination.view': ['Vaccination', 'view'],
  'vaccination.create': ['Vaccination', 'create'],
  'vaccination.update': ['Vaccination', 'edit'],
  'vaccination.approve': ['Vaccination', 'approve'],

  'nutrition.view': ['Nutritional Assessment', 'view'],
  'nutrition.create': ['Nutritional Assessment', 'create'],
  'nutrition.update': ['Nutritional Assessment', 'edit'],

  'supplementation.view': ['Supplementation', 'view'],
  'supplementation.create': ['Supplementation', 'create'],
  'supplementation.update': ['Supplementation', 'edit'],

  'inventory.view': ['Inventory', 'view'],
  'inventory.create': ['Inventory', 'create'],
  'inventory.approve': ['Inventory', 'approve'],

  'reports.view': ['Reports', 'view'],

  'users.view': ['User Management', 'view'],
  'users.manage': ['User Management', 'edit'],
  'security_logs.view': ['User Management', 'view'],
  'settings.manage': ['Organization', 'edit'],
} as const satisfies Record<string, readonly [string, Action]>

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: Role, permission: Permission): boolean {
  const name = ROLE_NAME[role]
  if (!name) return false
  const [module, action] = PERMISSIONS[permission]
  return canPerform(name, module, action)
}

/** Every permission a role has (derived), e.g. for display or tests. */
export function permissionsOf(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(role, p))
}
