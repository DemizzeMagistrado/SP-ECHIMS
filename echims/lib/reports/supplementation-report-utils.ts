import type { ReportRow } from "@/lib/reports/report-utils";
export type SupplyMode = "ADMINISTERED" | "DISPENSED";
export function object(v: unknown): ReportRow {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as ReportRow)
    : {};
}
export function quantity(v: unknown): number | null {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function age(v: unknown) {
  const n = quantity(v);
  return n !== null && n < 60 ? n : null;
}
export function selectedRows(rows: ReportRow[], mode: SupplyMode) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (r.record_type !== mode || age(r.age_months) === null) return false;
    const key =
      r.supplementation_record_id == null
        ? null
        : String(r.supplementation_record_id);
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}
export function tier(r: ReportRow) {
  const v = r.tier ?? object(r.protocol_snapshot).tier;
  return ["ROUTINE", "TARGETED", "CLINICAL"].includes(String(v))
    ? String(v)
    : "Not recorded";
}
export function recipients(rows: ReportRow[]) {
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (r.child_id == null) return false;
    const id = String(r.child_id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return {
    male: unique.filter((r) => r.sex === "MALE").length,
    female: unique.filter((r) => r.sex === "FEMALE").length,
    unknown: unique.filter((r) => !["MALE", "FEMALE"].includes(String(r.sex)))
      .length,
    total: unique.length,
  };
}
export function sumStock(rows: ReportRow[]) {
  const values = rows.map((r) => quantity(r.quantity_given));
  return values.some((v) => v === null)
    ? null
    : values.reduce<number>((sum, v) => sum + v!, 0);
}
export function productTotals(rows: ReportRow[]) {
  const map = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const key =
      String(r.supplement_id) + ":" + String(r.unit ?? "Not recorded");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return [...map.values()].map((list) => ({
    name: String(list[0].item_name ?? "Not recorded"),
    unit: String(list[0].unit ?? "Not recorded"),
    events: list.length,
    stock: sumStock(list),
    ...recipients(list),
  }));
}
export function indicator(
  rows: ReportRow[],
  type: string,
  min: number,
  max: number,
  savedTier?: string,
) {
  return rows.filter(
    (r) =>
      r.supplement_type === type &&
      age(r.age_months) !== null &&
      age(r.age_months)! >= min &&
      age(r.age_months)! <= max &&
      (!savedTier || tier(r) === savedTier),
  );
}
export function planRemaining(plan: ReportRow) {
  const a = quantity(plan.authorized_quantity),
    d = quantity(plan.dispensed_through_period_end);
  return a === null || d === null ? null : a - d;
}
