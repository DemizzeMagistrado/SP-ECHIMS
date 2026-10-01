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


export const rolePermissions: Record<
  Role,
  Permission[]
> = {

  /* =====================================================
     ADMINISTRATOR
  ===================================================== */

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


  /* =====================================================
     PUBLIC HEALTH NURSE
  ===================================================== */

  PHN: [
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
  ],


  /* =====================================================
     RURAL HEALTH MIDWIFE
  ===================================================== */

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


  /* =====================================================
     BARANGAY HEALTH WORKER
  ===================================================== */

  BHW: [
    'dashboard.view',

    'health_activities.view',
    'health_activities.request',

    'gis.view',

    'vaccination.view',
    'vaccination.create',

    'nutrition.view',

    'supplementation.view',

    'reports.view',
  ],


  /* =====================================================
     BARANGAY NUTRITION SCHOLAR
  ===================================================== */

  BNS: [
    'dashboard.view',

    'health_activities.view',
    'health_activities.request',


    'gis.view',

    'nutrition.view',
    'nutrition.create',
    'nutrition.update',

    'supplementation.view',
    'supplementation.create',
    'supplementation.update',

    'reports.view',
  ],
}


/* =======================================================
   PERMISSION CHECK
======================================================= */

export function hasPermission(
  role: Role,
  permission: Permission
): boolean {
  return rolePermissions[role]?.includes(permission) ?? false
}