# Data dictionary — CP-REV01 (Child Profiling revisions)

Covers every table and column added or changed by CP-REV01 migrations `_01`–`_05`
(`supabase/migrations/20261111181607` … `20261111190650`), fields the app no longer collects, and
changed option lists. Types and constraints are as on the live database (`hjflurqcbxlnmqugttoe`,
checked 2026-11-12). Schema: `public`.

## 1. New and changed columns

### child

| Field | Data type | Constraints | Description |
|---|---|---|---|
| `child_code` | text | NOT NULL; UNIQUE (`child_child_code_key`); set by trigger `echims_assign_child_code` on insert; read-only (updates keep the old value) | **Child ID**: `ECH-<registration year>-<child_id, 6 digits>`, e.g. `ECH-2026-000027`. Backfilled for existing children. Searchable in the children list. |
| `birth_weight_kg` | numeric(4,2) | NULL; CHECK 0.3–7 (`chk_child_birth_weight`) | Birth weight in kilograms (DOH Child Immunization Record: "Birth weight"). |
| `birth_height_cm` | numeric(4,1) | NULL; CHECK 20–70 (`chk_child_birth_height`) | Birth height/length in centimeters (DOH card: "Birth height"). |
| `mother_name` | text | NULL; length ≤ 200 (`chk_child_parent_names`) | Mother's full name (DOH card: "Mother's name"). Guardian Information section. |
| `father_name` | text | NULL; length ≤ 200 (`chk_child_parent_names`) | Father's full name (DOH card: "Father's name"). Guardian Information section. |

### household

| Field | Data type | Constraints | Description |
|---|---|---|---|
| `family_serial_no` | text | NOT NULL; UNIQUE (`household_family_serial_no_key`); set by trigger `echims_assign_family_serial_no` on insert; read-only | **Family Serial Number (FSN)**: `FSN-<barangay PSGC code>-<4-digit number per barangay>`, e.g. `FSN-0501603001-0004`. Shared by all children in the household (siblings). The "Family no." on the DOH Child Immunization Record card. Backfilled per barangay in `household_id` order. |
| `water_source_type` | text | NULL; ≤ 200 chars (guard trigger); changes audited in `household_information_history` | Household water source. Now the place the app reads/writes it (online and offline); the profile copy is a fallback for older records. *(Column predates CP-REV01; usage changed.)* |
| `toilet_facility_type` | text | NULL; ≤ 200 chars; audited | Household toilet facility. Same as above. |
| `information_revision` | integer | NOT NULL, default 0; maintained by `echims_guard_household_information` | Incremented on every water/toilet change; the app sends the revision it loaded so a concurrent edit is rejected instead of overwritten. *(Predates CP-REV01; now used by the app.)* |

### household_fsn_counter *(new table)*

| Field | Data type | Constraints | Description |
|---|---|---|---|
| `barangay_id` | bigint | PRIMARY KEY; FK → `barangay.barangay_id` ON DELETE CASCADE | Barangay the counter belongs to. |
| `last_number` | integer | NOT NULL; CHECK ≥ 0 | Last FSN number issued in the barangay. Seeded from the highest existing FSN; only the FSN trigger (SECURITY DEFINER) writes it. RLS on, no policies, no grants to `anon`/`authenticated`. |

### child_medical_condition_catalog *(existing table, first populated by CP-REV01)*

| Field | Data type | Constraints | Description |
|---|---|---|---|
| `code` | text | PRIMARY KEY; CHECK `^[A-Z][A-Z0-9_]{1,49}$` | Stable condition code stored in `medical_history_structured.condition_codes` (e.g. `ASTHMA`). Never change once used. |
| `label` | text | NOT NULL; 1–200 chars | Name shown in the medical history picker. |
| `is_active` | boolean | NOT NULL, default true | Inactive conditions are hidden from the picker but keep their label for saved records. |
| `approved_reference` | text | NOT NULL; 1–1000 chars | Source/approval note. Starter rows: "CP-REV01 starter list — pending RHU Daet nurse validation". |

RLS: read for active users (`child_medical_catalog_read`); insert/update for active administrators
(`child_medical_catalog_admin_insert`, `child_medical_catalog_admin_update`). 20 starter rows:
Asthma, Pneumonia, Bronchiolitis, Acute gastroenteritis / Diarrhea, Dengue, Measles,
Chickenpox (Varicella), Hand, foot and mouth disease, Primary complex / TB, Otitis media,
Urinary tract infection, Impetigo / Skin infection, Scabies, Atopic dermatitis / Eczema,
Allergies (food / drug), Febrile seizures, Congenital heart disease, G6PD deficiency, Anemia,
Intestinal parasitism.

### child_profile_record

| Field | Data type | Constraints | Description |
|---|---|---|---|
| `medical_history_structured` | jsonb | NULL; validated by `echims_validate_structured_medical_history` | `{ state: REPORTED \| NONE_REPORTED \| UNKNOWN, condition_codes: [catalog codes], other_details: "x; y" \| null, notes: text \| null }`. Written by the medical history picker (online and offline). *(Column predates CP-REV01; now used.)* |
| `medical_history` | text | NULL | Readable text of the above (labels; Other; notes), kept for reports. |
| `informant_name` | text | NULL; ≤ 200 chars, set together with relationship (trigger) | Parent/guardian who gave the guardian and household details ("Information provided by"). *(Predates CP-REV01; now collected.)* |
| `informant_relationship` | text | NULL; ≤ 100 chars | Informant's relationship to the child. |
| `philhealth_membership_type` | varchar(50) | NULL | Option list changed (see §3). "Unknown" values were cleared to NULL (shown as "Not recorded — needs review"). |
| `philhealth_category` | varchar(50) | NULL | Option list changed (see §3). Cleared when membership is N/A or No PhilHealth. |
| `philhealth_id_number` | varchar(20) | NULL | Hidden and cleared when membership is N/A or No PhilHealth. |
| `water_source_type`, `toilet_facility_type` | varchar | NULL | No longer written by the app (now on `household`); kept and read as a fallback for older records. |

### guardian

| Field | Data type | Constraints | Description |
|---|---|---|---|
| `contact_number` | varchar(15) | NULL; normalized by trigger `echims_guardian_canonical_mobile` on insert/update | Stored as `09XXXXXXXXX`. Any common input format is accepted (09…, 9…, 639…, +639…, with spaces/dashes). SMS functions convert it to the gateway format `639XXXXXXXXX` with `normalize_guardian_mobile`. Existing numbers normalized by `_05` (1 of 14 changed). |

## 2. Fields no longer collected (columns kept for old data)

| Table.Field | Data type | Status |
|---|---|---|
| `child_profile_record.educational_attainment` | varchar(150) | Removed from form, profile, reports and exports; online and offline saves write NULL. |
| `child_profile_record.civil_status` | varchar(30) | Removed from form and profile (children are 0–59 months). Not written by the app; no report reads it. |
| Medical history checkboxes (hypertension, diabetes mellitus, tuberculosis) | — (form only) | Replaced by the catalog picker; adult conditions excluded. Old offline drafts carry them over as "Other" entries. |

## 3. Changed option lists

| Field | Before | After |
|---|---|---|
| PhilHealth membership type | Member, Dependent, Unknown, Other | Member, Dependent, **N/A**, **No PhilHealth**, Other (selectable chips). N/A / No PhilHealth hide the PhilHealth ID and category. |
| PhilHealth category | Direct Contributors, Indirect Contributors, Unknown, Other | Direct Contributors, Indirect Contributors, Other |
| Guardian contact number format | 09…, 639… or +639… accepted as typed | Any common format accepted; stored as 09XXXXXXXXX; shown as 0997 987 5431 |

## 4. New functions and triggers

| Object | Type | Purpose |
|---|---|---|
| `echims_assign_child_code()` | trigger fn, BEFORE INSERT OR UPDATE ON child | Generates `child_code`; keeps it read-only. |
| `echims_assign_family_serial_no()` | trigger fn (SECURITY DEFINER), BEFORE INSERT OR UPDATE ON household | Issues the next FSN per barangay from `household_fsn_counter`; keeps it read-only. |
| `echims_fsn_prefix(bigint)` | function (SECURITY DEFINER, no client grants) | `FSN-<PSGC code>` for a barangay. |
| `echims_canonical_guardian_mobile(text)` | function | Any PH mobile format → `09XXXXXXXXX` or NULL. |
| `echims_guardian_canonical_mobile()` | trigger fn, BEFORE INSERT OR UPDATE OF contact_number ON guardian | Stores numbers canonically; runs before the SMS-consent reset so a format-only change keeps consent. |
| `normalize_guardian_mobile(text)` | function (changed) | SMS gateway format; now also accepts separators and 10-digit numbers (unchanged results for previously valid input). |
| `echims_submit_child(uuid, jsonb)` | function (changed) | Offline upload also saves birth weight/height and mother/father name. |

## 5. ERD changes

### New entity

| Entity | Attributes | Relationships |
|---|---|---|
| **HOUSEHOLD_FSN_COUNTER** | barangay_id (PK, FK), last_number | BARANGAY 1 — 0..1 HOUSEHOLD_FSN_COUNTER (one counter per barangay that has households) |

### Entity populated for the first time

| Entity | Attributes | Relationships |
|---|---|---|
| **CHILD_MEDICAL_CONDITION_CATALOG** | code (PK), label, is_active, approved_reference | Referenced (logically, via codes in `child_profile_record.medical_history_structured.condition_codes`, validated by trigger) by CHILD_PROFILE_RECORD: 0..* conditions per profile record. Not a foreign key (jsonb array). |

### New attributes on existing entities

| Entity | New attributes |
|---|---|
| CHILD | child_code (unique, alternate key), birth_weight_kg, birth_height_cm, mother_name, father_name |
| HOUSEHOLD | family_serial_no (unique, alternate key) |

### Relationships (unchanged keys, clarified meaning)

| Relationship | Cardinality | Note |
|---|---|---|
| HOUSEHOLD — CHILD | 1 — 0..* | Siblings share the household and therefore its FSN. |
| BARANGAY — HOUSEHOLD | 1 — 0..* | FSN numbering is per barangay. |
| GUARDIAN — CHILD | 1 — 0..* | Guardian contact number is stored canonically; mother/father names are on CHILD, the present guardian on GUARDIAN. |
| CHILD — CHILD_PROFILE_RECORD | 1 — 0..* | Holds informant, PhilHealth and structured medical history; water/toilet moved to HOUSEHOLD. |
