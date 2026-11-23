BEGIN;

CREATE OR REPLACE FUNCTION public.echims_short_reminder(
  p_name text, p_program text, p_due date, p_time time, p_phase text, p_language text, p_venue text
)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
 WITH details AS (
   SELECT left(coalesce(nullif(btrim(p_name), ''), 'Child'), 30) AS child_name,
     left(coalesce(nullif(btrim(p_venue), ''), 'BHS'), 28) AS venue,
     to_char(p_due, 'FMDD Mon YYYY') ||
       CASE WHEN p_time IS NULL THEN '' ELSE ', ' || to_char(p_time, 'FMHH12:MI AM') END AS slot,
     CASE WHEN p_language = 'TL' THEN
       CASE p_program WHEN 'VACCINATION' THEN 'Bakuna' WHEN 'SUPPLEMENTATION' THEN 'Suplemento' ELSE 'Checkup' END
     ELSE
       CASE p_program WHEN 'VACCINATION' THEN 'Vaccination' WHEN 'SUPPLEMENTATION' THEN 'Supplementation' ELSE 'Checkup' END
     END AS service
 )
 SELECT CASE WHEN p_language = 'TL' THEN CASE p_phase
   WHEN 'OVERDUE' THEN format('Hindi natuloy ang %s ni %s. Makipag-ugnayan sa %s.', lower(service),child_name,venue)
   WHEN 'CHANGED' THEN format('Bagong iskedyul ng %s ni %s: %s, %s.', lower(service),child_name,slot,venue)
   ELSE format('%s ni %s sa %s, %s.',service,child_name,slot,venue) END
 ELSE CASE p_phase
   WHEN 'OVERDUE' THEN format('%s missed %s. Please contact %s.',child_name,lower(service),venue)
   WHEN 'CHANGED' THEN format('New %s schedule for %s: %s, %s.',lower(service),child_name,slot,venue)
   ELSE format('%s for %s on %s, %s.',service,child_name,slot,venue) END END
 FROM details;
$function$;

CREATE OR REPLACE FUNCTION public.echims_short_program_reminder(p_child bigint,p_program text,p_due date,p_phase text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT public.echims_short_reminder(
   c.first_name,p_program,p_due,NULL,p_phase,'TL',
   CASE WHEN nullif(btrim(b.barangay_name),'') IS NULL THEN 'BHS' ELSE 'BHS ' || b.barangay_name END
 )
 FROM public.child c LEFT JOIN public.barangay b USING (barangay_id) WHERE c.child_id=p_child;
$function$;
REVOKE ALL ON FUNCTION public.echims_short_program_reminder(bigint,text,date,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.echims_child_sms_body(p_child bigint, p_source text, p_language text, p_venue text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT public.echims_short_reminder(c.first_name,s.program,s.due_date,s.start_time,
   CASE WHEN s.phase <> 'OVERDUE' AND s.kind='APPOINTMENT' AND EXISTS (
     SELECT 1 FROM public.child_schedule_sms_attempt previous
     WHERE previous.child_id=p_child AND previous.guardian_id=c.guardian_id
       AND previous.source_key=s.source_key AND previous.source_signature IS DISTINCT FROM s.source_signature
       AND previous.status IN ('SUBMITTED','DELIVERED')
   ) THEN 'CHANGED' ELSE s.phase END, p_language, p_venue)
 FROM public.echims_child_sms_sources(p_child) s JOIN public.child c ON c.child_id=p_child
 WHERE s.source_key=p_source;
$function$;
REVOKE ALL ON FUNCTION public.echims_child_sms_body(bigint,text,text,text) FROM PUBLIC, anon, authenticated;

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
 SELECT s.*,public.echims_child_sms_body(p_child_id,s.source_key,p_language,p_venue) AS message,
 md5(s.source_signature||':'||concat_ws(' ',c.first_name,c.middle_name,c.last_name)||':'||coalesce(c.guardian_id::text,'')||':'||public.echims_child_sms_body(p_child_id,s.source_key,p_language,p_venue)) AS preview_signature,
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
 IF md5(s.source_signature||':'||concat_ws(' ',c.first_name,c.middle_name,c.last_name)||':'||coalesce(c.guardian_id::text,'')||':'||public.echims_child_sms_body(p_child_id,s.source_key,p_language,p_venue)) IS DISTINCT FROM p_preview_signature THEN RAISE EXCEPTION 'Schedule or child details changed. Review a new preview.' USING ERRCODE='40001';END IF;
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


CREATE OR REPLACE FUNCTION public.echims_prepare_live_sms_batch(p_program text, p_service_key text, p_phase text, p_request_id uuid, p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id bigint; s public.sms_notification%ROWTYPE; g public.guardian%ROWTYPE; a public.sms_live_attempt%ROWTYPE; e record; reminder text;
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
 reminder:=public.echims_short_program_reminder(s.child_id,p_program,s.due_date,p_phase);
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
  message=reminder,destination_number=e.destination_number WHERE notification_id=v_id;
 INSERT INTO public.sms_live_attempt(notification_id,actor_id,request_id,program,service_key,phase,destination_number,message_snapshot,contact_version,batch_id)
 VALUES(v_id,auth.uid(),p_request_id,p_program,p_service_key,p_phase,e.destination_number,reminder,g.sms_contact_version,p_batch_id)
 RETURNING * INTO a;
 RETURN jsonb_build_object('attempt_id',a.attempt_id,'status',a.status,'replayed',false);
END $function$;

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
    AND public.echims_short_program_reminder(e.child_id,a.program,e.due_date,a.phase)=a.message_snapshot
 )
 THEN
  UPDATE public.sms_live_attempt SET status='FAILED',error_code='ELIGIBILITY_CHANGED',completed_at=now() WHERE attempt_id=a.attempt_id;
  RETURN jsonb_build_object('send',false,'status','FAILED');
 END IF;
 UPDATE public.sms_live_attempt SET status='SENDING',dispatched_at=now() WHERE attempt_id=a.attempt_id;
 RETURN jsonb_build_object('send',true,'status','SENDING','destination',a.destination_number,'message',a.message_snapshot);
END $function$;

CREATE OR REPLACE FUNCTION public.echims_sms_program_overview(p_program text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE panel jsonb; rows jsonb; r jsonb; result jsonb:='[]'; live record; otp boolean;
BEGIN
 panel:=public.get_sms_program_overview(p_program);
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(panel->'rows','[]')) LOOP
  SELECT EXISTS(SELECT 1 FROM public.child c JOIN public.guardian g ON g.guardian_id=c.guardian_id
   WHERE c.child_id=(r->>'child_id')::bigint AND g.sms_opt_in=true AND g.sms_otp_verified_at IS NOT NULL
    AND g.sms_otp_verified_contact_number=public.normalize_guardian_mobile(g.contact_number)) INTO otp;
  SELECT a.status,a.provider_uid,a.created_at,a.error_code INTO live
  FROM public.sms_live_attempt a JOIN public.sms_notification s ON s.notification_id=a.notification_id
  WHERE s.child_id=(r->>'child_id')::bigint AND a.program=p_program AND a.service_key=r->>'service_key'
   AND a.phase=r->>'phase' AND s.due_date=(r->>'due_date')::date
  ORDER BY a.attempt_id DESC LIMIT 1;
  result:=result||jsonb_build_array(r||jsonb_build_object('live_message',public.echims_short_program_reminder((r->>'child_id')::bigint,p_program,(r->>'due_date')::date,r->>'phase'),
   'live_contact_verified',otp,'live_status',live.status,'provider_uid',live.provider_uid,'live_time',live.created_at,'live_error',live.error_code));
 END LOOP;
 RETURN panel||jsonb_build_object('rows',result);
END $function$;

-- Reject changes between the program review screen and reservation.
CREATE OR REPLACE FUNCTION public.echims_prepare_reviewed_live_sms(
  p_program text, p_service_key text, p_phase text, p_request_id uuid, p_batch_id uuid, p_message text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE prepared jsonb;
BEGIN
 IF nullif(btrim(p_message),'') IS NULL THEN
  RAISE EXCEPTION 'Refresh and review the reminder before sending.' USING ERRCODE='22023';
 END IF;
 prepared:=public.echims_prepare_live_sms_batch(p_program,p_service_key,p_phase,p_request_id,p_batch_id);
 IF prepared->>'status' = 'READY' AND NOT EXISTS (
   SELECT 1 FROM public.sms_live_attempt a
   WHERE a.attempt_id=(prepared->>'attempt_id')::bigint AND a.message_snapshot=p_message
 ) THEN
  RAISE EXCEPTION 'The SMS text changed. Refresh and review the new message.' USING ERRCODE='40001';
 END IF;
 RETURN prepared;
END;
$function$;
REVOKE ALL ON FUNCTION public.echims_prepare_reviewed_live_sms(text,text,text,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_prepare_reviewed_live_sms(text,text,text,uuid,uuid,text) TO authenticated;

COMMIT;
