-- CP-REV01 §3 — Child ID and Family Serial Number (FSN), both generated and read-only.
--
-- child.child_code        ECH-<registration year>-<child_id, 6 digits>   e.g. ECH-2026-000123
-- household.family_serial_no  FSN-<barangay PSGC code>-<per-barangay no., 4 digits>  e.g. FSN-0501603001-0042
--
-- The FSN belongs to the household, so siblings in the same household share it. It is the
-- "Family no." on the DOH Child Immunization Record card. Both are set by triggers on insert,
-- cannot be changed afterwards, and are backfilled here for existing rows (household FSNs are
-- numbered per barangay in household_id order).
BEGIN;

-- ── Child ID ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.child ADD COLUMN IF NOT EXISTS child_code text;

CREATE OR REPLACE FUNCTION public.echims_assign_child_code()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  -- Identity values are assigned before BEFORE ROW triggers run.
  NEW.child_code:='ECH-'||pg_catalog.to_char(COALESCE(NEW.registration_date,CURRENT_DATE),'YYYY')||'-'||pg_catalog.lpad(NEW.child_id::text,6,'0');
 ELSE
  NEW.child_code:=OLD.child_code; -- read-only
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS echims_assign_child_code ON public.child;

UPDATE public.child
   SET child_code='ECH-'||pg_catalog.to_char(registration_date,'YYYY')||'-'||pg_catalog.lpad(child_id::text,6,'0')
 WHERE child_code IS NULL;

CREATE TRIGGER echims_assign_child_code BEFORE INSERT OR UPDATE ON public.child
 FOR EACH ROW EXECUTE FUNCTION public.echims_assign_child_code();
ALTER TABLE public.child ALTER COLUMN child_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS child_child_code_key ON public.child(child_code);

-- ── Family Serial Number ────────────────────────────────────────────────────────────────────
ALTER TABLE public.household ADD COLUMN IF NOT EXISTS family_serial_no text;

-- Last number issued per barangay. Written only by the trigger below (SECURITY DEFINER);
-- RLS on with no policies, so clients cannot read or change it.
CREATE TABLE IF NOT EXISTS public.household_fsn_counter (
  barangay_id bigint PRIMARY KEY REFERENCES public.barangay(barangay_id) ON DELETE CASCADE,
  last_number integer NOT NULL CHECK (last_number >= 0)
);
ALTER TABLE public.household_fsn_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.household_fsn_counter FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.echims_fsn_prefix(p_barangay_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT 'FSN-'||COALESCE(NULLIF(pg_catalog.btrim(b.psgc_barangay_code),''),pg_catalog.lpad(b.barangay_id::text,4,'0'))
   FROM public.barangay b WHERE b.barangay_id=p_barangay_id
$$;

-- Named to sort before echims_guard_household_information, so on UPDATE the FSN is already
-- restored to OLD before that trigger compares the row (no false "information changed").
CREATE OR REPLACE FUNCTION public.echims_assign_family_serial_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF TG_OP='UPDATE' THEN
  NEW.family_serial_no:=OLD.family_serial_no; -- read-only
  RETURN NEW;
 END IF;
 INSERT INTO public.household_fsn_counter AS c(barangay_id,last_number) VALUES(NEW.barangay_id,1)
 ON CONFLICT (barangay_id) DO UPDATE SET last_number=c.last_number+1
 RETURNING c.last_number INTO n;
 NEW.family_serial_no:=public.echims_fsn_prefix(NEW.barangay_id)||'-'||pg_catalog.lpad(n::text,4,'0');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.echims_assign_family_serial_no() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.echims_fsn_prefix(bigint) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS echims_assign_family_serial_no ON public.household;

-- Backfill. The household information guard requires a signed-in encoder for any update, so it
-- is paused for this one statement (this transaction only).
ALTER TABLE public.household DISABLE TRIGGER echims_guard_household_information;
-- Numbering continues after any FSN already issued in the barangay, so a re-run never reuses one.
WITH issued AS (
  SELECT barangay_id, max(((pg_catalog.regexp_match(family_serial_no,'-([0-9]+)$'))[1])::integer) AS top
    FROM public.household WHERE family_serial_no IS NOT NULL GROUP BY barangay_id
), numbered AS (
  SELECT h.household_id, h.barangay_id,
         COALESCE(i.top,0) + pg_catalog.row_number() OVER (PARTITION BY h.barangay_id ORDER BY h.household_id) AS n
    FROM public.household h LEFT JOIN issued i ON i.barangay_id=h.barangay_id
   WHERE h.family_serial_no IS NULL
)
UPDATE public.household h
   SET family_serial_no=public.echims_fsn_prefix(x.barangay_id)||'-'||pg_catalog.lpad(x.n::text,4,'0')
  FROM numbered x WHERE x.household_id=h.household_id;
ALTER TABLE public.household ENABLE TRIGGER echims_guard_household_information;

-- Seed each barangay's counter with the highest number issued (not a count: deleted households
-- would make a count too low and the next FSN would collide). Never lowers an existing counter.
INSERT INTO public.household_fsn_counter AS c(barangay_id,last_number)
SELECT barangay_id, max(((pg_catalog.regexp_match(family_serial_no,'-([0-9]+)$'))[1])::integer)
  FROM public.household GROUP BY barangay_id
ON CONFLICT (barangay_id) DO UPDATE SET last_number=GREATEST(c.last_number,EXCLUDED.last_number);

CREATE TRIGGER echims_assign_family_serial_no BEFORE INSERT OR UPDATE ON public.household
 FOR EACH ROW EXECUTE FUNCTION public.echims_assign_family_serial_no();
ALTER TABLE public.household ALTER COLUMN family_serial_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS household_family_serial_no_key ON public.household(family_serial_no);

COMMIT;
