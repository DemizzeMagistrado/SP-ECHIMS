-- CP-REV01 §2 — Field changes.
-- 1. Educational attainment is no longer collected or shown. The column stays for old data.
--    (The live echims_submit_child already stopped writing it on 2026-11-11.)
-- 2. PhilHealth "Unknown" is no longer an option (membership: Member, Dependent, N/A,
--    No PhilHealth, Other; category: Direct, Indirect, Other).
--    MIGRATION NOTE: existing "Unknown" membership/category values are cleared to NULL, which the
--    app shows as "Not recorded — needs review" so health workers re-ask at the next visit.
--    At the time of writing this affects 2 membership and 2 category values.
BEGIN;

UPDATE public.child_profile_record SET philhealth_membership_type = NULL WHERE philhealth_membership_type = 'Unknown';
UPDATE public.child_profile_record SET philhealth_category = NULL WHERE philhealth_category = 'Unknown';

COMMIT;
