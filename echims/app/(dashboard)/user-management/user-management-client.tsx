'use client'
// User Management (USRMGMT-REV01): shared page header, filter card with the account counts, the
// system table (5 per page) and a User details modal in the Activity-detail style. Admin only
// (page.tsx). Status changes go through PATCH /api/admin/users and reload the server data.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Ban, CheckCircle2, Pencil, PowerOff, RefreshCw, RotateCcw, Search, UserX } from 'lucide-react'
import { useAuth } from '@/components/auth/auth-provider'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { cn } from '@/lib/utils'
import { CountsStrip } from '@/components/ui/report-parts'
import { GridTable, RowButton } from '@/components/ui/grid-table'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { StatusBadge } from '@/components/ui/status-badge'
import { toast } from '@/components/ui/toast'
import { DeleteAccountButton, EditProfileDialog } from '@/components/user-management/user-actions'

/* =========================================================
   TYPES
========================================================= */

type Assignment = {
  assignment_id: number
  user_id: string
  barangay_id: number
  assigned_date: string
  status: string
  barangay: {
    barangay_id: number
    barangay_name: string
    municipality: string | null
    province: string | null
    rhu_id: number
    rhu_name: string | null
  }
}

type PhnWorkplace = {
  rhu_id: number
  rhu_name: string
  municipality: string | null
  province: string | null
}

type UserRow = {
  user_id: string
  full_name: string
  username: string
  email: string
  contact_number: string | null
  account_status: string
  role: string
  assignments: Assignment[]
  phn_workplace: PhnWorkplace | null
}

type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'

const STATUSES = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'] as const
const ROLES = ['Administrator', 'Public Health Nurse', 'Rural Health Midwife', 'Barangay Health Worker', 'Barangay Nutrition Scholar']
const PAGE_SIZE = 5

const statusLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase()
const reload = () => window.location.reload()

/* =========================================================
   WORKPLACE HELPERS
========================================================= */

function hasWorkplace(user: UserRow) {
  if (user.role === 'Administrator') return true
  if (user.role === 'Public Health Nurse') return Boolean(user.phn_workplace)
  return user.assignments.length > 0
}

function workplaceIsActive(user: UserRow) {
  if (user.role === 'Administrator') return user.account_status === 'ACTIVE'
  if (user.role === 'Public Health Nurse') return Boolean(user.phn_workplace) && user.account_status === 'ACTIVE'
  return user.assignments.length > 0 && user.assignments.every((a) => a.status === 'ACTIVE')
}

function hasPendingWorkplace(user: UserRow) {
  if (user.role === 'Public Health Nurse') return Boolean(user.phn_workplace) && user.account_status === 'PENDING'
  return user.assignments.some((a) => a.status === 'PENDING')
}

function workplaceSummary(user: UserRow) {
  if (user.role === 'Administrator') return 'System-wide'
  if (user.role === 'Public Health Nurse') return user.phn_workplace?.rhu_name ?? 'Not assigned'
  if (user.assignments.length === 0) return 'Not assigned'
  if (user.role === 'Rural Health Midwife') return `${user.assignments.length} ${user.assignments.length === 1 ? 'barangay' : 'barangays'}`
  return user.assignments[0].barangay.barangay_name
}

function workplaceRhu(user: UserRow) {
  if (user.role === 'Public Health Nurse') return user.phn_workplace ? 'Supervises all barangays under this RHU' : null
  return user.assignments[0]?.barangay.rhu_name ?? null
}

/* =========================================================
   COMPONENT
========================================================= */

export default function UserManagementClient({ users, readOnly: savedReadOnly = false }: { users: UserRow[]; readOnly?: boolean }) {
  const { user: currentUser } = useAuth()
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  const readOnly = savedReadOnly || !online

  const [selected, setSelected] = useState<UserRow | null>(null)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) =>
      (!q || [u.full_name, u.email, u.username].some((v) => v?.toLowerCase().includes(q)))
      && (statusFilter === 'ALL' || u.account_status === statusFilter)
      && (roleFilter === 'ALL' || u.role === roleFilter))
  }, [users, search, statusFilter, roleFilter])

  const count = (status: string) => users.filter((u) => u.account_status === status).length

  async function updateAccountStatus(user: UserRow, accountStatus: AccountStatus, success: string) {
    if (readOnly || processing) return
    setProcessing(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id, accountStatus }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error ?? 'Unable to update account.')
      toast.success(success)
      // Reload so the Server Component gets the authoritative DB state.
      reload()
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'Unable to update account.'} Nothing was changed.`)
    } finally {
      setProcessing(false)
    }
  }

  function open(user: UserRow) {
    setError(null)
    setSelected(user)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="User Management" subtitle="Manage registered personnel, account verification, and workplace assignments." actions={<Button variant="outline" size="icon" className="size-10" aria-label="Refresh users" title="Refresh" onClick={reload}><RefreshCw size={16} aria-hidden="true" /></Button>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username or email…" className="pl-9" />
        </div>
        <Select aria-label="Account status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </Select>
        <Select aria-label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="ALL">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </div>
      <CountsStrip
          label="Account counts"
          selected={statusFilter}
          onSelect={(key) => setStatusFilter(statusFilter === key ? 'ALL' : key)}
          items={STATUSES.map((s) => ({ key: s, label: statusLabel(s), value: count(s) }))}
        />

      <GridTable
        caption="Users"
        rows={filtered}
        rowKey={(u) => u.user_id}
        onRowClick={open}
        pageSize={PAGE_SIZE}
        minWidth={820}
        empty={{ icon: UserX, title: 'No users match your search', description: 'Try a different name, role or status.' }}
        columns={[
          { key: 'user', header: 'User', width: '30%', cell: (u) => <><span className="block truncate text-sm font-bold text-[#0C1260]">{u.full_name}</span><span className="block truncate text-xs text-[#8896B0]">{u.email}</span></> },
          { key: 'role', header: 'Role', width: '18%', cell: (u) => u.role },
          { key: 'account', header: 'Account', width: '13%', cell: (u) => <StatusBadge status={u.account_status} label={statusLabel(u.account_status)} /> },
          {
            key: 'workplace', header: 'Workplace', width: '23%',
            cell: (u) => <>
              <span className="block truncate">{workplaceSummary(u)}</span>
              {workplaceRhu(u) && <span className="block truncate text-xs text-[#8896B0]">{workplaceRhu(u)}</span>}
              {hasPendingWorkplace(u) && <StatusBadge status="pending" label="Pending verification" className="mt-1.5" />}
            </>,
          },
          { key: 'actions', header: 'Actions', width: '16%', sticky: true, cell: (u) => <RowButton aria-label={`View details for ${u.full_name}`} onClick={(e) => { e.stopPropagation(); open(u) }} /> },
        ]}
      />

      {selected && (
        <UserDetailsModal
          user={selected}
          currentUserId={currentUser?.id ?? null}
          readOnly={readOnly}
          processing={processing}
          error={error}
          onClose={() => { if (!processing) { setSelected(null); setError(null) } }}
          onStatus={(status, success) => void updateAccountStatus(selected, status, success)}
          onEdit={() => { setEditing(selected); setSelected(null) }}
        />
      )}

      {editing && <EditProfileDialog user={editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  )
}

/* =========================================================
   USER DETAILS MODAL
========================================================= */

// Destructive actions are outlines: Suspend amber, Deactivate / Decline red. Reactivate / Approve navy.
const actionBase = 'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[#0B759A]'
const amber = cn(actionBase, 'border-[#D97706] bg-white text-[#D97706] hover:bg-[#FFF8EB]')
const red = cn(actionBase, 'border-[#C42B2B] bg-white text-[#C42B2B] hover:bg-[#FFF5F5]')
const navy = cn(actionBase, 'border-[#07075F] bg-[#07075F] text-white hover:bg-[#1A1A80]')
const navyOutline = cn(actionBase, 'border-[#BFD3DE] bg-white text-[#0C1260] hover:border-[#07075F] hover:bg-[#E6F1F7]')

function UserDetailsModal({ user, currentUserId, readOnly, processing, error, onClose, onStatus, onEdit }: {
  user: UserRow
  currentUserId: string | null
  readOnly: boolean
  processing: boolean
  error: string | null
  onClose: () => void
  onStatus: (status: AccountStatus, success: string) => void
  onEdit: () => void
}) {
  const withWorkplace = hasWorkplace(user)
  const status = user.account_status
  const first = user.assignments[0]?.barangay

  return (
    <Modal
      open
      size="form"
      onClose={onClose}
      busy={processing}
      hideCancel
      aboveTitle={
        <span className="mb-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={status} label={statusLabel(status)} />
          <span className="text-xs text-[#8896B0]" title={user.user_id}>User ID {user.user_id.slice(0, 8)}</span>
        </span>
      }
      title={user.full_name}
      titleClassName="text-xl font-bold text-[#0C1260]"
      footerStart={!readOnly && (
        <button type="button" onClick={onEdit} disabled={processing} className={navyOutline}><Pencil size={14} aria-hidden="true" /> Edit profile</button>
      )}
      footer={<button type="button" onClick={onClose} disabled={processing} className="h-9 rounded-lg px-3 text-sm font-medium text-[#55617F] hover:bg-[#F5F8FA] hover:text-[#0C1260] disabled:opacity-50">Close</button>}
    >
      <div className="space-y-6">
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

        <DetailSection title="Account information">
          <InfoGrid>
            <InfoItem label="Full name" value={user.full_name} />
            <InfoItem label="Username" value={user.username || '—'} />
            <InfoItem label="Email" value={user.email} />
            <InfoItem label="Contact number" value={user.contact_number || '—'} />
            <InfoItem label="Role" value={user.role || '—'} />
            <InfoItem label="Account status" value={<StatusBadge status={status} label={statusLabel(status)} />} />
          </InfoGrid>
        </DetailSection>

        <DetailSection title="Workplace assignment">
          {user.role === 'Administrator' ? (
            <InfoGrid><InfoItem label="Access scope" value="System-wide administration" /></InfoGrid>
          ) : user.role === 'Public Health Nurse' ? (
            user.phn_workplace ? (
              <InfoGrid>
                <InfoItem label="RHU" value={user.phn_workplace.rhu_name} />
                <InfoItem label="Municipality" value={user.phn_workplace.municipality ?? '—'} />
                <InfoItem label="Province" value={user.phn_workplace.province ?? '—'} />
                <InfoItem label="Supervisory scope" value="All barangays under this RHU" />
              </InfoGrid>
            ) : <EmptyCard>No RHU assignment has been submitted.</EmptyCard>
          ) : user.assignments.length > 0 && first ? (
            <>
              <InfoGrid>
                <InfoItem label="RHU" value={first.rhu_name ?? '—'} />
                <InfoItem label="Municipality" value={first.municipality ?? '—'} />
                <InfoItem label="Province" value={first.province ?? '—'} />
                <InfoItem label={user.role === 'Rural Health Midwife' ? 'Assigned barangays' : 'Barangay'} value={user.assignments.map((a) => a.barangay.barangay_name).join(', ')} />
              </InfoGrid>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.5px] text-[#55617F]">Barangay assignments</p>
              <ul>
                {user.assignments.map((a) => (
                  <li key={a.assignment_id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EAF0F4] bg-white px-3.5 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#0C1260]">{a.barangay.barangay_name}</span>
                      <span className="block text-xs text-[#8896B0]">Requested {a.assigned_date ? new Date(a.assigned_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
                    </span>
                    <StatusBadge status={a.status} label={statusLabel(a.status)} />
                  </li>
                ))}
              </ul>
              {user.assignments.some((a) => a.status === 'PENDING') && (
                <p className="mt-3 rounded-lg border border-[#F3D9A4] bg-[#FFF4DB] px-3.5 py-2.5 text-sm text-[#9C6B10]">The requested workplace assignments are awaiting administrator verification.</p>
              )}
            </>
          ) : <EmptyCard>No workplace assignment has been submitted.</EmptyCard>}
        </DetailSection>

        <DetailSection title="Account verification">
          <div className="rounded-[10px] border border-[#EAF0F4] bg-[#F9FBFC] p-4">
            <p className="text-sm leading-relaxed text-[#55617F]">
              {status === 'PENDING' ? "Review the user's role and requested workplace before approving the account."
                : status === 'ACTIVE' ? 'This account is active and authorized according to its assigned role and workplace.'
                : status === 'SUSPENDED' ? 'This account is suspended. Its workplace assignment is kept.'
                : 'This account is inactive.'}
            </p>
            {status === 'PENDING' && !withWorkplace && (
              <p className="mt-3 rounded-lg border border-[#F5C2C2] bg-[#FFF5F5] px-3.5 py-2.5 text-sm text-[#C42B2B]">This user has no valid workplace assignment. Verify the registration before approving.</p>
            )}
            {!readOnly && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {status === 'PENDING' && <>
                  <button type="button" disabled={processing} className={red} onClick={() => onStatus('INACTIVE', 'Registration declined. The account is inactive.')}><Ban size={14} aria-hidden="true" /> Decline registration</button>
                  <button type="button" disabled={processing || !withWorkplace} className={navy} onClick={() => onStatus('ACTIVE', 'Account approved.')}><CheckCircle2 size={14} aria-hidden="true" /> Approve account</button>
                </>}
                {status === 'ACTIVE' && <>
                  <button type="button" disabled={processing} className={amber} onClick={() => onStatus('SUSPENDED', 'Account suspended.')}><Ban size={14} aria-hidden="true" /> Suspend account</button>
                  <button type="button" disabled={processing} className={red} onClick={() => onStatus('INACTIVE', 'Account deactivated.')}><PowerOff size={14} aria-hidden="true" /> Deactivate account</button>
                </>}
                {status === 'SUSPENDED' && <>
                  <button type="button" disabled={processing} className={navy} onClick={() => onStatus('ACTIVE', 'Account reactivated.')}><RotateCcw size={14} aria-hidden="true" /> Reactivate account</button>
                  <button type="button" disabled={processing} className={red} onClick={() => onStatus('INACTIVE', 'Account deactivated.')}><PowerOff size={14} aria-hidden="true" /> Deactivate account</button>
                </>}
                {status === 'INACTIVE' && <>
                  <button type="button" disabled={processing || !withWorkplace} className={navy} onClick={() => onStatus('ACTIVE', 'Account reactivated.')}><RotateCcw size={14} aria-hidden="true" /> Reactivate account</button>
                  {currentUserId && <DeleteAccountButton user={user} currentUserId={currentUserId} onDeleted={reload} className={red} />}
                </>}
                {processing && <span className="text-xs text-[#8896B0]">Saving…</span>}
              </div>
            )}
          </div>
        </DetailSection>

        <DetailSection title="Authorization summary">
          <div className="flex flex-wrap gap-3">
            <SummaryChip label="Account" active={status === 'ACTIVE'} />
            <SummaryChip label="Workplace" active={workplaceIsActive(user)} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#55617F]">
            {user.role === 'Public Health Nurse'
              ? 'A Public Health Nurse receives RHU-wide geographic scope when the account is active and has a valid RHU assignment.'
              : user.role === 'Administrator'
                ? 'An Administrator receives system-wide administrative access when the account is active.'
                : 'A health worker can access assigned geographic records only when both the account and workplace assignments are active.'}
          </p>
        </DetailSection>
      </div>
    </Modal>
  )
}

/* =========================================================
   SMALL PARTS
========================================================= */

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.5px] text-[#0B759A]">{title}</h3>
      {children}
    </section>
  )
}

function InfoGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-4 rounded-[10px] border border-[#EAF0F4] bg-[#F9FBFC] p-4 sm:grid-cols-2">{children}</dl>
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-xs text-[#8896B0]">{label}</dt>
      <dd className="break-words text-sm font-semibold text-[#0C1260]">{value}</dd>
    </div>
  )
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <p className="rounded-[10px] border border-[#EAF0F4] bg-[#F9FBFC] p-4 text-sm text-[#55617F]">{children}</p>
}

function SummaryChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="flex items-center gap-2 rounded-lg border border-[#EAF0F4] bg-white px-3.5 py-2 text-[13px] text-[#1E2A55]">
      {label}
      <StatusBadge status={active ? 'active' : 'inactive'} label={active ? 'Active' : 'Not active'} />
    </span>
  )
}
