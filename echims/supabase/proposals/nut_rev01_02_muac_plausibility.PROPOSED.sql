-- PROPOSED (awaiting approval of the bounds) — NUT-REV01 backend 02: MUAC plausibility.
-- Not in supabase/migrations on purpose: move it there (and give it a timestamp after
-- 20261114120000_nut_rev01_01) only once the bounds below are approved.
--
-- No MUAC plausibility bound exists today (checked: the evaluator, the guard, the API and the
-- offline queue only require MUAC > 0). A record with MUAC 4.4 cm (assessment 16) was accepted and
-- classified SAM.
--
-- Proposed rule, for children 6–59 months (the evaluator already marks MUAC NOT_APPLICABLE under
-- 6 months, so the check keys off muac_status):
--   refuse MUAC < 7.0 cm or > 22.0 cm  →  NUT-R012
-- Why these numbers: they sit outside the WHO MUAC-for-age range for 6–59 months (roughly −5 SD at
-- 6 months to +5 SD at 59 months), so a real child is never refused, while values like 4.4 cm
-- (a typo for 14.4) or 44 are. Tighter alternative: 9.0–21.0 cm.
-- Runs alongside NUT-R004 in guard_nutrition_submission, after its "nothing changed" early return,
-- so existing rows are never touched; they are checked only when their measurements are edited.
-- Requires migration 01 (this replaces the guard defined there).

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

  IF 'NEEDS_VERIFICATION' = ANY(ARRAY[
    NEW.weight_for_age, NEW.height_for_age,
    NEW.weight_for_height, NEW.bmi_for_age
  ]) THEN
    RAISE EXCEPTION
      'NUT-R004: Measurements are outside the accepted WHO plausibility bounds or use an invalid measurement position. Recheck the measurements before saving.'
      USING ERRCODE = '22023';
  END IF;

  -- NUT-REV01 02: MUAC plausibility, 6–59 months only.
  IF NEW.muac IS NOT NULL
     AND NEW.muac_status IS DISTINCT FROM 'NOT_APPLICABLE'
     AND (NEW.muac < 7.0 OR NEW.muac > 22.0) THEN
    RAISE EXCEPTION
      'NUT-R012: MUAC must be between 7.0 and 22.0 cm for a child 6–59 months. Re-measure before saving.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;
