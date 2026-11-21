import { NextResponse } from 'next/server'
import { guardianSession, guardianJson, guardianRpcError } from '@/lib/guardian/server'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, context: { params: Promise<{ childId: string }> }) {
  try {
    const { childId } = await context.params
    if (!/^[1-9]\d*$/.test(childId) || !Number.isSafeInteger(Number(childId))) return guardianJson({ error: 'Invalid child ID.' }, 400)
    const auth = await guardianSession()
    if (auth instanceof NextResponse) return auth
    const query = new URL(request.url).searchParams
    const program = query.get('program')
    const before = query.get('beforeId')
    if (program && !['vaccination', 'nutrition', 'supplementation', 'checkups'].includes(program)) return guardianJson({ error: 'Invalid service.' }, 400)
    if (before !== null && (!/^[1-9]\d*$/.test(before) || !Number.isSafeInteger(Number(before)))) return guardianJson({ error: 'Invalid cursor.' }, 400)
    const result = program
      ? await auth.db.rpc('echims_guardian_history', { p_child_id: Number(childId), p_program: program, p_before_id: before ? Number(before) : null })
      : await auth.db.rpc('echims_guardian_child_profile', { p_child_id: Number(childId) })
    if (result.error) return result.error.code === '42501' ? guardianJson({ error: 'Child not found or access changed.' }, 404) : guardianRpcError(result.error.code)
    return guardianJson({ currentUserId: auth.user.id, ...result.data })
  } catch { return guardianJson({ error: 'Unable to load the child record. Try again.' }, 500) }
}
