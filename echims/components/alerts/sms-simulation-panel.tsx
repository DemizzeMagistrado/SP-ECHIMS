"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useEffect, useState } from "react";
import { Spinner } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { DataTable } from '@/components/ui/data-table'
import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  usePageLoading(loading)
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
        <Button variant="secondary"
          disabled={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          Refresh
        </Button>
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
        <Spinner showLabel label="Loading SMS overview…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
      )}
      <DataTable
        rows={queue}
        rowKey={(row) => row.notification_id}
        caption="SMS queue"
        empty={{ icon: MessageSquare, title: "No queued SMS for this program", description: "Reminders waiting to send will appear here." }}
        columns={[
          { key: "child", header: "Child", sortValue: (row) => row.child_name, cell: (row) => <>{row.child_name}<p className="text-xs text-muted-foreground">{row.masked_number}</p></> },
          { key: "message", header: "Message", cell: (row) => row.message },
          { key: "delivery", header: "Actual delivery", sortValue: (row) => row.delivery_status, cell: (row) => row.delivery_status },
          { key: "queue", header: "Queue status", sortValue: (row) => row.queue_status, cell: (row) => row.queue_status.replace(/_/g, " ") },
        ]}
      />
      <h3 className="text-sm font-semibold">Simulation attempt history</h3>
      <p className="text-xs text-muted-foreground">
        Historical Administrator demo attempts are retained. New attempts
        require an assigned RHM/BHW. Simulated results do not indicate real
        delivery.
      </p>
      <DataTable
        rows={attempts}
        rowKey={(row) => row.simulation_id}
        caption="Simulation attempt history"
        empty={{ icon: MessageSquare, title: "No simulation attempts yet", description: "Simulated sends for this program will be logged here." }}
        columns={[
          { key: "reminder", header: "Reminder", sortValue: (row) => row.notification_id, cell: (row) => `#${row.notification_id}` },
          { key: "result", header: "Result", sortValue: (row) => row.outcome, cell: (row) => row.outcome.replace(/_/g, " ") },
          { key: "error", header: "Error", cell: (row) => row.error_code?.replace(/_/g, " ") ?? "—" },
          { key: "by", header: "Performed by", sortValue: (row) => row.performed_by, cell: (row) => row.performed_by },
          { key: "time", header: "Time", sortValue: (row) => row.created_at, cell: (row) => new Date(row.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) },
        ]}
      />
    </section>
  );
}
