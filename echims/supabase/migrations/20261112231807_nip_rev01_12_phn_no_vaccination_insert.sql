-- NIP-REV01 backend 12 — role matrix alignment: PHN does not record vaccinations.
-- The matrix (docs/permissions.md) gives PHN Vaccination view / edit / approve / export, no create,
-- and the APIs already refuse PHN creates (records, prior records). RLS still let a PHN insert
-- through phn_rhu_all_vaccination_record (FOR ALL). It is split into SELECT / UPDATE / DELETE
-- with the same RHU scope; reviews keep working through msp_review_vaccination_record.
-- Backup: backup_nip_rev01_be.policies_vaccination_record_before_12.

drop policy if exists phn_rhu_all_vaccination_record on public.vaccination_record;
create policy phn_rhu_select_vaccination_record on public.vaccination_record for select
  using (is_phn() and exists (select 1 from public.child c where c.child_id = vaccination_record.child_id and is_phn_assigned_to_rhu(c.barangay_id)));
create policy phn_rhu_update_vaccination_record on public.vaccination_record for update
  using (is_phn() and exists (select 1 from public.child c where c.child_id = vaccination_record.child_id and is_phn_assigned_to_rhu(c.barangay_id)))
  with check (is_phn() and exists (select 1 from public.child c where c.child_id = vaccination_record.child_id and is_phn_assigned_to_rhu(c.barangay_id)));
create policy phn_rhu_delete_vaccination_record on public.vaccination_record for delete
  using (is_phn() and exists (select 1 from public.child c where c.child_id = vaccination_record.child_id and is_phn_assigned_to_rhu(c.barangay_id)));
