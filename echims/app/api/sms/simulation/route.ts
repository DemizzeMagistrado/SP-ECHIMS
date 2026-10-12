import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";

const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers });
async function authorize(send = false) {
  if (send && process.env.SMS_SIMULATION_ENABLED !== "true")
    return fail(
      "SMS simulation is disabled. Set SMS_SIMULATION_ENABLED=true on the server.",
      403,
    );
  const context = await getAuthorizationContext();
  if (!context) return fail("Please sign in.", 401);
  if (send && !["RHM", "BHW"].includes(String(context.role)))
    return fail("Only RHM and BHW can send or simulate SMS.", 403);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("account_status")
    .eq("user_id", context.authUser.id)
    .maybeSingle();
  if (error) return fail("Unable to verify your account.", 500);
  if (data?.account_status !== "ACTIVE")
    return fail("An active account is required.", 403);
  return { supabase, userId: context.authUser.id };
}
export async function GET() {
  try {
    const auth = await authorize();
    if (auth instanceof NextResponse) return auth;
    const { data, error } = await auth.supabase.rpc("get_sms_simulation_panel");
    if (error) {
      console.error("SMS simulation load:", error);
      return fail(
        error.code === "42501"
          ? "Not authorized to view SMS simulation."
          : "Unable to load SMS simulation. Check the migration.",
        error.code === "42501" ? 403 : 500,
      );
    }
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error("SMS simulation GET:", error);
    return fail("Unable to load SMS simulation.", 500);
  }
}
export async function POST(request: Request) {
  try {
    const auth = await authorize(true);
    if (auth instanceof NextResponse) return auth;
    const input: unknown = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return fail("Invalid request body.", 400);
    const body = input as Record<string, unknown>;
    if (
      typeof body.notificationId !== "number" ||
      !Number.isSafeInteger(body.notificationId) ||
      body.notificationId <= 0 ||
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
      return fail("Choose a valid SMS simulation scenario.", 400);
    const { data, error } = await auth.supabase.rpc("simulate_sms_attempt", {
      p_notification_id: body.notificationId,
      p_request_id: body.requestId,
      p_outcome: body.outcome,
      p_error_code: body.errorCode,
    });
    if (error) {
      if (error.code === "42501")
        return fail("Not authorized to simulate SMS.", 403);
      if (error.code === "22023") return fail(error.message, 400);
      if (error.code === "23505") return fail(error.message, 409);
      console.error("SMS simulation attempt:", error);
      return fail(
        "Unable to save simulation. Retry the same action to check whether it saved.",
        500,
      );
    }
    return NextResponse.json(
      {
        currentUserId: auth.userId,
        result: data,
        message: "Simulation recorded. No SMS was sent.",
      },
      { headers },
    );
  } catch (error) {
    console.error("SMS simulation POST:", error);
    return fail("Unable to save SMS simulation.", 500);
  }
}
