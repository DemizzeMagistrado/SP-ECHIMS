import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { canPerform, type UserRole } from "@/lib/echims-data";
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers });
const roles: Record<string, UserRole> = {
  Administrator: "Administrator",
  PHN: "Public Health Nurse",
  RHM: "Rural Health Midwife",
  BHW: "Barangay Health Worker",
  BNS: "Barangay Nutrition Scholar",
};
async function authorize(program: string, send = false) {
  const context = await getAuthorizationContext();
  if (!context) return fail("Please sign in.", 401);
  if (!["VACCINATION", "SUPPLEMENTATION"].includes(program))
    return fail("Choose Vaccination or Supplementation.", 400);
  const role = roles[String(context.role)];
  if (
    !role ||
    !canPerform(
      role,
      program === "VACCINATION" ? "Vaccination" : "Supplementation",
      "view",
    )
  )
    return fail("Not authorized to view this program.", 403);
  if (send && !["RHM", "BHW"].includes(String(context.role)))
    return fail(
      "Only RHM and BHW can send or simulate SMS. Administrator, PHN and BNS have viewing access.",
      403,
    );
  if (send && process.env.SMS_SIMULATION_ENABLED !== "true")
    return fail(
      "Simulation is disabled. Live sending is not integrated yet.",
      403,
    );
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("account_status")
    .eq("user_id", context.authUser.id)
    .maybeSingle();
  if (error) return fail("Unable to verify your account.", 500);
  if (data?.account_status !== "ACTIVE")
    return fail("An active account is required.", 403);
  return { context, supabase };
}
export async function GET(request: Request) {
  try {
    const program = new URL(request.url).searchParams.get("program") ?? "";
    const auth = await authorize(program);
    if (auth instanceof NextResponse) return auth;
    const { data, error } = await auth.supabase.rpc(
      "get_sms_program_overview",
      { p_program: program },
    );
    if (error) {
      console.error("SMS program overview:", error);
      return fail(
        error.code === "42501"
          ? "Not authorized to view these reminders."
          : "Unable to load SMS reminders. Check the migration.",
        error.code === "42501" ? 403 : 500,
      );
    }
    const panel: unknown = data;
    if (
      !panel ||
      typeof panel !== "object" ||
      Array.isArray(panel) ||
      !("currentUserId" in panel) ||
      panel.currentUserId !== auth.context.authUser.id
    )
      return fail("SMS session changed. Refresh the page.", 409);
    return NextResponse.json(
      {
        ...panel,
        canSend:
          ["RHM", "BHW"].includes(String(auth.context.role)) &&
          "canSend" in panel &&
          panel.canSend === true,
        simulationEnabled: process.env.SMS_SIMULATION_ENABLED === "true",
        previewEnabled: process.env.SMS_PRESENTATION_PREVIEW_ENABLED === "true",
      },
      { headers },
    );
  } catch (error) {
    console.error("SMS reminders GET:", error);
    return fail("Unable to load SMS reminders.", 500);
  }
}
export async function POST(request: Request) {
  try {
    const input: unknown = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return fail("Invalid request body.", 400);
    const body = input as Record<string, unknown>;
    const auth = await authorize(String(body.program ?? ""), true);
    if (auth instanceof NextResponse) return auth;
    if (
      typeof body.serviceKey !== "string" ||
      body.serviceKey.length < 1 ||
      body.serviceKey.length > 500 ||
      !["UPCOMING", "OVERDUE"].includes(String(body.messageType)) ||
      typeof body.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.requestId,
      ) ||
      !["SIMULATED_SENT", "SIMULATED_FAILED"].includes(String(body.outcome)) ||
      (body.outcome === "SIMULATED_SENT" && body.errorCode !== null) ||
      (body.outcome === "SIMULATED_FAILED" &&
        !["NETWORK_ERROR", "INSUFFICIENT_CREDITS", "PROVIDER_ERROR"].includes(
          String(body.errorCode),
        ))
    )
      return fail(
        "Choose a valid reminder template and simulation scenario.",
        400,
      );
    if (body.preview !== undefined && typeof body.preview !== "boolean")
      return fail("Invalid preview option.", 400);
    if (
      body.preview === true &&
      process.env.SMS_PRESENTATION_PREVIEW_ENABLED !== "true"
    )
      return fail("Presentation preview is disabled.", 403);
    const { data, error } = await auth.supabase.rpc(
      body.preview === true
        ? "simulate_staff_sms_preview"
        : "simulate_staff_program_sms",
      {
        p_program: body.program,
        p_service_key: body.serviceKey,
        p_phase: body.messageType,
        p_request_id: body.requestId,
        p_outcome: body.outcome,
        p_error_code: body.errorCode,
      },
    );
    if (error) {
      if (["42501", "22023", "23505"].includes(error.code))
        return fail(
          error.message,
          error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400,
        );
      console.error("Staff SMS attempt:", error);
      return fail(
        "Unable to record simulation. Retry the same action to check whether it saved.",
        500,
      );
    }
    return NextResponse.json(
      {
        currentUserId: auth.context.authUser.id,
        result: data,
        message: "Simulation saved. No actual SMS was sent.",
      },
      { headers },
    );
  } catch (error) {
    console.error("Staff SMS POST:", error);
    return fail("Unable to process SMS simulation.", 500);
  }
}
