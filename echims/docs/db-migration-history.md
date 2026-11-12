# Database migration history: live project vs repo

Live Supabase project: `hjflurqcbxlnmqugttoe` (eCHIMS). Checked 2026-11-12.

The migration history recorded on the live database and the files in `supabase/migrations/` have
drifted apart. **Do not run `supabase db push` or `supabase migration repair` until they are
synced** — `db push` would try to replay the repo-only files (e.g. `001_core_schema.sql`, which
creates tables without `IF NOT EXISTS`) on top of the live schema.

## 1. Recorded on the live project, no file in the repo (18)

These were applied directly to the database (SQL editor / dashboard / MCP). Their SQL is not in
this repo. To sync, pull each one's SQL (e.g. `supabase migration fetch`, or from
`supabase_migrations.schema_migrations.statements`) into a file named `<version>_<name>.sql`.

| Version | Name |
|---|---|
| 20260924064021 | rls_policies_core_reference_tables |
| 20260924064040 | rls_policies_user_identity_tables |
| 20260924064104 | rls_policies_household_child_guardian |
| 20260924064126 | rls_policies_clinical_program_tables |
| 20260924064143 | rls_policies_scheduling_and_inventory |
| 20260924064158 | rls_policies_alerts_sms_sync |
| 20260926065252 | add_household_profiling_fields |
| 20260928230046 | add_get_my_profile_rpc |
| 20260928230109 | fix_get_my_profile_rpc_types_v2 |
| 20260928232108 | enforce_active_account_status_in_role_checks |
| 20260928232152 | revoke_public_default_execute_grants |
| 20260929135047 | create_wra_fp_details_table |
| 20261005111857 | allow_assigned_worker_update_profile_record |
| 20261013001101 | inv_receive_stock |
| 20261013112513 | inventory_unique_item_barangay |
| 20261013195438 | inventory_view_stock |
| 20261105160737 | add_varchar_length_limits |
| 20261105160751 | restore_alert_feed_grants |

## 2. In the repo, not recorded on the live project (8)

Their effects appear to exist on the live database (applied by hand, outside the migration
history), but the history table does not list them. Confirm before marking them applied.

| File | Notes |
|---|---|
| 001_core_schema.sql | Base tables; `CREATE TABLE` without `IF NOT EXISTS` — must never be replayed on live |
| 002_health_records.sql | |
| 003_inventory.sql | |
| 004_alerts.sql | |
| 005_movement_notification.sql | |
| 006_sync.sql | |
| 007_stock_request.sql | |
| 20261015_safe_offline_submission.sql | `echims_submit_child` here is older than live (see §4) |

## 3. In both (CP-REV01, applied 2026-11-12 via the Supabase connector)

Repo files are named with the exact recorded versions, so they already line up.

| Version | Name | What it did |
|---|---|---|
| 20261111181607 | cp_rev01_01_child_sections | child: birth weight/height, mother/father name; `echims_submit_child` saves them |
| 20261111181630 | cp_rev01_02_field_changes | PhilHealth "Unknown" → NULL (2 profile records, 4 values) |
| 20261111181849 | cp_rev01_03_child_id_fsn | `child.child_code`, `household.family_serial_no`, FSN counter, read-only triggers, backfill |
| 20261111181946 | cp_rev01_04_medical_history_catalog | 20 starter illnesses + admin write policies on `child_medical_condition_catalog` |
| 20261111190650 | cp_rev01_05_guardian_mobile | Guardian numbers stored as 09XXXXXXXXX (trigger + backfill, 1 row); `normalize_guardian_mobile` accepts spaces/dashes/10 digits; backup `backup_cp_rev01.guardian_before_mobile` |
| 20261111195843 | cp_rev01_06_bcg_eligibility | `alr_vaccination_schedule_candidates` leaves out BCG after the first birthday (12 reminder candidates removed, nothing else changed); previous definition in `backup_cp_rev01.function_definitions` (reconstructed: the first copy was rolled back with the dry run) |
| 20261111201917 | cp_rev01_07_test_household_coordinates | TEST DATA: all 14 households get a random point inside their own barangay polygon (10 misplaced points moved, 4 filled); backup `backup_cp_rev01.household_before_coords` (reconstructed from the values read before the change) |

Lesson learned: through the Supabase connector a multi-statement query runs as one transaction,
so a backup written in the same query as a `BEGIN … ROLLBACK` dry run is rolled back too. Write
the backup in its own query first.

Backup taken before applying: schema `backup_cp_rev01` (child, household, child_profile_record,
child_medical_condition_catalog, guardian, barangay, household_information_history,
child_profile_informant_history, and the previous `echims_submit_child` definition in
`function_definitions`). Keep until it is agreed it can be dropped.

## 3b. In both (NIP-REV01, applied 2026-11-12 via the Supabase connector)

| Version | Name | What it did |
|---|---|---|
| 20261112102701 | nip_rev01_01_vaccination_revisions | `vaccine.vaccine_type` HEPB → `Hep-B` (1 row); Rotavirus item INACTIVE (1 row, records kept); new items MR Vaccine (vaccine 17) and Paracetamol Drops; `vaccine_companion_item` (Penta → Paracetamol Drops) and `vaccination_record_companion`; `child_vaccination_assist` (BHW-to-assist flag, RLS via child); trigger `nip_block_vaccination_schedule_reject`; `echims_normalize_batch` + canonical-batch CHECKs on 4 tables (0 rows needed normalizing); `msp_review_vaccination_record` also dispenses companion meds |
| 20261112110619 | nip_rev01_02_missed_alert_wording | `run_alert_vaccination_monitoring` writes "Missed vaccination: …" instead of "Vaccination overdue: …" (new alerts only; past alert text is guarded and kept, 102 messages copied to `backup.nip_rev01_alert_messages`) |

Backup taken before applying: schema `backup` tables `nip_rev01_vaccine`, `nip_rev01_item`,
`nip_rev01_batch_numbers` (21 rows), `nip_rev01_functions` (previous review RPC and status guard).

## 4. Live changes with no migration anywhere (dated 2026-11-11 in code comments)

Found on the live database but in neither the history nor any git branch:

- `child_medical_condition_catalog` table + `child_medical_catalog_read` policy (was empty).
- `child_profile_record.medical_history_structured` + trigger `echims_validate_structured_medical_history`.
- `child_profile_record.informant_*` columns + triggers `echims_validate_profile_informant`,
  `echims_audit_profile_informant`, table `child_profile_informant_history`.
- `household.water_source_type`, `toilet_facility_type`, `information_revision`,
  `information_updated_by/_at` + triggers `echims_guard_household_information`,
  `echims_audit_household_information`, table `household_information_history`, function
  `echims_update_household_information`.
- `echims_submit_child` changes: water/toilet saved on the household, education input retired,
  informant and structured history saved (CP-REV01 _01 is built on this version).

These should be captured as migration files (e.g. from `supabase db dump --schema public` diffed
against the repo) so a fresh database can be built from the repo.

## Suggested sync (later, together)

1. `supabase link --project-ref hjflurqcbxlnmqugttoe`, then fetch the 18 live-only migrations into files.
2. Write a baseline migration for §4 from a schema dump.
3. Decide what to do with `001`–`007` and `20261015` (archive them, or mark them applied with
   `supabase migration repair --status applied <version>` once confirmed equivalent).
4. Only then use `supabase db push` for new migrations.
