"use client";
import { ProgramSmsPanel } from "@/components/sms/program-sms-panel";
export function SupplementationSmsPanel({
  ownerId,
  online = true,
}: {
  ownerId: string;
  online?: boolean;
}) {
  return (
    <ProgramSmsPanel
      key={`${ownerId}:SUPPLEMENTATION`}
      program="SUPPLEMENTATION"
      ownerId={ownerId}
      online={online}
    />
  );
}
