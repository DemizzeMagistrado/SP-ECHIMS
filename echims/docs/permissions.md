# Role permissions (NIP-REV01)

One source of truth: the role → module → actions matrix `rolePermissions` in `lib/echims-data.ts`.
Everything else is derived from it:

| Consumer | Derived how |
|---|---|
| Sidebar (`roleModules`) | Sidebar modules the role can `view` (fixed display order) |
| Page access (`canAccess`, `components/auth/route-gate.tsx`) | Route → guarding module (`ROUTE_MODULES`, most specific prefix wins) → `view`. Pages outside the matrix render as before. |
| Buttons (`canPerform(role, module, action)`) | Direct |
| Auth layer (`lib/auth/permissions.ts` `hasPermission(roleCode, 'vaccination.create')`) | Each permission name maps to one (module, action) of the matrix |
| API routes | `canPerform` (or `lib/auth/route-role.ts` `roleAllowed`) with the role from `get_my_profile` |
| Database | RLS and SECURITY DEFINER functions enforce the same rules, plus barangay / RHU scope |

Role codes ↔ names: `ROLE_NAME` / `ROLE_CODE` / `toUserRole()` in `lib/echims-data.ts`
(Administrator · PHN = Public Health Nurse · RHM = Rural Health Midwife · BHW = Barangay Health
Worker · BNS = Barangay Nutrition Scholar). Self-check: `node --experimental-strip-types scripts/check-permissions.mts`.

Sources: manuscript Use Case Diagram (Fig. 14), DFD, User Stories 4.3.9, and the NIP-REV01 decisions.

## Matrix

V view · C create · E edit · A approve / review / decide · X export · R request. Administrator has every action on every module.

| Module | PHN | RHM | BHW | BNS |
|---|---|---|---|---|
| Dashboard | V | V | V | V |
| User Management (accounts, barangay assignment) | — | — | — | — |
| Child Profiling (children, guardians, households) | V C E X | V C E A | V C E | V |
| Geospatial (Map) | V X | V | V | V |
| Masterlist Upload | V C E | — | — | — |
| Vaccination (records) | V E A X — **no create** | V C E | V C E (own unapproved, RLS) | — |
| Vaccination Schedule (due list, requests, SMS reminders) | V A X | V R | V R | — |
| NIP Catalog / Vaccines tab | V (+ companion medicines, batch format) | V | V | — |
| Vaccine Batch Requests | V A | V C | — | — |
| Nutritional Assessment | V X (monitor) | V E (confirm admissions) | — | V C E X |
| Supplementation | V C X (supply plans, compliance) | V C E | **V C (record administration)** | V C E |
| Inventory (stock) | V C E A X (receive, decide stock requests) | V R (assigned barangays) | — | — |
| Stock Allocation | V C E A | — | — | — |
| Inventory Transactions (usage log) | V X | V C (log usage) | — | — |
| Batch Trace | V | — | — | — |
| Health Activities | V A (review requests) | V C E | V C E (as is, ACT-REV01) | V C E (as is, ACT-REV01) |
| Alerts | V | V | V | V |
| Reports | V C X A (validate) | V C X | V X: **approved** Child / Household / Vaccination / Supplementation reports of own barangay(s), print / download | V X (nutrition) |
| Settings | V E | V E | V E (Profile, Security only) | V E |
| Organization (settings tab) | V | V | — | V |

Administrator only: alert rules, vaccine add / edit / deactivate, account approval, barangay
assignment, Organization edit.

## Mismatches found and how they were resolved

| # | Mismatch | Resolution |
|---|---|---|
| 1 | Two matrices: `echims-data.ts` (UI) and `lib/auth/permissions.ts` (auth layer) listed permissions separately; e.g. permissions.ts still gave PHN `vaccination.create`. | `permissions.ts` now derives every permission from the one matrix; PHN has no `vaccination.create`. |
| 2 | `canAccess` existed but was never used: any page opened by URL regardless of role. | `RouteGate` in the dashboard layout shows "Not available for your role"; `canAccess` resolves the specific module (e.g. `/inventory/batch-requests` → Vaccine Batch Requests, `/masterlist-upload` → Masterlist Upload). |
| 3 | Sidebar list (`roleModules`) was maintained by hand and disagreed with the matrix (PHN had Health Activities in the sidebar but nothing in the matrix; BHW had Inventory in the matrix but not the sidebar). | `roleModules` is derived. Health Activities added for PHN (view, review). |
| 4 | Masterlist Import tab shown to BHW and BNS (API refused them); RHM given access by migration 05. | PHN / Admin only in matrix, API and database (migration 09). |
| 5 | RHM had no Inventory module; `/inventory/batch-requests` was routed through Vaccination. | RHM: Inventory view + request, usage log; tabs Stock Overview, Usage Log, Replenishment, Batch Requests. Allocation and Batch Trace tabs hidden. Batch Requests mapped to its own permission; the extra "Batch requests" shortcut on Vaccination › Records removed. |
| 6 | BHW / BNS had Inventory view in the matrix and the inventory APIs answered any signed-in role. | BHW / BNS removed; `/api/inventory` and `/api/inventory/stock-overview` return 403 without Inventory view. |
| 7 | RLS let a PHN insert vaccination records (FOR ALL policy) though the APIs refuse. | Migration 12 splits the PHN policy into select / update / delete. |
| 8 | PHN matrix said "Inventory Transactions: create" but only the RHM can log usage (`inv_log_usage`). | PHN: view / export. |
| 9 | RHM matrix said "Nutritional Assessment: create" but the API lets only BNS record assessments (the child profile showed a button that failed). | RHM: view / edit (confirm admissions). PHN: view / export (monitor). |
| 10 | BHW had no Supplementation although `msp_record_supplementation` already allows assigned BHW, and panel feedback asks for it. | BHW: Supplementation view + record administration (the existing form with the eligibility check). |
| 11 | BHW Settings showed Organization and Notifications. | Shown only with Organization view (BHW: Profile and Security only). |
| 12 | Unused `SMS` module / `/sms` route in the matrix. | Removed. SMS reminders are actions on Vaccination › Schedule; history in Alerts. |

| 13 | BHW Reports in the matrix, but the database refused BHW (`list_generated_reports`), so the page errored. | Decision (manuscript "View Approved Reports", barangay-level for BHWs): migration 13. BHW sees VALIDATED reports for modules CHILD, HOUSEHOLD, VACCINATION, SUPPLEMENTATION whose barangays are all theirs; open and print / download. No preview / generate / save / validate, no nutrition or inventory, no other barangays. The Reports page shows only "Approved Reports" for BHW (no Report Preview tab) and "No approved reports for your barangay yet" when empty. RHM, BNS, PHN, Admin unchanged (same totals and report IDs before and after). |

### Still open

| # | Item | Needed |
|---|---|---|
| B | Supplementation "create" covers both recording an administration and registering a supply plan at module level; the API separates them (`record` for RHM/BHW/BNS, `stock` / plans for PHN/RHM). | None for now; noted so the matrix is not read as "PHN records administrations". |

## Manuscript parts to update (BHW Supplementation)

- **Use Case Diagram (Fig. 14):** add the BHW → "Record supplementation administration" use case
  (and "View supplementation history"), like the existing RHM / BNS links.
- **DFD:** add the data flow from BHW to the Supplementation process (administration record, with
  the eligibility check) and from the process to the supplementation records store.
- **User Stories 4.3.9:** add "As a BHW, I want to record a child's supplementation (with an
  eligibility check) so that doses given during home visits are captured."
- Also reflect: PHN does not record vaccinations; RHM has Inventory (view assigned barangays, log
  usage, request stock / batches); masterlist upload is PHN / Administrator only.
