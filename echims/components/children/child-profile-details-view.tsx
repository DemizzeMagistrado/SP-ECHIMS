import Link from "next/link";
import type { ReactNode } from "react";
import { Baby, Home, MapPin, Phone, Scale, Users } from "lucide-react";
import { ChildProfileBanner, InfoRow, SectionCard } from "@/components/children/child-profile-cards";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { CHILD_ID_HELP, FSN_HELP, InfoTip } from "@/components/ui/info-tip";
import { formatChildId } from "@/lib/formatters";
import { ageDescription, classificationForDob } from "@/lib/children/profile-age";
import { NO_PHILHEALTH } from "@/lib/children/profile-fields";
import { describeMedicalHistory, type MedicalHistory } from "@/lib/children/medical-history";
import { nutritionTone } from "@/lib/nutrition-status";
import type { HistoryAssessment } from "@/lib/nutrition-history";

export type ChildRow = {
  child_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string;
  sex: string;
  birth_place: string | null;
  address: string | null;
  registration_date: string | null;
  status: string | null;
  household_id: number | null;
  barangay_id: number | null;
  guardian_id: number | null;
  birth_weight_kg?: number | string | null;
  birth_length_cm?: number | string | null;
  birth_height_cm?: number | string | null;
  mother_name?: string | null;
  father_name?: string | null;
  child_code?: string | null;
};
export type Guardian = {
  guardian_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  contact_number: string | null;
  address: string | null;
  relationship_to_child: string | null;
  sms_opt_in?: boolean;
  sms_verified_contact_number?: string | null;
  sms_contact_verified_at?: string | null;
};
export type Profile = {
  profile_record_id: number;
  profiling_date: string | null;
  relationship_to_household_head: string | null;
  religion: string | null;
  ethnicity: string | null;
  philhealth_id_number: string | null;
  philhealth_membership_type: string | null;
  philhealth_category: string | null;
  medical_history: string | null;
  water_source_type: string | null;
  toilet_facility_type: string | null;
  informant_name?: string | null;
  informant_relationship?: string | null;
  medical_history_structured?: MedicalHistory | null;
};
export type BarangayRow = {
  barangay_id: number;
  barangay_name: string;
  municipality: string | null;
  province: string | null;
  rhu_id: number | null;
};
export type HouseholdRow = {
  household_id: number;
  household_no: string | null;
  family_serial_no?: string | null;
  water_source_type?: string | null;
  toilet_facility_type?: string | null;
  household_address: string | null;
  purok: string | null;
  is_4ps_member: boolean | null;
};
export type RhuRow = { rhu_id: number; rhu_name: string | null };
export type Assessment = HistoryAssessment & {
  assessment_id: number;
  assessment_date: string;
  weight: number | string | null;
  height: number | string | null;
  muac: number | string | null;
  weight_for_age: string | null;
  height_for_age: string | null;
  weight_for_height: string | null;
  nutritional_status: string | null;
  remarks: string | null;
  is_at_risk: boolean | null;
  // Other saved evaluator fields supplied by the child API.
  bmi_for_age?: string | null;
  muac_status?: string | null;
  evaluation_status?: string | null;
};

export type ChildProfileDetails = {
  child: ChildRow;
  guardian: Guardian | null;
  profile: Profile | null;
  barangay: BarangayRow | null;
  household: HouseholdRow | null;
  rhu: RhuRow | null;
  monitoringStatus: string;
};

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
type Tone = "default" | "success" | "warning" | "danger";
function classificationCode(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}
const urgentNutritionCodes = new Set([
  "SAM",
  "SEVERE_ACUTE_MALNUTRITION",
  "INFANT_URGENT_REVIEW",
  "SEVERELY_UNDERWEIGHT",
  "SEVERELY_STUNTED",
  "SEVERELY_WASTED",
  "SEVERE_WASTING",
  "SEVERE_THINNESS",
  "SEVERELY_THIN",
]);
const riskNutritionCodes = new Set([
  ...urgentNutritionCodes,
  "MAM",
  "MODERATE_ACUTE_MALNUTRITION",
  "UNDERWEIGHT",
  "STUNTED",
  "WASTED",
  "WASTING",
  "THINNESS",
  "THIN",
  "OVERWEIGHT",
  "OBESE",
  "OBESITY",
  "POSSIBLE_RISK_OF_OVERWEIGHT",
  "AT_RISK",
]);
const nonRiskNutritionCodes = new Set([
  "NORMAL",
  "NOT_UNDERWEIGHT",
  "NOT_STUNTED",
  "NO_ACUTE_CRITERIA_IDENTIFIED",
  "NOT_APPLICABLE",
]);
function classificationLabel(value: string | null | undefined) {
  const code = classificationCode(value);
  if (!code) return "Not available";
  if (code === "SAM" || code === "MAM") return code;
  if (code === "NOT_INTERPRETABLE_EDEMA") return "Not interpretable (edema)";
  return code
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function statusTone(status: string): Tone {
  const code = classificationCode(status);
  if (urgentNutritionCodes.has(code)) return "danger";
  if (riskNutritionCodes.has(code) || code === "NEEDS_VERIFICATION")
    return "warning";
  if (nonRiskNutritionCodes.has(code) || code === "HEALTHY") return "success";
  return "default";
}
export function latestAssessment(rows: Assessment[]): Assessment | null {
  return (
    [...rows].sort(
      (a, b) =>
        b.assessment_date.localeCompare(a.assessment_date) ||
        Number(b.assessment_id) - Number(a.assessment_id),
    )[0] ?? null
  );
}
function nutritionSummary(record: Assessment | null): {
  label: string;
  tone: Tone;
  detail: string;
  reasons: string[];
} {
  if (!record)
    return {
      label: "Nutrition: Not assessed",
      tone: "default",
      detail: "No saved nutritional assessment is available for this child.",
      reasons: [],
    };
  const values = [
    record.weight_for_age,
    record.height_for_age,
    record.weight_for_height,
    record.nutritional_status,
    record.bmi_for_age,
    record.muac_status,
  ];
  const codes = values.map(classificationCode);
  const reasons = [
    ...new Set(codes.filter((code) => riskNutritionCodes.has(code))),
  ].map(classificationLabel);
  if (record.is_at_risk === true)
    return {
      label: "Nutrition: At risk",
      tone: codes.some((code) => urgentNutritionCodes.has(code))
        ? "danger"
        : "warning",
      detail: codes.includes("NOT_INTERPRETABLE_EDEMA")
        ? "The saved assessment is flagged for nutrition follow-up. Weight-based indicators are recorded as not interpretable because of edema."
        : "The latest saved assessment is flagged for nutrition follow-up. Review its classifications and related alerts.",
      reasons,
    };
  if (record.is_at_risk === false)
    return {
      label: "Nutrition: No recorded risk",
      tone: "success",
      detail:
        "The latest saved assessment has no recorded nutritional risk. This describes that assessment only.",
      reasons: [],
    };
  return {
    label: "Nutrition: Needs review",
    tone: "warning",
    detail:
      "The stored risk result is unavailable or incomplete. A normal result is not assumed.",
    reasons: [],
  };
}
const badgeTone = { danger: "danger", warning: "warn", success: "good", default: "neutral" } as const;
/** Latest assessment summary for the Child Information card: date, each indicator, comments. */
function LatestNutrition({ record, canAdd, canOpenModule, onOpenHistory }: { record: Assessment | null; canAdd: boolean; canOpenModule: boolean; onOpenHistory?: () => void }) {
  const indicators: [string, string | null | undefined][] = record ? [
    ["Weight-for-age", record.weight_for_age],
    ["Height-for-age", record.height_for_age],
    ["Weight-for-height", record.weight_for_height],
    ["BMI-for-age", record.bmi_for_age],
    ["MUAC", record.muac_status],
  ] : [];
  return (
    <section aria-labelledby="latest-nutrition-title" className="mt-5 border-t border-border pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id="latest-nutrition-title" className="font-semibold text-brand-navy">
          Latest nutritional assessment{record && <span className="font-normal text-muted-foreground"> · {formatDate(record.assessment_date)}</span>}
        </h3>
        {record && <a href="#nutrition-history" onClick={onOpenHistory} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Full nutrition history</a>}
      </div>
      {!record ? (
        <EmptyState
          size="section"
          icon={Scale}
          title="No nutritional assessment yet"
          description={onOpenHistory ? undefined : "Weigh and measure the child to record the first assessment."}
          action={canAdd ? <Link href="/nutritional-assessment/records" className={buttonVariants({ variant: "secondary", size: "sm" })}>Add assessment</Link> : undefined}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {indicators.filter(([, v]) => v).map(([label, v]) => (
              <StatusBadge key={label} status={String(v)} tone={nutritionTone(String(v))} label={<><span className="font-normal opacity-80">{label}:</span> {classificationLabel(v)}</>} />
            ))}
            {indicators.every(([, v]) => !v) && <StatusBadge status="pending" tone="neutral" label="Indicators not yet evaluated" />}
          </div>
          <div className="rounded-xl bg-brand-ice/60 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</p>
            <p className="mt-1 whitespace-pre-line text-foreground">{record.remarks?.trim() || "No comments were recorded with this assessment."}</p>
          </div>
          {canOpenModule && canAdd && (
            <Link href="/nutritional-assessment/records" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">Record a new assessment</Link>
          )}
        </div>
      )}
    </section>
  );
}

export function ChildProfileDetailsView({
  data, latestNutrition, navigation, guardianActions, householdMembers, canAddNutrition = false, canViewNutrition = false, medicalConditions, onOpenNutritionHistory,
}: {
  data: ChildProfileDetails;
  latestNutrition: Assessment | null;
  navigation?: ReactNode;
  guardianActions?: ReactNode;
  householdMembers?: ReactNode;
  canAddNutrition?: boolean;
  canViewNutrition?: boolean;
  onOpenNutritionHistory?: () => void;
  medicalConditions?: Parameters<typeof describeMedicalHistory>[1];
}) {
  const { child, guardian, profile, monitoringStatus, barangay, household, rhu } = data;
  const fullName = [child.first_name, child.middle_name, child.last_name].filter(Boolean).join(" ");
  const guardianName = guardian ? [guardian.first_name, guardian.middle_name, guardian.last_name].filter(Boolean).join(" ") : null;
  const nutrition = nutritionSummary(latestNutrition);
  return (
    <>
      <ChildProfileBanner>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="hidden rounded-xl bg-brand-ice p-3 text-primary sm:block">
              <Baby size={28} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">{fullName}</h1>
              <p className="mt-1 text-sm text-brand-muted">
                {titleCase(child.sex)} · {ageDescription(child.date_of_birth)} · Born {formatDate(child.date_of_birth)}
                {barangay?.barangay_name && <> · {barangay.barangay_name}</>}
              </p>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                <div className="flex items-center gap-1.5">
                  <dt className="inline-flex items-center gap-1 text-brand-muted">Child ID <InfoTip label="About Child ID">{CHILD_ID_HELP}</InfoTip></dt>
                  <dd className="font-mono font-semibold text-brand-navy">{child.child_code ?? formatChildId(child.child_id, child.registration_date)}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="inline-flex items-center gap-1 text-brand-muted">Family Serial Number (FSN) <InfoTip label="About the Family Serial Number (FSN)">{FSN_HELP}</InfoTip></dt>
                  <dd className="font-mono font-semibold text-brand-navy">{household?.family_serial_no ?? "—"}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={child.status ?? "ACTIVE"} tone={child.status === "DECEASED" ? "danger" : child.status === "MOVED" || child.status === "LOST" ? "warn" : child.status === "INACTIVE" ? "neutral" : "good"} dot />
            <StatusBadge status="age" tone="info" label={classificationForDob(child.date_of_birth)} />
            <StatusBadge status="monitoring" tone={badgeTone[statusTone(monitoringStatus)]} label={`Monitoring: ${monitoringStatus}`} />
            <StatusBadge status="nutrition" tone={badgeTone[nutrition.tone]} label={nutrition.label} />
          </div>
        </div>
      </ChildProfileBanner>
      {navigation}
      <SectionCard
        title="Child Information"
        subtitle="Details of the registered child"
        icon={<Baby size={18} />}
      >
        <dl className="grid gap-x-8 divide-y divide-border md:grid-cols-2 md:divide-y-0">
          <div className="divide-y divide-border">
            <InfoRow label="Full name" value={fullName} />
            <InfoRow label="Sex" value={titleCase(child.sex)} />
            <InfoRow label="Date of birth" value={formatDate(child.date_of_birth)} />
            <InfoRow label="Age group" value={classificationForDob(child.date_of_birth)} />
            <InfoRow label="Place of birth" value={child.birth_place || "—"} />
            <InfoRow label="Birth weight" value={child.birth_weight_kg ? `${child.birth_weight_kg} kg` : "—"} />
            <InfoRow label="Birth height" value={(child.birth_height_cm ?? child.birth_length_cm) ? `${child.birth_height_cm ?? child.birth_length_cm} cm` : "—"} />
            <InfoRow label="Registered" value={formatDate(child.registration_date)} />
          </div>
          <div className="divide-y divide-border">
            <InfoRow label="Relationship to household head" value={profile?.relationship_to_household_head || "—"} />
            <InfoRow label="Religion" value={profile?.religion || "—"} />
            <InfoRow label="Ethnicity" value={profile?.ethnicity || "—"} />
            <InfoRow
              label="PhilHealth"
              value={!profile?.philhealth_membership_type
                ? <span className="text-warn">Not recorded — needs review</span>
                : NO_PHILHEALTH.has(profile.philhealth_membership_type)
                  ? profile.philhealth_membership_type
                  : [profile.philhealth_membership_type, profile.philhealth_id_number, profile.philhealth_category].filter(Boolean).join(" · ")}
            />
            <InfoRow
              label="Medical history"
              value={describeMedicalHistory(profile?.medical_history_structured ?? null, medicalConditions ?? []) || profile?.medical_history || "—"}
            />
          </div>
        </dl>
        <LatestNutrition
          record={latestNutrition}
          canAdd={canAddNutrition}
          canOpenModule={canViewNutrition}
          onOpenHistory={onOpenNutritionHistory}
        />
      </SectionCard>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Guardian Information"
          subtitle="Given by the parent or guardian, encoded by the health worker"
          icon={<Users size={18} />}
        >
          <dl className="divide-y divide-border">
            <InfoRow label="Mother" value={child.mother_name || "—"} />
            <InfoRow label="Father" value={child.father_name || "—"} />
            {guardian && (<>
              <InfoRow label="Present guardian" value={guardianName} />
              <InfoRow label="Relationship" value={guardian.relationship_to_child || "—"} />
              <InfoRow label="Contact number" value={guardian.contact_number || "—"} icon={<Phone size={14} />} />
              <InfoRow label="Address" value={guardian.address || "—"} icon={<MapPin size={14} />} />
            </>)}
            <InfoRow
              label="Information provided by"
              value={profile?.informant_name ? `${profile.informant_name}${profile.informant_relationship ? ` (${profile.informant_relationship})` : ""}` : "—"}
            />
          </dl>
          {guardianActions}
        </SectionCard>
        <SectionCard
          title="Household Information"
          subtitle="Where the child lives"
          icon={<Home size={18} />}
        >
          <dl className="divide-y divide-border">
            <InfoRow label="Family Serial Number (FSN)" value={household?.family_serial_no ? <span className="font-mono font-semibold">{household.family_serial_no}</span> : "—"} />
            <InfoRow
              label="Household no."
              value={household ? (household.household_no ? `HH-${household.household_no}` : `HH-${household.household_id}`) : "—"}
            />
            <InfoRow label="Household address" value={household?.household_address || "—"} icon={<MapPin size={14} />} />
            <InfoRow label="Purok" value={household?.purok || "—"} />
            <InfoRow label="Child's address" value={child.address || "—"} />
            <InfoRow
              label="Barangay"
              value={barangay
                ? `${barangay.barangay_name}${barangay.municipality ? ` · ${barangay.municipality}` : ""}${barangay.province ? `, ${barangay.province}` : ""}`
                : "—"}
            />
            <InfoRow label="RHU" value={rhu?.rhu_name || "—"} />
            <InfoRow label="4Ps member" value={household ? (household.is_4ps_member ? "Yes" : "No") : "—"} />
            <InfoRow label="Water source" value={household?.water_source_type || profile?.water_source_type || "—"} />
            <InfoRow label="Toilet facility" value={household?.toilet_facility_type || profile?.toilet_facility_type || "—"} />
          </dl>
          {householdMembers}
        </SectionCard>
      </div>
    </>
  );
}
