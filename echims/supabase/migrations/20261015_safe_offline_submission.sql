-- Additive migration. Existing rows remain unchanged. Run before the source patch.
BEGIN;
ALTER TABLE public.child ADD COLUMN IF NOT EXISTS sync_owner uuid;
ALTER TABLE public.child ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.child ADD COLUMN IF NOT EXISTS sync_payload jsonb;
ALTER TABLE public.health_activity_schedule ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.health_activity_schedule ADD COLUMN IF NOT EXISTS sync_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS echims_child_sync_owner_request
 ON public.child(sync_owner,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS echims_activity_sync_owner_request
 ON public.health_activity_schedule(created_by,client_request_id) WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.echims_guard_sync_metadata()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n jsonb:=pg_catalog.to_jsonb(NEW); o jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  o:=pg_catalog.to_jsonb(OLD);
  IF n->'client_request_id' IS DISTINCT FROM o->'client_request_id'
     OR n->'sync_payload' IS DISTINCT FROM o->'sync_payload'
     OR (TG_TABLE_NAME='child' AND n->'sync_owner' IS DISTINCT FROM o->'sync_owner') THEN
   RAISE EXCEPTION 'Submission tracking cannot be changed after creation.' USING ERRCODE='22023';
  END IF;
 ELSIF NEW.client_request_id IS NOT NULL THEN
  IF NEW.sync_payload IS NULL OR pg_catalog.jsonb_typeof(NEW.sync_payload)<>'object'
    OR (TG_TABLE_NAME='child' AND (n->>'sync_owner')::uuid IS DISTINCT FROM auth.uid())
    OR (TG_TABLE_NAME='health_activity_schedule' AND (n->>'created_by')::uuid IS DISTINCT FROM auth.uid()) THEN
   RAISE EXCEPTION 'Invalid submission owner or payload.' USING ERRCODE='42501';
  END IF;
 ELSIF NEW.sync_payload IS NOT NULL OR (TG_TABLE_NAME='child' AND n->>'sync_owner' IS NOT NULL) THEN
  RAISE EXCEPTION 'A request ID is required for submission metadata.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS echims_guard_sync_metadata ON public.child;
CREATE TRIGGER echims_guard_sync_metadata BEFORE INSERT OR UPDATE ON public.child
 FOR EACH ROW EXECUTE FUNCTION public.echims_guard_sync_metadata();
DROP TRIGGER IF EXISTS echims_guard_sync_metadata ON public.health_activity_schedule;
CREATE TRIGGER echims_guard_sync_metadata BEFORE INSERT OR UPDATE ON public.health_activity_schedule
 FOR EACH ROW EXECUTE FUNCTION public.echims_guard_sync_metadata();

CREATE OR REPLACE FUNCTION public.echims_submit_child(p_request_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 actor uuid:=auth.uid(); role_name text; today date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;
 payload jsonb:=p_payload-'client_request_id'; existing public.child%ROWTYPE;
 brgy bigint; hh bigint; guardian bigint; child_key bigint; dob date; months integer;
 h jsonb:=p_payload->'new_household'; g jsonb:=p_payload->'new_guardian';
 v_first text:=pg_catalog.btrim(p_payload->>'first_name'); v_last text:=pg_catalog.btrim(p_payload->>'last_name');
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.user_id=actor AND u.account_status='ACTIVE') THEN
  RAISE EXCEPTION 'An active signed-in account is required.' USING ERRCODE='42501';
 END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(p.role)) INTO role_name FROM public.get_my_profile() p LIMIT 1;
 IF role_name IS NULL OR role_name NOT IN ('administrator','admin','public health nurse','phn','rural health midwife','rhm','barangay health worker','bhw') THEN
  RAISE EXCEPTION 'Your role cannot register children.' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'A request ID and object payload are required.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ECHIMS:CHILD:'||actor||':'||p_request_id,0));
 SELECT * INTO existing FROM public.child c WHERE c.sync_owner=actor AND c.client_request_id=p_request_id;
 IF FOUND THEN
  IF existing.sync_payload IS DISTINCT FROM payload THEN
   RAISE EXCEPTION 'This request ID was already used with different details.' USING ERRCODE='P0001';
  END IF;
  RETURN pg_catalog.jsonb_build_object('child_id',existing.child_id,'idempotent',true);
 END IF;
 brgy:=NULLIF(p_payload->>'barangay_id','')::bigint;
 IF brgy IS NULL OR brgy<=0 OR NOT (role_name IN ('administrator','admin') OR
    (role_name IN ('phn','public health nurse') AND public.is_phn_assigned_to_rhu(brgy)) OR
    (role_name IN ('rhm','rural health midwife','bhw','barangay health worker') AND public.is_assigned_to_barangay(brgy))) THEN
  RAISE EXCEPTION 'The barangay is outside your current scope.' USING ERRCODE='42501';
 END IF;
 dob:=NULLIF(p_payload->>'date_of_birth','')::date;
 months:=EXTRACT(YEAR FROM pg_catalog.age(today,dob))::integer*12+EXTRACT(MONTH FROM pg_catalog.age(today,dob))::integer;
 IF NULLIF(v_first,'') IS NULL OR NULLIF(v_last,'') IS NULL OR dob IS NULL OR dob>today OR months<0 OR months>59
    OR pg_catalog.upper(COALESCE(p_payload->>'sex','')) NOT IN ('MALE','FEMALE') THEN
  RAISE EXCEPTION 'Complete child details with a valid birth date within 0–59 months.' USING ERRCODE='22023';
 END IF;
 -- Serialize this child's natural identity to avoid concurrent duplicate registrations.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ECHIMS:CHILD-NAME:'||brgy||':'||pg_catalog.lower(v_first)||':'||pg_catalog.lower(v_last)||':'||dob,0));
 hh:=NULLIF(pg_catalog.regexp_replace(COALESCE(p_payload->>'household_id',''),'^.*-',''),'')::bigint;
 IF hh IS NULL AND pg_catalog.jsonb_typeof(h)='object' THEN
  IF NULLIF(pg_catalog.btrim(h->>'household_address'),'') IS NULL THEN
   RAISE EXCEPTION 'A household address is required.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ECHIMS:HOUSEHOLD:'||brgy||':'||COALESCE(pg_catalog.btrim(h->>'household_no'),''),0));
  IF NULLIF(pg_catalog.btrim(h->>'household_no'),'') IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.household x WHERE x.barangay_id=brgy AND x.household_no=pg_catalog.btrim(h->>'household_no')) THEN
   RAISE EXCEPTION 'This household number already exists. Select the existing household.' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.household(household_no,household_address,purok,is_4ps_member,barangay_id)
   VALUES(NULLIF(pg_catalog.btrim(h->>'household_no'),''),pg_catalog.btrim(h->>'household_address'),NULLIF(pg_catalog.btrim(h->>'purok'),''),COALESCE((h->>'is_4ps_member')::boolean,false),brgy)
   RETURNING household_id INTO hh;
 END IF;
 IF hh IS NULL OR NOT EXISTS(SELECT 1 FROM public.household x WHERE x.household_id=hh AND x.barangay_id=brgy) THEN
  RAISE EXCEPTION 'Select a household in the selected barangay.' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.child c WHERE c.household_id=hh AND pg_catalog.lower(c.first_name)=pg_catalog.lower(v_first)
    AND pg_catalog.lower(c.last_name)=pg_catalog.lower(v_last) AND c.date_of_birth=dob) THEN
  RAISE EXCEPTION 'This child is already registered in the household. Review the existing record.' USING ERRCODE='23505';
 END IF;
 guardian:=NULLIF(p_payload->>'guardian_id','')::bigint;
 IF guardian IS NULL AND pg_catalog.jsonb_typeof(g)='object' THEN
  IF NULLIF(pg_catalog.btrim(g->>'first_name'),'') IS NULL OR NULLIF(pg_catalog.btrim(g->>'last_name'),'') IS NULL THEN
   RAISE EXCEPTION 'Guardian first and last name are required.' USING ERRCODE='22023';
  END IF;
  IF NULLIF(g->>'contact_number','') IS NOT NULL AND g->>'contact_number' !~ '^(09[0-9]{9}|639[0-9]{9}|\+639[0-9]{9})$' THEN
   RAISE EXCEPTION 'Use a valid Philippine guardian mobile number.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.guardian(first_name,middle_name,last_name,contact_number,address,relationship_to_child)
   VALUES(pg_catalog.btrim(g->>'first_name'),NULLIF(pg_catalog.btrim(g->>'middle_name'),''),pg_catalog.btrim(g->>'last_name'),NULLIF(pg_catalog.btrim(g->>'contact_number'),''),NULLIF(pg_catalog.btrim(g->>'address'),''),NULLIF(pg_catalog.btrim(g->>'relationship_to_child'),''))
   RETURNING guardian_id INTO guardian;
 END IF;
 IF guardian IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.guardian x WHERE x.guardian_id=guardian) THEN
  RAISE EXCEPTION 'Guardian is unavailable in your scope.' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.child(first_name,middle_name,last_name,date_of_birth,sex,birth_place,address,registration_date,status,household_id,barangay_id,guardian_id,sync_owner,client_request_id,sync_payload)
 VALUES(v_first,NULLIF(pg_catalog.btrim(p_payload->>'middle_name'),''),v_last,dob,pg_catalog.upper(p_payload->>'sex'),NULLIF(p_payload->>'birth_place',''),NULLIF(p_payload->>'address',''),today,'ACTIVE',hh,brgy,guardian,actor,p_request_id,payload)
 RETURNING child_id INTO child_key;
 INSERT INTO public.child_profile_record(child_id,profiling_date,recorded_by,relationship_to_household_head,civil_status,educational_attainment,religion,ethnicity,philhealth_id_number,philhealth_membership_type,philhealth_category,medical_history,last_menstrual_period,water_source_type,toilet_facility_type)
 VALUES(child_key,today,actor,NULLIF(p_payload->>'relationship_to_household_head',''),NULLIF(p_payload->>'civil_status',''),NULLIF(p_payload->>'educational_attainment',''),NULLIF(p_payload->>'religion',''),NULLIF(p_payload->>'ethnicity',''),NULLIF(p_payload->>'philhealth_id_number',''),NULLIF(p_payload->>'philhealth_membership_type',''),NULLIF(p_payload->>'philhealth_category',''),NULLIF(p_payload->>'medical_history',''),NULLIF(p_payload->>'last_menstrual_period','')::date,NULLIF(p_payload->>'water_source_type',''),NULLIF(p_payload->>'toilet_facility_type',''));
 RETURN pg_catalog.jsonb_build_object('child_id',child_key,'idempotent',false);
END $$;

CREATE OR REPLACE FUNCTION public.echims_submit_activity(p_request_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 actor uuid:=auth.uid(); role_name text; payload jsonb:=p_payload-'client_request_id';
 existing public.health_activity_schedule%ROWTYPE; saved public.health_activity_schedule%ROWTYPE;
 activity text:=p_payload->>'activityType'; brgy bigint; scheduled date; start_at time; end_at time;
 conflicts jsonb; hard jsonb; warnings jsonb; suggestions jsonb:='[]'::jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.user_id=actor AND u.account_status='ACTIVE') THEN
  RAISE EXCEPTION 'An active signed-in account is required.' USING ERRCODE='42501';
 END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(p.role)) INTO role_name FROM public.get_my_profile() p LIMIT 1;
 IF role_name IS NULL OR role_name NOT IN ('phn','public health nurse','rhm','rural health midwife','bhw','barangay health worker','bns','barangay nutrition scholar') THEN
  RAISE EXCEPTION 'Only health workers can request activities.' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'A request ID and object payload are required.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ECHIMS:ACTIVITY:'||actor||':'||p_request_id,0));
 SELECT * INTO existing FROM public.health_activity_schedule x WHERE x.created_by=actor AND x.client_request_id=p_request_id;
 IF FOUND THEN
  IF existing.sync_payload IS DISTINCT FROM payload THEN
   RAISE EXCEPTION 'This request ID was already used with different details.' USING ERRCODE='P0001';
  END IF;
  RETURN pg_catalog.jsonb_build_object('schedule',pg_catalog.jsonb_build_object('schedule_id',existing.schedule_id,'status',existing.status),'idempotent',true,'message','Previously submitted request confirmed.');
 END IF;
 IF activity IS NULL OR activity NOT IN ('VACCINATION','NUTRITIONAL_ASSESSMENT','SUPPLEMENTATION')
   OR (role_name IN ('bhw','barangay health worker') AND activity<>'VACCINATION')
   OR (role_name IN ('bns','barangay nutrition scholar') AND activity='VACCINATION') THEN
  RAISE EXCEPTION 'This activity is not allowed for your role.' USING ERRCODE='42501';
 END IF;
 brgy:=NULLIF(p_payload->>'barangayId','')::bigint;
 IF brgy IS NULL OR brgy<=0 OR NOT ((role_name IN ('phn','public health nurse') AND public.is_phn_assigned_to_rhu(brgy)) OR
   (role_name NOT IN ('phn','public health nurse') AND public.is_assigned_to_barangay(brgy))) THEN
  RAISE EXCEPTION 'The selected barangay is outside your current scope.' USING ERRCODE='42501';
 END IF;
 scheduled:=NULLIF(p_payload->>'scheduleDate','')::date;
 start_at:=NULLIF(p_payload->>'startTime','')::time; end_at:=NULLIF(p_payload->>'endTime','')::time;
 IF scheduled IS NULL OR scheduled<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date OR start_at IS NULL OR end_at IS NULL OR end_at<=start_at THEN
  RAISE EXCEPTION 'Provide a current/future date with an end time after the start time.' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.length(COALESCE(p_payload->>'remarks',''))>2000 THEN
  RAISE EXCEPTION 'Remarks may contain up to 2000 characters.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ECHIMS:ACTIVITY-BARANGAY:'||brgy||':'||scheduled,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ECHIMS:ACTIVITY-WORKER:'||actor||':'||scheduled,0));
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c)),'[]'::jsonb) INTO conflicts
 FROM public.check_health_activity_conflicts(scheduled,start_at,end_at,brgy,actor,NULL) c;
 SELECT COALESCE(pg_catalog.jsonb_agg(v),'[]'::jsonb) INTO hard FROM pg_catalog.jsonb_array_elements(conflicts) v WHERE v->>'conflict_rule'='SCH-R002';
 SELECT COALESCE(pg_catalog.jsonb_agg(v),'[]'::jsonb) INTO warnings FROM pg_catalog.jsonb_array_elements(conflicts) v WHERE v->>'conflict_rule'='SCH-R001';
 IF pg_catalog.jsonb_array_length(conflicts)>0 THEN
  BEGIN
   SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s)),'[]'::jsonb) INTO suggestions
   FROM public.suggest_health_activity_slots(scheduled,brgy,actor,NULL,7,3) s;
  EXCEPTION WHEN OTHERS THEN suggestions:='[]'::jsonb;
  END;
 END IF;
 INSERT INTO public.health_activity_schedule(activity_type,schedule_date,start_time,end_time,status,remarks,created_by,barangay_id,conflict_status,client_request_id,sync_payload)
 VALUES(activity,scheduled,start_at,end_at,'PENDING',NULLIF(pg_catalog.btrim(p_payload->>'remarks'),''),actor,brgy,CASE WHEN pg_catalog.jsonb_array_length(conflicts)>0 THEN 'DETECTED' ELSE 'NONE' END,p_request_id,payload)
 RETURNING * INTO saved;
 RETURN pg_catalog.jsonb_build_object('schedule',pg_catalog.jsonb_build_object('schedule_id',saved.schedule_id,'status',saved.status),'idempotent',false,'message','Request submitted for PHN review.','ruleEvaluation',pg_catalog.jsonb_build_object('hasConflict',pg_catalog.jsonb_array_length(conflicts)>0,'hasHardConflict',pg_catalog.jsonb_array_length(hard)>0,'conflicts',hard,'warnings',warnings,'suggestions',suggestions));
END $$;
REVOKE ALL ON FUNCTION public.echims_submit_child(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.echims_submit_activity(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.echims_submit_child(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.echims_submit_activity(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
