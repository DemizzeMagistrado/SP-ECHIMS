"use client";
import { reportScopeLabel } from "@/lib/reports/report-scope-label";
import { useState } from "react";
import { isValidatedReport } from "@/lib/reports/report-output-client";
import type { ReportRow } from "@/lib/reports/report-utils";
import {
  selectedRows,
  recipients,
  productTotals,
  indicator,
  tier,
  planRemaining,
  quantity,
  type SupplyMode,
} from "@/lib/reports/supplementation-report-utils";
type Snapshot = {
  rows: ReportRow[];
  plans?: ReportRow[];
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
function display(v: unknown) {
  return v == null || v === "" ? "Not recorded" : String(v);
}
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
  remark,
  unavailable,
}: {
  label: string;
  rows: ReportRow[];
  remark?: string;
  unavailable?: boolean;
}) {
  const c = recipients(rows);
  return (
    <>
      <td className={cell}>{label}</td>
      <td className={cell + " text-center"}>{unavailable ? "—" : c.male}</td>
      <td className={cell + " text-center"}>{unavailable ? "—" : c.female}</td>
      <td className={cell + " text-center"}>{unavailable ? "—" : c.total}</td>
      <td className={cell}>
        {[
          unavailable
            ? "Commodity classification details are unavailable in this version."
            : remark,
          c.unknown
            ? `${c.unknown} with sex not recorded; included in total.`
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      </td>
    </>
  );
}
export function SupplementationReportFormat({
  snapshot,
  meta,
}: {
  snapshot: Snapshot;
  meta: Meta;
}) {
  const [tab, setTab] = useState<"SUMMARY" | "REGISTER" | "PLANS">("SUMMARY"),
    [mode, setMode] = useState<SupplyMode>("ADMINISTERED");
  const rows = selectedRows(snapshot.rows, mode),
    plans = snapshot.plans ?? [],
    products = productTotals(rows),
    count = recipients(rows);
  const incompleteCatalog = rows.some((r) => r.supplement_type == null);
  const pairs = [
    {
      left: {
        label:
          mode === "ADMINISTERED"
            ? "Children 6–11 months given routine Vitamin A"
            : "Children 6–11 months issued Vitamin A",
        rows: indicator(
          rows,
          "VITAMIN_A",
          6,
          11,
          mode === "ADMINISTERED" ? "ROUTINE" : undefined,
        ),
      },
      right: {
        label:
          mode === "ADMINISTERED"
            ? "Children 12–59 months given routine Vitamin A"
            : "Children 12–59 months issued Vitamin A",
        rows: indicator(
          rows,
          "VITAMIN_A",
          12,
          59,
          mode === "ADMINISTERED" ? "ROUTINE" : undefined,
        ),
      },
    },
    {
      left: {
        label: "Children6–11 months issued MNP",
        rows: indicator(rows, "MNP", 6, 11),
      },
      right: {
        label: "Children12–23 months issued MNP",
        rows: indicator(rows, "MNP", 12, 23),
      },
    },
    {
      left: {
        label: "Children6–11 months issued LNS-SQ",
        rows: indicator(rows, "LNS_SQ", 6, 11),
      },
      right: {
        label: "Children12–23 months issued LNS-SQ",
        rows: indicator(rows, "LNS_SQ", 12, 23),
      },
    },
    {
      left: {
        label: "Children12–23 months given Albendazole",
        rows: indicator(rows, "ALBENDAZOLE", 12, 23),
      },
      right: {
        label: "Children24–59 months given Albendazole",
        rows: indicator(rows, "ALBENDAZOLE", 24, 59),
      },
    },
  ];
  return (
    <div
      data-report-section={tab}
      data-report-mode={mode}
      className={
        "space-y-4 " + (!isValidatedReport(meta) ? "report-output-locked" : "")
      }
    >
      <nav
        aria-label="Supplementation report sections"
        className="supp-report-no-print flex flex-wrap gap-2 rounded-lg border bg-white p-3"
      >
        {[
          ["SUMMARY", "Overview"],
          ["REGISTER", "Child Supplementation Register"],
          ["PLANS", "Supply Plans"],
        ].map(([k, l]) => (
          <button
            type="button"
            key={k}
            aria-pressed={tab === k}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${tab === k ? "border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-200" : "border-transparent text-slate-600 hover:bg-sky-50 hover:text-sky-800"}`}
            onClick={() => setTab(k as "SUMMARY" | "REGISTER" | "PLANS")}
          >
            {l}
          </button>
        ))}
        {tab !== "PLANS" && (
          <select
            aria-label="Supplementation record type"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            value={mode}
            onChange={(e) => setMode(e.target.value as SupplyMode)}
          >
            <option value="ADMINISTERED">Actual administration</option>
            <option value="DISPENSED">Dispensed to guardians</option>
          </select>
        )}
      </nav>
      <div className="supp-report-output space-y-4">
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
          <p className="mt-2 text-sm font-semibold">
            {tab === "PLANS"
              ? "Authorized supply plans overlapping the reporting period"
              : mode === "ADMINISTERED"
                ? "Actual administration"
                : "Commodity supplies issued to guardians"}
          </p>
        </header>
        {tab === "SUMMARY" ? (
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Unique recipients: <strong>{count.total}</strong>
              </p>
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Saved{" "}
                {mode === "ADMINISTERED" ? "administration" : "dispensing"}{" "}
                entries: <strong>{rows.length}</strong>
              </p>
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                Linked stock transactions:{" "}
                <strong>
                  {
                    rows.filter((r) => r.inventory_transaction_id != null)
                      .length
                  }
                </strong>
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
                      {mode === "ADMINISTERED"
                        ? "Supplementation administration"
                        : "Supplement commodities dispensed"}
                    </th>
                  </tr>
                  {pairs.map((p, n) => (
                    <tr key={n}>
                      <Counts {...p.left} unavailable={incompleteCatalog} />
                      <Counts {...p.right} unavailable={incompleteCatalog} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="font-semibold">
              {mode === "ADMINISTERED"
                ? "Stock used for administration"
                : "Quantities issued to guardians"}
            </h3>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {[
                    "Commodity",
                    "Male",
                    "Female",
                    "Total recipients",
                    "Entries",
                    "Stock quantity",
                    "Stock unit",
                  ].map((l) => (
                    <th key={l} className={header}>
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p, n) => (
                  <tr key={n}>
                    {[
                      p.name,
                      p.male,
                      p.female,
                      p.total,
                      p.events,
                      p.stock ?? "Not fully recorded",
                      p.unit,
                    ].map((v, i) => (
                      <td key={i} className={cell}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
                {!products.length && (
                  <tr>
                    <td colSpan={7} className={cell + " text-center"}>
                      No records for this type and period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {mode === "ADMINISTERED" && (
              <table className="w-full border-collapse">
                <caption className="bg-sky-100 p-2 text-left text-sm font-semibold">
                  Saved administration tier
                </caption>
                <thead>
                  <tr>
                    {[
                      "Tier",
                      "Male",
                      "Female",
                      "Total recipients",
                      "Entries",
                    ].map((l) => (
                      <th key={l} className={header}>
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["ROUTINE", "TARGETED", "CLINICAL", "Not recorded"].map(
                    (t) => {
                      const selected = rows.filter((r) => tier(r) === t),
                        c = recipients(selected);
                      return (
                        <tr key={t}>
                          {[t, c.male, c.female, c.total, selected.length].map(
                            (v, i) => (
                              <td key={i} className={cell}>
                                {v}
                              </td>
                            ),
                          )}
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            )}
            <p className="text-xs text-muted-foreground">
              Recipient indicators count each child once per indicator; stock
              quantities include every saved administration/dispensing entry and
              are grouped by commodity and unit. Guardians handle giving
              dispensed supplies at home; consumption confirmation is not
              required by this report. Issued supplies are reported as issued,
              without inventing treatment outcomes. Supply plans are
              authorizations and remain separate from quantities actually
              dispensed.
            </p>
          </section>
        ) : tab === "REGISTER" ? (
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h3 className="text-center font-semibold">
              CHILD SUPPLEMENTATION REGISTER
            </h3>
            <div className="overflow-x-auto">
              <table className="supp-register min-w-max w-full border-collapse">
                <thead>
                  <tr>
                    {[
                      "Record ID",
                      "Child ID",
                      "Child name",
                      "Barangay",
                      "Sex",
                      "Age (months)",
                      "Guardian",
                      "Date given / issued",
                      "Commodity",
                      "Record type",
                      "Tier",
                      "Quantity",
                      "Stock unit",
                      "Dose value",
                      "Dose unit",
                      "Batch",
                      "Stock transaction",
                      "Supply plan",
                      "Assessment basis",
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
                  {rows.map((r, n) => (
                    <tr key={String(r.supplementation_record_id ?? n)}>
                      {[
                        r.supplementation_record_id,
                        r.child_id,
                        r.child_name,
                        r.barangay_name,
                        r.sex,
                        r.age_months,
                        r.guardian_name,
                        r.supplementation_date,
                        r.item_name,
                        r.record_type,
                        tier(r),
                        r.quantity_given,
                        r.unit,
                        r.dose_value,
                        r.dose_unit,
                        r.batch_number,
                        r.inventory_transaction_id,
                        r.plan_id,
                        r.source_assessment_id,
                        r.recorded_by_name,
                        r.remarks,
                      ].map((v, i) => (
                        <td
                          key={i}
                          className={cell + " whitespace-nowrap align-top"}
                        >
                          {display(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={21} className={cell + " text-center"}>
                        No records for this type and period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h3 className="text-center font-semibold">
              CHILD COMMODITY SUPPLY PLANS
            </h3>
            <div className="overflow-x-auto">
              <table className="supp-register min-w-max w-full border-collapse">
                <thead>
                  <tr>
                    {[
                      "Plan ID",
                      "Child",
                      "Barangay",
                      "Guardian",
                      "Commodity",
                      "Start",
                      "End",
                      "Authorized quantity",
                      "Dispensed in period",
                      "Dispensed through period end",
                      "Authorization remaining",
                      "Unit",
                      "Directions",
                      "Assessment basis",
                      "Registered by",
                      "Remarks",
                    ].map((l) => (
                      <th key={l} className={header + " whitespace-nowrap"}>
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p, n) => (
                    <tr key={String(p.plan_id ?? n)}>
                      {[
                        p.plan_id,
                        p.child_name,
                        p.barangay_name,
                        p.guardian_name,
                        p.item_name,
                        p.start_date,
                        p.end_date,
                        p.authorized_quantity,
                        p.dispensed_in_period,
                        p.dispensed_through_period_end,
                        planRemaining(p),
                        p.unit,
                        p.directions,
                        p.source_assessment_id,
                        p.registered_by_name,
                        p.remarks,
                      ].map((v, i) => (
                        <td
                          key={i}
                          className={cell + " whitespace-nowrap align-top"}
                        >
                          {display(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!plans.length && (
                    <tr>
                      <td colSpan={16} className={cell + " text-center"}>
                        {snapshot.plans === undefined
                          ? "Supply-plan data is unavailable in this older report version."
                          : "No supply plans overlap this period."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Remaining authorization is authorized quantity minus dispensing
              through period end; it is not available inventory. No stock is
              counted as issued merely because a plan was registered. A negative
              remaining quantity indicates history requiring review.
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
      <style>{`@media print { .report-output-locked, .report-output-locked * {display:none!important;visibility:hidden!important}@page {size:A3 landscape;margin:10mm}body * {visibility:hidden}.supp-report-output,.supp-report-output * {visibility:visible}.supp-report-output {position:absolute;left:0;top:0;width:100%;background:white}.supp-report-no-print {display:none!important}.supp-report-output .overflow-x-auto {overflow:visible!important}.supp-report-output table {width:100%;border-collapse:collapse}.supp-report-output th,.supp-report-output td {padding:4px!important;font-size:8pt;vertical-align:top}.supp-report-output .supp-register {min-width:0!important;table-layout:fixed}.supp-report-output .supp-register th,.supp-report-output .supp-register td {white-space:normal!important;overflow-wrap:anywhere;font-size:6.5pt}.supp-report-output thead {display:table-header-group}.supp-report-output tr {break-inside:avoid}.supp-report-output footer {display:grid;grid-template-columns:repeat(3,1fr);break-inside:avoid}}`}</style>
    </div>
  );
}
