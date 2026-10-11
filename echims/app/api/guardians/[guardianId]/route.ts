import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };
function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ guardianId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return failure("Please sign in.", 401);

    const { guardianId: rawId } = await params;
    if (!/^[1-9]\d*$/.test(rawId))
      return failure("A valid guardian ID is required.", 400);
    const guardianId = Number(rawId);
    if (!Number.isSafeInteger(guardianId))
      return failure("A valid guardian ID is required.", 400);

    const payload: unknown = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return failure("Invalid request body.", 400);
    }
    const body = payload as Record<string, unknown>;
    if (
      typeof body.optIn !== "boolean" ||
      (body.optIn &&
        (typeof body.contactNumber !== "string" ||
          body.confirmedWithGuardian !== true))
    ) {
      return failure(
        "Confirm the guardian number and their agreement to reminders.",
        400,
      );
    }
    // The database validates the active account, work scope and matching number.
    const { data, error } = await supabase.rpc("confirm_guardian_sms_contact", {
      p_guardian_id: guardianId,
      p_contact_number:
        typeof body.contactNumber === "string" ? body.contactNumber.trim() : "",
      p_opt_in: body.optIn,
    });
    if (error) {
      if (error.code === "42501")
        return failure("You are not authorized to update this guardian.", 403);
      if (error.code === "22023") return failure(error.message, 400);
      console.error("Guardian SMS confirmation:", error);
      return failure("Unable to save guardian SMS preferences.", 500);
    }
    return NextResponse.json(
      {
        preference: data,
        message: body.optIn
          ? "Guardian contact and reminder agreement recorded. No SMS was sent."
          : "Guardian SMS reminders disabled.",
      },
      { headers },
    );
  } catch (error) {
    console.error("Guardian SMS preferences PATCH:", error);
    return failure("Unable to update guardian SMS preferences.", 500);
  }
}
