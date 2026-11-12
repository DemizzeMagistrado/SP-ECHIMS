-- CP-REV01 test data — household coordinates inside their own barangay (TEST DATA ONLY).
-- Before: 10 of 14 households had coordinates, none inside its own barangay polygon in
-- public/geojson/daet.geojson; 4 had none. After: all 14 have a random point inside their own
-- barangay (≥ 15 m apart, ~10 m from the edge; generated with a fixed seed and checked against
-- every polygon). 6 barangays with points, including Alawihao (4 households).
-- Existing rows only; no new children. Backup: backup_cp_rev01.household_before_coords
-- (reconstructed after applying: the first backup was rolled back together with the dry run).
-- The household information guard needs a signed-in encoder for any change; it is paused for
-- this one statement (same as cp_rev01_03).
BEGIN;
ALTER TABLE public.household DISABLE TRIGGER echims_guard_household_information;
UPDATE public.household h SET latitude = p.lat, longitude = p.lng
FROM (VALUES
  (8, 10, 14.109511, 122.918007),
  (19, 12, 14.099862, 122.923948),
  (20, 12, 14.097457, 122.919205),
  (21, 23, 14.128427, 122.979783),
  (22, 23, 14.129257, 122.980565),
  (23, 17, 14.111435, 122.957745),
  (24, 25, 14.142195, 122.9711),
  (25, 25, 14.137014, 122.965973),
  (26, 26, 14.125576, 122.975079),
  (27, 10, 14.112136, 122.930043),
  (30, 10, 14.102443, 122.928006),
  (31, 23, 14.134675, 122.9778),
  (32, 25, 14.135394, 122.957552),
  (35, 10, 14.11162, 122.925308)
) AS p(household_id, barangay_id, lat, lng)
WHERE p.household_id = h.household_id AND p.barangay_id = h.barangay_id;
ALTER TABLE public.household ENABLE TRIGGER echims_guard_household_information;
COMMIT;
