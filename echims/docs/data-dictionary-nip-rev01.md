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

### vaccination_record (migration 07, pending)

| Column | Change |
|---|---|
| `status` | Allowed values `PENDING`, `APPROVED`, `NEEDS_CORRECTION` (was `REJECTED`; no permanent rejection). Changes only through `msp_review_vaccination_record` / `echims_resubmit_vaccination_record` (guard trigger). New rows start `PENDING`; past records (`is_prior`) may be inserted `APPROVED`. |
| `review_remarks` | The PHN's note while the record needs correction; cleared on resubmission (kept in the history table). |
| `revision` *(new, migration 08, pending)* | integer ≥ 1, default 1; +1 on every update. Saves send the revision they loaded; an older one gets a 409 and the Keep mine / Keep saved screen. |

### vaccination_record_review_event *(new table, migration 07, pending)*

| Column | Type | Meaning |
|---|---|---|
| `event_id` | bigint identity PK | |
| `vaccination_record_id` | bigint FK → vaccination_record (cascade) | |
| `action` | text | `RETURNED`, `RESUBMITTED`, `APPROVED`, `MIGRATED` (an old REJECTED record moved to NEEDS_CORRECTION) |
| `from_status` / `to_status` | text | Status before / after |
| `note` | text ≤ 2000 | PHN note on return; recorder's note on resubmission |
| `actor_id` | uuid FK → users | Who did it |
| `created_at` | timestamptz | |

RLS: readable by whoever can read the record; written only by the two functions.

## 2. New and changed functions and policies

| Object | Type | Migration | Purpose |
|---|---|---|---|
| `mlu_allowed_barangay_ids()` | function (SECURITY DEFINER, `authenticated` only) | 05 | Barangays the user may import a masterlist into: NULL (any) for Admin/PHN, the active assignments for RHM, none for others. |
| `mlu_batch_insert` | RLS policy on `masterlist_upload_batch` (changed) | 05 | Admin, PHN and now RHM (active accounts) can create their own upload batch. |
| `mlu_import_batch(bigint)` | function (changed) | 05 | RHM may import; rows outside the uploader's allowed barangays become ERROR ("Barangay is not assigned to you"). |
| `msp_review_vaccination_record(bigint, text, text)` | function (changed) | 07 | `RETURN` (alias `REJECT`) with a required note → NEEDS_CORRECTION, history row, alert `NIP_RECORD_NEEDS_CORRECTION` to the recorder; `APPROVE` also writes a history row. |
| `echims_resubmit_vaccination_record(bigint, text)` | function (new) | 07 | Recorder (still assigned) or the RHU's PHN / Admin: NEEDS_CORRECTION → PENDING, history row, alert `NIP_RECORD_RESUBMITTED` to the RHU's PHNs. |
| `echims_guard_vaccination_record_status()` | trigger fn (new) | 07 | Blocks direct status / approval changes outside the two functions. |
| `echims_bump_vaccination_record_revision()` | trigger fn (new) | 08 | Raises `vaccination_record.revision` on every update. |
| `alr_vaccination_schedule_candidates(date)` | function (changed) | 06 | Missed-dose candidates for alerts and SMS reminders now skip doses past `vaccine.max_age_days` (was a hard-coded BCG rule). |
