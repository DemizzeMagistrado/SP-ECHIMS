"use client";
import { useState } from "react";
import { isValidatedReport } from "@/lib/reports/report-output-client";
import type { ReportRow } from "@/lib/reports/report-utils";
import {
  amount,
  movement,
  monthlyMovements,
  manilaDate,
} from "@/lib/reports/inventory-report-utils";
type Snapshot = {
  rows: ReportRow[];
  inventoryView: string;
  inventoryStock?: ReportRow[];
  inventoryMovements?: ReportRow[];
  start: string;
  end: string;
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
const cell = "border border-slate-300 px-3 py-2 text-xs align-top",
  head = cell + " bg-[#123F65] text-white font-semibold";
const show = (v: unknown) =>
  v == null || v === "" ? "Not recorded" : String(v);
export function InventoryReportFormat({
  snapshot,
  meta,
}: {
  snapshot: Snapshot;
  meta: Meta;
}) {
  const [tab, setTab] = useState("Monthly inventory");
  const stock =
    snapshot.inventoryStock ??
    (snapshot.inventoryView === "STOCK" ? snapshot.rows : []);
  const transactions =
    snapshot.inventoryMovements ??
    (snapshot.inventoryView === "TRANSACTIONS" ? snapshot.rows : []);
  const complete =
    Array.isArray(snapshot.inventoryStock) &&
    Array.isArray(snapshot.inventoryMovements);
  return (
    <div
      data-report-section={tab}
      className={
        "space-y-4 " + (!isValidatedReport(meta) ? "report-output-locked" : "")
      }
    >
      <nav
        aria-label="Inventory report sections"
        className="flex flex-wrap gap-2 print:hidden"
      >
        {["Monthly inventory", "Stock & batches", "Movement register"].map(
          (t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 ${tab === t ? "bg-sky-800 text-white hover:bg-sky-700" : "bg-white text-slate-700"}`}
            >
              {t}
            </button>
          ),
        )}
      </nav>
      <div className="inventory-report-output space-y-4">
        <h2 className="text-center text-xl font-bold">{meta.title}</h2>
        <p className="text-center text-sm">
          {tab} · {snapshot.start} to {snapshot.end}
        </p>
        {!complete && (
          <p className="rounded border border-amber-300 p-3 text-sm">
            This older snapshot contains only its selected inventory view.
            Generate a new version to capture stock and movements together.
          </p>
        )}
        {tab === "Monthly inventory" && (
          <>
            <p className="text-xs">
              Based on the commodity inventory reference. Receipts and issues
              cover the selected dates only. Beginning balance, transfers, total
              available and historical ending balance require verified opening
              balances and transfer classifications. Current stock is shown
              separately as captured at generation.
            </p>
            {stock.map((s, index) => (
              <section key={String(s.inventory_id)} className="space-y-2">
                <h3
                  className={`p-3 font-semibold ${index % 3 === 0 ? "bg-yellow-100" : index % 3 === 1 ? "bg-sky-100" : "bg-red-100"}`}
                >
                  {show(s.item_name)} · {show(s.barangay_name)} · {show(s.unit)}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        {[
                          "Month",
                          "Beginning balance",
                          "Recorded receipts",
                          "Receipt dates",
                          "Transfer in (+)",
                          "Transfer out / expired (-)",
                          "Total available",
                          "Quantity issued",
                          "Historical ending balance",
                          "Review",
                        ].map((h) => (
                          <th key={h} className={head}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyMovements(
                        transactions,
                        s.inventory_id,
                        snapshot.start,
                        snapshot.end,
                      ).map((m) => (
                        <tr key={m.month}>
                          <td className={cell}>{m.month}</td>
                          <td className={cell}>Not verified</td>
                          <td className={cell}>
                            {complete ? m.receipts : "Unavailable"}
                          </td>
                          <td className={cell}>
                            {[...new Set(m.dates)].join(", ") || "—"}
                          </td>
                          <td className={cell}>Not verified</td>
                          <td className={cell}>Not verified</td>
                          <td className={cell}>Not verified</td>
                          <td className={cell}>
                            {complete ? m.issues : "Unavailable"}
                          </td>
                          <td className={cell}>Not verified</td>
                          <td className={cell}>
                            {m.review} unclassified; {m.invalid} invalid;{" "}
                            {m.allocations} allocated from existing stock (no
                            increase)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )}
        {tab === "Stock & batches" && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {[
                    "Barangay",
                    "Commodity",
                    "Unit",
                    "Current aggregate stock",
                    "Batch stock total",
                    "Reconciliation",
                    "Batch",
                    "Expiry",
                    "Received",
                    "Batch quantity",
                  ].map((h) => (
                    <th key={h} className={head}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stock.flatMap((s) => {
                  const batches = Array.isArray(s.batches)
                    ? (s.batches as ReportRow[])
                    : [];
                  return (batches.length ? batches : [{}]).map((b, i) => (
                    <tr key={`${s.inventory_id}:${i}`}>
                      {[
                        s.barangay_name,
                        s.item_name,
                        s.unit,
                        s.quantity_on_hand,
                        s.batch_stock,
                        amount(s.quantity_on_hand) === null ||
                        amount(s.batch_stock) === null
                          ? "Unavailable"
                          : amount(s.quantity_on_hand) === amount(s.batch_stock)
                            ? "Matches"
                            : "Needs review",
                        b.batch_number,
                        b.expiry_date,
                        b.received_date,
                        b.quantity_on_hand,
                      ].map((v, n) => (
                        <td key={n} className={cell}>
                          {show(v)}
                        </td>
                      ))}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
        {tab === "Movement register" && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {[
                    "ID",
                    "Manila date",
                    "Barangay",
                    "Commodity",
                    "Type",
                    "Classification",
                    "Quantity",
                    "Unit",
                    "Batch ID",
                    "Reference",
                    "Performed by",
                    "Remarks",
                  ].map((h) => (
                    <th key={h} className={head}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={String(t.transaction_id)}>
                    {[
                      t.transaction_id,
                      manilaDate(t.transaction_date),
                      t.barangay_name,
                      t.item_name,
                      t.transaction_type,
                      movement(t.transaction_type),
                      t.quantity,
                      t.unit,
                      t.inventory_batch_id,
                      t.reference_number,
                      t.performed_by_name,
                      t.remarks,
                    ].map((v, i) => (
                      <td key={i} className={cell}>
                        {show(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(tab === "Movement register" ? transactions : stock).length === 0 && (
          <p className="p-4 text-sm">No records available in this snapshot.</p>
        )}
        <footer className="grid gap-3 border-t pt-4 text-sm md:grid-cols-3">
          <p>
            Generated by: {meta.generatedBy}
            <br />
            Date: {show(meta.generatedAt)}
          </p>
          <p>
            Validated by: {meta.validatedBy || "Not validated"}
            <br />
            Date: {show(meta.validatedAt)}
          </p>
          <p>
            {meta.status || "Live preview — not saved"}
            {meta.version ? ` · Version ${meta.version}` : ""}
          </p>
        </footer>
      </div>
      <style>{`@media print { .report-output-locked, .report-output-locked * {display:none!important;visibility:hidden!important}@page{size:A3 landscape;margin:10mm} body *{visibility:hidden} .inventory-report-output,.inventory-report-output *{visibility:visible} .inventory-report-output{position:absolute;left:0;top:0;width:100%;background:white} .inventory-report-output .overflow-x-auto{overflow:visible} .inventory-report-output th{print-color-adjust:exact} .inventory-report-output thead{display:table-header-group} .inventory-report-output tr{break-inside:avoid}}`}</style>
    </div>
  );
}
