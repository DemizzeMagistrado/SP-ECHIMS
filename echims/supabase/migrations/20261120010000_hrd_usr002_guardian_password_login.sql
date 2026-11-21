BEGIN;

CREATE OR REPLACE FUNCTION echims_guardian_private.normalized_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT lower(btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g')));
$$;

REVOKE ALL ON FUNCTION echims_guardian_private.normalized_name(text) FROM PUBLIC, anon, authenticated;

-- Resolve names only on the server. Shared names must use the mobile sign-in field.
CREATE OR REPLACE FUNCTION public.echims_guardian_login_phone(p_full_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
 SELECT CASE WHEN count(*) = 1 THEN min(matches.phone) END
 FROM (
   SELECT echims_guardian_private.phone(u.phone) AS phone
   FROM public.guardian_portal_account a
   JOIN auth.users u ON u.id = a.auth_user_id
   WHERE a.enabled AND u.phone_confirmed_at IS NOT NULL
     AND char_length(p_full_name) BETWEEN 1 AND 302
     AND echims_guardian_private.phone(u.phone) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users staff WHERE staff.user_id = u.id)
     AND echims_guardian_private.normalized_name(p_full_name) IN (
       echims_guardian_private.normalized_name(concat_ws(' ', a.first_name, a.middle_name, a.last_name)),
       echims_guardian_private.normalized_name(concat_ws(' ', a.first_name, a.last_name))
     )
   LIMIT 2
 ) matches;
$$;

REVOKE ALL ON FUNCTION public.echims_guardian_login_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.echims_guardian_login_phone(text) TO service_role;

-- Guardians who originally used OTP alone may set their first password after SMS verification.
CREATE OR REPLACE FUNCTION public.echims_guardian_can_set_password()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
BEGIN
 PERFORM echims_guardian_private.session_phone();
 IF EXISTS (
   SELECT 1 FROM public.guardian_portal_account a
   WHERE a.auth_user_id = auth.uid() AND NOT a.enabled
 ) THEN
   RAISE EXCEPTION 'Contact your BHS/RHU.' USING ERRCODE = '42501';
 END IF;

 RETURN EXISTS (
   SELECT 1 FROM auth.users u
   WHERE u.id = auth.uid()
     AND u.raw_user_meta_data->>'account_type' = 'guardian'
     AND nullif(u.encrypted_password, '') IS NULL
 );
END;
$$;

REVOKE ALL ON FUNCTION public.echims_guardian_can_set_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_guardian_can_set_password() TO authenticated;

-- Keep the existing child access check and add only the data needed by this view.
CREATE OR REPLACE FUNCTION public.echims_guardian_child_profile(p_child_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_child jsonb; v_nutrition jsonb;
BEGIN
 v_child := public.echims_guardian_child(p_child_id);
 SELECT v_child || jsonb_build_object(
   'birthPlace', c.birth_place,
   'registeredAt', c.registration_date,
   'status', c.status,
   'birthLengthCm', coalesce(nullif(to_jsonb(c)->'birth_height_cm', 'null'::jsonb), to_jsonb(c)->'birth_length_cm'),
   'household', CASE WHEN h.household_id IS NOT NULL THEN jsonb_build_object(
     'familySerialNo', h.family_serial_no, 'address', h.household_address
   ) END
 ) INTO v_child
 FROM public.child c
 LEFT JOIN public.household h ON h.household_id = c.household_id
 WHERE c.child_id = p_child_id;

 SELECT jsonb_build_object(
   'id', a.assessment_id, 'date', a.assessment_date,
   'status', a.nutritional_status
 ) INTO v_nutrition
 FROM public.nutritional_assessment a
 WHERE a.child_id = p_child_id
 ORDER BY a.assessment_date DESC NULLS LAST, a.assessment_id DESC
 LIMIT 1;

 RETURN jsonb_build_object('child', v_child, 'latestNutrition', v_nutrition);
END;
$$;

REVOKE ALL ON FUNCTION public.echims_guardian_child_profile(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_guardian_child_profile(bigint) TO authenticated;

COMMIT;
