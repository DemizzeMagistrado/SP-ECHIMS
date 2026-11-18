import { NextResponse } from 'next/server'
import { guardianSession, guardianJson, guardianRpcError } from '@/lib/guardian/server'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return guardianJson({ error: 'Invalid request origin.' }, 403)
    const auth = await guardianSession()
    if (auth instanceof NextResponse) return auth
    // Registration basics came from Supabase's verified user's signup metadata.
    // They never select a guardian ID or grant clinical access.
    const m = auth.user.user_metadata ?? {}
    const value = (key: string) => typeof m[key] === 'string' ? m[key] : null
    if (!value('first_name') || !value('last_name')) return guardianJson({ error: 'Complete guardian registration first.' }, 400)
    const result = await auth.db.rpc('echims_guardian_register', {
      p_first_name: value('first_name'), p_last_name: value('last_name'), p_middle_name: value('middle_name'),
      p_address: value('address'), p_relationship_to_child: value('relationship_to_child'),
    })
    if (result.error) return guardianRpcError(result.error.code)
    return guardianJson(result.data)
  } catch { return guardianJson({ error: 'Unable to complete guardian registration. Try again.' }, 500) }
}
