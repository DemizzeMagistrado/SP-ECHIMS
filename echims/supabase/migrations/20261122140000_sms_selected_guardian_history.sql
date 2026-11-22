BEGIN;

CREATE OR REPLACE FUNCTION public.echims_sms_guardian_log(
  p_child bigint, p_guardian bigint
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE actor uuid := auth.uid(); result jsonb;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE user_id = actor AND account_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'An active account is required.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.child c
    WHERE c.child_id = p_child AND c.guardian_id = p_guardian
      AND public.echims_sms_child_program_access(c.child_id, actor, false, 'SUPPLEMENTATION')
  ) THEN
    RAISE EXCEPTION 'The selected guardian is unavailable for this child.' USING ERRCODE = '42501';
  END IF;
  WITH scoped_children AS MATERIALIZED (
    SELECT c.child_id, concat_ws(' ', c.first_name, c.middle_name, c.last_name) AS child_name,
      public.echims_sms_child_program_access(c.child_id, actor, false, 'VACCINATION') AS general_access
    FROM public.child c
    WHERE c.child_id = p_child AND c.guardian_id = p_guardian
      AND public.echims_sms_child_program_access(c.child_id, actor, false, 'SUPPLEMENTATION')
  ), attempts AS (
    SELECT 'program:' || a.attempt_id AS id, c.child_id, c.child_name, a.program,
      a.status, a.destination_number, a.provider_uid, a.error_code, a.created_at, (to_jsonb(a)->>'batch_id')::uuid AS batch_id
    FROM public.sms_live_attempt a
    JOIN public.sms_notification n ON n.notification_id = a.notification_id
    JOIN scoped_children c ON c.child_id = n.child_id
    WHERE n.guardian_id = p_guardian AND (c.general_access OR a.program = 'SUPPLEMENTATION')
    UNION ALL
    SELECT 'child:' || a.attempt_id, c.child_id, c.child_name, a.program,
      a.status, a.destination_number, a.provider_uid, a.error_code, a.created_at, NULL::uuid
    FROM public.child_schedule_sms_attempt a
    JOIN scoped_children c ON c.child_id = a.child_id
    WHERE a.guardian_id = p_guardian AND (c.general_access OR a.program = 'SUPPLEMENTATION')
  ), filtered AS MATERIALIZED (
    SELECT a.id, a.child_id, a.child_name, a.program,
      CASE a.status
        WHEN 'SUBMITTED' THEN 'SUBMITTED'
        WHEN 'DELIVERED' THEN 'SUBMITTED'
        WHEN 'FAILED' THEN 'FAILED'
        ELSE 'IN_PROGRESS'
      END AS status,
      CASE WHEN a.destination_number ~ '^639[0-9]{9}$'
        THEN '+' || left(a.destination_number, 4) || '****' || right(a.destination_number, 4)
      END AS masked_number,
      a.provider_uid,
      CASE WHEN a.status IN ('FAILED', 'UNCERTAIN') THEN a.error_code END AS error_code,
      (a.status = 'UNCERTAIN') AS needs_provider_check,
      a.created_at, a.batch_id
    FROM attempts a
  ), page AS (
    SELECT * FROM filtered ORDER BY created_at DESC, id DESC LIMIT 25
  )
  SELECT jsonb_build_object(
    'currentUserId', actor, 'childId', p_child, 'guardianId', p_guardian,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY created_at DESC, id DESC), '[]') FROM page)
  ) INTO result;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.echims_sms_guardian_log(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_sms_guardian_log(bigint, bigint) TO authenticated;

COMMIT;
