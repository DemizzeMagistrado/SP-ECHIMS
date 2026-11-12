-- NIP-REV01 backend 06 — vaccine eligibility windows, editable in the vaccine catalog.
-- vaccine.max_age_days: from this age (days from birth) a dose not yet given is "Not eligible",
--   not "Missed" (NULL = no age limit).
-- vaccine.min_interval_days: shortest gap after the previous dose when a missed dose is moved.
-- Windows (DOH NIP; Admin can change them in Vaccination › Vaccines):
--   BCG 365 (up to the first birthday) · Hep-B birth dose 14 (DOH: within 24 hours of birth;
--   accepted up to day 14) · Penta, OPV, IPV, PCV13, MMR 1826 (under 5 years) · Rotavirus 240
--   (last dose by 8 months) · MR (campaign) no limit. Minimum interval 28 days for multi-dose vaccines.
-- alr_vaccination_schedule_candidates (feeds missed-vaccination alerts and SMS reminders) now
-- reads the window from the table instead of the hard-coded BCG rule, so Not eligible doses
-- raise no alert or reminder. The app (lib/nip-catalog-server.ts) reads the same columns.
-- Backup: backup_nip_rev01_be.vaccine, backup_nip_rev01_be.functions (previous definition).

alter table public.vaccine
  add column if not exists max_age_days integer check (max_age_days is null or max_age_days between 1 and 3650),
  add column if not exists min_interval_days integer check (min_interval_days is null or min_interval_days between 1 and 730);

comment on column public.vaccine.max_age_days is 'Eligibility window: from this age in days a dose not yet given is Not eligible (NULL = no limit).';
comment on column public.vaccine.min_interval_days is 'Shortest gap in days after the previous dose when a missed dose is rescheduled.';

update public.vaccine v set max_age_days = x.max_age_days, min_interval_days = x.min_interval_days
from (values
  ('BCG', 365, null::int),
  ('HEPB', 14, null),
  ('PENTA', 1826, 28),
  ('OPV', 1826, 28),
  ('IPV', 1826, 28),
  ('PCV13', 1826, 28),
  ('ROTA', 240, 28),
  ('MMR', 1826, 28)
) as x(code, max_age_days, min_interval_days)
where upper(regexp_replace(btrim(v.vaccine_type), '[[:space:]_-]+', '', 'g')) in (x.code, case x.code when 'HEPB' then 'HEPATITISB' when 'PENTA' then 'PENTAVALENT' when 'ROTA' then 'ROTAVIRUS' else x.code end);

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
    -- Eligibility windows from the vaccine catalog (code normalised like the app does).
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
      -- Past the vaccine's eligibility window: Not eligible, never a missed dose.
      AND NOT EXISTS (
        SELECT 1 FROM catalog k
        WHERE k.vaccine_code = s.vaccine_code AND k.max_age_days IS NOT NULL
          AND p_today >= c.date_of_birth + k.max_age_days
      )
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
