"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
// CHILD-USR003 — View Child Profile
// Centralized profile view that pulls the child record, their linked guardian,
// their household and barangay context, and every related health record
// (vaccinations, nutritional assessments, supplementations) in one page.
// Backed by GET /api/children?childId={id} which fans the queries out in parallel.
import { use, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { SupplementationHistorySection } from "@/components/children/supplementation-history-section";

import { NutritionHistorySection } from "@/components/children/nutrition-history-section";
import type { HistoryAssessment } from "@/lib/nutrition-history";
import {
  ArrowLeft,
  Pencil,
  Baby,
  Users,
  MapPin,
  Phone,
  Home,
  ArrowRightLeft,
  History,
  Printer,
  Scale,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { canPerform, type UserRole } from "@/lib/echims-data";
import { formatChildId } from "@/lib/formatters";
import { NO_PHILHEALTH } from "@/lib/children/profile-fields";
import { describeMedicalHistory, type MedicalHistory } from "@/lib/children/medical-history";
import { useMedicalHistoryOptions } from "@/components/children/medical-history-picker";
import { ChildFormModal } from "@/components/children/child-form-modal";
import { ChangeStatusModal } from "@/components/children/change-status-modal";
import { VaccinationScheduleSection } from "@/components/children/vaccination-schedule-section";
import { toast } from '@/components/ui/toast'
import { GuardianSmsConsent } from "@/components/children/guardian-sms-consent";
import { GuardianSmsHistory } from "@/components/children/guardian-sms-history";
import { LogoLoader } from '@/components/brand/logo-loader'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
type ChildRow = {
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
  birth_height_cm?: number | string | null;
  mother_name?: string | null;
  father_name?: string | null;
  child_code?: string | null;
};
type Guardian = {
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
type Profile = {
  profile_record_id: number;
  profiling_date: string | null;
  relationship_to_household_head: string | null;
  civil_status: string | null;
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
type BarangayRow = {
  barangay_id: number;
  barangay_name: string;
  municipality: string | null;
  province: string | null;
  rhu_id: number | null;
};
type HouseholdRow = {
  household_id: number;
  household_no: string | null;
  family_serial_no?: string | null;
  household_address: string | null;
  purok: string | null;
  is_4ps_member: boolean | null;
};
type RhuRow = { rhu_id: number; rhu_name: string | null };
type Vaccination = {
  vaccination_record_id: number;
  vaccination_date: string;
  dose_number: number | null;
  batch_number: string | null;
  vaccination_site: string | null;
  remarks: string | null;
  vaccine: {
    vaccine_type: string;
    dose_volume: string | null;
    route: string | null;
    target_age: string | null;
  } | null;
};
type Assessment = HistoryAssessment & {
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
type Supplementation = {
  supplementation_record_id: number;
  supplementation_date: string;
  quantity_given: number | null;
  batch_number: string | null;
  remarks: string | null;
  supplement: {
    supplement_type: string;
    dosage: string | null;
    age_group: string | null;
  } | null;
};
type MovementRow = {
  movement_id: number;
  movement_type: string;
  movement_date: string;
  reason: string | null;
  status: string;
  previous_address: string | null;
  new_address: string | null;
  remarks: string | null;
  recorded_at: string;
};
type ProfilePayload = {
  child: ChildRow;
  guardian: Guardian | null;
  profile: Profile | null;
  monitoringStatus: string;
  barangay: BarangayRow | null;
  household: HouseholdRow | null;
  rhu: RhuRow | null;
  vaccinations: Vaccination[];
  assessments: Assessment[];
  supplementations: Supplementation[];
  siblings?: { child_id: number; child_code: string | null; first_name: string; last_name: string; date_of_birth: string; status: string | null }[];
  openAlertCount?: number | null;
};
const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an unreadable child profile response.",
    );
  }
  if (!response.ok)
    throw new Error(data.error || "Unable to load the child profile.");
  if(url.startsWith('/api/children?') && (!data || typeof data!=='object' || !data.child || !Number.isSafeInteger(Number(data.child.child_id)))) {
    throw new Error('This saved child profile is incomplete. Reconnect and open the child online to refresh it.');
  }
  return data;
};
function ageDescription(dob: string) {
  if (!dob) return "—";
  const birth = new Date(`${dob}T00:00:00Z`);
  if (isNaN(birth.getTime())) return "—";
  const now = new Date();
  const months =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    birth.getUTCMonth() -
    (now.getUTCDate() < birth.getUTCDate() ? 1 : 0);
  if (months < 0) return "Not yet born";
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder ? `${years} y ${remainder} mo` : `${years} years`;
}
function classificationForDob(dob: string) {
  if (!dob) return "—";
  const birth = new Date(`${dob}T00:00:00Z`);
  if (isNaN(birth.getTime())) return "—";
  const days = Math.floor((Date.now() - birth.getTime()) / 86400000);
  const now = new Date();
  const months =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    birth.getUTCMonth() -
    (now.getUTCDate() < birth.getUTCDate() ? 1 : 0);
  if (days < 0) return "—";
  if (days <= 28) return "Newborn (0-28 days)";
  if (months < 12) return "Infant (0-1 y/o)";
  if (months <= 59) return "PSAC (1-4 y/o)";
  return "Out of 0-59 months range";
}
function formatDate(value: string | null | undefined) {
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
function Chip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const colors = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    danger: "bg-red-50 text-red-700 ring-1 ring-red-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${colors}`}
    >
      {children}
    </span>
  );
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
function latestAssessment(rows: Assessment[]): Assessment | null {
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
function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-3 py-2">
      <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value ?? "—"}</dd>
    </div>
  );
}
function SectionCard({
  title,
  subtitle,
  icon,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {icon && (
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              {icon}
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
const badgeTone = { danger: "danger", warning: "warn", success: "good", default: "neutral" } as const;
/** Latest assessment summary for the Child Information card: date, each indicator, comments. */
function LatestNutrition({ record, canAdd, canOpenModule }: { record: Assessment | null; canAdd: boolean; canOpenModule: boolean }) {
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
        {record && <a href="#nutrition-history" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Full nutrition history</a>}
      </div>
      {!record ? (
        <EmptyState
          size="section"
          icon={Scale}
          title="No nutritional assessment yet"
          description="Weigh and measure the child to record the first assessment."
          action={canAdd ? <Link href="/nutritional-assessment/records" className={buttonVariants({ variant: "secondary", size: "sm" })}>Add assessment</Link> : undefined}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {indicators.filter(([, v]) => v).map(([label, v]) => (
              <StatusBadge key={label} status={String(v)} tone={badgeTone[statusTone(String(v))]} label={<><span className="font-normal opacity-80">{label}:</span> {classificationLabel(v)}</>} />
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
// Accept database IDs, formatted display IDs, and links from older child lists.
function parseChildRouteId(value: string): number {
  const match = /^(?:E?CH-)?(?:\d{4}-)?(\d+)$/i.exec(value.trim());
  if (!match) return Number.NaN;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : Number.NaN;
}
export default function ChildProfilePage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  // Next 16 app-router: params is a Promise, unwrapped with React.use()
  const { childId } = use(params);
  return <ChildProfileView childId={childId} />;
}
export function ChildProfileView({childId}: {childId: string}) {
  const parsedId = parseChildRouteId(childId);
  const { user, isReady } = useAuth();
  const role = user?.role as UserRole | undefined;
  const isApproved = user?.accountStatus === "APPROVED";
  const canView = Boolean(
    role && isApproved && canPerform(role, "Child Profiling", "view"),
  );
  const canEdit = Boolean(
    role && isApproved && canPerform(role, "Child Profiling", "edit"),
  );
  const canViewAlerts = Boolean(role && isApproved && canPerform(role, "Alerts", "view"));
  const canAddNutrition = Boolean(
    role && isApproved && canPerform(role, "Nutritional Assessment", "create"),
  );
  const canViewNutrition = Boolean(
    role && isApproved && canPerform(role, "Nutritional Assessment", "view"),
  );
  const { data, error, isLoading, mutate } = useSWR<ProfilePayload>(
    isReady && canView && Number.isSafeInteger(parsedId) && parsedId > 0
      ? `/api/children?childId=${parsedId}`
      : null,
    fetcher,
  );
  // In-place edit modal: opens over this profile page, saves via PATCH /api/children,
  // and on success mutates the SWR cache so the profile re-renders with the new data
  // without the user leaving the page.
  const { data: medicalOptions } = useMedicalHistoryOptions();
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  // Movement history — loaded alongside the main profile. Updates whenever the user
  // marks a status change via the ChangeStatusModal (we mutate() this on save).
  const { data: movements, mutate: mutateMovements } = useSWR<MovementRow[]>(
    isReady && canView && Number.isSafeInteger(parsedId) && parsedId > 0
      ? `/api/children/${parsedId}/movement`
      : null,
    fetcher,
  );
  if (!isReady) {
    return (
      <LogoLoader label="Loading child profile…" />
    );
  }
  if (!canView) {
    return (
      <div className="space-y-4">
        <Link
          href="/child-profiling/children"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to Children
        </Link>
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">
          You are not authorized to view child profiles.
        </div>
      </div>
    );
  }
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
    return (
      <div className="space-y-4">
        <Link
          href="/child-profiling/children"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to Children
        </Link>
        <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">
          Invalid child ID.
        </div>
      </div>
    );
  }
  if (isLoading || !data) {
    if (error) {
      return (
        <div className="space-y-4">
          <Link
            href="/child-profiling/children"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Back to Children
          </Link>
          <div className="rounded-2xl border border-border bg-white p-10 text-center text-red-600">
            {error.message}
          </div>
        </div>
      );
    }
    return (
      <LogoLoader label="Loading child profile…" />
    );
  }
  const {
    child,
    guardian,
    profile,
    monitoringStatus,
    barangay,
    household,
    rhu,
    assessments,
    siblings = [],
    openAlertCount,
  } = data;
  const fullName = [child.first_name, child.middle_name, child.last_name]
    .filter(Boolean)
    .join(" ");
  const latestNutrition = latestAssessment(assessments ?? []);
  const nutrition = nutritionSummary(latestNutrition);
  const guardianName = guardian
    ? [guardian.first_name, guardian.middle_name, guardian.last_name]
        .filter(Boolean)
        .join(" ")
    : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/child-profiling/children"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to Children
        </Link>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} aria-hidden="true" />
              Print
            </Button>
            {canEdit && (<>
            <button
              type="button"
              onClick={() => setStatusOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <ArrowRightLeft size={16} />
              Change status
            </button>
            <Button variant="secondary"
              onClick={() => setEditOpen(true)}
            >
              <Pencil size={16} />
              Edit profile
            </Button>
            </>)}
          </div>
      </div>
      {/* Hero card: child identity + quick status chips */}
      <section className="rounded-2xl border border-border bg-gradient-to-r from-primary/5 to-sky-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-4 text-primary">
              <Baby size={32} />
            </div>
            <div>
              <dl className="flex flex-wrap gap-2 text-xs">
                <div className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-border">
                  <dt className="inline font-medium text-muted-foreground">Child ID </dt>
                  <dd className="inline font-mono font-semibold text-brand-navy">{child.child_code ?? formatChildId(child.child_id, child.registration_date)}</dd>
                </div>
                <div className="rounded-lg bg-white px-2.5 py-1 ring-1 ring-border" title="Family no. on the Child Immunization Record card">
                  <dt className="inline font-medium text-muted-foreground">Family Serial No. </dt>
                  <dd className="inline font-mono font-semibold text-brand-navy">{household?.family_serial_no ?? "—"}</dd>
                </div>
              </dl>
              <h1 className="mt-1 text-3xl font-bold text-foreground">
                {fullName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {titleCase(child.sex)} · {ageDescription(child.date_of_birth)} ·
                Born {formatDate(child.date_of_birth)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip tone="success">
              {classificationForDob(child.date_of_birth)}
            </Chip>
            <Chip tone={statusTone(monitoringStatus)}>
              Monitoring: {monitoringStatus}
            </Chip>
            <Chip>{child.status ?? "ACTIVE"}</Chip>
            <Chip tone={nutrition.tone}>{nutrition.label}</Chip>
          </div>
        </div>
      </section>
      <nav aria-label="Related records" className="print-hide flex flex-wrap gap-2">
        {[
          { href: "#vaccination-schedule", label: "Vaccination schedule" },
          { href: "#nutrition-history", label: "Nutrition history" },
          { href: "#supplementation", label: "Supplementation" },
          { href: "#household-members", label: `Household members (${siblings.length})` },
        ].map((l) => (
          <a key={l.href} href={l.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>{l.label}</a>
        ))}
        {canViewAlerts && (
          <Link href="/alerts" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Alerts
            {typeof openAlertCount === "number" && openAlertCount > 0 && (
              <StatusBadge status="open" tone="danger" label={`${openAlertCount} open`} className="py-0.5" />
            )}
          </Link>
        )}
      </nav>
      {/* The three profiling sections, in the same order as the registration form. */}
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
            <InfoRow label="Birth height" value={child.birth_height_cm ? `${child.birth_height_cm} cm` : "—"} />
            <InfoRow label="Registered" value={formatDate(child.registration_date)} />
          </div>
          <div className="divide-y divide-border">
            <InfoRow label="Relationship to household head" value={profile?.relationship_to_household_head || "—"} />
            <InfoRow label="Civil status" value={profile?.civil_status || "—"} />
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
              value={describeMedicalHistory(profile?.medical_history_structured ?? null, medicalOptions?.conditions ?? []) || profile?.medical_history || "—"}
            />
          </div>
        </dl>
        <LatestNutrition
          record={latestNutrition}
          canAdd={canAddNutrition}
          canOpenModule={canViewNutrition}
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
          {guardian ? (
            <>
              <GuardianSmsConsent
                key={`${guardian.guardian_id}:${guardian.contact_number ?? ""}:${guardian.sms_opt_in ?? false}:${guardian.sms_contact_verified_at ?? ""}`}
                guardian={guardian}
                canEdit={canEdit}
                onSaved={async () => {
                  await mutate();
                }}
              />
              <GuardianSmsHistory
                key={`${child.child_id}:${guardian.guardian_id}`}
                childId={child.child_id}
                guardianId={guardian.guardian_id}
              />
            </>
          ) : (
            <p className="mt-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
              No present guardian is linked yet.{canEdit ? " Use Edit profile to link or register one." : ""}
            </p>
          )}
        </SectionCard>
        <SectionCard
          title="Household Information"
          subtitle="Where the child lives"
          icon={<Home size={18} />}
        >
          <dl className="divide-y divide-border">
            <InfoRow label="Family Serial No." value={household?.family_serial_no ? <span className="font-mono font-semibold">{household.family_serial_no}</span> : "—"} />
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
            <InfoRow label="Water source" value={profile?.water_source_type || "—"} />
            <InfoRow label="Toilet facility" value={profile?.toilet_facility_type || "—"} />
          </dl>
          <div id="household-members" className="mt-4 scroll-mt-24 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-brand-navy">
              Household members <span className="font-normal text-muted-foreground">· same Family Serial No.</span>
            </h3>
            {siblings.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No other registered children in this household.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {siblings.map((sib) => (
                  <li key={sib.child_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/child-profiling/children/${sib.child_id}`} className="font-medium text-brand-navy underline-offset-4 hover:underline">
                      {sib.first_name} {sib.last_name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono">{sib.child_code ?? ""}</span> · Born {formatDate(sib.date_of_birth)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SectionCard>
      </div>
      {/* NIP-USR001 — Vaccination Schedule request + preview. Computed from DOB + NIP
          catalog, already-administered doses excluded. BHW/RHM can request, PHN reviews. */}
      <div id="vaccination-schedule" className="scroll-mt-24">
        <VaccinationScheduleSection childId={child.child_id} />
      </div>

      {/* Nutritional assessment history */}
      <div id="nutrition-history" className="scroll-mt-24">
        <NutritionHistorySection assessments={assessments ?? []} />
      </div>
      {/* Full saved administration, dispensing, plans and due dates. */}
      <div id="supplementation" className="scroll-mt-24">
        <SupplementationHistorySection childId={child.child_id} />
      </div>

      {/* Movement history — only renders when at least one movement is on file.
          Shows chronological audit trail of status changes (MOVED/LOST/RETURNED/TRANSFERRED). */}
      {movements && movements.length > 0 && (
        <SectionCard
          title="Movement History"
          subtitle={`${movements.length} record${movements.length === 1 ? "" : "s"}`}
          icon={<History size={18} />}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/60">
                <tr>
                  {[
                    "Date",
                    "Type",
                    "Status",
                    "Reason",
                    "New address",
                    "Remarks",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((record) => (
                  <tr key={record.movement_id}>
                    <td className="px-4 py-3 text-sm">
                      {formatDate(record.movement_date)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {record.movement_type}
                    </td>
                    <td className="px-4 py-3 text-sm">{record.status}</td>
                    <td className="px-4 py-3 text-sm">
                      {record.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {record.new_address ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {record.remarks ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      {editOpen && canEdit && (
        <ChildFormModal
          mode="edit"
          childId={parsedId}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            // Re-fetch the profile so every section (personal info, guardian, history)
            // re-renders with the saved values. User stays on this page.
            mutate();
            toast.success("Changes saved");
          }}
          onError={(message) => toast.error(message)}
        />
      )}
      {statusOpen && canEdit && (
        <ChangeStatusModal
          childId={parsedId}
          currentStatus={child.status ?? "ACTIVE"}
          childName={fullName}
          onClose={() => setStatusOpen(false)}
          onSaved={() => {
            setStatusOpen(false);
            // Refetch both the profile (status chip updates) and movement history (new row).
            mutate();
            mutateMovements();
            toast.success("Status updated");
          }}
          onError={(message) => toast.error(message)}
        />
      )}
    </div>
  );
}
