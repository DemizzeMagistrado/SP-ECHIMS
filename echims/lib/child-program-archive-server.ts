import 'server-only'
import { NextResponse } from 'next/server'
import { householdSession, householdFailure as fail, householdHeaders as headers } from '@/lib/household-access'
type Context = {params: Promise<{childId: string}>}
export async function getChildProgramArchive(_request: Request, context: Context) {
  try {
    const raw = (await context.params).childId
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return fail('Invalid child ID.',400)
    const auth = await householdSession('view')
    if (auth instanceof NextResponse) return auth
    const result = await auth.db.from('child_program_archive_status').select('*').eq('child_id',Number(raw)).maybeSingle()
    if (result.error) return fail('Unable to load program archive status.',500)
    if (!result.data) return fail('Child not found or access denied.',404)
    return NextResponse.json({currentUserId:auth.user.id,childId:result.data.child_id,programArchive:result.data,
      automatic:true,archiveScope:'UNDER_FIVE_PROGRAM',changesRegistryStatus:false,patientRecordRetained:true},{headers})
  } catch { return fail('Unable to load program archive status.',500) }
}
export async function retiredManualClosure() {
  const auth = await householdSession('edit')
  if (auth instanceof NextResponse) return auth
  return fail('Manual closure is retired. Under-five records are archived automatically at age five. Refresh the program archive status.',410)
}
