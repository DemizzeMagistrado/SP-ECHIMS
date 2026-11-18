"use client";
import { Select } from '@/components/ui/form'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useEffect, useState } from "react";
import { Spinner } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { GridTable } from '@/components/ui/grid-table'
import { FilterCard, SectionHeader } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { StatusBadge } from '@/components/ui/status-badge'
import { MessageSquare, RefreshCw } from 'lucide-react'
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
  const label = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  // Delivery / queue states as badges: delivered and sent green, failed red, pending and queued amber.
  const tone = (value: string) => /FAIL|ERROR|BLOCK/.test(value) ? "danger" as const : /DELIVER|SENT|SUCCE/.test(value) ? "good" as const : /PEND|QUEUE|WAIT|READY/.test(value) ? "review" as const : "neutral" as const;
  const time = (ts: string) => new Date(ts).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  return (
    <section aria-labelledby="sms-title" className="space-y-4">
      <SectionHeader
        title={<span id="sms-title">System SMS overview</span>}
        subtitle="Read-only system view. RHM and BHW handle sending from their program SMS tabs."
        about={<InfoContent
          title="System SMS overview"
          description="Every SMS reminder in the queue, and every simulated send."
          sections={[{ label: "Values", value: ["Actual delivery = what the SMS gateway reported", "Queue status = where the reminder is in the send queue"] }]}
          note="Simulated results do not indicate real delivery."
        />}
        actions={<Button variant="secondary" disabled={loading} onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : undefined} /> Refresh</Button>}
      />
      <FilterCard>
        <Select aria-label="Program" value={program} onChange={(event) => setProgram(event.target.value)}>
          <option value="ALL">All programs</option>
          <option value="VACCINATION">Vaccination</option>
          <option value="SUPPLEMENTATION">Supplementation</option>
        </Select>
      </FilterCard>
      {error && <p role="alert" className="text-sm text-[#C42B2B]">{error}</p>}
      {loading && <Spinner showLabel label="Loading SMS overview…" className="w-full justify-center py-6 text-sm text-muted-foreground" />}
      <GridTable
        caption="SMS queue"
        rows={queue}
        rowKey={(row) => row.notification_id}
        pageSize={5}
        minWidth={760}
        empty={{ icon: MessageSquare, title: "No queued SMS for this program", description: "Reminders waiting to send will appear here." }}
        columns={[
          { key: "child", header: "Child", width: "22%", cell: (row) => <><span className="block font-semibold text-[#0C1260]">{row.child_name}</span><span className="block text-xs text-[#8896B0]">{row.masked_number}</span></> },
          { key: "message", header: "Message", width: "44%", cell: (row) => <span className="block break-words">{row.message}</span> },
          { key: "delivery", header: "Actual delivery", width: "17%", cell: (row) => <StatusBadge status={row.delivery_status} tone={tone(row.delivery_status)} label={label(row.delivery_status)} /> },
          { key: "queue", header: "Queue status", width: "17%", cell: (row) => <StatusBadge status={row.queue_status} tone={tone(row.queue_status)} label={label(row.queue_status)} /> },
        ]}
      />
      <div className="space-y-1 pt-2">
        <h3 className="text-sm font-semibold text-[#0C1260]">Simulation attempt history</h3>
        <p className="text-xs text-[#55617F]">
          Historical Administrator demo attempts are retained. New attempts
          require an assigned RHM/BHW. Simulated results do not indicate real
          delivery.
        </p>
      </div>
      <GridTable
        caption="Simulation attempt history"
        rows={attempts}
        rowKey={(row) => row.simulation_id}
        pageSize={5}
        minWidth={720}
        empty={{ icon: MessageSquare, title: "No simulation attempts yet", description: "Simulated sends for this program will be logged here." }}
        columns={[
          { key: "reminder", header: "Reminder", cell: (row) => <span className="font-semibold text-[#0C1260]">#{row.notification_id}</span> },
          { key: "result", header: "Result", cell: (row) => <StatusBadge status={row.outcome} tone={tone(row.outcome)} label={label(row.outcome)} /> },
          { key: "error", header: "Error", cell: (row) => row.error_code ? label(row.error_code) : "—" },
          { key: "by", header: "Performed by", cell: (row) => row.performed_by },
          { key: "time", header: "Time", cell: (row) => time(row.created_at) },
        ]}
      />
    </section>
  );
}
