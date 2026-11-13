export type UserRole = 'Administrator' | 'Public Health Nurse' | 'Barangay Health Worker' | 'Rural Health Midwife' | 'Barangay Nutrition Scholar'

/** Role codes used by the auth layer (lib/auth/permissions.ts) and their display names. */
export type RoleCode = 'Administrator' | 'PHN' | 'RHM' | 'BHW' | 'BNS'
export const ROLE_NAME: Record<RoleCode, UserRole> = {
  Administrator: 'Administrator',
  PHN: 'Public Health Nurse',
  RHM: 'Rural Health Midwife',
  BHW: 'Barangay Health Worker',
  BNS: 'Barangay Nutrition Scholar',
}
export const ROLE_CODE: Record<UserRole, RoleCode> = {
  Administrator: 'Administrator',
  'Public Health Nurse': 'PHN',
  'Rural Health Midwife': 'RHM',
  'Barangay Health Worker': 'BHW',
  'Barangay Nutrition Scholar': 'BNS',
}
/** Any role spelling (display name, code, lower case) → display name, or undefined. */
export function toUserRole(raw: unknown): UserRole | undefined {
  const v = String(raw ?? '').trim().toLowerCase()
  const hit = (Object.keys(ROLE_CODE) as UserRole[]).find((r) => r.toLowerCase() === v || ROLE_CODE[r].toLowerCase() === v)
  return hit ?? (v === 'admin' ? 'Administrator' : undefined)
}

// Sidebar modules in display order. A role sees a module when it has 'view' on it in the matrix
// below (one source of truth: sidebar, page access, buttons and API checks all read it).
const SIDEBAR_MODULES = ['Dashboard', 'User Management', 'Health Activities', 'Child Profiling', 'Vaccination', 'Nutritional Assessment', 'Supplementation', 'Inventory', 'Alerts', 'Reports', 'Settings']

// Nested child tabs rendered inside each parent page. Keeping this centralized lets the
// sidebar stay flat and the parent pages drive their own sub-navigation. 'module' is the
// permissions key in rolePermissions for the tab — the tab is hidden if the role has no
// 'view' permission for it.
export const moduleTabs: Record<string, { label: string; href: string; module: string }[]> = {
  'Child Profiling': [
    { label: 'Children', href: '/child-profiling/children', module: 'Child Profiling' },
    { label: 'Map', href: '/geospatial', module: 'Geospatial' },
    { label: 'Masterlist Upload', href: '/masterlist-upload', module: 'Masterlist Upload' },
  ],
  // NIP-REV01: three tabs. Defaulters = Schedule's "Defaulters (Missed)" chip, SMS reminders sit on
  // Schedule rows, Vaccines = the NIP catalog (editing in the tab for Admin/PHN; was Settings ›
  // Vaccine Catalog), Batch Requests → Inventory › Batch Requests.
  Vaccination: [
    { label: 'Records', href: '/vaccination/records', module: 'Vaccination' },
    { label: 'Schedule', href: '/vaccination/schedule', module: 'Vaccination' },
    { label: 'Vaccines', href: '/vaccination/vaccines', module: 'NIP Catalog' },
  ],
   Inventory: [
    { label: 'Stock Overview', href: '/inventory/stock-overview', module: 'Inventory' },
    { label: 'Allocation', href: '/inventory/stock-allocation', module: 'Stock Allocation' },
    { label: 'Usage Log', href: '/inventory/usage', module: 'Inventory Transactions' },
    { label: 'Replenishment', href: '/inventory/replenishment', module: 'Inventory' },
    { label: 'Batch Trace', href: '/inventory/batch-trace', module: 'Batch Trace' },
    { label: 'Batch Requests', href: '/inventory/batch-requests', module: 'Vaccine Batch Requests' },
  ],
  // Settings deliberately omitted — settings/page.tsx already provides its own in-page
  // tabs for Profile / Organization / Notifications / Security so a second tab strip
  // would be redundant.
}

export const alerts = [
  { title: 'Vaccine stock below reorder level', detail: 'Pentavalent Vaccine has 8 doses remaining.', tone: 'warning' },
  { title: 'Children with missed vaccination', detail: '3 children require follow-up this week.', tone: 'danger' },
  { title: 'Nutritional risk detected', detail: 'Juan Dela Cruz needs a repeat assessment.', tone: 'info' },
]

// Primary landing route when a user clicks a sidebar module. Sub-modules keep their routes
// (listed here for completeness and so canAccess resolves them) but are reached via the
// parent page's tabs, not the sidebar.
export const moduleRoutes: Record<string, string> = {
  Dashboard: '/dashboard',
  'User Management': '/user-management',
  'Child Profiling': '/child-profiling/children',
  Geospatial: '/geospatial',
  'Masterlist Upload': '/masterlist-upload',
  // NIP-USR010 — sidebar clicks on Vaccination land directly on the Records tab
  // (the first + most-used sub-tab). /vaccination bare path has no page.tsx and
  // would otherwise fall through to the [...slug] catch-all placeholder.
  Vaccination: '/vaccination/records',
  'Vaccination Schedule': '/vaccination/schedule',
  'Nutritional Assessment': '/nutritional-assessment/records',
  Supplementation: '/supplementation',
  Inventory: '/inventory/stock-overview',
  'Stock Allocation': '/inventory/stock-allocation',
  'Health Activities': '/health-activities',
  Alerts: '/alerts',
  Reports: '/reports',
  Settings: '/settings',
  Organization: '/settings/organization',
}

export type Permission = 'view' | 'create' | 'edit' | 'approve' | 'export' | 'request'

// THE role → module → actions matrix (NIP-REV01; manuscript Use Case Diagram Fig. 14, DFD,
// User Stories 4.3.9). Full table and every resolved mismatch: docs/permissions.md.
// 'request' = ask someone else to act (schedule, stock/batch request); 'approve' = decide/review.
// RLS and the database functions enforce the same rules (scope by barangay / RHU on top).
const rolePermissions: Record<UserRole, Partial<Record<string, Permission[]>>> = {
  // Everything, incl. account approval, barangay assignment, alert rules, vaccine catalog, masterlist.
  Administrator: { '*': ['view', 'create', 'edit', 'approve', 'export', 'request'] },
  'Public Health Nurse': {
    Dashboard: ['view'],
    'Child Profiling': ['view', 'create', 'edit', 'export'],   // register children / guardians / households
    Geospatial: ['view', 'export'],
    'Masterlist Upload': ['view', 'create', 'edit'],
    // No 'create': PHN reviews vaccination records, does not record them (NIP-USR007).
    Vaccination: ['view', 'edit', 'approve', 'export'],
    'Vaccination Schedule': ['view', 'approve', 'export'],
    'NIP Catalog': ['view'],                                    // + companion medicines / batch format (Catalog settings)
    'Vaccine Batch Requests': ['view', 'approve'],              // decide batch requests
    'Nutritional Assessment': ['view', 'export'],               // monitor
    Supplementation: ['view', 'create', 'export'],              // register supply plans, monitor compliance
    Inventory: ['view', 'create', 'edit', 'approve', 'export'], // receive stock, decide stock requests
    'Stock Allocation': ['view', 'create', 'edit', 'approve'],
    'Inventory Transactions': ['view', 'export'],               // usage is logged by the RHM (inv_log_usage)
    'Batch Trace': ['view'],
    'Health Activities': ['view', 'approve'],                   // review health activity requests
    Alerts: ['view'],
    Reports: ['view', 'create', 'export', 'approve'],           // validate reports
    Settings: ['view', 'edit'],
    Organization: ['view'],
  },
  'Rural Health Midwife': {
    Dashboard: ['view'],
    'Child Profiling': ['view', 'create', 'edit', 'approve'],
    Geospatial: ['view'],
    Vaccination: ['view', 'create', 'edit'],                    // record vaccinations
    'Vaccination Schedule': ['view', 'request'],                // due list, schedule requests, SMS reminders
    'NIP Catalog': ['view'],
    'Vaccine Batch Requests': ['view', 'create'],               // request vaccine batches
    'Nutritional Assessment': ['view', 'edit'],                 // confirm nutrition admissions (BNS records assessments)
    Supplementation: ['view', 'create', 'edit'],                // record supplementation, register supply plans
    // Assigned barangays only: view stock, request stock, log usage. No receiving / allocation / adjustments.
    Inventory: ['view', 'request'],
    'Inventory Transactions': ['view', 'create'],
    'Health Activities': ['view', 'create', 'edit'],
    Alerts: ['view'],
    Reports: ['view', 'create', 'export'],
    Settings: ['view', 'edit'],
    Organization: ['view'],
  },
  'Barangay Health Worker': {
    Dashboard: ['view'],
    'Child Profiling': ['view', 'create', 'edit'],
    Geospatial: ['view'],
    Vaccination: ['view', 'create', 'edit'],                    // record; edit own unapproved (RLS)
    'Vaccination Schedule': ['view', 'request'],
    'NIP Catalog': ['view'],
    // Panel feedback: BHW records supplementation administration (eligibility check in the form).
    Supplementation: ['view', 'create'],
    'Health Activities': ['view', 'create', 'edit'],            // as is (ACT-REV01)
    Alerts: ['view'],
    // View Approved Reports: own barangay(s), approved Child / Vaccination / Supplementation only,
    // print / download; no generate, save or validate (migration 13).
    Reports: ['view', 'export'],
    Settings: ['view', 'edit'],                                 // Profile and Security only (no Organization)
  },
  'Barangay Nutrition Scholar': {
    Dashboard: ['view'],
    'Child Profiling': ['view'],
    Geospatial: ['view'],
    'Nutritional Assessment': ['view', 'create', 'edit', 'export'],
    Supplementation: ['view', 'create', 'edit'],
    'Health Activities': ['view', 'create', 'edit'],            // as is (ACT-REV01)
    Alerts: ['view'],
    Reports: ['view', 'export'],                                // nutrition reports
    Settings: ['view', 'edit'],
    Organization: ['view'],
  },
}

export function canPerform(role: UserRole, module: string, permission: Permission) {
  const permissions = rolePermissions[role]['*'] ?? rolePermissions[role][module] ?? []
  return permissions.includes(permission)
}

/** Sidebar modules per role, derived from the matrix ('view'). */
export const roleModules: Record<UserRole, string[]> = Object.fromEntries(
  (Object.keys(rolePermissions) as UserRole[]).map((role) => [role, SIDEBAR_MODULES.filter((m) => canPerform(role, m, 'view'))]),
) as Record<UserRole, string[]>

export function slugToTitle(slug: string[]) {
  return slug.map((part) => part.replace(/-/g, ' ')).join(' / ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

// Route → the matrix module that guards the page ('view' needed). Most specific prefix wins.
const ROUTE_MODULES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/user-management': 'User Management',
  '/children': 'Child Profiling', '/child-profiling': 'Child Profiling',
  '/geospatial': 'Geospatial',
  '/masterlist-upload': 'Masterlist Upload',
  '/vaccination/vaccines': 'NIP Catalog', '/vaccination/catalog': 'NIP Catalog',
  '/vaccination': 'Vaccination', '/vaccinations': 'Vaccination',
  '/nutrition': 'Nutritional Assessment', '/nutritional-assessment': 'Nutritional Assessment',
  '/supplementation': 'Supplementation', '/supplements': 'Supplementation',
  '/inventory/batch-requests': 'Vaccine Batch Requests',
  '/inventory/stock-allocation': 'Stock Allocation',
  '/inventory/usage': 'Inventory Transactions',
  '/inventory/batch-trace': 'Batch Trace',
  '/inventory': 'Inventory',
  '/health-activities': 'Health Activities',
  '/alerts': 'Alerts', '/reports': 'Reports',
  '/settings/organization': 'Organization', '/organization': 'Organization',
  '/settings': 'Settings',
}
const ROUTE_PREFIXES = Object.keys(ROUTE_MODULES).sort((a, b) => b.length - a.length)

/** Module guarding a path, or undefined for paths outside the matrix. */
export function routeModule(path: string): string | undefined {
  const prefix = ROUTE_PREFIXES.find((p) => path === p || path.startsWith(`${p}/`))
  return prefix ? ROUTE_MODULES[prefix] : undefined
}

export function canAccess(role: UserRole, path: string) {
  const mod = routeModule(path)
  return mod ? canPerform(role, mod, 'view') : false
}
