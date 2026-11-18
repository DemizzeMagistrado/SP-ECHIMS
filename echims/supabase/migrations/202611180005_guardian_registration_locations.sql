BEGIN;
-- Public geographic reference names only. No guardian, child, staff or household data.
CREATE OR REPLACE FUNCTION public.echims_guardian_registration_locations(p_level text,p_parent text DEFAULT NULL)
RETURNS TABLE(code text,name text) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_level IS NULL OR p_level NOT IN ('regions','provinces','cities','barangays')
 OR (p_level<>'regions' AND (p_parent IS NULL OR p_parent !~ '^[0-9]{10}$')) THEN
   RAISE EXCEPTION 'Choose a valid location level and parent.' USING ERRCODE='22023';
 END IF;
 RETURN QUERY SELECT p.psgc_code::text,p.name::text FROM public.psgc_location p
 WHERE CASE p_level
 WHEN 'regions' THEN p.geographic_level='REGION'
 WHEN 'provinces' THEN p.geographic_level='PROVINCE' AND p.region_code=p_parent
 WHEN 'cities' THEN p.geographic_level IN ('CITY','MUNICIPALITY','SUBMUNICIPALITY') AND
   CASE WHEN p_parent ~ '^[0-9]{2}00000000$' THEN p.region_code=p_parent AND p.province_code IS NULL
        ELSE p.province_code=p_parent END
 WHEN 'barangays' THEN p.geographic_level='BARANGAY' AND p.city_municipality_code=p_parent
 ELSE false END ORDER BY p.name,p.psgc_code LIMIT 2000;
END; $$;
REVOKE ALL ON FUNCTION public.echims_guardian_registration_locations(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echims_guardian_registration_locations(text,text) TO anon,authenticated;
COMMIT;
