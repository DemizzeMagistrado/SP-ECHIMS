"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useEffect, useState } from "react";
type Queue = {
  notification_id: number;
  child_id: number;
  child_name: string;
  notification_type: string;
  message: string;
  delivery_status: string;
  queue_status: string;
  created_at: string;
  masked_number: string | null;
};
type Attempt = {
  simulation_id: number;
  notification_id: number;
  outcome: string;
  error_code: string | null;
  message_snapshot: string;
  created_at: string;
  performed_by: string;
};
type Data = { currentUserId: string; queue: Queue[]; attempts: Attempt[] };
export function SmsSimulationPanel({ ownerId }: { ownerId: string }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0),
    [program, setProgram] = useState("ALL");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setData(null);
    setError("");
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/sms/simulation", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : "Unable to load SMS overview.",
          );
        if (
          !body ||
          typeof body !== "object" ||
          !("currentUserId" in body) ||
          body.currentUserId !== ownerId ||
          !("queue" in body) ||
          !Array.isArray(body.queue) ||
          !("attempts" in body) ||
          !Array.isArray(body.attempts)
        )
          throw new Error("SMS session changed. Refresh the page.");
        if (active) setData(body as Data);
      } catch (cause) {
        if (active && !(cause instanceof Error && cause.name === "AbortError"))
          setError(
            cause instanceof Error ? cause.message : "Unable to load overview.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [ownerId, reload]);
  const queue = (data?.queue ?? []).filter(
    (row) => program === "ALL" || row.notification_type.startsWith(program),
  );
  const ids = new Set(queue.map((row) => row.notification_id));
  const attempts = (data?.attempts ?? []).filter(
    (row) => program === "ALL" || ids.has(row.notification_id),
  );
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">System SMS overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only system view. RHM and BHW handle sending from their program
            SMS tabs.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => setReload((value) => value + 1)}
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
      <label className="block text-sm">
        Program
        <select
          value={program}
          onChange={(event) => setProgram(event.target.value)}
          className="ml-3 rounded-lg border px-3 py-2"
        >
          <option value="ALL">All programs</option>
          <option value="VACCINATION">Vaccination</option>
          <option value="SUPPLEMENTATION">Supplementation</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading SMS overview…</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Child", "Message", "Actual delivery", "Queue status"].map(
                (value) => (
                  <th key={value} className="px-3 py-3 text-xs font-medium">
                    {value}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {queue.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-5 text-muted-foreground">
                  No SMS queue rows match this program.
                </td>
              </tr>
            ) : (
              queue.map((row) => (
                <tr key={row.notification_id}>
                  <td className="px-3 py-3">
                    {row.child_name}
                    <p className="text-xs text-muted-foreground">
                      {row.masked_number}
                    </p>
                  </td>
                  <td className="px-3 py-3">{row.message}</td>
                  <td className="px-3 py-3">{row.delivery_status}</td>
                  <td className="px-3 py-3">
                    {row.queue_status.replace(/_/g, " ")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <h3 className="text-sm font-semibold">Simulation attempt history</h3>
      <p className="text-xs text-muted-foreground">
        Historical Administrator demo attempts are retained. New attempts
        require an assigned RHM/BHW. Simulated results do not indicate real
        delivery.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Reminder", "Result", "Error", "Performed by", "Time"].map(
                (value) => (
                  <th key={value} className="px-3 py-3 text-xs font-medium">
                    {value}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {attempts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-5 text-muted-foreground">
                  No simulation attempts match this program.
                </td>
              </tr>
            ) : (
              attempts.map((row) => (
                <tr key={row.simulation_id}>
                  <td className="px-3 py-3">#{row.notification_id}</td>
                  <td className="px-3 py-3">
                    {row.outcome.replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-3">
                    {row.error_code?.replace(/_/g, " ") ?? "—"}
                  </td>
                  <td className="px-3 py-3">{row.performed_by}</td>
                  <td className="px-3 py-3">
                    {new Date(row.created_at).toLocaleString("en-PH", {
                      timeZone: "Asia/Manila",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
