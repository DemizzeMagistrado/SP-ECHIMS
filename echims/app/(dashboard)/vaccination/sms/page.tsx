"use client";
import { useAuth } from "@/components/auth/auth-provider";
import { ModuleTabs } from "@/components/dashboard/module-tabs";
import { VaccinationSmsPanel } from "@/components/vaccination/vaccination-sms-panel";
import { canPerform, type UserRole } from "@/lib/echims-data";

export default function VaccinationSmsPage() {
  const { user, isReady } = useAuth();
  const role = user?.role as UserRole | undefined;
  if (!isReady)
    return <p className="text-sm text-muted-foreground">Checking session…</p>;
  if (!role || !canPerform(role, "Vaccination", "view"))
    return <p role="alert">You cannot view vaccination reminders.</p>;
  return (
    <div className="space-y-6">
      <ModuleTabs parent="Vaccination" role={role} />
      <div>
        <h1 className="text-3xl font-bold">Vaccination SMS Reminders</h1>
        <p className="mt-1 text-muted-foreground">
          Guardian messages and presentation simulation history
        </p>
      </div>
      <VaccinationSmsPanel />
    </div>
  );
}
