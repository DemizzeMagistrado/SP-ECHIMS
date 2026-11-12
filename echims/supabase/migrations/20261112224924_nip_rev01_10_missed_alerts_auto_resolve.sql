-- NIP-REV01 backend 10 — missed-dose alerts and SMS reminders follow the same rule as the screens.
-- * A dose recorded and awaiting approval (PENDING) counts as given: no missed alert, no reminder.
--   A record returned for correction (NEEDS_CORRECTION) does not count, so the dose is missed again.
-- * Open NIP_DOSE_OVERDUE alerts close automatically when the child no longer has a missed dose
--   (dose given / recorded, or past its eligibility window), with the note
--   "Resolved automatically: dose no longer missed" (new column alert.resolution_note, shown in the
--   feed). Runs when a dose is recorded or its status changes, and on every monitoring run.
-- * If the dose becomes missed again later, a new alert is raised (numbered event key …:r1, :r2).
-- * Today: 7 open alerts (child 29, one per recipient) have no missed dose behind them; resolved here.
-- Backup: backup_nip_rev01_be.alert_nip_before_10 (532 NIP alerts), backup_nip_rev01_be.functions ('… (before 10)', incl. the feed view).

alter table public.alert add column if not exists resolution_note text check (resolution_note is null or length(resolution_note) <= 500);
comment on column public.alert.resolution_note is 'Set when the system resolves an alert itself (e.g. "Resolved automatically: dose no longer missed").';

-- Missed-dose candidates: approved OR awaiting-approval doses count as given.
CREATE OR REPLACE FUNCTION public.alr_vaccination_schedule_candidates(p_today date)
 RETURNS TABLE(child_id bigint, child_name text, barangay_id bigint, vaccine_code text, dose_number integer, due_date date, days_past_due integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH schedule(vaccine_code,dose_number,age_days,age_months) AS (
    VALUES
      ('BCG',1,0,NULL::integer),
      ('HEPB',1,0,NULL::integer),
      ('PENTA',1,42,NULL::integer),
      ('PENTA',2,70,NULL::integer),
      ('PENTA',3,98,NULL::integer),
      ('OPV',1,42,NULL::integer),
      ('OPV',2,70,NULL::integer),
      ('OPV',3,98,NULL::integer),
      ('PCV13',1,42,NULL::integer),
      ('PCV13',2,70,NULL::integer),
      ('PCV13',3,98,NULL::integer),
      ('IPV',1,98,NULL::integer),
      ('IPV',2,NULL::integer,9),
      ('MMR',1,NULL::integer,9),
      ('MMR',2,NULL::integer,12)
  ), catalog AS (
    SELECT CASE pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(v.vaccine_type),'[[:space:]_-]+','','g'))
        WHEN 'HEPATITISB' THEN 'HEPB' WHEN 'PENTAVALENT' THEN 'PENTA' WHEN 'ROTAVIRUS' THEN 'ROTA'
        ELSE pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(v.vaccine_type),'[[:space:]_-]+','','g'))
      END AS vaccine_code,
      v.max_age_days
    FROM public.vaccine v
  ), planned AS (
    SELECT c.child_id,
      pg_catalog.concat_ws(' ',c.first_name,c.middle_name,c.last_name) AS child_name,
      c.barangay_id,s.vaccine_code,s.dose_number,
      CASE WHEN s.age_months IS NOT NULL
        THEN (c.date_of_birth + pg_catalog.make_interval(months => s.age_months))::date
        ELSE c.date_of_birth + s.age_days END AS due_date
    FROM public.child c CROSS JOIN schedule s
    WHERE c.status='ACTIVE'
      AND c.date_of_birth <= p_today
      AND p_today < (c.date_of_birth + interval '5 years')::date
      AND NOT EXISTS (
        SELECT 1 FROM catalog k
        WHERE k.vaccine_code = s.vaccine_code AND k.max_age_days IS NOT NULL
          AND p_today >= c.date_of_birth + k.max_age_days
      )
  ), given AS (
    -- Approved, or recorded and awaiting approval (same rule as the app). Needs correction = not given.
    SELECT vr.child_id,vr.dose_number,
      CASE pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(v.vaccine_type),'[[:space:]_-]+','','g'))
        WHEN 'HEPATITISB' THEN 'HEPB'
        WHEN 'PENTAVALENT' THEN 'PENTA'
        WHEN 'ORALPOLIO' THEN 'OPV'
        WHEN 'ORALPOLIOVACCINE' THEN 'OPV'
        WHEN 'INACTIVATEDPOLIO' THEN 'IPV'
        WHEN 'INACTIVATEDPOLIOVACCINE' THEN 'IPV'
        WHEN 'PCV' THEN 'PCV13'
        ELSE pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(v.vaccine_type),'[[:space:]_-]+','','g'))
      END AS vaccine_code
    FROM public.vaccination_record vr
    JOIN public.vaccine v ON v.vaccine_id=vr.vaccine_id
    WHERE vr.status IN ('APPROVED','PENDING')
  )
  SELECT p.child_id,p.child_name,p.barangay_id,p.vaccine_code,p.dose_number,
    p.due_date,p_today-p.due_date
  FROM planned p
  WHERE NOT EXISTS (
      SELECT 1 FROM given a
      WHERE a.child_id=p.child_id AND a.vaccine_code=p.vaccine_code
        AND a.dose_number=p.dose_number
    );
$function$;

-- Close open missed-dose alerts whose child has no missed dose any more.
create or replace function public.echims_resolve_stale_nip_alerts(p_child_id bigint default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
  v_count integer;
begin
  -- shortcut: recomputes candidates for all children per call; fine at RHU scale, narrow to the child if it grows.
  update public.alert a
     set status = 'RESOLVED', resolved_at = pg_catalog.now(), resolved_by = null,
         resolution_note = 'Resolved automatically: dose no longer missed'
   where a.alert_type = 'NIP_DOSE_OVERDUE' and a.status in ('UNREAD', 'READ')
     and (p_child_id is null or a.child_id = p_child_id)
     and not exists (select 1 from public.alr_vaccination_candidates(v_today) c where c.child_id = a.child_id);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke all on function public.echims_resolve_stale_nip_alerts(bigint) from public, anon, authenticated;

-- The alert guard lets only the recipient change an alert; allow this engine's resolution too
-- (same pattern as the child follow-up engine): only status / resolved_at / resolution_note move.
CREATE OR REPLACE FUNCTION public.guard_targeted_alert_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 -- CFU_ENGINE_RESOLVE_V1
 IF OLD.source_module='CHILD_FOLLOW_UP' AND OLD.event_key LIKE 'CFU_V1:%'
 AND current_user=pg_catalog.pg_get_userbyid((SELECT p.proowner FROM pg_catalog.pg_proc p
  WHERE p.oid='public.echims_refresh_child_follow_up_alerts(bigint)'::regprocedure))
 AND OLD.status IN ('UNREAD','READ') AND NEW.status='RESOLVED' AND NEW.resolved_by IS NULL
 AND (pg_catalog.to_jsonb(NEW)-'status'-'resolved_at'-'resolved_by') IS NOT DISTINCT FROM
     (pg_catalog.to_jsonb(OLD)-'status'-'resolved_at'-'resolved_by') THEN
  NEW.resolved_at:=pg_catalog.now(); RETURN NEW;
 END IF;

 -- NIP_ENGINE_RESOLVE_V1 (NIP-REV01): missed-dose alert whose dose is no longer missed.
 IF OLD.alert_type='NIP_DOSE_OVERDUE'
 AND current_user=pg_catalog.pg_get_userbyid((SELECT p.proowner FROM pg_catalog.pg_proc p
  WHERE p.oid='public.echims_resolve_stale_nip_alerts(bigint)'::regprocedure))
 AND OLD.status IN ('UNREAD','READ') AND NEW.status='RESOLVED' AND NEW.resolved_by IS NULL
 AND (pg_catalog.to_jsonb(NEW)-'status'-'resolved_at'-'resolved_by'-'resolution_note') IS NOT DISTINCT FROM
     (pg_catalog.to_jsonb(OLD)-'status'-'resolved_at'-'resolved_by'-'resolution_note') THEN
  NEW.resolved_at:=pg_catalog.now(); RETURN NEW;
 END IF;

 IF OLD.recipient_id IS NULL AND NEW.recipient_id IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR OLD.recipient_id IS DISTINCT FROM auth.uid()
  OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.account_status='ACTIVE') THEN
  RAISE EXCEPTION 'Only the active assigned recipient can handle this alert.' USING ERRCODE='42501';
 END IF;
 IF (pg_catalog.to_jsonb(NEW)-'status'-'read_at'-'resolved_at'-'resolved_by') IS DISTINCT FROM
    (pg_catalog.to_jsonb(OLD)-'status'-'read_at'-'resolved_at'-'resolved_by') THEN
  RAISE EXCEPTION 'Only read state or manual resolution may change.' USING ERRCODE='22023';
 END IF;
 IF NEW.status NOT IN ('UNREAD','READ','RESOLVED') OR NEW.status IS NULL THEN
  RAISE EXCEPTION 'Use UNREAD, READ or RESOLVED.' USING ERRCODE='22023';
 END IF;
 IF OLD.status='RESOLVED' THEN
  IF NEW.status<>'RESOLVED' THEN RAISE EXCEPTION 'Resolved alerts cannot be reopened by this action.' USING ERRCODE='22023'; END IF;
  NEW.resolved_by:=OLD.resolved_by; NEW.resolved_at:=OLD.resolved_at; NEW.read_at:=OLD.read_at;
  RETURN NEW;
 END IF;
 IF NEW.status='RESOLVED' THEN
  NEW.resolved_by:=auth.uid(); NEW.resolved_at:=pg_catalog.now();
  NEW.read_at:=COALESCE(OLD.read_at,pg_catalog.now());
 ELSE
  NEW.resolved_by:=OLD.resolved_by; NEW.resolved_at:=OLD.resolved_at;
  IF NEW.status='UNREAD' THEN NEW.read_at:=NULL;
  ELSIF OLD.status='READ' THEN NEW.read_at:=COALESCE(OLD.read_at,pg_catalog.now());
  ELSE NEW.read_at:=pg_catalog.now(); END IF;
 END IF;
 RETURN NEW;
END;
$function$;

-- Monitoring: raise new missed-dose alerts (a numbered key after an automatic resolution, so the
-- child can be alerted again), then close the ones that no longer apply.
CREATE OR REPLACE FUNCTION public.run_alert_vaccination_monitoring()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rule public.alert_rule%ROWTYPE;
  v_today date := (pg_catalog.now() AT TIME ZONE 'Asia/Manila')::date;
  v_created integer := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ALR_VACCINATION_V1',0)
  );

  SELECT * INTO v_rule FROM public.alert_rule
  WHERE rule_name='NIP_DOSE_OVERDUE'
    AND evaluator_type='VACCINATION_FIXED'
    AND rule_category='VACCINATION'
    AND status='ACTIVE';

  IF NOT FOUND THEN RETURN 0; END IF;

  INSERT INTO public.alert (
    alert_type,alert_message,severity,status,rule_id,
    child_id,recipient_id,source_module,event_key
  )
  SELECT v_rule.rule_name,
    pg_catalog.format(
      'Missed vaccination: %s. Review the child record for missed doses and follow-up.',
      c.child_name
    ),
    v_rule.severity,'UNREAD',v_rule.rule_id,c.child_id,u.user_id,'VACCINATION',
    'ALR_NIP_CHILD_V2:' || v_rule.rule_id || ':' || c.child_id
      || COALESCE(':r' || NULLIF((SELECT pg_catalog.count(*) FROM public.alert x
           WHERE x.recipient_id=u.user_id AND x.child_id=c.child_id AND x.rule_id=v_rule.rule_id
             AND x.resolution_note IS NOT NULL), 0), '')
  FROM (
    SELECT DISTINCT candidate.child_id,candidate.child_name,candidate.barangay_id
    FROM public.alr_vaccination_candidates(v_today) candidate
  ) c
  CROSS JOIN public.users u
  WHERE u.account_status='ACTIVE'
    AND (
      EXISTS (SELECT 1 FROM public.administrator a WHERE a.user_id=u.user_id)
      OR EXISTS (
        SELECT 1 FROM public.public_health_nurse phn
        JOIN public.barangay b ON b.rhu_id=phn.rhu_id
        WHERE phn.user_id=u.user_id AND b.barangay_id=c.barangay_id
      )
      OR (
        (
          EXISTS (SELECT 1 FROM public.barangay_health_worker bhw WHERE bhw.user_id=u.user_id)
          OR EXISTS (SELECT 1 FROM public.rural_health_midwife rhm WHERE rhm.user_id=u.user_id)
        )
        AND EXISTS (
          SELECT 1 FROM public.health_worker_assignment hwa
          WHERE hwa.user_id=u.user_id AND hwa.barangay_id=c.barangay_id
            AND hwa.status='ACTIVE'
        )
      )
    )
  ON CONFLICT(recipient_id,event_key)
    WHERE recipient_id IS NOT NULL AND event_key IS NOT NULL
    DO NOTHING;

  GET DIAGNOSTICS v_created=ROW_COUNT;
  -- Never rewrite messages on existing alerts; only close the ones whose dose is no longer missed.
  PERFORM public.echims_resolve_stale_nip_alerts(NULL);
  RETURN v_created;
END;
$function$;

-- When a dose is recorded or its status changes, close that child's stale missed-dose alerts.
create or replace function public.echims_vaccination_record_resolve_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.echims_resolve_stale_nip_alerts(new.child_id);
  return null;
end
$$;
drop trigger if exists echims_vaccination_record_resolve_alerts on public.vaccination_record;
create trigger echims_vaccination_record_resolve_alerts after insert or update of status on public.vaccination_record
  for each row execute function public.echims_vaccination_record_resolve_alerts();

-- Today's stale alerts.
select public.echims_resolve_stale_nip_alerts(null);

-- The alert feed shows the resolution note (live definition with resolution_note appended;
-- security_invoker kept so RLS applies to the caller; grants are kept by CREATE OR REPLACE).
CREATE OR REPLACE VIEW public.alert_notification_feed WITH (security_invoker = true) AS
 SELECT cfu_legacy_v10.alert_id, cfu_legacy_v10.alert_type, cfu_legacy_v10.alert_message, cfu_legacy_v10.severity,
    cfu_legacy_v10.status, cfu_legacy_v10.created_at, cfu_legacy_v10.resolved_at, cfu_legacy_v10.child_id,
    cfu_legacy_v10.rule_id, cfu_legacy_v10.inventory_id, cfu_legacy_v10.resolved_by, cfu_legacy_v10.recipient_id,
    cfu_legacy_v10.actor_id, cfu_legacy_v10.schedule_id, cfu_legacy_v10.source_module, cfu_legacy_v10.event_key,
    cfu_legacy_v10.read_at, cfu_legacy_v10.assessment_id, cfu_legacy_v10.resolution_note
   FROM ( SELECT a.alert_id, a.alert_type,
            CASE
                WHEN a.event_key ~~ 'ALR_NIP_CHILD_V2:%'::text THEN format('Vaccination overdue: %s. Review the child record for missing doses and follow-up.'::text, COALESCE(( SELECT concat_ws(' '::text, c.first_name, c.middle_name, c.last_name) AS concat_ws
                   FROM child c
                  WHERE c.child_id = a.child_id), "substring"(a.alert_message, '^Vaccination follow-up: (.*) \(child #[0-9]+\)'::text), 'Child #'::text || a.child_id::text))
                ELSE a.alert_message
            END AS alert_message,
            CASE
                WHEN a.event_key ~~ 'ALR_NIP_CHILD_V2:%'::text THEN 'CRITICAL'::character varying
                ELSE a.severity
            END AS severity,
            a.status, a.created_at, a.resolved_at, a.child_id, a.rule_id, a.inventory_id, a.resolved_by, a.recipient_id,
            a.actor_id, a.schedule_id, a.source_module, a.event_key, a.read_at, a.assessment_id, a.resolution_note
           FROM alert a
          WHERE NOT (NOT a.source_module IS DISTINCT FROM 'VACCINATION'::text AND COALESCE(a.event_key, ''::text) ~~ 'ALR_NIP_V1:%'::text AND (EXISTS ( SELECT 1
                   FROM alert grouped
                  WHERE grouped.recipient_id = a.recipient_id AND grouped.child_id = a.child_id AND grouped.rule_id = a.rule_id AND grouped.source_module = 'VACCINATION'::text AND grouped.event_key = ((('ALR_NIP_CHILD_V2:'::text || a.rule_id) || ':'::text) || a.child_id))))) cfu_legacy_v10
  WHERE NOT (NOT cfu_legacy_v10.source_module IS DISTINCT FROM 'CHILD_FOLLOW_UP'::text AND COALESCE(cfu_legacy_v10.event_key, ''::text) ~~ 'CFU_V1:%'::text)
UNION ALL
 SELECT cfu_added_v10.alert_id, cfu_added_v10.alert_type, cfu_added_v10.alert_message, cfu_added_v10.severity,
    cfu_added_v10.status, cfu_added_v10.created_at, cfu_added_v10.resolved_at, cfu_added_v10.child_id,
    cfu_added_v10.rule_id, cfu_added_v10.inventory_id, cfu_added_v10.resolved_by, cfu_added_v10.recipient_id,
    cfu_added_v10.actor_id, cfu_added_v10.schedule_id, cfu_added_v10.source_module, cfu_added_v10.event_key,
    cfu_added_v10.read_at, cfu_added_v10.assessment_id, cfu_added_v10.resolution_note
   FROM alert cfu_added_v10
  WHERE cfu_added_v10.source_module = 'CHILD_FOLLOW_UP'::text AND cfu_added_v10.event_key ~~ 'CFU_V1:%'::text;
