"use client";
import { reportScopeLabel } from "@/lib/reports/report-scope-label";
import { useState } from "react";
import { isValidatedReport } from "@/lib/reports/report-output-client";
import {
  reportVaccines,
  reportAgeGroups,
  uniqueDoseRows,
  indicatorRows,
  sexCounts,
  eligibleSourceRows,
  vaccineCode,
  age,
  type RecordMode,
} from "@/lib/reports/vaccination-report-utils";
import type { ReportRow } from "@/lib/reports/report-utils";
type Snapshot = {
  rows: ReportRow[];
  start: string;
  end: string;
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
const cell = "border border-slate-300 px-3 py-2 text-xs",
  header = cell + " bg-[#123F65] text-white font-semibold";
function date(v: string | null | undefined) {
  return v
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "—";
}
function Counts({
  label,
  rows,
  unavailable,
}: {
  label: string;
  rows?: ReportRow[];
  unavailable?: string;
}) {
  const c = sexCounts(rows ?? []);
  return (
    <>
      <td className={cell}>{label}</td>
      <td className={cell + " text-center"}>{unavailable ? "—" : c.male}</td>
      <td className={cell + " text-center"}>{unavailable ? "—" : c.female}</td>
      <td className={cell + " text-center"}>{unavailable ? "—" : c.total}</td>
      <td className={cell}>
        {unavailable ??
          (c.unknown
            ? `${c.unknown} with sex not recorded; included in total.`
            : "")}
      </td>
    </>
  );
}
export function VaccinationReportFormat({
  snapshot,
  meta,
}: {
  snapshot: Snapshot;
  meta: Meta;
}) {
  const [tab, setTab] = useState<"SUMMARY" | "REGISTER">("SUMMARY"),
    [mode, setMode] = useState<RecordMode>("SERVICE");
  const rows = uniqueDoseRows(snapshot.rows, mode),
    source = eligibleSourceRows(snapshot.rows, mode);
  const items = reportVaccines.flatMap((v) =>
    Array.from({ length: v.doses }, (_, n) => ({
      code: v.code,
      label: v.name + " " + (n + 1),
      dose: n + 1,
    })),
  );
  const uniqueChildren = new Set(rows.map((r) => String(r.child_id))).size;
  const missingBirthAge = rows.some(
    (r) =>
      vaccineCode(r) === "BCG" &&
      (r.age_days === null || r.age_days === undefined),
  );
  return (
    <div
      data-report-section={tab}
      data-report-mode={mode}
      className={
        "space-y-4 " + (!isValidatedReport(meta) ? "report-output-locked" : "")
      }
    >
      <nav
        aria-label="Vaccination report sections"
        className="vax-no-print flex flex-wrap gap-2 rounded-lg border bg-white p-3"
      >
        {[
          ["SUMMARY", "Overview"],
          ["REGISTER", "Child Vaccination Register"],
        ].map(([k, l]) => (
          <button
            type="button"
            key={k}
            aria-pressed={tab === k}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${tab === k ? "border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-200" : "border-transparent text-slate-600 hover:bg-sky-50 hover:text-sky-800"}`}
            onClick={() => setTab(k as "SUMMARY" | "REGISTER")}
          >
            {l}
          </button>
        ))}
        <select
          aria-label="Vaccination record group"
          value={mode}
          onChange={(e) => setMode(e.target.value as RecordMode)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <option value="SERVICE">
            Doses administered in reporting period
          </option>
          <option value="PRIOR">Prior vaccination records</option>
        </select>
      </nav>
      <div className="vax-report-output space-y-4">
        <header className="rounded-lg border bg-white p-4">
          <h2 className="text-center text-lg font-bold">{meta.title}</h2>
          <p className="mt-2 text-sm">
            Reporting period: {snapshot.start} to {snapshot.end} · Children0–59
            months
          </p>
          <p className="text-xs">{reportScopeLabel(snapshot.location)}</p>
          <p className="text-xs">
            {meta.status ?? "LIVE PREVIEW — NOT SAVED"}
            {meta.version ? " · Version " + meta.version : ""}
          </p>
          <p className="mt-2 font-semibold text-sm">
            {mode === "SERVICE"
              ? "Immunization services delivered"
              : "Prior immunization history — excluded from service totals"}
          </p>
        </header>
        {tab === "SUMMARY" ? (
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Unique child-dose entries: <strong>{rows.length}</strong>
              </p>
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Unique children: <strong>{uniqueChildren}</strong>
              </p>
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Additional repeated entries:{" "}
                <strong>{source.length - rows.length}</strong>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className={header}>
                      Indicators
                    </th>
                    <th colSpan={3} className={header}>
                      Sex
                    </th>
                    <th rowSpan={2} className={header}>
                      Remarks
                    </th>
                    <th rowSpan={2} className={header}>
                      Indicators
                    </th>
                    <th colSpan={3} className={header}>
                      Sex
                    </th>
                    <th rowSpan={2} className={header}>
                      Remarks
                    </th>
                  </tr>
                  <tr>
                    {[0, 1].flatMap((k) =>
                      ["Male", "Female", "Total"].map((l) => (
                        <th key={k + "-" + l} className={header}>
                          {l}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th
                      colSpan={10}
                      className={cell + " bg-slate-200 text-left"}
                    >
                      A.1 Early infant immunization
                    </th>
                  </tr>
                  <tr>
                    <Counts
                      label="BCG1 (0–28 calendar days)"
                      unavailable={
                        missingBirthAge
                          ? "Age in days is missing in this version."
                          : undefined
                      }
                      rows={rows.filter(
                        (r) =>
                          vaccineCode(r) === "BCG" &&
                          Number(r.dose_number) === 1 &&
                          r.age_days !== null &&
                          r.age_days !== undefined &&
                          Number(r.age_days) >= 0 &&
                          Number(r.age_days) <= 28,
                      )}
                    />
                    <Counts
                      label="Hepatitis B within24 hours after birth"
                      unavailable="Exact birth/administration times are not recorded."
                    />
                  </tr>
                  <tr>
                    <Counts
                      label="BCG1 (29 days to under12 months)"
                      unavailable={
                        missingBirthAge
                          ? "Age in days is missing in this version."
                          : undefined
                      }
                      rows={rows.filter(
                        (r) =>
                          vaccineCode(r) === "BCG" &&
                          Number(r.dose_number) === 1 &&
                          r.age_days !== null &&
                          r.age_days !== undefined &&
                          Number(r.age_days) >= 29 &&
                          age(r)! < 12,
                      )}
                    />
                    <Counts
                      label="Hepatitis B more than24 hours up to14 days"
                      unavailable="Exact timing is not verified in the saved records."
                    />
                  </tr>
                  {reportAgeGroups.map((g, idx) => (
                    <Group
                      key={g.label}
                      title={`A.${idx + 2} Immunization ${mode === "SERVICE" ? "services" : "history"} (${g.label})`}
                      items={items}
                      rows={rows}
                      min={g.min}
                      max={g.max}
                    />
                  ))}
                  <tr>
                    <th
                      colSpan={10}
                      className={cell + " bg-slate-200 text-left"}
                    >
                      Completion indicators
                    </th>
                  </tr>
                  <tr>
                    <Counts
                      label="Fully Immunized Child (FIC)"
                      unavailable="Completion status requires verified full-history assessment."
                    />
                    <Counts
                      label="Completely Immunized Child (CIC)"
                      unavailable="Completion status is not confirmed by period dose counts."
                    />
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Counts use approved saved records and age at vaccination. Each
              child/vaccine/dose is counted once within the selected record
              group. Prior doses use their recorded vaccination date and remain
              separate from services delivered in this period. Totals are dose
              recipients, not coverage percentages. School-age immunization is
              excluded.
            </p>
            {snapshot.rows.some((r) => r.sex === undefined) && (
              <p className="text-xs text-amber-800">
                This version lacks recorded sex values; generate a new version
                for the Male/Female breakdown. Existing data remains unchanged.
              </p>
            )}
          </section>
        ) : (
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h3 className="text-center font-semibold">
              CHILD VACCINATION REGISTER —0–59 MONTHS
            </h3>
            <div className="overflow-x-auto">
              <table className="vax-register min-w-max w-full border-collapse">
                <thead>
                  <tr>
                    {[
                      "Child ID",
                      "Child name",
                      "Barangay",
                      "DOB",
                      "Sex",
                      "Age (months)",
                      "Vaccine",
                      "Dose number",
                      "Date vaccinated",
                      "Batch number",
                      "Vaccination site",
                      "Record source",
                      "Recorded by",
                      "Remarks",
                    ].map((l) => (
                      <th key={l} className={header + " whitespace-nowrap"}>
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {source.map((r, n) => (
                    <tr key={String(r.vaccination_record_id ?? n)}>
                      {[
                        r.child_id,
                        r.child_name,
                        r.barangay_name,
                        r.date_of_birth,
                        r.sex,
                        r.age_months,
                        r.vaccine_type,
                        r.dose_number,
                        r.vaccination_date,
                        r.batch_number,
                        r.vaccination_site,
                        mode === "PRIOR"
                          ? (r.prior_source ?? "Prior record")
                          : "Current service",
                        r.recorded_by_name,
                        r.remarks,
                      ].map((v, i) => (
                        <td
                          key={i}
                          className={cell + " whitespace-nowrap align-top"}
                        >
                          {v == null || v === "" ? "Not recorded" : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!source.length && (
                    <tr>
                      <td colSpan={14} className={cell + " text-center"}>
                        No approved records in this group and period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              The register retains repeated source entries for review; the
              overview counts unique child/vaccine/dose recipients.
            </p>
          </section>
        )}
        <footer className="grid gap-6 rounded-lg border bg-white p-5 text-sm sm:grid-cols-3">
          <div>
            <p>Reported / Generated by</p>
            <p className="mt-5 font-semibold">{meta.generatedBy}</p>
            <p>Date: {date(meta.generatedAt)}</p>
          </div>
          <div>
            <p>Validated by</p>
            <p className="mt-5 font-semibold">
              {meta.validatedBy ?? "Not validated"}
            </p>
            <p>Date: {date(meta.validatedAt)}</p>
          </div>
          <div>
            <p>Noted by</p>
            <p className="mt-5">____________________</p>
            <p>Date signed: __________</p>
          </div>
        </footer>
      </div>
      <style>{`@media print { .report-output-locked, .report-output-locked * {display:none!important;visibility:hidden!important}@page {size:A3 landscape;margin:10mm}body * {visibility:hidden}.vax-report-output,.vax-report-output * {visibility:visible}.vax-report-output {position:absolute;left:0;top:0;width:100%;background:white}.vax-no-print {display:none!important}.vax-report-output .overflow-x-auto {overflow:visible!important}.vax-report-output table {width:100%;border-collapse:collapse}.vax-report-output th,.vax-report-output td {padding:4px!important;font-size:8pt;vertical-align:top}.vax-report-output .vax-register {min-width:0!important;table-layout:fixed}.vax-report-output .vax-register th,.vax-report-output .vax-register td {white-space:normal!important;overflow-wrap:anywhere;font-size:7pt}.vax-report-output thead {display:table-header-group}.vax-report-output tr {break-inside:avoid}.vax-report-output footer {display:grid;grid-template-columns:repeat(3,1fr);break-inside:avoid}}`}</style>
    </div>
  );
}
function Group({
  title,
  items,
  rows,
  min,
  max,
}: {
  title: string;
  items: { code: string; label: string; dose: number }[];
  rows: ReportRow[];
  min: number;
  max: number;
}) {
  const middle = Math.ceil(items.length / 2),
    left = items.slice(0, middle),
    right = items.slice(middle);
  return (
    <>
      <tr>
        <th colSpan={10} className={cell + " bg-slate-200 text-left"}>
          {title}
        </th>
      </tr>
      {left.map((v, n) => (
        <tr key={v.code + v.dose}>
          <Counts
            label={v.label}
            rows={indicatorRows(rows, v.code, v.dose, min, max)}
          />
          {right[n] ? (
            <Counts
              label={right[n].label}
              rows={indicatorRows(rows, right[n].code, right[n].dose, min, max)}
            />
          ) : (
            <td colSpan={5} className={cell} />
          )}
        </tr>
      ))}
    </>
  );
}
