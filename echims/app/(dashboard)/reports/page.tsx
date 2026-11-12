"use client";
import { TabBar } from '@/components/ui/module-tabs'
import { offlineFetch as fetch, offlineScope } from '@/lib/offline/fetch'
import { useAuth } from '@/components/auth/auth-provider'
import { readPageCache, writePageCache } from '@/lib/page-cache'
import { useEffect, useRef, useState } from "react";
import { ReportDownloadButtons } from "@/components/reports/report-download-buttons";
import { InventoryReportFormat } from "@/components/reports/inventory-report-format";
import { SupplementationReportFormat } from "@/components/reports/supplementation-report-format";
import { VaccinationReportFormat } from "@/components/reports/vaccination-report-format";
import { ProfilingReportFormat } from "@/components/reports/profiling-report-format";
import { NutritionReportFormat } from "@/components/reports/nutrition-report-format";
import {
  labels,
  columns,
  cell,
  heading,
  manilaToday,
  periodRange,
  type ReportRow,
} from "@/lib/reports/report-utils";
import { LogoLoader } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { EmptyState } from '@/components/ui/empty-state'
import { FileText, SearchX } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { DateInput, Input, Select, Textarea } from '@/components/ui/form'
import { Pagination, usePagination } from '@/components/ui/pagination'
type Options = {
  currentUserId: string;
  role: string;
  modules: string[];
  canGenerate: boolean;
  canValidate: boolean;
  page: number;
  total: number;
  reports: Saved[];
  barangays: { barangay_id: number; barangay_name: string; rhu_id: number }[];
};
type Preview = {
  inventoryStock?: ReportRow[];
  inventoryMovements?: ReportRow[];
  plans?: ReportRow[];
  location?: {
    barangay_name: string;
    municipality: string;
    province: string;
  }[];
  module: string;
  start: string;
  end: string;
  barangayId: number | null;
  inventoryView: string;
  itemType: string;
  rows: ReportRow[];
  generatedBy: string;
  generatedAt: string;
  rowCount: number;
  mode: string;
};
type Saved = {
  report_id: number;
  series_id: string;
  version: number;
  title: string;
  module: string;
  period_start: string;
  period_end: string;
  generated_by_name: string;
  generated_by_role: string;
  generated_at: string;
  status: string;
  validated_by_name: string | null;
  validated_at: string | null;
  review_remarks: string | null;
  review_revision: number;
  row_count: number;
  snapshot?: Preview;
};
type Detail = {
  currentUserId: string;
  report: Saved & { snapshot: Preview };
  canValidate: boolean;
  canRegenerate: boolean;
  events: {
    event_id: number;
    actor_name: string;
    action: string;
    created_at: string;
    remarks: string | null;
  }[];
};
async function response(r: Response) {
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "Reports API did not return JSON. Check app/api/reports/route.ts.",
    );
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || "Unable to process report.");
  return b;
}
function stamp(v: string | null) {
  if (!v) return "—";
  return (
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v)) + " (Manila)"
  );
}
export default function ReportsPage() {
  const { user } = useAuth();
  // A revisit starts from the last report list for this account and scope, then refreshes quietly.
  const cacheKey = user ? "reports:" + offlineScope(user) : "";
  const [cachedOptions] = useState(() => readPageCache<Options>(user?.id, cacheKey + ":1"));
  const [options, setOptions] = useState<Options | null>(cachedOptions ?? null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(!cachedOptions),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0),
    [section, setSection] = useState<"SAVED" | "PREVIEW">("SAVED"),
    [module, setModule] = useState(() => cachedOptions && !cachedOptions.modules.includes("CHILD") ? cachedOptions.modules[0] : "CHILD"),
    [period, setPeriod] = useState("MONTHLY"),
    [range, setRange] = useState({ start: "", end: "" }),
    [barangay, setBarangay] = useState(""),
    [inventoryView, setInventoryView] = useState("STOCK"),
    [itemType, setItemType] = useState("ALL"),
    [title, setTitle] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [remarks, setRemarks] = useState(""),
    [visible, setVisible] = useState(100);
  usePageLoading(loading);
  const intent = useRef<{ signature: string; id: string } | null>(null),
    saving = useRef(false),
    active = useRef(true),
    request = useRef<AbortController | null>(null),
    generation = useRef(0);
  useEffect(() => {
    active.current = true;
    setRange(periodRange("MONTHLY", manilaToday()));
    return () => {
      active.current = false;
      generation.current++;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    if (!readPageCache(user?.id, cacheKey + ":" + page)) setLoading(true);
    void fetch("/api/reports?page=" + page, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(response)
      .then((b) => {
        if (
          !Array.isArray(b.modules) ||
          !Array.isArray(b.reports) ||
          !Array.isArray(b.barangays)
        )
          throw new Error("Invalid report-list response.");
        if (current) {
          setOptions(b);
          writePageCache(user?.id, cacheKey + ":" + page, b);
          setModule((m) => (b.modules.includes(m) ? m : b.modules[0]));
          setError("");
        }
      })
      .catch((e) => {
        if (current)
          setError(
            controller.signal.aborted
              ? "Report loading timed out. Click Retry loading reports."
              : e instanceof Error
                ? e.message
                : "Unable to load reports.",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [page, reload, user?.id, cacheKey]);
  function clear() {
    generation.current++;
    request.current?.abort();
    setPreview(null);
    setDetail(null);
    setError("");
    setNotice("");
    setVisible(100);
  }
  async function loadView(reportId?: number) {
    if (!options) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const n = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const p = reportId
        ? new URLSearchParams({ reportId: String(reportId) })
        : new URLSearchParams({
            module,
            start: range.start,
            end: range.end,
            inventoryView,
            itemType,
          });
      if (!reportId && barangay) p.set("barangayId", barangay);
      const b = await response(
        await fetch("/api/reports?" + p, {
          cache: "no-store",
          signal: controller.signal,
        }),
      );
      if (b.currentUserId !== options.currentUserId)
        throw new Error("Session changed. Refresh.");
      if (n === generation.current) {
        setVisible(100);
        setRemarks("");
        if (reportId) {
          setDetail(b);
          setPreview(null);
        } else {
          setPreview(b);
          setDetail(null);
        }
      }
    } catch (e) {
      if (n === generation.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Unable to load report.");
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }
  async function write(
    action: "GENERATE" | "VALIDATE" | "RETURN",
    newVersion = false,
  ) {
    if (!options || saving.current) return;
    if (action === "GENERATE" && !options.canGenerate) return;
    if (action !== "GENERATE" && !detail?.canValidate) return;
    const source = newVersion ? detail?.report.snapshot : preview;
    if (action === "GENERATE" && !source) {
      setError("View the report before generating it.");
      return;
    }
    const values =
      action === "GENERATE"
        ? {
            action,
            module: source!.module,
            start: source!.start,
            end: source!.end,
            barangayId: source!.barangayId,
            inventoryView: source!.inventoryView,
            itemType: source!.itemType,
            title: newVersion
              ? detail!.report.title
              : title.trim() ||
                `${labels[source!.module]} ${source!.start} to ${source!.end}`,
            baseReportId: newVersion ? detail!.report.report_id : null,
          }
        : {
            action,
            reportId: detail!.report.report_id,
            revision: detail!.report.review_revision,
            remarks: remarks.trim(),
          };
    if (action === "RETURN" && !remarks.trim()) {
      setError("Enter remarks when returning a report.");
      return;
    }
    const signature = JSON.stringify(values);
    if (!intent.current || intent.current.signature !== signature)
      intent.current = { signature, id: crypto.randomUUID() };
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const b = await response(
        await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, requestId: intent.current.id }),
        }),
      );
      if (b.currentUserId !== options.currentUserId)
        throw new Error("Session changed. Refresh.");
      if (active.current) {
        setDetail(b);
        setPreview(null);
        setSection("SAVED");
        intent.current = null;
        setNotice(
          action === "GENERATE"
            ? "Report saved. Pending PHN validation."
            : action === "VALIDATE"
              ? "Saved report validated."
              : "Report returned with remarks.",
        );
        setReload((v) => v + 1);
      }
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : "Submission uncertain. Retry unchanged.",
        );
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  }
  const { visible: reportsPage, bindList: bindReportList, listStyle: reportListStyle, props: reportPagerProps } = usePagination(options?.reports ?? []);
  const shown = detail?.report.snapshot ?? preview;
  const fields = shown
    ? columns[
        shown.module === "INVENTORY" && shown.inventoryView === "TRANSACTIONS"
          ? "TRANSACTIONS"
          : shown.module
      ]
    : [];
  return (
    <div className="space-y-6">
      <TabBar
        label="Report workflow"
        group="reports"
        value={section}
        onChange={(s) => {
          clear();
          setSection(s);
        }}
        items={[
          { value: "SAVED", label: "Generated Reports", disabled: busy },
          { value: "PREVIEW", label: "Report Preview", disabled: busy },
        ]}
      />
      <PageHeader
        title={<>Reports & Analytics</>}
        subtitle={<>{options?.role === "Administrator" ? "System-wide report viewing." : options?.role === "PHN" ? "Review and validate reports within your RHU." : options?.role === "BNS" ? "Generate nutrition reports within assigned barangays." : "Generate reports within assigned barangays."}</>}
      />
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800"
        >
          {notice}
        </p>
      )}
      {!options && (
        <section
          className="space-y-3 rounded-2xl border bg-white p-5"
          aria-live="polite"
        >
          <p className="text-sm">
            {loading
              ? "Loading report permissions and assigned barangays…"
              : "Report options have not loaded yet."}
          </p>
          <Button variant="secondary"
            disabled={busy}
            onClick={() => setReload((v) => v + 1)}
          >
            Retry loading reports
          </Button>
          <p className="text-xs text-muted-foreground">
            If this stays loading, check the browser Console for a JavaScript
            error.
          </p>
        </section>
      )}
      {section === "SAVED" && options && (
        <section className="space-y-4 rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              Saved report versions ({options.total})
            </h2>
            <Button variant="secondary"
              disabled={busy || loading}
              onClick={() => setReload((v) => v + 1)}
            >
              Refresh
            </Button>
          </div>
          <div ref={bindReportList} style={reportListStyle} className="scroll-mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {[
                    "Report",
                    "Period",
                    "Generated by",
                    "Status",
                    "Validated by",
                    "Action",
                  ].map((h) => (
                    <th key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {reportsPage.map((r) => (
                  <tr key={r.report_id}>
                    <td className="p-3">
                      {r.title}
                      <p className="text-xs text-muted-foreground">
                        #{r.report_id} · Version {r.version} · {r.row_count}{" "}
                        rows
                      </p>
                    </td>
                    <td className="p-3">
                      {r.period_start} to {r.period_end}
                    </td>
                    <td className="p-3">
                      {r.generated_by_name}
                      <p className="text-xs">{stamp(r.generated_at)}</p>
                    </td>
                    <td className="p-3">{r.status.replace(/_/g, " ")}</td>
                    <td className="p-3">
                      {r.validated_by_name ?? "Not validated"}
                      {r.validated_at && (
                        <p className="text-xs">{stamp(r.validated_at)}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        disabled={busy || loading}
                        className="text-primary underline"
                        onClick={() => void loadView(r.report_id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {!options.reports.length && (
                  <tr>
                    <td colSpan={6}><EmptyState icon={FileText} title="No saved reports yet" description="Reports you generate and save will appear here." /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination {...reportPagerProps} label="Saved report pages" />
          {/* The server sends 50 saved reports at a time. */}
          {options.total > 50 && (
            <div className="flex items-center justify-between gap-3 text-xs text-brand-muted">
              <span>Batch {page} of {Math.ceil(options.total / 50)} (50 reports each)</span>
              <span className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={page === 1 || busy || loading} onClick={() => { clear(); setPage((v) => v - 1); }}>Newer</Button>
                <Button variant="ghost" size="sm" disabled={page * 50 >= options.total || busy || loading} onClick={() => { clear(); setPage((v) => v + 1); }}>Older</Button>
              </span>
            </div>
          )}
        </section>
      )}
      {section === "PREVIEW" && options && (
        <section className="space-y-4 rounded-2xl border bg-white p-5">
          <nav aria-label="Report modules" className="flex flex-wrap border-b">
            {options.modules.map((m) => (
              <button
                type="button"
                disabled={busy}
                key={m}
                className={`border-b-2 px-4 py-2 ${m === module ? "border-primary text-primary" : "border-transparent"}`}
                onClick={() => {
                  clear();
                  setModule(m);
                }}
              >
                {labels[m]}
              </button>
            ))}
          </nav>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              Period
              <select
                disabled={busy}
                className="mt-1 w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 transition-colors hover:border-sky-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                value={period}
                onChange={(e) => {
                  clear();
                  setPeriod(e.target.value);
                  if (e.target.value !== "CUSTOM")
                    setRange(periodRange(e.target.value, manilaToday()));
                }}
              >
                {[
                  ["DAILY", "Daily"],
                  ["WEEKLY", "Weekly"],
                  ["MONTHLY", "Monthly"],
                  ["CUSTOM", "Custom date range"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Start
              <DateInput
                disabled={busy}
                className="mt-1"
                value={range.start}
                onChange={(e) => {
                  clear();
                  setPeriod("CUSTOM");
                  setRange((f) => ({ ...f, start: e.target.value }));
                }}
              />
            </label>
            <label className="text-sm">
              End
              <DateInput
                disabled={busy}
                className="mt-1"
                value={range.end}
                onChange={(e) => {
                  clear();
                  setPeriod("CUSTOM");
                  setRange((f) => ({ ...f, end: e.target.value }));
                }}
              />
            </label>
            <label className="text-sm">
              Barangay
              <Select
                disabled={busy}
                className="mt-1"
                value={barangay}
                onChange={(e) => {
                  clear();
                  setBarangay(e.target.value);
                }}
              >
                <option value="">All accessible barangays</option>
                {options.barangays.map((b) => (
                  <option key={b.barangay_id} value={b.barangay_id}>
                    {b.barangay_name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {module === "INVENTORY" && (
            <div className="flex gap-3">
              <Select
                disabled={busy}
                aria-label="Inventory view"
                value={inventoryView}
                onChange={(e) => {
                  clear();
                  setInventoryView(e.target.value);
                }}
              >
                <option value="STOCK">Current stock</option>
                <option value="TRANSACTIONS">Transactions in period</option>
              </Select>
              <Select
                disabled={busy}
                aria-label="Item type"
                value={itemType}
                onChange={(e) => {
                  clear();
                  setItemType(e.target.value);
                }}
              >
                <option value="ALL">Vaccines and supplements</option>
                <option value="VACCINE">Vaccines</option>
                <option value="SUPPLEMENT">Supplements</option>
              </Select>
            </div>
          )}
          <Button variant="secondary"
            disabled={loading || busy || !range.start || !range.end}
            onClick={() => void loadView()}
          >
            View Preview
          </Button>
          {options.canGenerate && preview && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                Report title
                <Input
                  disabled={busy}
                  maxLength={200}
                  value={title}
                  placeholder={`${labels[module]} ${range.start} to ${range.end}`}
                  className="mt-1"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || loading}
                onClick={() => void write("GENERATE")}
              >
                Generate and Submit to PHN
              </Button>
            </div>
          )}
        </section>
      )}
      {loading && <LogoLoader size="section" label="Loading reports…" />}
      {shown && (
        <section className="space-y-4 rounded-2xl border bg-white p-5">
          <header>
            <h2 className="text-lg font-semibold">
              {detail?.report.title ?? `${labels[shown.module]} preview`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {detail
                ? `Generated by ${detail.report.generated_by_name} · ${stamp(detail.report.generated_at)}`
                : `Preview by ${shown.generatedBy} · ${stamp(shown.generatedAt)}`}
            </p>
            <p className="text-sm">
              {detail
                ? detail.report.status.replace(/_/g, " ")
                : "Live preview — not saved"}{" "}
              · {shown.rowCount} rows · {shown.start} to {shown.end}
            </p>
            {detail && (
              <p className="text-sm">
                Validated by:{" "}
                {detail.report.validated_by_name ?? "Not validated"} ·{" "}
                {stamp(detail.report.validated_at)}
              </p>
            )}
          </header>
          {options?.role && options.role !== "Administrator" && (
            <ReportDownloadButtons
              reportId={detail?.report.report_id}
              status={detail?.report.status}
              validatedBy={detail?.report.validated_by_name}
              validatedAt={detail?.report.validated_at}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Current profile details and care status are captured at generation.
            Current stock is a generation-time balance; household data is a
            current linked-child roster, not newly created households. Prior
            doses and dispensing remain separate from service/consumption
            totals.
          </p>
          {shown.module === "NUTRITION" && (
            <NutritionReportFormat
              snapshot={shown}
              meta={{
                title: detail?.report.title ?? "Nutrition report preview",
                generatedBy:
                  detail?.report.generated_by_name ?? shown.generatedBy,
                generatedAt: detail?.report.generated_at ?? shown.generatedAt,
                validatedBy: detail?.report.validated_by_name,
                validatedAt: detail?.report.validated_at,
                status: detail?.report.status,
                version: detail?.report.version,
              }}
            />
          )}
          {["CHILD", "HOUSEHOLD"].includes(shown.module) && (
            <ProfilingReportFormat
              snapshot={shown}
              meta={{
                title:
                  detail?.report.title ??
                  (shown.module === "CHILD"
                    ? "Child Profile report preview"
                    : "Household report preview"),
                generatedBy:
                  detail?.report.generated_by_name ?? shown.generatedBy,
                generatedAt: detail?.report.generated_at ?? shown.generatedAt,
                validatedBy: detail?.report.validated_by_name,
                validatedAt: detail?.report.validated_at,
                status: detail?.report.status,
                version: detail?.report.version,
              }}
            />
          )}
          {shown.module === "VACCINATION" && (
            <VaccinationReportFormat
              snapshot={shown}
              meta={{
                title: detail?.report.title ?? "Vaccination report preview",
                generatedBy:
                  detail?.report.generated_by_name ?? shown.generatedBy,
                generatedAt: detail?.report.generated_at ?? shown.generatedAt,
                validatedBy: detail?.report.validated_by_name,
                validatedAt: detail?.report.validated_at,
                status: detail?.report.status,
                version: detail?.report.version,
              }}
            />
          )}
          {shown.module === "SUPPLEMENTATION" && (
            <SupplementationReportFormat
              snapshot={shown}
              meta={{
                title: detail?.report.title ?? "Supplementation report preview",
                generatedBy:
                  detail?.report.generated_by_name ?? shown.generatedBy,
                generatedAt: detail?.report.generated_at ?? shown.generatedAt,
                validatedBy: detail?.report.validated_by_name,
                validatedAt: detail?.report.validated_at,
                status: detail?.report.status,
                version: detail?.report.version,
              }}
            />
          )}
          {shown.module === "INVENTORY" && (
            <InventoryReportFormat
              snapshot={shown}
              meta={{
                title: detail?.report.title ?? "Inventory report preview",
                generatedBy:
                  detail?.report.generated_by_name ?? shown.generatedBy,
                generatedAt: detail?.report.generated_at ?? shown.generatedAt,
                validatedBy: detail?.report.validated_by_name,
                validatedAt: detail?.report.validated_at,
                status: detail?.report.status,
                version: detail?.report.version,
              }}
            />
          )}
          {detail?.canValidate && (
            <div className="space-y-3 rounded-lg border p-4">
              <label className="block text-sm">
                Review remarks
                <Textarea
                  disabled={busy}
                  maxLength={2000}
                  className="mt-1"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <Button
                  disabled={busy || loading}
                  onClick={() => void write("VALIDATE")}
                >
                  Validate Report
                </Button>
                <Button variant="secondary"
                  disabled={busy || loading}
                  onClick={() => void write("RETURN")}
                >
                  Return with Remarks
                </Button>
              </div>
            </div>
          )}
          {detail?.canRegenerate && (
            <Button variant="secondary"
              disabled={busy || loading}
              onClick={() => void write("GENERATE", true)}
            >
              Generate New Version
            </Button>
          )}
          {![
            "NUTRITION",
            "CHILD",
            "HOUSEHOLD",
            "VACCINATION",
            "SUPPLEMENTATION",
            "INVENTORY",
          ].includes(shown.module) && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {fields.map((f) => (
                        <th key={f} className="whitespace-nowrap p-3">
                          {heading(f)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shown.rows.slice(0, visible).map((r, n) => (
                      <tr key={n}>
                        {fields.map((f) => (
                          <td key={f} className="max-w-sm break-words p-3">
                            {cell(r[f])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {shown.rows.length === 0 && (
                      <tr>
                        <td colSpan={fields.length}><EmptyState icon={SearchX} title="No matching records" description="Try a different period or filter." /></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {visible < shown.rows.length && (
                <Button variant="secondary"
                  onClick={() => setVisible((v) => v + 100)}
                >
                  Show more ({visible} of {shown.rows.length})
                </Button>
              )}
            </>
          )}
          {detail && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Generation and review history
              </summary>
              <div className="space-y-2 pt-3">
                {detail.events.map((e) => (
                  <p className="text-sm" key={e.event_id}>
                    {e.action} · {e.actor_name} · {stamp(e.created_at)}
                    {e.remarks && ` · ${e.remarks}`}
                  </p>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
