"use client";
export type OutputApproval = {
  reportId?: number;
  status?: string;
  validatedBy?: string | null;
  validatedAt?: string | null;
};
export function isValidatedReport(meta: Omit<OutputApproval, "reportId">) {
  return Boolean(
    meta.status === "VALIDATED" && meta.validatedBy && meta.validatedAt,
  );
}
export function canOutput(meta: OutputApproval) {
  return Boolean(meta.reportId && isValidatedReport(meta));
}
export async function printApprovedReport(meta: OutputApproval) {
  if (!canOutput(meta)) {
    window.alert("PHN validation is required before printing.");
    return;
  }
  try {
    const response = await fetch(
      `/api/reports/export?reportId=${meta.reportId}&format=CHECK`,
      { cache: "no-store" },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Unable to verify report approval.");
    if (result.reportId !== meta.reportId)
      throw new Error("Report changed. Refresh and review it again.");
    window.print();
  } catch (error) {
    window.alert(
      error instanceof Error
        ? error.message
        : "Unable to verify report approval.",
    );
  }
}
