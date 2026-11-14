-- NUT-REV01 backend 01 — tracked edits for nutritional assessments.
-- An edit replaces the values shown everywhere (the latest wins) and keeps the earlier values as
-- history:
-- * nutritional_assessment gains updated_at, updated_by and revision_count.
-- * nutritional_assessment_revision: one immutable row per edit with the changed fields, the old and
--   new measurements and classifications, the reason (and note), and who edited when. Readable by
--   whoever can read the assessment; no client writes (only the RPC below writes it).
-- * edit_nutritional_assessment(...): the only way to change weight, height, measurement_type,
--   muac or edema_grade. Permission (manuscript: "Only the BNS shall record new assessments; other
--   permitted roles shall have view access"): the BNS who recorded the assessment, in an assigned
--   barangay; administrators only for support / data fixes. PHN and RHM keep view access (incl.
--   history) but cannot edit. The existing BEFORE triggers re-evaluate the row; the AFTER triggers
--   reconcile alerts and admissions as for any update (a SAM/MAM result still opens an admission
--   through ensure_nutrition_admission, which skips a child with an open one and is ON CONFLICT DO
--   NOTHING on the unique source_assessment_id, so there is never a duplicate).
-- * Admissions after a correction: admissions are never closed or cancelled automatically (status
--   allows only PENDING / ACTIVE / DONE, and DONE needs care type, checkup date, confirmer and
--   remarks). When an edit turns a SAM/MAM result into anything else, every admission detected
--   from that assessment gets an UPDATED event ("Source assessment corrected", old / new
--   classification, revision_no; its status is left as it is), and while it is still PENDING or
--   ACTIVE the child's assigned RHM / BNS get a NUT_ADMISSION_SOURCE_CORRECTED alert to resolve it.
--   New alert_rule row NUT_ADMISSION_SOURCE_CORRECTED (alert.rule_id is required).
-- * guard_nutrition_submission: a direct UPDATE of those five fields outside the RPC is refused
--   with NUT-R005 (administrators included). Everything else in the guard is unchanged.
-- The editor's name and role are stored on the revision when it is written: users can read only
-- their own users row, so they could not be looked up later for the History view.
-- * guard_targeted_alert_update: the nutrition alert engines (notify_nutritional_assessment_risks,
--   refresh_nutrition_worsening_alerts) may supersede / re-open NUTRITION alerts for the other
--   recipients. Without this, any correction of an assessment that already had alerts failed with
--   "Only the active assigned recipient can handle this alert." (found in the dry run; it affected
--   direct updates before this migration too). Same pattern as the CFU and NIP engine exemptions.
-- Existing assessment data is not modified (no backfill; revision_count starts at 0).
-- MUAC plausibility is NOT in this migration (pending a reference and health-worker confirmation):
-- see supabase/proposals/. MUAC classification is unchanged (severe < 11.5 cm, moderate 11.5 to
-- < 12.5 cm, 6–59 months only).
-- Backup before applying (2026-11-14): schema backup_nut_rev01_be — copies of nutritional_assessment,
-- nutrition_admission, nutrition_admission_event, alert and alert_rule, and function_defs with the
-- previous guard_nutrition_submission and guard_targeted_alert_update.

alter table public.nutritional_assessment
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid,
  add column if not exists revision_count integer not null default 0;
comment on column public.nutritional_assessment.updated_at is 'Last measurement edit through edit_nutritional_assessment; null if never edited.';
comment on column public.nutritional_assessment.updated_by is 'User who made the last measurement edit.';
comment on column public.nutritional_assessment.revision_count is 'Number of recorded edits (= the latest nutritional_assessment_revision.revision_no).';

create table if not exists public.nutritional_assessment_revision (
  revision_id bigint generated always as identity primary key,
  assessment_id bigint not null references public.nutritional_assessment(assessment_id) on delete cascade,
  child_id bigint not null,
  revision_no integer not null check (revision_no > 0),
  changed_fields text[] not null check (pg_catalog.cardinality(changed_fields) > 0),
  old_values jsonb not null,
  new_values jsonb not null,
  reason text not null check (reason in ('ENTRY_ERROR', 'REMEASURED_SAME_DAY', 'WRONG_POSITION', 'OTHER')),
  note text check (note is null or pg_catalog.length(note) <= 500),
  editor_name text,
  editor_role text,
  edited_by uuid not null default auth.uid(),
  edited_at timestamptz not null default pg_catalog.now(),
  constraint nutritional_assessment_revision_no_unique unique (assessment_id, revision_no),
  constraint nutritional_assessment_revision_note_for_other
    check (reason <> 'OTHER' or pg_catalog.btrim(coalesce(note, '')) <> '')
);
comment on table public.nutritional_assessment_revision is
  'Immutable history of measurement edits to nutritional_assessment (written only by edit_nutritional_assessment). old_values / new_values hold weight, height, measurement_type, muac, edema_grade, waz, haz, whz, baz and the five classifications.';
create index if not exists nutritional_assessment_revision_assessment_idx
  on public.nutritional_assessment_revision (assessment_id, revision_no desc);
create index if not exists nutritional_assessment_revision_child_idx
  on public.nutritional_assessment_revision (child_id);

-- Read access mirrors the assessment's own SELECT visibility (the parent's RLS applies inside the
-- policy). No INSERT / UPDATE / DELETE for clients: revisions are immutable.
alter table public.nutritional_assessment_revision enable row level security;
revoke all on public.nutritional_assessment_revision from public, anon, authenticated;
grant select on public.nutritional_assessment_revision to authenticated;
drop policy if exists nutritional_assessment_revision_select on public.nutritional_assessment_revision;
create policy nutritional_assessment_revision_select on public.nutritional_assessment_revision
  for select to authenticated
  using (exists (
    select 1 from public.nutritional_assessment na
    where na.assessment_id = nutritional_assessment_revision.assessment_id
  ));

-- Guard: measurements change only through the edit flow (transaction-local flag set by the RPC).
CREATE OR REPLACE FUNCTION public.guard_nutrition_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.client_request_id IS DISTINCT FROM OLD.client_request_id THEN
      RAISE EXCEPTION 'The assessment request identifier cannot be changed.'
        USING ERRCODE = '22023';
    END IF;
    -- NUT-REV01: edits must leave a revision. Administrators are not exempt.
    IF ROW(NEW.weight, NEW.height, NEW.measurement_type, NEW.muac, NEW.edema_grade)
       IS DISTINCT FROM
       ROW(OLD.weight, OLD.height, OLD.measurement_type, OLD.muac, OLD.edema_grade)
       AND pg_catalog.current_setting('echims.na_edit', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION
        'NUT-R005: Edit measurements through the edit flow so the change is recorded.'
        USING ERRCODE = '42501';
    END IF;
    IF ROW(NEW.assessment_date, NEW.weight, NEW.height, NEW.muac,
           NEW.measurement_type, NEW.edema_grade)
       IS NOT DISTINCT FROM
       ROW(OLD.assessment_date, OLD.weight, OLD.height, OLD.muac,
           OLD.measurement_type, OLD.edema_grade) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- NUT-USR001 submission policy: refuse values needing verification.
  -- The existing evaluator applies the indicator-specific WHO plausibility
  -- bounds and flags invalid infant standing measurements. This guard runs
  -- after it and before an assessment or its alerts can be committed.
  IF 'NEEDS_VERIFICATION' = ANY(ARRAY[
    NEW.weight_for_age, NEW.height_for_age,
    NEW.weight_for_height, NEW.bmi_for_age
  ]) THEN
    RAISE EXCEPTION
      'NUT-R004: Measurements are outside the accepted WHO plausibility bounds or use an invalid measurement position. Recheck the measurements before saving.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

-- Alert guard: let the nutrition alert engines reconcile NUTRITION alerts after a correction.
-- Unchanged otherwise (CFU and NIP engine branches and the recipient rules are as before).
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

 -- NUTRITION_ENGINE_V1 (NUT-REV01): a corrected assessment supersedes or re-opens its NUTRITION
 -- alerts for every recipient. Only state, message, severity and actor may change.
 IF OLD.source_module='NUTRITION'
 AND current_user IN (
   pg_catalog.pg_get_userbyid((SELECT p.proowner FROM pg_catalog.pg_proc p
     WHERE p.oid='public.notify_nutritional_assessment_risks()'::regprocedure)),
   pg_catalog.pg_get_userbyid((SELECT p.proowner FROM pg_catalog.pg_proc p
     WHERE p.oid='public.refresh_nutrition_worsening_alerts(bigint,uuid)'::regprocedure)))
 AND (pg_catalog.to_jsonb(NEW)-'status'-'read_at'-'resolved_at'-'resolved_by'-'alert_message'-'severity'-'actor_id')
     IS NOT DISTINCT FROM
     (pg_catalog.to_jsonb(OLD)-'status'-'read_at'-'resolved_at'-'resolved_by'-'alert_message'-'severity'-'actor_id') THEN
  RETURN NEW;
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

-- Alert for an admission whose source assessment was corrected out of SAM/MAM.
-- alr_validate_rule only lets a signed-in administrator add inventory / NIP rules (the other
-- NUTRITION_FIXED rules were seeded before it existed), so this one seed row is inserted with that
-- trigger off for this statement only. The audit trigger still records it; alert_rule_audit needs an
-- actor, so the insert is attributed to the earliest active administrator (looked up, not hard-coded;
-- the migration fails clearly if there is none) and the claim is cleared right after.
select pg_catalog.set_config('request.jwt.claims', pg_catalog.json_build_object('role', 'authenticated', 'sub',
  (select a.user_id from public.administrator a join public.users u on u.user_id = a.user_id
    where u.account_status = 'ACTIVE' order by u.created_at, a.user_id limit 1))::text, true);
alter table public.alert_rule disable trigger alr_validate_rule;
insert into public.alert_rule (rule_name, description, rule_category, condition_logic, severity, status, evaluator_type)
select 'NUT_ADMISSION_SOURCE_CORRECTED',
       'The assessment an admission was detected from was corrected and is no longer SAM/MAM. Review the admission and resolve or update it.',
       'NUTRITION',
       'edit_nutritional_assessment: source assessment of a PENDING / ACTIVE admission corrected from SAM/MAM to another result.',
       'HIGH', 'ACTIVE', 'NUTRITION_FIXED'
where not exists (select 1 from public.alert_rule where rule_name = 'NUT_ADMISSION_SOURCE_CORRECTED');
alter table public.alert_rule enable trigger alr_validate_rule;
select pg_catalog.set_config('request.jwt.claims', '', true);

-- The edit flow. SECURITY DEFINER only because clients cannot write revisions; the permission
-- check below is explicit (definer rights bypass RLS).
create or replace function public.edit_nutritional_assessment(
  p_assessment_id bigint,
  p_weight numeric,
  p_height numeric,
  p_measurement_type text,
  p_muac numeric,
  p_edema_grade smallint,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_old public.nutritional_assessment%rowtype;
  v_new public.nutritional_assessment%rowtype;
  v_barangay_id bigint;
  v_changed text[] := array[]::text[];
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_editor_name text;
  v_editor_role text;
  v_child_name text;
  v_rule public.alert_rule%rowtype;
  v_admission public.nutrition_admission%rowtype;
  v_note_text text;
  v_fields constant text[] := array[
    'weight', 'height', 'measurement_type', 'muac', 'edema_grade',
    'waz', 'haz', 'whz', 'baz',
    'weight_for_age', 'height_for_age', 'weight_for_height', 'bmi_for_age',
    'muac_status', 'nutritional_status'];
begin
  if auth.uid() is null then
    raise exception 'NUT-R006: Sign in to edit an assessment.' using errcode = '42501';
  end if;

  select * into v_old from public.nutritional_assessment
   where assessment_id = p_assessment_id
   for update;
  if not found then
    raise exception 'NUT-R007: Assessment not found.' using errcode = 'P0002';
  end if;
  select c.barangay_id, pg_catalog.concat_ws(' ', c.first_name, c.middle_name, c.last_name)
    into v_barangay_id, v_child_name
    from public.child c where c.child_id = v_old.child_id;

  -- Only the BNS who recorded it (in an assigned barangay); administrators for support / data fixes.
  if not (
    public.is_admin()
    or (public.is_bns()
        and v_old.assessed_by = auth.uid()
        and public.is_assigned_to_barangay(v_barangay_id))
  ) then
    raise exception 'NUT-R008: Only the BNS who recorded this assessment can edit it. Other roles can view it and its history.'
      using errcode = '42501';
  end if;

  if p_reason is null or p_reason not in ('ENTRY_ERROR', 'REMEASURED_SAME_DAY', 'WRONG_POSITION', 'OTHER') then
    raise exception 'NUT-R009: Choose a reason for the change.' using errcode = '22023';
  end if;
  if p_reason = 'OTHER' and v_note is null then
    raise exception 'NUT-R010: Add a note explaining the change.' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 500 then
    raise exception 'NUT-R010: Keep the note to 500 characters or fewer.' using errcode = '22023';
  end if;

  if p_weight is distinct from v_old.weight then v_changed := v_changed || 'weight'::text; end if;
  if p_height is distinct from v_old.height then v_changed := v_changed || 'height'::text; end if;
  if p_measurement_type is distinct from v_old.measurement_type then v_changed := v_changed || 'measurement_type'::text; end if;
  if p_muac is distinct from v_old.muac then v_changed := v_changed || 'muac'::text; end if;
  if p_edema_grade is distinct from v_old.edema_grade then v_changed := v_changed || 'edema_grade'::text; end if;
  if pg_catalog.cardinality(v_changed) = 0 then
    raise exception 'NUT-R011: Nothing changed. Edit at least one measurement.' using errcode = '22023';
  end if;

  -- The BEFORE triggers validate and re-evaluate the row (NUT-R004 still applies); the AFTER
  -- triggers reconcile alerts and admissions. The flag is on for this statement only.
  perform pg_catalog.set_config('echims.na_edit', 'on', true);
  update public.nutritional_assessment
     set weight = p_weight,
         height = p_height,
         measurement_type = p_measurement_type,
         muac = p_muac,
         edema_grade = p_edema_grade,
         revision_count = revision_count + 1,
         updated_at = pg_catalog.now(),
         updated_by = auth.uid()
   where assessment_id = p_assessment_id;
  perform pg_catalog.set_config('echims.na_edit', 'off', true);

  select * into v_new from public.nutritional_assessment where assessment_id = p_assessment_id;
  select gp.full_name, gp.role into v_editor_name, v_editor_role from public.get_my_profile() gp limit 1;

  insert into public.nutritional_assessment_revision (
    assessment_id, child_id, revision_no, changed_fields, old_values, new_values,
    reason, note, editor_name, editor_role, edited_by
  ) values (
    p_assessment_id, v_old.child_id, v_new.revision_count, v_changed,
    (select pg_catalog.jsonb_object_agg(f, pg_catalog.to_jsonb(v_old) -> f) from pg_catalog.unnest(v_fields) as u(f)),
    (select pg_catalog.jsonb_object_agg(f, pg_catalog.to_jsonb(v_new) -> f) from pg_catalog.unnest(v_fields) as u(f)),
    p_reason, v_note, v_editor_name, v_editor_role, auth.uid()
  );

  -- Corrected out of SAM/MAM: note it on every admission detected from this assessment (status
  -- unchanged) and alert the assigned RHM / BNS while it is still open.
  if v_old.nutritional_status in ('SAM', 'MAM')
     and v_new.nutritional_status is distinct from 'SAM'
     and v_new.nutritional_status is distinct from 'MAM' then
    select * into v_rule from public.alert_rule
     where rule_name = 'NUT_ADMISSION_SOURCE_CORRECTED' and status = 'ACTIVE'
     order by rule_id limit 1;
    for v_admission in
      select * from public.nutrition_admission where source_assessment_id = p_assessment_id
    loop
      v_note_text := pg_catalog.format(
        'Source assessment corrected (revision %s): %s → %s. Admission status left as %s; review and update it.',
        v_new.revision_count, v_old.nutritional_status, v_new.nutritional_status, v_admission.status);
      insert into public.nutrition_admission_event (admission_id, actor_id, action, old_values, new_values)
      values (
        v_admission.admission_id, auth.uid(), 'UPDATED',
        pg_catalog.jsonb_build_object('source_classification', v_old.nutritional_status),
        pg_catalog.jsonb_build_object(
          'note', 'Source assessment corrected',
          'source_assessment_id', p_assessment_id,
          'revision_no', v_new.revision_count,
          'old_classification', v_old.nutritional_status,
          'new_classification', v_new.nutritional_status,
          -- Shown by the Admission tracking history as it is.
          'status', v_admission.status,
          'care_type', v_admission.care_type,
          'remarks', v_note_text));
      if v_admission.status in ('PENDING', 'ACTIVE') and v_rule.rule_id is not null then
        insert into public.alert (
          alert_type, alert_message, severity, status, rule_id, recipient_id, actor_id,
          child_id, assessment_id, source_module, event_key)
        select 'NUTRITION',
          pg_catalog.format(
            'Nutrition assessment #%s for %s on %s was corrected (revision %s): %s → %s. Admission #%s was detected from the earlier result and is still %s. Review it and resolve or update the admission.',
            p_assessment_id, v_child_name, v_new.assessment_date, v_new.revision_count,
            v_old.nutritional_status, v_new.nutritional_status, v_admission.admission_id, v_admission.status),
          v_rule.severity, 'UNREAD', v_rule.rule_id, u.user_id, auth.uid(),
          v_old.child_id, p_assessment_id, 'NUTRITION',
          pg_catalog.concat('NUTRITION_ADMISSION_CORRECTED:', v_admission.admission_id, ':', v_new.revision_count)
        from public.users u
        where u.account_status = 'ACTIVE'
          and (exists (select 1 from public.barangay_nutrition_scholar b where b.user_id = u.user_id)
               or exists (select 1 from public.rural_health_midwife r where r.user_id = u.user_id))
          and exists (select 1 from public.health_worker_assignment hwa
                      where hwa.user_id = u.user_id and hwa.barangay_id = v_barangay_id and hwa.status = 'ACTIVE')
        on conflict (recipient_id, event_key) where recipient_id is not null and event_key is not null do nothing;
      end if;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object('assessment', pg_catalog.to_jsonb(v_new), 'revision_no', v_new.revision_count);
end
$$;
revoke all on function public.edit_nutritional_assessment(bigint, numeric, numeric, text, numeric, smallint, text, text) from public, anon;
grant execute on function public.edit_nutritional_assessment(bigint, numeric, numeric, text, numeric, smallint, text, text) to authenticated;
comment on function public.edit_nutritional_assessment(bigint, numeric, numeric, text, numeric, smallint, text, text) is
  'Edits an assessment''s measurements, re-evaluates it and records a nutritional_assessment_revision. Returns {assessment, revision_no}.';
