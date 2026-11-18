-- NUT-REV01 backend 03 — edit-flow error codes get their own series.
-- The alert rules use NUT-R005–NUT-R016 as the manuscript's rule numbers (e.g. NUT-R008 = severely
-- stunted), so the edit-flow errors move to NUT-E001–NUT-E007. Messages and logic are unchanged;
-- only the code prefix in each RAISE changes. NUT-R004 (WHO plausibility, not an edit-flow error)
-- stays. Code map:
--   NUT-R005 → NUT-E001  direct measurement update outside the edit flow
--   NUT-R006 → NUT-E002  not signed in
--   NUT-R007 → NUT-E003  assessment not found
--   NUT-R008 → NUT-E004  not the recording BNS / Admin
--   NUT-R009 → NUT-E005  reason missing
--   NUT-R010 → NUT-E006  note missing / too long
--   NUT-R011 → NUT-E007  nothing changed
--   (proposal nut_rev01_02: NUT-R012 → NUT-E008, MUAC bounds; not applied)
-- Both functions are copied from 20261114122132_nut_rev01_01 (bodies checked equal to the live
-- definitions before this was written) with only those codes renamed.
-- Backup before applying: backup_nut_rev01_be.function_defs_before_03.

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
        'NUT-E001: Edit measurements through the edit flow so the change is recorded.'
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
  v_labels text[];
  v_fields constant text[] := array[
    'weight', 'height', 'measurement_type', 'muac', 'edema_grade',
    'waz', 'haz', 'whz', 'baz',
    'weight_for_age', 'height_for_age', 'weight_for_height', 'bmi_for_age',
    'muac_status', 'nutritional_status'];
begin
  if auth.uid() is null then
    raise exception 'NUT-E002: Sign in to edit an assessment.' using errcode = '42501';
  end if;

  select * into v_old from public.nutritional_assessment
   where assessment_id = p_assessment_id
   for update;
  if not found then
    raise exception 'NUT-E003: Assessment not found.' using errcode = 'P0002';
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
    raise exception 'NUT-E004: Only the BNS who recorded this assessment can edit it. Other roles can view it and its history.'
      using errcode = '42501';
  end if;

  if p_reason is null or p_reason not in ('ENTRY_ERROR', 'REMEASURED_SAME_DAY', 'WRONG_POSITION', 'OTHER') then
    raise exception 'NUT-E005: Choose a reason for the change.' using errcode = '22023';
  end if;
  if p_reason = 'OTHER' and v_note is null then
    raise exception 'NUT-E006: Add a note explaining the change.' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.length(v_note) > 500 then
    raise exception 'NUT-E006: Keep the note to 500 characters or fewer.' using errcode = '22023';
  end if;

  if p_weight is distinct from v_old.weight then v_changed := v_changed || 'weight'::text; end if;
  if p_height is distinct from v_old.height then v_changed := v_changed || 'height'::text; end if;
  if p_measurement_type is distinct from v_old.measurement_type then v_changed := v_changed || 'measurement_type'::text; end if;
  if p_muac is distinct from v_old.muac then v_changed := v_changed || 'muac'::text; end if;
  if p_edema_grade is distinct from v_old.edema_grade then v_changed := v_changed || 'edema_grade'::text; end if;
  if pg_catalog.cardinality(v_changed) = 0 then
    raise exception 'NUT-E007: Nothing changed. Edit at least one measurement.' using errcode = '22023';
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
    -- Display labels, same rule as nutritionLabel() in lib/nutrition-status.ts ("AT_RISK" → "At risk",
    -- SAM / MAM unchanged, "MUAC" kept upper case). The jsonb below keeps the raw codes.
    select pg_catalog.array_agg(case
             when c is null then 'Not recorded'
             when c in ('SAM', 'MAM') then c
             when c = 'NOT_INTERPRETABLE_EDEMA' then 'Not interpretable — edema'
             else pg_catalog.regexp_replace(
               pg_catalog.upper(pg_catalog.left(c, 1)) || pg_catalog.lower(pg_catalog.replace(pg_catalog.substr(c, 2), '_', ' ')),
               '\mmuac\M', 'MUAC', 'gi')
           end order by o)
      into v_labels
      from pg_catalog.unnest(array[v_old.nutritional_status, v_new.nutritional_status]) with ordinality as l(c, o);
    for v_admission in
      select * from public.nutrition_admission where source_assessment_id = p_assessment_id
    loop
      v_note_text := pg_catalog.format(
        'Source assessment corrected (revision %s): %s → %s. Admission status left as %s; review and update it.',
        v_new.revision_count, v_labels[1], v_labels[2], pg_catalog.lower(v_admission.status));
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
            v_labels[1], v_labels[2], v_admission.admission_id, pg_catalog.lower(v_admission.status)),
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
