-- Guardian portal foundation. Does not modify existing child/worker policies.
BEGIN;
CREATE SCHEMA IF NOT EXISTS echims_guardian_private;
REVOKE ALL ON SCHEMA echims_guardian_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION echims_guardian_private.phone(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
 SELECT CASE
   WHEN digits ~ '^09[0-9]{9}$' THEN '63' || substr(digits,2)
   WHEN digits ~ '^639[0-9]{9}$' THEN digits
   ELSE NULL END
 FROM (SELECT regexp_replace(coalesce(p_value,''),'[^0-9]','','g') AS digits) p;
$$;

CREATE TABLE IF NOT EXISTS public.guardian_portal_account (
 auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 guardian_id bigint UNIQUE REFERENCES public.guardian(guardian_id),
 first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 100),
 middle_name text CHECK (length(middle_name) <= 100),
 last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 100),
 address text CHECK (length(address) <= 500),
 relationship_to_child text CHECK (length(relationship_to_child) <= 100),
 linked_phone text,
 linked_contact_version bigint,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guardian_portal_account ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_portal_account FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.guardian_portal_account IS
 'Private portal identity mapping. Only controlled RPCs may link accounts; no child record writes.';

-- Identity comes from Supabase Auth, not user-editable role metadata.
CREATE OR REPLACE FUNCTION echims_guardian_private.session_phone()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_phone text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required.' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()) THEN
   RAISE EXCEPTION 'Use a separate guardian account.' USING ERRCODE='42501';
 END IF;
 SELECT echims_guardian_private.phone(u.phone) INTO v_phone
 FROM auth.users u WHERE u.id=auth.uid() AND u.phone_confirmed_at IS NOT NULL;
 IF v_phone IS NULL OR v_phone IS DISTINCT FROM
    echims_guardian_private.phone(auth.jwt()->>'phone') THEN
   RAISE EXCEPTION 'Verify your current phone and sign in again.' USING ERRCODE='42501';
 END IF;
 RETURN v_phone;
END;
$$;

CREATE OR REPLACE FUNCTION echims_guardian_private.guardian_id()
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_phone text; v_guardian_id bigint;
BEGIN
 v_phone := echims_guardian_private.session_phone();
 SELECT a.guardian_id INTO v_guardian_id
 FROM public.guardian_portal_account a JOIN public.guardian g USING (guardian_id)
 WHERE a.auth_user_id=auth.uid() AND a.enabled
 AND a.linked_phone=v_phone
 AND echims_guardian_private.phone(g.contact_number)=v_phone
 AND echims_guardian_private.phone(g.sms_otp_verified_contact_number)=v_phone
 AND g.sms_otp_verified_at IS NOT NULL
 AND a.linked_contact_version=g.sms_contact_version
 -- A newly duplicated phone must also invalidate access, not only first linking.
 AND (SELECT count(*) FROM public.guardian other
      WHERE echims_guardian_private.phone(other.contact_number)=v_phone)=1;
 IF v_guardian_id IS NULL THEN
   RAISE EXCEPTION 'Contact your BHS/RHU to verify your guardian record.' USING ERRCODE='42501';
 END IF;
 RETURN v_guardian_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.echims_guardian_register(
 p_first_name text, p_last_name text, p_middle_name text DEFAULT NULL,
 p_address text DEFAULT NULL, p_relationship_to_child text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_phone text; v_guardian public.guardian%ROWTYPE; v_account public.guardian_portal_account%ROWTYPE;
BEGIN
 v_phone:=echims_guardian_private.session_phone();
 IF p_first_name IS NULL OR length(btrim(p_first_name)) NOT BETWEEN 1 AND 100
 OR p_last_name IS NULL OR length(btrim(p_last_name)) NOT BETWEEN 1 AND 100
 OR length(p_middle_name)>100 OR length(p_address)>500 OR length(p_relationship_to_child)>100 THEN
   RAISE EXCEPTION 'Check your registration information.' USING ERRCODE='22023';
 END IF;
 -- Serialize repeated registration/link attempts by authenticated account.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO v_account FROM public.guardian_portal_account WHERE auth_user_id=auth.uid() FOR UPDATE;
 IF FOUND THEN
   IF NOT v_account.enabled THEN RAISE EXCEPTION 'Contact your BHS/RHU.' USING ERRCODE='42501'; END IF;
   IF v_account.guardian_id IS NOT NULL THEN
     PERFORM echims_guardian_private.guardian_id();
     RETURN jsonb_build_object('linked',true);
   END IF;
 ELSE
   INSERT INTO public.guardian_portal_account(auth_user_id,first_name,middle_name,last_name,address,relationship_to_child)
   VALUES(auth.uid(),btrim(p_first_name),nullif(btrim(p_middle_name),''),btrim(p_last_name),nullif(btrim(p_address),''),nullif(btrim(p_relationship_to_child),''));
 END IF;
 -- More than one matching record is deliberately not auto-linked.
 IF (SELECT count(*) FROM public.guardian g WHERE echims_guardian_private.phone(g.contact_number)=v_phone)<>1 THEN
   RETURN jsonb_build_object('linked',false,'message','Contact your BHS/RHU to verify your guardian record.');
 END IF;
 SELECT * INTO v_guardian FROM public.guardian g
 WHERE echims_guardian_private.phone(g.contact_number)=v_phone FOR UPDATE;
 IF v_guardian.sms_otp_verified_at IS NULL OR
 echims_guardian_private.phone(v_guardian.sms_otp_verified_contact_number) IS DISTINCT FROM v_phone THEN
   RETURN jsonb_build_object('linked',false,'message','Contact your BHS/RHU to verify your guardian record.');
 END IF;
 BEGIN
   UPDATE public.guardian_portal_account SET guardian_id=v_guardian.guardian_id,
   linked_phone=v_phone,linked_contact_version=v_guardian.sms_contact_version,updated_at=now()
   WHERE auth_user_id=auth.uid();
 EXCEPTION WHEN unique_violation THEN
   RETURN jsonb_build_object('linked',false,'message','Contact your BHS/RHU to verify your guardian record.');
 END;
 RETURN jsonb_build_object('linked',true);
END;
$$;

-- Whitelist only. Never return the full row (internal notes may be added later).
CREATE OR REPLACE FUNCTION echims_guardian_private.child_summary(p_child public.child)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
 SELECT jsonb_build_object(
 'childId',j->'child_id','childCode',j->'child_code',
 'firstName',j->'first_name','middleName',j->'middle_name','lastName',j->'last_name',
 'dateOfBirth',j->'date_of_birth','sex',j->'sex','address',j->'address',
 'birthWeightKg',j->'birth_weight_kg','birthLengthCm',coalesce(j->'birth_length_cm',j->'birth_height_cm'))
 FROM (SELECT to_jsonb(p_child) AS j) x;
$$;

CREATE OR REPLACE FUNCTION public.echims_guardian_children()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_guardian_id bigint;
BEGIN
 v_guardian_id:=echims_guardian_private.guardian_id();
 RETURN (SELECT coalesce(jsonb_agg(echims_guardian_private.child_summary(c) ORDER BY c.child_id),'[]'::jsonb)
 FROM public.child c WHERE c.guardian_id=v_guardian_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.echims_guardian_child(p_child_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_guardian_id bigint; v_child jsonb;
BEGIN
 v_guardian_id:=echims_guardian_private.guardian_id();
 SELECT echims_guardian_private.child_summary(c) INTO v_child
 FROM public.child c WHERE c.child_id=p_child_id AND c.guardian_id=v_guardian_id;
 IF v_child IS NULL THEN RAISE EXCEPTION 'Child not found.' USING ERRCODE='42501'; END IF;
 RETURN v_child;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA echims_guardian_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.echims_guardian_register(text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.echims_guardian_children() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.echims_guardian_child(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_guardian_register(text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.echims_guardian_children() TO authenticated;
GRANT EXECUTE ON FUNCTION public.echims_guardian_child(bigint) TO authenticated;
COMMIT;
