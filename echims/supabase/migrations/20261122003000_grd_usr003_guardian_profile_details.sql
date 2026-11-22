BEGIN;

CREATE OR REPLACE FUNCTION public.echims_guardian_profile_details(p_child_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_child_summary jsonb;
  v_details jsonb;
BEGIN
  -- Reuse the verified guardian/child relationship check for all data below.
  v_child_summary := public.echims_guardian_child(p_child_id);

  SELECT jsonb_build_object(
    'child', v_child_summary,
    'profileDetails', jsonb_build_object(
      'child', jsonb_build_object(
        'child_id', c.child_id,
        'first_name', c.first_name,
        'middle_name', c.middle_name,
        'last_name', c.last_name,
        'date_of_birth', c.date_of_birth,
        'sex', c.sex,
        'birth_place', c.birth_place,
        'address', c.address,
        'registration_date', c.registration_date,
        'status', c.status,
        'household_id', c.household_id,
        'barangay_id', c.barangay_id,
        'guardian_id', c.guardian_id,
        'birth_weight_kg', c.birth_weight_kg,
        'birth_height_cm', to_jsonb(c)->'birth_height_cm',
        'birth_length_cm', to_jsonb(c)->'birth_length_cm',
        'mother_name', c.mother_name,
        'father_name', c.father_name,
        'child_code', c.child_code
      ),
      'guardian', CASE WHEN g.guardian_id IS NOT NULL THEN jsonb_build_object(
        'guardian_id', g.guardian_id,
        'first_name', g.first_name,
        'middle_name', g.middle_name,
        'last_name', g.last_name,
        'contact_number', g.contact_number,
        'address', g.address,
        'relationship_to_child', g.relationship_to_child
      ) END,
      'profile', CASE WHEN p.profile_record_id IS NOT NULL THEN jsonb_build_object(
        'profile_record_id', p.profile_record_id,
        'profiling_date', p.profiling_date,
        'relationship_to_household_head', p.relationship_to_household_head,
        'religion', p.religion,
        'ethnicity', p.ethnicity,
        'philhealth_id_number', p.philhealth_id_number,
        'philhealth_membership_type', p.philhealth_membership_type,
        'philhealth_category', p.philhealth_category,
        'medical_history', p.medical_history,
        'water_source_type', p.water_source_type,
        'toilet_facility_type', p.toilet_facility_type,
        'informant_name', p.informant_name,
        'informant_relationship', p.informant_relationship,
        'medical_history_structured', p.medical_history_structured
      ) END,
      'barangay', CASE WHEN b.barangay_id IS NOT NULL THEN jsonb_build_object(
        'barangay_id', b.barangay_id,
        'barangay_name', b.barangay_name,
        'municipality', b.municipality,
        'province', b.province,
        'rhu_id', b.rhu_id
      ) END,
      'household', CASE WHEN h.household_id IS NOT NULL THEN jsonb_build_object(
        'household_id', h.household_id,
        'household_no', h.household_no,
        'family_serial_no', h.family_serial_no,
        'household_address', h.household_address,
        'purok', h.purok,
        'is_4ps_member', h.is_4ps_member,
        'water_source_type', h.water_source_type,
        'toilet_facility_type', h.toilet_facility_type
      ) END,
      'rhu', CASE WHEN r.rhu_id IS NOT NULL THEN jsonb_build_object(
        'rhu_id', r.rhu_id,
        'rhu_name', r.rhu_name
      ) END,
      'monitoringStatus', CASE WHEN n.assessment_id IS NOT NULL
        THEN coalesce(n.nutritional_status::text, 'Needs Review')
        ELSE 'Not Yet Assessed'
      END
    ),
    'latestNutrition', CASE WHEN n.assessment_id IS NOT NULL THEN jsonb_build_object(
        'assessment_id', n.assessment_id,
        'assessment_date', n.assessment_date,
        'weight', n.weight,
        'height', n.height,
        'muac', n.muac,
        'weight_for_age', n.weight_for_age,
        'height_for_age', n.height_for_age,
        'weight_for_height', n.weight_for_height,
        'nutritional_status', n.nutritional_status,
        'remarks', n.remarks,
        'is_at_risk', n.is_at_risk,
        'bmi_for_age', n.bmi_for_age,
        'muac_status', n.muac_status,
        'evaluation_status', n.evaluation_status
      ) END,
    'medicalConditions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', m.code, 'label', m.label) ORDER BY m.label), '[]'::jsonb)
      FROM public.child_medical_condition_catalog m
      WHERE m.is_active AND (p.medical_history_structured->'condition_codes') ? m.code
    ),
    'householdChildren', (
      SELECT coalesce(jsonb_agg(echims_guardian_private.child_summary(sibling)
        ORDER BY sibling.date_of_birth, sibling.child_id), '[]'::jsonb)
      FROM public.child sibling
      WHERE sibling.household_id = c.household_id
        AND sibling.guardian_id = c.guardian_id
        AND sibling.child_id <> c.child_id
    )
  ) INTO v_details
  FROM public.child c
  LEFT JOIN public.guardian g ON g.guardian_id = c.guardian_id
  LEFT JOIN public.household h ON h.household_id = c.household_id
  LEFT JOIN public.barangay b ON b.barangay_id = c.barangay_id
  LEFT JOIN public.rhu r ON r.rhu_id = b.rhu_id
  LEFT JOIN LATERAL (
    SELECT profile.*
    FROM public.child_profile_record profile
    WHERE profile.child_id = c.child_id
    ORDER BY profile.profiling_date DESC NULLS LAST, profile.profile_record_id DESC
    LIMIT 1
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT assessment.*
    FROM public.nutritional_assessment assessment
    WHERE assessment.child_id = c.child_id
    ORDER BY assessment.assessment_date DESC NULLS LAST, assessment.assessment_id DESC
    LIMIT 1
  ) n ON true
  WHERE c.child_id = p_child_id;

  RETURN v_details;
END;
$$;

REVOKE ALL ON FUNCTION public.echims_guardian_profile_details(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.echims_guardian_profile_details(bigint) TO authenticated;

COMMIT;
