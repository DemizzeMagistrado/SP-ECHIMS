-- CP-REV01 follow-up — guardian mobile numbers stored in one format: 09XXXXXXXXX.
--
-- * normalize_guardian_mobile (SMS gateway format 639XXXXXXXXX, used by every SMS function) now
--   also accepts spaces, dashes, dots, brackets and 10-digit numbers (9XXXXXXXXX). Results for
--   inputs it already accepted are unchanged, so verified SMS numbers still match.
-- * echims_canonical_guardian_mobile returns the stored format (09XXXXXXXXX) or NULL.
-- * A trigger normalizes guardian.contact_number on every insert/update (form, offline upload,
--   masterlist import). It sorts before reset_guardian_sms_confirmation, so typing the same
--   number in another format no longer resets SMS consent. Unparseable values are kept as typed
--   (trimmed) for a health worker to correct; the app validates before saving.
-- * Backfill: existing numbers are rewritten to 09XXXXXXXXX (1 row at the time of writing,
--   not opted in to SMS). Backup: backup_cp_rev01.guardian_before_mobile.
BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_guardian_mobile(p_number text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN cleaned.number ~ '^09[0-9]{9}$' THEN '63' || pg_catalog.substr(cleaned.number, 2)
    WHEN cleaned.number ~ '^9[0-9]{9}$' THEN '63' || cleaned.number
    WHEN cleaned.number ~ '^\+?639[0-9]{9}$' THEN pg_catalog.right(cleaned.number, 12)
    ELSE NULL
  END
  FROM (SELECT pg_catalog.regexp_replace(pg_catalog.btrim(p_number), '[[:space:]().-]', '', 'g') AS number) cleaned;
$$;

CREATE OR REPLACE FUNCTION public.echims_canonical_guardian_mobile(p_number text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT '0' || pg_catalog.substr(public.normalize_guardian_mobile(p_number), 3)
$$;
REVOKE ALL ON FUNCTION public.echims_canonical_guardian_mobile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_canonical_guardian_mobile(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.echims_guardian_canonical_mobile()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  NEW.contact_number := COALESCE(public.echims_canonical_guardian_mobile(NEW.contact_number),
                                 NULLIF(pg_catalog.btrim(NEW.contact_number), ''));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.echims_guardian_canonical_mobile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS echims_guardian_canonical_mobile ON public.guardian;
CREATE TRIGGER echims_guardian_canonical_mobile BEFORE INSERT OR UPDATE OF contact_number ON public.guardian
  FOR EACH ROW EXECUTE FUNCTION public.echims_guardian_canonical_mobile();

UPDATE public.guardian
   SET contact_number = public.echims_canonical_guardian_mobile(contact_number)
 WHERE public.echims_canonical_guardian_mobile(contact_number) IS NOT NULL
   AND contact_number IS DISTINCT FROM public.echims_canonical_guardian_mobile(contact_number);

COMMIT;
