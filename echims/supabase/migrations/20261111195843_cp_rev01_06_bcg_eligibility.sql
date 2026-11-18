-- CP-REV01 follow-up — vaccination schedule eligibility.
-- alr_vaccination_schedule_candidates (feeds SMS reminders and follow-ups) now leaves out BCG
-- once the child is 1 year old: BCG is only given up to the first birthday, so it is
-- "Not eligible", not a missed dose to remind about. Same rule as lib/nip-schedule.ts.
-- Everything else is unchanged: due dates are still counted from the child's date of birth
-- (no stored due dates exist to recompute; checked 2026-11-12: 0 schedule requests, vaccination
-- records or SMS reminders dated before a child's birth).
-- Backup of the previous definition: backup_cp_rev01.function_definitions.
BEGIN;

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
      -- BCG eligibility: up to the first birthday only.
      AND NOT (s.vaccine_code='BCG' AND p_today >= (c.date_of_birth + interval '1 year')::date)
  ), approved AS (
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
    WHERE vr.status='APPROVED'
  )
  SELECT p.child_id,p.child_name,p.barangay_id,p.vaccine_code,p.dose_number,
    p.due_date,p_today-p.due_date
  FROM planned p
  WHERE NOT EXISTS (
      SELECT 1 FROM approved a
      WHERE a.child_id=p.child_id AND a.vaccine_code=p.vaccine_code
        AND a.dose_number=p.dose_number
    );
$function$;

COMMIT;
