-- CP-REV01 §4 — Medical history picker.
-- The form now stores selections in child_profile_record.medical_history_structured
-- ({ state, condition_codes, other_details, notes }), which the existing
-- echims_validate_structured_medical_history trigger checks against this catalog.
-- The catalog already exists in the live database (empty); CREATE IF NOT EXISTS keeps this
-- migration runnable on a fresh copy. Seeds the starter list of common illnesses for children
-- 0–5 (no adult conditions). TO VALIDATE with the RHU Daet nurse: edit labels, deactivate
-- (is_active = false) or add rows; codes must stay stable once used.
BEGIN;

CREATE TABLE IF NOT EXISTS public.child_medical_condition_catalog (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{1,49}$'),
  label text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(label)) BETWEEN 1 AND 200),
  is_active boolean NOT NULL DEFAULT true,
  approved_reference text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(approved_reference)) BETWEEN 1 AND 1000)
);
ALTER TABLE public.child_medical_condition_catalog ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.child_medical_condition_catalog'::regclass AND polname='child_medical_catalog_read') THEN
    CREATE POLICY child_medical_catalog_read ON public.child_medical_condition_catalog FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.account_status='ACTIVE'));
  END IF;
END $$;
-- Only active administrators maintain the list. Rows are deactivated, never deleted, so saved
-- condition codes keep their labels.
DROP POLICY IF EXISTS child_medical_catalog_admin_insert ON public.child_medical_condition_catalog;
CREATE POLICY child_medical_catalog_admin_insert ON public.child_medical_condition_catalog FOR INSERT TO authenticated
  WITH CHECK (public.is_active_administrator());
DROP POLICY IF EXISTS child_medical_catalog_admin_update ON public.child_medical_condition_catalog;
CREATE POLICY child_medical_catalog_admin_update ON public.child_medical_condition_catalog FOR UPDATE TO authenticated
  USING (public.is_active_administrator()) WITH CHECK (public.is_active_administrator());
GRANT SELECT ON public.child_medical_condition_catalog TO authenticated;
GRANT INSERT, UPDATE ON public.child_medical_condition_catalog TO authenticated;

INSERT INTO public.child_medical_condition_catalog(code,label,approved_reference) VALUES
 ('ASTHMA','Asthma','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('PNEUMONIA','Pneumonia','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('BRONCHIOLITIS','Bronchiolitis','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('ACUTE_GASTROENTERITIS','Acute gastroenteritis / Diarrhea','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('DENGUE','Dengue','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('MEASLES','Measles','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('VARICELLA','Chickenpox (Varicella)','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('HFMD','Hand, foot and mouth disease','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('PRIMARY_COMPLEX_TB','Primary complex / TB','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('OTITIS_MEDIA','Otitis media','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('URINARY_TRACT_INFECTION','Urinary tract infection','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('IMPETIGO_SKIN_INFECTION','Impetigo / Skin infection','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('SCABIES','Scabies','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('ATOPIC_DERMATITIS','Atopic dermatitis / Eczema','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('ALLERGY_FOOD_DRUG','Allergies (food / drug)','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('FEBRILE_SEIZURES','Febrile seizures','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('CONGENITAL_HEART_DISEASE','Congenital heart disease','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('G6PD_DEFICIENCY','G6PD deficiency','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('ANEMIA','Anemia','CP-REV01 starter list — pending RHU Daet nurse validation'),
 ('INTESTINAL_PARASITISM','Intestinal parasitism','CP-REV01 starter list — pending RHU Daet nurse validation')
ON CONFLICT (code) DO NOTHING;

COMMIT;
