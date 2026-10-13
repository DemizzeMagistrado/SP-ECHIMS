        import type { ReportRow } from "@/lib/reports/report-utils";
export type Member = {
  child: ReportRow;
  profile: ReportRow;
  guardian: ReportRow;
  household: ReportRow;
};
export function object(v: unknown): ReportRow {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as ReportRow)
    : {};
}
export function value(v: unknown): string {
  return v === null || v === undefined || v === "" ? "Not recorded" : String(v);
}
export function displayName(v: ReportRow) {
  return (
    [v.first_name, v.middle_name, v.last_name]
      .filter((x) => typeof x === "string" && x.trim())
      .join(" ") || "Not recorded"
  );
}
export function members(module: string, rows: ReportRow[]): Member[] {
  const result: Member[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const list =
      module === "CHILD"
        ? [row]
        : Array.isArray(row.linked_children)
          ? row.linked_children.map(object)
          : [];
    for (const child of list) {
      if (child.child_id == null) continue;
      const id = String(child.child_id);
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        child,
        profile: object(child.profile),
        guardian: object(child.guardian),
        household:
          module === "CHILD"
            ? {
                ...object(child.household),
                household_id: child.household_id,
                barangay_name: child.barangay_name,
              }
            : row,
      });
    }
  }
  return result.sort(
    (a, b) =>
      String(
        a.household.household_no ?? a.household.household_id ?? "",
      ).localeCompare(
        String(b.household.household_no ?? b.household.household_id ?? ""),
      ) ||
      String(a.child.child_name ?? "").localeCompare(
        String(b.child.child_name ?? ""),
      ),
  );
}
export function uniqueGuardians(list: Member[]) {
  return new Set(
    list
      .map((m) => m.guardian.guardian_id ?? m.child.guardian_id)
      .filter((v) => v !== null && v !== undefined)
      .map(String),
  ).size;
}
export function fourPs(h: ReportRow) {
  return h.is_4ps_member === true
    ? "4Ps"
    : h.is_4ps_member === false
      ? "Non-4Ps"
      : "Unknown";
}
export function householdAttributes(list: Member[], field: string) {
  const map = new Map<string, { h: ReportRow; values: Set<string> }>();
  for (const m of list) {
    const id = String(
      m.household.household_id ?? m.child.household_id ?? "unknown",
    );
    if (!map.has(id)) map.set(id, { h: m.household, values: new Set() });
    const raw = m.profile[field];
    if (typeof raw === "string" && raw.trim())
      map.get(id)!.values.add(raw.trim());
  }
  return [...map.values()].map((x) => ({
    category:
      x.values.size === 0
        ? "Not recorded"
        : x.values.size === 1
          ? [...x.values][0]
          : "Conflicting recorded values — review",
    group: fourPs(x.h),
  }));
}
export function householdCounts(list: Member[]) {
  const seen = new Map<string, ReportRow>();
  for (const m of list) {
    const id = m.household.household_id ?? m.child.household_id;
    if (id != null) seen.set(String(id), m.household);
  }
  return {
    total: seen.size,
    fourPs: [...seen.values()].filter((h) => h.is_4ps_member === true).length,
    nonFourPs: [...seen.values()].filter((h) => h.is_4ps_member === false)
      .length,
    unknown: [...seen.values()].filter(
      (h) => typeof h.is_4ps_member !== "boolean",
    ).length,
  };
}
export const bands = [
  { label: "0–5 months", min: 0, max: 5 },
  { label: "6–11 months", min: 6, max: 11 },
  { label: "12–23 months", min: 12, max: 23 },
  { label: "24–35 months", min: 24, max: 35 },
  { label: "36–47 months", min: 36, max: 47 },
  { label: "48–59 months", min: 48, max: 59 },
];
