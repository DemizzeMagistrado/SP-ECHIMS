"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Program = "VACCINATION" | "SUPPLEMENTATION";
type MessageType = "UPCOMING" | "OVERDUE";
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
};
type Data = {
  currentUserId: string;
  program: Program;
  canSend: boolean;
  simulationEnabled: boolean;
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
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Guardian messages</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upcoming message: one day before due. Overdue follow-up: starts one
            day after due.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy || !online}
          onClick={() => setReload((old) => old + 1)}
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      {!online && (
        <p className="text-sm text-amber-800">
          Reconnect to load current reminder eligibility.
        </p>
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
        <p className="rounded-lg bg-muted/40 p-3 text-sm">
          Viewing access. SMS sending and simulation are available only to RHM
          and BHW.
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading SMS reminders…</p>
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-xs">
                <span>Child or service</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-lg border p-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span>Status</span>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="w-full rounded-lg border p-2 text-sm"
                >
                  {["ALL", "UPCOMING", "DUE_TODAY", "OVERDUE"].map((value) => (
                    <option key={value} value={value}>
                      {value.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span>Due from</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="w-full rounded-lg border p-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span>Due through</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="w-full rounded-lg border p-2 text-sm"
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      "Child",
                      "Service",
                      "Due date",
                      "Status",
                      "SMS status",
                      "Demo result",
                    ].map((label, index) => (
                      <th key={index} className="px-3 py-3 text-xs font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-5 text-muted-foreground"
                      >
                        No valid saved follow-ups match these filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.service_key}>
                        <td className="px-3 py-3">
                          <Link
                            href={`/child-profiling/children/${row.child_id}`}
                            className="font-medium text-primary underline"
                          >
                            {row.child_name}
                          </Link>
                        </td>
                        <td className="px-3 py-3">{row.service_name}</td>
                        <td className="px-3 py-3">{row.due_date}</td>
                        <td className="px-3 py-3">
                          {row.phase.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-3">
                          {row.contact_status !== "CONFIRMED"
                            ? contacts[row.contact_status]
                            : row.notification_id
                              ? `${row.queue_status?.replace(/_/g, " ")} · ${row.delivery_status}`
                              : row.eligible
                                ? "Ready to queue"
                                : `Next reminder: ${row.phase === "OVERDUE" ? row.overdue_date : row.upcoming_date}`}
                        </td>
                        <td className="px-3 py-3">
                          {row.simulation_status?.replace(/_/g, " ") ??
                            "No simulation yet"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {selected && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <label className="min-w-0 flex-1 text-xs">
                    Child / reminder
                    <select
                      aria-label="Child reminder preview"
                      disabled={busy}
                      value={selected.service_key}
                      onChange={(event) => {
                        const row = data.rows.find(
                          (r) => r.service_key === event.target.value,
                        );
                        if (row) select(row);
                      }}
                      className="mt-1 block w-full rounded-lg border bg-white p-2 text-sm"
                    >
                      {data.rows.map((row) => (
                        <option key={row.service_key} value={row.service_key}>
                          {row.child_name} · {row.service_name} · {row.due_date}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>{selected.masked_number ?? "No confirmed number"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="text-xs">
                    <p>Automatic message</p>
                    <p className="mt-2 rounded-lg border bg-white p-2 text-sm">
                      {messageType === "OVERDUE"
                        ? "Overdue follow-up"
                        : "Upcoming reminder"}
                    </p>
                  </div>
                  <div className="text-xs">
                    <p>Automatic reminder date</p>
                    <p className="mt-2 rounded-lg border bg-white p-2 text-sm">
                      {reminderDate}
                    </p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm">
                  {message}
                </p>
                {!selected.rule_active && (
                  <p className="text-xs text-amber-800">
                    The reminder rule is inactive.
                  </p>
                )}
                {!selected.eligible && (
                  <p className="text-xs text-muted-foreground">
                    Upcoming reminders are eligible on {selected.upcoming_date};
                    overdue follow-ups start {selected.overdue_date}. Current
                    guardian consent and a valid number are required.
                  </p>
                )}
                {selected.phase !== messageType && (
                  <p className="text-xs text-muted-foreground">
                    This preview is not the eligible message for today's date.
                  </p>
                )}
                {data.canSend && (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={!ready}
                        onClick={() => void send("SIMULATED_SENT")}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {busy
                          ? "Saving…"
                          : data.previewEnabled
                            ? "Simulate Send — Preview"
                            : "Simulate Send"}
                      </button>
                      <select
                        aria-label="Simulated error scenario"
                        value={errorCode}
                        disabled={busy}
                        onChange={(event) => {
                          setErrorCode(event.target.value as ErrorCode);
                          intent.current = null;
                        }}
                        className="rounded-lg border bg-white p-2 text-sm"
                      >
                        {(Object.keys(scenarios) as ErrorCode[]).map((code) => (
                          <option key={code} value={code}>
                            {scenarios[code]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!ready}
                        onClick={() => void send("SIMULATED_FAILED")}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                      >
                        Simulate Error
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Presentation preview can run before the reminder date when
                      enabled. It records a labelled demo only. Live SMS sending
                      remains disabled until the provider is integrated.
                    </p>
                  </>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Up to 200 scoped follow-ups. Existing event keys prevent
              hourly/daily queue duplicates. Guardian Information shows saved
              message and attempt history.
            </p>
          </>
        )
      )}
    </section>
  );
}
