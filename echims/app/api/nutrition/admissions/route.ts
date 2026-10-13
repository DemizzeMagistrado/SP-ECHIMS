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
function date(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
async function session() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  return error || !data.user ? null : { db, userId: data.user.id };
}
function databaseError(error: { code?: string; message: string }) {
  if (error.code === "42501") return json({ error: error.message }, 403);
  if (error.code === "23505") return json({ error: error.message }, 409);
  if (["22023", "23514", "22P02", "22003"].includes(error.code ?? ""))
    return json({ error: error.message }, 400);
  console.error("Nutrition admissions:", error);
  return json(
    {
      error:
        "Unable to load or save admission tracking. Check the installed migration.",
    },
    500,
  );
}
export async function GET() {
  try {
    const auth = await session();
    if (!auth) return json({ error: "Please sign in." }, 401);
    const { data, error } = await auth.db.rpc("get_nutrition_admissions");
    if (error) return databaseError(error);
    if (!data || data.currentUserId !== auth.userId)
      return json({ error: "Session changed. Refresh the page." }, 409);
    return json(data);
  } catch (error) {
    console.error("Nutrition admission GET:", error);
    return json({ error: "Unable to load admission tracking." }, 500);
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
    if (
      !id(body.admissionId) ||
      !id(body.revision) ||
      !["INPATIENT", "OUTPATIENT"].includes(String(body.careType)) ||
      !["ACTIVE", "DONE"].includes(String(body.status)) ||
      !date(body.checkupDate) ||
      typeof body.facility !== "string" ||
      body.facility.length > 300 ||
      typeof body.remarks !== "string" ||
      !body.remarks.trim() ||
      body.remarks.length > 4000 ||
      typeof body.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.requestId,
      )
    )
      return json(
        {
          error:
            "Choose inpatient/outpatient and active/done, enter the checkup date and remarks, and provide a valid entry version and request ID.",
        },
        400,
      );
    const { data, error } = await auth.db.rpc("confirm_nutrition_admission", {
      p_admission_id: body.admissionId,
      p_revision: body.revision,
      p_care_type: body.careType,
      p_status: body.status,
      p_checkup_date: body.checkupDate,
      p_facility_name: body.facility.trim(),
      p_remarks: body.remarks.trim(),
      p_request_id: body.requestId,
    });
    if (error) return databaseError(error);
    return json({
      currentUserId: auth.userId,
      result: data,
      message:
        "Care details saved. Measurements and nutritional classification are unchanged.",
    });
  } catch (error) {
    console.error("Nutrition admission POST:", error);
    return json(
      { error: "Submission uncertain. Retry the same care details unchanged." },
      500,
    );
  }
}
