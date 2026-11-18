-- NIP-REV01 backend 09 — undo migration 05's RHM masterlist access (decision changed: the
-- manuscript user story is "As a PHN or Administrator, I want to upload an existing child
-- masterlist"). Upload, staging edits and import are PHN and Administrator only again.
-- Restored from backup_nip_rev01_be (policies_masterlist, functions 'mlu_import_batch'):
--   * mlu_batch_insert: Admin / PHN only.
--   * mlu_import_batch: Admin / PHN only, no per-row barangay restriction (as before 05).
--   * mlu_allowed_barangay_ids() is dropped (it only existed for RHM scope).
-- Kept from 05 (safety only, grants nothing to RHM): role checks use is_admin() / is_phn(),
-- which also require an ACTIVE account. Before 05 the checks only looked for a row in
-- administrator / public_health_nurse, so a deactivated Admin or PHN could still upload/import.
-- Backup: backup_nip_rev01_be.functions ('… (before 09)'), backup_nip_rev01_be.policies_masterlist_before_09.

drop policy if exists mlu_batch_insert on public.masterlist_upload_batch;
create policy mlu_batch_insert on public.masterlist_upload_batch
  for insert
  with check (uploaded_by = auth.uid() and (public.is_admin() or public.is_phn()));

create or replace function public.mlu_import_batch(p_batch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
DECLARE
  v_user uuid := auth.uid();
  v_imported int := 0;
  v_failed int := 0;
  v_household_id bigint;
  v_guardian_id bigint;
  v_child_id bigint;
  r record;
  n jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM masterlist_upload_batch WHERE batch_id = p_batch_id AND uploaded_by = v_user) THEN
    RAISE EXCEPTION 'Not your batch' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_admin() OR public.is_phn()) THEN
    RAISE EXCEPTION 'Only PHN or Admin can import' USING ERRCODE = '42501';
  END IF;

  UPDATE masterlist_upload_batch SET status = 'IMPORTING' WHERE batch_id = p_batch_id;

  FOR r IN
    SELECT * FROM masterlist_staging
    WHERE batch_id = p_batch_id AND status = 'VALID'
    ORDER BY row_number
  LOOP
    BEGIN
      n := r.normalized;

      SELECT household_id INTO v_household_id
      FROM household
      WHERE barangay_id = (n->>'barangay_id')::bigint
        AND lower(household_address) = lower(n->>'household_address')
      LIMIT 1;

      IF v_household_id IS NULL THEN
        INSERT INTO household (household_address, barangay_id, purok, household_no, is_4ps_member)
        VALUES (
          n->>'household_address',
          (n->>'barangay_id')::bigint,
          nullif(n->>'purok',''),
          nullif(n->>'household_no',''),
          coalesce(nullif(n->>'is_4ps_member','')::boolean, false)
        )
        RETURNING household_id INTO v_household_id;
      END IF;

      INSERT INTO guardian (first_name, middle_name, last_name, contact_number, relationship_to_child)
      VALUES (
        n->>'guardian_first_name',
        nullif(n->>'guardian_middle_name',''),
        n->>'guardian_last_name',
        nullif(n->>'guardian_contact_number',''),
        nullif(n->>'guardian_relationship','')
      )
      RETURNING guardian_id INTO v_guardian_id;

      INSERT INTO child (first_name, middle_name, last_name, date_of_birth, sex,
                         birth_place, household_id, barangay_id, guardian_id, status)
      VALUES (
        n->>'child_first_name',
        nullif(n->>'child_middle_name',''),
        n->>'child_last_name',
        (n->>'child_date_of_birth')::date,
        upper(n->>'child_sex'),
        nullif(n->>'child_birth_place',''),
        v_household_id,
        (n->>'barangay_id')::bigint,
        v_guardian_id,
        'ACTIVE'
      )
      RETURNING child_id INTO v_child_id;

      UPDATE masterlist_staging
        SET status = 'IMPORTED', matched_child_id = v_child_id, updated_at = now()
        WHERE staging_id = r.staging_id;
      v_imported := v_imported + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE masterlist_staging
        SET status = 'ERROR', errors = array_append(errors, SQLERRM), updated_at = now()
        WHERE staging_id = r.staging_id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  UPDATE masterlist_staging SET status = 'SKIPPED', updated_at = now()
    WHERE batch_id = p_batch_id AND status = 'DUPLICATE';

  UPDATE masterlist_upload_batch
    SET status = CASE WHEN v_failed > 0 AND v_imported = 0 THEN 'FAILED' ELSE 'COMPLETED' END,
        imported_count = v_imported,
        skipped_count = (SELECT COUNT(*) FROM masterlist_staging WHERE batch_id = p_batch_id AND status = 'SKIPPED'),
        error_count = (SELECT COUNT(*) FROM masterlist_staging WHERE batch_id = p_batch_id AND status = 'ERROR'),
        completed_at = now()
    WHERE batch_id = p_batch_id;

  RETURN jsonb_build_object('imported', v_imported, 'failed', v_failed);
END;
$function$;

drop function if exists public.mlu_allowed_barangay_ids();
