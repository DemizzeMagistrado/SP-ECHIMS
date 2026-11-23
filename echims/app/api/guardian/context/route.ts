import { NextResponse } from 'next/server'
import { guardianSession, guardianJson, guardianRpcError } from '@/lib/guardian/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const auth = await guardianSession()
    if (auth instanceof NextResponse) return auth
    const context = await auth.db.rpc('echims_guardian_context')
    if (context.error) return guardianRpcError(context.error.code)
    if (!context.data?.linked) return guardianJson({ ...context.data, currentUserId: auth.user.id, phone: auth.user.phone ?? null, children: [] })
    const children = await auth.db.rpc('echims_guardian_children')
    if (children.error) return guardianRpcError(children.error.code)
    return guardianJson({ ...context.data, currentUserId: auth.user.id, phone: auth.user.phone ?? null, children: children.data })
  } catch { return guardianJson({ error: 'Unable to load your children. Try again.' }, 500) }
}
