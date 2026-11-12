# Known issues / backend follow-ups

Issues found during UI review that need a backend or schedule-rule change. Backend work is on
hold, so these are recorded here and not fixed yet.

| # | Found | Area | Issue | Follow-up |
|---|-------|------|-------|-----------|
| 1 | 2026-11-13 (NIP-REV01) | Vaccination › Schedule (missed-dose list from `/api/vaccination/defaulters`) | Some doses past their eligibility window (the NIP age cutoff) still show **"Missed · rescheduled to …"** instead of **Not eligible**. Example: Ashley Baterbonia, Hep-B 1, missed for 1826 days. | Apply the age cutoff from `lib/nip-schedule.ts` (`nipVaccineTimeline`) on the server side, so doses past the cutoff are reported as Not eligible and left out of the missed counts, the "Longest missed" line and reminders. |
