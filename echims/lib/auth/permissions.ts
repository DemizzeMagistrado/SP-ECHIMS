export type Role =
  | 'Administrator'
  | 'PHN'
  | 'RHM'
  | 'BHW'
  | 'BNS'

export type Permission =
  | 'dashboard.view'

  | 'health_activities.view'
  | 'health_activities.request'
  | 'health_activities.review'
  | 'health_activities.approve'
  | 'health_activities.announce'

  | 'gis.view'

  | 'vaccination.view'
  | 'vaccination.create'
  | 'vaccination.update'
  | 'vaccination.approve'

  | 'nutrition.view'
  | 'nutrition.create'
  | 'nutrition.update'

  | 'supplementation.view'
  | 'supplementation.create'
  | 'supplementation.update'

  | 'inventory.view'
  | 'inventory.create'
  | 'inventory.approve'

  | 'reports.view'

  | 'users.view'
  | 'users.manage'

  | 'security_logs.view'

  | 'settings.manage'   


  export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Administrator: [
    'dashboard.view',

    'health_activities.view',
    'health_activities.request',
    'health_activities.review',
    'health_activities.approve',
    'health_activities.announce',

    'gis.view',

    'vaccination.view',
    'vaccination.create',
    'vaccination.update',
    'vaccination.approve',

    'nutrition.view',
    'nutrition.create',
    'nutrition.update',

    'supplementation.view',
    'supplementation.create',
    'supplementation.update',

    'inventory.view',
    'inventory.create',
    'inventory.approve',

    'reports.view',

    'users.view',
    'users.manage',

    'security_logs.view',
    'settings.manage',
  ],

  PHN: [
    'dashboard.view',

    'health_activities.view',
    'health_activities.review',
    'health_activities.approve',
    'health_activities.announce',

    'gis.view',

    'vaccination.view',
    'vaccination.create',
    'vaccination.update',
    'vaccination.approve',

    'nutrition.view',
    'nutrition.update',

    'supplementation.view',
    'supplementation.create',
    'supplementation.update',

    'inventory.view',
    'inventory.approve',

    'reports.view',
  ],

  RHM: [
    'dashboard.view',

    'health_activities.view',
    'health_activities.request',

    'gis.view',

    'vaccination.view',
    'vaccination.create',
    'vaccination.update',

    'nutrition.view',
    'nutrition.create',
    'nutrition.update',

    'supplementation.view',
    'supplementation.create',
    'supplementation.update',

    'inventory.view',
    'inventory.create',

    'reports.view',
  ],

  BHW: [
    'dashboard.view',

    'health_activities.view',
    'health_activities.request',

    'gis.view',

    'vaccination.view',
    'vaccination.create',

    'reports.view',
  ],

  BNS: [
    'dashboard.view',

    'health_activities.view',
    'health_activities.request',

    'gis.view',

    'nutrition.view',
    'nutrition.create',
    'nutrition.update',

    'supplementation.view',

    'reports.view',
  ],
}

export function hasPermission(
  role: Role,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}