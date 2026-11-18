-- NIP-REV01 backend 13 — BHW: View Approved Reports (manuscript: shared by all health workers,
-- barangay-level summaries for BHWs).
-- A BHW sees VALIDATED (approved) reports only, read-only, for the modules a BHW can open
-- (Child Profiling = CHILD and HOUSEHOLD, VACCINATION, SUPPLEMENTATION), and only when every
-- barangay in the report is one of the BHW's active assignments. Print / download works through
-- get_report_export (already requires VALIDATED and rep_can_view). Unchanged for BHW: cannot
-- preview / generate / save (get_report_preview, generate_report refuse BHW), cannot validate
-- (review_generated_report is PHN only), no NUTRITION or INVENTORY reports, no other barangays.
-- RHM, BNS, PHN and Administrator: unchanged.
-- Backup: backup_nip_rev01_be.functions ('rep_scope / rep_can_view / list_generated_reports (before 13)').

-- Barangay scope: BHW by active assignment, like RHM / BNS.
CREATE OR REPLACE FUNCTION public.rep_scope(p_barangay_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.barangay b WHERE b.barangay_id=p_barangay_id AND (
 public.rep_role()='Administrator'
 OR (public.rep_role()='PHN' AND public.is_phn_assigned_to_rhu(b.barangay_id))
 OR (public.rep_role() IN ('RHM','BNS','BHW') AND EXISTS(SELECT 1 FROM public.health_worker_assignment h WHERE h.user_id=auth.uid() AND h.barangay_id=b.barangay_id AND h.status='ACTIVE'))));
$function$;

-- Which saved reports a user may open. BHW: approved, own barangays, BHW modules only.
CREATE OR REPLACE FUNCTION public.rep_can_view(p_report_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.generated_report g WHERE g.report_id=p_report_id AND (
 public.rep_role()='Administrator' OR (
 public.rep_role() IN ('PHN','RHM','BNS','BHW')
 AND (public.rep_role()<>'BNS' OR g.module='NUTRITION')
 AND (public.rep_role()<>'BHW' OR (g.status='VALIDATED' AND g.module IN ('CHILD','HOUSEHOLD','VACCINATION','SUPPLEMENTATION')))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.unnest(g.scope_barangay_ids) id WHERE NOT public.rep_scope(id))
 AND (public.rep_role()<>'PHN' OR EXISTS(SELECT 1 FROM public.public_health_nurse p WHERE p.user_id=auth.uid() AND p.rhu_id=g.rhu_id))
 AND NOT EXISTS(SELECT 1 FROM public.barangay b WHERE b.barangay_id=ANY(g.scope_barangay_ids) AND b.rhu_id<>g.rhu_id)
 )));
$function$;

-- Saved-report list: BHW allowed (read-only: canGenerate / canValidate stay false for BHW).
CREATE OR REPLACE FUNCTION public.list_generated_reports(p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_role text:=public.rep_role();v_modules text[];
BEGIN
 IF v_role IS NULL THEN RAISE EXCEPTION 'Report access is unavailable for this account.' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page<1 OR p_page>100000 THEN RAISE EXCEPTION 'Invalid page.' USING ERRCODE='22023'; END IF;
 v_modules:=CASE WHEN v_role='BNS' THEN ARRAY['NUTRITION']
   WHEN v_role='BHW' THEN ARRAY['CHILD','HOUSEHOLD','VACCINATION','SUPPLEMENTATION']
   ELSE ARRAY['CHILD','HOUSEHOLD','VACCINATION','NUTRITION','SUPPLEMENTATION','INVENTORY'] END;
 RETURN pg_catalog.jsonb_build_object('currentUserId',auth.uid(),'role',v_role,'modules',v_modules,
 'canGenerate',v_role IN ('RHM','BNS'),'canValidate',v_role='PHN','page',p_page,
 'total',(SELECT count(*) FROM public.generated_report g WHERE public.rep_can_view(g.report_id)),
 'barangays',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('barangay_id',b.barangay_id,'barangay_name',b.barangay_name,'rhu_id',b.rhu_id) ORDER BY b.barangay_name) FROM public.barangay b WHERE public.rep_scope(b.barangay_id)),'[]'::jsonb),
 'reports',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.report_id DESC) FROM (
 SELECT g.report_id,g.series_id,g.version,g.title,g.module,g.period_start,g.period_end,g.scope_barangay_ids,g.rhu_id,g.generated_by_name,g.generated_by_role,g.generated_at,g.row_count,g.status,g.validated_by_name,g.validated_at,g.review_remarks,g.review_revision
 FROM public.generated_report g WHERE public.rep_can_view(g.report_id) ORDER BY g.report_id DESC LIMIT 50 OFFSET (p_page-1)*50) q),'[]'::jsonb));
END;
$function$;
