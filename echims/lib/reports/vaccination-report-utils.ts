import type { ReportRow } from "@/lib/reports/report-utils";
export const reportVaccines = [
  { code: "BCG", name: "BCG", doses: 1 },
  { code: "HEPB", name: "Hepatitis B", doses: 1 },
  { code: "PENTA", name: "DPT-Hib-HepB (Pentavalent)", doses: 3 },
  { code: "OPV", name: "OPV", doses: 3 },
  { code: "IPV", name: "IPV", doses: 2 },
  { code: "PCV13", name: "PCV", doses: 3 },
  { code: "ROTA", name: "Rotavirus", doses: 2 },
  { code: "MMR", name: "MMR", doses: 2 },
] as const;
export const reportAgeGroups = [
  { label: "0–12 months", min: 0, max: 12 },
  { label: "13–23 months", min: 13, max: 23 },
  { label: "24–59 months", min: 24, max: 59 },
];
export type RecordMode = "SERVICE" | "PRIOR";
export function vaccineCode(row: ReportRow) {
  const raw = String(row.vaccine_type ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, string> = {
    HEPATITISB: "HEPB",
    PENTAVALENT: "PENTA",
    DPTHIBHEPB: "PENTA",
    PCV: "PCV13",
    ROTAVIRUS: "ROTA",
  };
  return aliases[raw] ?? raw;
}
export function age(row: ReportRow) {
  if (
    row.age_months === null ||
    row.age_months === undefined ||
    typeof row.age_months === "boolean" ||
    row.age_months === ""
  )
    return null;
  const n = Number(row.age_months);
  return Number.isFinite(n) && n >= 0 && n < 60 ? n : null;
}
export function sexCounts(rows: ReportRow[]) {
  return {
    male: rows.filter((r) => r.sex === "MALE").length,
    female: rows.filter((r) => r.sex === "FEMALE").length,
    unknown: rows.filter((r) => !["MALE", "FEMALE"].includes(String(r.sex)))
      .length,
    total: rows.length,
  };
}
export function uniqueDoseRows(rows: ReportRow[], mode: RecordMode) {
  const selected = rows.filter(
    (r) =>
      r.status === "APPROVED" &&
      age(r) !== null &&
      (mode === "PRIOR" ? r.is_prior === true : r.is_prior === false),
  );
  const sorted = [...selected].sort(
    (a, b) =>
      String(a.vaccination_date).localeCompare(String(b.vaccination_date)) ||
      Number(a.vaccination_record_id) - Number(b.vaccination_record_id),
  );
  const seen = new Set<string>();
  return sorted.filter((r) => {
    const key =
      String(r.child_id) + ":" + vaccineCode(r) + ":" + String(r.dose_number);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function indicatorRows(
  rows: ReportRow[],
  code: string,
  dose: number,
  min: number,
  max: number,
) {
  return rows.filter(
    (r) =>
      vaccineCode(r) === code &&
      Number(r.dose_number) === dose &&
      age(r) !== null &&
      age(r)! >= min &&
      age(r)! <= max,
  );
}
export function eligibleSourceRows(rows: ReportRow[], mode: RecordMode) {
  return rows.filter(
    (r) =>
      r.status === "APPROVED" &&
      age(r) !== null &&
      (mode === "PRIOR" ? r.is_prior === true : r.is_prior === false),
  );
}
