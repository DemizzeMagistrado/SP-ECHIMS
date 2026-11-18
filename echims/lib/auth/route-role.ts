// API routes: the signed-in user's role from the database (get_my_profile), as a display name of
// the one role matrix (lib/echims-data), so route checks use canPerform like the UI does.

import { canPerform, toUserRole, type Permission, type UserRole } from '@/lib/echims-data'

type Db = { rpc: (fn: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } }

export async function trustedRole(db: Db): Promise<UserRole | undefined> {
  const { data } = await db.rpc('get_my_profile').maybeSingle()
  return toUserRole((data as { role?: string } | null)?.role)
}

/** The role if it may do `action` on `module`, else null. */
export async function roleAllowed(db: Db, module: string, action: Permission): Promise<UserRole | null> {
  const role = await trustedRole(db)
  return role && canPerform(role, module, action) ? role : null
}
