# Known issues / backend follow-ups

Issues found during UI review that need a backend or schedule-rule change. Backend work is on
hold, so these are recorded here and not fixed yet.

| # | Found | Area | Issue | Follow-up |
|---|-------|------|-------|-----------|
| 1 | 2026-11-13 (NIP-REV01) | Vaccination › Schedule (missed-dose list from `/api/vaccination/defaulters`) | Some doses past their eligibility window (the NIP age cutoff) still show **"Missed · rescheduled to …"** instead of **Not eligible**. Example: Ashley Baterbonia, Hep-B 1, missed for 1826 days. | Apply the age cutoff from `lib/nip-schedule.ts` (`nipVaccineTimeline`) on the server side, so doses past the cutoff are reported as Not eligible and left out of the missed counts, the "Longest missed" line and reminders. |
| 2 | 2026-11-13 (NIP-REV01) | Child Profiling › Children list, FSN / Household column | John Doe (ECH-2026-000028, child_id 28) shows "—". This is a data issue, not a list mapping bug: in the live database the child has **no household linked** (`child.household_id` is null), so there is no FSN to show. The list and the profile both read `household.family_serial_no` through `/api/children`. If the profile shows an FSN for him, it is not coming from his household record (check for a cached offline copy or a guardian-side value). | Link the child to the right household (data fix), or decide whether an FSN should be derived from the guardian's household when the child has none. |
