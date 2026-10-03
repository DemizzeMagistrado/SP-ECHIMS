export type UserRole = 'Administrator' | 'Public Health Nurse' | 'Barangay Health Worker' | 'Rural Health Midwife' | 'Barangay Nutrition Scholar'

// Modules match the approved role matrix. "Limited" / "Approve" / "Request" / "Read" /
// "Nutrition" nuances live in rolePermissions below — presence in roleModules only
// controls whether the sidebar item and route are visible to the role.
export const roleModules: Record<UserRole, string[]> = {
  Administrator: ['Dashboard', 'User Management', 'Child Profiling', 'Geospatial', 'Masterlist Upload', 'Vaccination', 'Vaccination Schedule', 'Nutritional Assessment', 'Supplementation', 'Inventory', 'Stock Allocation', 'Inventory Transactions', 'Alerts', 'SMS', 'Reports', 'Settings', 'Organization'],
  'Public Health Nurse': ['Dashboard', 'Child Profiling', 'Geospatial', 'Masterlist Upload', 'Vaccination', 'Vaccination Schedule', 'Nutritional Assessment', 'Supplementation', 'Inventory', 'Stock Allocation', 'Inventory Transactions', 'Alerts', 'SMS', 'Reports', 'Settings', 'Organization'],
  'Barangay Health Worker': ['Dashboard', 'Child Profiling', 'Geospatial', 'Masterlist Upload', 'Vaccination', 'Vaccination Schedule', 'Inventory', 'Inventory Transactions', 'Alerts', 'Reports', 'Settings', 'Organization'],
  'Rural Health Midwife': ['Dashboard', 'Child Profiling', 'Geospatial', 'Vaccination', 'Vaccination Schedule', 'Nutritional Assessment', 'Supplementation', 'Inventory', 'Inventory Transactions', 'Alerts', 'Reports', 'Settings', 'Organization'],
  'Barangay Nutrition Scholar': ['Dashboard', 'Child Profiling', 'Geospatial', 'Masterlist Upload', 'Nutritional Assessment', 'Supplementation', 'Inventory', 'Inventory Transactions', 'Alerts', 'SMS', 'Reports', 'Settings', 'Organization'],
}

export const children = [
  { id: 'CH-2025-001', name: 'Maria Santos', age: '2 yrs 4 mos', barangay: 'San Isidro', status: 'Under Monitoring', risk: 'Normal' },
  { id: 'CH-2025-002', name: 'Juan Dela Cruz', age: '1 yr 8 mos', barangay: 'Poblacion', status: 'Needs Follow-up', risk: 'At Risk' },
  { id: 'CH-2025-003', name: 'Sofia Reyes', age: '3 yrs 1 mo', barangay: 'Mabini', status: 'Active', risk: 'Normal' },
  { id: 'CH-2025-004', name: 'Andrei Garcia', age: '8 mos', barangay: 'San Roque', status: 'Under Monitoring', risk: 'At Risk' },
]

export const vaccines = [
  { child: 'Maria Santos', vaccine: 'Measles, Mumps, Rubella', dose: 'Dose 1', date: 'Sep 12, 2025', status: 'Done' },
  { child: 'Juan Dela Cruz', vaccine: 'Pentavalent', dose: 'Dose 3', date: 'Sep 15, 2025', status: 'Due' },
  { child: 'Sofia Reyes', vaccine: 'Polio', dose: 'Dose 2', date: 'Sep 18, 2025', status: 'Scheduled' },
  { child: 'Andrei Garcia', vaccine: 'BCG', dose: 'Dose 1', date: 'Aug 28, 2025', status: 'Missed' },
]

export const inventory = [
  { item: 'BCG Vaccine', barangay: 'RHU Central', onHand: 24, reorder: 20, status: 'Normal' },
  { item: 'Pentavalent Vaccine', barangay: 'RHU Central', onHand: 8, reorder: 15, status: 'Low' },
  { item: 'Vitamin A 100,000 IU', barangay: 'San Isidro', onHand: 0, reorder: 30, status: 'Out of Stock' },
  { item: 'Iron Supplement', barangay: 'Mabini', onHand: 68, reorder: 25, status: 'Normal' },
]

export const alerts = [
  { title: 'Vaccine stock below reorder level', detail: 'Pentavalent Vaccine has 8 doses remaining.', tone: 'warning' },
  { title: 'Children with missed vaccination', detail: '3 children require follow-up this week.', tone: 'danger' },
  { title: 'Nutritional risk detected', detail: 'Juan Dela Cruz needs a repeat assessment.', tone: 'info' },
]

export const moduleRoutes: Record<string, string> = {
  Dashboard: '/dashboard',
  'User Management': '/user-management',
  'Child Profiling': '/child-profiling/children',
  Geospatial: '/geospatial',
  'Masterlist Upload': '/masterlist-upload',
  Vaccination: '/vaccination/records',
  'Vaccination Schedule': '/vaccination/schedule',
  'Nutritional Assessment': '/nutritional-assessment/records',
  Supplementation: '/supplementation/records',
  Inventory: '/inventory/stock-overview',
  'Stock Allocation': '/inventory/stock-allocation',
  'Inventory Transactions': '/inventory/transactions',
  Alerts: '/alerts',
  SMS: '/sms',
  Reports: '/reports',
  Settings: '/settings',
  Organization: '/organization',
}

export type Permission = 'view' | 'create' | 'edit' | 'approve' | 'export' | 'request'

// Mirrors the role matrix. 'approve'/'request' encode the Vaccination Schedule nuances.
// 'view' with no 'edit' means Read-only (e.g. Organization for non-Admins). "Limited"
// scopes (Inventory, Reports) are expressed as narrower permission sets, not special markers.
const rolePermissions: Record<UserRole, Partial<Record<string, Permission[]>>> = {
  Administrator: { '*': ['view', 'create', 'edit', 'approve', 'export', 'request'] },
  'Public Health Nurse': {
    'Child Profiling': ['view', 'create', 'edit', 'export'],
    Geospatial: ['view', 'export'],
    'Masterlist Upload': ['view', 'create', 'edit'],
    Vaccination: ['view', 'create', 'edit', 'export'],
    'Vaccination Schedule': ['view', 'approve', 'export'],
    'Nutritional Assessment': ['view', 'create', 'edit', 'export'],
    Supplementation: ['view', 'create', 'edit', 'export'],
    Inventory: ['view', 'edit', 'export'],
    'Stock Allocation': ['view', 'create', 'edit', 'approve'],
    'Inventory Transactions': ['view', 'create', 'edit', 'export'],
    Alerts: ['view'],
    SMS: ['view', 'create'],
    Reports: ['view', 'create', 'export'],
    Settings: ['view', 'edit'],
    Organization: ['view'],
  },
  'Barangay Health Worker': {
    'Child Profiling': ['view', 'create', 'edit'],
    Geospatial: ['view'],
    'Masterlist Upload': ['view', 'create'],
    Vaccination: ['view', 'create', 'edit'],
    'Vaccination Schedule': ['view', 'request'],
    Inventory: ['view'], // Limited: view-only
    'Inventory Transactions': ['view'], // Limited: view-only
    Alerts: ['view'],
    Reports: ['view', 'export'], // Limited: only own barangay reports
    Settings: ['view', 'edit'],
    Organization: ['view'], // Read
  },
  'Rural Health Midwife': {
    'Child Profiling': ['view', 'approve'],
    Geospatial: ['view'],
    Vaccination: ['view', 'create', 'edit'],
    'Vaccination Schedule': ['view', 'request'],
    'Nutritional Assessment': ['view', 'create', 'edit'],
    Supplementation: ['view', 'create', 'edit'],
    Inventory: ['view'], // Limited
    'Inventory Transactions': ['view'], // Limited
    Alerts: ['view'],
    Reports: ['view', 'export'], // Limited
    Settings: ['view', 'edit'],
    Organization: ['view'], // Read
  },
  'Barangay Nutrition Scholar': {
    'Child Profiling': ['view'], // View-only — no create/edit
    Geospatial: ['view'],
    'Masterlist Upload': ['view', 'create'],
    'Nutritional Assessment': ['view', 'create', 'edit', 'export'],
    Supplementation: ['view', 'create', 'edit'],
    Inventory: ['view'], // Limited
    'Inventory Transactions': ['view'], // Limited
    Alerts: ['view'],
    SMS: ['view', 'create'], // ✓* nutrition SMS only
    Reports: ['view', 'export'], // Nutrition reports only
    Settings: ['view', 'edit'],
    Organization: ['view'], // Read
  },
}

export function canPerform(role: UserRole, module: string, permission: Permission) {
  const permissions = rolePermissions[role]['*'] ?? rolePermissions[role][module] ?? []
  return permissions.includes(permission)
}

export function slugToTitle(slug: string[]) {
  return slug.map((part) => part.replace(/-/g, ' ')).join(' / ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function canAccess(role: UserRole, path: string) {
  if (path === '/dashboard' || path.startsWith('/dashboard/')) return roleModules[role].includes('Dashboard')
  const routeAliases: Record<string, string> = {
    '/children': 'Child Profiling', '/child-profiling': 'Child Profiling',
    '/nutrition': 'Nutritional Assessment', '/nutritional-assessment': 'Nutritional Assessment',
    '/inventory/stock-allocation': 'Stock Allocation',
    '/inventory/transactions': 'Inventory Transactions',
    '/inventory': 'Inventory',
    '/vaccination/schedule': 'Vaccination Schedule',
    '/vaccination': 'Vaccination',
    '/supplementation': 'Supplementation',
    '/geospatial': 'Geospatial',
    '/masterlist-upload': 'Masterlist Upload',
    '/sms': 'SMS',
    '/organization': 'Organization',
    '/alerts': 'Alerts', '/reports': 'Reports', '/settings': 'Settings', '/user-management': 'User Management',
  }
  const module = Object.entries(routeAliases).find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? Object.keys(moduleRoutes).find((key) => path.startsWith(moduleRoutes[key]))
  return module ? roleModules[role].includes(module) : false
}