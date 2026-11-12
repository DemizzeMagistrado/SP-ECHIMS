import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { splitOtherConditions } from '@/lib/children/medical-history'

// Medical history picker options: the active illness catalog plus "Other" entries typed before,
// most frequent first. Profile records are read through RLS, so suggestions only come from
// children in the signed-in worker's own scope (their barangays / RHU).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in to load the medical history list.' }, { status: 401 })

  const [catalog, saved] = await Promise.all([
    supabase.from('child_medical_condition_catalog').select('code, label').eq('is_active', true).order('label'),
    supabase.from('child_profile_record').select('medical_history_structured')
      .not('medical_history_structured->>other_details', 'is', null)
      .order('profiling_date', { ascending: false }).limit(2000),
  ])
  if (catalog.error) return NextResponse.json({ error: 'The illness list could not be loaded. You can still type the condition under Other.' }, { status: 500 })

  const counts = new Map<string, { label: string; count: number }>()
  for (const row of saved.data ?? []) {
    const details = (row.medical_history_structured as { other_details?: unknown } | null)?.other_details
    for (const label of splitOtherConditions(typeof details === 'string' ? details : '')) {
      const key = label.toLowerCase()
      const hit = counts.get(key)
      if (hit) hit.count++
      else counts.set(key, { label, count: 1 })
    }
  }
  const suggestions = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 25).map((s) => s.label)

  return NextResponse.json({ conditions: catalog.data ?? [], suggestions }, { headers: { 'Cache-Control': 'private, no-store' } })
}
