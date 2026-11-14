"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { HeartPulse, RefreshCw, Search } from "lucide-react";
import { FilterBar } from '@/components/ui/filter-bar'
import { InfoTip } from '@/components/ui/info-tip'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
import { toast } from '@/components/ui/toast'
import { nutritionProfileHref } from '@/lib/nutrition-status'
import { Spinner } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { DateInput, Field, Input, Select, Textarea } from '@/components/ui/form'

type Event = {
  event_id: number;
  action: string;
  created_at: string;
  actor_name: string | null;
  new_values: {
    status: string;
    care_type: string | null;
    remarks: string | null;
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
export function NutritionAdmissionPanel({
  ownerId,
  online = true,
}: {
  ownerId: string;
  online?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const router = useRouter();
  usePageLoading(loading)
  const [reload, setReload] = useState(0),
    [filter, setFilter] = useState("OPEN"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Entry | null>(null);
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
    setLoading(true);
    void fetch(endpoint, { cache: "no-store", signal: abort.signal })
      .then(read)
      .then((body) => {
        if (body.currentUserId !== ownerId || !Array.isArray(body.rows))
          throw new Error("Session changed or invalid admission response.");
        if (current) {
          setData(body);
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
  const rows = (data?.rows || []).filter(
    (r) =>
      (filter === "ALL" ||
        (filter === "OPEN" ? r.status !== "DONE" : r.status === filter)) &&
      `${r.child_name} ${r.barangay_name}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const { visible: pageRows, bindList, listStyle, props: pager } = usePagination(rows);
  // The whole row opens the profile; links, buttons and the History toggle keep their own action.
  const openRow = (event: MouseEvent, childId: number) => {
    if (!(event.target as HTMLElement).closest("a,button,summary,details")) router.push(nutritionProfileHref(childId));
  };
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-brand-navy">
            SAM/MAM admission tracking
            <InfoTip label="About admission tracking">
              Qualifying saved assessments create pending entries. RHM/BNS confirm
              actual inpatient or outpatient care after checkup. Active means confirmed
              ongoing care; Done means this tracking entry was completed, not an
              automatically inferred cure. No next follow-up date is required. At most
              the latest 500 scoped entries are displayed.
            </InfoTip>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm actual care for children flagged SAM or MAM
          </p>
        </div>
        <Button variant="tonal"
          loading={loading && Boolean(data)}
          disabled={loading || busy || !online}
          onClick={() => setReload((v) => v + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </Button>
      </div>
      <FilterBar>
        <Field label="Child or barangay">
          <div className="relative">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="pl-9"
              placeholder="Search by child or barangay"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Field>
        <Field label="Care status">
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["OPEN", "PENDING", "ACTIVE", "DONE", "ALL"].map((v) => (
              <option key={v} value={v}>
                {v === "OPEN"
                  ? "Pending & Active"
                  : v === "PENDING"
                    ? "Pending confirmation"
                    : v}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>
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
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
        <div ref={bindList} style={listStyle} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                {[
                  "Child / Source assessment",
                  "Screening",
                  "Care type",
                  "Status / Checkup",
                  "Facility / Remarks",
                  "Recorded by",
                  "Action",
                ].map((v) => (
                  <th key={v} scope="col" className="px-4 py-3 text-xs font-semibold">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}><EmptyState icon={HeartPulse} title="No care entries in this view" description="Try a different status or filter." /></td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.admission_id} onClick={(event) => openRow(event, r.child_id)} className="cursor-pointer transition-colors hover:bg-brand-ice/60">
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-brand-navy underline-offset-4 hover:text-brand-blue hover:underline"
                        href={nutritionProfileHref(r.child_id)}
                      >
                        {r.child_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.barangay_name} · Assessment #{r.source_assessment_id}{" "}
                        · {r.source_assessment_date}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {r.classification_at_detection}
                      {r.latest_classification !==
                        r.classification_at_detection && (
                        <p className="text-xs text-amber-800">
                          Latest: {r.latest_classification || "Unavailable"} ·{" "}
                          {r.latest_assessment_date}
                        </p>
                      )}
                      {!["SAM", "MAM"].includes(
                        r.source_current_classification,
                      ) && (
                        <p className="text-xs text-amber-800">
                          Source assessment corrected; review required.
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.care_type === "INPATIENT"
                        ? "Inpatient"
                        : r.care_type === "OUTPATIENT"
                          ? "Outpatient"
                          : "Not confirmed"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={r.status}
                        tone={r.status === "PENDING" ? "warn" : r.status === "ACTIVE" ? "info" : "good"}
                        label={r.status === "PENDING" ? "Pending confirmation" : r.status === "ACTIVE" ? "Active" : "Done"}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.checkup_date || "No checkup confirmed"}
                      </p>
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <p>{r.facility_name || "—"}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {r.remarks || "—"}
                      </p>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-primary">
                          History
                        </summary>
                        {r.history.map((h) => (
                          <div
                            key={h.event_id}
                            className="mt-2 rounded border p-2"
                          >
                            <p>
                              {h.action} · {h.new_values.status} ·{" "}
                              {h.new_values.care_type || "Not confirmed"}
                            </p>
                            <p>{h.new_values.remarks}</p>
                            <p className="text-muted-foreground">
                              {h.actor_name || "Automatic detection"} ·{" "}
                              {new Date(h.created_at).toLocaleString("en-PH", {
                                timeZone: "Asia/Manila",
                              })}
                            </p>
                          </div>
                        ))}
                      </details>
                    </td>
                    <td className="px-4 py-3">
                      {r.updated_by_name ||
                        r.confirmed_by_name ||
                        "Not confirmed"}
                    </td>
                    <td className="px-4 py-3">
                      {data?.canEdit && (
                        <Button
                          variant="tonal"
                          size="sm"
                          disabled={busy || !online}
                          onClick={() => open(r)}
                        >
                          {r.status === "PENDING"
                            ? "Confirm care"
                            : "Update remarks / status"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
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
