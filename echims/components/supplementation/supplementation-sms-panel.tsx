"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  BulkReminderWizard,
  type ReminderData,
} from "@/components/vaccination/schedule-reminders";

export function SupplementationSmsPanel({
  ownerId,
  online,
}: {
  ownerId: string;
  online: boolean;
}) {
  const [data, setData] = useState<ReminderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openWizard() {
    if (loading || !online) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/sms/reminders?program=SUPPLEMENTATION",
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.error || "Could not load supplementation reminders.");
      }
      if (body?.currentUserId !== ownerId || !Array.isArray(body.rows)) {
        throw new Error("Your session changed. Refresh and try again.");
      }
      if (!body.canSend) {
        throw new Error("Sending supplementation reminders is unavailable for this account.");
      }

      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open reminders.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/alerts?tab=SMS_LOGS" className={buttonVariants({ variant: "tonal" })}>
        <MessageSquare size={16} aria-hidden="true" /> SMS logs
      </Link>
      <Button variant="tonal" disabled={!online || loading} onClick={() => void openWizard()}>
        <Send size={16} aria-hidden="true" /> {loading ? "Loading…" : "Send reminders"}
      </Button>
      {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
      {data?.currentUserId === ownerId && (
        <BulkReminderWizard
          program="SUPPLEMENTATION"
          data={data}
          rows={data.rows}
          onClose={() => setData(null)}
          onSent={() => setData(null)}
        />
      )}
    </div>
  );
}