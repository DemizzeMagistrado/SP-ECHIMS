import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Please sign in.' }, 401)
    // RPC independently verifies active account, PHN/admin role and RHU scope.
    const { data, error } = await supabase.rpc('get_supplementation_compliance')
    if (error) {
      if (error.code === '42501') return json({ error: error.message }, 403)
      console.error('Supplementation monitoring lookup failed:', error)
      return json(
        {
          error:
            'Unable to load monitoring. Check the compliance migration and server terminal.',
        },
        500,
      )
    }
    if (!data || !Array.isArray(data.rows))
      return json({ error: 'Monitoring returned an invalid response.' }, 500)
    return json({ ...data, currentUserId: user.id })
  } catch (error) {
    console.error('Supplementation monitoring GET failed:', error)
    return json({ error: 'Unable to load supplementation monitoring.' }, 500)
  }
}
