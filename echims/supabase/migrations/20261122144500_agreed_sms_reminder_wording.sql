BEGIN;

-- A due date is not a booked visit, and an overdue record does not establish attendance.
-- The supplementation feed can include deworming, so the shared template uses suplemento.
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
   WHEN 'OVERDUE' THEN format('Wala pang tala ng %s ni %s. Makipag-ugnayan sa %s.',lower(service),child_name,venue)
   WHEN 'UPCOMING' THEN CASE p_program
     WHEN 'VACCINATION' THEN format('May bakuna si %s. Makipag-ugnayan sa %s para sa iskedyul.',child_name,venue)
     WHEN 'SUPPLEMENTATION' THEN format('May nakatakdang suplemento si %s. Makipag-ugnayan sa %s para sa iskedyul.',child_name,venue)
     ELSE format('%s ni %s sa %s, %s.',service,child_name,slot,venue)
   END
   WHEN 'CHANGED' THEN format('Bagong iskedyul ng %s ni %s: %s, %s.', lower(service),child_name,slot,venue)
   ELSE format('%s ni %s sa %s, %s.',service,child_name,slot,venue) END
 ELSE CASE p_phase
   WHEN 'OVERDUE' THEN format('No %s record yet for %s. Please contact %s.',lower(service),child_name,venue)
   WHEN 'CHANGED' THEN format('New %s schedule for %s: %s, %s.',lower(service),child_name,slot,venue)
   ELSE format('%s for %s on %s, %s.',service,child_name,slot,venue) END END
 FROM details;
$function$;

CREATE OR REPLACE FUNCTION public.echims_child_sms_body(p_child bigint, p_source text, p_language text, p_venue text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT public.echims_short_reminder(c.first_name,s.program,s.due_date,s.start_time,
   CASE WHEN s.phase <> 'OVERDUE' AND s.kind='APPOINTMENT' AND EXISTS (
     SELECT 1 FROM public.child_schedule_sms_attempt previous
     WHERE previous.child_id=p_child AND previous.guardian_id=c.guardian_id
       AND previous.source_key=s.source_key AND previous.source_signature IS DISTINCT FROM s.source_signature
       AND previous.status IN ('SUBMITTED','DELIVERED')
   ) THEN 'CHANGED'
   WHEN s.phase = 'UPCOMING' AND s.kind = 'APPOINTMENT' THEN 'CONFIRMED'
   ELSE s.phase END, p_language, p_venue)
 FROM public.echims_child_sms_sources(p_child) s JOIN public.child c ON c.child_id=p_child
 WHERE s.source_key=p_source;
$function$;
REVOKE ALL ON FUNCTION public.echims_child_sms_body(bigint,text,text,text) FROM PUBLIC, anon, authenticated;

COMMIT;
