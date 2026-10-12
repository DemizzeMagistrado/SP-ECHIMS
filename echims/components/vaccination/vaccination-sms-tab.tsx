"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { canPerform, type UserRole } from "@/lib/echims-data";

export function VaccinationSmsTab({ role }: { role?: UserRole }) {
  const pathname = usePathname();
  if (!role || !canPerform(role, "Vaccination", "view")) return null;
  const active = pathname === "/vaccination/sms";
  return (
    <Link
      href="/vaccination/sms"
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center border-b-2 px-4 py-3 text-sm font-medium ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-primary"}`}
    >
      SMS Reminders
    </Link>
  );
}
