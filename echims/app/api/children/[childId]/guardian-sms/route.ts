import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { canPerform, type UserRole } from "@/lib/echims-data";
const aliases: Record<string, UserRole> = {
  administrator: "Administrator",
  admin: "Administrator",
  phn: "Public Health Nurse",
  "public health nurse": "Public Health Nurse",
  rhm: "Rural Health Midwife",
  "rural health midwife": "Rural Health Midwife",
  bhw: "Barangay Health Worker",
  "barangay health worker": "Barangay Health Worker",
  bns: "Barangay Nutrition Scholar",
  "barangay nutrition scholar": "Barangay Nutrition Scholar",
};
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers });
export async function GET(
  request: Request,
  { params }: { params: Promise<{ childId: string }> },
) {
  try {
    const context = await getAuthorizationContext();
    if (!context) return fail("Please sign in.", 401);
    const role = aliases[String(context.role).trim().toLowerCase()];
    if (!role || !canPerform(role, "Child Profiling", "view"))
      return fail("Not authorized to view child SMS history.", 403);
    const { childId: rawId } = await params;
    const guardianRaw =
      new URL(request.url).searchParams.get("guardian_id") ?? "";
    if (!/^[1-9]\d*$/.test(rawId) || !/^[1-9]\d*$/.test(guardianRaw))
      return fail("Valid child and guardian IDs are required.", 400);
    const childId = Number(rawId),
      guardianId = Number(guardianRaw);
    if (!Number.isSafeInteger(childId) || !Number.isSafeInteger(guardianId))
      return fail("Valid child and guardian IDs are required.", 400);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_child_guardian_sms_history",
      { p_child_id: childId, p_guardian_id: guardianId },
    );
    if (error) {
      if (error.code === "42501")
        return fail(
          "Child or guardian is outside your active work scope. Refresh the profile if the guardian changed.",
          403,
        );
      console.error("Child guardian SMS history:", error);
      return fail(
        "Unable to load SMS history. Check the child SMS history migration.",
        500,
      );
    }
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error("Child SMS history GET:", error);
    return fail("Unable to load SMS history.", 500);
  }
}
