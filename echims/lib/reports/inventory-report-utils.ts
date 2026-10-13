import type { ReportRow } from "./report-utils";
export type Movement = "RECEIPT" | "ISSUE" | "ALLOCATION" | "REVIEW";
export function movement(type: unknown): Movement {
  if (type === "MSP_RECEIPT" || type === "STOCK_IN") return "RECEIPT";
  if (type === "MSP_ADMINISTRATION" || type === "MSP_DISPENSE") return "ISSUE";
  if (type === "MSP_BATCH_ALLOCATION") return "ALLOCATION";
  return "REVIEW";
}
export function amount(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    String(value).trim() === ""
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function manilaDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function monthlyMovements(
  rows: ReportRow[],
  inventoryId: unknown,
  start: string,
  end: string,
) {
  const result: {
    month: string;
    receipts: number;
    issues: number;
    allocations: number;
    review: number;
    invalid: number;
    dates: string[];
  }[] = [];
  for (let month = start.slice(0, 7); month <= end.slice(0, 7); ) {
    const selected = rows.filter(
      (r) =>
        String(r.inventory_id) === String(inventoryId) &&
        manilaDate(r.transaction_date)?.slice(0, 7) === month &&
        manilaDate(r.transaction_date)! >= start &&
        manilaDate(r.transaction_date)! <= end,
    );
    const out = {
      month,
      receipts: 0,
      issues: 0,
      allocations: 0,
      review: 0,
      invalid: 0,
      dates: [] as string[],
    };
    for (const r of selected) {
      const q = amount(r.quantity),
        kind = movement(r.transaction_type);
      if (kind === "REVIEW") out.review++;
      if (q === null || q === 0) {
        out.invalid++;
        continue;
      }
      if (kind === "RECEIPT") {
        out.receipts += q;
        out.dates.push(manilaDate(r.transaction_date)!);
      }
      if (kind === "ISSUE") out.issues += q;
      if (kind === "ALLOCATION") out.allocations += q;
    }
    result.push(out);
    const [y, m] = month.split("-").map(Number);
    month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return result;
}
