"use client";
import { useState } from "react";
import { ProgramSmsPanel } from "@/components/sms/program-sms-panel";
import { BulkReminderWizard, type ReminderData } from "@/components/vaccination/schedule-reminders";

// Shown inside the Supplementation "Send reminders" popup (FIX 1): the reviewed single reminder,
// "View SMS logs", and "Send bulk reminders", which opens the bulk wizard on top.
export function SupplementationSmsPanel({
  ownerId,
  online = true,
}: {
  ownerId: string;
  online?: boolean;
}) {
  const [bulk, setBulk] = useState<ReminderData | null>(null);
  return (
    <>
      <ProgramSmsPanel
        key={`${ownerId}:SUPPLEMENTATION`}
        program="SUPPLEMENTATION"
        ownerId={ownerId}
        online={online}
        onBulk={setBulk}
      />
      {bulk?.currentUserId === ownerId && (
        <BulkReminderWizard
          program="SUPPLEMENTATION"
          data={bulk}
          rows={bulk.rows}
          onClose={() => setBulk(null)}
          onSent={() => setBulk(null)}
        />
      )}
    </>
  );
}
