"use client";
import { TabBar } from '@/components/ui/module-tabs'
import { routeSearch } from '@/lib/offline/navigation'
import { useAuth } from '@/components/auth/auth-provider'
import { offlineFetch as fetch } from '@/lib/offline/fetch'

import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Package, SearchX, ClipboardList, ChevronDown, FileText, RefreshCw, Search, Send } from "lucide-react";
import {
  latestNutrition,
  nutritionReview,
  type NutritionBasis,
} from "@/lib/supplementation-nutrition";
import {
  cacheSupplementData,
  loadSupplementCache,
  listSupplementDrafts,
  saveSupplementDraft,
  deleteSupplementDraft,
  type SupplementDraft,
  type OfflineForm,
} from "@/lib/supplementation-offline";
import { SupplementationMonitoringPanel } from "@/components/supplementation/supplementation-monitoring-panel";
import { SupplementStockRequestsPanel } from "@/components/supplementation/supplement-stock-requests-panel";
import { SupplementationSmsPanel } from "@/components/supplementation/supplementation-sms-panel";
import { LogoLoader } from '@/components/brand/logo-loader'
import { TabPanel, usePageLoading } from '@/components/brand/page-gate'
import { readPageCache, writePageCache } from '@/lib/page-cache'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { CountsStrip, FilterCard, GuidanceCard, REPORT_CARD, SectionHeader, ViewSwitch } from '@/components/ui/report-parts'
import { formatChildId } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { nutritionLabel } from '@/lib/nutrition-status'
import { Modal } from '@/components/ui/modal'
import { Input, Select, DateInput } from '@/components/ui/form'
import { Pagination, usePagination } from '@/components/ui/pagination'

type Child = {
  child_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string;
  sex: string;
  barangay_id: number;
  status: string;
};

type Product = {
  supplement_id: number;
  supplement_type: string;
  formulation: string;
  dose_strength: number | null;
  dose_unit: string;
  catalog_code: string | null;
  dispensing_only: boolean;
  child_min_months: number;
  child_max_months: number;
  item: { item_name: string; unit: string; status: string } | null;
};

type Protocol = {
  clinical_indication?: string | null;
  clinical_dose_offsets_days?: number[] | null;
  tier?: "ROUTINE" | "TARGETED" | "CLINICAL";
  protocol_id: number;
  protocol_code: string;
  supplement_type: string;
  purpose: string;
  age_min_months: number;
  age_max_months: number;
  dose_value: number;
  dose_unit: string;
  formulation: string;
  stock_unit: string;
  stock_quantity_per_dose: number;
  requires_order: boolean;
  interval_months: number | null;
  source_reference: string;
};

type Stock = {
  inventory_id: number;
  item_id: number;
  barangay_id: number;
  quantity_on_hand: number;
};

type Batch = {
  batch_id: number;
  inventory_id: number;
  batch_number: string;
  expiry_date: string;
  received_date: string;
  quantity_on_hand: number;
};

type RecordRow = {
  clinical_indication?: string | null;
  course_reference?: string | null;
  clinical_dose_number?: number | null;
  course_start_date?: string | null;
  tier?: string | null;
  purpose?: string | null;
  order_reference?: string | null;
  supplementation_record_id: number;
  child_id: number;
  supplement_id: number;
  supplementation_date: string;
  quantity_given: number;
  dose_value: number | null;
  dose_unit: string | null;
  batch_number: string | null;
  remarks: string | null;
  record_type: string | null;
  plan_id: number | null;
  source_assessment_id: number | null;
};

type Plan = {
  plan_id: number;
  child_id: number;
  supplement_id: number;
  start_date: string;
  end_date: string;
  authorized_quantity: number;
  directions: string | null;
  authorization_reference: string | null;
  indication: string | null;
  product_label: string;
  source_assessment_id: number | null;
  remarks: string | null;
};

type Data = {
  currentUserId: string;
  role: string;
  permissions: {
    record: boolean;
    stock: boolean;
    clinical?: boolean;
    monitor?: boolean;
  };
  children: Child[];
  products: Product[];
  protocols: Protocol[];
  barangays: { barangay_id: number; barangay_name: string }[];
  inventory: Stock[];
  batches: Batch[];
  records: RecordRow[];
  plans: Plan[];
  assessments: NutritionBasis[];
};

type Form = OfflineForm;

function commodityDisplayName(value: string) {
  return value
    .replace(/\bfor\s+children\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function catalogDetails(product: Product | undefined) {
  if (!product) return null;
  const strength =
    product.dose_strength == null ||
    !Number.isFinite(Number(product.dose_strength)) ||
    Number(product.dose_strength) <= 0 ||
    !product.dose_unit
      ? "Not stored in catalog — verify the actual label"
      : `${product.dose_strength} ${product.dose_unit}`;

  return {
    name: product.item?.item_name || "Product name unavailable",

    formulation:
      (product.formulation ? nutritionLabel(product.formulation) : "") || "Not stored in catalog",

    unit: product.item?.unit || "Unit unavailable",

    strength,
  };
}

function matchingProductProtocols(product: Product, protocols: Protocol[]) {
  return protocols.filter(
    (r) =>
      r.supplement_type === product.supplement_type &&
      r.formulation === product.formulation &&
      r.dose_unit === product.dose_unit &&
      r.stock_unit === product.item?.unit &&
      Number(r.dose_value) ===
        Number(product.dose_strength) * Number(r.stock_quantity_per_dose),
  );
}

function productAgeLabel(product: Product, protocols: Protocol[]) {
  if (product.dispensing_only)
    return `${product.child_min_months}–${product.child_max_months} completed months`;

  const ranges = [
    ...new Set(
      matchingProductProtocols(product, protocols).map(
        (r) => `${r.age_min_months}–${r.age_max_months}`,
      ),
    ),
  ];

  return ranges.length
    ? ranges.join(", ") + " completed months"
    : "No matching administration protocol";
}

function validClinicalCourse(protocol: Protocol) {
  const days = protocol.clinical_dose_offsets_days;

  return Boolean(
    protocol.clinical_indication?.trim() &&
      protocol.clinical_indication ===
        protocol.clinical_indication.trim().toUpperCase() &&
      protocol.requires_order &&
      protocol.interval_months == null &&
      Array.isArray(days) &&
      days.length &&
      days[0] === 0 &&
      days.every(
        (day, index) =>
          Number.isInteger(day) &&
          day >= 0 &&
          (index === 0 || day > days[index - 1]),
      ),
  );
}

function addDays(value: string, days: number) {
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(days)) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function today() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)?.value)
    .join("-");
}

const initial = (): Form => ({
  childId: "",
  supplementId: "",
  protocolId: "",
  batchId: "",
  date: today(),
  purpose: "ROUTINE",
  remarks: "",
  orderReference: "",
  assessmentId: "",
  scheduleId: "",
  barangayId: "",
  batchNumber: "",
  receivedDate: today(),
  expiryDate: "",
  quantity: "",
  allocateExisting: false,
  confirmed: false,
  planId: "",
  startDate: today(),
  endDate: "",
  clinicalDoseValue: "",
  clinicalDoseUnit: "",
  clinicalIndication: "",
  courseReference: "",
  clinicalDoseNumber: "1",
});

const name = (c: Child) =>
  [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ");

function months(birth: string, date: string) {
  const b = new Date(birth + "T00:00:00Z"),
    d = new Date(date + "T00:00:00Z");
  return (
    (d.getUTCFullYear() - b.getUTCFullYear()) * 12 +
    d.getUTCMonth() -
    b.getUTCMonth() -
    (d.getUTCDate() < b.getUTCDate() ? 1 : 0)
  );
}

function commodityAgeEligibility(
  birth: string,
  start: string,
  end: string,
  product: Product,
) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const d = new Date(value + "T00:00:00Z");
    return Number.isFinite(d.getTime()) &&
      d.toISOString().slice(0, 10) === value
      ? d
      : null;
  };

  const b = parse(birth),
    a = parse(start),
    z = parse(end);

  if (!b || !a || !z)
    return {
      eligible: null,
      detail: "Choose both plan dates to check the entire age range.",
    };

  if (z < a)
    return {
      eligible: false,
      detail: "Plan end must be on or after plan start.",
    };

  const totalMonths = b.getUTCMonth() + product.child_max_months + 1;

  const y = b.getUTCFullYear() + Math.floor(totalMonths / 12),
    m = totalMonths % 12;

  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const cutoff = new Date(Date.UTC(y, m, Math.min(b.getUTCDate(), lastDay)));

  const age = months(birth, start);

  const eligible =
    a >= b &&
    age >= product.child_min_months &&
    age <= product.child_max_months &&
    z < cutoff;

  return {
    eligible,
    detail: eligible
      ? `Eligible by age: ${age} completed months at plan start. The entire period is within ${product.child_min_months}–${product.child_max_months} months.`
      : `Outside configured age range: ${age} completed months at plan start; this commodity allows ${product.child_min_months}–${product.child_max_months} months. Plan end must be before ${cutoff.toISOString().slice(0, 10)}.`,
  };
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function read(response: Response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Supplementation API returned HTML or invalid JSON (HTTP ${response.status}). Check app/api/supplementation/route.ts.`,
    );
  }
  if (!response.ok)
    throw new ApiError(data.error || "Request failed.", response.status);
  return data;
}

const input =
  "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";

/** Tier pill for an entry: the saved tier, or Supply issue / Legacy for entries without one. */
const TIER_PILL: Record<string, { label: string; tone: StatusTone }> = {
  ROUTINE: { label: "Routine", tone: "info" },
  TARGETED: { label: "Targeted", tone: "review" },
  CLINICAL: { label: "Clinical", tone: "risk" },
  SUPPLY_ISSUE: { label: "Supply issue", tone: "neutral" },
  LEGACY: { label: "Legacy — tier not recorded", tone: "neutral" },
};
const tierOf = (r: RecordRow) =>
  r.tier && TIER_PILL[r.tier] ? r.tier : r.record_type === "DISPENSED" ? "SUPPLY_ISSUE" : "LEGACY";

export default function SupplementsPage() {
  const confirm = useConfirm();
  const sharedAuth = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const ownerRef = useRef<string | null>(null);
  const generation = useRef(0);

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  usePageLoading(loading);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true);

  // Three tabs (SUP-REV01): Records (entries + supply plans), Supplements (stock + guidelines),
  // Follow-up (compliance; PHN / Admin only). SMS reminders open from the Records toolbar.
  const [tab, setTab] = useState<"records" | "supplements" | "followup">("records");
  const [recordView, setRecordView] = useState<"entries" | "plans">("entries");
  const [supplyView, setSupplyView] = useState<"stock" | "guidelines">("stock");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [smsOpen, setSmsOpen] = useState(false);
  const router = useRouter();
  const [modal, setModal] = useState<
    "RECORD" | "PLAN" | "DISPENSE" | "CLINICAL" | null
  >(null);
  const [form, setForm] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const requestId = useRef("");
  const [filter, setFilter] = useState("");

  const [drafts, setDrafts] = useState<SupplementDraft[]>([]);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftConfirmed, setDraftConfirmed] = useState(false);
  const [cacheDate, setCacheDate] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    const user = ownerRef.current;
    if (!user) return;
    try {
      const rows = await listSupplementDrafts(user);
      if (ownerRef.current === user) setDrafts(rows);
    } catch (e) {
      if (ownerRef.current === user)
        setError(e instanceof Error ? e.message : "Unable to read drafts.");
    }
  }, []);

  const load = useCallback(async () => {
    const user = ownerRef.current;
    if (!user) return;
    const run = ++generation.current;
    if (!readPageCache(user, "supplementation")) setLoading(true);

    try {
      if (!navigator.onLine) {
        const cache = await loadSupplementCache<Data>(user);

        if (run !== generation.current || ownerRef.current !== user) return;

        if (!cache)
          throw new Error(
            "Open supplementation online once with this account to prepare offline recording.",
          );

        setData(cache.data);
        setCacheDate(cache.savedAt);
        setError("");
        return cache.data;
      }

      const result: Data = await read(
        await fetch("/api/supplementation", { cache: "no-store" }),
      );

      if (run !== generation.current || ownerRef.current !== user) return;

      if (!Array.isArray(result.assessments))
        throw new Error(
          "Replace the supplementation API with the matching updated route.",
        );

      if (result.currentUserId !== user)
        throw new Error("Account changed. Refresh the page.");

      const prepared = {
        ...result,

        products: Array.isArray(result.products)
          ? result.products.map((p) => ({
              ...p,
              item: p.item
                ? {
                    ...p.item,
                    item_name: commodityDisplayName(p.item.item_name),
                  }
                : null,
            }))
          : [],

        plans: Array.isArray(result.plans)
          ? result.plans.map((p) => ({
              ...p,
              product_label: commodityDisplayName(p.product_label),
            }))
          : [],

        assessments: result.assessments,
      };

      setData(prepared);
      writePageCache(user, "supplementation", prepared);
      setCacheDate(null);
      setError("");

      try {
        await cacheSupplementData(user, prepared);
      } catch (e) {
        if (ownerRef.current === user)
          setNotice(
            "Online data loaded, but offline storage could not be prepared.",
          );
      }

      return prepared;
    } catch (e) {
      if (run === generation.current && ownerRef.current === user) {
        if (e instanceof ApiError) {
          setData(null);
          setCacheDate(null);
        }
        setError(e instanceof Error ? e.message : "Unable to load.");
      }
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const apply = (id: string | null) => {
      if (!active || ownerRef.current === id) return;

      ownerRef.current = id;

      generation.current++;

      setOwner(id);

      // A revisit starts from the last result for this account and refreshes it quietly.
      const cached = readPageCache<Data>(id, "supplementation");
      setData(cached ?? null);

      setDrafts([]);

      setEditingDraft(null);

      setDraftConfirmed(false);

      setCacheDate(null);

      setModal(null);

      setNotice("");

      setError("");

      setLoading(Boolean(id) && !cached);

      if (!id) {
        setError("Please sign in to access supplementation.");
      }
    };

    if (sharedAuth.isReady) apply(sharedAuth.user?.id ?? null);
    return () => { active = false; generation.current++; };
  }, [sharedAuth.isReady, sharedAuth.user?.id]);

  useEffect(() => {
    const id = new URLSearchParams(routeSearch()).get("childId");
    if (id && /^\d+$/.test(id)) {
      setForm((f) => ({ ...f, childId: id }));
      setFilter(id);
    }
  }, []);

  useEffect(() => {
    if (owner) {
      void load();
      void refreshDrafts();
    }
  }, [owner, online, load, refreshDrafts]);

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

  function change<K extends keyof Form>(key: K, value: Form[K]) {
    if (key !== "confirmed") {
      requestId.current = crypto.randomUUID();
      setDraftConfirmed(false);
    }
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "childId"
        ? { courseReference: "", clinicalDoseNumber: "1" }
        : {}),
      ...(key === "protocolId" && modal === "CLINICAL"
        ? {
            clinicalDoseValue: String(
              data?.protocols.find((p) => String(p.protocol_id) === value)
                ?.dose_value ?? "",
            ),
            clinicalDoseUnit:
              data?.protocols.find((p) => String(p.protocol_id) === value)
                ?.dose_unit ?? "",
            clinicalIndication:
              data?.protocols.find((p) => String(p.protocol_id) === value)
                ?.clinical_indication ?? "",
            confirmed: false,
          }
        : {}),
      ...(["childId", "supplementId", "date", "purpose", "planId"].includes(key)
        ? {
            protocolId: "",
            batchId: "",
            assessmentId: "",
            confirmed: false,
            clinicalDoseValue: "",
            clinicalDoseUnit: "",
            clinicalIndication: "",
          }
        : {}),
    }));
  }

  function open(kind: "RECORD" | "PLAN" | "DISPENSE" | "CLINICAL") {
    setEditingDraft(null);
    setDraftConfirmed(false);
    const id = new URLSearchParams(routeSearch()).get("childId");
    setForm({
      ...initial(),
      ...(kind === "CLINICAL"
        ? {
            purpose:
              data?.protocols.find(
                (p) => p.tier === "CLINICAL" && validClinicalCourse(p),
              )?.purpose ?? "CLINICAL",
          }
        : {}),
      childId: id && /^\d+$/.test(id) ? id : "",
    });
    requestId.current = crypto.randomUUID();
    setModal(kind);
    setError("");
    setNotice("");
  }

  const selectedPlan = data?.plans?.find(
    (p) => String(p.plan_id) === form.planId,
  );
  const child = data?.children.find(
    (c) =>
      String(c.child_id) === form.childId ||
      (modal === "DISPENSE" && c.child_id === selectedPlan?.child_id),
  );
  const product = data?.products.find(
    (p) =>
      String(p.supplement_id) === form.supplementId ||
      (modal === "DISPENSE" && p.supplement_id === selectedPlan?.supplement_id),
  );

  const administration = modal === "RECORD" || modal === "CLINICAL";

  const clinicalAllowed =
    data?.role === "RHM" && data.permissions.clinical === true;

  const clinicalProtocols = (data?.protocols ?? []).filter(
    (p) => p.tier === "CLINICAL" && validClinicalCourse(p),
  );

  const catalog = catalogDetails(product);

  const concurrentPlans =
    administration && child && product?.supplement_type === "VITAMIN_A"
      ? (data?.plans ?? []).filter(
          (p) =>
            p.child_id === child.child_id &&
            p.start_date <= form.date &&
            p.end_date >= form.date,
        )
      : [];

  const concurrentPlanReminder =
    concurrentPlans.length > 0 ? (
      <div
        role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2"
      >
        <p className="font-semibold">Review existing supply plans</p>
        <p className="mt-1">
          A supply plan alone does not establish a conflict or prove
          consumption. Review the actual product label, ingredients, prior doses
          and any current nutrition treatment before confirming this
          administration.
        </p>
        <ul className="mt-2 list-disc pl-5">
          {concurrentPlans.map((p) => (
            <li key={p.plan_id}>
              Plan #{p.plan_id} ·{" "}
              {data?.products.find((x) => x.supplement_id === p.supplement_id)
                ?.item?.item_name ?? p.product_label}{" "}
              · {p.start_date} to {p.end_date}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          This reminder is not clinical clearance. Record relevant review
          details in Remarks.
        </p>
      </div>
    ) : null;

  const ageEligibility =
    modal === "PLAN" && child && product
      ? commodityAgeEligibility(
          child.date_of_birth,
          form.startDate,
          form.endDate,
          product,
        )
      : null;

  const productPanel =
    product && catalog ? (
      <div className="rounded-xl border border-border bg-muted/30 p-4 sm:col-span-2">
        <h3 className="text-sm font-semibold">Selected product</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ["Product name", catalog.name],
            ["Formulation", catalog.formulation],
            ["Stock unit", catalog.unit],
            ["Catalog strength / concentration", catalog.strength],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm font-medium">
          Configured age range:{" "}
          {productAgeLabel(product, data?.protocols ?? [])}
        </p>
        {ageEligibility && (
          <p
            role="status"
            className={`mt-2 rounded-lg p-3 text-sm ${ageEligibility.eligible === false ? "bg-red-50 text-red-800" : ageEligibility.eligible ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-800"}`}
          >
            {ageEligibility.detail}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Filled from the selected catalog entry. Product strength is not an
          authorized administered dose. Missing strength or concentration is not
          inferred from the catalog.
        </p>
      </div>
    ) : null;

  const basisDate = modal === "PLAN" ? form.startDate : form.date;

  const availableAssessments = (data?.assessments ?? [])
    .filter(
      (a) => a.child_id === child?.child_id && a.assessment_date <= basisDate,
    )
    .sort(
      (a, b) =>
        b.assessment_date.localeCompare(a.assessment_date) ||
        b.assessment_id - a.assessment_id,
    );

  const latest = child
    ? latestNutrition(data?.assessments ?? [], child.child_id, basisDate)
    : null;

  const basis =
    availableAssessments.find(
      (a) => String(a.assessment_id) === form.assessmentId,
    ) ?? latest;

  const review = nutritionReview(basis);

  const nutritionPanel =
    child ? (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm sm:col-span-2">
        <h3 className="font-semibold">Nutrition basis · {review.title}</h3>
        <p className="mt-1">{review.detail}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {review.rule} ·{" "}
          {basis
            ? `Assessment #${basis.assessment_id} · ${basis.assessment_date} · ${basis.nutritional_status ? nutritionLabel(basis.nutritional_status) : "Not evaluated"}`
            : "No saved assessment for this date"}
        </p>
        {basis && (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ["Weight-for-age", basis.weight_for_age],
              ["Height-for-age", basis.height_for_age],
              ["Length/height", basis.weight_for_height],
              ["BMI-for-age", basis.bmi_for_age],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd>{value ? nutritionLabel(value) : "Unavailable"}</dd>
              </div>
            ))}
          </dl>
        )}
        <a
          href={`/child-profiling/children/${child.child_id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-primary underline"
        >
          Review child history
        </a>
        {modal === "DISPENSE" && selectedPlan && (
          <p className="mt-2">
            Plan source:{" "}
            {selectedPlan.source_assessment_id
              ? `Assessment #${selectedPlan.source_assessment_id}`
              : "No linked assessment"}
            . The results above are the latest available before the issue date.
          </p>
        )}
      </div>
    ) : null;

  const assessmentSelector = (
    <label className="text-sm font-medium">
      Saved nutrition assessment
      <Select
       
        value={form.assessmentId}
        onChange={(e) => change("assessmentId", e.target.value)}
      >
        <option value="">
          {latest
            ? `Latest: #${latest.assessment_id} · ${latest.assessment_date}`
            : "No saved assessment"}
        </option>
        {availableAssessments.map((a) => (
          <option key={a.assessment_id} value={a.assessment_id}>
            #{a.assessment_id} · {a.assessment_date} ·{" "}
            {a.nutritional_status ? nutritionLabel(a.nutritional_status) : "Not evaluated"}
          </option>
        ))}
      </Select>
    </label>
  );

  const protocols =
    data?.protocols.filter(
      (p) =>
        child &&
        product &&
        (modal === "CLINICAL"
          ? p.tier === "CLINICAL" && validClinicalCourse(p)
          : p.tier !== "CLINICAL") &&
        p.purpose === form.purpose &&
        p.supplement_type === product.supplement_type &&
        p.formulation === product.formulation &&
        Number(p.dose_value) ===
          Number(product.dose_strength) * Number(p.stock_quantity_per_dose) &&
        p.dose_unit === product.dose_unit &&
        p.stock_unit === product.item?.unit &&
        months(child.date_of_birth, form.date) >= p.age_min_months &&
        months(child.date_of_birth, form.date) <= p.age_max_months,
    ) ?? [];

  const protocol = protocols.find(
    (p) => String(p.protocol_id) === form.protocolId,
  );

  const courseFirst = (data?.records ?? []).find(
    (r) =>
      r.tier === "CLINICAL" &&
      r.child_id === child?.child_id &&
      r.course_reference === form.courseReference?.trim() &&
      r.clinical_dose_number === 1,
  );

  const courseOffset =
    protocol?.clinical_dose_offsets_days?.[Number(form.clinicalDoseNumber) - 1];

  const courseExpectedDate =
    courseFirst?.course_start_date && courseOffset !== undefined
      ? addDays(courseFirst.course_start_date, courseOffset)
      : null;

  const clinicalCourses = (data?.records ?? []).filter(
    (r) =>
      r.tier === "CLINICAL" &&
      r.child_id === child?.child_id &&
      r.clinical_dose_number === 1 &&
      r.course_reference,
  );

  const batches =
    data?.batches.filter((b) => {
      const i = data.inventory.find((i) => i.inventory_id === b.inventory_id);
      return (
        child &&
        product &&
        i?.barangay_id === child.barangay_id &&
        i.item_id === product.supplement_id &&
        b.received_date <= form.date &&
        b.expiry_date >=
          (modal === "DISPENSE"
            ? (selectedPlan?.end_date ?? form.date)
            : form.date) &&
        Number(b.quantity_on_hand) >=
          Number(protocol?.stock_quantity_per_dose ?? 1)
      );
    }) ?? [];

  async function reviewDraft(draft: SupplementDraft) {
    const user = ownerRef.current;
    if (user !== draft.ownerId || saving) return;

    const fresh = await load();

    if (ownerRef.current !== user || !fresh) return;

    if (
      draft.action === "CLINICAL"
        ? !(fresh.role === "RHM" && fresh.permissions.clinical)
        : !fresh.permissions.record
    ) {
      setError(
        draft.action === "CLINICAL"
          ? "Only the active assigned RHM can submit this clinical draft."
          : "Only assigned BHW/BNS can submit this draft.",
      );
      return;
    }

    setForm({ ...initial(), ...draft.form, confirmed: false });
    requestId.current = draft.requestId;
    setEditingDraft(draft.requestId);

    setDraftConfirmed(false);
    setModal(draft.action);
    setError("");
    setNotice("");
  }

  async function discardDraft(draft: SupplementDraft) {
    const user = ownerRef.current;
    if (user !== draft.ownerId || saving) return;

    if (
      !(await confirm({
        title: "Discard this local draft?",
        description: "Saved server records are not affected.",
        confirmLabel: "Discard draft",
        tone: "danger",
      }))
    )
      return;

    try {
      await deleteSupplementDraft(user, draft.requestId);
      await refreshDrafts();
      toast.success("Local draft discarded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to discard draft.");
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!modal || saving) return;

    const user = ownerRef.current;
    if (!user || data?.currentUserId !== user) return;

    const submitOnline = navigator.onLine;

    const retryUncertain = Boolean(
      editingDraft &&
        requestId.current === editingDraft &&
        drafts.find((d) => d.requestId === editingDraft)?.status ===
          "UNCERTAIN",
    );

    const staffAction = administration || modal === "DISPENSE";

    if (!submitOnline && !staffAction) {
      setError("Plan registration and batch receipt require a connection.");
      return;
    }

    if (
      staffAction &&
      (modal === "CLINICAL" ? !clinicalAllowed : !data.permissions.record)
    ) {
      setError(
        modal === "CLINICAL"
          ? "Only assigned active RHM can record clinical supplementation."
          : "Only assigned BHW/BNS can record supplementation.",
      );
      return;
    }

    if (editingDraft && submitOnline && !draftConfirmed) {
      setError("Review and confirm this draft before submission.");
      return;
    }

    setSaving(true);
    setError("");
    let queued: SupplementDraft | null = null;
    let accepted = false;
    let attempted = false;

    try {
      if (
        administration &&
        (!form.confirmed ||
          (!retryUncertain &&
            (!protocol ||
              !batches.some((b) => String(b.batch_id) === form.batchId))))
      )
        throw new Error(
          "Select an eligible protocol and batch, then confirm history review and actual administration.",
        );

      if (
        modal === "CLINICAL" &&
        (!form.clinicalIndication?.trim() ||
          !form.courseReference?.trim() ||
          !Number.isInteger(Number(form.clinicalDoseNumber)) ||
          Number(form.clinicalDoseNumber) < 1 ||
          (!retryUncertain &&
            (form.clinicalIndication !== protocol?.clinical_indication ||
              Number(form.clinicalDoseNumber) >
                Number(protocol?.clinical_dose_offsets_days?.length))))
      )
        throw new Error(
          "Choose the clinical indication and a valid course dose number, and provide the treatment-course reference.",
        );

      if (
        modal === "CLINICAL" &&
        (!form.orderReference.trim() ||
          !Number.isFinite(Number(form.clinicalDoseValue)) ||
          Number(form.clinicalDoseValue) <= 0 ||
          !form.clinicalDoseUnit?.trim() ||
          (!retryUncertain &&
            (Number(form.clinicalDoseValue) !== Number(protocol?.dose_value) ||
              form.clinicalDoseUnit.trim().toUpperCase() !==
                protocol?.dose_unit)))
      )
        throw new Error(
          "Provide the documented clinical order and a dose/unit matching the verified clinical protocol.",
        );

      if (
        modal === "DISPENSE" &&
        ((!retryUncertain &&
          (!selectedPlan ||
            !batches.some((b) => String(b.batch_id) === form.batchId))) ||
          !Number.isFinite(Number(form.quantity)) ||
          Number(form.quantity) <= 0 ||
          !Number.isInteger(Number(form.quantity)))
      )
        throw new Error(
          "Select a plan, eligible batch and positive whole quantity.",
        );

      const payload =
        modal === "PLAN"
          ? {
              action: modal,
              childId: form.childId,
              supplementId: form.supplementId,
              startDate: form.startDate,
              endDate: form.endDate,
              quantity: form.quantity,
              remarks: form.remarks,
              assessmentId: form.assessmentId
                ? Number(form.assessmentId)
                : (basis?.assessment_id ?? null),
              requestId: requestId.current,
            }
          : modal === "DISPENSE"
            ? {
                action: modal,
                planId: form.planId,
                batchId: form.batchId,
                date: form.date,
                quantity: form.quantity,
                remarks: form.remarks,
                requestId: requestId.current,
              }
            : {
                  action: modal,
                  childId: form.childId,
                  supplementId: form.supplementId,
                  protocolId: form.protocolId,
                  batchId: form.batchId,
                  date: form.date,
                  remarks: form.remarks,
                  orderReference: form.orderReference,
                  assessmentId: form.assessmentId
                    ? Number(form.assessmentId)
                    : (basis?.assessment_id ?? null),
                  scheduleId: form.scheduleId,
                  requestId: requestId.current,
                  ...(modal === "CLINICAL"
                    ? {
                        clinicalDoseValue: form.clinicalDoseValue,
                        clinicalDoseUnit: form.clinicalDoseUnit,
                        confirmed: form.confirmed,
                        clinicalIndication: form.clinicalIndication,
                        courseReference: form.courseReference,
                        clinicalDoseNumber: form.clinicalDoseNumber,
                      }
                    : {}),
                };

      if (staffAction) {
        queued = {
          key: user + ":" + requestId.current,
          ownerId: user,
          requestId: requestId.current,
          action: modal as "RECORD" | "DISPENSE" | "CLINICAL",

          childName: child ? name(child) : "Child",
          savedAt: new Date().toISOString(),
          status: "PENDING",
          lastError: null,

          form: {
            ...form,
            assessmentId: administration
              ? form.assessmentId || String(basis?.assessment_id ?? "")
              : form.assessmentId,
          },
        };

        await saveSupplementDraft(user, queued, editingDraft ?? undefined);

        if (ownerRef.current !== user) return;

        setEditingDraft(queued.requestId);
        await refreshDrafts();

        if (!submitOnline) {
          setModal(null);
          setNotice(
            "Draft saved on this device. Review and confirm it after reconnecting. No server record or stock deduction was created.",
          );
          return;
        }
      }

      if (ownerRef.current !== user) return;

      attempted = true;

      const response = await fetch("/api/supplementation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          expectedUserId: user,
          ...(editingDraft ? { offlineSubmission: true } : {}),
        }),
      });

      const result = await read(response);
      accepted = true;

      if (queued) await deleteSupplementDraft(user, queued.requestId);

      if (ownerRef.current !== user) return;

      setNotice(result.message);
      setModal(null);
      setEditingDraft(null);
      await refreshDrafts();
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to save.";

      if (queued && !accepted) {
        try {
          await saveSupplementDraft(user, {
            ...queued,
            status:
              attempted && (!(e instanceof ApiError) || e.status >= 500)
                ? "UNCERTAIN"
                : "BLOCKED",
            lastError: message,
          });
        } catch {}
      }

      if (ownerRef.current === user) {
        setError(
          accepted
            ? "Saved on the server, but local draft removal failed. Retry unchanged to reconcile; do not create another entry."
            : message,
        );
        await refreshDrafts();
      }
    } finally {
      setSaving(false);
    }
  }

  function retryClinicalProtocol() {
    return Boolean(
      protocol ||
        (editingDraft &&
          requestId.current === editingDraft &&
          drafts.find((d) => d.requestId === editingDraft)?.status ===
            "UNCERTAIN"),
    );
  }

  const select = (
    label: string,
    key: keyof Form,
    options: { value: string; label: string }[],
  ) => (
    <label className="text-sm font-medium">
      {label}
      <Select
        required
       
        value={String(form[key])}
        onChange={(e) => change(key, e.target.value as never)}
      >
        <option value="">Choose…</option>
        {editingDraft &&
          form[key] &&
          !options.some((o) => o.value === String(form[key])) && (
            <option value={String(form[key])}>
              Previously selected #{String(form[key])} — server will recheck
            </option>
          )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );

  const field = (
    label: string,
    key: keyof Form,
    type = "text",
    required = true,
  ) => (
    <label className="text-sm font-medium">
      {label}
      {type === "date" ? (
        <DateInput
          required={required}
          className="mt-1"
          value={String(form[key])}
          onChange={(e) => change(key, e.target.value as never)}
        />
      ) : (
        <input
          required={required}
          type={type}
          step={type === "number" ? "any" : undefined}
          min={type === "number" ? "0.000001" : undefined}
          className={input}
          value={String(form[key])}
          onChange={(e) => change(key, e.target.value as never)}
        />
      )}
    </label>
  );

  const productOptions =
    data?.products
      .filter((p) => p.catalog_code && p.item?.status === "ACTIVE")
      .map((p) => ({
        value: String(p.supplement_id),
        label: `${p.item?.item_name} ${p.dose_strength == null ? "" : `(${p.dose_strength} ${p.dose_unit})`}`,
      })) ?? [];
  // Supplements › Guidelines & eligibility: the catalog's age limits and administration rules.
  const guidelinesPanel = (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {data?.products
          .filter((p) => p.catalog_code && p.item?.status === "ACTIVE")
          .map((p) => {
            const details = catalogDetails(p)!;
            const matching = matchingProductProtocols(p, data.protocols);
            return (
              <article key={p.supplement_id} className={cn(REPORT_CARD, "p-5")}>
                <h3 className="text-base font-semibold text-brand-navy">{details.name}</h3>
                <StatusBadge status="age" tone="info" label={productAgeLabel(p, data.protocols)} className="mt-2" />
                <p className="mt-3 text-sm text-brand-navy">
                  Formulation: {details.formulation} · Stock unit:{" "}
                  {details.unit}
                </p>
                <p className="mt-1 text-sm text-brand-navy">
                  {p.dispensing_only
                    ? "Supply plan and dispensing"
                    : "Actual administration under an eligible protocol"}
                </p>
                {p.dispensing_only ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-brand-muted">
                    <li>Both plan dates must stay within this age range.</li>
                    <li>
                      Planned and issued quantities use whole {details.unit}{" "}
                      units.
                    </li>
                    <li>
                      Issuing supplies is not an administered dose or completed
                      course.
                    </li>
                    {["MNP", "LNS_SQ"].includes(p.supplement_type) && (
                      <li>
                        SAM, MAM or infant urgent-review screening requires
                        clinical review; this routine pathway rejects the plan.
                      </li>
                    )}
                    {p.supplement_type === "IRON" && (
                      <li>
                        The system does not calculate an iron dose or infer a
                        missing concentration.
                      </li>
                    )}
                  </ul>
                ) : matching.length ? (
                  <div className="mt-3 space-y-3">
                    {matching.map((r) => (
                      <div key={r.protocol_id} className="rounded-xl border border-brand-line/70 bg-group-a p-3 text-sm text-brand-navy">
                        <p className="font-semibold">
                          {nutritionLabel(r.tier ?? r.purpose)} tier · {r.age_min_months}–
                          {r.age_max_months} months · {r.purpose.toLowerCase()}
                        </p>
                        <p>
                          Configured dose: {r.dose_value} {r.dose_unit} · Stock
                          used: {r.stock_quantity_per_dose} {r.stock_unit}
                        </p>
                        {r.tier === "CLINICAL" && (
                          <p>
                            Indication:{" "}
                            {r.clinical_indication ? nutritionLabel(r.clinical_indication) :
                              "Not configured"}{" "}
                            · Course days:{" "}
                            {r.clinical_dose_offsets_days?.join(", ") ??
                              "Not configured"}
                          </p>
                        )}
                        <p>
                          {r.interval_months
                            ? `Minimum configured interval: ${r.interval_months} months.`
                            : "No interval stored in this protocol."}
                        </p>
                        <p>
                          {r.requires_order
                            ? "Clinical/program order reference required."
                            : "Review administration history before recording."}
                        </p>
                        {r.source_reference.match(/https:\/\/\S+/)?.[0] && (
                          <a
                            className="mt-1 inline-block font-semibold text-link underline underline-offset-2"
                            href={r.source_reference.match(/https:\/\/\S+/)?.[0]}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Protocol source
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-review">
                    No active matching administration protocol. Recording
                    requires a valid protocol.
                  </p>
                )}
              </article>
            );
          })}
      </div>
      <GuidanceCard title="Before saving or issuing supplies">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Review the child profile, saved nutrition results and previous
            supplement entries.
          </li>
          <li>
            Supply-plan registration does not deduct stock or create an
            administration record.
          </li>
          <li>
            Existing overlapping supply plans require review. A supply plan and
            a Vitamin A entry are not automatically a conflict; review actual
            products, ingredients and administration history.
          </li>
          <li>
            Select a batch for the child's barangay with enough stock. For
            dispensing, the batch must remain valid through the plan end.
          </li>
          <li>
            Assigned RHM/PHN register plans and receive batches. Assigned
            BHW record routine/targeted administration; assigned BNS also
            record dispensing.
            Assigned RHM record clinical-tier administration against a verified
            clinical protocol and documented order.
          </li>
          <li>
            Rejected submissions are not saved. The database rechecks scope,
            dates, age, duplicates and stock.
          </li>
        </ul>
      </GuidanceCard>
    </div>
  );

  // Records: one list of entries (routine, targeted, clinical, supply issues), filtered by tier and child.
  const childOf = (id: number) => data?.children.find((c) => c.child_id === id);
  const matchesChild = (id: number) => {
    if (!filter) return true;
    const c = childOf(id);
    return String(id) === filter || (c ? name(c) : "").toLowerCase().includes(filter.toLowerCase());
  };
  const records =
    data?.records.filter((r) => (tierFilter === "ALL" || tierOf(r) === tierFilter) && matchesChild(r.child_id)) ?? [];
  const plans = data?.plans.filter((p) => matchesChild(p.child_id)) ?? [];
  const { visible: pagedRecords, props: recordPager } = usePagination(records);
  const { visible: pagedPlans, props: planPager } = usePagination(plans);
  const canRecord = Boolean(data?.permissions.record || data?.role === "RHM");
  // BHW: record administration only (docs/permissions.md); dispensing stays with RHM / BNS.
  const canDispense = canRecord && data?.role !== "BHW";
  // Only the roles the SMS API lets send (RHM, BHW) get the reminders button.
  const canSendReminders = data?.role === "RHM" || data?.role === "BHW";
  const canPlan = Boolean(data?.permissions.stock);
  const showFollowUp = Boolean(data?.permissions.monitor && (data.role === "PHN" || data.role === "Administrator"));
  const activeTab = tab === "followup" && !showFollowUp ? "records" : tab;
  const toggle = (key: string) => setExpanded((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  const openChild = (event: MouseEvent, childId: number) => {
    if (!(event.target as HTMLElement).closest("a,button")) router.push(`/child-profiling/children/${childId}`);
  };
  const expiredWithStock = data?.batches.filter((b) => b.expiry_date < today() && Number(b.quantity_on_hand) > 0).length ?? 0;
  const refreshButton = (
    <Button variant="secondary" loading={loading && Boolean(data)} disabled={!online} title={online ? undefined : "Reconnect to refresh"} onClick={() => void load()}>
      {!(loading && data) && <RefreshCw size={16} aria-hidden="true" />}
      Refresh
    </Button>
  );
  // Primary action first in importance: Record administration (recorders) or Register supply plan (PHN).
  const recordActions = activeTab === "records" && (
    <>
      {clinicalAllowed && (
        <Button variant="secondary" onClick={() => open("CLINICAL")}>
          <Plus size={17} aria-hidden="true" /> Record clinical supplementation
        </Button>
      )}
      {canPlan && (
        <Button variant={canRecord ? "secondary" : "primary"} onClick={() => open("PLAN")}>
          <Plus size={17} aria-hidden="true" /> Register supply plan
        </Button>
      )}
      {canDispense && (
        <Button variant="secondary" onClick={() => open("DISPENSE")}>
          <Plus size={17} aria-hidden="true" /> Record dispensing
        </Button>
      )}
      {canRecord && (
        <Button onClick={() => open("RECORD")}>
          <Plus size={17} aria-hidden="true" /> Record administration
        </Button>
      )}
    </>
  );
  const head = "px-4 py-3 text-left align-bottom text-[13px] font-semibold text-brand-navy";
  const cell = "px-4 py-3.5 align-top";
  const pinned = "relative sm:sticky right-0 w-[208px] min-w-[208px] border-l-brand-line sm:shadow-[-6px_0_8px_-6px_rgba(12,18,96,0.18)]";
  const firstCell = "transition-[box-shadow,background-color] duration-[120ms] group-hover:shadow-[inset_3px_0_0_var(--brand-navy)]";
  const childCell = (id: number) => {
    const c = childOf(id);
    return (
      <>
        <span className="font-semibold">{c ? name(c) : `Child ${id}`}</span>
        <span className="block text-xs text-brand-muted">{formatChildId(id)}</span>
      </>
    );
  };
  const rowActions = (childId: number, key: string, detailId: string, hasDetail: boolean, what: string) => (
    <div className="flex items-center gap-2">
      <Link href={`/child-profiling/children/${childId}`} className={cn(buttonVariants({ variant: "row", size: "row" }), "flex-1")}>
        <FileText aria-hidden="true" />View child record
      </Link>
      {hasDetail && (
        <Button
          variant="row"
          size="row"
          className="w-9 shrink-0 px-0"
          aria-expanded={expanded.includes(key)}
          aria-controls={detailId}
          aria-label={`Details for ${what}`}
          onClick={() => toggle(key)}
        >
          <ChevronDown aria-hidden="true" className={cn("transition-transform duration-200 motion-reduce:transition-none", expanded.includes(key) && "rotate-180")} />
        </Button>
      )}
    </div>
  );
  const detailRow = (id: string, fields: [string, ReactNode][], extra?: ReactNode) => (
    <tr id={id} data-detail>
      <td colSpan={99} className="bg-group-a px-4 py-4 sm:px-6">
        <div className="sticky left-4 max-w-[calc(100vw-4.5rem)] sm:static sm:max-w-none">
          <dl className="grid max-w-[90ch] gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-semibold text-brand-muted">{label}</dt>
                <dd className="whitespace-pre-wrap text-brand-navy">{value}</dd>
              </div>
            ))}
          </dl>
          {extra}
        </div>
      </td>
    </tr>
  );
  const notRecorded = <span className="text-brand-muted">Not recorded</span>;

  return (
    <div className="space-y-5">
      {/* Header block: title and subtitle, then the module tabs; one divider below. */}
      <div className="space-y-4">
        <PageHeader
          title="Vitamin Supplementation"
          subtitle="Child administration records and batch inventory"
          actions={recordActions}
        />
        <TabBar
          className="pb-5"
          label="Supplementation views"
          group="supplementation"
          value={activeTab}
          onChange={setTab}
          items={[
            { value: "records", label: "Records" },
            { value: "supplements", label: "Supplements" },
            ...(showFollowUp ? [{ value: "followup" as const, label: "Follow-up" }] : []),
          ]}
        />
      </div>

      {!online && cacheDate && (
        <p role="status" className="rounded-2xl border border-review-line/40 bg-review-soft p-4 text-sm text-review">
          Cached data from {new Date(cacheDate).toLocaleString()}. A draft does
          not reserve stock or create a saved child-history entry.
        </p>
      )}

      {drafts.length > 0 && (
        <section aria-label="Pending offline submissions" className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-5">
          <div>
            <h2 className="font-semibold text-brand-navy">
              Pending Offline / Unconfirmed Submissions ({drafts.length})
            </h2>
            <p className="mt-1 text-sm text-brand-muted">
              Review, edit and confirm each draft. Nothing uploads automatically.
              An uncertain submission may already exist on the server; retry it
              unchanged first.
            </p>
          </div>
          {drafts.map((d) => (
            <div key={d.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-line bg-white p-3">
              <div>
                <p className="font-semibold text-brand-navy">
                  {d.childName} ·{" "}
                  {d.action === "CLINICAL"
                    ? "Clinical administration"
                    : d.action === "RECORD"
                      ? "Administration"
                      : "Dispensing"}{" "}
                  · {d.form.date}
                </p>
                <p className="text-xs text-brand-muted">
                  {nutritionLabel(d.status)} · Saved {new Date(d.savedAt).toLocaleString()}
                </p>
                {d.lastError && <p className="mt-1 text-sm text-danger">{d.lastError}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={saving || loading} onClick={() => void reviewDraft(d)}>
                  Review / Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-danger" disabled={saving} onClick={() => void discardDraft(d)}>
                  Discard
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!online && (
        <p role="status" className="rounded-2xl border border-review-line/40 bg-review-soft p-4 text-sm text-review">
          Offline: administration and dispensing can be saved as local drafts
          using previously loaded data. Stock and nutrition results may be
          outdated. Reconnection never submits drafts automatically.
        </p>
      )}
      {error && !modal && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm text-brand-navy">
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void load()}>Refresh</Button>
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-2xl border border-good/20 bg-good-soft p-4 text-sm font-semibold text-good">
          {notice}
        </p>
      )}

      <TabPanel tabKey={activeTab} className="space-y-5">
        {activeTab === "records" && (
          <>
            <SectionHeader
              title="Administration and supply records"
              subtitle="Saved administrations, supply issues and supply plans for children in your scope."
              about="Entries are saved administrations and supply issues. Clinical-tier entries are recorded by assigned RHMs against a verified clinical protocol and documented order. Supply plans register authorized quantities for a period; issuing supplies does not prove administration or course completion."
            />
            <ViewSwitch
              label="Record views"
              value={recordView}
              onChange={setRecordView}
              items={[
                { value: "entries", label: "Entries", count: data?.records.length ?? 0 },
                { value: "plans", label: "Supply plans", count: data?.plans.length ?? 0 },
              ]}
            />
            <FilterCard
              refresh={
                <>
                  {owner && canSendReminders && (
                    <Button variant="secondary" onClick={() => setSmsOpen(true)}>
                      <Send size={16} aria-hidden="true" /> Send reminders
                    </Button>
                  )}
                  {refreshButton}
                </>
              }
              below={data && (
                <CountsStrip
                  label="Supplementation counts"
                  items={[
                    { label: "Supplement Products", value: data.products.filter((p) => p.catalog_code).length },
                    { label: "Saved Administration / Supply Entries", value: data.records.length },
                    { label: "Expired Batches with Stock", value: expiredWithStock, tone: "review" },
                  ]}
                />
              )}
            >
              <div className="relative sm:col-span-2 lg:col-span-2">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  aria-label="Search child"
                  className="pl-10"
                  placeholder="Search child name"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              {recordView === "entries" && (
                <Select aria-label="Tier" value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
                  <option value="ALL">All tiers</option>
                  {Object.entries(TIER_PILL).map(([value, t]) => (
                    <option key={value} value={value}>{t.label}</option>
                  ))}
                </Select>
              )}
            </FilterCard>

            {loading && !data ? (
              <LogoLoader size="section" label="Loading supplementation data…" />
            ) : data && recordView === "entries" ? (
              <section aria-label="Entries" className={REPORT_CARD}>
                <div className="scroll-subtle overflow-x-auto">
                  <table className="data-grid data-grid--hover w-full text-sm text-brand-navy">
                    <thead>
                      <tr>
                        {["Child", "Date", "Entry Type", "Supplement", "Dose", "Stock Used", "Batch", "Nutrition Basis", "Tier"].map((h) => (
                          <th key={h} scope="col" className={cn(head, "whitespace-nowrap")}>{h}</th>
                        ))}
                        <th scope="col" className={cn(head, pinned, "z-[2]")}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={10}><EmptyState icon={SearchX} title="No saved entries match this view" description="Try a different filter or date range." /></td>
                        </tr>
                      ) : (
                        pagedRecords.map((r, i) => {
                          const p = data.products.find((x) => x.supplement_id === r.supplement_id);
                          const tier = TIER_PILL[tierOf(r)];
                          const key = `r${r.supplementation_record_id}`;
                          const detailId = `entry-${r.supplementation_record_id}-detail`;
                          const clinical = r.tier === "CLINICAL";
                          const hasDetail = clinical || Boolean(r.order_reference || r.remarks);
                          const c = childOf(r.child_id);
                          return (
                            <Fragment key={key}>
                              <tr data-zebra={i % 2 === 1 || undefined} className="group cursor-pointer" onClick={(e) => openChild(e, r.child_id)}>
                                <td className={cn(cell, firstCell, "min-w-44")}>{childCell(r.child_id)}</td>
                                <td className={cn(cell, "whitespace-nowrap")}>{r.supplementation_date}</td>
                                <td className={cell}>
                                  {r.record_type === "DISPENSED" ? "Dispensed" : r.record_type === "ADMINISTERED" ? "Administered" : "Legacy entry"}
                                </td>
                                <td className={cn(cell, "min-w-48")}>{p?.item?.item_name ?? `Product ${r.supplement_id}`}</td>
                                <td className={cn(cell, "min-w-32")}>
                                  {r.record_type === "DISPENSED"
                                    ? <span className="text-brand-muted">Not an administered dose</span>
                                    : r.dose_value == null
                                      ? notRecorded
                                      : `${r.dose_value} ${r.dose_unit ?? ""}`}
                                </td>
                                <td className={cn(cell, "whitespace-nowrap")}>{r.quantity_given} {p?.item?.unit}</td>
                                <td className={cn(cell, "whitespace-nowrap")}>{r.batch_number ?? <span className="text-brand-muted">—</span>}</td>
                                <td className={cn(cell, "min-w-40")}>
                                  {r.source_assessment_id
                                    ? `Assessment #${r.source_assessment_id}`
                                    : r.plan_id && data.plans.find((x) => x.plan_id === r.plan_id)?.source_assessment_id
                                      ? `Plan assessment #${data.plans.find((x) => x.plan_id === r.plan_id)?.source_assessment_id}`
                                      : <span className="text-brand-muted">No linked assessment</span>}
                                </td>
                                <td className={cell}><StatusBadge status={tierOf(r)} tone={tier.tone} label={tier.label} /></td>
                                <td className={cn(cell, pinned, "z-[1]")}>
                                  {rowActions(r.child_id, key, detailId, hasDetail, `${c ? name(c) : `child ${r.child_id}`}, ${r.supplementation_date}`)}
                                </td>
                              </tr>
                              {hasDetail && expanded.includes(key) && detailRow(detailId, [
                                ...(r.order_reference ? [["Order reference", r.order_reference] as [string, ReactNode]] : []),
                                ...(clinical
                                  ? ([
                                      ["Indication", r.clinical_indication ? nutritionLabel(r.clinical_indication) : notRecorded],
                                      ["Clinical dose", r.dose_value == null ? notRecorded : `${r.dose_value} ${r.dose_unit ?? ""}${r.clinical_dose_number ? ` · dose ${r.clinical_dose_number} of the course` : ""}`],
                                      ["Course reference", r.course_reference ?? notRecorded],
                                      ["Course start", r.course_start_date ?? notRecorded],
                                    ] as [string, ReactNode][])
                                  : []),
                                ...(r.remarks ? [["Remarks", r.remarks] as [string, ReactNode]] : []),
                              ])}
                            </Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination {...recordPager} label="Entry pages" />
              </section>
            ) : data ? (
              <section aria-label="Supply plans" className={REPORT_CARD}>
                <div className="scroll-subtle overflow-x-auto">
                  <table className="data-grid data-grid--hover w-full text-sm text-brand-navy">
                    <thead>
                      <tr>
                        {["Plan", "Child", "Supplement", "Period"].map((h) => (
                          <th key={h} scope="col" className={cn(head, "whitespace-nowrap")}>{h}</th>
                        ))}
                        <th scope="col" className={cn(head, "whitespace-nowrap text-right")}>Issued</th>
                        <th scope="col" className={cn(head, pinned, "z-[2]")}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.length === 0 ? (
                        <tr>
                          <td colSpan={6}><EmptyState icon={ClipboardList} title="No supply plans yet" description="Registered supply plans will be listed here." /></td>
                        </tr>
                      ) : (
                        pagedPlans.map((p, i) => {
                          const used = data.records
                            .filter((r) => r.plan_id === p.plan_id && r.record_type === "DISPENSED")
                            .reduce((n, r) => n + Number(r.quantity_given), 0);
                          const product = data.products.find((x) => x.supplement_id === p.supplement_id);
                          const key = `p${p.plan_id}`;
                          const detailId = `plan-${p.plan_id}-detail`;
                          return (
                            <Fragment key={key}>
                              <tr data-zebra={i % 2 === 1 || undefined} className="group cursor-pointer" onClick={(e) => openChild(e, p.child_id)}>
                                <td className={cn(cell, firstCell, "whitespace-nowrap font-semibold")}>Plan #{p.plan_id}</td>
                                <td className={cn(cell, "min-w-44")}>{childCell(p.child_id)}</td>
                                <td className={cn(cell, "min-w-48")}>
                                  {product?.item?.item_name ?? `Product ${p.supplement_id}`}
                                  <span className="block text-xs text-brand-muted">{p.product_label}</span>
                                </td>
                                <td className={cn(cell, "whitespace-nowrap")}>{p.start_date} to {p.end_date}</td>
                                <td className={cn(cell, "whitespace-nowrap text-right tabular-nums")}>
                                  {used} of {p.authorized_quantity} {product?.item?.unit}
                                </td>
                                <td className={cn(cell, pinned, "z-[1]")}>{rowActions(p.child_id, key, detailId, true, `plan ${p.plan_id}`)}</td>
                              </tr>
                              {/* Plan details; room for per-month monitoring rows (e.g. LNS-SQ Month 1–3) later. */}
                              {expanded.includes(key) && detailRow(detailId, [
                                ["Directions", p.directions ?? notRecorded],
                                ["Authorization reference", p.authorization_reference ?? notRecorded],
                                ["Indication", p.indication ?? notRecorded],
                                ["Source assessment", p.source_assessment_id ? `Assessment #${p.source_assessment_id}` : <span className="text-brand-muted">No linked assessment</span>],
                                ["Product", p.product_label],
                                ["Remarks", p.remarks ?? "—"],
                              ])}
                            </Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination {...planPager} label="Supply plan pages" />
                <p className="border-t border-brand-line/70 px-4 py-3 text-[13px] text-brand-muted">
                  Registered supply periods and quantities. Issuing supplies does not
                  prove administration or course completion.
                </p>
              </section>
            ) : null}
          </>
        )}

        {activeTab === "supplements" && (
          <>
            <SectionHeader
              title="Supplements"
              subtitle="Stock and batches for your barangays, and the catalog's age limits and administration rules."
              about="Stock arrives through PHN-approved batch requests. Expired batches with stock and batches that need reconciliation are flagged. The guidelines come from the active system catalog and protocols; they support staff review and do not select treatment or prescribe a dose."
            />
            <ViewSwitch
              label="Supplement views"
              value={supplyView}
              onChange={setSupplyView}
              items={[
                { value: "stock", label: "Stock & batches" },
                { value: "guidelines", label: "Guidelines & eligibility" },
              ]}
            />
            {loading && !data ? (
              <LogoLoader size="section" label="Loading supplementation data…" />
            ) : supplyView === "guidelines" ? (
              guidelinesPanel
            ) : (
              <>
                {data && (
                  <section aria-label="Supplement inventory" className={REPORT_CARD}>
                    <div className="flex items-center gap-2 border-b border-brand-line px-4 py-3">
                      <Package size={18} aria-hidden="true" className="text-brand-muted" />
                      <h3 className="text-base font-semibold text-brand-navy">Supplement Inventory</h3>
                    </div>
                    <div className="scroll-subtle overflow-x-auto">
                      <table className="data-grid w-full text-sm text-brand-navy">
                        <thead>
                          <tr>
                            {["Product / Barangay", "Aggregate Stock", "Batch", "Batch Stock", "Expiry", "Status"].map((h, i) => (
                              <th key={h} scope="col" className={cn(head, "whitespace-nowrap", (i === 1 || i === 3) && "text-right")}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.inventory.length === 0 ? (
                            <tr>
                              <td colSpan={6}><EmptyState icon={Package} title="No supplement stock yet" description="RHM can request stock below. Batches arrive through PHN-approved requests." /></td>
                            </tr>
                          ) : (
                            data.inventory.flatMap((inv) => {
                              const p = data.products.find((x) => x.supplement_id === inv.item_id);
                              const bs = data.batches.filter((b) => b.inventory_id === inv.inventory_id);
                              const sum = bs.reduce((n, b) => n + Number(b.quantity_on_hand), 0);
                              return (bs.length ? bs : [null]).map((b) => {
                                const status = !b
                                  ? { label: "Needs batch allocation", tone: "review" as const }
                                  : b.expiry_date < today()
                                    ? { label: "Expired", tone: "danger" as const }
                                    : Number(b.quantity_on_hand) === 0
                                      ? { label: "Out of stock", tone: "neutral" as const }
                                      : { label: "Available", tone: "good" as const };
                                return { key: `${inv.inventory_id}:${b?.batch_id ?? "none"}`, inv, p, b, sum, status };
                              });
                            }).map(({ key, inv, p, b, sum, status }, i) => (
                              <tr key={key} data-zebra={i % 2 === 1 || undefined}>
                                <td className={cn(cell, "min-w-48")}>
                                  {p?.item?.item_name}
                                  <span className="block text-xs text-brand-muted">
                                    {data.barangays.find((x) => x.barangay_id === inv.barangay_id)?.barangay_name}
                                  </span>
                                </td>
                                <td className={cn(cell, "whitespace-nowrap text-right tabular-nums")}>
                                  {inv.quantity_on_hand} {p?.item?.unit}
                                  {sum !== Number(inv.quantity_on_hand) && (
                                    <span className="block text-xs font-semibold text-review">Batch reconciliation required</span>
                                  )}
                                </td>
                                <td className={cell}>{b?.batch_number ?? <span className="text-brand-muted">Unallocated</span>}</td>
                                <td className={cn(cell, "text-right tabular-nums")}>{b?.quantity_on_hand ?? <span className="text-brand-muted">—</span>}</td>
                                <td className={cn(cell, "whitespace-nowrap")}>{b?.expiry_date ?? <span className="text-brand-muted">—</span>}</td>
                                <td className={cell}><StatusBadge status={status.label} tone={status.tone} label={status.label} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                {owner && <SupplementStockRequestsPanel key={owner} ownerId={owner} online={online} />}
              </>
            )}
          </>
        )}

        {activeTab === "followup" && owner && (
          <SupplementationMonitoringPanel key={owner} ownerId={owner} online={online} />
        )}
      </TabPanel>

      <GuidanceCard title="Protocol coverage">
        This catalog contains child commodities only. Vitamin A and authorized
        deworming are recorded as administrations. LNS-SQ, MNP and iron drops
        are issued against RHM/PHN-registered supply plans. Issuing supplies
        does not confirm consumption or course completion. The system does not
        prescribe iron doses or automatically select treatment from a
        nutrition classification.
      </GuidanceCard>

      {smsOpen && owner && (
        <Modal
          open
          size="xl"
          title="Send reminders"
          subtitle="Supplementation reminders to guardians. Sent reminders are listed in Alerts › SMS Overview."
          onClose={() => setSmsOpen(false)}
          cancelLabel="Close"
        >
          <SupplementationSmsPanel key={owner} ownerId={owner} online={online} />
        </Modal>
      )}

      {modal && (
        <Modal
          open
          size="xl"
          onClose={() => setModal(null)}
          busy={saving}
          title={modal === "CLINICAL"
                  ? "Record Clinical-Tier Supplementation"
                  : modal === "RECORD"
                    ? "Record Actual Administration"
                    : modal === "PLAN"
                      ? "Register Supply Plan"
                      : "Record Supply Dispensing"}
          onSubmit={save}
          footer={<Button type="submit" loading={saving} disabled={
                  saving ||
                  loading ||
                  (!online &&
                    modal !== "RECORD" &&
                    modal !== "DISPENSE" &&
                    modal !== "CLINICAL") ||
                  (editingDraft !== null && online && !draftConfirmed) ||
                  (modal === "PLAN" && ageEligibility?.eligible === false) ||
                  (modal === "CLINICAL" && !retryClinicalProtocol())
                }>
{saving
                  ? "Saving…"
                  : !online
                    ? "Save Offline Draft"
                    : editingDraft
                      ? "Confirm & Submit"
                      : "Save"}
          </Button>}
        >
            {error && (
              <p role="alert" className="mb-4 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {nutritionPanel}
              {modal === "CLINICAL" && (
                <div
                  role="status"
                  className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm sm:col-span-2"
                >
                  <p className="font-semibold">Clinical tier · RHM only</p>
                  <p>
                    A documented order, clinical indication, course reference
                    and active verified day-based clinical protocol are
                    required. Nutrition results support review; they do not
                    prescribe a dose.
                  </p>
                  {clinicalProtocols.length === 0 && (
                    <p className="mt-2 font-medium text-amber-900">
                      No verified clinical protocol is available. Routine or
                      targeted protocols cannot be substituted. Saving is
                      unavailable until clinical protocols are configured.
                    </p>
                  )}
                </div>
              )}

              {modal === "PLAN" ? (
                <>
                  {select(
                    "Child",
                    "childId",
                    data?.children
                      .filter((c) => c.status === "ACTIVE")
                      .map((c) => ({
                        value: String(c.child_id),
                        label: name(c),
                      })) ?? [],
                  )}
                  {select(
                    "Child Commodity",
                    "supplementId",
                    productOptions.filter(
                      (o) =>
                        data?.products.find(
                          (p) => String(p.supplement_id) === o.value,
                        )?.dispensing_only,
                    ),
                  )}
                  {productPanel}
                  {assessmentSelector}
                  {field("Plan Start", "startDate", "date")}
                  {field("Plan End", "endDate", "date")}
                  {field(
                    `Planned Total (${catalog?.unit ?? "select a commodity"})`,
                    "quantity",
                    "number",
                  )}
                  <label className="text-sm font-medium sm:col-span-2">
                    Remarks (optional)
                    <textarea
                      rows={3}
                      className={input}
                      value={form.remarks}
                      onChange={(e) => change("remarks", e.target.value)}
                      placeholder="Notes about this supply plan"
                    />
                  </label>
                  <p className="text-sm text-muted-foreground sm:col-span-2">
                    This saves a supply period and quantity limit. Registration
                    does not record administration, dispensing or course
                    completion.
                  </p>
                </>
              ) : modal === "DISPENSE" ? (
                <>
                  {select(
                    "Registered Plan",
                    "planId",
                    data?.plans.map((p) => ({
                      value: String(p.plan_id),
                      label: `Plan #${p.plan_id} · ${data.children.find((c) => c.child_id === p.child_id) ? name(data.children.find((c) => c.child_id === p.child_id)!) : p.child_id} · ${data.products.find((x) => x.supplement_id === p.supplement_id)?.item?.item_name}`,
                    })) ?? [],
                  )}
                  {field("Actual Issue Date", "date", "date")}
                  {productPanel}
                  {field(
                    `Quantity Issued (${catalog?.unit ?? "stock units"})`,
                    "quantity",
                    "number",
                  )}
                  {select(
                    "Available Batch",
                    "batchId",
                    batches.map((b) => ({
                      value: String(b.batch_id),
                      label: `${b.batch_number} · ${b.quantity_on_hand} available · expires ${b.expiry_date}`,
                    })),
                  )}
                  {field("Remarks", "remarks", "text", false)}
                  {selectedPlan && (
                    <p className="rounded-lg bg-muted p-3 text-sm sm:col-span-2">
                      Product: {selectedPlan.product_label}
                      <br />
                      Remarks: {selectedPlan.remarks ?? "—"}
                      <br />
                      Plan ends {selectedPlan.end_date}. The selected batch must
                      remain valid through that date.
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground sm:col-span-2">
                    This saves quantities handed out and deducts stock. It does
                    not save an administered dose or mark the course completed.
                  </p>
                </>
              ) : (
                <>
                  {select(
                    "Child",
                    "childId",
                    data?.children
                      .filter((c) => c.status === "ACTIVE")
                      .map((c) => ({
                        value: String(c.child_id),
                        label: name(c),
                      })) ?? [],
                  )}
                  {field("Actual Administration Date", "date", "date")}
                  {child && (
                    <p className="rounded-lg bg-muted p-3 text-sm sm:col-span-2">
                      Born {child.date_of_birth} · {child.sex} ·{" "}
                      {months(child.date_of_birth, form.date)} completed months.
                      Personal information comes from the child profile.
                    </p>
                  )}
                  {modal === "CLINICAL"
                    ? select(
                        "Clinical protocol purpose",
                        "purpose",
                        [
                          ...new Set(clinicalProtocols.map((p) => p.purpose)),
                        ].map((value) => ({
                          value,
                          label: nutritionLabel(value),
                        })),
                      )
                    : select("Purpose", "purpose", [
                        { value: "ROUTINE", label: "Routine" },
                        {
                          value: "TARGETED",
                          label: "Targeted / program order",
                        },
                      ])}
                  {select(
                    "Product",
                    "supplementId",
                    productOptions.filter(
                      (o) =>
                        !data?.products.find(
                          (p) => String(p.supplement_id) === o.value,
                        )?.dispensing_only,
                    ),
                  )}
                  {productPanel}
                  {concurrentPlanReminder}
                  {select(
                    "Eligible Protocol",
                    "protocolId",
                    protocols.map((p) => ({
                      value: String(p.protocol_id),
                      label: p.protocol_code,
                    })),
                  )}
                  {select(
                    "Available Batch",
                    "batchId",
                    batches.map((b) => ({
                      value: String(b.batch_id),
                      label: `${b.batch_number} · ${b.quantity_on_hand} available · expires ${b.expiry_date}`,
                    })),
                  )}
                  {child && product && protocols.length === 0 && (
                    <p className="text-sm text-amber-800 sm:col-span-2">
                      No verified protocol matches this age, purpose and
                      product. Do not substitute a dose from another
                      formulation.
                    </p>
                  )}
                  {protocol && (
                    <p className="rounded-lg bg-teal-50 p-3 text-sm sm:col-span-2">
                      Recorded dose: {protocol.dose_value} {protocol.dose_unit}.
                      Stock deducted: {protocol.stock_quantity_per_dose}{" "}
                      {protocol.stock_unit}.{" "}
                      <a
                        href={
                          protocol.source_reference.match(
                            /https:\/\/\S+/,
                          )?.[0] ?? "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Protocol source
                      </a>
                    </p>
                  )}
                  {modal === "CLINICAL" && (
                    <>
                      <label className="text-sm font-medium">
                        Clinical indication
                        <input
                          readOnly
                          required
                          className={input}
                          value={
                            form.clinicalIndication ? nutritionLabel(form.clinicalIndication) : ""
                          }
                        />
                      </label>
                      {field("Treatment-course reference", "courseReference")}
                      {select(
                        "Course dose number",
                        "clinicalDoseNumber",
                        (protocol?.clinical_dose_offsets_days ?? []).map(
                          (day, index) => ({
                            value: String(index + 1),
                            label: `Dose ${index + 1} · day ${day} from course start`,
                          }),
                        ),
                      )}
                      {courseExpectedDate && (
                        <p
                          role="status"
                          className="rounded-lg bg-sky-50 p-3 text-sm sm:col-span-2"
                        >
                          Course started {courseFirst?.course_start_date}.
                          Expected date for this dose: {courseExpectedDate}.
                          Enter the actual administration date; a deviation
                          needs clinical review.
                        </p>
                      )}
                      {!courseFirst && Number(form.clinicalDoseNumber) > 1 && (
                        <p className="text-sm text-amber-800 sm:col-span-2">
                          No saved dose 1 was found for this course reference.
                          Reconcile the preceding treatment records before
                          submitting.
                        </p>
                      )}
                      {clinicalCourses.length > 0 && (
                        <div className="rounded-lg bg-muted p-3 text-sm sm:col-span-2">
                          <p className="font-semibold">
                            Existing clinical courses for this child
                          </p>
                          {clinicalCourses.map((r) => (
                            <p
                              key={r.supplementation_record_id}
                              className="mt-1"
                            >
                              {r.course_reference} ·{" "}
                              {r.clinical_indication ? nutritionLabel(r.clinical_indication) : "Indication not recorded"} ·
                              started{" "}
                              {r.course_start_date ?? r.supplementation_date}
                            </p>
                          ))}
                        </div>
                      )}
                      {field("Actual dose", "clinicalDoseValue", "number")}
                      <label className="text-sm font-medium">
                        Dose unit
                        <input
                          readOnly
                          required
                          className={input}
                          value={form.clinicalDoseUnit ?? ""}
                        />
                      </label>
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        The dose is filled from the verified protocol. Confirm
                        it against the documented order; a different dose
                        requires a matching verified protocol.
                      </p>
                    </>
                  )}
                  {field(
                    "Clinical Order Reference",
                    "orderReference",
                    "text",
                    modal === "CLINICAL" || Boolean(protocol?.requires_order),
                  )}
                  {assessmentSelector}
                  {field(
                    "Approved Activity ID (optional)",
                    "scheduleId",
                    "number",
                    false,
                  )}
                  {field("Remarks", "remarks", "text", false)}
                  <label className="text-sm sm:col-span-2">
                    <input
                      required
                      type="checkbox"
                      checked={form.confirmed}
                      onChange={(e) => change("confirmed", e.target.checked)}
                    />{" "}
                    I reviewed existing doses, external records and concurrent
                    nutrition treatment, and confirm this supplement was
                    actually administered under the applicable protocol.
                  </label>
                </>
              )}
            </div>{" "}
            {editingDraft && (
              <label className="mt-5 block rounded-lg bg-amber-50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={draftConfirmed}
                  onChange={(e) => setDraftConfirmed(e.target.checked)}
                />{" "}
                I cross-checked this draft with the child history and current
                stock, and confirm submission. Server duplicate and eligibility
                checks still apply.
              </label>
            )}
        </Modal>
      )}
    </div>
  );
}
