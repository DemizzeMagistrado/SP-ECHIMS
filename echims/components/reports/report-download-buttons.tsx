"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useState } from "react";
import { captureReport } from "@/lib/reports/capture-report";
import {
  canOutput,
  printApprovedReport,
} from "@/lib/reports/report-output-client";
export function ReportDownloadButtons({
  reportId,
  status,
  validatedBy,
  validatedAt,
}: {
  reportId?: number;
  status?: string;
  validatedBy?: string | null;
  validatedAt?: string | null;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const approval = { reportId, status, validatedBy, validatedAt };
  const approved = canOutput(approval);
  async function download(format: "CSV" | "XLSX") {
    if (!approved) return;
    setBusy(true);
    setError("");
    try {
      const selected = document.querySelector<HTMLElement>(
        "[data-report-section]",
      );
      const params = new URLSearchParams({
        reportId: String(reportId),
        format,
      });
      if (selected?.dataset.reportSection)
        params.set("section", selected.dataset.reportSection);
      if (selected?.dataset.reportMode)
        params.set("mode", selected.dataset.reportMode);
      let r: Response;
      if (format === "XLSX") {
        const check = await fetch(
          `/api/reports/export?reportId=${reportId}&format=CHECK`,
          { cache: "no-store" },
        );
        if (!check.ok) {
          const result = await check.json();
          throw new Error(result.error || "PHN validation is required.");
        }
        if (!selected)
          throw new Error("Open the saved report before exporting.");
        const image = await captureReport(selected);
        r = await fetch("/api/reports/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId,
            section: selected.dataset.reportSection,
            mode: selected.dataset.reportMode,
            ...image,
          }),
        });
      } else
        r = await fetch(`/api/reports/export?${params}`, { cache: "no-store" });
      if (!r.ok) {
        const b = await r.json();
        throw new Error(b.error || "Download failed.");
      }
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        r.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ||
        `eCHIMS-report-${reportId}.${format.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!approved)
    return (
      <p className="text-xs text-muted-foreground">
        Save and submit the report, then wait for PHN validation. Printing and
        downloads become available on the approved saved version.
      </p>
    );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await printApprovedReport(approval);
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-sky-50 disabled:opacity-50"
        >
          Print / Save PDF
        </button>
        {(["CSV", "XLSX"] as const).map((f) => (
          <button
            key={f}
            type="button"
            disabled={busy}
            onClick={() => void download(f)}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download{" "}
            {f === "XLSX" ? "Excel" : "CSV"}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Excel opens with the report image on the first sheet; editable saved
        data is on the second sheet. CSV contains plain data.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
