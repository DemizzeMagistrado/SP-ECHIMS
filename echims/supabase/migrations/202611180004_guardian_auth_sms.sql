BEGIN;
-- No OTPs or raw phone numbers are stored in this delivery ledger.
CREATE TABLE IF NOT EXISTS public.guardian_auth_sms_delivery (
 event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 200),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 phone_hash text NOT NULL CHECK(phone_hash ~ '^[0-9a-f]{64}$'),
 status text NOT NULL CHECK(status IN ('SENDING','SUBMITTED','FAILED','UNCERTAIN')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guardian_auth_sms_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_auth_sms_delivery FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS guardian_auth_sms_phone_time ON public.guardian_auth_sms_delivery(phone_hash,created_at DESC);
CREATE INDEX IF NOT EXISTS guardian_auth_sms_time ON public.guardian_auth_sms_delivery(created_at DESC);

CREATE OR REPLACE FUNCTION public.echims_guardian_sms_reserve(p_event_id text,p_payload_hash text,p_phone_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous public.guardian_auth_sms_delivery%ROWTYPE;
BEGIN
 IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 200
 OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
 OR p_phone_hash IS NULL OR p_phone_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'DENIED'; END IF;
 -- Global reservation lock serializes event deduplication and the volume cap.
 PERFORM pg_advisory_xact_lock(981761804);
 SELECT * INTO previous FROM public.guardian_auth_sms_delivery WHERE event_id=p_event_id;
 IF FOUND THEN
  IF previous.payload_hash<>p_payload_hash OR previous.phone_hash<>p_phone_hash THEN RETURN 'DENIED'; END IF;
  RETURN previous.status;
 END IF;
 IF EXISTS(SELECT 1 FROM public.guardian_auth_sms_delivery WHERE phone_hash=p_phone_hash AND created_at>now()-interval '60 seconds')
 OR (SELECT count(*) FROM public.guardian_auth_sms_delivery WHERE phone_hash=p_phone_hash AND created_at>now()-interval '1 hour')>=5
 OR (SELECT count(*) FROM public.guardian_auth_sms_delivery WHERE created_at>now()-interval '1 hour')>=100 THEN RETURN 'LIMITED'; END IF;
 INSERT INTO public.guardian_auth_sms_delivery(event_id,payload_hash,phone_hash,status) VALUES(p_event_id,p_payload_hash,p_phone_hash,'SENDING');
 RETURN 'RESERVED';
END; $$;
CREATE OR REPLACE FUNCTION public.echims_guardian_sms_finish(p_event_id text,p_payload_hash text,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_status NOT IN ('SUBMITTED','FAILED','UNCERTAIN') THEN RETURN false; END IF;
 UPDATE public.guardian_auth_sms_delivery SET status=p_status,updated_at=now()
 WHERE event_id=p_event_id AND payload_hash=p_payload_hash AND status='SENDING';
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.echims_guardian_sms_reserve(text,text,text),public.echims_guardian_sms_finish(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.echims_guardian_sms_reserve(text,text,text),public.echims_guardian_sms_finish(text,text,text) TO service_role;
COMMIT;
