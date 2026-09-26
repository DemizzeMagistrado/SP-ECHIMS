export type UserRole = 'Administrator' | 'Public Health Nurse' | 'Barangay Health Worker' | 'Rural Health Midwife' | 'Barangay Nutrition Scholar'

export const roleModules: Record<UserRole, string[]> = {
  Administrator: ['Dashboard', 'User Management', 'Child Profiling', 'Vaccination', 'Health Activities', 'Nutritional Assessment', 'Supplementation', 'Inventory', 'Alerts', 'Reports', 'Settings'],
  'Public Health Nurse': ['Dashboard', 'Child Profiling', 'Vaccination', 'Nutritional Assessment', 'Supplementation', 'Inventory', 'Alerts', 'Reports', 'Settings'],
  'Barangay Health Worker': ['Dashboard', 'Child Profiling', 'Vaccination', 'Health Activities', 'Alerts', 'Reports', 'Settings'],
  'Rural Health Midwife': ['Dashboard', 'Child Profiling', 'Vaccination', 'Health Activities', 'Alerts', 'Reports', 'Settings'],
  'Barangay Nutrition Scholar': ['Dashboard', 'Child Profiling', 'Nutritional Assessment', 'Supplementation', 'Health Activities', 'Alerts', 'Reports', 'Settings'],
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
  Dashboard: '/dashboard', 'User Management': '/user-management', 'Child Profiling': '/child-profiling/children', Vaccination: '/vaccination/records', Supplementation: '/supplementation/records', 'Nutritional Assessment': '/nutritional-assessment/records', Inventory: '/inventory/stock-overview', Alerts: '/alerts', Reports: '/reports', Settings: '/settings', 'Health Activities': '/health-activities',
}

export type Permission = 'view' | 'create' | 'edit' | 'approve' | 'export'

const rolePermissions: Record<UserRole, Partial<Record<string, Permission[]>>> = {
  Administrator: { '*': ['view', 'create', 'edit', 'approve', 'export'] },
  'Public Health Nurse': { 'Child Profiling': ['view', 'create', 'edit', 'export'], Vaccination: ['view', 'create', 'edit', 'approve', 'export'], 'Nutritional Assessment': ['view', 'create', 'edit', 'export'], Supplementation: ['view', 'create', 'edit', 'export'], Inventory: ['view', 'edit', 'export'], Reports: ['view', 'create', 'export'], Settings: ['view'] },
  'Barangay Health Worker': { 'Child Profiling': ['view', 'create', 'edit'], Vaccination: ['view', 'create', 'edit'], 'Health Activities': ['view', 'create', 'edit'], Alerts: ['view'], Reports: ['view', 'export'], Settings: ['view'] },
  'Rural Health Midwife': { 'Child Profiling': ['view', 'approve'], Vaccination: ['view', 'create', 'edit'], 'Health Activities': ['view', 'create', 'edit'], Alerts: ['view'], Reports: ['view', 'export'], Settings: ['view'] },
  'Barangay Nutrition Scholar': { 'Child Profiling': ['view'], 'Nutritional Assessment': ['view', 'create', 'edit', 'export'], Supplementation: ['view', 'create', 'edit'], 'Health Activities': ['view', 'create', 'edit'], Alerts: ['view'], Reports: ['view', 'export'], Settings: ['view'] },
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
    '/inventory': 'Inventory', '/vaccination': 'Vaccination', '/supplementation': 'Supplementation',
    '/health-activities': 'Health Activities', '/alerts': 'Alerts', '/reports': 'Reports', '/settings': 'Settings', '/user-management': 'User Management',
  }
  const module = Object.entries(routeAliases).find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? Object.keys(moduleRoutes).find((key) => path.startsWith(moduleRoutes[key]))
  return module ? roleModules[role].includes(module) : false
}
