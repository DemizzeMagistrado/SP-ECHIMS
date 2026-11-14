"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useAuth } from "@/components/auth/auth-provider";
import Link from "next/link";
import { NutritionAdmissionPanel } from "@/components/nutrition/nutrition-admission-panel";
import { NutritionRiskMonitor } from "@/components/nutrition/nutrition-risk-monitor";
import type { RiskMonitoring } from "@/lib/nutrition-risk";
import {
  saveSnapshot,
  loadSnapshot,
  removeSnapshot,
  listQueue,
  putQueuedAssessment,
  removeQueuedAssessment,
  validateOfflinePayload,
  type NutritionPayload,
  type QueuedAssessment,
} from "@/lib/nutrition-offline";
import { AlertCircle, BarChart3, ChevronDown, FileText, Plus, RefreshCw, Printer, SearchX } from "lucide-react";
import { TabPanel, usePageLoading } from '@/components/brand/page-gate'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { FilterCard, REPORT_CARD } from '@/components/nutrition/report-parts'
import { TabBar } from '@/components/ui/module-tabs'
import { Button, buttonVariants } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Checkbox, Select, DateInput } from '@/components/ui/form'
import { InfoTip } from '@/components/ui/info-tip'
import { Pagination, usePagination, useStableHeight } from '@/components/ui/pagination'
import { LoadError } from '@/components/ui/load-error'
import { ScoresDialog } from '@/components/nutrition/assessment-scores-dialog'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { canPerform, type UserRole } from '@/lib/echims-data'
import { MUAC_SOFT_WARNING, muacUnusual, nutritionFlagClass, nutritionLabel, nutritionProfileHref, nutritionTone } from '@/lib/nutrition-status'
import { reportSync } from '@/lib/offline/refresh'
type Relation<T> = T | T[] | null;
type Barangay = {
  barangay_id: number;
  barangay_name: string;
  municipality: string;
  province: string;
};
type Guardian = {
  guardian_id?: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  relationship_to_child: string | null;
};
type Household = { household_address: string; purok: string | null };
type ChildProfile = { ethnicity: string | null };
type Child = {
  profile?: ChildProfile | null;
  child_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string;
  sex: "MALE" | "FEMALE";
  barangay_id: number;
  barangay: Relation<Barangay>;
  address?: string | null;
  guardian?: Relation<Guardian>;
  household?: Relation<Household>;
};
type NumberValue = number | string | null;
type Assessment = {
  assessment_id: number;
  client_request_id?: string | null;
  child_id: number;
  assessed_by: string;
  assessment_date: string;
  weight: NumberValue;
  height: NumberValue;
  muac: NumberValue;
  measurement_type: "LENGTH" | "HEIGHT" | null;
  edema_grade: number | null;
  age_days: number | null;
  sex_at_assessment: string | null;
  normalized_height_cm: NumberValue;
  waz: NumberValue;
  haz: NumberValue;
  whz: NumberValue;
  baz: NumberValue;
  bmi: NumberValue;
  weight_for_age: string | null;
  height_for_age: string | null;
  weight_for_height: string | null;
  bmi_for_age: string | null;
  muac_status: string | null;
  nutritional_status: string;
  evaluation_status: string;
  engine_version: string | null;
  evaluated_at: string | null;
  remarks: string | null;
  child: Relation<Child>;
  profile?: ChildProfile | null;
};
type NutritionResponse = {
  risk_monitoring?: RiskMonitoring;
  data: Assessment[];
  children: Child[];
  role: string;
  currentUserId: string;
  permissions: { create: boolean };
};
type Draft = {
  child_id: string;
  assessment_date: string;
  weight: string;
  height: string;
  muac: string;
  measurement_type: "" | "LENGTH" | "HEIGHT";
  edema_grade: string;
  remarks: string;
};
const endpoint = "/api/nutrition";
const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 font-normal text-foreground";
const alertClass =
  "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800";
type SyncReviewRow = {
  draft: QueuedAssessment;
  sameDay: Assessment[];
  exactDuplicates: Assessment[];
  localDuplicateIds: string[];
};
type SyncReview = {
  ownerId: string;
  rows: SyncReviewRow[];
  selectedIds: string[];
};
function sameMeasurements(
  payload: NutritionPayload,
  record: {
    child_id: number;
    assessment_date: string;
    weight: NumberValue;
    height: NumberValue;
    muac: NumberValue;
    measurement_type: string | null;
    edema_grade: number | null;
  },
) {
  const muac = (value: NumberValue) =>
    value === null || value === "" ? null : Number(value);
  return (
    Number(payload.child_id) === Number(record.child_id) &&
    payload.assessment_date === record.assessment_date &&
    Number(payload.weight) === Number(record.weight) &&
    Number(payload.height) === Number(record.height) &&
    muac(payload.muac) === muac(record.muac) &&
    payload.measurement_type === record.measurement_type &&
    payload.edema_grade === record.edema_grade
  );
}
function one<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
function childName(child: Child | null) {
  return child
    ? `${child.last_name}, ${[child.first_name, child.middle_name].filter(Boolean).join(" ")}`
    : "Child name unavailable";
}
function label(value: string | null | undefined) {
  return nutritionLabel(value);
}
function ipMembership(ethnicity: string | null | undefined) {
  switch (ethnicity?.trim().toUpperCase()) {
    case "IP":
      return "Yes";
    case "NON-IP":
      return "No";
    default:
      return "Not confirmed";
  }
}
function quantity(value: NumberValue, unit = "", decimals?: number) {
  if (value === null || value === "" || !Number.isFinite(Number(value)))
    return "—";
  const number = Number(value);
  return `${decimals === undefined ? number : number.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}
function todayKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
function ageDays(child: Child, date: string) {
  return Math.floor(
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${child.date_of_birth}T00:00:00Z`)) /
      86400000,
  );
}
function initialDraft(): Draft {
  return {
    child_id: "",
    assessment_date: todayKey(),
    weight: "",
    height: "",
    muac: "",
    measurement_type: "",
    edema_grade: "",
    remarks: "",
  };
}
function birthAtAssessment(item: Assessment) {
  if (item.age_days == null) return one(item.child)?.date_of_birth ?? null;
  const date = new Date(`${item.assessment_date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - item.age_days);
  return date.toISOString().slice(0, 10);
}
function completedMonths(birth: string | null, date: string) {
  if (!birth) return null;
  const b = new Date(`${birth}T00:00:00Z`);
  const d = new Date(`${date}T00:00:00Z`);
  let months =
    (d.getUTCFullYear() - b.getUTCFullYear()) * 12 +
    d.getUTCMonth() -
    b.getUTCMonth();
  if (date < addMonths(birth, months)) months--;
  return months;
}
function residentLocation(child: Child) {
  const household = one(child.household ?? null);
  const address =
    child.address?.trim() || household?.household_address?.trim() || "";
  const purok = household?.purok?.trim() || "";
  return purok && !address.toLowerCase().includes(purok.toLowerCase())
    ? [purok, address].filter(Boolean).join(", ")
    : address;
}
function caregiverName(child: Child | null) {
  const guardian = one(child?.guardian ?? null);
  return guardian
    ? `${guardian.last_name}, ${[guardian.first_name, guardian.middle_name].filter(Boolean).join(" ")}`
    : "Not recorded";
}
function childRecordUrl(childId: number) {
  return nutritionProfileHref(childId);
}
class NutritionHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NutritionHttpError";
  }
}
async function readJson(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new NutritionHttpError(
      `The nutrition endpoint returned a non-JSON response (HTTP ${response.status}). Check app/api/nutrition/route.ts.`,
      response.status,
    );
  }
  const body = await response.json();
  if (!response.ok)
    throw new NutritionHttpError(
      typeof body?.error === "string" ? body.error : "Request failed.",
      response.status,
    );
  return body;
}
async function fetchNutrition(url: string): Promise<NutritionResponse> {
  return readJson(await fetch(url, { cache: "no-store" }));
}
function matches(item: Assessment, category: string) {
  if (
    !item.engine_version &&
    category !== "All" &&
    category !== "Not evaluated"
  )
    return false;
  switch (category) {
    case "MAM":
      return item.nutritional_status === "MAM";
    case "SAM":
      return item.nutritional_status === "SAM";
    case "Stunted":
      return ["STUNTED", "SEVERELY_STUNTED"].includes(
        item.height_for_age ?? "",
      );
    case "Wasted":
      return ["WASTED", "SEVERELY_WASTED"].includes(
        item.weight_for_height ?? "",
      );
    case "Overweight / obesity":
      return [item.weight_for_height, item.bmi_for_age].some(
        (value) => value === "OVERWEIGHT" || value === "OBESE",
      );
    case "Underweight":
      return ["UNDERWEIGHT", "SEVERELY_UNDERWEIGHT"].includes(
        item.weight_for_age ?? "",
      );
    case "Possible risk of overweight":
      return [item.weight_for_height, item.bmi_for_age].includes(
        "POSSIBLE_RISK_OF_OVERWEIGHT",
      );
    case "Infant urgent review":
      return item.nutritional_status === "INFANT_URGENT_REVIEW";
    case "Needs verification":
      return item.evaluation_status === "NEEDS_VERIFICATION";
    case "Not evaluated":
      return !item.engine_version || item.evaluation_status === "NOT_EVALUATED";
    default:
      return true;
  }
}
function followUp(item: Assessment) {
  if (!item.engine_version)
    return "Legacy classification — not engine verified";
  if (
    item.nutritional_status === "SAM" ||
    item.nutritional_status === "INFANT_URGENT_REVIEW"
  )
    return "Urgent clinical assessment";
  if (item.evaluation_status === "NEEDS_VERIFICATION")
    return "Verify measurements and review";
  if (
    item.nutritional_status === "MAM" ||
    item.nutritional_status === "AT_RISK"
  )
    return "Clinical follow-up";
  if (item.evaluation_status !== "EVALUATED")
    return "Complete or verify assessment";
  return "Routine growth monitoring";
}
type IndicatorField = "weight_for_age" | "height_for_age" | "weight_for_height";
type ListCode = "UW" | "SUW" | "St" | "SSt" | "W" | "SW";
type ReportView = "Summary" | "Assessments" | "Risk" | "Admissions" | ListCode;
const listDefinitions: Record<
  ListCode,
  { title: string; field: IndicatorField; value: string }
> = {
  UW: { title: "Underweight", field: "weight_for_age", value: "UNDERWEIGHT" },
  SUW: {
    title: "Severely Underweight",
    field: "weight_for_age",
    value: "SEVERELY_UNDERWEIGHT",
  },
  St: { title: "Stunted", field: "height_for_age", value: "STUNTED" },
  SSt: {
    title: "Severely Stunted",
    field: "height_for_age",
    value: "SEVERELY_STUNTED",
  },
  W: { title: "Wasted", field: "weight_for_height", value: "WASTED" },
  SW: {
    title: "Severely Wasted",
    field: "weight_for_height",
    value: "SEVERELY_WASTED",
  },
};
const listCodes: ListCode[] = ["UW", "SUW", "St", "SSt", "W", "SW"];
const ageBands = [
  { label: "0–5 months", min: 0, max: 5 },
  { label: "6–11 months", min: 6, max: 11 },
  { label: "12–23 months", min: 12, max: 23 },
  { label: "24–35 months", min: 24, max: 35 },
  { label: "36–47 months", min: 36, max: 47 },
  { label: "48–59 months", min: 48, max: 59 },
];
const indicatorValues: Record<IndicatorField, string[]> = {
  weight_for_age: ["NOT_UNDERWEIGHT", "UNDERWEIGHT", "SEVERELY_UNDERWEIGHT"],
  height_for_age: ["NOT_STUNTED", "STUNTED", "SEVERELY_STUNTED"],
  weight_for_height: [
    "NORMAL",
    "POSSIBLE_RISK_OF_OVERWEIGHT",
    "WASTED",
    "SEVERELY_WASTED",
    "OVERWEIGHT",
    "OBESE",
  ],
};
const summaryRows: {
  title: string;
  field: IndicatorField;
  value: string;
  list?: ListCode;
}[] = [
  {
    title: "WFA — Not underweight",
    field: "weight_for_age",
    value: "NOT_UNDERWEIGHT",
  },
  {
    title: "WFA — UW",
    field: "weight_for_age",
    value: "UNDERWEIGHT",
    list: "UW",
  },
  {
    title: "WFA — SUW",
    field: "weight_for_age",
    value: "SEVERELY_UNDERWEIGHT",
    list: "SUW",
  },
  { title: "HFA — Not stunted", field: "height_for_age", value: "NOT_STUNTED" },
  { title: "HFA — St", field: "height_for_age", value: "STUNTED", list: "St" },
  {
    title: "HFA — SSt",
    field: "height_for_age",
    value: "SEVERELY_STUNTED",
    list: "SSt",
  },
  { title: "WFL/H — Normal", field: "weight_for_height", value: "NORMAL" },
  {
    title: "WFL/H — Possible overweight risk",
    field: "weight_for_height",
    value: "POSSIBLE_RISK_OF_OVERWEIGHT",
  },
  {
    title: "WFL/H — W",
    field: "weight_for_height",
    value: "WASTED",
    list: "W",
  },
  {
    title: "WFL/H — SW",
    field: "weight_for_height",
    value: "SEVERELY_WASTED",
    list: "SW",
  },
  {
    title: "WFL/H — Overweight",
    field: "weight_for_height",
    value: "OVERWEIGHT",
  },
  { title: "WFL/H — Obese", field: "weight_for_height", value: "OBESE" },
];
function assessmentMonths(item: Assessment) {
  return completedMonths(birthAtAssessment(item), item.assessment_date);
}
function assessmentSex(item: Assessment) {
  return item.sex_at_assessment ?? one(item.child)?.sex ?? null;
}
function eligibleForReport(item: Assessment) {
  const months = assessmentMonths(item);
  return (
    months !== null && Number.isFinite(months) && months >= 0 && months < 60
  );
}
function validIndicator(item: Assessment, field: IndicatorField) {
  return Boolean(
    item.engine_version && indicatorValues[field].includes(item[field] ?? ""),
  );
}
function latestPerChild(records: Assessment[]) {
  const sorted = [...records].sort(
    (a, b) =>
      b.assessment_date.localeCompare(a.assessment_date) ||
      b.assessment_id - a.assessment_id,
  );
  const map = new Map<number, Assessment>();
  for (const item of sorted)
    if (!map.has(item.child_id)) map.set(item.child_id, item);
  return [...map.values()];
}
function listRecords(records: Assessment[], code: ListCode) {
  const rule = listDefinitions[code];
  return records
    .filter(
      (item) =>
        eligibleForReport(item) &&
        validIndicator(item, rule.field) &&
        item[rule.field] === rule.value,
    )
    .sort((a, b) =>
      childName(one(a.child)).localeCompare(childName(one(b.child))),
    );
}
function sexCounts(records: Assessment[]) {
  return {
    boys: records.filter((item) => assessmentSex(item) === "MALE").length,
    girls: records.filter((item) => assessmentSex(item) === "FEMALE").length,
    total: records.length,
  };
}
function inAgeBand(records: Assessment[], min: number, max: number) {
  return records.filter((item) => {
    const months = assessmentMonths(item);
    return months !== null && months >= min && months <= max;
  });
}
function prevalence(count: number, denominator: number) {
  return denominator ? `${((count / denominator) * 100).toFixed(1)}%` : "—";
}
function undernourished(item: Assessment) {
  return (
    (validIndicator(item, "weight_for_age") &&
      ["UNDERWEIGHT", "SEVERELY_UNDERWEIGHT"].includes(item.weight_for_age!)) ||
    (validIndicator(item, "height_for_age") &&
      ["STUNTED", "SEVERELY_STUNTED"].includes(item.height_for_age!)) ||
    (validIndicator(item, "weight_for_height") &&
      ["WASTED", "SEVERELY_WASTED"].includes(item.weight_for_height!))
  );
}
function overnourished(item: Assessment) {
  return (
    validIndicator(item, "weight_for_height") &&
    ["OVERWEIGHT", "OBESE"].includes(item.weight_for_height!)
  );
}
function caregiverCount(records: Assessment[]) {
  const ids = new Set<number>();
  for (const item of records) {
    const id = one(one(item.child)?.guardian ?? null)?.guardian_id;
    if (id != null) ids.add(id);
  }
  return ids.size;
}
/** A value cell in the Summary table: 0, 0.0% and — are muted and regular; others ink semibold. */
const isZero = (v: number | string) => v === 0 || v === "0" || v === "0.0%" || v === "—";
// Column groups of the Summary table (client-verified headings), alternating tints.
const SUMMARY_GROUPS = [
  ...ageBands.map((band) => ({ label: band.label, cols: ["Boys", "Girls", "Total"] })),
  { label: "0–59 months", cols: ["Total", "Prevalence"] },
  { label: "F1K: 0–23 months", cols: ["F1K total", "F1K prevalence"] },
  { label: "IP children", cols: ["IP boys", "IP girls", "IP total"] },
];
/** Group starts get the 1px left border (cell index within a row of 22 value cells). */
const SUMMARY_GROUP_START = new Set(
  SUMMARY_GROUPS.reduce<number[]>((starts, g, i) => [...starts, i === 0 ? 0 : starts[i - 1] + SUMMARY_GROUPS[i - 1].cols.length], []),
);
function SummaryReport({
  records,
  year,
  barangay,
  onList,
  canPrint,
  views,
}: {
  records: Assessment[];
  year: string;
  barangay: string;
  onList: (code: ListCode) => void;
  canPrint: boolean;
  /** Overview / List UW … List SW segmented control. */
  views: ReactNode;
}) {
  const eligible = records.filter(eligibleForReport);
  const underTwo = inAgeBand(eligible, 0, 23);
  const denominators = (field: IndicatorField) =>
    eligible.filter((item) => validIndicator(item, field));
  // The 17 indicators (labels and values unchanged), grouped for the cards below the table.
  const indicator: Record<string, number> = {
    "Children assessed, 0–59 months": eligible.length,
    "Children with UW/SUW, St/SSt or W/SW (unique children)": eligible.filter(undernourished).length,
    "Children with overweight/obesity (WFL/H)": eligible.filter(overnourished).length,
    "Children assessed, 0–23 months": underTwo.length,
    "Children 0–23 months with UW/St/W classifications": underTwo.filter(undernourished).length,
    "Linked mothers/caregivers of assessed children": caregiverCount(eligible),
    "Linked mothers/caregivers of children with UW/St/W classifications": caregiverCount(eligible.filter(undernourished)),
    "Linked mothers/caregivers of children with overweight/obesity": caregiverCount(eligible.filter(overnourished)),
    "Linked mothers/caregivers of children 0–23 months": caregiverCount(underTwo),
    "Children without a linked caregiver ID": eligible.filter(
      (item) => one(one(item.child)?.guardian ?? null)?.guardian_id == null,
    ).length,
    "WFA unavailable / not verified": eligible.length - denominators("weight_for_age").length,
    "HFA unavailable / not verified": eligible.length - denominators("height_for_age").length,
    "WFL/H unavailable / not verified": eligible.length - denominators("weight_for_height").length,
    "Excluded: age unavailable or outside 0–59 months": records.length - eligible.length,
    "Sex unavailable (included in totals only)": eligible.filter(
      (item) => !["MALE", "FEMALE"].includes(assessmentSex(item) ?? ""),
    ).length,
    "IP children (current profile)": eligible.filter((item) => ipMembership(item.profile?.ethnicity) === "Yes").length,
    "IP membership not confirmed": eligible.filter(
      (item) => ipMembership(item.profile?.ethnicity) === "Not confirmed",
    ).length,
  };
  const indicatorGroups: [string, string[]][] = [
    ["Children", [
      "Children assessed, 0–59 months",
      "Children assessed, 0–23 months",
      "Children with UW/SUW, St/SSt or W/SW (unique children)",
      "Children with overweight/obesity (WFL/H)",
      "Children 0–23 months with UW/St/W classifications",
    ]],
    ["Mothers and caregivers", [
      "Linked mothers/caregivers of assessed children",
      "Linked mothers/caregivers of children with UW/St/W classifications",
      "Linked mothers/caregivers of children with overweight/obesity",
      "Linked mothers/caregivers of children 0–23 months",
      "Children without a linked caregiver ID",
    ]],
    ["Data quality", [
      "WFA unavailable / not verified",
      "HFA unavailable / not verified",
      "WFL/H unavailable / not verified",
      "Excluded: age unavailable or outside 0–59 months",
      "Sex unavailable (included in totals only)",
    ]],
    ["IP membership", [
      "IP children (current profile)",
      "IP membership not confirmed",
    ]],
  ];
  const ipYes = (items: Assessment[]) => items.filter((item) => ipMembership(item.profile?.ethnicity) === "Yes");
  const sticky = "grid-pin-left sticky left-0 z-[1] min-w-[230px] border-r border-r-brand-line shadow-[6px_0_8px_-6px_rgba(12,18,96,0.18)]";
  const valueCell = (v: number | string, i: number, extra = "") => (
    <td
      key={i}
      className={cn(
        "px-2.5 py-1.5 text-right tabular-nums",
        SUMMARY_GROUP_START.has(i) && i > 0 && "border-l-brand-line",
        isZero(v) ? "font-normal text-zero" : "font-semibold text-brand-navy",
        extra,
      )}
    >
      {v}
    </td>
  );
  const totalValues: (number | string)[] = [
    ...ageBands.flatMap((band) => {
      const c = sexCounts(inAgeBand(eligible, band.min, band.max));
      return [c.boys, c.girls, c.total];
    }),
    eligible.length, "—", underTwo.length, "—",
    ...(() => { const c = sexCounts(ipYes(eligible)); return [c.boys, c.girls, c.total]; })(),
  ];
  return (
    <>
      <section className={REPORT_CARD} aria-label="OPT Plus summary">
        <ReportHeader
          views={views}
          title={<>Nutritional Assessment {year} — Summary</>}
          scope={barangay}
          action={canPrint && (
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} aria-hidden="true" />
              Print summary
            </Button>
          )}
        />
        {/* Valid totals: one strip, 1px between cells. */}
        <div className="grid grid-cols-1 gap-px border-y border-brand-line bg-brand-line sm:grid-cols-3">
          {(["weight_for_age", "height_for_age", "weight_for_height"] as IndicatorField[]).map((field) => {
            const n = denominators(field).length;
            return (
              <p key={field} className="flex items-baseline gap-2 bg-white px-4 py-3">
                <span className={cn("text-2xl font-bold tabular-nums", n === 0 ? "text-zero" : "text-brand-navy")}>{n}</span>
                <span className="text-sm text-brand-muted">
                  {field === "weight_for_age" ? "Total valid WFA" : field === "height_for_age" ? "Total valid HFA" : "Total valid WFL/H"}
                </span>
              </p>
            );
          })}
        </div>
        <div className="scroll-subtle overflow-x-auto">
          {/* Compact padding (10/6px) so most of the report fits at once; it scrolls sideways for the rest. */}
          <table className="data-grid w-full text-sm text-brand-navy">
            <caption className="sr-only">
              Nutrition classifications by age, sex, prevalence and IP membership
            </caption>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className={cn(sticky, "z-[2] px-3 py-1.5 text-left text-[13px] font-semibold")}>
                  Classification
                </th>
                {SUMMARY_GROUPS.map((g, i) => (
                  <th key={g.label} colSpan={g.cols.length} scope="colgroup" className={cn("whitespace-nowrap px-2.5 py-1.5 text-center text-[13px] font-semibold", i % 2 === 0 ? "bg-group-a" : "bg-group-b", i > 0 && "border-l-brand-line")}>
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr>
                {SUMMARY_GROUPS.flatMap((g, gi) =>
                  g.cols.map((col, ci) => (
                    <th key={`${g.label}-${col}`} scope="col" className={cn("whitespace-nowrap px-2.5 py-1.5 text-right text-xs font-semibold text-brand-muted", gi % 2 === 0 ? "bg-group-a" : "bg-group-b", ci === 0 && gi > 0 && "border-l-brand-line")}>
                      {col}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row, r) => {
                const matching = eligible.filter(
                  (item) => validIndicator(item, row.field) && item[row.field] === row.value,
                );
                const f1k = inAgeBand(matching, 0, 23);
                const ip = sexCounts(ipYes(matching));
                const values: (number | string)[] = [
                  ...ageBands.flatMap((band) => {
                    const count = sexCounts(inAgeBand(matching, band.min, band.max));
                    return [count.boys, count.girls, count.total];
                  }),
                  matching.length,
                  prevalence(matching.length, denominators(row.field).length),
                  f1k.length,
                  prevalence(f1k.length, inAgeBand(denominators(row.field), 0, 23).length),
                  ip.boys, ip.girls, ip.total,
                ];
                // HFA and WFL/H start a new indicator: 2px rule above.
                const startsIndicator = r === 3 || r === 6;
                return (
                  <tr key={row.title} data-zebra={r % 2 === 1 || undefined} className={cn(startsIndicator && "[&>*]:border-t-2 [&>*]:border-t-brand-line")}>
                    <th scope="row" className={cn(sticky, "whitespace-nowrap px-3 py-1.5 text-left text-sm font-semibold")}>
                      {row.list ? (
                        <button
                          type="button"
                          onClick={() => onList(row.list!)}
                          className="rounded font-semibold text-link underline underline-offset-2 outline-none hover:text-brand-navy focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-link"
                        >
                          {row.title}
                        </button>
                      ) : (
                        row.title
                      )}
                    </th>
                    {values.map((v, i) => valueCell(v, i))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-brand-navy text-white">
                <th scope="row" className="grid-pin-left sticky left-0 z-[1] min-w-[230px] border-r border-r-total-line bg-brand-navy px-3 py-1.5 text-left text-sm font-bold shadow-[6px_0_8px_-6px_rgba(12,18,96,0.18)]">
                  Children assessed
                </th>
                {totalValues.map((v, i) => (
                  <td key={i} className={cn("px-2.5 py-1.5 text-right tabular-nums", isZero(v) ? "font-normal text-total-zero" : "font-bold text-white")}>
                    {v}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <ReportFootnote>
          One latest assessment per child in the selected year and barangay.
          Prevalence uses the number with a valid classification for that
          indicator; missing, implausible, edema-affected and legacy results are
          excluded from its denominator. The six classifications remain separate.
          Current profile data supplies IP membership and caregiver links.
        </ReportFootnote>
      </section>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
        {indicatorGroups.map(([title, labels]) => (
          <section key={title} aria-label={title} className={cn(REPORT_CARD, "p-4")}>
            <h3 className="text-base font-semibold text-brand-navy">{title}</h3>
            <dl className="mt-2 divide-y divide-brand-line/70">
              {labels.map((name) => (
                <div key={name} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                  <dt className="text-brand-navy">{name}</dt>
                  <dd className={cn("tabular-nums", indicator[name] === 0 ? "text-zero" : "font-semibold text-brand-navy")}>{indicator[name]}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="text-[13px] text-brand-muted">
        Total barangay population and estimated child population are not yet in the database. Caregivers are counted by linked guardian ID, not by name. The current rules have no overweight class for WFA and no tall class for HFA, so those rows are not shown.
      </p>
    </>
  );
}
/** Overview / List UW … List SW: the module-tab pill at a smaller size (aria-pressed), counts in badges. */
function SummaryViews({ value, onChange, counts }: {
  value: "Summary" | ListCode;
  onChange: (view: "Summary" | ListCode) => void;
  counts: Record<ListCode, number>;
}) {
  const row = useRef<HTMLDivElement>(null);
  // One row at every width; it scrolls sideways when narrow. Keep the active pill in view (on load and on change).
  useEffect(() => {
    const list = row.current;
    const pill = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !pill || list.scrollWidth <= list.clientWidth) return;
    const left = pill.offsetLeft - list.offsetLeft - 16;
    const right = pill.offsetLeft - list.offsetLeft + pill.offsetWidth + 16 - list.clientWidth;
    if (list.scrollLeft > left) list.scrollLeft = left;
    else if (list.scrollLeft < right) list.scrollLeft = right;
  }, [value]);
  return (
    <div ref={row} role="group" aria-label="Summary views" className="-m-1 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {(["Summary", ...listCodes] as Array<"Summary" | ListCode>).map((view) => {
        const active = view === value;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(view)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
              active ? "border-transparent bg-primary text-white" : "border-border bg-white text-foreground shadow-sm hover:bg-muted",
            )}
          >
            {view === "Summary" ? "Overview" : `List ${view}`}
            {view !== "Summary" && (
              <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", active ? "bg-white/20" : "bg-muted text-muted-foreground")}>
                {counts[view]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
// List UW … List SW table: client-verified columns, in this exact order with these exact labels.
const LIST_COLUMNS = [
  { label: "Child ID", width: "min-w-28" },
  { label: "Address / location", width: "min-w-40" },
  { label: "Mother / caregiver", width: "min-w-40" },
  { label: "Full name of child", width: "min-w-40" },
  { label: "Sex", width: "min-w-14" },
  { label: "Age (months)", width: "min-w-24", numeric: true },
  { label: "Classification", width: "min-w-32" },
  { label: "Weight (kg)", width: "min-w-24", numeric: true },
  { label: "Length/height (cm)", width: "min-w-28", numeric: true },
  { label: "Date measured", width: "min-w-28" },
] as const;
function ClassificationList({
  records,
  code,
  year,
  barangay,
  onScores,
  canPrint,
  views,
}: {
  records: Assessment[];
  code: ListCode;
  year: string;
  barangay: string;
  onScores: (item: Assessment) => void;
  canPrint: boolean;
  views: ReactNode;
}) {
  const definition = listDefinitions[code];
  const items = listRecords(records, code);
  const heightIndicator = definition.field === "height_for_age";
  const head = "px-4 py-2.5 align-bottom text-[13px] font-semibold leading-tight text-brand-navy";
  const sticky = "sticky right-0 w-[260px] min-w-[260px] border-l-brand-line shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.18)]";
  return (
    <section className={REPORT_CARD} aria-label={`List ${code}`}>
      <ReportHeader
        views={views}
        title={<>List {code} — {definition.title} children, 0–59 months</>}
        scope={<>{barangay} · {year} · {items.length} children</>}
        action={canPrint && (
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" />
            Print list
          </Button>
        )}
      />
      <div className="scroll-subtle overflow-x-auto border-t border-brand-line">
        <table className="data-grid data-grid--hover w-full text-sm text-brand-navy">
          <thead>
            <tr>
              {LIST_COLUMNS.map((c) => (
                <th key={c.label} rowSpan={2} scope="col" className={cn(head, c.width, "numeric" in c ? "text-right" : "text-left")}>
                  {c.label}
                </th>
              ))}
              <th colSpan={4} scope="colgroup" className={cn(head, "border-l-brand-line pb-1 text-center")}>
                Date of follow-up
              </th>
              <th rowSpan={2} scope="col" className={cn(head, sticky, "z-[2] text-left nutrition-no-print")}>
                Actions
              </th>
            </tr>
            <tr>
              {[1, 2, 3, 4].map((n) => (
                <th key={n} scope="col" className={cn(head, "w-12 min-w-12 px-0 pt-1 text-center", n === 1 && "border-l-brand-line")}>
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.child_id} data-zebra={i % 2 === 1 || undefined} className="group">
                <td className="px-4 py-3.5 align-top transition-[box-shadow] duration-[120ms] group-hover:shadow-[inset_3px_0_0_var(--brand-navy)]">CH-{item.child_id}</td>
                <td className="px-4 py-3.5 align-top">
                  {one(item.child)
                    ? residentLocation(one(item.child)!) || "Not recorded"
                    : "Not recorded"}
                </td>
                <td className="px-4 py-3.5 align-top">{caregiverName(one(item.child))}</td>
                <td className="px-4 py-3.5 align-top font-semibold">{childName(one(item.child))}</td>
                <td className="px-4 py-3.5 align-top">
                  {assessmentSex(item) === "MALE"
                    ? "M"
                    : assessmentSex(item) === "FEMALE"
                      ? "F"
                      : "—"}
                </td>
                <td className="px-4 py-3.5 text-right align-top tabular-nums">{assessmentMonths(item)}</td>
                <td className={cn("px-4 py-3.5 align-top", nutritionFlagClass(item[definition.field]))}>{code}</td>
                <td className="px-4 py-3.5 text-right align-top tabular-nums">{quantity(item.weight)}</td>
                <td className="px-4 py-3.5 text-right align-top tabular-nums">{quantity(item.height)}</td>
                <td className="whitespace-nowrap px-4 py-3.5 align-top">
                  {item.assessment_date}
                </td>
                {[1, 2, 3, 4].map((n) => (
                  // Blank write-in boxes for the printed list.
                  <td
                    key={n}
                    aria-label={`Follow-up ${n}: not recorded`}
                    className={cn("w-12 min-w-12 px-0 py-3.5", n === 1 && "border-l-brand-line")}
                  />
                ))}
                <td className={cn(sticky, "px-4 py-3.5 align-top nutrition-no-print")}>
                  <RecordButtons item={item} onScores={() => onScores(item)} />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={15} className="h-14 px-4 text-left align-middle text-sm text-brand-muted">
                  No {definition.title.toLowerCase()} children in this scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ReportFootnote>
        This list uses{" "}
        {heightIndicator
          ? "height-for-age"
          : definition.field === "weight_for_age"
            ? "weight-for-age"
            : "weight-for-length/height"}{" "}
        classification, independently of SAM/MAM status. It uses each child’s
        latest assessment in the selected year. Follow-up dates have no
        dedicated field in the supplied database; the four columns are blank
        spaces for the printed list.
      </ReportFootnote>
    </section>
  );
}
/** Summary report header: the view switcher on its own first row (never moves between views),
 *  then the title and scope line. */
function ReportHeader({ views, title, scope, action }: { views: ReactNode; title: ReactNode; scope: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-3 p-4">
      <div className="nutrition-no-print flex min-h-10 flex-wrap items-center gap-2">
        {/* The views stay on one line; they scroll sideways only when the row is too narrow. */}
        <div className="min-w-0 flex-1 max-sm:basis-full">{views}</div>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-brand-navy">{title}</h2>
        <p className="text-sm text-brand-muted">{scope}</p>
      </div>
    </div>
  );
}
/** Footnote under a Summary table: same spacing, rule and measure in every view. */
function ReportFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-brand-line/70 px-4 py-3 text-[13px] text-brand-muted">
      <span className="block max-w-[110ch]">{children}</span>
    </p>
  );
}
// "Latest assessments" table: client-verified columns, in this exact order with these exact labels.
const RECORD_COLUMNS = [
  "Child seq.",
  "Address / location of residence",
  "Name of mother or caregiver",
  "Full name of child",
  "Belongs to IP group?",
  "Sex",
  "Date of birth",
  "Date measured",
  "Weight (kg)",
  "Length / height (cm)",
  "Age in months",
  "Age in days",
  "Weight-for-age status",
  "Length/height-for-age status",
  "Weight-for-length/height status",
  "Bilateral pitting edema",
  "Disability",
  "MUAC (cm)",
  "MUAC status",
  "Actions",
] as const;
// Column groups above the labels (7 + 5 + 3 + 4 = the 19 data columns; Actions has its own cell).
const RECORD_GROUPS = [
  ["Child", 7],
  ["Measurement", 5],
  ["WHO classification", 3],
  ["Other indicators", 4],
] as const;
/** A measurement exactly as recorded (no rounding or reformatting); "—" when missing. */
function recorded(value: NumberValue) {
  return value === null || value === "" ? "—" : String(value);
}
const flagClass = nutritionFlagClass;
const isUrgent = (item: Assessment) => followUp(item) === "Urgent clinical assessment";
type RecordCell = { content: ReactNode; numeric?: boolean; className?: string };
/** The 19 data cells of one row, shared by the wide table and the phone cards. */
function recordCells(item: Assessment, seq: number): RecordCell[] {
  const child = one(item.child);
  const barangay = one(child?.barangay ?? null)?.barangay_name ?? "Barangay unavailable";
  return [
    { content: seq, numeric: true },
    { content: child ? residentLocation(child) || "Not recorded" : "Not recorded", className: "min-w-40" },
    { content: caregiverName(child), className: "min-w-44" },
    {
      className: "min-w-44 font-medium",
      content: <>
        <span className="font-semibold text-brand-navy">{childName(child)}</span>
        <span className="mt-0.5 block text-xs font-normal text-brand-muted">{barangay}</span>
      </>,
    },
    { content: ipMembership(item.profile?.ethnicity) },
    { content: child?.sex === "MALE" ? "M" : child?.sex === "FEMALE" ? "F" : "Not recorded" },
    { content: child?.date_of_birth ?? "Not recorded", className: "whitespace-nowrap" },
    { content: item.assessment_date, className: "whitespace-nowrap" },
    { content: recorded(item.weight), numeric: true },
    {
      numeric: true,
      content: <>
        {recorded(item.height)}
        <span className="block text-xs text-brand-muted">{label(item.measurement_type)}</span>
      </>,
    },
    { content: item.age_days == null ? "Not recorded" : completedMonths(birthAtAssessment(item), item.assessment_date), numeric: true },
    { content: item.age_days ?? "Not recorded", numeric: true },
    { content: label(item.weight_for_age), className: cn("min-w-40", flagClass(item.weight_for_age)) },
    { content: label(item.height_for_age), className: cn("min-w-40", flagClass(item.height_for_age)) },
    { content: label(item.weight_for_height), className: cn("min-w-40", flagClass(item.weight_for_height)) },
    { content: item.edema_grade == null ? "Not recorded" : item.edema_grade === 0 ? "Absent" : `+${item.edema_grade}` },
    { content: "Not recorded in child profile", className: "min-w-40 text-zero" },
    { content: recorded(item.muac), numeric: true, className: flagClass(item.muac_status) },
    { content: label(item.muac_status), className: cn("min-w-36", flagClass(item.muac_status)) },
  ];
}

export default function NutritionPage() {
  const sharedAuth = useAuth();
  const [category, setCategory] = useState("All");
  const [history, setHistory] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Assessment | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const router = useRouter();
  const confirm = useConfirm();
  const role = sharedAuth.user?.role as UserRole | undefined;
  // Print is the export of this page (PHN monitors and exports; BNS and Admin too).
  const canExport = role ? canPerform(role, "Nutritional Assessment", "export") : false;
  const [reportYear, setReportYear] = useState(todayKey().slice(0, 4));
  const [reportBarangay, setReportBarangay] = useState("All");
  const [reportView, setReportView] = useState<ReportView>("Assessments");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // One page-level loader: the page appears once the account and its first data are in.
  const [online, setOnline] = useState(true);
  const [cachedResponse, setCachedResponse] =
    useState<NutritionResponse | null>(null);
  const [queued, setQueued] = useState<QueuedAssessment[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [syncReview, setSyncReview] = useState<SyncReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const ownerRef = useRef<string | null>(null);
  const syncBusy = useRef(false);
  const editingRequest = useRef<string | null>(null);
  const onlineRequest = useRef<string | null>(null);
  const syncHandler = useRef<(approval?: SyncReview) => Promise<void>>(
    async () => {},
  );
  const {
    data: liveData,
    error,
    mutate,
    isValidating,
  } = useSWR<NutritionResponse>(
    authReady && ownerId && online ? [endpoint, ownerId] : null,
    ([url]: [string, string]) => fetchNutrition(url),
    { shouldRetryOnError: false, revalidateOnFocus: true },
  );
  const accessDenied =
    error instanceof NutritionHttpError && [401, 403].includes(error.status);
  const data = accessDenied
    ? undefined
    : liveData?.currentUserId === ownerId
      ? liveData
      : cachedResponse?.currentUserId === ownerId
        ? cachedResponse
        : undefined;
  const canRecord = data?.role === "BNS" && data.permissions.create;
  usePageLoading(!authReady || Boolean(ownerId && online && !data && !error));
  const { visible: queuePage, bindList: bindQueue, listStyle: queueStyle, props: queuePager } = usePagination(queued);
  const tab = reportView === "Assessments" || reportView === "Risk" || reportView === "Admissions" ? reportView : "Summary";
  // The whole row opens the profile at Nutrition history; links and buttons inside keep their own action.
  const openRow = (event: MouseEvent, childId: number) => {
    if (!(event.target as HTMLElement).closest("a,button")) router.push(childRecordUrl(childId));
  };
  const savingRef = useRef(false);
  const children = data?.children ?? [];
  const scopedRecords = useMemo(
    () =>
      (data?.data ?? []).filter(
        (item) =>
          item.assessment_date.startsWith(`${reportYear}-`) &&
          (reportBarangay === "All" ||
            String(one(item.child)?.barangay_id) === reportBarangay),
      ),
    [data, reportYear, reportBarangay],
  );
  const barangays = useMemo(() => {
    const map = new Map<number, Barangay>();
    for (const c of [
      ...(data?.children ?? []),
      ...(data?.data ?? [])
        .map((item) => one(item.child))
        .filter((c): c is Child => c !== null),
    ]) {
      const b = one(c.barangay);
      if (b) map.set(b.barangay_id, b);
    }
    return [...map.values()].sort((a, b) =>
      a.barangay_name.localeCompare(b.barangay_name),
    );
  }, [data]);
  const selectedAreas =
    reportBarangay === "All"
      ? barangays
      : barangays.filter((b) => String(b.barangay_id) === reportBarangay);
  const years = [
    ...new Set([
      todayKey().slice(0, 4),
      ...(data?.data ?? []).map((item) => item.assessment_date.slice(0, 4)),
    ]),
  ]
    .sort()
    .reverse();
  const latest = useMemo(() => latestPerChild(scopedRecords), [scopedRecords]);
  const visible = (history ? scopedRecords : latest).filter((item) =>
    matches(item, category),
  );
  // Shared pager (6 per page). Stable height only across several pages; one page fits its rows.
  const { visible: recordRows, page: recordPage, props: recordPager } = usePagination(visible);
  const { bindArea: bindRecords, height: recordsMin } = useStableHeight(recordPager.pageCount > 1, recordRows.length >= recordPager.pageSize);
  const urgent = latest.filter(isUrgent);
  // Same rule as edit_nutritional_assessment: only the BNS who recorded it; administrators for
  // support / data fixes. PHN and RHM view (incl. History). The RPC re-checks.
  const canEditAssessment = (item: Assessment) =>
    data?.role === "Administrator" ||
    (data?.role === "BNS" && item.assessed_by === data.currentUserId);
  const countCategories = [
    "MAM",
    "SAM",
    "Stunted",
    "Wasted",
    "Overweight / obesity",
  ];
  const allCategories = [
    "All",
    ...countCategories,
    "Underweight",
    "Possible risk of overweight",
    "Infant urgent review",
    "Needs verification",
    "Not evaluated",
  ];
  const child =
    children.find((item) => String(item.child_id) === draft?.child_id) ?? null;
  const days = draft && child ? ageDays(child, draft.assessment_date) : null;
  const eligibleChildren = draft
    ? children.filter(
        (item) =>
          (reportBarangay === "All" ||
            String(item.barangay_id) === reportBarangay) &&
          draft.assessment_date >= item.date_of_birth &&
          draft.assessment_date < addMonths(item.date_of_birth, 60),
      )
    : [];
  const underSix = !!(
    draft &&
    child &&
    draft.assessment_date < addMonths(child.date_of_birth, 6)
  );
  function change(key: keyof Draft, value: string) {
    onlineRequest.current = null;
    setDraft((previous) => {
      if (!previous) return previous;
      const next = { ...previous, [key]: value };
      if (key === "child_id" || key === "assessment_date") {
        const selectedChild = children.find(
          (item) => String(item.child_id) === next.child_id,
        );
        next.measurement_type =
          selectedChild && next.assessment_date
            ? ageDays(selectedChild, next.assessment_date) < 731
              ? "LENGTH"
              : "HEIGHT"
            : "";
      }
      return next;
    });
  }
  async function refreshQueue(id: string) {
    const rows = await listQueue(id);
    if (ownerRef.current === id) setQueued(rows);
  }
  async function reviewQueue(requestId?: string) {
    const id = ownerRef.current;
    if (!id || !canRecord || !navigator.onLine || syncing || reviewing) return;
    setReviewing(true);
    setStorageError("");
    try {
      const allRows = await listQueue(id);
      const rows = allRows.filter((row) =>
        requestId ? row.requestId === requestId : row.status === "PENDING",
      );
      if (!rows.length) {
        setStorageError(
          "No pending drafts to review. Use Review & retry on a blocked draft.",
        );
        return;
      }
      const fresh = await fetchNutrition(endpoint);
      if (ownerRef.current !== id) return;
      if (
        fresh.currentUserId !== id ||
        fresh.role !== "BNS" ||
        !fresh.permissions.create
      )
        throw new Error(
          "Sign in with the BNS account that recorded these drafts.",
        );
      await saveSnapshot(id, fresh);
      if (ownerRef.current !== id) return;
      setCachedResponse(fresh);
      await mutate(fresh, { revalidate: false });
      const reviewRows = rows.map((row): SyncReviewRow => {
        const sameDay = fresh.data.filter(
          (record) =>
            record.client_request_id !== row.requestId &&
            Number(record.child_id) === Number(row.payload.child_id) &&
            record.assessment_date === row.payload.assessment_date,
        );
        return {
          draft: row,
          sameDay,
          exactDuplicates: sameDay.filter((record) =>
            sameMeasurements(row.payload, record),
          ),
          localDuplicateIds: allRows
            .slice(
              0,
              allRows.findIndex((other) => other.requestId === row.requestId),
            )
            .filter((other) => sameMeasurements(row.payload, other.payload))
            .map((other) => other.requestId),
        };
      });
      setSyncReview({
        ownerId: id,
        rows: reviewRows,
        selectedIds: reviewRows
          .filter((row) => !row.sameDay.length && !row.localDuplicateIds.length)
          .map((row) => row.draft.requestId),
      });
    } catch (problem) {
      if (ownerRef.current === id)
        setStorageError(
          problem instanceof Error
            ? problem.message
            : "Unable to check drafts for duplicates.",
        );
    } finally {
      if (ownerRef.current === id) setReviewing(false);
    }
  }
  async function confirmReview() {
    if (
      !syncReview ||
      !syncReview.selectedIds.length ||
      syncReview.ownerId !== ownerRef.current ||
      !canRecord
    )
      return;
    const approval = syncReview;
    setSyncReview(null);
    await syncHandler.current(approval);
  }
  async function performSyncQueue(approval?: SyncReview) {
    const id = ownerRef.current;
    if (
      !id ||
      !approval ||
      approval.ownerId !== id ||
      !navigator.onLine ||
      syncBusy.current
    )
      return;
    syncBusy.current = true;
    setSyncing(true);
    let syncId: number | null = null;
    const confirmedRequestIds: string[] = [];
    const failures: string[] = [];
    try {
      const pending = (await listQueue(id)).filter((row) =>
        approval.selectedIds.includes(row.requestId),
      );
      if (pending.length === 0 || ownerRef.current !== id) return;
      const started = await readJson(
        await fetch("/api/nutrition/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_owner_id: id }),
        }),
      );
      syncId = Number(started.sync_id);
      if (!Number.isSafeInteger(syncId) || syncId <= 0) {
        syncId = null;
        throw new Error(
          "The server did not confirm the sync log. Drafts were retained.",
        );
      }
      // Recheck active account, role and scope before uploading local drafts.
      const fresh = await fetchNutrition(endpoint);
      if (ownerRef.current !== id) {
        failures.push("The signed-in account changed during sync.");
        return;
      }
      if (fresh.currentUserId !== id)
        throw new Error(
          "Sign back into the account that recorded these drafts.",
        );
      if (fresh.role !== "BNS" || !fresh.permissions.create)
        throw new Error(
          "This account cannot record assessments. Local drafts were retained.",
        );
      await saveSnapshot(id, fresh);
      if (ownerRef.current !== id) {
        failures.push("The signed-in account changed during sync.");
        return;
      }
      setCachedResponse(fresh);
      await mutate(fresh, { revalidate: false });
      const rows = (await listQueue(id)).filter((row) =>
        approval.selectedIds.includes(row.requestId),
      );
      let saved = 0;
      for (const row of rows) {
        const reviewed = approval.rows.find(
          (item) => item.draft.requestId === row.requestId,
        );
        if (
          !reviewed ||
          JSON.stringify(reviewed.draft.payload) !== JSON.stringify(row.payload)
        ) {
          failures.push(
            "A draft changed after review. Review it again before uploading.",
          );
          continue;
        }
        const currentSameDay = fresh.data.filter(
          (record) =>
            record.client_request_id !== row.requestId &&
            Number(record.child_id) === Number(row.payload.child_id) &&
            record.assessment_date === row.payload.assessment_date,
        );
        if (
          currentSameDay.some((record) =>
            sameMeasurements(row.payload, record),
          ) ||
          currentSameDay.some(
            (record) =>
              !reviewed.sameDay.some(
                (known) => known.assessment_id === record.assessment_id,
              ),
          )
        ) {
          const detail =
            "A matching or new same-day assessment exists. Review the existing record before uploading.";
          await putQueuedAssessment(id, {
            ...row,
            status: "BLOCKED",
            lastError: detail,
          });
          failures.push(detail);
          continue;
        }
        if (!navigator.onLine || ownerRef.current !== id) {
          failures.push(
            "Connection lost or signed-in account changed during sync.",
          );
          break;
        }
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 25000);
        try {
          const result = await readJson(
            await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({ ...row.payload, request_owner_id: id }),
            }),
          );
          if (!result.data?.assessment_id)
            throw new Error(
              "The server did not confirm this save. The draft remains queued.",
            );
          confirmedRequestIds.push(row.requestId);
          await removeQueuedAssessment(id, row.requestId);
          saved++;
          fresh.data.push(result.data);
          if (ownerRef.current === id && approval.selectedIds.length === 1) {
            setSelected(result.data);
            setReportYear(row.payload.assessment_date.slice(0, 4));
            setReportView("Assessments");
          }
        } catch (syncError) {
          const detail =
            syncError instanceof Error
              ? syncError.message
              : "Unable to sync this assessment.";
          failures.push(detail);
          const status =
            syncError instanceof NutritionHttpError ? syncError.status : 0;
          await putQueuedAssessment(id, {
            ...row,
            status:
              status >= 400 &&
              status < 500 &&
              status !== 401 &&
              status !== 408 &&
              status !== 429
                ? "BLOCKED"
                : "PENDING",
            lastError: detail,
          });
          if (
            status === 401 ||
            status === 403 ||
            status === 0 ||
            status >= 500 ||
            status === 408 ||
            status === 429
          )
            break;
        } finally {
          window.clearTimeout(timeout);
        }
      }
      reportSync(saved, failures.length);
      if (ownerRef.current === id) {
        await refreshQueue(id);
        if (saved > 0) {
          toast.success(
            `${saved} assessment${saved === 1 ? "" : "s"} saved on the server and classified.`,
          );
          await mutate();
        }
      }
    } catch (syncError) {
      failures.push(
        syncError instanceof Error ? syncError.message : "Sync did not finish.",
      );
      reportSync(0, failures.length);
      if (ownerRef.current === id)
        setStorageError(
          syncError instanceof Error
            ? syncError.message
            : "Unable to sync. Local drafts were retained.",
        );
    } finally {
      if (syncId !== null) {
        try {
          await readJson(
            await fetch("/api/nutrition/sync", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sync_id: syncId,
                request_owner_id: id,
                confirmed_request_ids: confirmedRequestIds,
                error_message: failures.length
                  ? failures.slice(0, 3).join(" | ")
                  : null,
              }),
            }),
          );
        } catch (logError) {
          if (ownerRef.current === id)
            setStorageError(
              `Assessment drafts are retained or already saved. Sync-log finalization failed: ${logError instanceof Error ? logError.message : "Unknown error"}. The run may remain STARTED.`,
            );
        }
      }
      syncBusy.current = false;
      if (ownerRef.current === id) setSyncing(false);
    }
  }
  async function syncQueue(approval?: SyncReview) {
    if (navigator.locks) {
      await navigator.locks.request('echims-nutrition-sync', {ifAvailable:true}, async lock => {
        if (lock) await performSyncQueue(approval);
      });
    } else await performSyncQueue(approval);
  }
  syncHandler.current = syncQueue;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || savingRef.current) return;
    setFormError("");
    const id = ownerRef.current;
    if (!id || !data || !canRecord || data.currentUserId !== id || !child) {
      setFormError(
        "Select an eligible child from your account’s saved barangay scope. Open this page online once before working offline.",
      );
      return;
    }
    if (draft.edema_grade === "") {
      setFormError("Record the edema examination result.");
      return;
    }
    let requestId: string;
    const submitOnline = navigator.onLine;
    const editingLocalDraft = editingRequest.current !== null;
    try {
      requestId =
        editingRequest.current ?? onlineRequest.current ?? crypto.randomUUID();
      if (!editingLocalDraft) onlineRequest.current = requestId;
    } catch {
      setFormError(
        "Unable to create a draft ID. Use this app over HTTPS or localhost.",
      );
      return;
    }
    const payload: NutritionPayload = {
      child_id: Number(draft.child_id),
      assessment_date: draft.assessment_date,
      weight: Number(draft.weight),
      height: Number(draft.height),
      muac: draft.muac.trim() ? Number(draft.muac) : null,
      measurement_type:
        draft.measurement_type as NutritionPayload["measurement_type"],
      edema_grade: Number(draft.edema_grade),
      remarks: draft.remarks,
      client_request_id: requestId,
    };
    const validation = validateOfflinePayload(
      payload,
      child.date_of_birth,
      todayKey(),
    );
    if (validation) {
      setFormError(validation);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    // Capture connectivity at the click. Reconnection never submits an offline draft.
    if (submitOnline && !editingLocalDraft) {
      let postAttempted = false;
      let serverSaved = false;
      try {
        const fresh = await fetchNutrition(endpoint);
        if (ownerRef.current !== id) return;
        if (
          fresh.currentUserId !== id ||
          fresh.role !== "BNS" ||
          !fresh.permissions.create
        ) {
          throw new Error(
            "Sign in with an active BNS account authorized to record this assessment.",
          );
        }
        const eligible = fresh.children.find(
          (item) => item.child_id === payload.child_id,
        );
        if (!eligible)
          throw new Error(
            "This child is no longer available in your assigned scope.",
          );
        const currentValidation = validateOfflinePayload(
          payload,
          eligible.date_of_birth,
          todayKey(),
        );
        if (currentValidation) throw new Error(currentValidation);
        const duplicate = fresh.data.find(
          (item) =>
            item.client_request_id !== requestId &&
            sameMeasurements(payload, item),
        );
        if (duplicate)
          throw new Error(
            `Matching measurements already exist as assessment #${duplicate.assessment_id}. Review the child record before submitting again.`,
          );
        const localDuplicate = (await listQueue(id)).find(
          (item) =>
            item.requestId !== requestId &&
            sameMeasurements(payload, item.payload),
        );
        if (localDuplicate)
          throw new Error(
            "Matching measurements exist in your pending drafts. Review that draft instead of submitting another assessment.",
          );
        if (ownerRef.current !== id) return;
        if (!navigator.onLine)
          throw new Error(
            "Connection was lost before submission. Save this form as an offline draft.",
          );
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 25000);
        let result: { data?: Assessment };
        try {
          postAttempted = true;
          result = await readJson(
            await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({ ...payload, request_owner_id: id }),
            }),
          );
        } finally {
          window.clearTimeout(timeout);
        }
        if (!result.data?.assessment_id)
          throw new Error("The server did not confirm this save.");
        serverSaved = true;
        if (ownerRef.current !== id) return;
        onlineRequest.current = null;
        setDraft(null);
        setSelected(result.data);
        setReportYear(payload.assessment_date.slice(0, 4));
        setReportView("Assessments");
        toast.success("Assessment saved on the server and classified.");
        await mutate();
      } catch (problem) {
        const detail =
          problem instanceof Error
            ? problem.message
            : "Unable to save the assessment.";
        const status =
          problem instanceof NutritionHttpError ? problem.status : 0;
        const uncertain =
          postAttempted &&
          !serverSaved &&
          (status === 0 || status < 400 || status >= 500 || status === 408);
        if (uncertain) {
          try {
            await putQueuedAssessment(id, {
              key: `${id}:${requestId}`,
              ownerId: id,
              requestId,
              childName: childName(child),
              queuedAt: new Date().toISOString(),
              status: "PENDING",
              lastError: `Submission could not be confirmed. Review and retry this draft with its existing request ID. ${detail}`,
              payload,
            });
            if (ownerRef.current === id) {
              onlineRequest.current = null;
              setDraft(null);
              toast.warning(
                "Submission could not be confirmed. A recovery draft was retained; review it before retrying. Eligible drafts sync when online; conflicts require recorder review.",
              );
              await refreshQueue(id);
            }
          } catch (storageProblem) {
            if (ownerRef.current === id)
              setFormError(
                `Submission is uncertain and recovery storage failed. Keep this form open and retry without changing its measurements. ${storageProblem instanceof Error ? storageProblem.message : ""}`,
              );
          }
        } else if (ownerRef.current === id) {
          if (serverSaved)
            setStorageError(
              `Assessment saved, but the list could not refresh. Use Refresh. ${detail}`,
            );
          else setFormError(detail);
        }
      } finally {
        savingRef.current = false;
        if (ownerRef.current === id) setSaving(false);
      }
      return;
    }
    try {
      const existing = queued.find((item) => item.requestId === requestId);
      await putQueuedAssessment(id, {
        key: `${id}:${requestId}`,
        ownerId: id,
        requestId,
        childName: childName(child),
        queuedAt: existing?.queuedAt ?? new Date().toISOString(),
        status: "PENDING",
        lastError: null,
        payload,
      });
      if (ownerRef.current !== id) return;
      editingRequest.current = null;
      onlineRequest.current = null;
      setDraft(null);
      setStorageError("");
      toast.success(
        "Draft saved locally. Eligible drafts sync when online; conflicts require recorder review.",
      );
      await refreshQueue(id);
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the local draft.",
      );
    } finally {
      savingRef.current = false;
      if (ownerRef.current === id) setSaving(false);
    }
  }
  function editQueued(row: QueuedAssessment) {
    if (row.ownerId !== ownerRef.current || syncing) return;
    onlineRequest.current = null;
    editingRequest.current = row.requestId;
    setFormError("");
    setDraft({
      child_id: String(row.payload.child_id),
      assessment_date: row.payload.assessment_date,
      weight: String(row.payload.weight),
      height: String(row.payload.height),
      muac: row.payload.muac == null ? "" : String(row.payload.muac),
      measurement_type: row.payload.measurement_type,
      edema_grade: String(row.payload.edema_grade),
      remarks: row.payload.remarks,
    });
  }
  async function removeQueued(row: QueuedAssessment) {
    const id = ownerRef.current;
    if (!id || row.ownerId !== id || syncing) return;
    const ok = await confirm({
      title: "Remove this local draft?",
      description: `${row.childName} · ${row.payload.assessment_date}. The draft is deleted from this device and is not uploaded.`,
      confirmLabel: "Remove draft",
      tone: "danger",
    });
    if (!ok || ownerRef.current !== id) return;
    try {
      await removeQueuedAssessment(id, row.requestId);
      await refreshQueue(id);
    } catch (problem) {
      setStorageError(
        problem instanceof Error
          ? problem.message
          : "Unable to remove the local draft.",
      );
    }
  }
  async function retryQueued(row: QueuedAssessment) {
    const id = ownerRef.current;
    if (!id || row.ownerId !== id || syncing) return;
    try {
      await putQueuedAssessment(id, {
        ...row,
        status: "PENDING",
        lastError: null,
      });
      await refreshQueue(id);
      await reviewQueue(row.requestId);
    } catch (problem) {
      setStorageError(
        problem instanceof Error
          ? problem.message
          : "Unable to retry the draft.",
      );
    }
  }
  useEffect(() => {
    let alive = true;
    const applySession = (id: string | null) => {
      if (!alive) return;
      if (ownerRef.current !== id) {
        ownerRef.current = id;
        setOwnerId(id);
        setCachedResponse(null);
        setQueued([]);
        setDraft(null);
        setSelected(null);
        setFormError("");
        setStorageError("");
        setSyncing(false);
        setSaving(false);
        editingRequest.current = null;
        onlineRequest.current = null;
        setSyncReview(null);
        setReviewing(false);
      }
      setAuthReady(true);
    };
    if (sharedAuth.isReady) applySession(sharedAuth.user?.id ?? null);
    return () => { alive = false; };
  }, [sharedAuth.isReady, sharedAuth.user?.id]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    void Promise.all([
      loadSnapshot<NutritionResponse>(ownerId),
      listQueue(ownerId),
    ])
      .then(([snapshot, rows]) => {
        if (alive && ownerRef.current === ownerId) {
          setCachedResponse(snapshot);
          setQueued(rows);
        }
      })
      .catch((problem) => {
        if (alive)
          setStorageError(
            problem instanceof Error
              ? problem.message
              : "Offline storage is unavailable.",
          );
      });
    return () => {
      alive = false;
    };
  }, [ownerId]);
  useEffect(() => {
    if (!ownerId || liveData?.currentUserId !== ownerId) return;
    void saveSnapshot(ownerId, liveData).catch((problem) => {
      if (ownerRef.current === ownerId)
        setStorageError(
          problem instanceof Error
            ? problem.message
            : "Unable to cache this account’s child options.",
        );
    });
  }, [ownerId, liveData]);
  useEffect(() => {
    if (!ownerId || !accessDenied) return;
    setCachedResponse(null);
    void removeSnapshot(ownerId).catch(() => {});
  }, [ownerId, accessDenied]);

  // Automatic upload uses the same fresh-scope/duplicate checks as reviewed uploads.
  useEffect(() => {
    if (!ownerId || !online || !canRecord || accessDenied) return;
    const id = ownerId;
    let alive = true;
    let preparing = false;
    async function automaticSync() {
      if (!alive || preparing || syncBusy.current || reviewing || savingRef.current || !navigator.onLine || ownerRef.current !== id) return;
      preparing = true;
      try {
        const fresh = await fetchNutrition(endpoint);
        if (!alive || ownerRef.current !== id || fresh.currentUserId !== id || fresh.role !== 'BNS' || !fresh.permissions.create) return;
        const pending = (await listQueue(id)).filter(row => row.status === 'PENDING');
        const rows: SyncReviewRow[] = pending.map((draft,index) => {
          const sameDay = fresh.data.filter(record => record.client_request_id !== draft.requestId && Number(record.child_id) === Number(draft.payload.child_id) && record.assessment_date === draft.payload.assessment_date);
          return {draft,sameDay,exactDuplicates:sameDay.filter(record=>sameMeasurements(draft.payload,record)),localDuplicateIds:pending.slice(0,index).filter(other=>sameMeasurements(draft.payload,other.payload)).map(other=>other.requestId)};
        });
        const selectedIds:string[]=[];
        for (const row of rows) {
          if (!alive || ownerRef.current !== id) return;
          if (row.sameDay.length || row.localDuplicateIds.length) {
            await putQueuedAssessment(id,{...row.draft,status:'BLOCKED',lastError:'A same-day assessment or matching local draft exists. Recorder review is required.'});
          } else selectedIds.push(row.draft.requestId);
        }
        if (!alive || ownerRef.current !== id) return;
        if (selectedIds.length) await syncHandler.current({ownerId:id,rows,selectedIds});
        await refreshQueue(id);
      } catch (problem) {
        if (alive && ownerRef.current === id) setStorageError(problem instanceof Error ? problem.message : 'Automatic sync paused. Drafts retained.');
      } finally { preparing=false; }
    }
    const wake=()=>{void automaticSync();};
    // Delay first run slightly so initialization and owner snapshots can complete.
    const first=window.setTimeout(wake,500);
    const timer=window.setInterval(wake,45000);
    window.addEventListener('online',wake);
    window.addEventListener('focus',wake);
    return ()=>{alive=false;window.clearTimeout(first);window.clearInterval(timer);window.removeEventListener('online',wake);window.removeEventListener('focus',wake);};
  },[ownerId,online,canRecord,accessDenied]);

  // Refresh for the filter card (All assessments, Summary, Risk monitoring): secondary, pushed right.
  const refreshButton = ownerId ? (
    <Button
      variant="secondary"
      loading={isValidating && Boolean(data)}
      disabled={!online || accessDenied}
      title={online ? undefined : "Reconnect to refresh"}
      onClick={() => void mutate()}
    >
      {!(isValidating && data) && <RefreshCw size={16} aria-hidden="true" />}
      Refresh
    </Button>
  ) : null;
  const summaryViews = (
    <SummaryViews
      value={reportView === "Summary" || listCodes.includes(reportView as ListCode) ? (reportView as "Summary" | ListCode) : "Summary"}
      onChange={setReportView}
      counts={Object.fromEntries(listCodes.map((code) => [code, listRecords(latest, code).length])) as Record<ListCode, number>}
    />
  );
  // Year and barangay: on the Summary tab on their own, on All assessments with the other filters.
  const periodFields = (
    <>
      <Select
        aria-label="Year"
        value={reportYear}
        onChange={(event) => setReportYear(event.target.value)}
      >
        {years.map((year) => (
          <option key={year} value={year}>Year {year}</option>
        ))}
      </Select>
      <Select
        aria-label="Barangay"
        value={reportBarangay}
        onChange={(event) => setReportBarangay(event.target.value)}
      >
          <option value="All">All accessible barangays</option>
          {barangays.map((b) => (
            <option key={b.barangay_id} value={b.barangay_id}>
              {b.barangay_name} — {b.municipality}
            </option>
          ))}
      </Select>
    </>
  );
  return (
    <div className="nutrition-report-root space-y-5">
      <style>{`@media print {
      body * { visibility: hidden; }
      .nutrition-report-root, .nutrition-report-root * { visibility: visible; }
      .nutrition-report-root { position: absolute; inset: 0; width: 100%; background: white; }
      .nutrition-no-print { display: none !important; }
      .nutrition-report-root .overflow-x-auto { overflow: visible !important; }
      .nutrition-report-root table { width: 100%; table-layout: fixed; font-size: 6.5pt; }
      .nutrition-report-root th, .nutrition-report-root td { padding: 2px; white-space: normal !important; overflow-wrap: anywhere; min-width: 0 !important; }
      .nutrition-report-root th:first-child { width: 15%; }
      .nutrition-report-root thead { display: table-header-group; }
      .nutrition-report-root tr { break-inside: avoid; }
      .nutrition-report-root .sticky { position: static !important; box-shadow: none !important; }
      .nutrition-report-root .data-grid { border-collapse: collapse !important; }
      .nutrition-report-root .data-grid th, .nutrition-report-root .data-grid td { border: 1px solid #555 !important; background: #fff !important; color: #000 !important; }
      @page { size: A4 landscape; margin: 8mm; }
    }`}</style>
      {/* Header block: title and subtitle, then the module tabs; one divider below. */}
      <div className="nutrition-no-print space-y-4">
      <PageHeader
        title="Nutritional Assessment"
        subtitle="OPT Plus measurements, WHO classifications, and follow-up monitoring"
        className="nutrition-no-print"
        actions={<>
          {/* Refresh sits in each tab's filter card. */}
          {canRecord && (
            <Button
              disabled={!ownerId || accessDenied}
              onClick={() => {
                editingRequest.current = null;
                onlineRequest.current = null;
                setFormError("");
                setDraft({
                  ...initialDraft(),
                  assessment_date:
                    reportYear === todayKey().slice(0, 4)
                      ? todayKey()
                      : `${reportYear}-12-31`,
                });
              }}
            >
              <Plus size={17} aria-hidden="true" />Record assessment
            </Button>
          )}
        </>}
      />
      <TabBar
        className="pb-5"
        label="Nutrition views"
        group="nutrition"
        value={tab}
        onChange={setReportView}
        items={[
          { value: "Assessments", label: "All assessments" },
          { value: "Summary", label: "Summary" },
          { value: "Risk", label: "Risk monitoring" },
          { value: "Admissions", label: "Admission tracking" },
        ]}
      />
      </div>

      {error && (
        <LoadError what="nutrition records" error={error} retrying={isValidating} onRetry={() => void mutate()} />
      )}
      {authReady && !ownerId && (
        <p role="alert" className={alertClass}>
          Sign in to access this account’s nutrition records and offline drafts.
        </p>
      )}
      {ownerId && !data && !error && !online && (
        <p role="status" className="text-sm text-muted-foreground">
          No cached child options are available. Open this page online once before working offline.
        </p>
      )}
      {storageError && (
        <p role="alert" className={alertClass}>
          {storageError}
        </p>
      )}
      {(queued.length > 0 || !online) && (
        <section
          className="nutrition-no-print space-y-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-5"
          aria-label="Offline assessment queue"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 font-semibold text-brand-navy">
                {online ? "Pending offline drafts" : "Offline"} ·{" "}
                {queued.length} local draft{queued.length === 1 ? "" : "s"}
                <InfoTip label="About offline drafts">
                  Drafts stay on this device until you review and confirm upload.
                  Eligible drafts sync automatically when online. Conflicts remain for recorder review.
                </InfoTip>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">Saved on this device until uploaded</p>
            </div>
            {canRecord && (
              <Button
                variant="tonal"
                loading={syncing || reviewing}
                disabled={!online || !ownerId || queued.length === 0}
                onClick={() => void reviewQueue()}
              >
                {syncing
                  ? "Uploading…"
                  : reviewing
                    ? "Checking drafts…"
                    : "Review pending drafts"}
              </Button>
            )}
          </div>
          <div ref={bindQueue} style={queueStyle} className="space-y-3">
            {queuePage.map((row) => (
              <div
                key={row.requestId}
                className="rounded-xl border border-border bg-white p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-navy">{row.childName}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {row.payload.assessment_date}
                      <StatusBadge
                        status={row.status}
                        tone={row.status === "BLOCKED" ? "danger" : "warn"}
                        label={row.status === "BLOCKED" ? "Needs correction or permission review" : "Pending sync"}
                      />
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canRecord && (
                      <Button variant="ghost" size="sm" disabled={syncing} onClick={() => editQueued(row)}>
                        Edit draft
                      </Button>
                    )}
                    {canRecord && (
                      <Button variant="tonal" size="sm" disabled={syncing || !online} onClick={() => void retryQueued(row)}>
                        Review & retry
                      </Button>
                    )}
                    <Button variant="danger" size="sm" disabled={syncing} onClick={() => void removeQueued(row)}>
                      Remove local draft
                    </Button>
                  </div>
                </div>
                {row.lastError && (
                  <p className="mt-2 text-xs text-red-700">{row.lastError}</p>
                )}
              </div>
            ))}
          </div>
          <Pagination {...queuePager} label="Offline draft pages" className="rounded-xl border-0 bg-white" />
        </section>
      )}
      <TabPanel tabKey={tab} className="space-y-5">
      {reportView === "Admissions" && ownerId && (
        <NutritionAdmissionPanel
          key={ownerId}
          ownerId={ownerId}
          online={online}
        />
      )}

      {reportView === "Risk" && (
        <NutritionRiskMonitor
          key={ownerId ?? "signed-out"}
          monitoring={data?.risk_monitoring}
          loading={
            !authReady || Boolean(ownerId && !data && !error) || isValidating
          }
          error={error?.message}
          offline={!online}
          refresh={refreshButton}
        />
      )}
      {tab === "Summary" && (
        <FilterCard refresh={refreshButton}>{periodFields}</FilterCard>
      )}
      {reportView === "Summary" && (
        <SummaryReport
          records={latest}
          year={reportYear}
          barangay={
            reportBarangay === "All"
              ? "All accessible barangays"
              : (selectedAreas[0]?.barangay_name ?? "Selected barangay")
          }
          onList={setReportView}
          canPrint={canExport}
          views={summaryViews}
        />
      )}
      {reportView !== "Summary" &&
        reportView !== "Assessments" &&
        reportView !== "Risk" &&
        reportView !== "Admissions" && (
          <ClassificationList
            records={latest}
            code={reportView}
            year={reportYear}
            barangay={
              reportBarangay === "All"
                ? "All accessible barangays"
                : (selectedAreas[0]?.barangay_name ?? "Selected barangay")
            }
            onScores={setSelected}
            canPrint={canExport}
            views={summaryViews}
          />
        )}
      {reportView === "Assessments" && (
        <>
          {/* Filters and counts: one card. Controls share one bottom edge. */}
          <FilterCard
            refresh={refreshButton}
            extra={
              <Checkbox
                label="Include assessment history"
                checked={history}
                onChange={(event) => setHistory(event.target.checked)}
              />
            }
            below={
              // Counts (latest assessment per child); each one filters the table. 1px dividers between cells.
              <div className="grid grid-cols-2 gap-px border-t border-brand-line/70 bg-brand-line/70 sm:grid-cols-3 lg:grid-cols-5">
                {["SAM", "MAM", "Stunted", "Wasted", "Overweight / obesity"].map((name) => {
                  const count = latest.filter((item) => matches(item, name)).length;
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={category === name}
                      onClick={() => setCategory(category === name ? "All" : name)}
                      className={cn(
                        "flex items-baseline gap-2 bg-white px-4 py-3 text-left outline-none transition-colors hover:bg-brand-ice focus-visible:outline-3 focus-visible:outline-solid focus-visible:-outline-offset-3 focus-visible:outline-link",
                        category === name && "bg-brand-ice",
                        // 5 cells: the last one fills the spare slot at 2 and 3 columns (no empty divider cell).
                        name === "Overweight / obesity" && "col-span-2 lg:col-span-1",
                      )}
                    >
                      <span className={cn("text-2xl font-bold tabular-nums", count === 0 ? "text-zero" : name === "SAM" ? "text-severe" : "text-brand-navy")}>{count}</span>
                      <span className="text-sm text-brand-muted">{name}</span>
                    </button>
                  );
                })}
              </div>
            }
          >
            {periodFields}
            <Select aria-label="Classification view" value={category} onChange={(event) => setCategory(event.target.value)}>
              {allCategories.map((name) => (
                <option key={name} value={name}>{name === "All" ? "All classifications" : name}</option>
              ))}
            </Select>
          </FilterCard>

          {/* Follow-up banner: only when a child needs urgent clinical assessment. */}
          {urgent.length > 0 && (
            <div role="status" className="nutrition-no-print flex flex-wrap items-center gap-3 rounded-2xl border border-severe-line bg-white p-4 shadow-sm">
              <AlertCircle size={20} aria-hidden="true" className="shrink-0 text-severe-icon" />
              <p className="min-w-0 flex-[1_1_20rem] text-sm text-brand-navy">
                <span className="font-semibold text-severe">
                  {urgent.length} {urgent.length === 1 ? "child needs" : "children need"} urgent clinical assessment.
                </span>{" "}
                <span className="text-brand-muted">
                  SAM or infant urgent review: {urgent.slice(0, 3).map((item) => childName(one(item.child))).join(", ")}
                  {urgent.length > 3 ? ` and ${urgent.length - 3} more` : ""}.
                  {(() => {
                    // Soft MUAC warning only (bounds pending confirmation).
                    const unusual = urgent.map((item) => muacUnusual(item.muac, item.age_days)).find(Boolean);
                    return unusual ? <span className="font-semibold text-brand-navy"> MUAC: {MUAC_SOFT_WARNING[unusual]}</span> : null;
                  })()}
                </span>
              </p>
              <Link href={childRecordUrl(urgent[0].child_id)} className={buttonVariants({ variant: "secondary" })}>
                View child record
              </Link>
            </div>
          )}

          {/* Latest assessments. White sits on the header, rows and pager, so a short last page shows the page background. */}
          <section className={cn("overflow-hidden rounded-2xl border border-brand-line shadow-sm", recordPager.pageCount <= 1 && "bg-white")}>
            <div className="border-b border-brand-line bg-white px-4 py-3">
              <h2 className="flex items-center gap-1.5 text-lg font-semibold text-brand-navy">
                {history ? "Assessment history" : "Latest assessments"}
                <InfoTip label="About this table">
                  Profile information comes from the linked child record. View
                  child record opens the centralized profile and health history;
                  Scores shows this assessment’s calculated results. Counts use the
                  latest loaded assessment per child in the selected year and
                  barangay; categories can overlap.
                </InfoTip>
              </h2>
              <p className="mt-0.5 text-sm text-brand-muted">
                {visible.length} assessment{visible.length === 1 ? "" : "s"} · {category === "All" ? "all classifications" : category}
              </p>
            </div>
            {data && visible.length === 0 ? (
              <EmptyState icon={SearchX} title="No assessments match this view" description="Try a different filter or date range." className="bg-white" />
            ) : (
              <div ref={bindRecords} style={recordsMin ? { minHeight: recordsMin } : undefined}>
                {/* Tablet and up: the wide table, scrolling sideways with the Actions column pinned. */}
                <div className="scroll-subtle hidden overflow-x-auto bg-white sm:block">
                  <table className="data-grid data-grid--hover w-full text-sm text-brand-navy">
                    <thead>
                      <tr>
                        {RECORD_GROUPS.map(([group, span], i) => (
                          <th
                            key={group}
                            scope="colgroup"
                            colSpan={span}
                            className={cn(
                              "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-muted",
                              i % 2 === 0 ? "bg-group-a" : "bg-group-b",
                              i > 0 && "border-l-brand-line",
                            )}
                          >
                            {group}
                          </th>
                        ))}
                        <td aria-hidden="true" className="sticky right-0 z-[2] w-[260px] min-w-[260px] border-l-brand-line shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.18)]" />
                      </tr>
                      <tr>
                        {RECORD_COLUMNS.map((heading, i) => {
                          const numeric = [0, 8, 9, 10, 11, 17].includes(i);
                          const actions = heading === "Actions";
                          return (
                            <th
                              key={heading}
                              scope="col"
                              className={cn(
                                "px-4 py-3 align-bottom text-[13px] font-semibold text-brand-navy",
                                numeric ? "text-right" : "text-left",
                                // Labels wrap to two lines at most (narrow numeric columns otherwise stack 3–4).
                                i !== 0 && i !== 5 && !actions && (i === 15 ? "min-w-32" : "min-w-[6.75rem]"),
                                [7, 12, 15].includes(i) && "border-l-brand-line",
                                actions && "sticky right-0 z-[2] w-[260px] min-w-[260px] border-l-brand-line shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.18)]",
                              )}
                            >
                              {heading}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {recordRows.map((item, i) => {
                        const flagged = isUrgent(item);
                        return (
                          <tr
                            key={item.assessment_id}
                            onClick={(event) => openRow(event, item.child_id)}
                            data-zebra={i % 2 === 1 || undefined}
                            data-urgent={flagged || undefined}
                            className="group cursor-pointer"
                          >
                            {recordCells(item, recordPage * recordPager.pageSize + i + 1).map((cell, c) => (
                              <td
                                key={c}
                                className={cn(
                                  "px-4 py-3.5 align-top transition-[box-shadow,background-color] duration-[120ms]",
                                  // Row hover like Child Profiling: a 3px navy bar on the first cell.
                                  c === 0 && "group-hover:shadow-[inset_3px_0_0_var(--brand-navy)]",
                                  cell.numeric && "text-right tabular-nums",
                                  [7, 12, 15].includes(c) && "border-l-brand-line",
                                  cell.className,
                                )}
                              >
                                {cell.content}
                              </td>
                            ))}
                            <td className="sticky right-0 z-[1] w-[260px] min-w-[260px] border-l-brand-line px-4 py-3.5 align-top shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.18)]">
                              <RecordActions item={item} onScores={() => setSelected(item)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Phones: one card per row, same labels in the same order. */}
                <ul className="divide-y divide-brand-line/70 bg-white sm:hidden">
                  {recordRows.map((item, i) => {
                    const seq = recordPage * recordPager.pageSize + i + 1;
                    const child = one(item.child);
                    const cells = recordCells(item, seq);
                    return (
                      <li key={item.assessment_id} className={cn("space-y-3 p-4", isUrgent(item) && "bg-severe-row")}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-brand-navy">
                              <span className="tabular-nums text-brand-muted">{seq}.</span> {childName(child)}
                            </p>
                            <p className="text-xs text-brand-muted">
                              {one(child?.barangay ?? null)?.barangay_name ?? "Barangay unavailable"} · Measured {item.assessment_date}
                            </p>
                          </div>
                          <RecordBadge item={item} />
                        </div>
                        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                          {cells.map((cell, c) => (
                            <div key={RECORD_COLUMNS[c]} className="contents">
                              <dt className="text-xs font-semibold text-brand-muted">{RECORD_COLUMNS[c]}</dt>
                              <dd className={cn("text-right text-brand-navy", cell.numeric && "tabular-nums", cell.className?.replace(/min-w-\S+/g, ""))}>{cell.content}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="text-xs text-brand-muted">{followUp(item)}</p>
                        <RecordButtons item={item} onScores={() => setSelected(item)} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <Pagination {...recordPager} label="Assessment pages" />
            <p className="flex items-center gap-1.5 border-t border-brand-line bg-white px-4 py-3 text-xs text-brand-muted">
              Profile columns show the child&rsquo;s current record. Measurements are as recorded on the date measured. Flagged values are shown in color.
              <InfoTip label="About these columns">
                IP membership comes from the latest child profile’s Ethnicity
                field. Disability and region are not present in the supplied
                profile fields. All accessible assessment records are loaded in
                pages.
              </InfoTip>
            </p>
          </section>
        </>
      )}
      </TabPanel>
      <details className={cn(REPORT_CARD, "nutrition-no-print group")}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-brand-navy outline-none focus-visible:ring-2 focus-visible:ring-brand-sky [&::-webkit-details-marker]:hidden">
          <AlertCircle size={16} aria-hidden="true" className="shrink-0 text-warn" />
          Follow-up guidance
          <ChevronDown size={16} aria-hidden="true" className="ml-auto text-brand-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <p className="border-t border-brand-line/70 px-4 py-3 text-sm text-brand-navy">
          SAM and infant urgent-review results require prompt clinical assessment. Other growth concerns require health-staff review. Missing scores and flagged measurements are displayed for verification.
        </p>
      </details>
      {syncReview && (
        <Modal
          open
          size="xl"
          title="Review drafts before upload"
          busy={syncing}
          onClose={() => setSyncReview(null)}
          cancelLabel="Back to drafts"
          footer={<Button loading={syncing} disabled={!online || !canRecord || syncReview.selectedIds.length === 0} onClick={() => void confirmReview()}>Confirm upload ({syncReview.selectedIds.length})</Button>}
        >
          <p className="mb-4 text-sm text-muted-foreground">
            Check the measurements and any existing records. Select drafts to
            upload, or go back and edit them. Classification and alerts are
            generated only after confirmed server submission.
          </p>
          <div className="space-y-4">
            {syncReview.rows.map((item) => {
              const row = item.draft;
              const blocked =
                item.exactDuplicates.length > 0 ||
                item.localDuplicateIds.length > 0;
              return (
                <section
                  key={row.requestId}
                  className="rounded-xl border border-border p-4"
                >
                  <label className="flex items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      disabled={blocked}
                      checked={syncReview.selectedIds.includes(row.requestId)}
                      onChange={(event) =>
                        setSyncReview((previous) =>
                          previous
                            ? {
                                ...previous,
                                selectedIds: event.target.checked
                                  ? [...previous.selectedIds, row.requestId]
                                  : previous.selectedIds.filter(
                                      (id) => id !== row.requestId,
                                    ),
                              }
                            : previous,
                        )
                      }
                    />
                    {row.childName} · {row.payload.assessment_date}
                  </label>
                  <p className="mt-2 text-sm">
                    Weight: {row.payload.weight} kg · Length/height:{" "}
                    {row.payload.height} cm · Position:{" "}
                    {label(row.payload.measurement_type)} · MUAC:{" "}
                    {row.payload.muac ?? "Not measured"} · Edema:{" "}
                    {row.payload.edema_grade === 0
                      ? "Absent"
                      : `+${row.payload.edema_grade}`}
                  </p>
                  <p className="mt-1 text-sm">
                    Remarks: {row.payload.remarks || "None"}
                  </p>
                  {item.localDuplicateIds.length > 0 && (
                    <p className="mt-2 text-sm text-red-700">
                      Identical measurements appear in an earlier draft in your
                      local queue. Edit or remove the duplicate draft before
                      uploading.
                    </p>
                  )}
                  {item.sameDay.length > 0 && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
                      <p className="font-semibold">
                        {item.exactDuplicates.length
                          ? "Matching measurements already recorded — upload blocked."
                          : "Existing assessment on this date. Select this draft only if it is a separate measurement."}
                      </p>
                      {item.sameDay.map((record) => (
                        <p key={record.assessment_id} className="mt-1">
                          Assessment #{record.assessment_id}:{" "}
                          {quantity(record.weight, "kg")} ·{" "}
                          {quantity(record.height, "cm")} · MUAC{" "}
                          {quantity(record.muac, "cm")} ·{" "}
                          {label(record.measurement_type)} · Edema{" "}
                          {record.edema_grade ?? "Not recorded"}
                        </p>
                      ))}
                      <Link
                        href={childRecordUrl(row.payload.child_id)}
                        className="mt-2 inline-block text-primary underline"
                      >
                        View child record
                      </Link>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSyncReview(null);
                      editQueued(row);
                    }}
                    className="mt-3 text-sm text-primary underline"
                  >
                    Edit this draft
                  </button>
                </section>
              );
            })}
          </div>
        </Modal>
      )}
      {draft && (
        <Modal
          open
          size="xl"
          title="Record nutritional assessment"
          busy={saving}
          onClose={() => setDraft(null)}
          onSubmit={save}
          footer={<Button type="submit" loading={saving} disabled={!child || !canRecord || accessDenied || !ownerId}>
            {saving ? "Saving…" : editingRequest.current ? "Save draft changes" : online ? "Save Assessment" : "Save Offline Draft"}
          </Button>}
        >
          <div className="space-y-6">
            {formError && (
              <p role="alert" className={alertClass}>
                {formError}
              </p>
            )}
            <fieldset
              disabled={saving}
              className="space-y-6 disabled:opacity-70"
            >
              <section>
                <h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">
                  Child and caregiver information
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium md:col-span-2">
                    Select child
                    <Select
                      autoFocus
                      required
                      value={draft.child_id}
                      onChange={(event) =>
                        change("child_id", event.target.value)
                      }
                     
                    >
                      <option value="">Select a child</option>
                      {eligibleChildren.map((item) => (
                        <option key={item.child_id} value={item.child_id}>
                          {childName(item)} —{" "}
                          {one(item.barangay)?.barangay_name ?? "Barangay"} — #
                          {item.child_id}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-sm font-medium">
                    Address or location of child's residence
                    <input
                      readOnly
                      value={
                        child ? residentLocation(child) || "Not recorded" : ""
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Name of mother or caregiver
                    <input
                      readOnly
                      value={child ? caregiverName(child) : ""}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Full name of child
                    <input
                      readOnly
                      value={child ? childName(child) : ""}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Ethnicity
                    <input
                      readOnly
                      value={child?.profile?.ethnicity ?? ""}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Belongs to IP group?
                    <input
                      readOnly
                      value={
                        child ? ipMembership(child.profile?.ethnicity) : ""
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Sex
                    <input
                      readOnly
                      value={
                        child?.sex === "MALE"
                          ? "M"
                          : child?.sex === "FEMALE"
                            ? "F"
                            : ""
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Date of birth
                    <DateInput disabled
                      value={child?.date_of_birth ?? ""}
                     
                    />
                  </label>
                </div>
                {child && (
                  <p className="mt-3 text-sm">
                    These fields come from the child profile.{" "}
                    <Link
                      href={childRecordUrl(child.child_id)}
                      className="font-medium text-primary underline"
                    >
                      View child record
                    </Link>
                  </p>
                )}
                {eligibleChildren.length === 0 && (
                  <p className="mt-3 text-sm text-orange-700">
                    No active children in this scope are younger than five on
                    the selected measurement date.
                  </p>
                )}
              </section>
              <section>
                <h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">
                  Date measured and anthropometric measurements
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium">
                    Date measured
                    <DateInput
                      required
                      value={draft.assessment_date}
                      min={child?.date_of_birth}
                      max={todayKey()}
                      onChange={(event) =>
                        change("assessment_date", event.target.value)
                      }
                     
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Weight (kg)
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={draft.weight}
                      onChange={(event) => change("weight", event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Length / height (cm)
                    <input
                      required
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={draft.height}
                      onChange={(event) => change("height", event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Actual measurement position
                    <Select
                      required
                      value={draft.measurement_type}
                      onChange={(event) =>
                        change("measurement_type", event.target.value)
                      }
                     
                    >
                      <option value="">Select position</option>
                      <option value="LENGTH">
                        Recumbent length — lying down
                      </option>
                      <option value="HEIGHT">Standing height</option>
                    </Select>
                  </label>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Recommended position:{" "}
                  {days === null
                    ? "select a child first"
                    : days < 731
                      ? "recumbent length"
                      : "standing height"}
                  . Enter the original measured value; the server applies any
                  position correction.
                </p>
              </section>
              <section>
                <h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">
                  Automatically calculated — no data entry
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium">
                    Age in completed months
                    <input
                      readOnly
                      value={
                        child
                          ? (completedMonths(
                              child.date_of_birth,
                              draft.assessment_date,
                            ) ?? "")
                          : ""
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Age in days
                    <input readOnly value={days ?? ""} className={inputClass} />
                  </label>
                  {[
                    "Weight-for-age status",
                    "Length/height-for-age status",
                    "Weight-for-length/height status",
                  ].map((name) => (
                    <label key={name} className="text-sm font-medium">
                      {name}
                      <input
                        readOnly
                        value="Calculated by the server after saving"
                        className={inputClass}
                      />
                    </label>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-3 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-[#0077B6]">
                  Edema and MUAC
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium">
                    Bilateral pitting edema
                    <Select
                      required
                      value={draft.edema_grade}
                      onChange={(event) =>
                        change("edema_grade", event.target.value)
                      }
                     
                    >
                      <option value="">Select examination result</option>
                      <option value="0">Absent (0)</option>
                      <option value="1">Mild (+1)</option>
                      <option value="2">Moderate (+2)</option>
                      <option value="3">Severe (+3)</option>
                    </Select>
                  </label>
                  <label className="text-sm font-medium">
                    MUAC (cm, optional)
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={draft.muac}
                      onChange={(event) => change("muac", event.target.value)}
                      className={inputClass}
                    />
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {underSix
                        ? "6–59-month MUAC cutoffs are not applied to this infant."
                        : "Leave blank if not measured."}
                    </span>
                  </label>
                  <label className="text-sm font-medium">
                    MUAC status
                    <input
                      readOnly
                      value="Calculated by the server after saving"
                      className={inputClass}
                    />
                  </label>
                </div>
              </section>
              <label className="block text-sm font-medium">
                Remarks
                <textarea
                  rows={3}
                  value={draft.remarks}
                  onChange={(event) => change("remarks", event.target.value)}
                  className={inputClass}
                />
              </label>
              <p className="rounded-lg bg-sky-50 p-3 text-sm">
                WHO Z-scores, classifications and risk alerts are generated
                after server validation. Online assessments save directly after
                validation. Offline drafts stay on this device until you review
                and confirm upload.
              </p>
            </fieldset>
          </div>
        </Modal>
      )}
      {selected && (
        <ScoresDialog
          key={selected.assessment_id}
          item={selected}
          childName={childName(one(selected.child))}
          meta={[
            `${selected.sex_at_assessment === "MALE" ? "Male" : selected.sex_at_assessment === "FEMALE" ? "Female" : "Sex not recorded"}, ${assessmentMonths(selected) ?? "?"} months (${selected.age_days ?? "?"} days), ${one(one(selected.child)?.barangay ?? null)?.barangay_name ?? "Barangay unavailable"}.`,
            `Measured ${selected.assessment_date}.`,
          ].join(" ")}
          recommendation={followUp(selected)}
          canEdit={canEditAssessment(selected)}
          online={online}
          onClose={() => setSelected(null)}
          onEdited={(updated) => {
            setSelected((current) => (current ? ({ ...current, ...updated } as Assessment) : current));
            void mutate();
          }}
        />
      )}
    </div>
  );
}

/** Classification pill for a row (legacy rows are unverified, gray). */
function RecordBadge({ item }: { item: Assessment }) {
  return (
    <StatusBadge
      status={item.nutritional_status ?? "unknown"}
      tone={item.engine_version ? nutritionTone(item.nutritional_status) : "neutral"}
      label={!item.engine_version ? "Legacy — not verified" : label(item.nutritional_status)}
      className="text-xs font-semibold"
    />
  );
}

/** "View child record" and "Scores": two equal row buttons side by side (shared Button "row"). */
function RecordButtons({ item, onScores }: { item: Assessment; onScores: () => void }) {
  // Stacked in the 260px Actions column: full width, 36px each, 8px apart, one line each.
  return (
    <div className="grid grid-cols-1 gap-2">
      <Link href={childRecordUrl(item.child_id)} className={cn(buttonVariants({ variant: "row", size: "row" }), "w-full")}>
        <FileText aria-hidden="true" />
        View child record
      </Link>
      <Button variant="row" size="row" className="w-full" onClick={onScores}>
        <BarChart3 aria-hidden="true" />
        Scores
        <span className="sr-only"> for assessment {item.assessment_id}</span>
      </Button>
    </div>
  );
}

/** Pinned Actions cell: pill, recommendation, then the two buttons. */
function RecordActions({ item, onScores }: { item: Assessment; onScores: () => void }) {
  return (
    <div className="space-y-2">
      <RecordBadge item={item} />
      <p className="text-xs text-brand-muted">{followUp(item)}</p>
      <RecordButtons item={item} onScores={onScores} />
    </div>
  );
}
