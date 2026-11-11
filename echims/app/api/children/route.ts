import { NextResponse } from "next/server";
import { withHistoryComparisons } from "@/lib/nutrition-history";
import { createClient } from "@/lib/supabase/server";
import { canPerform, type UserRole } from "@/lib/echims-data";
import { formatChildId, formatHouseholdId } from "@/lib/formatters";
const roleAliases: Record<string, UserRole> = {
  administrator: "Administrator",
  admin: "Administrator",
  "public health nurse": "Public Health Nurse",
  phn: "Public Health Nurse",
  "barangay health worker": "Barangay Health Worker",
  bhw: "Barangay Health Worker",
  "rural health midwife": "Rural Health Midwife",
  rhm: "Rural Health Midwife",
  "barangay nutrition scholar": "Barangay Nutrition Scholar",
  bns: "Barangay Nutrition Scholar",
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedRole(supabase: any) {
  const { data } = await supabase.rpc("get_my_profile").maybeSingle();
  return roleAliases[
    String(data?.role ?? "")
      .trim()
      .toLowerCase()
  ];
}
function parseId(value: unknown) {
  // Accepts raw numbers ("47"), legacy codes ("CH-47"), and new padded codes
  // ("CH-2026-00047"). The .split('-').pop() always grabs the final segment,
  // and padded zeroes parse cleanly as Number("00047") === 47.
  const parsed = Number(
    String(value ?? "")
      .replace(/^E?CH-/i, "")
      .split("-")
      .pop(),
  );
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function optionalNumber(value: unknown) {
  const text = String(value ?? "").trim();
  return text && Number.isFinite(Number(text)) ? Number(text) : null;
}
function monthsOld(value: string) {
  const birth = new Date(`${value}T00:00:00Z`);
  const now = new Date();
  return (
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    birth.getUTCMonth() -
    (now.getUTCDate() < birth.getUTCDate() ? 1 : 0)
  );
}
async function session(permission: "view" | "create" | "edit") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await trustedRole(supabase);
  return role && canPerform(role, "Child Profiling", permission)
    ? { supabase, user, role }
    : { supabase, user, role, forbidden: true as const };
}
/** PostgREST returns a to-one embed as an object (typed as object | object[]). */
function embedded<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
/**
 * Water source / toilet belong to the household. Saves them through the database's
 * echims_update_household_information (RLS-scoped, audited, revision-checked) only when they
 * differ from what is saved. Returns an error message, or null when saved or unchanged.
 * `expectedRevision` is the revision the form loaded; omit it to use the current one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveHouseholdFacilities(supabase: any, householdId: number, body: Record<string, unknown>, expectedRevision?: number) {
  const fields = ["water_source_type", "toilet_facility_type"] as const;
  if (!fields.some((f) => body[f] !== undefined)) return null;
  const current = await supabase
    .from("household")
    .select("water_source_type, toilet_facility_type, information_revision")
    .eq("household_id", householdId)
    .maybeSingle();
  if (current.error || !current.data) return "The household's water and toilet details could not be checked. Refresh and try again.";
  const changes: Record<string, string | null> = {};
  for (const f of fields) {
    if (body[f] === undefined) continue;
    const next = String(body[f] ?? "").trim() || null;
    if (next !== (current.data[f] ?? null)) changes[f] = next;
  }
  if (!Object.keys(changes).length) return null;
  const { error } = await supabase.rpc("echims_update_household_information", {
    p_household_id: householdId,
    p_expected_revision: Number.isSafeInteger(expectedRevision) ? expectedRevision : current.data.information_revision,
    p_changes: changes,
  });
  if (!error) return null;
  return error.code === "40001"
    ? "Someone else changed this household's water or toilet details while you were editing. Reopen the profile to see their changes, then edit again."
    : error.code === "42501"
      ? "You can't change this household's water and toilet details. Your account may not be assigned to its barangay."
      : "The household's water and toilet details were not saved. Try again.";
}
export async function GET(request: Request) {
  const auth = await session("view");
  if (!auth)
    return invalid("Please sign in before accessing child records.", 401);
  if ("forbidden" in auth)
    return invalid("You are not authorized to access child records.", 403);
  const childId = parseId(new URL(request.url).searchParams.get("childId"));
  let query = auth.supabase
    .from("child")
    .select(
      "child_id, first_name, middle_name, last_name, date_of_birth, sex, birth_place, address, registration_date, status, household_id, barangay_id, guardian_id, birth_weight_kg, birth_height_cm, mother_name, father_name, child_code, household:household(household_no, family_serial_no), guardian:guardian(first_name, middle_name, last_name)",
    )
    .order("child_id", { ascending: false });
  if (childId) query = query.eq("child_id", childId);
  const { data, error } = await query;
  if (error) return invalid("Unable to load child records.", 500);
  const rows = data ?? [];
  if (new URL(request.url).searchParams.get("view") === "vaccination-options") {
    if (!auth.role || !canPerform(auth.role, "Vaccination", "view")) return invalid("Vaccination access is required.", 403);
    const account = await auth.supabase.from("users").select("account_status").eq("user_id", auth.user.id).maybeSingle();
    if (account.error) return invalid("Unable to verify vaccination access.", 500);
    if (account.data?.account_status !== "ACTIVE") return invalid("An active account is required.", 403);
    return NextResponse.json({currentUserId: auth.user.id, children: rows}, {headers: {"Cache-Control": "private, no-store"}});
  }
  if (childId) {
    const found = rows[0];
    if (!found) return invalid("Child could not be found.", 404);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { household: _household, guardian: _guardian, ...child } = found;
    // Fan out all related-record queries in parallel. The vaccination/nutrition/supplementation
    // calls return full history (ordered newest first) so the profile view can render it;
    // the barangay/household/rhu calls hydrate the names the UI shows next to IDs.
    const [
      guardian,
      profile,
      latestAssessment,
      barangay,
      household,
      vaccinations,
      assessments,
      supplementations,
      siblings,
      openAlerts,
    ] = await Promise.all([
      child.guardian_id
        ? auth.supabase
            .from("guardian")
            .select("*")
            .eq("guardian_id", child.guardian_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      auth.supabase
        .from("child_profile_record")
        .select("*")
        .eq("child_id", child.child_id)
        .order("profiling_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      auth.supabase
        .from("nutritional_assessment")
        .select(
          "assessment_id, nutritional_status, assessment_date, is_at_risk, evaluation_status",
        )
        .eq("child_id", child.child_id)
        .order("assessment_date", { ascending: false })
        .order("assessment_id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      child.barangay_id
        ? auth.supabase
            .from("barangay")
            .select(
              "barangay_id, barangay_name, municipality, province, rhu_id",
            )
            .eq("barangay_id", child.barangay_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      child.household_id
        ? auth.supabase
            .from("household")
            .select(
              "household_id, household_no, family_serial_no, household_address, purok, is_4ps_member, water_source_type, toilet_facility_type, information_revision",
            )
            .eq("household_id", child.household_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      auth.supabase
        .from("vaccination_record")
        .select(
          "vaccination_record_id, vaccination_date, dose_number, batch_number, vaccination_site, remarks, vaccine_id, vaccine:vaccine(vaccine_type, dose_volume, route, target_age)",
        )
        .eq("child_id", child.child_id)
        .order("vaccination_date", { ascending: false }),
      auth.supabase
        .from("nutritional_assessment")
        .select(
          "assessment_id, assessment_date, weight, height, muac, measurement_type, edema_grade, waz, haz, whz, baz, bmi_for_age, muac_status, weight_for_age, height_for_age, weight_for_height, nutritional_status, evaluation_status, is_at_risk, engine_version, evaluated_at, remarks",
        )
        .eq("child_id", child.child_id)
        .order("assessment_date", { ascending: true })
        .order("assessment_id", { ascending: true }),
      auth.supabase
        .from("supplementation_record")
        .select(
          "supplementation_record_id, supplementation_date, quantity_given, batch_number, remarks, supplement_id, supplement:supplement(supplement_type, dosage, age_group)",
        )
        .eq("child_id", child.child_id)
        .order("supplementation_date", { ascending: false }),
      // Household members: other children sharing this household (and so its FSN).
      auth.supabase
        .from("child")
        .select("child_id, child_code, first_name, last_name, date_of_birth, status")
        .eq("household_id", child.household_id)
        .neq("child_id", child.child_id)
        .order("date_of_birth"),
      // Open alerts about this child that the signed-in worker can see (RLS-scoped feed).
      auth.supabase
        .from("alert_notification_feed")
        .select("alert_id", { count: "exact", head: true })
        .eq("child_id", child.child_id)
        .neq("status", "RESOLVED"),
    ]);
    if (latestAssessment.error || assessments.error)
      return invalid(
        "Unable to load nutritional assessment results. Please retry.",
        500,
      );
    // Hydrate the barangay's RHU name in a second step so the UI can show the full
    // hierarchy (RHU → Municipality → Barangay) without the client making another call.
    const rhu = barangay.data?.rhu_id
      ? await auth.supabase
          .from("rhu")
          .select("rhu_id, rhu_name")
          .eq("rhu_id", barangay.data.rhu_id)
          .maybeSingle()
      : { data: null };
    return NextResponse.json({
      child,
      guardian: guardian.data,
      profile: profile.data,
      monitoringStatus: latestAssessment.data
        ? (latestAssessment.data.nutritional_status ?? "Needs Review")
        : "Not Yet Assessed",
      barangay: barangay.data,
      household: household.data,
      rhu: rhu.data,
      vaccinations: vaccinations.data ?? [],
      assessments: withHistoryComparisons(assessments.data ?? []),
      supplementations: supplementations.data ?? [],
      // Related-record extras never fail the profile.
      siblings: siblings.error ? [] : (siblings.data ?? []),
      openAlertCount: openAlerts.error ? null : (openAlerts.count ?? 0),
    });
  }
  const assessments = await auth.supabase
    .from("nutritional_assessment")
    .select(
      "assessment_id, child_id, nutritional_status, assessment_date, is_at_risk, evaluation_status",
    )
    .in(
      "child_id",
      rows.map((child) => child.child_id),
    )
    .order("assessment_date", { ascending: false })
    .order("assessment_id", { ascending: false });
  if (assessments.error)
    return invalid(
      "Unable to load nutritional assessment results. Please retry.",
      500,
    );
  const latestStatus = new Map<number, string>();
  for (const assessment of assessments.data ?? [])
    if (!latestStatus.has(assessment.child_id))
      latestStatus.set(
        assessment.child_id,
        assessment.nutritional_status ?? "Needs Review",
      );
  // CP-USR001 — Format display IDs with registration-year prefix + zero-padding.
  // The raw child_id is still available via Number(id.replace(/^CH-/, '').split('-').pop())
  // for callers that need the integer PK (the children list page, parseId above).
  return NextResponse.json(
    rows.map((child) => ({
      child_id: child.child_id,
      id: child.child_code ?? formatChildId(child.child_id, child.registration_date),
      familySerialNo: embedded(child.household)?.family_serial_no ?? "",
      householdNo: embedded(child.household)?.household_no ?? "",
      guardianName: [embedded(child.guardian)?.first_name, embedded(child.guardian)?.last_name].filter(Boolean).join(" "),
      motherName: child.mother_name ?? "",
      householdNumber: child.household_id
        ? formatHouseholdId(child.household_id, null)
        : "",
      name: [child.first_name, child.middle_name, child.last_name]
        .filter(Boolean)
        .join(" "),
      barangay: child.barangay_id ? String(child.barangay_id) : "",
      address: child.address ?? "",
      dob: child.date_of_birth,
      age: `${Math.max(0, monthsOld(child.date_of_birth))} mos`,
      sex: child.sex,
      status: child.status,
      monitoringStatus: latestStatus.get(child.child_id) ?? "Not Yet Assessed",
      guardianId: child.guardian_id,
    })),
  );
}
export async function POST(request: Request) {
  const auth = await session("create");
  if (!auth) return invalid("Please sign in before registering a child.", 401);
  if ("forbidden" in auth)
    return invalid("Your role cannot register child profiles.", 403);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return invalid("Invalid request body.");
  }
  const firstName = String(body.first_name ?? "").trim();
  const middleName = String(body.middle_name ?? "").trim() || null;
  const lastName = String(body.last_name ?? "").trim();
  const dob = String(body.date_of_birth ?? "");
  const sex = String(body.sex ?? "")
    .trim()
    .toUpperCase();
  const barangayId = parseId(body.barangay_id);
  let householdId = parseId(body.household_id);
  if (!firstName || !lastName || !dob || !sex || !barangayId)
    return invalid(
      "First name, last name, date of birth, sex, and barangay are required.",
    );
  const date = new Date(`${dob}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    dob > new Date().toISOString().slice(0, 10)
  )
    return invalid("Date of birth must be valid and cannot be in the future.");
  if (monthsOld(dob) < 0 || monthsOld(dob) > 59)
    return invalid("Child must be between 0 and 59 months old.");
  const household =
    body.new_household && typeof body.new_household === "object"
      ? (body.new_household as Record<string, unknown>)
      : null;
  if (!householdId && household) {
    const created = await auth.supabase
      .from("household")
      .insert({
        household_no: String(household.household_no ?? "").trim(),
        household_address: String(household.household_address ?? "").trim(),
        purok: String(household.purok ?? "").trim() || null,
        is_4ps_member: Boolean(household.is_4ps_member),
        barangay_id: barangayId,
        // Water/toilet belong to the household (same as the offline upload path).
        water_source_type: String(body.water_source_type ?? "").trim() || null,
        toilet_facility_type: String(body.toilet_facility_type ?? "").trim() || null,
      })
      .select("household_id")
      .single();
    if (created.error)
      return invalid(
        created.error.code === "42501"
          ? "You are not assigned to this barangay, so you cannot create a household here. Ask your administrator to assign your account to the barangay first."
          : "Unable to create the household. Check the household details.",
        created.error.code === "42501" ? 403 : 400,
      );
    householdId = created.data.household_id;
  }
  if (!householdId)
    return invalid(
      "Select an existing household or enter new household details.",
    );
  const householdCheck = await auth.supabase
    .from("household")
    .select("household_id")
    .eq("household_id", householdId)
    .maybeSingle();
  if (!householdCheck.data) return invalid("Selected household was not found.");
  let guardianId = parseId(body.guardian_id);
  const newGuardian =
    body.new_guardian && typeof body.new_guardian === "object"
      ? (body.new_guardian as Record<string, unknown>)
      : null;
  if (!guardianId && newGuardian) {
    const guardian = await auth.supabase
      .from("guardian")
      .insert({
        first_name: String(newGuardian.first_name ?? "").trim(),
        middle_name: String(newGuardian.middle_name ?? "").trim() || null,
        last_name: String(newGuardian.last_name ?? "").trim(),
        contact_number: String(newGuardian.contact_number ?? "").trim() || null,
        address: String(newGuardian.address ?? "").trim() || null,
        relationship_to_child:
          String(newGuardian.relationship_to_child ?? "").trim() || null,
      })
      .select("guardian_id")
      .single();
    if (guardian.error)
      return invalid(
        guardian.error.code === "42501"
          ? "You are not authorized to register a guardian. Your account may still be pending approval."
          : "Unable to create the guardian. Check the guardian details.",
        guardian.error.code === "42501" ? 403 : 400,
      );
    guardianId = guardian.data.guardian_id;
  }
  if (guardianId) {
    const guardian = await auth.supabase
      .from("guardian")
      .select("guardian_id")
      .eq("guardian_id", guardianId)
      .maybeSingle();
    if (!guardian.data) return invalid("Selected guardian was not found.");
  }
  const duplicate = await auth.supabase
    .from("child")
    .select("child_id")
    .eq("first_name", firstName)
    .eq("last_name", lastName)
    .eq("date_of_birth", dob)
    .eq("household_id", householdId)
    .maybeSingle();
  if (duplicate.data)
    return NextResponse.json(
      {
        duplicate: true,
        error:
          "A child with the same name, birth date, and household is already registered.",
      },
      { status: 409 },
    );
  const inserted = await auth.supabase
    .from("child")
    .insert({
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      date_of_birth: dob,
      sex,
      birth_place: String(body.birth_place ?? "").trim() || null,
      address: String(body.address ?? "").trim() || null,
      registration_date: new Date().toISOString().slice(0, 10),
      status: "ACTIVE",
      household_id: householdId,
      barangay_id: barangayId,
      guardian_id: guardianId,
      birth_weight_kg: optionalNumber(body.birth_weight_kg),
      birth_height_cm: optionalNumber(body.birth_height_cm),
      mother_name: String(body.mother_name ?? "").trim() || null,
      father_name: String(body.father_name ?? "").trim() || null,
    })
    .select("child_id")
    .single();
  if (inserted.error)
    return invalid(
      inserted.error.code === "42501"
        ? "You are not authorized for this barangay."
        : "Unable to save the child record.",
      inserted.error.code === "42501" ? 403 : 500,
    );
  const profileFields = [
    "relationship_to_household_head",
    "civil_status",
    "religion",
    "ethnicity",
    "philhealth_membership_type",
    "philhealth_category",
    "medical_history",
    "medical_history_structured",
    "last_menstrual_period",
    "informant_name",
    "informant_relationship",
  ];
  const profile = Object.fromEntries(
    profileFields
      .filter((field) => body[field] !== undefined && body[field] !== "")
      .map((field) => [field, body[field]]),
  );
  if (Object.keys(profile).length) {
    const result = await auth.supabase.from("child_profile_record").insert({
      ...profile,
      child_id: inserted.data.child_id,
      profiling_date: new Date().toISOString().slice(0, 10),
      recorded_by: auth.user.id,
    });
    if (result.error)
      return invalid(
        "Child saved, but profiling details could not be saved.",
        500,
      );
  }
  if (!household) {
    const facilityError = await saveHouseholdFacilities(auth.supabase, householdId, body);
    if (facilityError)
      return NextResponse.json({ child_id: inserted.data.child_id, warning: `Child registered. ${facilityError}` }, { status: 201 });
  }
  return NextResponse.json(
    { child_id: inserted.data.child_id },
    { status: 201 },
  );
}
export async function PATCH(request: Request) {
  const auth = await session("edit");
  if (!auth) return invalid("Please sign in before editing a child.", 401);
  if ("forbidden" in auth)
    return invalid("Your role cannot edit child profiles.", 403);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const childId = parseId(body?.child_id);
  if (!childId) return invalid("A valid child is required.");
  const changingGuardianContact = body?.guardian_contact_number !== undefined;
  let guardianContact: string | null = null;
  let expectedGuardianId: number | null = null;
  if (changingGuardianContact) {
    if (typeof body?.guardian_contact_number !== "string")
      return invalid("Guardian contact number must be text.");
    guardianContact = body.guardian_contact_number.trim() || null;
    if (
      guardianContact &&
      !/^(?:09[0-9]{9}|639[0-9]{9}|\+639[0-9]{9})$/.test(guardianContact)
    ) {
      return invalid(
        "Use 09XXXXXXXXX, 639XXXXXXXXX or +639XXXXXXXXX for the guardian mobile number.",
      );
    }
    // Read through the signed-in client; never accept an unrelated guardian ID.
    const scopedChild = await auth.supabase
      .from("child")
      .select("guardian_id")
      .eq("child_id", childId)
      .maybeSingle();
    if (scopedChild.error)
      return invalid("Unable to verify the child before saving.", 500);
    if (!scopedChild.data)
      return invalid("Child not found or outside your scope.", 403);
    const targetGuardianId =
      body?.guardian_id === undefined
        ? scopedChild.data.guardian_id
        : parseId(body.guardian_id);
    if (!targetGuardianId)
      return invalid("Select a guardian before changing the contact number.");
    expectedGuardianId = Number(targetGuardianId);
    const guardian = await auth.supabase
      .from("guardian")
      .select("guardian_id")
      .eq("guardian_id", targetGuardianId)
      .maybeSingle();
    if (guardian.error || !guardian.data)
      return invalid(
        "Selected guardian is unavailable or outside your scope.",
        403,
      );
  }
  // Build the child-table UPDATE payload. Form state sends every value as a string, so
  // bigint FK columns (barangay_id, household_id, guardian_id) need to be coerced before
  // sending to Supabase — otherwise PostgREST may silently reject the update. Sex is
  // normalized to the uppercase MALE/FEMALE the CHECK constraint expects.
  const idFields = new Set(["barangay_id", "household_id", "guardian_id"]);
  const childFields = [
    "first_name",
    "middle_name",
    "last_name",
    "date_of_birth",
    "sex",
    "birth_place",
    "address",
    "barangay_id",
    "household_id",
    "guardian_id",
    "birth_weight_kg",
    "birth_height_cm",
    "mother_name",
    "father_name",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of childFields) {
    if (body?.[field] === undefined) continue;
    const raw = body[field];
    if (field === "sex") {
      const sex = String(raw ?? "")
        .trim()
        .toUpperCase();
      updates.sex = sex || null;
    } else if (idFields.has(field)) {
      // Empty string → null (unlink). Otherwise coerce to int for bigint columns.
      if (raw === "" || raw === null || raw === undefined) {
        updates[field] = null;
      } else {
        const n = Number(raw);
        if (!Number.isSafeInteger(n) || n <= 0)
          return invalid(`Invalid ${field} value.`);
        updates[field] = n;
      }
    } else if (field === "birth_weight_kg" || field === "birth_height_cm") {
      updates[field] = optionalNumber(raw);
    } else {
      updates[field] = raw === "" ? null : raw;
    }
  }
  if (updates.date_of_birth && monthsOld(String(updates.date_of_birth)) > 59)
    return invalid(
      "Child must be between 0 and 59 months old at registration.",
    );
  // Only run the UPDATE if there's actually something to change. select() + maybeSingle()
  // after the update confirms a row was returned — if the UPDATE matched zero rows (wrong
  // id, or RLS blocked it silently), we surface a clear error instead of claiming success.
  if (Object.keys(updates).length > 0) {
    const result = await auth.supabase
      .from("child")
      .update(updates)
      .eq("child_id", childId)
      .select("child_id")
      .maybeSingle();
    if (result.error) {
      const code = result.error.code;
      const message =
        code === "42501"
          ? "You are not authorized to edit this child. Your account may not be assigned to the child's barangay."
          : code === "23514"
            ? "One of the values does not meet the database rules (e.g. sex must be Male or Female)."
            : code === "23503"
              ? "The barangay, household, or guardian you selected does not exist."
              : `Unable to update the child record. [${code ?? "unknown"}] ${result.error.message ?? ""}`.trim();
      return invalid(message, code === "42501" ? 403 : 500);
    }
    if (!result.data) {
      return invalid(
        "No child record was updated. The child may have been removed, or your account does not have access to this barangay.",
        403,
      );
    }
  }
  // Profile fields (child_profile_record). philhealth_id_number was previously missing —
  // added so edits to the PhilHealth ID actually persist.
  const profileFields = [
    "relationship_to_household_head",
    "civil_status",
    "religion",
    "ethnicity",
    "philhealth_id_number",
    "philhealth_membership_type",
    "philhealth_category",
    "medical_history",
    "medical_history_structured",
    "last_menstrual_period",
    "informant_name",
    "informant_relationship",
  ];
  const patchBody = body ?? {};
  const profileUpdates = Object.fromEntries(
    profileFields
      .filter((field) => patchBody[field] !== undefined)
      .map((field) => [
        field,
        patchBody[field] === "" ? null : patchBody[field],
      ]),
  );
  if (Object.keys(profileUpdates).length) {
    const existing = await auth.supabase
      .from("child_profile_record")
      .select("profile_record_id")
      .eq("child_id", childId)
      .order("profiling_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Chain .select().maybeSingle() so we can tell apart (a) a real DB error, (b) RLS
    // silently returning zero rows, and (c) a legitimate successful write.
    const profileResult = existing.data
      ? await auth.supabase
          .from("child_profile_record")
          .update(profileUpdates)
          .eq("profile_record_id", existing.data.profile_record_id)
          .select("profile_record_id")
          .maybeSingle()
      : await auth.supabase
          .from("child_profile_record")
          .insert({
            ...profileUpdates,
            child_id: childId,
            profiling_date: new Date().toISOString().slice(0, 10),
            recorded_by: auth.user.id,
          })
          .select("profile_record_id")
          .maybeSingle();
    if (profileResult.error) {
      const code = profileResult.error.code;
      const message =
        code === "42501"
          ? "Child updated, but you are not authorized to change its profiling details for this barangay."
          : `Child updated, but profiling details could not be saved. [${code ?? "unknown"}] ${profileResult.error.message ?? ""}`.trim();
      return invalid(message, code === "42501" ? 403 : 500);
    }
    if (!profileResult.data) {
      // No DB error but zero rows written — almost always an RLS mismatch.
      return invalid(
        "Child updated, but profiling details were not saved. Your account may not be assigned to this child's barangay.",
        403,
      );
    }
  }
  if (body && (body.water_source_type !== undefined || body.toilet_facility_type !== undefined)) {
    const linked = await auth.supabase.from("child").select("household_id").eq("child_id", childId).maybeSingle();
    if (linked.data?.household_id) {
      const revision = body.household_revision === undefined || body.household_revision === "" ? undefined : Number(body.household_revision);
      const facilityError = await saveHouseholdFacilities(auth.supabase, Number(linked.data.household_id), body, revision);
      if (facilityError) return invalid(`Child details saved, but ${facilityError.charAt(0).toLowerCase()}${facilityError.slice(1)}`, 409);
    }
  }
  if (changingGuardianContact) {
    // Re-read the saved link so the contact change applies only to this child's guardian.
    const linkedChild = await auth.supabase
      .from("child")
      .select("guardian_id")
      .eq("child_id", childId)
      .maybeSingle();
    if (
      linkedChild.error ||
      !linkedChild.data?.guardian_id ||
      Number(linkedChild.data.guardian_id) !== expectedGuardianId
    ) {
      return invalid(
        "Child details saved, but the linked guardian could not be verified. Refresh before retrying.",
        409,
      );
    }
    const guardianResult = await auth.supabase
      .from("guardian")
      .update({ contact_number: guardianContact })
      .eq("guardian_id", linkedChild.data.guardian_id)
      .select("guardian_id, contact_number")
      .maybeSingle();
    if (guardianResult.error || !guardianResult.data) {
      console.error("Guardian contact update:", guardianResult.error);
      return invalid(
        "Child details saved, but the guardian contact number was not saved. Check your guardian update permissions.",
        guardianResult.error && guardianResult.error.code !== "42501"
          ? 500
          : 403,
      );
    }
    // The existing guardian trigger clears SMS confirmation when the number changes.
  }
  return NextResponse.json({ message: "Child updated successfully." });
}
