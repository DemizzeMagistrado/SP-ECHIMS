BEGIN;

CREATE OR REPLACE FUNCTION public.echims_sms_child_program_access(
  p_child bigint, p_actor uuid, p_send boolean, p_program text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT EXISTS (
   SELECT 1 FROM public.users u
   JOIN public.child c ON c.child_id = p_child
   JOIN public.barangay b ON b.barangay_id = c.barangay_id
   WHERE u.user_id = p_actor AND u.account_status = 'ACTIVE'
     AND p_program IN ('VACCINATION', 'SUPPLEMENTATION', 'CHECKUP')
     AND CASE WHEN EXISTS (SELECT 1 FROM public.administrator a WHERE a.user_id = p_actor)
       THEN NOT p_send
       ELSE (
         (NOT (p_send AND p_program = 'CHECKUP') AND EXISTS (
           SELECT 1 FROM public.public_health_nurse n WHERE n.user_id = p_actor AND n.rhu_id = b.rhu_id
         ))
         OR (
           EXISTS (SELECT 1 FROM public.health_worker_assignment h
             WHERE h.user_id = p_actor AND h.barangay_id = c.barangay_id AND h.status = 'ACTIVE')
           AND (
             EXISTS (SELECT 1 FROM public.rural_health_midwife r WHERE r.user_id = p_actor)
             OR EXISTS (SELECT 1 FROM public.barangay_health_worker w WHERE w.user_id = p_actor)
             OR (p_program = 'SUPPLEMENTATION' AND EXISTS (
               SELECT 1 FROM public.barangay_nutrition_scholar n WHERE n.user_id = p_actor
             ))
           )
         )
       )
     END
 )
$function$;
REVOKE ALL ON FUNCTION public.echims_sms_child_program_access(bigint, uuid, boolean, text)
FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.echims_child_sms_panel(p_child_id bigint, p_language text DEFAULT 'TL'::text, p_venue text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c public.child%ROWTYPE;g public.guardian%ROWTYPE;rows jsonb;verified boolean;BEGIN
 IF NOT public.echims_sms_child_program_access(p_child_id,auth.uid(),false,'SUPPLEMENTATION') THEN RAISE EXCEPTION 'Child outside your assignment.' USING ERRCODE='42501';END IF;
 IF p_language IS NULL OR p_language NOT IN('TL','EN') OR length(coalesce(p_venue,''))>60 OR coalesce(p_venue,'')~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Choose language and a venue up to 60 characters.' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM public.child WHERE child_id=p_child_id;SELECT * INTO g FROM public.guardian WHERE guardian_id=c.guardian_id;
 verified:=g.sms_opt_in=true AND g.sms_otp_verified_at IS NOT NULL AND public.normalize_guardian_mobile(g.contact_number) IS NOT NULL AND g.sms_otp_verified_contact_number=public.normalize_guardian_mobile(g.contact_number);
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.due_date,q.source_key),'[]'::jsonb) INTO rows FROM(
 SELECT s.*,public.echims_child_sms_format(concat_ws(' ',c.first_name,c.middle_name,c.last_name),s.program,s.kind,s.due_date,s.start_time,s.phase,s.title,p_language,p_venue) AS message,
 md5(s.source_signature||':'||concat_ws(' ',c.first_name,c.middle_name,c.last_name)||':'||coalesce(c.guardian_id::text,'')) AS preview_signature,
 a.status AS last_status,
 (verified AND length(btrim(p_venue))>0 AND public.echims_sms_child_program_access(p_child_id,auth.uid(),true,s.program) AND (a.status IS NULL OR a.status='FAILED') AND NOT EXISTS(SELECT 1 FROM public.sms_live_attempt old WHERE old.program=s.program AND old.service_key=s.legacy_key AND old.phase=s.phase AND old.status IN('READY','SENDING','SUBMITTED','DELIVERED','UNCERTAIN'))) AS can_send
 FROM public.echims_child_sms_sources(p_child_id)s LEFT JOIN LATERAL(SELECT CASE WHEN status='READY' AND created_at<now()-interval '60 seconds' THEN 'FAILED' ELSE status END AS status FROM public.child_schedule_sms_attempt a WHERE a.child_id=p_child_id AND a.source_key=s.source_key AND a.source_signature=s.source_signature AND a.phase=s.phase ORDER BY CASE WHEN a.status IN('READY','SENDING','SUBMITTED','UNCERTAIN') THEN 0 ELSE 1 END,attempt_id DESC LIMIT 1)a ON true WHERE public.echims_sms_child_program_access(p_child_id,auth.uid(),false,s.program) ORDER BY s.due_date,s.source_key LIMIT 200)q;
 RETURN jsonb_build_object('currentUserId',auth.uid(),'childId',p_child_id,'childName',concat_ws(' ',c.first_name,c.middle_name,c.last_name),'guardianId',c.guardian_id,'contactStatus',CASE WHEN g.guardian_id IS NULL THEN 'NO_GUARDIAN' WHEN g.sms_opt_in IS DISTINCT FROM true THEN 'CONSENT_REQUIRED' WHEN verified IS DISTINCT FROM true THEN 'OTP_REQUIRED' ELSE 'VERIFIED' END,'maskedNumber',CASE WHEN public.normalize_guardian_mobile(g.contact_number) IS NULL THEN NULL ELSE '+'||left(public.normalize_guardian_mobile(g.contact_number),4)||'****'||right(public.normalize_guardian_mobile(g.contact_number),4) END,'records',rows);
END $function$;

CREATE OR REPLACE FUNCTION public.echims_prepare_child_sms(p_child_id bigint, p_source_key text, p_preview_signature text, p_language text, p_venue text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c public.child%ROWTYPE;g public.guardian%ROWTYPE;s record;a public.child_schedule_sms_attempt%ROWTYPE;number text;BEGIN
 IF NOT public.echims_sms_child_program_access(p_child_id,auth.uid(),true,'SUPPLEMENTATION') THEN RAISE EXCEPTION 'Sending reminders is outside your assignment or role.' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_language IS NULL OR p_language NOT IN('TL','EN') OR length(btrim(coalesce(p_venue,''))) NOT BETWEEN 1 AND 60 OR p_venue~'[[:cntrl:]]' OR p_preview_signature IS NULL OR p_source_key IS NULL THEN RAISE EXCEPTION 'Review a current schedule, language and venue.' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('CHILD_SMS_REQUEST:'||auth.uid()||':'||p_request_id,0));
 SELECT * INTO a FROM public.child_schedule_sms_attempt WHERE actor_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
 IF NOT public.echims_sms_child_program_access(p_child_id,auth.uid(),true,a.program) THEN RAISE EXCEPTION 'Reminder outside your program.' USING ERRCODE='42501';END IF;
 IF a.child_id<>p_child_id OR a.source_key<>p_source_key OR a.language<>p_language OR a.venue<>btrim(p_venue) OR a.preview_signature<>p_preview_signature THEN RAISE EXCEPTION 'Request ID belongs to different details.' USING ERRCODE='23505';END IF;
 RETURN jsonb_build_object('attempt_id',a.attempt_id,'status',a.status,'canClaim',true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ECHIMS_CHILD_SMS:'||p_child_id,0));
 SELECT * INTO c FROM public.child WHERE child_id=p_child_id FOR SHARE;
 SELECT * INTO g FROM public.guardian WHERE guardian_id=c.guardian_id FOR UPDATE;
 number:=public.normalize_guardian_mobile(g.contact_number);
 IF number IS NULL OR g.sms_opt_in IS DISTINCT FROM true OR g.sms_otp_verified_at IS NULL OR g.sms_otp_verified_contact_number IS DISTINCT FROM number THEN RAISE EXCEPTION 'SMS consent and OTP verification of the current guardian phone are required.' USING ERRCODE='22023';END IF;
 SELECT * INTO s FROM public.echims_child_sms_sources(p_child_id) WHERE source_key=p_source_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'Schedule completed, cancelled, changed or child no longer eligible. Refresh.' USING ERRCODE='40001';END IF;
 IF NOT public.echims_sms_child_program_access(p_child_id,auth.uid(),true,s.program) THEN RAISE EXCEPTION 'Reminder outside your program.' USING ERRCODE='42501';END IF;
 IF md5(s.source_signature||':'||concat_ws(' ',c.first_name,c.middle_name,c.last_name)||':'||coalesce(c.guardian_id::text,'')) IS DISTINCT FROM p_preview_signature THEN RAISE EXCEPTION 'Schedule or child details changed. Review a new preview.' USING ERRCODE='40001';END IF;
 UPDATE public.child_schedule_sms_attempt SET status='FAILED',error_code='PREPARATION_EXPIRED',completed_at=now() WHERE child_id=p_child_id AND status='READY' AND created_at<now()-interval '60 seconds';
 SELECT * INTO a FROM public.child_schedule_sms_attempt WHERE child_id=p_child_id AND source_key=p_source_key AND source_signature=s.source_signature AND phase=s.phase AND status IN('READY','SENDING','SUBMITTED','DELIVERED','UNCERTAIN') ORDER BY attempt_id DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('attempt_id',a.attempt_id,'status',a.status,'canClaim',false);END IF;
 -- Respect attempts from the existing vaccination/supplementation SMS tabs.
 IF EXISTS(SELECT 1 FROM public.sms_live_attempt old WHERE old.program=s.program AND old.service_key=s.legacy_key AND old.phase=s.phase AND old.status IN('READY','SENDING','SUBMITTED','DELIVERED','UNCERTAIN')) THEN RAISE EXCEPTION 'An existing program reminder already has a sending attempt.' USING ERRCODE='23505';END IF;
 IF (SELECT count(*) FROM public.child_schedule_sms_attempt WHERE actor_id=auth.uid() AND created_at>now()-interval '1 hour')>=60 OR (SELECT count(*) FROM public.child_schedule_sms_attempt WHERE child_id=p_child_id AND source_key=p_source_key AND created_at>now()-interval '1 day')>=3 THEN RAISE EXCEPTION 'SMS sending limit reached.' USING ERRCODE='P0001';END IF;
 INSERT INTO public.child_schedule_sms_attempt(child_id,guardian_id,actor_id,request_id,source_key,source_signature,preview_signature,program,legacy_key,phase,language,venue,destination_number,contact_version,message_snapshot)
 VALUES(p_child_id,g.guardian_id,auth.uid(),p_request_id,p_source_key,s.source_signature,p_preview_signature,s.program,s.legacy_key,s.phase,p_language,btrim(p_venue),number,g.sms_contact_version,public.echims_child_sms_body(p_child_id,p_source_key,p_language,p_venue)) RETURNING * INTO a;
 RETURN jsonb_build_object('attempt_id',a.attempt_id,'status',a.status,'canClaim',true);
END $function$;

CREATE OR REPLACE FUNCTION public.echims_claim_child_sms(p_attempt_id bigint, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.child_schedule_sms_attempt%ROWTYPE;g public.guardian%ROWTYPE;c public.child%ROWTYPE;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server dispatch required.' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM public.child_schedule_sms_attempt WHERE attempt_id=p_attempt_id AND actor_id=p_actor_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SMS attempt unavailable.' USING ERRCODE='42501';END IF;
 IF a.status<>'READY' THEN RETURN jsonb_build_object('send',false,'status',a.status);END IF;
 SELECT * INTO c FROM public.child WHERE child_id=a.child_id FOR SHARE;
 SELECT * INTO g FROM public.guardian WHERE guardian_id=a.guardian_id FOR SHARE;
 IF NOT public.echims_sms_child_program_access(a.child_id,p_actor_id,true,a.program) OR c.guardian_id IS DISTINCT FROM a.guardian_id OR g.sms_opt_in IS DISTINCT FROM true OR g.sms_otp_verified_at IS NULL OR g.sms_contact_version IS DISTINCT FROM a.contact_version OR g.sms_otp_verified_contact_number IS DISTINCT FROM a.destination_number OR public.normalize_guardian_mobile(g.contact_number) IS DISTINCT FROM a.destination_number OR a.created_at<now()-interval '60 seconds' OR NOT EXISTS(SELECT 1 FROM public.echims_child_sms_sources(a.child_id)s WHERE s.source_key=a.source_key AND s.source_signature=a.source_signature AND s.phase=a.phase) OR public.echims_child_sms_body(a.child_id,a.source_key,a.language,a.venue) IS DISTINCT FROM a.message_snapshot THEN
 UPDATE public.child_schedule_sms_attempt SET status='FAILED',error_code='ELIGIBILITY_CHANGED',completed_at=now() WHERE attempt_id=a.attempt_id;RETURN jsonb_build_object('send',false,'status','FAILED');
 END IF;
 UPDATE public.child_schedule_sms_attempt SET status='SENDING' WHERE attempt_id=a.attempt_id;
 RETURN jsonb_build_object('send',true,'status','SENDING','destination',a.destination_number,'message',a.message_snapshot);
END $function$;

REVOKE ALL ON FUNCTION public.echims_claim_child_sms(bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.echims_claim_child_sms(bigint, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.echims_child_sms_panel(bigint, text, text),
  public.echims_prepare_child_sms(bigint, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_child_sms_panel(bigint, text, text),
  public.echims_prepare_child_sms(bigint, text, text, text, text, uuid) TO authenticated;

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
      a.status, a.destination_number, a.provider_uid, a.error_code, a.created_at
    FROM public.sms_live_attempt a
    JOIN public.sms_notification n ON n.notification_id = a.notification_id
    JOIN scoped_children c ON c.child_id = n.child_id
    WHERE (c.general_access OR a.program = 'SUPPLEMENTATION')
    UNION ALL
    SELECT 'child:' || a.attempt_id, c.child_id, c.child_name, a.program,
      a.status, a.destination_number, a.provider_uid, a.error_code, a.created_at
    FROM public.child_schedule_sms_attempt a
    JOIN scoped_children c ON c.child_id = a.child_id
    WHERE (c.general_access OR a.program = 'SUPPLEMENTATION')
  ), filtered AS MATERIALIZED (
    SELECT a.id, a.child_id, a.child_name, a.program, a.status,
      CASE WHEN a.destination_number ~ '^639[0-9]{9}$'
        THEN '+' || left(a.destination_number, 4) || '****' || right(a.destination_number, 4)
      END AS masked_number,
      a.provider_uid, a.error_code, a.created_at,
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
