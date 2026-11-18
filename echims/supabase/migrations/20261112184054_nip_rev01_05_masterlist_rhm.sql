-- NIP-REV01 backend 05 — Masterlist upload for RHM (decision: option 3).
-- RHM uploads, previews, edits and imports masterlists on their own (no PHN approval), but only
-- rows for barangays actively assigned to them. Admin and PHN keep their current access (any
-- barangay). BHW / BNS stay without access.
-- Backup: backup_nip_rev01_be.masterlist_upload_batch / masterlist_staging / policies_masterlist / functions.

-- Barangays the signed-in user may import into: NULL = any (Admin, PHN); RHM = active assignments;
-- everyone else = none.
create or replace function public.mlu_allowed_barangay_ids()
returns bigint[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() or public.is_phn() then null
    when public.is_midwife() then coalesce(
      (select array_agg(distinct a.barangay_id) from public.health_worker_assignment a
        where a.user_id = auth.uid() and a.status = 'ACTIVE'),
      '{}'::bigint[])
    else '{}'::bigint[]
  end
$$;
revoke all on function public.mlu_allowed_barangay_ids() from public, anon;
grant execute on function public.mlu_allowed_barangay_ids() to authenticated;

-- Who may create an upload batch: Admin, PHN, and now RHM (active accounts only).
drop policy if exists mlu_batch_insert on public.masterlist_upload_batch;
create policy mlu_batch_insert on public.masterlist_upload_batch
  for insert
  with check (uploaded_by = auth.uid() and (public.is_admin() or public.is_phn() or public.is_midwife()));

-- Import: RHM allowed; every row must be in the uploader's allowed barangays (checked here,
-- because this function writes household / guardian / child as SECURITY DEFINER).
create or replace function public.mlu_import_batch(p_batch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
DECLARE
  v_user uuid := auth.uid();
  v_allowed bigint[];
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
  IF NOT (public.is_admin() OR public.is_phn() OR public.is_midwife()) THEN
    RAISE EXCEPTION 'Only PHN, RHM or Admin can import' USING ERRCODE = '42501';
  END IF;
  v_allowed := public.mlu_allowed_barangay_ids();

  UPDATE masterlist_upload_batch SET status = 'IMPORTING' WHERE batch_id = p_batch_id;

  FOR r IN
    SELECT * FROM masterlist_staging
    WHERE batch_id = p_batch_id AND status = 'VALID'
    ORDER BY row_number
  LOOP
    BEGIN
      n := r.normalized;

      IF v_allowed IS NOT NULL AND NOT (coalesce(nullif(n->>'barangay_id','')::bigint, -1) = ANY (v_allowed)) THEN
        UPDATE masterlist_staging
          SET status = 'ERROR', errors = array_append(errors, 'Barangay is not assigned to you; this row cannot be imported.'), updated_at = now()
          WHERE staging_id = r.staging_id;
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

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
