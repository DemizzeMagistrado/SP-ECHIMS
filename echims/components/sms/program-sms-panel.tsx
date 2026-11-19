"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Spinner } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { EmptyState } from '@/components/ui/empty-state'
import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateInput, Input, Select } from '@/components/ui/form'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'

// Form labels and table cells: the shared muted label and .data-grid cell values.
const fieldLabel = 'space-y-1.5 text-xs font-medium text-brand-muted'
const gridHead = 'px-4 py-3 text-left align-bottom text-[13px] font-semibold text-brand-navy whitespace-nowrap'
const gridCell = 'px-4 py-3 align-top'

type Program = "VACCINATION" | "SUPPLEMENTATION";
type MessageType = "UPCOMING" | "OVERDUE";
// UI wording: due today or later is "Pending"; past the due date is "Missed".
const PHASE_LABEL: Record<string, string> = { ALL: "All", UPCOMING: "Pending", DUE_TODAY: "Due today", OVERDUE: "Missed" };
const phaseLabel = (value: string) => PHASE_LABEL[value] ?? value.replace(/_/g, " ");
type Outcome = "SIMULATED_SENT" | "SIMULATED_FAILED";
type ErrorCode = "NETWORK_ERROR" | "INSUFFICIENT_CREDITS" | "PROVIDER_ERROR";
type Row = {
  service_key: string;
  child_id: number;
  child_name: string;
  service_name: string;
  due_date: string;
  phase: string;
  upcoming_date: string;
  overdue_date: string;
  upcoming_message: string;
  overdue_message: string;
  rule_active: boolean;
  contact_status: string;
  masked_number: string | null;
  eligible: boolean;
  notification_id: number | null;
  delivery_status: string | null;
  queue_status: string | null;
  simulation_status: string | null;
  simulation_time: string | null;
  simulation_error: string | null;
  live_contact_verified?: boolean;
  live_status?: string | null;
  provider_uid?: string | null;
};
type Data = {
  currentUserId: string;
  program: Program;
  canSend: boolean;
  simulationEnabled: boolean;
  mode?: string;
  liveEnabled?: boolean;
  previewEnabled?: boolean;
  evaluatedOn: string;
  rows: Row[];
};
const scenarios: Record<ErrorCode, string> = {
  NETWORK_ERROR: "Network error",
  INSUFFICIENT_CREDITS: "Insufficient credits",
  PROVIDER_ERROR: "Provider error",
};
const contacts: Record<string, string> = {
  NO_GUARDIAN: "No guardian linked",
  NO_VALID_NUMBER: "No valid mobile number",
  CONSENT_REQUIRED: "Consent required",
  CONFIRMED: "Consent confirmed",
};
async function readJson(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error(
      "SMS API did not return JSON. Check app/api/sms/reminders/route.ts.",
    );
  const result = body as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to process SMS reminders.",
    );
  return result;
}
export function ProgramSmsPanel({
  program,
  ownerId,
  online = true,
}: {
  program: Program;
  ownerId: string;
  online?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reload, setReload] = useState(0);
  usePageLoading(loading)
  const [selectedKey, setSelectedKey] = useState(""),
    [errorCode, setErrorCode] = useState<ErrorCode>("NETWORK_ERROR"),
    [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const active = useRef(true),
    sending = useRef(false),
    controllerRef = useRef<AbortController | null>(null);
  const intent = useRef<{ signature: string; requestId: string } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controllerRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    let valid = true;
    const controller = new AbortController();
    setData(null);
    setError("");
    setLoading(true);
    void (async () => {
      try {
        const result = await readJson(
          await fetch(`/api/sms/reminders?program=${program}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        );
        if (
          result.currentUserId !== ownerId ||
          result.program !== program ||
          !Array.isArray(result.rows)
        )
          throw new Error("Session or SMS program changed. Refresh this page.");
        if (valid) {
          const panel = result as unknown as Data;
          setData(panel);
          setSelectedKey((old) =>
            panel.rows.some((row) => row.service_key === old)
              ? old
              : (panel.rows[0]?.service_key ?? ""),
          );
        }
      } catch (cause) {
        if (valid && !(cause instanceof Error && cause.name === "AbortError"))
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load reminders.",
          );
      } finally {
        if (valid) setLoading(false);
      }
    })();
    return () => {
      valid = false;
      controller.abort();
    };
  }, [program, ownerId, online, reload]);
  const selected =
    data?.rows.find((row) => row.service_key === selectedKey) ?? data?.rows[0];
  const messageType: MessageType =
    selected?.phase === "OVERDUE" ? "OVERDUE" : "UPCOMING";
  const message = selected
    ? messageType === "UPCOMING"
      ? selected.upcoming_message
      : selected.overdue_message
    : "";
  const reminderDate = selected
    ? messageType === "UPCOMING"
      ? selected.upcoming_date
      : selected.overdue_date
    : "";
  const ready = Boolean(
    data?.canSend &&
      data.simulationEnabled &&
      (selected?.eligible ||
        (data.previewEnabled &&
          selected?.contact_status === "CONFIRMED" &&
          selected.rule_active)) &&
      selected.phase === messageType &&
      online &&
      !busy,
  );
  const liveReady = Boolean(data?.canSend && data.liveEnabled && selected?.eligible && selected.live_contact_verified && selected.phase === messageType && online && !busy && !['READY','SENDING','SUBMITTED','DELIVERED','UNCERTAIN'].includes(selected.live_status ?? ''));
  const currentContext = useRef(`${ownerId}:${program}`); currentContext.current = `${ownerId}:${program}`;
  async function sendLive() {
    if (sending.current || !liveReady || !selected) return;
    const context = `${ownerId}:${program}`;
    sending.current = true; setBusy(true); setError(''); setNotice('');
    const signature = `${ownerId}:${program}:${selected.service_key}:${messageType}:LIVE`;
    if (intent.current?.signature !== signature) intent.current = { signature, requestId: crypto.randomUUID() };
    try {
      // Native fetch never queues a paid send as an offline form submission.
      const result = await readJson(await globalThis.fetch('/api/sms/reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SEND', program, serviceKey: selected.service_key, messageType, requestId: intent.current.requestId, requestOwnerId: ownerId, preview: false }),
      }));
      if (!active.current || currentContext.current !== context) return;
      if (result.currentUserId !== ownerId) throw new Error('Session changed. Refresh this page.');
      setNotice(typeof result.message === 'string' ? result.message : 'Sending attempt recorded.');
      intent.current = null; setReload(old => old + 1);
    } catch (cause) {
      if (active.current && currentContext.current === context) setError(cause instanceof Error ? cause.message : 'Sending result is uncertain. Retry the same action to check its status.');
    } finally {
      sending.current = false;
      if (active.current && currentContext.current === context) setBusy(false);
    }
  }
  const rows = (data?.rows ?? []).filter(
    (row) =>
      (filter === "ALL" || row.phase === filter) &&
      (!from || row.due_date >= from) &&
      (!to || row.due_date <= to) &&
      `${row.child_name} ${row.service_name}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  async function send(outcome: Outcome) {
    if (sending.current || !ready || !selected) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const code = outcome === "SIMULATED_FAILED" ? errorCode : null;
    const signature = `${program}:${selected.service_key}:${messageType}:${outcome}:${code}`;
    if (intent.current?.signature !== signature)
      intent.current = { signature, requestId: crypto.randomUUID() };
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const result = await readJson(
        await fetch("/api/sms/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            program,
            serviceKey: selected.service_key,
            messageType,
            outcome,
            errorCode: code,
            requestId: intent.current.requestId,
            preview: data?.previewEnabled === true,
          }),
        }),
      );
      if (!active.current) return;
      if (result.currentUserId !== ownerId)
        throw new Error("Session changed. Refresh the page.");
      const saved = result.result;
      if (
        !saved ||
        typeof saved !== "object" ||
        !("mode" in saved) ||
        saved.mode !== "SIMULATION"
      )
        throw new Error(
          "Unexpected result. Retry the same action to check its saved status.",
        );
      intent.current = null;
      setNotice(
        outcome === "SIMULATED_SENT"
          ? "SIMULATED SENT. No actual text was sent; delivery remains PENDING."
          : `SIMULATED FAILED — ${scenarios[errorCode]}. No actual text was sent.`,
      );
      setReload((old) => old + 1);
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to simulate SMS. Retry the same action.",
        );
    } finally {
      sending.current = false;
      controllerRef.current = null;
      if (active.current) setBusy(false);
    }
  }
  function select(row: Row) {
    setSelectedKey(row.service_key);
    intent.current = null;
    setNotice("");
    setError("");
  }
  const { visible: pagedRows, props: rowPager } = usePagination(rows);
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-muted">
          Reminder 1 day before the due date · missed-dose follow-up from 1 day after.
        </p>
        <Button variant="secondary" size="sm"
          disabled={loading || busy || !online}
          onClick={() => setReload((old) => old + 1)}
        >
          Refresh
        </Button>
      </div>
      {!online && (
        <p className="text-sm text-warn">Reconnect to load current reminder eligibility.</p>
      )}
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
          className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800"
        >
          {notice}
        </p>
      )}
      {data && !data.canSend && (
        <p className="rounded-lg bg-brand-ice p-3 text-sm text-brand-navy">
          View only. Sending is available to RHM and BHW.
        </p>
      )}
      {loading ? (
        <Spinner showLabel label="Loading SMS reminders…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={fieldLabel}>
                <span>Child or service</span>
                <Input
                  value={search}
                  placeholder="Search child or service"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label className={fieldLabel}>
                <span>Status</span>
                <Select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  {["ALL", "UPCOMING", "DUE_TODAY", "OVERDUE"].map((value) => (
                    <option key={value} value={value}>
                      {phaseLabel(value)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className={fieldLabel}>
                <span>Due from</span>
                <DateInput
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label className={fieldLabel}>
                <span>Due through</span>
                <DateInput
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </div>
            <div className="scroll-subtle overflow-x-auto rounded-xl border border-brand-line">
              <table className="data-grid w-full text-left text-sm text-brand-navy">
                <thead>
                  <tr>
                    {[
                      "Child",
                      "Service",
                      "Due date",
                      "Status",
                      "SMS status",
                      "Live sending status",
                      "Demo result",
                    ].map((label, index) => (
                      <th key={index} scope="col" className={gridHead}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7}><EmptyState icon={MessageSquare} title="No follow-ups match these filters" description="Saved follow-ups with a valid number will appear here." /></td>
                    </tr>
                  ) : (
                    pagedRows.map((row, i) => (
                      <tr key={row.service_key} data-zebra={i % 2 === 1 || undefined}>
                        <td className={gridCell}>
                          <Link
                            href={`/child-profiling/children/${row.child_id}`}
                            className="font-semibold text-link underline-offset-4 hover:underline"
                          >
                            {row.child_name}
                          </Link>
                        </td>
                        <td className={gridCell}>{row.service_name}</td>
                        <td className={gridCell}>{row.due_date}</td>
                        <td className={gridCell}>
                          {phaseLabel(row.phase)}
                        </td>
                        <td className={gridCell}>
                          {row.contact_status !== "CONFIRMED"
                            ? contacts[row.contact_status]
                            : row.notification_id
                              ? `${row.queue_status?.replace(/_/g, " ")} · ${row.delivery_status}`
                              : row.eligible
                                ? "Ready to queue"
                                : `Next reminder: ${row.phase === "OVERDUE" ? row.overdue_date : row.upcoming_date}`}
                        </td>
                        <td className={gridCell}>{row.live_status?.replace(/_/g, ' ') ?? (row.live_contact_verified ? 'Not submitted' : 'OTP verification required')}</td>
                        <td className={gridCell}>
                          {row.simulation_status?.replace(/_/g, " ") ??
                            "No simulation yet"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination {...rowPager} label="Follow-up pages" />
            {selected && (
              <div className="space-y-4 rounded-xl border border-brand-line bg-brand-ice/40 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className={cn(fieldLabel, 'min-w-0 flex-1')}>
                    <span>Child / reminder</span>
                    <Select
                      aria-label="Child reminder preview"
                      disabled={busy}
                      value={selected.service_key}
                      onChange={(event) => {
                        const row = data.rows.find(
                          (r) => r.service_key === event.target.value,
                        );
                        if (row) select(row);
                      }}
                      className="block w-full"
                    >
                      {data.rows.map((row) => (
                        <option key={row.service_key} value={row.service_key}>
                          {row.child_name} · {row.service_name} · {row.due_date}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <span className="pb-2.5 text-sm font-medium tabular-nums text-brand-navy">{selected.masked_number ?? "No confirmed number"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={fieldLabel}>
                    <p>Message</p>
                    <p className="rounded-lg border border-brand-line bg-white px-3 py-2 text-sm font-normal text-brand-navy">
                      {messageType === "OVERDUE"
                        ? "Missed-dose follow-up"
                        : "Reminder before the due date"}
                    </p>
                  </div>
                  <div className={fieldLabel}>
                    <p>Reminder date</p>
                    <p className="rounded-lg border border-brand-line bg-white px-3 py-2 text-sm font-normal text-brand-navy">
                      {reminderDate}
                    </p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap rounded-lg border border-brand-line bg-white p-3 text-sm text-brand-navy">
                  {message}
                </p>
                {!selected.rule_active && (
                  <p className="text-xs text-warn">The reminder rule is inactive.</p>
                )}
                {!selected.eligible && (
                  <p className="text-xs text-brand-muted">
                    Sendable from {selected.upcoming_date}; follow-up from {selected.overdue_date}. Needs guardian consent and a valid number.
                  </p>
                )}
                {selected.phase !== messageType && (
                  <p className="text-xs text-brand-muted">Preview only: not today&apos;s eligible message.</p>
                )}
                {data.canSend && data.mode === 'live' && <div className="space-y-2">
                  {!data.liveEnabled && <p className="text-xs text-warn">Live sending is not configured on the server.</p>}
                  {!selected.live_contact_verified && <p className="text-xs text-warn">Verify the guardian&apos;s number by OTP in the child profile first.</p>}
                  {selected.live_status && <p className="text-xs text-brand-muted">Live attempt: {selected.live_status.replace(/_/g, ' ')} (not yet confirmed delivered).</p>}
                  <Button disabled={!liveReady} onClick={() => void sendLive()}>{busy ? 'Submitting…' : 'Send guardian SMS'}</Button>
                </div>}
                {data.canSend && data.simulationEnabled && (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        disabled={!ready}
                        onClick={() => void send("SIMULATED_SENT")}
                      >
                        {busy && <Spinner className="mr-2" />}
                        {busy
                          ? "Saving…"
                          : data.previewEnabled
                            ? "Simulate Send — Preview"
                            : "Simulate Send"}
                      </Button>
                      <Select
                        aria-label="Simulated error scenario"
                        value={errorCode}
                        disabled={busy}
                        onChange={(event) => {
                          setErrorCode(event.target.value as ErrorCode);
                          intent.current = null;
                        }}
                       
                      >
                        {(Object.keys(scenarios) as ErrorCode[]).map((code) => (
                          <option key={code} value={code}>
                            {scenarios[code]}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="secondary"
                        disabled={!ready}
                        onClick={() => void send("SIMULATED_FAILED")}
                        className="text-danger"
                      >
                        Simulate Error
                      </Button>
                    </div>
                    <p className="text-xs text-brand-muted">
                      Simulation records a labelled demo only; nothing is sent to the guardian.
                    </p>
                  </>
                )}
              </div>
            )}
            <p className="text-xs text-brand-muted">
              Shows up to 200 follow-ups. Message history is in the child&apos;s Guardian Information.
            </p>
          </>
        )
      )}
    </section>
  );
}
