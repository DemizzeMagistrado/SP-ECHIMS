import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function id(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
async function session() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  return error || !data.user ? null : { db, userId: data.user.id };
}
function databaseError(error: { code?: string; message: string }) {
  if (error.code === "42501") return json({ error: error.message }, 403);
  if (["22023", "23514", "22P02", "22003"].includes(error.code ?? ""))
    return json({ error: error.message }, 400);
  if (error.code === "23505") return json({ error: error.message }, 409);
  console.error("Supplement stock requests:", error);
  return json(
    {
      error:
        "Unable to process stock requests. Check the installed request migration.",
    },
    500,
  );
}
export async function GET() {
  try {
    const auth = await session();
    if (!auth) return json({ error: "Please sign in." }, 401);
    const { data, error } = await auth.db.rpc("get_supplement_stock_requests");
    if (error) return databaseError(error);
    if (!data || data.currentUserId !== auth.userId)
      return json({ error: "Session changed. Refresh the page." }, 409);
    return json(data);
  } catch (error) {
    console.error("Supplement stock requests GET:", error);
    return json({ error: "Unable to load stock requests." }, 500);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await session();
    if (!auth) return json({ error: "Please sign in." }, 401);
    const input: unknown = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({ error: "Invalid request body." }, 400);
    const body = input as Record<string, unknown>;
    let result;
    if (body.action === "APPROVE") {
      if (
        !id(body.stockRequestId) ||
        typeof body.batchNumber !== "string" ||
        !body.batchNumber.trim() ||
        body.batchNumber.trim().length > 100 ||
        !validDate(body.expiryDate) ||
        !validDate(body.receivedDate)
      )
        return json(
          {
            error:
              "Choose a request and provide a batch number and valid expiry/allocation dates.",
          },
          400,
        );
      result = await auth.db.rpc("approve_supplement_stock_receipt", {
        p_stock_request_id: body.stockRequestId,
        p_batch_number: body.batchNumber.trim(),
        p_expiry_date: body.expiryDate,
        p_received_date: body.receivedDate,
      });
    } else if (body.action === "REQUEST") {
      if (
        !id(body.supplementId) ||
        !id(body.barangayId) ||
        !id(body.quantity) ||
        body.quantity > 1000000 ||
        typeof body.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          body.requestId,
        ) ||
        typeof body.remarks !== "string" ||
        body.remarks.length > 2000
      )
        return json(
          {
            error:
              "Choose a product, barangay, whole stock-unit quantity and valid request ID. Remarks may contain up to 2000 characters.",
          },
          400,
        );
      result = await auth.db.rpc("request_supplement_stock", {
        p_supplement_id: body.supplementId,
        p_barangay_id: body.barangayId,
        p_quantity: body.quantity,
        p_remarks: body.remarks,
        p_request_id: body.requestId,
      });
    } else if (body.action === "REJECT") {
      if (
        !id(body.stockRequestId) ||
        typeof body.reason !== "string" ||
        !body.reason.trim() ||
        body.reason.length > 2000
      )
        return json(
          { error: "Choose a request and provide a rejection reason." },
          400,
        );
      result = await auth.db.rpc("reject_supplement_stock_request", {
        p_stock_request_id: body.stockRequestId,
        p_reason: body.reason.trim(),
      });
    } else return json({ error: "Choose REQUEST, APPROVE or REJECT." }, 400);
    if (result.error) return databaseError(result.error);
    return json(
      {
        result: result.data,
        message:
          body.action === "REQUEST"
            ? "Request saved for PHN review. No stock has been reserved or allocated."
            : body.action === "APPROVE"
              ? "Request approved. Barangay batch stock was increased. Refresh Supplement Inventory to see it. RHU source stock was not deducted."
              : "Request rejected. Stock is unchanged.",
      },
      body.action === "REQUEST" && !result.data?.replayed ? 201 : 200,
    );
  } catch (error) {
    console.error("Supplement stock requests POST:", error);
    return json(
      {
        error:
          "Unable to process the request. Retry unchanged if the submission result is uncertain.",
      },
      500,
    );
  }
}
