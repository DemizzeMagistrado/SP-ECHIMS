BEGIN;

ALTER TABLE public.masterlist_staging ADD COLUMN IF NOT EXISTS scope_barangay_id bigint REFERENCES public.barangay(barangay_id);
CREATE INDEX IF NOT EXISTS mlu_staging_batch_scope_idx ON public.masterlist_staging(batch_id, scope_barangay_id);
ALTER TABLE public.child ALTER COLUMN household_id DROP NOT NULL;
ALTER TABLE public.child ADD COLUMN IF NOT EXISTS masterlist_imported_at timestamptz;

-- Preserve saved uploads. Only recover a location when the source name has a single match.
WITH resolved AS (
  SELECT s.staging_id, min(b.barangay_id) AS id
  FROM public.masterlist_staging s
  JOIN public.barangay b ON lower(btrim(b.barangay_name)) = lower(btrim(s.raw->>'barangay_name'))
    AND (nullif(btrim(s.raw->>'municipality'), '') IS NULL OR lower(btrim(b.municipality)) = lower(btrim(s.raw->>'municipality')))
    AND (nullif(btrim(s.raw->>'province'), '') IS NULL OR lower(btrim(b.province)) = lower(btrim(s.raw->>'province')))
  WHERE s.scope_barangay_id IS NULL AND s.status IN ('VALID', 'PENDING', 'ERROR')
  GROUP BY s.staging_id HAVING count(*) = 1
)
UPDATE public.masterlist_staging s
SET scope_barangay_id = resolved.id,
    normalized = CASE WHEN s.status = 'VALID' THEN
      coalesce(s.normalized, '{}'::jsonb) || jsonb_build_object(
        'barangay_id', resolved.id::text, 'child_address', s.raw->>'household_address'
      )
      ELSE s.normalized END
FROM resolved WHERE resolved.staging_id = s.staging_id;

UPDATE public.masterlist_staging
SET status = 'ERROR', errors = ARRAY['Confirm the child’s barangay before registering this row.']
WHERE scope_barangay_id IS NULL AND status = 'VALID';

CREATE OR REPLACE FUNCTION public.mlu_can_manage()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(public.is_admin() OR public.is_phn() OR public.is_midwife() OR public.is_bhw(), false)
$$;

CREATE OR REPLACE FUNCTION public.mlu_in_scope(p_barangay_id bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(p_barangay_id IS NOT NULL AND (
    public.is_admin()
    OR (public.is_phn() AND public.is_phn_assigned_to_rhu(p_barangay_id))
    OR ((public.is_midwife() OR public.is_bhw()) AND public.is_assigned_to_barangay(p_barangay_id))
  ), false)
$$;

-- Include the directory's location names to detect ambiguity even when only one match is assigned.
CREATE OR REPLACE FUNCTION public.mlu_locations()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'barangay_id', b.barangay_id, 'barangay_name', b.barangay_name, 'municipality', b.municipality,
    'province', b.province, 'allowed', public.mlu_in_scope(b.barangay_id)
  ) ORDER BY b.province, b.municipality, b.barangay_name), '[]'::jsonb)
  FROM public.barangay b WHERE public.mlu_can_manage()
$$;

CREATE OR REPLACE FUNCTION public.mlu_owns_batch(p_batch_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.masterlist_upload_batch b WHERE b.batch_id = p_batch_id AND b.uploaded_by = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.mlu_can_read_batch(p_batch_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.mlu_can_manage() AND (public.mlu_owns_batch(p_batch_id) OR EXISTS (
    SELECT 1 FROM public.masterlist_staging s
    WHERE s.batch_id = p_batch_id AND public.mlu_in_scope(s.scope_barangay_id)
  ))
$$;

REVOKE ALL ON FUNCTION public.mlu_can_manage(), public.mlu_in_scope(bigint), public.mlu_locations(),
  public.mlu_owns_batch(bigint), public.mlu_can_read_batch(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mlu_can_manage(), public.mlu_in_scope(bigint), public.mlu_locations(),
  public.mlu_owns_batch(bigint), public.mlu_can_read_batch(bigint) TO authenticated;

DROP POLICY IF EXISTS mlu_batch_rhm_scope ON public.masterlist_upload_batch;
DROP POLICY IF EXISTS mlu_staging_rhm_scope ON public.masterlist_staging;
DROP POLICY IF EXISTS mlu_batch_insert ON public.masterlist_upload_batch;
CREATE POLICY mlu_batch_insert ON public.masterlist_upload_batch FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.mlu_can_manage());
CREATE POLICY mlu_roster_batch_select ON public.masterlist_upload_batch FOR SELECT TO authenticated
  USING (public.mlu_can_read_batch(batch_id));
CREATE POLICY mlu_roster_batch_select_scope ON public.masterlist_upload_batch AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.mlu_can_read_batch(batch_id));
CREATE POLICY mlu_roster_batch_update ON public.masterlist_upload_batch FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() AND public.mlu_can_manage());
CREATE POLICY mlu_roster_batch_update_scope ON public.masterlist_upload_batch AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() AND public.mlu_can_manage());
CREATE POLICY mlu_roster_batch_delete_scope ON public.masterlist_upload_batch AS RESTRICTIVE FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() AND public.mlu_can_manage());

CREATE POLICY mlu_roster_stage_scope ON public.masterlist_staging AS RESTRICTIVE FOR ALL TO authenticated USING (
  public.mlu_can_manage() AND (public.mlu_in_scope(scope_barangay_id)
    OR (scope_barangay_id IS NULL AND public.mlu_owns_batch(batch_id)))
);
CREATE POLICY mlu_roster_stage_select ON public.masterlist_staging FOR SELECT TO authenticated USING (true);
CREATE POLICY mlu_roster_stage_insert ON public.masterlist_staging FOR INSERT TO authenticated
  WITH CHECK (public.mlu_owns_batch(batch_id));
CREATE POLICY mlu_roster_stage_insert_owner ON public.masterlist_staging AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.mlu_owns_batch(batch_id));
CREATE POLICY mlu_roster_stage_update ON public.masterlist_staging FOR UPDATE TO authenticated
  USING (status IN ('ERROR', 'PENDING', 'VALID')) WITH CHECK (status IN ('ERROR', 'PENDING', 'VALID'));
CREATE POLICY mlu_roster_stage_update_scope ON public.masterlist_staging AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (status IN ('ERROR', 'PENDING', 'VALID')) WITH CHECK (status IN ('ERROR', 'PENDING', 'VALID'));
CREATE POLICY mlu_roster_stage_delete ON public.masterlist_staging FOR DELETE TO authenticated
  USING (status IN ('ERROR', 'PENDING', 'VALID'));
CREATE POLICY mlu_roster_stage_delete_scope ON public.masterlist_staging AS RESTRICTIVE FOR DELETE TO authenticated
  USING (status IN ('ERROR', 'PENDING', 'VALID'));

-- A resolved row stays tied to its source barangay and import batch.
CREATE OR REPLACE FUNCTION public.mlu_guard_source_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.batch_id IS DISTINCT FROM NEW.batch_id OR (
    OLD.scope_barangay_id IS NOT NULL AND OLD.scope_barangay_id IS DISTINCT FROM NEW.scope_barangay_id
  ) THEN
    RAISE EXCEPTION 'The row’s import batch and confirmed barangay cannot be changed.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER mlu_guard_source_scope BEFORE UPDATE ON public.masterlist_staging
  FOR EACH ROW EXECUTE FUNCTION public.mlu_guard_source_scope();

CREATE OR REPLACE FUNCTION public.mlu_import_batch(p_batch_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r record;
  n jsonb;
  batch_status text;
  today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  birth date;
  brgy bigint;
  child_id_found bigint;
  matches bigint;
  household_id_found bigint;
  guardian_id_found bigint;
  house_address text;
  house_number text;
  imported integer := 0;
  duplicates integer := 0;
  failed integer := 0;
BEGIN
  IF NOT public.mlu_can_read_batch(p_batch_id) THEN
    RAISE EXCEPTION 'This batch is outside your scope.' USING ERRCODE = '42501';
  END IF;
  SELECT b.status INTO batch_status FROM public.masterlist_upload_batch b WHERE b.batch_id = p_batch_id FOR UPDATE;
  IF batch_status IS DISTINCT FROM 'VALIDATED' AND batch_status IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'This batch is not ready to import.' USING ERRCODE = '55000';
  END IF;
  FOR r IN SELECT s.* FROM public.masterlist_staging s
    WHERE s.batch_id = p_batch_id AND s.status = 'VALID' AND public.mlu_in_scope(s.scope_barangay_id)
    ORDER BY s.row_number, s.staging_id FOR UPDATE
  LOOP
    BEGIN
      n := r.normalized;
      brgy := r.scope_barangay_id;
      birth := nullif(n->>'child_date_of_birth', '')::date;
      IF n->>'barangay_id' IS DISTINCT FROM brgy::text OR NOT public.mlu_in_scope(brgy)
        OR NOT EXISTS (SELECT 1 FROM public.barangay b WHERE b.barangay_id = brgy AND
          lower(regexp_replace(btrim(b.barangay_name), '\s+', ' ', 'g')) =
          lower(regexp_replace(btrim(n->>'barangay_name'), '\s+', ' ', 'g')) AND
          (nullif(btrim(n->>'municipality'), '') IS NULL OR lower(btrim(b.municipality)) = lower(btrim(n->>'municipality'))) AND
          (nullif(btrim(n->>'province'), '') IS NULL OR lower(btrim(b.province)) = lower(btrim(n->>'province'))))
        OR birth IS NULL OR birth > today OR (birth + interval '5 years')::date <= today
        OR nullif(btrim(n->>'child_first_name'), '') IS NULL OR nullif(btrim(n->>'child_last_name'), '') IS NULL
        OR coalesce(n->>'child_sex', '') NOT IN ('MALE', 'FEMALE') THEN
        RAISE EXCEPTION 'Verify the child’s name, sex, date of birth and assigned barangay.';
      END IF;

      PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', 'mlu-child', brgy,
        lower(btrim(n->>'child_first_name')), lower(btrim(n->>'child_last_name')), birth), 0));
      SELECT count(*), min(c.child_id) INTO matches, child_id_found
      FROM public.child c WHERE c.barangay_id = brgy AND c.date_of_birth = birth
        AND lower(btrim(c.first_name)) = lower(btrim(n->>'child_first_name'))
        AND lower(btrim(c.last_name)) = lower(btrim(n->>'child_last_name'));
      IF matches > 0 THEN
        UPDATE public.masterlist_staging SET status = 'DUPLICATE',
          matched_child_id = CASE WHEN matches = 1 THEN child_id_found END,
          errors = ARRAY['Possible duplicate. Review the existing child before making changes.'], updated_at = now()
        WHERE staging_id = r.staging_id;
        duplicates := duplicates + 1;
        CONTINUE;
      END IF;

      house_address := nullif(btrim(n->>'household_address'), '');
      house_number := nullif(btrim(n->>'household_no'), '');
      household_id_found := NULL;
      IF house_number IS NOT NULL OR house_address IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', 'mlu-household', brgy, lower(coalesce(house_number, house_address))), 0));
        SELECT count(*), min(h.household_id) INTO matches, household_id_found
        FROM public.household h WHERE h.barangay_id = brgy
          AND CASE WHEN house_number IS NOT NULL THEN lower(btrim(h.household_no)) = lower(house_number)
                     AND (house_address IS NULL OR lower(btrim(h.household_address)) = lower(house_address))
                   ELSE lower(btrim(h.household_address)) = lower(house_address) END;
        IF matches > 1 THEN
          household_id_found := NULL;
        ELSIF matches = 0 AND house_address IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.household h WHERE h.barangay_id = brgy AND lower(btrim(h.household_no)) = lower(house_number)
        ) THEN
          INSERT INTO public.household (household_address, barangay_id, purok, household_no, is_4ps_member)
          VALUES (house_address, brgy, nullif(n->>'purok', ''), house_number, coalesce(n->>'is_4ps_member' = 'true', false))
          RETURNING household_id INTO household_id_found;
        END IF;
      END IF;

      guardian_id_found := NULL;
      IF nullif(btrim(n->>'guardian_first_name'), '') IS NOT NULL AND nullif(btrim(n->>'guardian_last_name'), '') IS NOT NULL THEN
        INSERT INTO public.guardian (first_name, middle_name, last_name, contact_number, relationship_to_child)
        VALUES (n->>'guardian_first_name', nullif(n->>'guardian_middle_name', ''), n->>'guardian_last_name',
          nullif(n->>'guardian_contact_number', ''), nullif(n->>'guardian_relationship', ''))
        RETURNING guardian_id INTO guardian_id_found;
      END IF;

      INSERT INTO public.child (first_name, middle_name, last_name, date_of_birth, sex, birth_place, address,
        household_id, barangay_id, guardian_id, status, masterlist_imported_at)
      VALUES (n->>'child_first_name', nullif(n->>'child_middle_name', ''), n->>'child_last_name', birth,
        n->>'child_sex', nullif(n->>'child_birth_place', ''), nullif(n->>'child_address', ''),
        household_id_found, brgy, guardian_id_found, 'ACTIVE', now()) RETURNING child_id INTO child_id_found;

      UPDATE public.masterlist_staging SET status = 'IMPORTED', matched_child_id = child_id_found, updated_at = now()
      WHERE staging_id = r.staging_id;
      imported := imported + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.masterlist_staging SET status = 'ERROR',
        errors = ARRAY['Could not register this row. Review the information and try again.'], updated_at = now()
      WHERE staging_id = r.staging_id;
      failed := failed + 1;
    END;
  END LOOP;

  UPDATE public.masterlist_upload_batch b SET
    status = CASE WHEN EXISTS (
      SELECT 1 FROM public.masterlist_staging s WHERE s.batch_id = p_batch_id AND s.status IN ('PENDING', 'ERROR', 'VALID')
    ) THEN 'VALIDATED' ELSE 'COMPLETED' END,
    valid_count = (SELECT count(*) FROM public.masterlist_staging s WHERE s.batch_id = p_batch_id AND s.status = 'VALID'),
    error_count = (SELECT count(*) FROM public.masterlist_staging s WHERE s.batch_id = p_batch_id AND s.status IN ('ERROR','PENDING')),
    imported_count = (SELECT count(*) FROM public.masterlist_staging s WHERE s.batch_id = p_batch_id AND s.status = 'IMPORTED'),
    duplicate_count = (SELECT count(*) FROM public.masterlist_staging s WHERE s.batch_id = p_batch_id AND s.status = 'DUPLICATE'),
    completed_at = CASE WHEN imported > 0 THEN now() ELSE b.completed_at END
  WHERE b.batch_id = p_batch_id;

  RETURN jsonb_build_object('imported', imported, 'duplicates', duplicates, 'failed', failed);
END
$$;

-- Preview only matches visible to the caller through the regular staging and child RLS.
CREATE OR REPLACE FUNCTION public.mlu_preview_matches(p_batch_id bigint)
RETURNS TABLE (staging_id bigint, child_id bigint)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT s.staging_id, CASE WHEN count(*) = 1 THEN min(c.child_id) END
  FROM public.masterlist_staging s
  JOIN public.child c ON c.barangay_id = s.scope_barangay_id
    AND to_char(c.date_of_birth, 'YYYY-MM-DD') = s.normalized->>'child_date_of_birth'
    AND lower(btrim(c.first_name)) = lower(btrim(s.normalized->>'child_first_name'))
    AND lower(btrim(c.last_name)) = lower(btrim(s.normalized->>'child_last_name'))
  WHERE s.batch_id = p_batch_id AND s.status = 'VALID' AND public.mlu_in_scope(s.scope_barangay_id)
  GROUP BY s.staging_id
$$;

REVOKE ALL ON FUNCTION public.mlu_preview_matches(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mlu_preview_matches(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.mlu_import_batch(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mlu_import_batch(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.mlu_update_profile_section(
  p_child_id bigint, p_section text, p_expected jsonb, p_details jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.child%rowtype;
  g public.guardian%rowtype;
  h public.household%rowtype;
  expected jsonb;
  id bigint;
BEGIN
  SELECT * INTO c FROM public.child WHERE child_id = p_child_id FOR UPDATE;
  IF NOT FOUND OR c.masterlist_imported_at IS NULL OR NOT public.mlu_in_scope(c.barangay_id) THEN
    RAISE EXCEPTION 'This imported child is outside your editing scope.' USING ERRCODE = '42501';
  END IF;

  IF p_section = 'guardian' THEN
    IF c.guardian_id IS NOT NULL THEN
      SELECT * INTO STRICT g FROM public.guardian WHERE guardian_id = c.guardian_id FOR UPDATE;
      IF EXISTS (SELECT 1 FROM public.child sibling WHERE sibling.guardian_id = g.guardian_id AND NOT public.mlu_in_scope(sibling.barangay_id)) THEN
        RAISE EXCEPTION 'This guardian is shared with a child outside your editing scope.' USING ERRCODE = '42501';
      END IF;
    END IF;
    expected := jsonb_build_object('id', c.guardian_id, 'first_name', coalesce(g.first_name, ''),
      'middle_name', coalesce(g.middle_name, ''), 'last_name', coalesce(g.last_name, ''),
      'relationship_to_child', coalesce(g.relationship_to_child, ''), 'contact_number', coalesce(g.contact_number, ''),
      'address', coalesce(g.address, ''));
    IF p_expected IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'The guardian changed. Refresh and try again.' USING ERRCODE = '40001';
    END IF;
    IF nullif(btrim(p_details->>'first_name'), '') IS NULL OR nullif(btrim(p_details->>'last_name'), '') IS NULL
      OR (nullif(p_details->>'contact_number','') IS NOT NULL AND p_details->>'contact_number' !~ '^09[0-9]{9}$') THEN
      RAISE EXCEPTION 'Enter the guardian’s name and a valid mobile number if available.' USING ERRCODE = '22023';
    END IF;
    IF c.guardian_id IS NULL THEN
      INSERT INTO public.guardian(first_name, middle_name, last_name, relationship_to_child, contact_number, address)
      VALUES (btrim(p_details->>'first_name'), nullif(btrim(p_details->>'middle_name'), ''),
        btrim(p_details->>'last_name'), nullif(btrim(p_details->>'relationship_to_child'), ''),
        nullif(p_details->>'contact_number', ''), nullif(btrim(p_details->>'address'), ''))
      RETURNING guardian_id INTO id;
      UPDATE public.child SET guardian_id = id WHERE child_id = p_child_id;
    ELSE
      UPDATE public.guardian SET first_name = btrim(p_details->>'first_name'), middle_name = nullif(btrim(p_details->>'middle_name'), ''),
        last_name = btrim(p_details->>'last_name'), relationship_to_child = nullif(btrim(p_details->>'relationship_to_child'), ''),
        contact_number = nullif(p_details->>'contact_number', ''), address = nullif(btrim(p_details->>'address'), '')
      WHERE guardian_id = g.guardian_id;
    END IF;
  ELSIF p_section = 'household' THEN
    SELECT * INTO h FROM public.household WHERE household_id = c.household_id FOR UPDATE;
    IF NOT FOUND OR h.barangay_id IS DISTINCT FROM c.barangay_id THEN
      RAISE EXCEPTION 'Assign a household in the child’s barangay first.' USING ERRCODE = '42501';
    END IF;
    expected := jsonb_build_object('id', c.household_id, 'household_address', coalesce(h.household_address, ''),
      'household_no', coalesce(h.household_no, ''), 'purok', coalesce(h.purok, ''));
    IF p_expected IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'The household changed. Refresh and try again.' USING ERRCODE = '40001';
    END IF;
    IF nullif(btrim(p_details->>'household_address'), '') IS NULL THEN
      RAISE EXCEPTION 'Enter the household address.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.household other WHERE other.barangay_id = h.barangay_id
      AND other.household_id <> h.household_id AND lower(btrim(other.household_no)) = lower(nullif(btrim(p_details->>'household_no'), ''))) THEN
      RAISE EXCEPTION 'This household number is already in use in the barangay.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.household SET household_address = btrim(p_details->>'household_address'),
      household_no = nullif(btrim(p_details->>'household_no'), ''), purok = nullif(btrim(p_details->>'purok'), '')
    WHERE household_id = h.household_id;
  ELSE
    RAISE EXCEPTION 'Choose a household or guardian section.' USING ERRCODE = '22023';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.mlu_update_profile_section(bigint, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mlu_update_profile_section(bigint, text, jsonb, jsonb) TO authenticated;

COMMIT;
