'use client'
import { useEffect, useState, type ComponentProps } from 'react'
import UserManagementClient from '@/app/(dashboard)/user-management/user-management-client'
import { useAuth } from '@/components/auth/auth-provider'
import { loadData, saveData, loadIdentity } from '@/lib/offline/store'
import { offlineScope } from '@/lib/offline/fetch'
type Users = ComponentProps<typeof UserManagementClient>['users']
export function SavedUserManagement({ users, ownerId }: { users?: Users; ownerId?: string }) {
  const { user, isReady } = useAuth()
  const [saved, setSaved] = useState<{ owner: string; scope: string; users: Users } | null>(null)
  const scope = user ? offlineScope(user) : ''
  useEffect(() => {
    let active = true
    if (!user || user.role !== 'Administrator') return
    const owner = user.id, key = 'USER_MANAGEMENT:' + scope
    if (users && ownerId === owner && navigator.onLine) {
      void loadIdentity(owner).then(identity => {
        if (active && identity && offlineScope(identity.user) === scope) return saveData(owner, key, users)
      }).catch(() => {})
    } else {
      void loadData<Users>(owner, key).then(row => {
        if (active && row) setSaved({ owner, scope, users: row.data })
      }).catch(() => {})
    }
    return () => { active = false }
  }, [user, scope, ownerId, users])
  if (!isReady) return <p>Loading account…</p>
  if (user?.role !== 'Administrator') return <p role="alert">Administrator access is required.</p>
  if (users && ownerId === user.id) return <UserManagementClient users={users}/>
  if (!saved || saved.owner !== user.id || saved.scope !== scope) return <p>Open User Management online first to save this view on this device.</p>
  return <><p className="mb-4 text-sm text-amber-800">Saved user directory. Account and assignment changes require a connection.</p><UserManagementClient users={saved.users} readOnly/></>
}
