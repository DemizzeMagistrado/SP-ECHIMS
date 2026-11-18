BEGIN;
-- Context returns no clinical data until the existing resolver has accepted the link.
CREATE OR REPLACE FUNCTION public.echims_guardian_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.guardian_portal_account%ROWTYPE; v_phone text;
BEGIN
 v_phone:=echims_guardian_private.session_phone();
 SELECT * INTO a FROM public.guardian_portal_account WHERE auth_user_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('registered',false,'linked',false); END IF;
 BEGIN
  PERFORM echims_guardian_private.guardian_id();
 EXCEPTION WHEN insufficient_privilege THEN
  RETURN jsonb_build_object('registered',true,'linked',false,'message','Contact your BHS/RHU to verify your guardian record.');
 END;
 RETURN jsonb_build_object('registered',true,'linked',true,'name',concat_ws(' ',a.first_name,a.last_name));
END; $$;

-- Keyset pagination, with separate cursors for each service. Internal notes and
-- staff identity are never projected. Aged-out children retain history access.
CREATE OR REPLACE FUNCTION public.echims_guardian_history(
 p_child_id bigint,p_program text,p_before_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rows_json jsonb; records jsonb; next_id bigint;
BEGIN
 PERFORM public.echims_guardian_child(p_child_id);
 IF p_before_id IS NOT NULL AND p_before_id<=0 THEN RAISE EXCEPTION 'Invalid cursor.' USING ERRCODE='22023'; END IF;
 CASE p_program
 WHEN 'vaccination' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',r.vaccination_record_id,'date',r.vaccination_date,'name',coalesce(to_jsonb(i)->>'item_name',to_jsonb(v)->>'vaccine_type','Vaccine'),
   'dose',to_jsonb(r)->'dose_number','status','Recorded','batch',to_jsonb(r)->'batch_number') ORDER BY r.vaccination_record_id DESC),'[]'::jsonb)
  INTO rows_json FROM (
   SELECT * FROM public.vaccination_record WHERE child_id=p_child_id AND status='APPROVED'
   AND (p_before_id IS NULL OR vaccination_record_id<p_before_id) ORDER BY vaccination_record_id DESC LIMIT 21
  ) r LEFT JOIN public.vaccine v USING(vaccine_id) LEFT JOIN public.item i ON i.item_id=v.item_id;
 WHEN 'nutrition' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',r.assessment_id,'date',r.assessment_date,'name','Nutritional assessment',
   'weightKg',coalesce(to_jsonb(r)->'weight',to_jsonb(r)->'weight_kg'),
   'heightCm',coalesce(to_jsonb(r)->'height',to_jsonb(r)->'height_cm'),
   'muacCm',coalesce(to_jsonb(r)->'muac',to_jsonb(r)->'muac_cm'),
   'status',to_jsonb(r)->'nutritional_status','weightForAge',to_jsonb(r)->'weight_for_age',
   'heightForAge',to_jsonb(r)->'height_for_age','weightForHeight',to_jsonb(r)->'weight_for_height') ORDER BY r.assessment_id DESC),'[]'::jsonb)
  INTO rows_json FROM (SELECT * FROM public.nutritional_assessment WHERE child_id=p_child_id
   AND (p_before_id IS NULL OR assessment_id<p_before_id) ORDER BY assessment_id DESC LIMIT 21) r;
 WHEN 'supplementation' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',r.supplementation_record_id,'date',r.supplementation_date,'name',coalesce(to_jsonb(i)->>'item_name','Supplement'),
   'doseValue',to_jsonb(r)->'dose_value','doseUnit',to_jsonb(r)->'dose_unit',
   'quantity',to_jsonb(r)->'quantity_given','status',coalesce(to_jsonb(r)->>'record_type','ADMINISTERED')) ORDER BY r.supplementation_record_id DESC),'[]'::jsonb)
  INTO rows_json FROM (SELECT * FROM public.supplementation_record WHERE child_id=p_child_id
   AND (p_before_id IS NULL OR supplementation_record_id<p_before_id) ORDER BY supplementation_record_id DESC LIMIT 21) r
  LEFT JOIN public.supplement s USING(supplement_id) LEFT JOIN public.item i ON i.item_id=s.item_id;
 WHEN 'checkups' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',r.appointment_id,'date',r.scheduled_on,'name','Follow-up checkup',
   'status',r.status,'completedOn',to_jsonb(r)->'completed_on') ORDER BY r.appointment_id DESC),'[]'::jsonb)
  INTO rows_json FROM (SELECT * FROM public.child_checkup_appointment WHERE child_id=p_child_id
   AND (p_before_id IS NULL OR appointment_id<p_before_id) ORDER BY appointment_id DESC LIMIT 21) r;
 ELSE RAISE EXCEPTION 'Invalid service.' USING ERRCODE='22023';
 END CASE;
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.ordinality),'[]'::jsonb) INTO records
 FROM jsonb_array_elements(rows_json) WITH ORDINALITY x(value,ordinality) WHERE x.ordinality<=20;
 IF jsonb_array_length(rows_json)>20 THEN next_id:=(records->19->>'id')::bigint; END IF;
 RETURN jsonb_build_object('records',records,'nextBeforeId',next_id);
END; $$;
REVOKE ALL ON FUNCTION public.echims_guardian_context() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.echims_guardian_history(bigint,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.echims_guardian_context(),public.echims_guardian_history(bigint,text,bigint) TO authenticated;
COMMIT;
