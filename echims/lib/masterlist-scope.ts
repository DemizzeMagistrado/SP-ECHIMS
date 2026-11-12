// Who may use Masterlist Upload, and for which barangays (NIP-REV01, decision option 3).
//   Administrator, PHN → any barangay (unchanged)
//   RHM               → only barangays actively assigned to them; uploads/imports on their own
//   everyone else     → no access
// The database enforces the same rule (mlu_batch_insert policy, mlu_import_batch).

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type MasterlistScope = { role: 'Administrator' | 'PHN' | 'RHM'; allowed: Set<number> | null }

export async function masterlistScope(db: Db, userId: string): Promise<MasterlistScope | null> {
  const [admin, phn, rhm] = await Promise.all([
    db.from('administrator').select('user_id').eq('user_id', userId).maybeSingle(),
    db.from('public_health_nurse').select('user_id').eq('user_id', userId).maybeSingle(),
    db.from('rural_health_midwife').select('user_id').eq('user_id', userId).maybeSingle(),
  ])
  if (admin.data) return { role: 'Administrator', allowed: null }
  if (phn.data) return { role: 'PHN', allowed: null }
  if (!rhm.data) return null
  const { data } = await db.from('health_worker_assignment').select('barangay_id').eq('user_id', userId).eq('status', 'ACTIVE')
  return { role: 'RHM', allowed: new Set(((data ?? []) as { barangay_id: number }[]).map((a) => Number(a.barangay_id))) }
}

/** Error text for a row whose barangay is outside the uploader's scope, or null. */
export function barangayScopeError(scope: MasterlistScope, barangayId: number | null, barangayName: string): string | null {
  if (!scope.allowed || barangayId == null) return null
  return scope.allowed.has(barangayId) ? null : `barangay_name "${barangayName}" is not one of your assigned barangays`
}
