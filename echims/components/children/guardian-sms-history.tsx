"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";

type Attempt = {
  simulation_id: number;
  outcome: string;
  error_code: string | null;
  message_snapshot: string;
  created_at: string;
  performed_by: string;
};
type Reminder = {
  notification_id: number;
  notification_type: string;
  source_module: string | null;
  message: string;
  delivery_status: string;
  queue_status: string;
  created_at: string;
  sent_at: string | null;
  masked_number: string | null;
  simulation_attempts: Attempt[];
};
type History = {
  currentUserId: string;
  childId: number;
  guardianId: number;
  reminders: Reminder[];
};
function time(value: string | null) {
  if (!value) return "Not sent";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString("en-PH", { timeZone: "Asia/Manila" })
    : "Unavailable";
}
const errors: Record<string, string> = {
  NETWORK_ERROR: "Network error",
  INSUFFICIENT_CREDITS: "Insufficient credits",
  PROVIDER_ERROR: "Provider error",
};
function reminderLabel(type: string) {
  const program = type.startsWith("VACCINATION")
    ? "Vaccination"
    : type.startsWith("SUPPLEMENTATION")
      ? "Supplementation"
      : "Health";
  if (type.includes("UPCOMING")) return `${program} — Upcoming reminder`;
  if (type.includes("OVERDUE")) return `${program} — Overdue reminder`;
  return `${program} reminder`;
}

export function GuardianSmsHistory({
  childId,
  guardianId,
}: {
  childId: number;
  guardianId: number;
}) {
  const sharedAuth = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const ownerRef = useRef<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const pending = useRef(new Set<AbortController>());

  useEffect(() => {
    mounted.current = true;
    const activeRequests = pending.current;
    const apply = (id: string | null) => {
      if (!mounted.current) return;
      if (ownerRef.current === id) {
        if (!id) {
          setLoading(false);
          setData(null);
          setError("Please sign in to view SMS history.");
        }
        return;
      }
      ownerRef.current = id;
      generation.current++;
      pending.current.forEach((controller) => controller.abort());
      pending.current.clear();
      setOwner(id);
      setData(null);
      setError("");
      setLoading(Boolean(id));
    };
    if(sharedAuth.isReady) apply(sharedAuth.user?.id ?? null);
    return () => {
      mounted.current = false;
      generation.current++;
      activeRequests.forEach((controller) => controller.abort());
      activeRequests.clear();
    };
  }, [sharedAuth.isReady, sharedAuth.user?.id]);

  const refresh = useCallback(async () => {
    if (!owner || ownerRef.current !== owner) return;
    const current = ++generation.current;
    const controller = new AbortController();
    pending.current.add(controller);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/children/${childId}/guardian-sms?guardian_id=${guardianId}`,
        { cache: "no-store", signal: controller.signal },
      );
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Unable to load child SMS history.",
        );
      if (
        !result ||
        typeof result !== "object" ||
        !("currentUserId" in result) ||
        result.currentUserId !== owner ||
        !("childId" in result) ||
        result.childId !== childId ||
        !("guardianId" in result) ||
        result.guardianId !== guardianId ||
        !("reminders" in result) ||
        !Array.isArray(result.reminders)
      )
        throw new Error(
          "Unexpected SMS history response. Check the API route and refresh the profile.",
        );
      if (
        mounted.current &&
        generation.current === current &&
        ownerRef.current === owner
      )
        setData(result as History);
    } catch (cause) {
      if (
        mounted.current &&
        generation.current === current &&
        !(cause instanceof Error && cause.name === "AbortError")
      ) {
        setData(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load SMS history.",
        );
      }
    } finally {
      pending.current.delete(controller);
      if (mounted.current && generation.current === current) setLoading(false);
    }
  }, [owner, childId, guardianId]);
  useEffect(() => {
    setData(null);
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => {
      clearInterval(id);
      generation.current++;
    };
  }, [refresh]);

  return (
    <details className="group mt-4 rounded-xl border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>Guardian SMS status</span>
        <span className="text-xs font-medium text-primary">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Message history</h3>
          <button
            type="button"
            disabled={loading || !owner}
            onClick={() => void refresh()}
            className="text-xs font-medium text-primary underline disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Simulated results are for presentation. Simulation times do not mean
          an actual text was sent.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {loading && !data && (
          <p className="text-sm text-muted-foreground">Loading SMS history…</p>
        )}
        {data?.reminders.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No SMS reminders recorded for this child and guardian.
          </p>
        )}
        {data?.reminders.map((reminder) => {
          const latest = reminder.simulation_attempts[0];
          const lastSimulatedSent = reminder.simulation_attempts.find(
            (attempt) => attempt.outcome === "SIMULATED_SENT",
          );
          return (
            <article
              key={reminder.notification_id}
              className="space-y-3 rounded-lg bg-muted/30 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold">
                  {reminderLabel(reminder.notification_type)}
                </p>
                {latest && (
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${latest.outcome === "SIMULATED_SENT" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                  >
                    {latest.outcome.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm">
                {latest?.message_snapshot ?? reminder.message}
              </p>
              {latest?.error_code && (
                <p className="text-xs text-red-700">
                  Simulation error:{" "}
                  {errors[latest.error_code] ?? latest.error_code}
                </p>
              )}
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">
                    Actual delivery status
                  </dt>
                  <dd className="mt-1 font-medium">
                    {reminder.delivery_status.replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Actual time sent</dt>
                  <dd className="mt-1">{time(reminder.sent_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Queue status</dt>
                  <dd className="mt-1">
                    {reminder.queue_status.replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Guardian number</dt>
                  <dd className="mt-1">
                    {reminder.masked_number ?? "Unavailable"}
                  </dd>
                </div>
                {latest && (
                  <div>
                    <dt className="text-muted-foreground">
                      Latest simulation time
                    </dt>
                    <dd className="mt-1">{time(latest.created_at)}</dd>
                  </div>
                )}
                {lastSimulatedSent && (
                  <div>
                    <dt className="text-muted-foreground">
                      Simulated sent time
                    </dt>
                    <dd className="mt-1">
                      {time(lastSimulatedSent.created_at)}
                    </dd>
                  </div>
                )}
              </dl>
              {reminder.simulation_attempts.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-primary">
                    Simulation history
                  </summary>
                  <div className="mt-2 space-y-2">
                    {reminder.simulation_attempts.map((attempt) => (
                      <div
                        key={attempt.simulation_id}
                        className="rounded border border-border p-2"
                      >
                        <p className="font-medium">
                          {attempt.outcome.replace(/_/g, " ")}
                          {attempt.error_code
                            ? ` · ${errors[attempt.error_code] ?? attempt.error_code}`
                            : ""}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {time(attempt.created_at)} · {attempt.performed_by}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}
    