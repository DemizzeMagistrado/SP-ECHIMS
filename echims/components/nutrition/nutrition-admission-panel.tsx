"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { Fragment, useEffect, useRef, useState } from "react";
import { readPageCache, writePageCache } from '@/lib/page-cache'
import { AlertTriangle, ChevronDown, HeartPulse, RefreshCw, Search } from "lucide-react";
import { CountsStrip, REPORT_CARD, SectionHeader } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { cn } from '@/lib/utils'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
import { toast } from '@/components/ui/toast'
import { nutritionLabel, nutritionTone } from '@/lib/nutrition-status'
import { Spinner } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { DateInput, Input, Select, Textarea } from '@/components/ui/form'

type Event = {
  event_id: number;
  action: string;
  created_at: string;
  actor_name: string | null;
  new_values: {
    status: string;
    care_type: string | null;
    remarks: string | null;
    note?: string;
  };
};
type Entry = {
  admission_id: number;
  child_id: number;
  child_name: string;
  child_status: string;
  source_assessment_id: number;
  source_assessment_date: string;
  classification_at_detection: string;
  source_current_classification: string;
  latest_classification: string | null;
  latest_assessment_date: string | null;
  status: "PENDING" | "ACTIVE" | "DONE";
  care_type: "INPATIENT" | "OUTPATIENT" | null;
  checkup_date: string | null;
  facility_name: string | null;
  remarks: string | null;
  barangay_name: string;
  confirmed_by_name: string | null;
  updated_by_name: string | null;
  revision: number;
  history: Event[];
};
type Data = {
  currentUserId: string;
  role: string;
  canEdit: boolean;
  rows: Entry[];
};
type Form = {
  careType: string;
  status: string;
  checkupDate: string;
  facility: string;
  remarks: string;
};
const endpoint = "/api/nutrition/admissions";
function today() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
async function read(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      `Admission API returned a non-JSON response (HTTP ${response.status}). Verify app/api/nutrition/admissions/route.ts.`,
    );
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Unable to process care details.");
  return body;
}
const EVENT_TITLE: Record<string, string> = { DETECTED: "Detected", CONFIRMED: "Care confirmed", UPDATED: "Updated" };
const STATUS_TONE = { PENDING: "review", ACTIVE: "info", DONE: "good" } as const;
const eventTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});

/** Expanded row under an admission: its events as a timeline, newest first. */
function AdmissionHistory({ events, statusLabel, careLabel }: {
  events: Event[];
  statusLabel: (v: string) => string;
  careLabel: (v: string | null | undefined) => string | null;
}) {
  return (
    <section aria-label="Admission history" className="max-w-[78ch]">
      <h3 className="mb-3 text-[13px] font-semibold text-brand-navy">
        Admission history <span className="font-normal text-brand-muted">· {events.length} {events.length === 1 ? "event" : "events"}</span>
      </h3>
      {events.length === 0 ? (
        <p className="text-sm text-brand-muted">No events recorded.</p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-brand-line">
          {events.map((h, i) => {
            const corrected = h.new_values?.note === "Source assessment corrected";
            const status = h.new_values?.status ?? "";
            const care = careLabel(h.new_values?.care_type);
            return (
              <li key={h.event_id} className="relative pl-7">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 top-3 size-[15px] rounded-full border-2 bg-white",
                    corrected ? "border-review-line" : i === 0 ? "border-brand-navy" : "border-brand-line",
                  )}
                />
                <div className={cn("rounded-xl border bg-white px-4 py-3", corrected ? "border-review-line/60" : "border-brand-line")}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {corrected && <AlertTriangle size={14} aria-hidden="true" className="shrink-0 text-review" />}
                    <span className={cn("text-sm font-semibold", corrected ? "text-review" : "text-brand-navy")}>
                      {corrected ? "Source assessment corrected" : EVENT_TITLE[h.action] ?? nutritionLabel(h.action)}
                    </span>
                    {i === 0 && <span className="rounded-full bg-badge px-2 py-0.5 text-[11px] font-semibold text-brand-navy">Latest</span>}
                    <span className="text-xs text-brand-muted sm:ml-auto">
                      <time dateTime={h.created_at}>{eventTime.format(new Date(h.created_at))}</time>
                      {" · "}
                      {h.actor_name ? `by ${h.actor_name}` : "Automatic detection"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {status && (
                      <StatusBadge status={status} tone={STATUS_TONE[status as keyof typeof STATUS_TONE] ?? "neutral"} label={statusLabel(status)} />
                    )}
                    <span className="text-brand-muted">
                      Care type: <span className={care ? "font-medium text-brand-navy" : undefined}>{care ?? "not confirmed"}</span>
                    </span>
                  </div>
                  {h.new_values?.remarks && (
                    <p className="mt-2 whitespace-pre-wrap border-l-2 border-brand-line pl-3 text-sm text-brand-navy/80">{h.new_values.remarks}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function NutritionAdmissionPanel({
  ownerId,
  online = true,
}: {
  ownerId: string;
  online?: boolean;
}) {
  // Revisiting the tab starts from the last result (no loader) and refreshes it quietly.
  const [data, setData] = useState<Data | null>(() => readPageCache<Data>(ownerId, "nutrition-admissions") ?? null),
    [loading, setLoading] = useState(() => !readPageCache(ownerId, "nutrition-admissions")),
    [error, setError] = useState("");
  usePageLoading(loading)
  const [reload, setReload] = useState(0),
    [filter, setFilter] = useState("OPEN"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Entry | null>(null),
    [expanded, setExpanded] = useState<number[]>([]);
  const [form, setForm] = useState<Form>({
      careType: "",
      status: "ACTIVE",
      checkupDate: "",
      facility: "",
      remarks: "",
    }),
    [busy, setBusy] = useState(false);
  const active = useRef(true),
    sending = useRef(false),
    controller = useRef<AbortController | null>(null);
  const intent = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    let current = true;
    const abort = new AbortController();
    if (!online) {
      setLoading(false);
      return () => abort.abort();
    }
    setLoading(!readPageCache(ownerId, "nutrition-admissions"));
    void fetch(endpoint, { cache: "no-store", signal: abort.signal })
      .then(read)
      .then((body) => {
        if (body.currentUserId !== ownerId || !Array.isArray(body.rows))
          throw new Error("Session changed or invalid admission response.");
        if (current) {
          setData(body);
          writePageCache(ownerId, "nutrition-admissions", body);
          setError("");
        }
      })
      .catch((e) => {
        if (current && !abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to load care entries.",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      abort.abort();
    };
  }, [ownerId, online, reload]);
  function open(entry: Entry) {
    setSelected(entry);
    intent.current = null;
    setError("");
    setForm({
      careType: entry.care_type || "",
      status: entry.status === "DONE" ? "DONE" : "ACTIVE",
      checkupDate: entry.checkup_date || today(),
      facility: entry.facility_name || "",
      remarks: entry.remarks || "",
    });
  }
  function change(key: keyof Form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    intent.current = null;
  }
  async function save() {
    if (!selected || !data?.canEdit || !online || sending.current) return;
    const values = {
      admissionId: selected.admission_id,
      revision: selected.revision,
      ...form,
      remarks: form.remarks.trim(),
      facility: form.facility.trim(),
    };
    const signature = JSON.stringify(values);
    if (!intent.current || intent.current.signature !== signature)
      intent.current = { signature, id: crypto.randomUUID() };
    const abort = new AbortController();
    controller.current = abort;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const body = await read(
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, requestId: intent.current.id }),
          signal: abort.signal,
        }),
      );
      if (body.currentUserId !== ownerId)
        throw new Error("Session changed. Refresh the page.");
      if (active.current) {
        if (body.message) toast.success(body.message);
        setSelected(null);
        intent.current = null;
        setReload((v) => v + 1);
      }
    } catch (e) {
      if (active.current && !abort.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Submission uncertain. Retry unchanged.",
        );
    } finally {
      controller.current = null;
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }
  const matchesSearch = (r: Entry) =>
    `${r.child_name} ${r.barangay_name}`.toLowerCase().includes(search.toLowerCase().trim());
  const searched = (data?.rows || []).filter(matchesSearch);
  const rows = searched.filter(
    (r) => filter === "ALL" || (filter === "OPEN" ? r.status !== "DONE" : r.status === filter),
  );
  const { visible: pageRows, bindList, listStyle, props: pager } = usePagination(rows);
  const toggle = (id: number) =>
    setExpanded((list) => (list.includes(id) ? list.filter((v) => v !== id) : [...list, id]));
  // Same table styling as All assessments (.data-grid lines, zebra, hover with a navy bar, pinned Action column).
  const head = "px-4 py-3 text-left align-bottom text-[13px] font-semibold text-brand-navy";
  const cell = "px-4 py-3.5 align-top";
  const pinned = "relative sm:sticky right-0 w-[208px] min-w-[208px] border-l-brand-line sm:shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.18)]";
  const dash = <span className="text-brand-muted">—</span>;
  const careLabel = (v: string | null | undefined) => (v === "INPATIENT" ? "Inpatient" : v === "OUTPATIENT" ? "Outpatient" : null);
  const statusLabel = (v: string) => (v === "PENDING" ? "Pending confirmation" : v === "ACTIVE" ? "Active" : v === "DONE" ? "Done" : v);
  return (
    <section className="space-y-5" aria-label="SAM/MAM admission tracking">
      <SectionHeader
        title="SAM/MAM admission tracking"
        subtitle="Children flagged SAM or MAM. Confirm the care they are actually receiving and track their checkups."
        about={<InfoContent
          title="SAM/MAM admission tracking"
          description="Qualifying saved assessments create pending entries; the RHM or BNS confirms the actual inpatient or outpatient care after checkup."
          sections={[{ label: 'Values', value: ['Pending = waiting for care to be confirmed', 'Active = confirmed ongoing care', 'Done = this tracking entry was completed (not an inferred cure)'] }]}
          bullets={['No next follow-up date is required']}
          note="Shows at most the latest 500 entries in your scope."
        />}
        actions={<Button variant="secondary" size="icon" className="size-10" aria-label="Refresh" disabled={loading || busy || !online} onClick={() => setReload((v) => v + 1)} title={online ? undefined : "Reconnect to refresh"}><RefreshCw size={16} aria-hidden="true" className={loading && Boolean(data) ? "animate-spin motion-reduce:animate-none" : undefined} /></Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative lg:col-span-2">
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search by child or barangay"
            className="pl-10"
            placeholder="Search by child or barangay"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select aria-label="Care status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {["OPEN", "PENDING", "ACTIVE", "DONE", "ALL"].map((v) => (
            <option key={v} value={v}>
              {v === "OPEN" ? "Pending & Active" : v === "PENDING" ? "Pending confirmation" : v}
            </option>
          ))}
        </Select>
      </div>
      {data && (
          // Counts for the current search (applying the care-status filter would zero the other two).
          <CountsStrip label="Admission counts" items={[
            { label: "Pending confirmation", value: searched.filter((r) => r.status === "PENDING").length, tone: "review" },
            { label: "Active", value: searched.filter((r) => r.status === "ACTIVE").length },
            { label: "Done", value: searched.filter((r) => r.status === "DONE").length },
          ]} />
        )}
      {!online && (
        <p className="text-sm text-amber-800">
          Reconnect to confirm care. Admission changes are not queued offline.
        </p>
      )}
      {data && !data.canEdit && (
        <p className="text-sm text-muted-foreground">
          Viewing access. Assigned RHM/BNS confirm care details.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {loading && !data ? (
        <Spinner showLabel label="Loading admission tracking…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
      ) : (
        <div className={REPORT_CARD}>
          <div ref={bindList} style={listStyle} className="scroll-subtle overflow-x-auto">
            <table className="data-grid data-grid--hover w-full text-sm text-brand-navy">
              <thead>
                <tr>
                  {["Child / Source assessment", "Screening", "Care type", "Status / Checkup", "Facility / Remarks", "Recorded by"].map((v) => (
                    <th key={v} scope="col" className={cn(head, "whitespace-nowrap")}>{v}</th>
                  ))}
                  <th scope="col" className={cn(head, pinned, "z-[2]")}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}><EmptyState icon={HeartPulse} title="No care entries in this view" description="Try a different status or filter." /></td>
                  </tr>
                ) : (
                  pageRows.map((r, i) => {
                    const expandedRow = expanded.includes(r.admission_id);
                    const historyId = `admission-${r.admission_id}-history`;
                    // History is newest first: a correction of the source assessment is the latest UPDATED event.
                    const latest = r.history[0];
                    const corrected = latest?.action === "UPDATED" && latest.new_values?.note === "Source assessment corrected";
                    const recordedBy = r.updated_by_name || r.confirmed_by_name;
                    return (
                      <Fragment key={r.admission_id}>
                        <tr data-zebra={i % 2 === 1 || undefined} className="group">
                          <td className={cn(cell, "min-w-52 transition-[box-shadow,background-color] duration-[120ms] group-hover:shadow-[inset_3px_0_0_var(--brand-navy)]")}>
                            <span className="font-semibold">{r.child_name}</span>
                            <span className="block text-xs text-brand-muted">
                              {r.barangay_name}. Assessment #{r.source_assessment_id}, <span className="whitespace-nowrap">{r.source_assessment_date}</span>
                            </span>
                          </td>
                          <td className={cn(cell, "min-w-36")}>
                            <StatusBadge status={r.classification_at_detection} tone={nutritionTone(r.classification_at_detection)} label={nutritionLabel(r.classification_at_detection)} />
                            {r.latest_classification !== r.classification_at_detection && (
                              <p className="mt-1 text-xs text-review">
                                Latest: {r.latest_classification ? nutritionLabel(r.latest_classification) : "Unavailable"}, <span className="whitespace-nowrap">{r.latest_assessment_date}</span>
                              </p>
                            )}
                          </td>
                          <td className={cell}>{careLabel(r.care_type) ?? dash}</td>
                          <td className={cn(cell, "min-w-48")}>
                            <StatusBadge status={r.status} tone={STATUS_TONE[r.status]} label={statusLabel(r.status)} />
                            <p className="mt-1 text-xs text-brand-muted">{r.checkup_date || "No checkup yet"}</p>
                            {(corrected || !["SAM", "MAM"].includes(r.source_current_classification)) && (
                              <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-review">
                                <AlertTriangle size={14} aria-hidden="true" className="mt-px shrink-0" />
                                Source assessment corrected. Review this admission.
                              </p>
                            )}
                          </td>
                          <td className={cn(cell, "min-w-48 max-w-sm")}>
                            {r.facility_name || r.remarks ? (
                              <>
                                {r.facility_name && <p>{r.facility_name}</p>}
                                {r.remarks && <p className={cn("whitespace-pre-wrap text-xs text-brand-muted", r.facility_name && "mt-1")}>{r.remarks}</p>}
                              </>
                            ) : dash}
                          </td>
                          <td className={cn(cell, "min-w-36")}>{recordedBy ?? dash}</td>
                          <td className={cn(cell, pinned, "z-[1]")}>
                            <div className="flex items-center gap-2">
                              {data?.canEdit && r.status !== "DONE" && (
                                <Button
                                  variant={r.status === "PENDING" ? "primary" : "row"}
                                  size="row"
                                  className="flex-1"
                                  disabled={busy || !online}
                                  onClick={() => open(r)}
                                >
                                  {r.status === "PENDING" ? "Confirm care" : "Update"}
                                  <span className="sr-only"> for {r.child_name}</span>
                                </Button>
                              )}
                              <Button
                                variant="row"
                                size="row"
                                className="ml-auto w-9 shrink-0 px-0"
                                aria-expanded={expandedRow}
                                aria-controls={historyId}
                                aria-label={`History for ${r.child_name}`}
                                onClick={() => toggle(r.admission_id)}
                              >
                                <ChevronDown aria-hidden="true" className={cn("transition-transform duration-200 motion-reduce:transition-none", expandedRow && "rotate-180")} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expandedRow && (
                          <tr id={historyId} data-detail>
                            <td colSpan={7} className="bg-group-a px-4 py-4 sm:px-6">
                              {/* Pinned to the visible width when the table scrolls sideways (phones). */}
                              <div className="sticky left-4 max-w-[calc(100vw-4.5rem)] sm:static sm:max-w-none">
                              <AdmissionHistory events={r.history} statusLabel={statusLabel} careLabel={careLabel} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination {...pager} label="Admission tracking pages" />
        </div>
      )}
      {selected && (
        <Modal
          open
          size="lg"
          onClose={() => setSelected(null)}
          busy={busy}
          title="Confirm admission / care details"
          subtitle={<>{selected.child_name} · Source assessment #{selected.source_assessment_id}</>}
          bodyClassName="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          footer={<Button type="submit" loading={busy} disabled={!online}>{busy ? "Saving…" : "Save care details"}</Button>}
        >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Care type *
                <Select
                  required
                  disabled={busy}
                  className="mt-1"
                  value={form.careType}
                  onChange={(e) => change("careType", e.target.value)}
                >
                  <option value="">Choose actual care</option>
                  <option value="INPATIENT">
                    Inpatient — admitted facility
                  </option>
                  <option value="OUTPATIENT">
                    Outpatient — RHU / health facility
                  </option>
                </Select>
              </label>
              <label className="text-sm">
                Status *
                <Select
                  disabled={busy}
                  className="mt-1"
                  value={form.status}
                  onChange={(e) => change("status", e.target.value)}
                >
                  <option value="ACTIVE" disabled={selected.status === "DONE"}>
                    Active
                  </option>
                  <option value="DONE">Done</option>
                </Select>
              </label>
              <label className="text-sm">
                Actual checkup date *
                <DateInput
                  required
                  disabled={busy}
                  min={selected.source_assessment_date}
                  max={today()}
                  className="mt-1"
                  value={form.checkupDate}
                  onChange={(e) => change("checkupDate", e.target.value)}
                />
              </label>
              <label className="text-sm">
                Facility (optional)
                <Input
                  disabled={busy}
                  maxLength={300}
                  className="mt-1"
                  value={form.facility}
                  onChange={(e) => change("facility", e.target.value)}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Remarks *
                <Textarea
                  required
                  disabled={busy}
                  maxLength={4000}
                  rows={4}
                  className="mt-1"
                  placeholder="Record confirmed checkup, admission, treatment or discharge details."
                  value={form.remarks}
                  onChange={(e) => change("remarks", e.target.value)}
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Record what was confirmed at the checkup. The system does not
              choose treatment or infer recovery.
            </p>
        </Modal>
      )}
    </section>
  );
}
