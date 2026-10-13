import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function id(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}
function date(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function filters(b: Record<string, unknown>) {
  return (
    typeof b.module === "string" &&
    [
      "CHILD",
      "HOUSEHOLD",
      "VACCINATION",
      "NUTRITION",
      "SUPPLEMENTATION",
      "INVENTORY",
    ].includes(b.module) &&
    date(b.start) &&
    date(b.end) &&
    b.start <= b.end &&
    (b.barangayId === null || id(b.barangayId)) &&
    ["STOCK", "TRANSACTIONS"].includes(String(b.inventoryView)) &&
    ["ALL", "VACCINE", "SUPPLEMENT"].includes(String(b.itemType))
  );
}
function errorReply(e: { code?: string; message: string }) {
  if (e.code === "42501") return json({ error: e.message }, 403);
  if (e.code === "23505") return json({ error: e.message }, 409);
  if (["22023", "23514", "22P02", "22008", "22003"].includes(e.code ?? ""))
    return json({ error: e.message }, 400);
  console.error("Report RPC:", e);
  return json(
    { error: "Unable to process reports. Check the saved-report migration." },
    500,
  );
}
async function session() {
  const db = await createClient();
  const r = await db.auth.getUser();
  return r.error || !r.data.user ? null : { db, userId: r.data.user.id };
}
function matches(data: unknown, userId: string) {
  return (
    data !== null &&
    typeof data === "object" &&
    "currentUserId" in data &&
    data.currentUserId === userId
  );
}
export async function GET(request: Request) {
  try {
    const auth = await session();
    if (!auth) return json({ error: "Please sign in." }, 401);
    const u = new URL(request.url);
    let result;
    if (u.searchParams.has("reportId")) {
      const raw = u.searchParams.get("reportId")!;
      if (!/^[1-9]\d*$/.test(raw) || !id(Number(raw)))
        return json({ error: "Invalid report ID." }, 400);
      result = await auth.db.rpc("get_generated_report", {
        p_report_id: Number(raw),
      });
    } else if (u.searchParams.has("module")) {
      const raw = u.searchParams.get("barangayId");
      const b = {
        module: u.searchParams.get("module"),
        start: u.searchParams.get("start"),
        end: u.searchParams.get("end"),
        barangayId: raw === null ? null : Number(raw),
        inventoryView: u.searchParams.get("inventoryView") ?? "STOCK",
        itemType: u.searchParams.get("itemType") ?? "ALL",
      };
      if ((raw !== null && !/^[1-9]\d*$/.test(raw)) || !filters(b))
        return json({ error: "Choose a report and valid filters." }, 400);
      result = await auth.db.rpc("get_report_preview", {
        p_module: b.module,
        p_start: b.start,
        p_end: b.end,
        p_barangay_id: b.barangayId,
        p_inventory_view: b.inventoryView,
        p_item_type: b.itemType,
      });
    } else {
      const raw = u.searchParams.get("page") ?? "1";
      if (!/^[1-9]\d*$/.test(raw) || !id(Number(raw)) || Number(raw) > 100000)
        return json({ error: "Invalid page." }, 400);
      result = await auth.db.rpc("list_generated_reports", {
        p_page: Number(raw),
      });
    }
    if (result.error) return errorReply(result.error);
    if (!matches(result.data, auth.userId))
      return json({ error: "Session changed. Refresh reports." }, 409);
    return json(result.data);
  } catch (e) {
    console.error("Reports GET:", e);
    return json({ error: "Unable to load reports." }, 500);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await session();
    if (!auth) return json({ error: "Please sign in." }, 401);
    const input: unknown = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({ error: "Invalid request body." }, 400);
    const b = input as Record<string, unknown>;
    let result;
    if (b.action === "GENERATE") {
      if (
        !filters(b) ||
        typeof b.title !== "string" ||
        !b.title.trim() ||
        b.title.trim().length > 200 ||
        typeof b.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          b.requestId,
        ) ||
        (b.baseReportId !== null &&
          b.baseReportId !== undefined &&
          !id(b.baseReportId))
      )
        return json(
          {
            error:
              "Provide valid filters, title, request UUID and optional base report ID.",
          },
          400,
        );
      result = await auth.db.rpc("generate_report", {
        p_module: b.module,
        p_start: b.start,
        p_end: b.end,
        p_barangay_id: b.barangayId,
        p_inventory_view: b.inventoryView,
        p_item_type: b.itemType,
        p_title: b.title.trim(),
        p_request_id: b.requestId,
        p_base_report_id: b.baseReportId ?? null,
      });
    } else if (b.action === "VALIDATE" || b.action === "RETURN") {
      if (
        !id(b.reportId) ||
        !id(b.revision) ||
        typeof b.remarks !== "string" ||
        b.remarks.length > 2000 ||
        (b.action === "RETURN" && !b.remarks.trim())
      )
        return json(
          {
            error: "Choose a report and revision; returning requires remarks.",
          },
          400,
        );
      result = await auth.db.rpc("review_generated_report", {
        p_report_id: b.reportId,
        p_revision: b.revision,
        p_decision: b.action,
        p_remarks: b.remarks.trim(),
      });
    } else return json({ error: "Choose GENERATE, VALIDATE or RETURN." }, 400);
    if (result.error) return errorReply(result.error);
    if (!matches(result.data, auth.userId))
      return json({ error: "Session changed. Refresh before retrying." }, 409);
    return json(result.data);
  } catch (e) {
    console.error("Reports POST:", e);
    return json(
      { error: "Submission uncertain. Retry unchanged to avoid duplication." },
      500,
    );
  }
}
