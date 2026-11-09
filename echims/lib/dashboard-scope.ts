// RPT-USR001 — Which barangays a dashboard user may count. Shared by
// /api/dashboard/summary and /api/dashboard/widgets.
// BHW/BNS/RHM = active assignments; PHN = their RHU; Admin = null (everything).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function trustedRole(supabase: any): Promise<string | null> {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle()
  const r = String(data?.role ?? '').trim()
  return r || null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function scopeBarangays(supabase: any, userId: string, role: string): Promise<number[] | null> {
  if (role === 'Barangay Health Worker' || role === 'Barangay Nutrition Scholar' || role === 'Rural Health Midwife') {
    const assignRes = await supabase.from('health_worker_assignment')
      .select('barangay_id, status')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
    return (assignRes.data ?? []).map((r: { barangay_id: number }) => r.barangay_id)
  }
  if (role === 'Public Health Nurse') {
    const phnRes = await supabase.from('public_health_nurse').select('rhu_id').eq('user_id', userId).maybeSingle()
    const rhuId = phnRes.data?.rhu_id
    if (!rhuId) return []
    const bRes = await supabase.from('barangay').select('barangay_id').eq('rhu_id', rhuId)
    return (bRes.data ?? []).map((r: { barangay_id: number }) => r.barangay_id)
  }
  return null
}
