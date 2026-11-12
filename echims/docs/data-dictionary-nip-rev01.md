# Data dictionary — NIP-REV01 (Vaccination revisions, backend round)

Tables, columns and functions added or changed by NIP-REV01 backend migrations (`_05` onwards,
`supabase/migrations/20261112184054…`). Types and constraints as on the live database
(`hjflurqcbxlnmqugttoe`). Schema: `public`. Earlier NIP-REV01 migrations `_01`–`_04` are described
in `db-migration-history.md` §3.

## 1. New and changed columns

### vaccine (migration 06)

| Column | Type | Null | Rule | Meaning |
|---|---|---|---|---|
| `max_age_days` | integer | yes | 1–3650 | Eligibility window. From this age (days from birth) a dose not yet given is **Not eligible**, not Missed; not counted in missed totals, Defaulters, dashboard or alerts. NULL = no age limit. Editable in Vaccination › Vaccines (Admin). |
| `min_interval_days` | integer | yes | 1–730 | Shortest gap after the previous dose when a missed dose is rescheduled. NULL = the vaccine's interval, else 28 days. |

Values set by migration 06 (DOH NIP): BCG 365 · Hep-B (birth dose) 14 · Pentavalent, OPV, IPV,
PCV13, MMR 1826 (under 5 years) · Rotavirus 240 · MR (campaign) none. `min_interval_days` 28 for
the multi-dose vaccines.

## 2. New and changed functions and policies

| Object | Type | Migration | Purpose |
|---|---|---|---|
| `mlu_allowed_barangay_ids()` | function (SECURITY DEFINER, `authenticated` only) | 05 | Barangays the user may import a masterlist into: NULL (any) for Admin/PHN, the active assignments for RHM, none for others. |
| `mlu_batch_insert` | RLS policy on `masterlist_upload_batch` (changed) | 05 | Admin, PHN and now RHM (active accounts) can create their own upload batch. |
| `mlu_import_batch(bigint)` | function (changed) | 05 | RHM may import; rows outside the uploader's allowed barangays become ERROR ("Barangay is not assigned to you"). |
| `alr_vaccination_schedule_candidates(date)` | function (changed) | 06 | Missed-dose candidates for alerts and SMS reminders now skip doses past `vaccine.max_age_days` (was a hard-coded BCG rule). |
