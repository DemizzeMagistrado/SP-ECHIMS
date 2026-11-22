import { NextResponse } from 'next/server'
import { dbFailure, json, smsSession } from '@/lib/sms/server'

export const dynamic = 'force-dynamic'

const programs = ['VACCINATION', 'SUPPLEMENTATION', 'CHECKUP']
const statuses = ['SUBMITTED', 'IN_PROGRESS', 'FAILED']
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value

export async function GET(request: Request) {
  try {
    const auth = await smsSession()
    if (auth instanceof NextResponse) return auth
    const params = new URL(request.url).searchParams
    const program = params.get('program')
    const status = params.get('status')
    const child = params.get('child')
    const from = params.get('from')
    const through = params.get('through')
    const page = Number(params.get('page') ?? '1')
    if ((program && !programs.includes(program)) || (status && !statuses.includes(status)) ||
      (child && (!/^[1-9]\d*$/.test(child) || !Number.isSafeInteger(Number(child)))) ||
      (from && !date(from)) || (through && !date(through)) || (from && through && from > through) ||
      !Number.isInteger(page) || page < 1 || page > 4001) {
      return json({ error: 'Choose valid SMS log filters.' }, 400)
    }
    const { data, error } = await auth.db.rpc('echims_sms_logs', {
      p_program: program || null, p_status: status || null, p_child: child ? Number(child) : null,
      p_from: from || null, p_through: through || null, p_offset: (page - 1) * 25,
    })
    if (error) return dbFailure(error)
    if (data?.currentUserId !== auth.userId) return json({ error: 'Session changed. Refresh the page.' }, 409)
    return json(data)
  } catch {
    return json({ error: 'Unable to load SMS logs.' }, 500)
  }
}
