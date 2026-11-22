BEGIN;

ALTER TABLE public.sms_live_attempt ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE OR REPLACE FUNCTION public.echims_sms_program_sender(p_program text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT p_program IN ('VACCINATION', 'SUPPLEMENTATION')
   AND EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid() AND account_status = 'ACTIVE')
   AND NOT EXISTS (SELECT 1 FROM public.administrator WHERE user_id = auth.uid())
   AND (
     EXISTS (SELECT 1 FROM public.rural_health_midwife WHERE user_id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.barangay_health_worker WHERE user_id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.public_health_nurse WHERE user_id = auth.uid())
     OR (p_program = 'SUPPLEMENTATION'
       AND EXISTS (SELECT 1 FROM public.barangay_nutrition_scholar WHERE user_id = auth.uid()))
   )
$function$;
REVOKE ALL ON FUNCTION public.echims_sms_program_sender(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.echims_prepare_staff_program_notification(p_program text, p_service_key text, p_phase text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e record; v_id bigint; v_today date:=pg_catalog.timezone('Asia/Manila',pg_catalog.now())::date;
BEGIN
 IF public.echims_sms_program_sender(p_program) IS DISTINCT FROM true THEN RAISE EXCEPTION 'This program is outside your sender permissions.' USING ERRCODE='42501'; END IF;
 IF p_program IS NULL OR p_program NOT IN ('VACCINATION','SUPPLEMENTATION') OR p_phase IS NULL OR p_phase NOT IN ('UPCOMING','OVERDUE') THEN
  RAISE EXCEPTION 'Choose an upcoming or overdue message.' USING ERRCODE='22023'; END IF;
 SELECT x.* INTO e FROM public.guardian_sms_events_on(p_program,v_today) x
 WHERE x.service_key=p_service_key AND x.reminder_phase=p_phase;
 IF NOT FOUND THEN RAISE EXCEPTION 'This message is not eligible today. Check timing, active rule, guardian number and consent.' USING ERRCODE='22023'; END IF;
 IF NOT public.echims_sms_child_program_access(e.child_id,auth.uid(),true,p_program) THEN
  RAISE EXCEPTION 'This child is outside your current work scope.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ECHIMS_CHILD_SMS:'||e.child_id,0));
 INSERT INTO public.sms_notification(notification_type,message,channel,delivery_status,child_id,guardian_id,
  event_key,destination_number,source_module,queue_status,reminder_phase,due_date,service_key)
 VALUES(e.notification_type,e.message,'SMS','PENDING',e.child_id,e.guardian_id,e.event_key,e.destination_number,
  e.source_module,'QUEUED',e.reminder_phase,e.due_date,e.service_key)
 ON CONFLICT(guardian_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 SELECT notification_id INTO v_id FROM public.sms_notification s WHERE s.guardian_id=e.guardian_id AND s.event_key=e.event_key FOR UPDATE;
 RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.echims_prepare_staff_program_notification(text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.echims_prepare_live_sms_batch(p_program text, p_service_key text, p_phase text, p_request_id uuid, p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint; s public.sms_notification%ROWTYPE; g public.guardian%ROWTYPE; a public.sms_live_attempt%ROWTYPE; e record;
BEGIN
 IF public.echims_sms_program_sender(p_program) IS DISTINCT FROM true THEN RAISE EXCEPTION 'This program is outside your sender permissions.' USING ERRCODE='42501'; END IF;
 IF p_program IS NULL OR p_program NOT IN ('VACCINATION','SUPPLEMENTATION') OR p_phase IS NULL OR p_phase NOT IN ('UPCOMING','OVERDUE')
 OR p_request_id IS NULL OR p_service_key IS NULL OR length(p_service_key) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid saved reminder.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('LIVE_SMS:'||auth.uid()::text||':'||p_request_id::text,0));
 SELECT * INTO a FROM public.sms_live_attempt WHERE actor_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
  IF a.program<>p_program OR a.service_key<>p_service_key OR a.phase<>p_phase OR a.batch_id IS DISTINCT FROM p_batch_id THEN RAISE EXCEPTION 'Request ID belongs to another SMS action.' USING ERRCODE='23505'; END IF;
  SELECT * INTO s FROM public.sms_notification WHERE notification_id=a.notification_id;
  IF NOT public.echims_sms_child_program_access(s.child_id,auth.uid(),true,p_program) THEN RAISE EXCEPTION 'Reminder is outside your scope.' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('attempt_id',a.attempt_id,'status',a.status,'replayed',true);
 END IF;
 -- Existing authoritative function checks current phase, actual dates, rules and staff scope.
 v_id:=public.echims_prepare_staff_program_notification(p_program,p_service_key,p_phase);
 SELECT * INTO s FROM public.sms_notification WHERE notification_id=v_id FOR UPDATE;
 IF NOT FOUND OR s.source_module IS DISTINCT FROM p_program OR s.service_key IS DISTINCT FROM p_service_key
 OR s.reminder_phase IS DISTINCT FROM p_phase OR s.event_key NOT LIKE 'ALR_SMS_V1:%'
 THEN RAISE EXCEPTION 'Only current real reminders can be dispatched.' USING ERRCODE='22023'; END IF;
 IF NOT public.echims_sms_child_program_access(s.child_id,auth.uid(),true,p_program)
 THEN RAISE EXCEPTION 'Reminder is outside your assignment.' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.guardian_sms_events_on(p_program,timezone('Asia/Manila',now())::date)
 WHERE child_id=s.child_id AND guardian_id=s.guardian_id AND service_key=p_service_key AND reminder_phase=p_phase AND due_date=s.due_date;
 IF NOT FOUND THEN RAISE EXCEPTION 'This reminder is not currently eligible.' USING ERRCODE='22023'; END IF;
 SELECT * INTO g FROM public.guardian WHERE guardian_id=s.guardian_id FOR UPDATE;
 IF g.sms_opt_in IS DISTINCT FROM true OR g.sms_otp_verified_at IS NULL OR public.normalize_guardian_mobile(g.contact_number) IS NULL
 OR g.sms_otp_verified_contact_number IS DISTINCT FROM public.normalize_guardian_mobile(g.contact_number)
 THEN RAISE EXCEPTION 'Verify guardian consent and mobile number by OTP first.' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM public.sms_live_attempt WHERE notification_id=v_id AND status IN ('READY','SENDING','SUBMITTED','DELIVERED','UNCERTAIN') ORDER BY attempt_id DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('attempt_id',a.attempt_id,'status',a.status,'replayed',true,
  'can_claim', a.actor_id = auth.uid()); END IF;
 IF s.delivery_status IN ('SENT','DELIVERED') OR (s.delivery_status = 'FAILED' AND NOT EXISTS (
  SELECT 1 FROM public.sms_live_attempt WHERE notification_id=v_id AND status='FAILED'
 )) THEN RAISE EXCEPTION 'This reminder already has a real sending result.' USING ERRCODE='23505'; END IF;
 IF (SELECT count(*) FROM public.sms_live_attempt WHERE actor_id=auth.uid() AND created_at>now()-interval '1 hour')>=60
 OR (SELECT count(*) FROM public.sms_live_attempt WHERE notification_id=v_id AND created_at>now()-interval '1 day')>=3
 THEN RAISE EXCEPTION 'SMS sending limit reached. Try later.' USING ERRCODE='P0001'; END IF;
 UPDATE public.sms_notification SET delivery_status='PENDING',queue_status='QUEUED',queue_note=NULL,
  message=e.message,destination_number=e.destination_number WHERE notification_id=v_id;
 INSERT INTO public.sms_live_attempt(notification_id,actor_id,request_id,program,service_key,phase,destination_number,message_snapshot,contact_version,batch_id)
 VALUES(v_id,auth.uid(),p_request_id,p_program,p_service_key,p_phase,e.destination_number,e.message,g.sms_contact_version,p_batch_id)
 RETURNING * INTO a;
 RETURN jsonb_build_object('attempt_id',a.attempt_id,'status',a.status,'replayed',false);
END $function$;
REVOKE ALL ON FUNCTION public.echims_prepare_live_sms_batch(text,text,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_prepare_live_sms_batch(text,text,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.echims_prepare_live_sms(
  p_program text, p_service_key text, p_phase text, p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT public.echims_prepare_live_sms_batch(p_program,p_service_key,p_phase,p_request_id,NULL);
$function$;
REVOKE ALL ON FUNCTION public.echims_prepare_live_sms(text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_prepare_live_sms(text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.echims_claim_live_sms(p_attempt_id bigint, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.sms_live_attempt%ROWTYPE; s public.sms_notification%ROWTYPE; g public.guardian%ROWTYPE; child_key bigint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Server dispatch required.' USING ERRCODE='42501';
 END IF;
 SELECT n.child_id INTO child_key
 FROM public.sms_live_attempt attempt JOIN public.sms_notification n USING (notification_id)
 WHERE attempt.attempt_id=p_attempt_id AND attempt.actor_id=p_actor_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SMS attempt not found.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ECHIMS_CHILD_SMS:'||child_key,0));
 SELECT * INTO a FROM public.sms_live_attempt WHERE attempt_id=p_attempt_id FOR UPDATE;
 IF NOT FOUND OR a.actor_id<>p_actor_id THEN RAISE EXCEPTION 'SMS attempt not found.' USING ERRCODE='42501'; END IF;
 IF a.status<>'READY' THEN RETURN jsonb_build_object('send',false,'status',a.status); END IF;
 SELECT * INTO s FROM public.sms_notification WHERE notification_id=a.notification_id;
 SELECT * INTO g FROM public.guardian WHERE guardian_id=s.guardian_id FOR UPDATE;
 IF NOT public.echims_sms_child_program_access(s.child_id,p_actor_id,true,a.program) OR g.sms_opt_in IS DISTINCT FROM true
 OR g.sms_contact_version IS DISTINCT FROM a.contact_version OR g.sms_otp_verified_at IS NULL
 OR g.sms_otp_verified_contact_number IS DISTINCT FROM a.destination_number
 OR public.normalize_guardian_mobile(g.contact_number) IS DISTINCT FROM a.destination_number
 OR a.created_at<now()-interval '60 seconds' OR NOT EXISTS(SELECT 1 FROM public.child c WHERE c.child_id=s.child_id AND c.guardian_id=g.guardian_id AND c.status='ACTIVE')
 OR NOT EXISTS (
  SELECT 1 FROM public.guardian_sms_events_on(a.program,timezone('Asia/Manila',now())::date) e
  WHERE e.child_id=s.child_id AND e.guardian_id=g.guardian_id AND e.event_key=s.event_key
    AND e.service_key=a.service_key AND e.reminder_phase=a.phase AND e.due_date=s.due_date
    AND e.destination_number=a.destination_number
    AND regexp_replace(regexp_replace(e.message,'^eCHIMS[[:space:]:-]*','','i'),
      '[[:space:]]*Please do not reply[.]?[[:space:]]*$','','i')=a.message_snapshot
 )
 THEN
  UPDATE public.sms_live_attempt SET status='FAILED',error_code='ELIGIBILITY_CHANGED',completed_at=now() WHERE attempt_id=a.attempt_id;
  RETURN jsonb_build_object('send',false,'status','FAILED');
 END IF;
 UPDATE public.sms_live_attempt SET status='SENDING',dispatched_at=now() WHERE attempt_id=a.attempt_id;
 RETURN jsonb_build_object('send',true,'status','SENDING','destination',a.destination_number,'message',a.message_snapshot);
END $function$;
REVOKE ALL ON FUNCTION public.echims_claim_live_sms(bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.echims_claim_live_sms(bigint,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_sms_program_overview(p_program text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_rows jsonb; v_today date:=pg_catalog.timezone('Asia/Manila',pg_catalog.now())::date;
BEGIN
 IF p_program IS NULL OR p_program NOT IN ('VACCINATION','SUPPLEMENTATION') THEN RAISE EXCEPTION 'Invalid program.' USING ERRCODE='22023'; END IF;
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.account_status='ACTIVE') THEN
  RAISE EXCEPTION 'An active account is required.' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q)),'[]'::jsonb) INTO v_rows FROM (
  SELECT f.*,
   CASE WHEN g.guardian_id IS NULL THEN 'NO_GUARDIAN'
    WHEN public.normalize_guardian_mobile(g.contact_number) IS NULL THEN 'NO_VALID_NUMBER'
    WHEN g.sms_opt_in IS DISTINCT FROM true OR g.sms_contact_verified_at IS NULL OR g.sms_contact_verified_by IS NULL
      OR g.sms_verified_contact_number IS DISTINCT FROM public.normalize_guardian_mobile(g.contact_number) THEN 'CONSENT_REQUIRED'
    ELSE 'CONFIRMED' END AS contact_status,
   CASE WHEN g.contact_number IS NULL THEN NULL ELSE '+'||pg_catalog.left(public.normalize_guardian_mobile(g.contact_number),4)||'****'||pg_catalog.right(public.normalize_guardian_mobile(g.contact_number),4) END AS masked_number,
   EXISTS(SELECT 1 FROM public.guardian_sms_events_on(p_program,v_today) e WHERE e.child_id=f.child_id AND e.service_key=f.service_key AND e.reminder_phase=f.phase) AS eligible,
   sms.notification_id,sms.delivery_status,sms.queue_status,
   attempt.outcome AS simulation_status,attempt.error_code AS simulation_error,attempt.created_at AS simulation_time
  FROM public.sms_program_followups(p_program,v_today) f JOIN public.child c ON c.child_id=f.child_id
  LEFT JOIN public.guardian g ON g.guardian_id=c.guardian_id
  LEFT JOIN LATERAL(SELECT s.* FROM public.sms_notification s WHERE s.child_id=f.child_id AND s.guardian_id=c.guardian_id
    AND s.source_module=p_program AND s.service_key=f.service_key AND s.due_date=f.due_date AND s.reminder_phase=f.phase
    ORDER BY s.notification_id DESC LIMIT 1) sms ON true
  LEFT JOIN LATERAL(SELECT t.outcome,t.error_code,t.created_at FROM public.sms_simulation_attempt t
    WHERE t.notification_id=sms.notification_id ORDER BY t.simulation_id DESC LIMIT 1) attempt ON true
  WHERE public.echims_sms_child_program_access(c.child_id,auth.uid(),false,p_program)
  ORDER BY f.due_date,f.child_id,f.service_key LIMIT 200
 ) q;
 RETURN pg_catalog.jsonb_build_object('currentUserId',auth.uid(),'program',p_program,
  'canSend',public.echims_sms_program_sender(p_program),'canSimulate',public.sms_staff_can_send(),'evaluatedOn',v_today,'mode','SIMULATION','rows',v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.echims_sms_logs(
  p_program text DEFAULT NULL, p_status text DEFAULT NULL, p_child bigint DEFAULT NULL,
  p_from date DEFAULT NULL, p_through date DEFAULT NULL, p_offset integer DEFAULT 0
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
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RAISE EXCEPTION 'Invalid page.' USING ERRCODE = '22023';
  END IF;
  WITH scoped_children AS MATERIALIZED (
    SELECT c.child_id, concat_ws(' ', c.first_name, c.middle_name, c.last_name) AS child_name,
      public.echims_sms_child_program_access(c.child_id, actor, false, 'VACCINATION') AS general_access
    FROM public.child c
    WHERE (p_child IS NULL OR c.child_id = p_child)
      AND public.echims_sms_child_program_access(c.child_id, actor, false, 'SUPPLEMENTATION')
  ), attempts AS (
    SELECT 'program:' || a.attempt_id AS id, c.child_id, c.child_name, a.program,
      a.status, a.destination_number, a.provider_uid, a.error_code, a.created_at, a.batch_id
    FROM public.sms_live_attempt a
    JOIN public.sms_notification n ON n.notification_id = a.notification_id
    JOIN scoped_children c ON c.child_id = n.child_id
    WHERE (c.general_access OR a.program = 'SUPPLEMENTATION')
    UNION ALL
    SELECT 'child:' || a.attempt_id, c.child_id, c.child_name, a.program,
      a.status, a.destination_number, a.provider_uid, a.error_code, a.created_at, NULL::uuid
    FROM public.child_schedule_sms_attempt a
    JOIN scoped_children c ON c.child_id = a.child_id
    WHERE (c.general_access OR a.program = 'SUPPLEMENTATION')
  ), filtered AS MATERIALIZED (
    SELECT a.id, a.child_id, a.child_name, a.program, a.status,
      CASE WHEN a.destination_number ~ '^639[0-9]{9}$'
        THEN '+' || left(a.destination_number, 4) || '****' || right(a.destination_number, 4)
      END AS masked_number,
      a.provider_uid, a.error_code, a.created_at, a.batch_id,
      (a.status = 'FAILED' AND public.echims_sms_child_program_access(a.child_id, actor, true, a.program)) AS can_review_failure
    FROM attempts a
    WHERE (p_program IS NULL OR a.program = p_program)
      AND (p_from IS NULL OR a.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Manila'))
      AND (p_through IS NULL OR a.created_at < ((p_through + 1)::timestamp AT TIME ZONE 'Asia/Manila'))
  ), page AS (
    SELECT * FROM filtered
    WHERE p_status IS NULL OR status = p_status
    ORDER BY created_at DESC, id DESC OFFSET p_offset LIMIT 25
  )
  SELECT jsonb_build_object(
    'currentUserId', actor,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY created_at DESC, id DESC), '[]') FROM page),
    'total', (SELECT count(*) FROM filtered WHERE p_status IS NULL OR status = p_status),
    'counts', (SELECT coalesce(jsonb_object_agg(status, count), '{}')
               FROM (SELECT status, count(*) FROM filtered GROUP BY status) totals)
  ) INTO result;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.echims_sms_logs(text, text, bigint, date, date, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_sms_logs(text, text, bigint, date, date, integer)
TO authenticated;

COMMIT;
