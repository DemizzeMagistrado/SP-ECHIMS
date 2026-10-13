import { reportScopeLabel } from "@/lib/reports/report-scope-label";
import type { ReportRow } from "@/lib/reports/report-utils";
import {
  members,
  uniqueGuardians,
  householdCounts,
  householdAttributes,
  displayName,
  value,
  fourPs,
  bands,
  type Member,
} from "@/lib/reports/profiling-report-utils";
type Snapshot = {
  module: string;
  start: string;
  end: string;
  rows: ReportRow[];
  location?: {
    barangay_name: string;
    municipality: string;
    province: string;
  }[];
};
type Meta = {
  title: string;
  generatedBy: string;
  generatedAt: string;
  validatedBy?: string | null;
  validatedAt?: string | null;
  status?: string;
  version?: number;
};
const th = "border border-slate-300 px-2 py-2 text-left text-xs",
  td = "border border-slate-300 px-2 py-2 text-xs";
function date(v: string | null | undefined) {
  return v
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "—";
}
function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { category: string; group: string }[];
}) {
  const names = [...new Set(rows.map((r) => r.category))].sort();
  return (
    <table className="w-full border-collapse">
      <caption className="border border-slate-300 bg-sky-100 p-2 text-left text-sm font-semibold">
        {title}
      </caption>
      <thead className="bg-sky-50">
        <tr>
          {["Classification", "4Ps", "Non-4Ps", "Unknown", "Total"].map((h) => (
            <th key={h} className={th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {names.map((n) => (
          <tr key={n}>
            <td className={td}>{n}</td>
            {["4Ps", "Non-4Ps", "Unknown"].map((g) => (
              <td key={g} className={td}>
                {rows.filter((r) => r.category === n && r.group === g).length}
              </td>
            ))}
            <td className={td}>
              {rows.filter((r) => r.category === n).length}
            </td>
          </tr>
        ))}
        {!names.length && (
          <tr>
            <td className={td} colSpan={5}>
              No registered-child household data.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
function guardian(m: Member) {
  const name = displayName(m.guardian);
  return name === "Not recorded" ? "Not recorded" : name;
}
export function ProfilingReportFormat({
  exportSection,
  exportMode,
  snapshot,
  meta,
}: {
  exportSection: string;
  exportMode?: string;
  snapshot: Snapshot;
  meta: Meta;
}) {
  const tab = exportSection,
    setTab = (_value: unknown) => {};
  const mode = exportMode,
    setMode = (_value: unknown) => {};
  const list = members(snapshot.module, snapshot.rows),
    h = householdCounts(list);
  const known = list.filter(
    (m) =>
      m.child.age_months !== null &&
      m.child.age_months !== undefined &&
      Number.isFinite(Number(m.child.age_months)) &&
      Number(m.child.age_months) >= 0 &&
      Number(m.child.age_months) < 60,
  );
  const profileGroups = (field: string) =>
    list.map((m) => ({
      category: value(m.profile[field]),
      group: fourPs(m.household),
    }));
  return (
    <div className="space-y-4">
      <nav
        aria-label="Profiling report sections"
        className="profile-no-print flex flex-wrap gap-2 rounded-lg border bg-white p-3"
      >
        {[
          ["SUMMARY", "Overview"],
          [
            "REGISTER",
            snapshot.module === "CHILD"
              ? "Child Profile Register"
              : "Household and Child Register",
          ],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={tab === key}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${tab === key ? "border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-200" : "border-transparent text-slate-600 hover:bg-sky-50 hover:text-sky-800"}`}
            onClick={() => setTab(key as "SUMMARY" | "REGISTER")}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-2 text-sm text-white transition-colors hover:bg-primary/90"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </nav>
      <div className="profile-report-output space-y-4">
        <header className="rounded-lg border bg-white p-4">
          <h2 className="text-center text-lg font-bold">{meta.title}</h2>
          <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            <p>
              Reporting period: {snapshot.start} to {snapshot.end}
            </p>
            <p>
              Report: {meta.status ?? "LIVE PREVIEW — NOT SAVED"}
              {meta.version ? " · Version " + meta.version : ""}
            </p>
            <p className="text-xs">{reportScopeLabel(snapshot.location)}</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Registered children aged0–59 months and linked guardians only.
            Household adult members, pregnancy and family-planning sections are
            outside this report.
          </p>
        </header>
        {tab === "SUMMARY" ? (
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h3 className="text-center font-bold">
              {snapshot.module === "CHILD"
                ? "CHILD PROFILE SUMMARY"
                : "HOUSEHOLD PROFILE SUMMARY — REGISTERED CHILDREN"}
            </h3>
            <table className="w-full border-collapse">
              <thead className="bg-sky-100">
                <tr>
                  {["Summary", "4Ps", "Non-4Ps", "Unknown", "Total"].map(
                    (c) => (
                      <th key={c} className={th}>
                        {c}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={td}>Linked households</td>
                  <td className={td}>{h.fourPs}</td>
                  <td className={td}>{h.nonFourPs}</td>
                  <td className={td}>{h.unknown}</td>
                  <td className={td}>{h.total}</td>
                </tr>
                <tr>
                  <td className={td}>Registered children</td>
                  {["4Ps", "Non-4Ps", "Unknown"].map((g) => (
                    <td key={g} className={td}>
                      {list.filter((m) => fourPs(m.household) === g).length}
                    </td>
                  ))}
                  <td className={td}>{list.length}</td>
                </tr>
              </tbody>
            </table>
            <div className="grid gap-3 sm:grid-cols-3">
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Unique linked guardians:{" "}
                <strong>{uniqueGuardians(list)}</strong>
              </p>
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Children without guardian link:{" "}
                <strong>
                  {
                    list.filter(
                      (m) =>
                        m.guardian.guardian_id == null &&
                        m.child.guardian_id == null,
                    ).length
                  }
                </strong>
              </p>
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Profile details not recorded:{" "}
                <strong>
                  {
                    list.filter((m) => m.profile.profile_record_id == null)
                      .length
                  }
                </strong>
              </p>
            </div>
            <table className="w-full border-collapse">
              <caption className="border bg-sky-100 p-2 text-left text-sm font-semibold">
                Age group and sex — registered children
              </caption>
              <thead className="bg-sky-50">
                <tr>
                  {["Age group", "Male", "Female", "Unknown sex", "Total"].map(
                    (c) => (
                      <th key={c} className={th}>
                        {c}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => {
                  const rows = known.filter(
                    (m) =>
                      Number(m.child.age_months) >= b.min &&
                      Number(m.child.age_months) <= b.max,
                  );
                  return (
                    <tr key={b.label}>
                      <td className={td}>{b.label}</td>
                      <td className={td}>
                        {rows.filter((m) => m.child.sex === "MALE").length}
                      </td>
                      <td className={td}>
                        {rows.filter((m) => m.child.sex === "FEMALE").length}
                      </td>
                      <td className={td}>
                        {
                          rows.filter(
                            (m) =>
                              !["MALE", "FEMALE"].includes(String(m.child.sex)),
                          ).length
                        }
                      </td>
                      <td className={td}>{rows.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Breakdown
                title="Water source — unique linked households"
                rows={householdAttributes(list, "water_source_type")}
              />
              <Breakdown
                title="Toilet facility — unique linked households"
                rows={householdAttributes(list, "toilet_facility_type")}
              />
              <Breakdown
                title="Ethnicity — children"
                rows={profileGroups("ethnicity")}
              />
              <Breakdown
                title="Religion — children"
                rows={profileGroups("religion")}
              />
              <Breakdown
                title="PhilHealth membership type — children"
                rows={profileGroups("philhealth_membership_type")}
              />
              <Breakdown
                title="PhilHealth category — children"
                rows={profileGroups("philhealth_category")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              One guardian with multiple children is counted once in unique
              guardian totals. Household facilities are counted once per
              household; conflicting recorded facility values are labelled for
              review. Missing values remain Not recorded.{" "}
              {snapshot.module === "CHILD"
                ? "Child records are registrations in the period; age bands use age at registration."
                : "Household roster uses current active child links and age at period end; it is not a count of newly created households."}
            </p>
          </section>
        ) : (
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h3 className="text-center font-bold">
              {snapshot.module === "CHILD"
                ? "CHILD PROFILING FORM — 0–59 MONTHS"
                : "HOUSEHOLD PROFILING FORM — REGISTERED CHILDREN"}
            </h3>
            <div className="overflow-x-auto">
              <table className="profile-register min-w-max w-full border-collapse">
                <thead className="bg-sky-100">
                  <tr>
                    <th
                      rowSpan={2}
                      className={`${th} align-top whitespace-nowrap`}
                    >
                      Date of visit / profiling
                    </th>
                    <th
                      rowSpan={2}
                      className={`${th} align-top whitespace-nowrap`}
                    >
                      Household No.
                    </th>
                    <th
                      rowSpan={2}
                      className={`${th} align-top whitespace-nowrap`}
                    >
                      Barangay
                    </th>
                    <th
                      colSpan={3}
                      className={`${th} align-top whitespace-nowrap`}
                    >
                      Name of registered child
                    </th>
                    {[
                      "Child ID",
                      "DOB",
                      "Age (months)",
                      "Sex",
                      "Relationship to household head",
                      "Guardian",
                      "Guardian relationship",
                      "Guardian contact",
                      "4Ps",
                      "Ethnicity",
                      "Religion",
                      "PhilHealth ID",
                      "Membership type",
                      "PhilHealth category",
                      "Medical history / remarks",
                      "Water source",
                      "Toilet facility",
                    ].map((c) => (
                      <th
                        key={c}
                        rowSpan={2}
                        className={`${th} align-top whitespace-nowrap`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {["Last name", "First name", "Middle name"].map((c) => (
                      <th
                        key={c}
                        className={`${th} align-top whitespace-nowrap`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={String(m.child.child_id)}>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.profiling_date)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(
                          m.household.household_no ??
                            m.household.household_id ??
                            m.child.household_id,
                        )}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(
                          m.household.barangay_name ?? m.child.barangay_name,
                        )}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.child.last_name)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.child.first_name ?? m.child.child_name)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.child.middle_name)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.child.child_id)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.child.date_of_birth)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.child.age_months)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.child.sex)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.relationship_to_household_head)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {guardian(m)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.guardian.relationship_to_child)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.guardian.contact_number)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {fourPs(m.household)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.ethnicity)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.religion)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.philhealth_id_number)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.philhealth_membership_type)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.philhealth_category)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.medical_history)}
                        {m.profile.remarks
                          ? "; " + String(m.profile.remarks)
                          : ""}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.water_source_type)}
                      </td>
                      <td className={`${td} align-top whitespace-nowrap`}>
                        {value(m.profile.toilet_facility_type)}
                      </td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr>
                      <td
                        className={`${td} align-top whitespace-nowrap`}
                        colSpan={23}
                      >
                        No registered children in this report scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Each child has one row. A guardian may repeat across child rows;
              unique guardian totals count their stored ID once. Old report
              versions without enriched fields show Not recorded.
            </p>
          </section>
        )}
        <footer className="grid gap-6 rounded-lg border bg-white p-5 text-sm sm:grid-cols-3">
          <div>
            <p>Prepared / Generated by</p>
            <p className="mt-5 font-semibold">{meta.generatedBy}</p>
            <p>Date: {date(meta.generatedAt)}</p>
          </div>
          <div>
            <p>Reviewed / Validated by</p>
            <p className="mt-5 font-semibold">
              {meta.validatedBy ?? "Not validated"}
            </p>
            <p>Date: {date(meta.validatedAt)}</p>
          </div>
          <div>
            <p>Noted by / Signature</p>
            <p className="mt-5">____________________</p>
            <p>Date signed: __________</p>
          </div>
        </footer>
      </div>
      <style>{`@media print {@page {size:A3 landscape;margin:10mm}body * {visibility:hidden}.profile-report-output,.profile-report-output * {visibility:visible}.profile-report-output {position:absolute;left:0;top:0;width:100%;background:white}.profile-no-print {display:none!important}.profile-report-output .overflow-x-auto {overflow:visible!important}.profile-report-output table {width:100%;border-collapse:collapse}.profile-report-output th,.profile-report-output td {padding:3px!important;font-size:6.5pt}.profile-report-output .profile-register {min-width:0!important;table-layout:fixed}.profile-report-output .profile-register th,.profile-report-output .profile-register td {white-space:normal!important;overflow-wrap:anywhere;vertical-align:top}.profile-report-output thead {display:table-header-group}.profile-report-output tr {break-inside:avoid}.profile-report-output footer {break-inside:avoid;display:grid;grid-template-columns:repeat(3,1fr)}}`}</style>
    </div>
  );
}
