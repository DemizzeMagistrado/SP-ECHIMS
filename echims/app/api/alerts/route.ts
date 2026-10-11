import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizationContext } from "@/lib/auth/authorization";

const ruleFields =
  "rule_id,rule_name,description,rule_category,condition_logic,severity,status,evaluator_type,condition_parameters,message_template,revision,updated_at";
const noStore = { "Cache-Control": "private, no-store" };
const errorResponse = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: noStore });

async function authorize() {
  const context = await getAuthorizationContext();
  if (!context) return null;
  const supabase = await createClient();
  const account = await supabase
    .from("users")
    .select("account_status")
    .eq("user_id", context.authUser.id)
    .maybeSingle();
  if (account.error || account.data?.account_status !== "ACTIVE") return null;
  return {
    supabase,
    userId: context.authUser.id,
    canConfigure: context.role === "Administrator",
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authorize();
    if (!auth)
      return errorResponse("An active authenticated account is required.", 401);
    const { supabase, userId, canConfigure } = auth;
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
      return errorResponse("Invalid page.", 400);
    // The session client applies all existing restrictive scope/recipient policies.
    const results = await Promise.all([
      supabase
        .from("alert")
        .select(
          "alert_id,alert_type,alert_message,severity,status,created_at,read_at,source_module,child_id,inventory_id,schedule_id,recipient_id,rule_id",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .order("alert_id", { ascending: false })
        .range((page - 1) * 50, page * 50 - 1),
      supabase
        .from("alert")
        .select("alert_id", { count: "exact", head: true })
        .eq("status", "RESOLVED"),
      supabase
        .from("alert")
        .select("alert_id", { count: "exact", head: true })
        .in("status", ["UNREAD", "READ"])
        .eq("severity", "CRITICAL"),
      supabase
        .from("alert")
        .select("alert_id", { count: "exact", head: true })
        .in("status", ["UNREAD", "READ"])
        .in("severity", ["HIGH", "MEDIUM"]),
      canConfigure
        ? supabase.from("alert_rule").select(ruleFields).order("rule_id")
        : Promise.resolve({ data: [], error: null }),
      canConfigure
        ? supabase
            .from("alert_rule_audit")
            .select(
              "audit_id,rule_id,actor_id,action,old_values,new_values,changed_at",
            )
            .order("audit_id", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const failure = results.find((result) => result.error)?.error;
    if (failure) {
      console.error("Alerts GET:", failure);
      return errorResponse(
        "Unable to load alerts or rules. Verify the database migration was installed.",
        500,
      );
    }
    return NextResponse.json(
      {
        currentUserId: userId,
        canConfigure,
        alerts: results[0].data ?? [],
        rules: results[4].data ?? [],
        audit: results[5].data ?? [],
        page,
        pageSize: 50,
        summary: {
          total: results[0].count ?? 0,
          resolved: results[1].count ?? 0,
          critical: results[2].count ?? 0,
          warning: results[3].count ?? 0,
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("Alerts GET:", error);
    return errorResponse("Unable to load alerts.", 500);
  }
}

async function writeRule(request: Request, create: boolean) {
  try {
    const auth = await authorize();
    if (!auth)
      return errorResponse("An active authenticated account is required.", 401);
    if (!auth.canConfigure)
      return errorResponse(
        "Only an Administrator can configure alert rules.",
        403,
      );
    const payload: unknown = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return errorResponse("Invalid request body.", 400);
    const body = payload as Record<string, unknown>;
    if (
      typeof body.description !== "string" ||
      body.description.length > 2000 ||
      typeof body.severity !== "string" ||
      !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.severity) ||
      typeof body.status !== "string" ||
      !["ACTIVE", "INACTIVE"].includes(body.status) ||
      !body.conditionParameters ||
      typeof body.conditionParameters !== "object" ||
      Array.isArray(body.conditionParameters) ||
      (body.messageTemplate !== null &&
        typeof body.messageTemplate !== "string")
    )
      return errorResponse("Invalid rule fields.", 400);
    const values = {
      description: body.description.trim(),
      severity: body.severity,
      status: body.status,
      condition_parameters: body.conditionParameters,
      message_template:
        body.messageTemplate === null
          ? null
          : String(body.messageTemplate).trim() || null,
    };
    const { supabase } = auth;
    let result;
    if (create) {
      if (
        typeof body.ruleName !== "string" ||
        !/^[A-Z][A-Z0-9_]{2,79}$/.test(body.ruleName) ||
        !["INVENTORY_LOW_STOCK", "INVENTORY_NEAR_EXPIRY"].includes(
          String(body.evaluatorType),
        )
      )
        return errorResponse(
          "Choose a supported inventory evaluator and an uppercase rule name.",
          400,
        );
      result = await supabase
        .from("alert_rule")
        .insert({
          ...values,
          rule_name: body.ruleName,
          evaluator_type: String(body.evaluatorType),
          rule_category: "INVENTORY",
          condition_logic: "Validated by the inventory evaluator.",
          created_by: auth.userId,
        })
        .select(ruleFields)
        .single();
    } else {
      if (
        typeof body.ruleId !== "number" ||
        !Number.isSafeInteger(body.ruleId) ||
        body.ruleId <= 0 ||
        typeof body.revision !== "number" ||
        !Number.isSafeInteger(body.revision) ||
        body.revision < 1
      )
        return errorResponse("A valid rule ID and revision are required.", 400);
      // Optimistic lock prevents one administrator silently overwriting another.
      result = await supabase
        .from("alert_rule")
        .update(values)
        .eq("rule_id", body.ruleId)
        .eq("revision", body.revision)
        .select(ruleFields)
        .maybeSingle();
    }
    if (result.error) {
      const code = result.error.code;
      if (["22023", "23514", "22P02", "22003"].includes(code))
        return errorResponse(result.error.message, 400);
      if (code === "23505")
        return errorResponse("A rule with this name already exists.", 409);
      if (code === "42501")
        return errorResponse("You are not authorized to edit this rule.", 403);
      console.error("Rule save:", result.error);
      return errorResponse("Unable to save the rule.", 500);
    }
    if (!result.data)
      return errorResponse(
        "The rule changed or is unavailable. Refresh and review it again.",
        409,
      );
    return NextResponse.json(
      {
        rule: result.data,
        message:
          "Rule saved and audited. Changes apply on the next evaluation; existing alert text is preserved until its evaluator updates it.",
      },
      { status: create ? 201 : 200, headers: noStore },
    );
  } catch (error) {
    console.error("Rule save:", error);
    return errorResponse("Unable to save the rule.", 500);
  }
}
export async function POST(request: Request) {
  return writeRule(request, true);
}
export async function PATCH(request: Request) {
  return writeRule(request, false);
}
