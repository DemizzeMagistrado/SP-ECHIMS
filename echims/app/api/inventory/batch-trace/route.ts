// INV-USR006 — Trace a batch from stock-in to usage.
// GET /api/inventory/batch-trace?batch_number=XXX
//
// PHN-only (via server-side role check; RLS limits results to their RHU
// scope anyway). Returns the batch(es) that match the number plus every
// inventory_transaction linked to them, plus the child-level records
// (vaccination + supplementation) that referenced the same batch_number.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canPerform, type UserRole } from '@/lib/echims-data'

const roleAliases: Record<string, UserRole> = {
  administrator: 'Administrator', admin: 'Administrator',
  'public health nurse': 'Public Health Nurse', phn: 'Public Health Nurse',
  'barangay health worker': 'Barangay Health Worker', bhw: 'Barangay Health Worker',
  'rural health midwife': 'Rural Health Midwife', rhm: 'Rural Health Midwife',
  'barangay nutrition scholar': 'Barangay Nutrition Scholar', bns: 'Barangay Nutrition Scholar',
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  // Trusted role lookup — same pattern as other PHN-only routes.
  const prof = await supabase.rpc('get_my_profile').maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = roleAliases[String((prof.data as any)?.role ?? '').trim().toLowerCase()]
  if (!role || !(role === 'Administrator' || role === 'Public Health Nurse')) {
    return NextResponse.json({ error: 'Only Public Health Nurses (or Admin) can trace batches.' }, { status: 403 })
  }
  // Belt-and-suspenders — also check the module perm so the matrix stays source of truth.
  if (!canPerform(role, 'Inventory', 'view')) {
    return NextResponse.json({ error: 'Not authorized to view inventory.' }, { status: 403 })
  }

  const batchNumber = (new URL(request.url).searchParams.get('batch_number') ?? '').trim()
  if (!batchNumber) return NextResponse.json({ error: 'batch_number query param is required.' }, { status: 400 })

  // Step 1: matching batches (one per barangay — same batch_number can be
  // split across inventories after allocations).
  const batchesRes = await supabase.from('inventory_batch')
    .select(`
      batch_id, batch_number, expiry_date, received_date, quantity_on_hand,
      inventory:inventory(
        inventory_id, barangay_id, item_id, quantity_on_hand,
        item:item(item_id, item_name, unit),
        barangay:barangay(barangay_id, barangay_name)
      )
    `)
    .eq('batch_number', batchNumber)
    .order('expiry_date', { ascending: true })
  if (batchesRes.error) return NextResponse.json({ error: batchesRes.error.message }, { status: 500 })
  const batches = batchesRes.data ?? []
  const batchIds = batches.map((b) => b.batch_id)

  // Step 2: all transactions touching those batch_ids
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let transactions: any[] = []
  if (batchIds.length) {
    const txRes = await supabase.from('inventory_transaction')
      .select(`
        transaction_id, transaction_type, movement_subtype, quantity,
        transaction_date, reference_number, remarks,
        inventory_id, inventory_batch_id, stock_request_id,
        inventory:inventory(barangay_id, barangay:barangay(barangay_name))
      `)
      .in('inventory_batch_id', batchIds)
      .order('transaction_date', { ascending: true })
    if (!txRes.error) transactions = txRes.data ?? []
  }

  // Step 3: child-level usage — vaccination records with this batch_number
  const vaxRes = await supabase.from('vaccination_record')
    .select(`
      vaccination_record_id, vaccination_date, dose_number, status, batch_number,
      child:child(child_id, first_name, middle_name, last_name, barangay_id,
        barangay:barangay(barangay_name)),
      vaccine:vaccine(vaccine_id, vaccine_type, item:item(item_name))
    `)
    .eq('batch_number', batchNumber)
    .order('vaccination_date', { ascending: false })
  const vaccinations = vaxRes.error ? [] : (vaxRes.data ?? [])

  // Step 4: supplementation records (uses batch_number too)
  const supRes = await supabase.from('supplementation_record')
    .select(`
      supplementation_record_id, supplementation_date, quantity_given, batch_number,
      child:child(child_id, first_name, middle_name, last_name, barangay_id,
        barangay:barangay(barangay_name)),
      supplement:supplement(supplement_id, supplement_type)
    `)
    .eq('batch_number', batchNumber)
    .order('supplementation_date', { ascending: false })
  const supplementations = supRes.error ? [] : (supRes.data ?? [])

  return NextResponse.json({
    batch_number: batchNumber,
    batches,
    transactions,
    vaccinations,
    supplementations,
    counts: {
      batches: batches.length,
      transactions: transactions.length,
      children_vaccinated: vaccinations.length,
      children_supplemented: supplementations.length,
    },
  })
}
