export type ReportRow = Record<string, unknown>;
export const labels: Record<string, string> = {
  CHILD: "Child Profile",
  HOUSEHOLD: "Household",
  VACCINATION: "Vaccination",
  NUTRITION: "Nutrition",
  SUPPLEMENTATION: "Supplementation",
  INVENTORY: "Inventory",
};
export const columns: Record<string, string[]> = {
  CHILD: [
    "child_id",
    "child_name",
    "registration_date",
    "date_of_birth",
    "age_months",
    "sex",
    "barangay_name",
    "household_id",
    "status",
  ],
  HOUSEHOLD: [
    "household_id",
    "household_no",
    "household_address",
    "purok",
    "barangay_name",
    "is_4ps_member",
    "linked_children",
  ],
  VACCINATION: [
    "vaccination_record_id",
    "child_id",
    "child_name",
    "barangay_name",
    "vaccination_date",
    "vaccine_type",
    "dose_number",
    "is_prior",
    "prior_source",
    "batch_number",
    "recorded_by_name",
  ],
  NUTRITION: [
    "assessment_id",
    "child_id",
    "child_name",
    "barangay_name",
    "assessment_date",
    "age_months",
    "weight",
    "height",
    "muac",
    "weight_for_age",
    "height_for_age",
    "weight_for_height",
    "nutritional_status",
    "evaluation_status",
    "engine_version",
    "care",
  ],
  SUPPLEMENTATION: [
    "supplementation_record_id",
    "child_id",
    "child_name",
    "barangay_name",
    "supplementation_date",
    "item_name",
    "record_type",
    "quantity_given",
    "unit",
    "dose_value",
    "dose_unit",
    "tier",
    "batch_number",
    "plan_id",
    "source_assessment_id",
    "recorded_by_name",
  ],
  INVENTORY: [
    "inventory_id",
    "item_name",
    "item_type",
    "unit",
    "barangay_name",
    "quantity_on_hand",
    "batch_stock",
    "batches",
    "updated_at",
  ],
  TRANSACTIONS: [
    "transaction_id",
    "item_name",
    "unit",
    "barangay_name",
    "transaction_type",
    "quantity",
    "transaction_date",
    "reference_number",
    "inventory_batch_id",
    "performed_by_name",
    "remarks",
  ],
};
export function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
export function heading(v: string) {
  return v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
export function latestNutrition(rows: ReportRow[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      String(b.assessment_date).localeCompare(String(a.assessment_date)) ||
      Number(b.assessment_id) - Number(a.assessment_id),
  );
  const seen = new Set<number>();
  return sorted.filter((r) => {
    const id = Number(r.child_id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
export function nutritionSummary(rows: ReportRow[]) {
  const latest = latestNutrition(rows);
  const eligible = latest.filter(
    (r) =>
      typeof r.age_months === "number" &&
      r.age_months >= 0 &&
      r.age_months < 60,
  );
  const valid: Record<string, string[]> = {
    weight_for_age: ["NOT_UNDERWEIGHT", "UNDERWEIGHT", "SEVERELY_UNDERWEIGHT"],
    height_for_age: ["NOT_STUNTED", "STUNTED", "SEVERELY_STUNTED"],
    weight_for_height: [
      "NORMAL",
      "POSSIBLE_RISK_OF_OVERWEIGHT",
      "WASTED",
      "SEVERELY_WASTED",
      "OVERWEIGHT",
      "OBESE",
    ],
  };
  const counts: Record<string, number> = {
    "Latest eligible children": eligible.length,
    "Excluded age": latest.length - eligible.length,
    SAM: eligible.filter(
      (r) =>
        r.nutritional_status === "SAM" && r.evaluation_status === "EVALUATED",
    ).length,
    MAM: eligible.filter(
      (r) =>
        r.nutritional_status === "MAM" && r.evaluation_status === "EVALUATED",
    ).length,
  };
  for (const [field, codes] of Object.entries(valid))
    for (const code of codes)
      counts[heading(field) + " · " + heading(code)] = eligible.filter(
        (r) => Boolean(r.engine_version) && r[field] === code,
      ).length;
  return counts;
}
export function manilaToday() {
  const p = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (k: string) => p.find((v) => v.type === k)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function periodRange(period: string, today: string) {
  const d = new Date(today + "T00:00:00Z");
  if (period === "WEEKLY")
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  else if (period === "MONTHLY") d.setUTCDate(1);
  return { start: d.toISOString().slice(0, 10), end: today };
}
