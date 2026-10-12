import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";
import { canPerform, type UserRole } from "@/lib/echims-data";
const roles: Record<string, UserRole> = {
  administrator: "Administrator",
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
export async function GET() {
  try {
    const context = await getAuthorizationContext();
    if (!context) return fail("Please sign in.", 401);
    const role = roles[String(context.role).trim().toLowerCase()];
    if (!role || !canPerform(role, "Supplementation", "view"))
      return fail("Not authorized to view supplementation SMS reminders.", 403);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "get_supplementation_sms_overview",
    );
    if (error) {
      console.error("Supplementation SMS:", error);
      return fail(
        error.code === "42501"
          ? "An active assigned account is required."
          : "Unable to load supplementation SMS reminders. Check the migration.",
        error.code === "42501" ? 403 : 500,
      );
    }
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error("Supplementation SMS GET:", error);
    return fail("Unable to load supplementation SMS reminders.", 500);
  }
}
