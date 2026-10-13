import { moduleRoutes } from "@/lib/echims-data";
export type AlertDestinationInput = {
  source_module?: string | null;
  alert_type?: string | null;
  child_id?: number | null;
  inventory_id?: number | null;
  schedule_id?: number | null;
};
function id(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function internal(path: unknown): string | null {
  return typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !/[\r\n]/.test(path)
    ? path
    : null;
}
export function alertDestination(alert: AlertDestinationInput) {
  const type = (alert.alert_type ?? "").toUpperCase(),
    source = (alert.source_module ?? "").trim().toUpperCase();
  let program = source;
  if (!program) {
    if (type.startsWith("NUT_")) program = "NUTRITION";
    else if (type.startsWith("NIP_")) program = "VACCINATION";
    else if (type.startsWith("MSP_")) program = "SUPPLEMENTATION";
    else if (type.startsWith("INV_")) program = "INVENTORY";
    else if (type.startsWith("HEALTH_ACTIVITY")) program = "HEALTH_ACTIVITY";
  }
  const destinations: Record<string, { href: string; label: string }> = {
    NUTRITION: {
      href: moduleRoutes["Nutritional Assessment"],
      label: "View nutritional assessments",
    },
    NUTRITIONAL_ASSESSMENT: {
      href: moduleRoutes["Nutritional Assessment"],
      label: "View nutritional assessments",
    },
    VACCINATION: { href: moduleRoutes.Vaccination, label: "View vaccination" },
    SUPPLEMENTATION: {
      href: moduleRoutes.Supplementation,
      label: "View supplementation",
    },
    INVENTORY: { href: moduleRoutes.Inventory, label: "View inventory" },
    HEALTH_ACTIVITY: {
      href: "/health-activities",
      label: "View health activities",
    },
    HEALTH_ACTIVITIES: {
      href: "/health-activities",
      label: "View health activities",
    },
  };
  const match = destinations[program],
    moduleHref = internal(match?.href);
  const childHref = id(alert.child_id)
    ? `/child-profiling/children/${alert.child_id}`
    : null;
  // Existing module pages are opened as-is; no unsupported URL filters are invented.
  const primaryHref =
    childHref ??
    moduleHref ??
    (id(alert.inventory_id)
      ? internal(moduleRoutes.Inventory)
      : id(alert.schedule_id)
        ? "/health-activities"
        : null);
  return {
    primaryHref,
    childHref,
    moduleHref,
    moduleLabel: match?.label ?? "View related page",
  };
}
