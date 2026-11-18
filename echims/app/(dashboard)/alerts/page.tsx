"use client";
import { CountsStrip, FilterCard, SectionHeader } from '@/components/ui/report-parts'
import { InfoContent } from '@/components/ui/info-tip'
import { GridTable, RowButton } from '@/components/ui/grid-table'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle, Plus, RefreshCw, History, ListChecks } from "lucide-react";
import Link from "next/link";
import { alertDestination } from "@/lib/alerts/alert-destination";
import { SmsSimulationPanel } from "@/components/alerts/sms-simulation-panel";
import { useAuth } from "@/components/auth/auth-provider";
import { offlineScope } from "@/lib/offline/fetch";
import { LogoLoader } from '@/components/brand/logo-loader'
import { TabPanel, usePageLoading } from '@/components/brand/page-gate'
import { readPageCache, writePageCache } from '@/lib/page-cache'
import { FilterChips, TabBar } from '@/components/ui/module-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/form'
import { Pagination } from '@/components/ui/pagination'
import { StatusBadge } from '@/components/ui/status-badge'
type Rule = {
  rule_id: number;
  rule_name: string;
  description: string | null;
  rule_category: string;
  condition_logic: string;
  severity: string;
  status: string;
  evaluator_type: string;
  condition_parameters: Record<string, number>;
  message_template: string | null;
  revision: number;
  updated_at: string;
};
type Alert = {
  alert_id: number;
  alert_type: string;
  alert_message: string;
  severity: string;
  status: string;
  created_at: string;
  source_module: string | null;
  child_id: number | null;
  inventory_id: number | null;
  schedule_id: number | null;
  recipient_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  /** Set when the system resolved the alert itself. */
  resolution_note?: string | null;
};
type Audit = {
  audit_id: number;
  rule_id: number;
  actor_id: string;
  action: string;
  changed_at: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown>;
};
type EvaluationRun = {
  run_id: number;
  module: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  started_at: string;
  completed_at: string | null;
  alerts_created: number | null;
  error_code: string | null;
  error_message: string | null;
};
type Data = {
  currentUserId: string;
  canConfigure: boolean;
  alerts: Alert[];
  rules: Rule[];
  audit: Audit[];
  monitoring: { runs: EvaluationRun[]; error: string | null } | null;
  page: number;
  pageSize: number;
  /** Alerts matching the current filters (server-side). */
  matched?: number;
  programs?: string[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    resolved: number;
  };
};
type Draft = {
  ruleId: number | null;
  revision: number;
  ruleName: string;
  evaluatorType: string;
  description: string;
  severity: string;
  status: string;
  parameter: string;
  messageTemplate: string;
};
const fresh = (): Draft => ({
  ruleId: null,
  revision: 1,
  ruleName: "",
  evaluatorType: "INVENTORY_LOW_STOCK",
  description: "",
  severity: "HIGH",
  status: "INACTIVE",
  parameter: "10",
  messageTemplate: "",
});
const parameterKey = (kind: string) =>
  kind === "INVENTORY_LOW_STOCK"
    ? "threshold_quantity"
    : kind === "INVENTORY_NEAR_EXPIRY"
      ? "days_before_expiry"
      : kind === "HEALTH_ACTIVITY_REMINDER"
        ? "days_before"
        : null;
const formatTime = (value: string) =>
  new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
async function jsonResponse(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      `The API returned a non-JSON response (HTTP ${response.status}). Verify app/api/alerts/route.ts.`,
    );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body;
}
function conditionLabel(rule: Rule): string {
  const parameters = rule.condition_parameters ?? {};
  if (rule.evaluator_type === "INVENTORY_LOW_STOCK") {
    const threshold = parameters.threshold_quantity;
    return threshold == null
      ? "Stock threshold has not been configured."
      : `Available stock is ${threshold} units or less.`;
  }
  if (rule.evaluator_type === "INVENTORY_NEAR_EXPIRY") {
    const days = parameters.days_before_expiry;
    return days == null
      ? "Expiry warning period has not been configured."
      : `A batch with remaining stock has expired or will expire within ${days} days.`;
  }
  if (rule.evaluator_type === "HEALTH_ACTIVITY_REMINDER") {
    const days = parameters.days_before;
    return days == null
      ? "Reminder period has not been configured."
      : days === 0
        ? "An approved health activity is scheduled for today."
        : `An approved health activity is scheduled in ${days} day${days === 1 ? "" : "s"}.`;
  }
  const descriptions: Record<string, string> = {
    HEALTH_ACTIVITY_ACTION_NOTIFICATION:
      "A health activity request is submitted or updated.",
    HEALTH_ACTIVITY_UPCOMING_REMINDER:
      "An approved health activity is approaching its scheduled date.",
    NUT_MAM_SCREENING:
      "A child aged 6–59 months has moderate wasting or MUAC from 11.5 to below 12.5 cm, without edema or severe acute malnutrition criteria.",
    NUT_STUNTED: "Height-for-age indicates stunting, but not severe stunting.",
    NUT_INFANT_URGENT_REVIEW:
      "An infant below six months has bilateral pitting edema or severe wasting and requires urgent clinical assessment.",
    NUT_SAM_SCREENING:
      "A child aged 6–59 months has bilateral pitting edema, severe wasting, or MUAC below 11.5 cm.",
    NUT_OVERWEIGHT:
      "Weight-for-length/height or BMI-for-age indicates overweight.",
    NUT_SEVERELY_UNDERWEIGHT: "Weight-for-age indicates severe underweight.",
    NUT_SEVERELY_STUNTED: "Height-for-age indicates severe stunting.",
    NUT_UNDERWEIGHT:
      "Weight-for-age indicates underweight, but not severe underweight.",
    NUT_OBESITY: "Weight-for-length/height or BMI-for-age indicates obesity.",
    NUT_STATUS_WORSENED:
      "A valid nutritional classification has worsened compared with a comparable assessment from an earlier date.",
    MSP_DOSE_OVERDUE:
      "An active child has a valid supplementation schedule whose due date has already passed.",
    NIP_DOSE_OVERDUE:
      "An active child below five years has a recommended vaccine dose more than 30 days past its date, with no approved administration recorded. Staff must verify history and assess catch-up needs.",
    MSP_DOSE_DUE:
      "An active child has a valid supplementation schedule due today.",
  };
  return (
    descriptions[rule.rule_name] ||
    rule.description?.trim() ||
    "Records are checked using the configured program rule."
  );
}
function EvaluationMonitoring({
  monitoring,
}: {
  monitoring: Data["monitoring"];
}) {
  const modules = [
    { code: "VACCINATION", label: "Vaccination" },
    { code: "SUPPLEMENTATION", label: "Supplementation" },
    { code: "INVENTORY", label: "Inventory" },
  ];
  return (
    <section aria-labelledby="monitoring-title" className="space-y-4">
      <SectionHeader
        title={<span id="monitoring-title">Evaluation monitoring</span>}
        subtitle="Latest recorded run for each hourly evaluator. Use Refresh to check for updates."
        about={<InfoContent
          title="Evaluation monitoring"
          description="Each scheduled evaluator checks its program every hour and logs the run here."
          sections={[{ label: "Values", value: ["Succeeded = the run finished (zero new alerts is valid)", "Running = still checking", "Failed = the run stopped; see the error"] }]}
          note="Nutrition is evaluated when assessments are saved, so it has no scheduled run."
        />}
      />
      {monitoring?.error ? (
        <p role="alert" className="rounded-xl border border-[#F5C2C2] bg-[#FFF5F5] p-3 text-sm text-[#C42B2B]">
          {monitoring.error}
        </p>
      ) : !monitoring ? (
        <p className="text-sm text-[#55617F]">Monitoring is unavailable. Update the Alerts API.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {modules.map(({ code, label }) => {
            const run = monitoring.runs.find((item) => item.module === code);
            const tone =
              run?.status === "FAILED" ? "danger" : run?.status === "SUCCEEDED" ? "good" : run?.status === "RUNNING" ? "info" : "neutral";
            const status =
              run?.status === "SUCCEEDED" ? "Succeeded" : run?.status === "FAILED" ? "Failed" : run?.status === "RUNNING" ? "Running" : "Not yet run";
            return (
              <div key={code} className="rounded-xl border border-[#D5E2EA] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#0C1260]">{label}</h3>
                  <StatusBadge status={run?.status ?? "not_run"} tone={tone} label={status} />
                </div>
                {run ? (
                  <>
                    <dl className="mt-3 space-y-2 text-sm text-[#1E2A55]">
                      <div><dt className="text-xs text-[#8896B0]">Started · Manila time</dt><dd>{formatTime(run.started_at)}</dd></div>
                      <div><dt className="text-xs text-[#8896B0]">Completed · Manila time</dt><dd>{run.completed_at ? formatTime(run.completed_at) : "Not recorded"}</dd></div>
                      <div><dt className="text-xs text-[#8896B0]">Alerts created</dt><dd>{run.alerts_created ?? "Unavailable"}</dd></div>
                    </dl>
                    {run.status === "FAILED" && (
                      <p className="mt-3 break-words rounded-lg bg-[#FFF5F5] p-3 text-xs text-[#C42B2B]">
                        {run.error_message ?? "Evaluation failed."}
                        {run.error_code ? ` (${run.error_code})` : ""}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-[#55617F]">No evaluation log has been recorded.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-[#8896B0]">
        Nutrition is evaluated when assessments are saved; it is not included in
        these scheduled run logs. A successful run with zero new alerts is
        valid.
      </p>
    </section>
  );
}

/** Severity shown on alerts: Critical, Warning (high and medium), Info (low). */
const severityLabel = (severity: string) =>
  severity === "CRITICAL" ? "Critical" : ["HIGH", "MEDIUM"].includes(severity) ? "Warning" : "Info";
/** Rule severity badge tones (rules table). */
const RULE_SEVERITY_TONE: Record<string, "danger" | "warn" | "review" | "info" | "neutral"> = {
  CRITICAL: "danger", HIGH: "warn", MEDIUM: "review", LOW: "info", INFO: "neutral",
};
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
const ALERT_PAGE_SIZE = 5;

export default function AlertsPage() {
  const {user,isReady}=useAuth();
  if(!isReady)return <LogoLoader label="Checking account…" />;
  return <AlertsWorkspace key={user?user.id+':'+offlineScope(user):'signed-out'}/>;
}
function AlertsWorkspace() {
  const {user,isReady:authReady}=useAuth();
  const owner=user?.id??null;
  // A revisit starts from the last result for this account (no loader) and refreshes it quietly.
  const [data, setData] = useState<Data | null>(() => readPageCache<Data>(owner, "alerts:1") ?? null);
  const [loading, setLoading] = useState(false);
  usePageLoading(!authReady || (loading && !data));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"ALERTS" | "RULES" | "SMS">("ALERTS");
  const [filter, setFilter] = useState("unresolved");
  const [program, setProgram] = useState("ALL");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState<number | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Alert | null>(null);
  const [resolutionReviewed, setResolutionReviewed] = useState(false);
  const [resolving, setResolving] = useState(false);
  const sequence = useRef(0);
  const ownerRef = useRef<string | null>(null);
  ownerRef.current=owner;
  useEffect(()=>()=>{sequence.current++;ownerRef.current=null},[]);
  // Dashboard links open a program directly: /alerts?program=VACCINATION
  useEffect(()=>{const q=new URLSearchParams(window.location.search),p=q.get("program"),t=q.get("tab");if(p&&/^[A-Z_]{1,40}$/.test(p))setProgram(p);if(t==="SMS")setTab("SMS");else if(t==="RULES")setTab("RULES")},[]);
  const load = useCallback(async () => {
    if (!owner) return;
    const token = ++sequence.current;
    const cacheKey = `alerts:${page}:${filter}:${program}`;
    if (!readPageCache(owner, cacheKey)) setLoading(true);
    setError("");
    try {
      const body: Data = await jsonResponse(
        // Filters and pages of 5 on the server, so the counts and pages cover every alert.
        await fetch(`/api/alerts?page=${page}&pageSize=${ALERT_PAGE_SIZE}&filter=${encodeURIComponent(filter)}&program=${encodeURIComponent(program)}`, { cache: "no-store" }),
      );
      if (sequence.current !== token || ownerRef.current !== owner) return;
      if (
        body.currentUserId !== owner ||
        !Array.isArray(body.alerts) ||
        !Array.isArray(body.rules) ||
        !Array.isArray(body.audit)
      )
        throw new Error("The response does not match the current account.");
      setData(body);
      writePageCache(owner, cacheKey, body);
    } catch (cause) {
      if (sequence.current === token) {
        setData(null);
        setError(
          cause instanceof Error ? cause.message : "Unable to load alerts.",
        );
      }
    } finally {
      if (sequence.current === token) setLoading(false);
    }
  }, [owner, page, filter, program]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  function editRule(rule: Rule) {
    const key = parameterKey(rule.evaluator_type);
    setDraft({
      ruleId: rule.rule_id,
      revision: rule.revision,
      ruleName: rule.rule_name,
      evaluatorType: rule.evaluator_type,
      description: rule.description ?? "",
      severity: rule.severity,
      status: rule.status,
      parameter: key ? String(rule.condition_parameters[key] ?? "") : "",
      messageTemplate: rule.message_template ?? "",
    });
    setReview(false);
    setError("");
    setNotice("");
  }
  function checkDraft() {
    if (!draft) return false;
    if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(draft.ruleName)) {
      setError(
        "Use an uppercase rule name, 3–80 characters, with letters, numbers or underscores.",
      );
      return false;
    }
    const key = parameterKey(draft.evaluatorType);
    if (key) {
      const value = Number(draft.parameter);
      if (
        !draft.parameter.trim() ||
        !Number.isFinite(value) ||
        value < 0 ||
        (key === "threshold_quantity"
          ? value > 1000000000
          : !Number.isInteger(value) || value > 365)
      ) {
        setError(
          key === "threshold_quantity"
            ? "Enter a stock threshold from 0 to 1000000000."
            : "Enter whole days from 0 to 365.",
        );
        return false;
      }
    }
    setError("");
    return true;
  }
  async function saveRule() {
    if (!draft || !checkDraft() || !owner || saving) return;
    const requestOwner = owner;
    const key = parameterKey(draft.evaluatorType);
    setSaving(true);
    setError("");
    try {
      const body = await jsonResponse(
        await fetch("/api/alerts", {
          method: draft.ruleId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ruleId: draft.ruleId,
            revision: draft.revision,
            ruleName: draft.ruleName,
            evaluatorType: draft.evaluatorType,
            description: draft.description,
            severity: draft.severity,
            status: draft.status,
            conditionParameters: key ? { [key]: Number(draft.parameter) } : {},
            messageTemplate: draft.messageTemplate.trim() || null,
          }),
        }),
      );
      if (ownerRef.current !== requestOwner) return;
      setDraft(null);
      setReview(false);
      setNotice(body.message);
      await load();
    } catch (cause) {
      if (ownerRef.current === requestOwner)
        setError(
          cause instanceof Error ? cause.message : "Unable to save rule.",
        );
    } finally {
      setSaving(false);
    }
  }
  async function markRead(alert: Alert) {
    if (!owner || reading !== null) return;
    const requestOwner = owner;
    setReading(alert.alert_id);
    setError("");
    try {
      await jsonResponse(
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId: alert.alert_id, status: "READ" }),
        }),
      );
      if (ownerRef.current === requestOwner) {
        setNotice("Marked as read. The alert remains unresolved.");
        await load();
      }
    } catch (cause) {
      if (ownerRef.current === requestOwner)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to mark alert as read.",
        );
    } finally {
      setReading(null);
    }
  }
  async function resolveAlert() {
    if (!owner || !resolveTarget || !resolutionReviewed || resolving) return;
    const requestOwner = owner;
    setResolving(true);
    setError("");
    try {
      await jsonResponse(
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "RESOLVE",
            alertId: resolveTarget.alert_id,
            reviewed: true,
          }),
        }),
      );
      if (ownerRef.current === requestOwner) {
        setResolveTarget(null);
        setResolutionReviewed(false);
        setNotice(
          "Alert resolved. Handler and time recorded; other recipients are unchanged.",
        );
        await load();
      }
    } catch (cause) {
      if (ownerRef.current === requestOwner)
        setError(
          cause instanceof Error ? cause.message : "Unable to resolve alert.",
        );
    } finally {
      setResolving(false);
    }
  }
  // The server applies the filter / program and sends one page of 5 (plus the exact match count).
  const alerts = data?.alerts ?? [];
  const matched = data?.matched ?? alerts.length;
  const alertPagerProps = { page: page - 1, pageCount: Math.max(1, Math.ceil(matched / ALERT_PAGE_SIZE)), total: matched, pageSize: ALERT_PAGE_SIZE, onChange: (p: number) => setPage(p + 1) };
  const programs = data?.programs ?? [...new Set(alerts.map((alert) => alert.source_module ?? alert.alert_type))].sort();
  const summary = data?.summary;
  const inputClass =
    "mt-1 w-full rounded-lg border border-[#D5E2EA] bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-5">
      {/* Header block: title and subtitle, then the tabs (Administrators); one divider below. */}
      <div className="space-y-4">
        <PageHeader
          title="Alert Management"
          subtitle="Monitor system alerts and configure evaluation rules"
          actions={
            <Button variant="secondary" disabled={loading || !owner} onClick={() => void load()}>
              <RefreshCw size={16} aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : undefined} />
              Refresh
            </Button>
          }
        />
        {data?.canConfigure && (
          <TabBar
            className="pb-5"
            label="Alert sections"
            group="alerts"
            value={tab}
            onChange={setTab}
            items={[
              { value: "ALERTS", label: "Alerts & evaluation monitoring" },
              { value: "RULES", label: "Rules & change history" },
              { value: "SMS", label: "SMS overview" },
            ]}
          />
        )}
      </div>
      {error && !draft && !resolveTarget && (
        <p role="alert" className="rounded-xl border border-[#F5C2C2] bg-[#FFF5F5] p-4 text-sm text-[#C42B2B]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-[#BFE3D2] bg-[#EEF8F3] p-4 text-sm text-[#17694C]">
          {notice}
        </p>
      )}
      {!authReady || (loading && !data) ? (
        <LogoLoader size="section" label="Loading alerts…" />
      ) : !owner ? (
        <p>Please sign in to access alerts.</p>
      ) : null}
      {/* Tab content fades in with the previous tab's height held, so the page below does not jump. */}
      <TabPanel tabKey={tab}>
      {data?.canConfigure && tab === "SMS" && (
        <div role="tabpanel" aria-label="SMS overview">
          <SmsSimulationPanel key={data.currentUserId} ownerId={data.currentUserId} />
        </div>
      )}
      {data && tab === "ALERTS" && (
        <div role="tabpanel" aria-label="Alerts and evaluation monitoring">
          {data.canConfigure && <EvaluationMonitoring monitoring={data.monitoring} />}
          <section aria-labelledby="alerts-title" className={data.canConfigure ? "mt-8 space-y-4 border-t-2 border-[#EAF0F4] pt-6" : "space-y-4"}>
            <SectionHeader
              title={<span id="alerts-title">Active alerts</span>}
              subtitle="Alerts for the records and programs you can access."
              about={<InfoContent
                title="Active alerts"
                description="Alerts are generated by scheduled evaluators and program rules."
                sections={[
                  { label: "Values", value: ["Critical and Warning = need action", "Info = for awareness", "High and medium severity appear under Warning"] },
                  { label: "Tip", value: "Open the child record or the module link to follow up, then mark the alert as resolved" },
                ]}
                note="Counts cover every alert you can access; the chips and program filter the list."
              />}
            />
            <FilterCard
              below={<CountsStrip label="Alert counts" items={[
                { label: "Total alerts", value: summary?.total ?? 0 },
                { label: "Critical", value: summary?.critical ?? 0, tone: "severe" },
                { label: "Warning", value: summary?.warning ?? 0, tone: "review" },
                { label: "Resolved", value: summary?.resolved ?? 0, tone: "good" },
              ]} />}
            >
              <div className="flex items-center sm:col-span-2">
                <FilterChips
                  label="Filter alerts"
                  value={filter}
                  onChange={(value) => { setFilter(value); setPage(1); }}
                  options={["all", "unresolved", "critical", "warning", "info", "resolved"].map((value) => ({
                    value,
                    label: value[0].toUpperCase() + value.slice(1),
                  }))}
                />
              </div>
              <Select
                aria-label="Filter by program"
                value={program}
                onChange={(event) => { setProgram(event.target.value); setPage(1); }}
              >
                <option value="ALL">All programs</option>
                {programs.map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
            </FilterCard>
            <div key={`${filter}|${program}|${page}`} className={`space-y-3 animate-in fade-in duration-150 motion-reduce:animate-none ${loading ? "opacity-60 transition-opacity" : ""}`}>
              {alerts.length === 0 ? (
                <EmptyState icon={CheckCircle} title="No matching alerts" description="Try another filter or program." className="rounded-xl border border-[#D5E2EA] bg-white" />
              ) : (
                alerts.map((alert) => {
                  const destination = alertDestination(alert);
                  const resolved = alert.status === "RESOLVED";
                  const critical = alert.severity === "CRITICAL";
                  const warning = ["HIGH", "MEDIUM"].includes(alert.severity);
                  const Icon = resolved ? CheckCircle : critical ? AlertTriangle : warning ? AlertCircle : Info;
                  return (
                    <article
                      key={alert.alert_id}
                      className={`rounded-xl border p-4 ${resolved ? "border-[#D5E2EA] bg-[#F9FBFC]" : critical ? "border-[#F5C2C2] bg-[#FFF5F5]" : warning ? "border-[#F3D9A4] bg-[#FFFBF0]" : "border-[#BFE0EC] bg-[#F2FAFD]"}`}
                    >
                      <div className="flex gap-4">
                        <Icon
                          size={22}
                          aria-hidden="true"
                          className={`mt-0.5 shrink-0 ${resolved ? "text-[#17694C]" : critical ? "text-[#C42B2B]" : warning ? "text-[#92610E]" : "text-[#0B759A]"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap justify-between gap-2">
                            <h3 className="font-semibold text-[#0C1260]">
                              {destination.primaryHref ? (
                                <Link
                                  href={destination.primaryHref}
                                  className="rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                  aria-label={`Open related record for ${alert.alert_type.replace(/_/g, " ")}`}
                                >
                                  {alert.alert_type.replace(/_/g, " ")}
                                </Link>
                              ) : (
                                alert.alert_type.replace(/_/g, " ")
                              )}
                            </h3>
                            <span className="text-xs text-[#8896B0]">{formatTime(alert.created_at)}</span>
                          </div>
                          <p className="mt-1 text-sm text-[#55617F]">{alert.alert_message}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <StatusBadge status={severityLabel(alert.severity)} />
                            <StatusBadge status={alert.status} label={titleCase(alert.status)} />
                            <span className="text-[#8896B0]">#{alert.alert_id}</span>
                            {alert.child_id && (
                              <Link href={`/child-profiling/children/${alert.child_id}`} className="font-medium text-[#0B759A] underline-offset-2 hover:underline">
                                View child record
                              </Link>
                            )}
                            {destination.moduleHref && destination.moduleHref !== destination.childHref && (
                              <Link href={destination.moduleHref} className="font-medium text-[#0B759A] underline-offset-2 hover:underline">
                                {destination.moduleLabel}
                              </Link>
                            )}
                            {resolved && alert.resolved_at && (
                              <span className="text-[#55617F]">
                                Resolved {formatTime(alert.resolved_at)} · {alert.resolution_note ? alert.resolution_note : alert.resolved_by === owner ? "by you" : "handler recorded"}
                              </span>
                            )}
                            {alert.recipient_id === owner && !resolved && (
                              <span className="ml-auto flex flex-wrap gap-2">
                                {alert.status === "UNREAD" && (
                                  <Button variant="secondary" size="sm" disabled={reading !== null} onClick={() => void markRead(alert)}>
                                    Mark as read
                                  </Button>
                                )}
                                <Button size="sm" disabled={resolving || reading !== null} onClick={() => { setResolveTarget(alert); setResolutionReviewed(false); }}>
                                  Mark as resolved
                                </Button>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-[#D5E2EA] bg-white">
              <Pagination {...alertPagerProps} label="Alert pages" className="border-t-0" />
            </div>
          </section>
        </div>
      )}
      {data?.canConfigure && tab === "RULES" && (
        <div role="tabpanel" aria-label="Rules and change history">
          <section aria-labelledby="rules-title" className="space-y-4">
            <SectionHeader
              title={<span id="rules-title">Alert rules</span>}
              subtitle="What each evaluator checks, its severity and whether it runs."
              about={<InfoContent
                title="Alert rules"
                description="Clinical criteria (nutrition, vaccination, supplementation) are managed by their evaluators and cannot be edited here."
                sections={[{ label: "Tip", value: "Inventory thresholds are local settings you can adjust with Edit" }]}
                note="Every saved change is recorded in Rule change history below."
              />}
              actions={
                <Button onClick={() => { setDraft(fresh()); setReview(false); setError(""); }}>
                  <Plus size={17} aria-hidden="true" /> Add inventory rule
                </Button>
              }
            />
            <GridTable
              caption="Alert rules"
              rows={data.rules}
              rowKey={(rule) => rule.rule_id}
              minWidth={900}
              empty={{ icon: ListChecks, title: "No alert rules", description: "Add an inventory rule to start." }}
              columns={[
                { key: "rule", header: "Rule", width: "25%", cell: (rule) => <><span className="block break-words font-semibold text-[#0C1260]">{rule.rule_name.replace(/_/g, " ")}</span><span className="block text-xs text-[#8896B0]">#{rule.rule_id}</span></> },
                { key: "program", header: "Program", width: "18%", cell: (rule) => <><span className="block">{titleCase(rule.rule_category)}</span><span className="block text-xs text-[#8896B0]">{rule.evaluator_type.replace(/_/g, " ").toLowerCase()}</span></> },
                { key: "condition", header: "Condition", width: "27%", cell: (rule) => <span className="block break-words">{conditionLabel(rule)}</span> },
                { key: "severity", header: "Severity", width: "10%", cell: (rule) => <StatusBadge status={rule.severity} tone={RULE_SEVERITY_TONE[rule.severity] ?? "neutral"} label={titleCase(rule.severity)} /> },
                { key: "status", header: "Status", width: "10%", cell: (rule) => <StatusBadge status={rule.status} label={titleCase(rule.status)} /> },
                {
                  key: "actions", header: "Actions", width: "10%", sticky: true,
                  cell: (rule) => ["EXTERNAL", "HEALTH_ACTIVITY_ACTION"].includes(rule.evaluator_type)
                    ? <span className="text-xs text-[#8896B0]">Managed</span>
                    : <RowButton aria-label={`Edit ${rule.rule_name}`} onClick={() => editRule(rule)}>Edit</RowButton>,
                },
              ]}
            />
          </section>
          <section aria-labelledby="history-title" className="mt-10 space-y-4 border-t-2 border-[#EAF0F4] pt-8">
            <SectionHeader
              title={<span id="history-title">Rule change history</span>}
              subtitle="Latest 50 rule changes. Changes made before installation are not backfilled."
            />
            <GridTable
              caption="Rule change history"
              rows={data.audit}
              rowKey={(entry) => entry.audit_id}
              pageSize={5}
              minWidth={860}
              empty={{ icon: History, title: "No rule changes recorded yet", description: "Edits to alert rules will be logged here." }}
              columns={[
                { key: "date", header: "Date", width: "20%", cell: (entry) => formatTime(entry.changed_at) },
                { key: "rule", header: "Rule", width: "20%", cell: (entry) => <span className="block break-words font-semibold text-[#0C1260]">{String(entry.new_values.rule_name ?? entry.rule_id).replace(/_/g, " ")}</span> },
                { key: "action", header: "Action", width: "15%", cell: (entry) => titleCase(entry.action) },
                { key: "admin", header: "Administrator", width: "20%", cell: (entry) => <span className="font-mono text-xs text-[#55617F]" title={entry.actor_id}>{entry.actor_id.slice(0, 8)}</span> },
                {
                  key: "changes", header: "Changes", width: "25%",
                  cell: (entry) => (
                    <details>
                      <summary className="cursor-pointer text-[13px] font-medium text-[#0B759A] hover:underline">View saved changes</summary>
                      <pre className="mt-2 max-w-lg overflow-auto whitespace-pre-wrap rounded-lg bg-[#F0F2F5] p-2 text-xs text-[#0C1260]">
                        {JSON.stringify({ before: entry.old_values, after: entry.new_values }, null, 2)}
                      </pre>
                    </details>
                  ),
                },
              ]}
            />
          </section>
        </div>
      )}
      </TabPanel>
      {resolveTarget && resolveTarget.recipient_id === owner && (
        <Modal
          open
          size="sm"
          onClose={() => setResolveTarget(null)}
          busy={resolving}
          title="Resolve assigned alert"
          subtitle={resolveTarget.alert_message}
          bodyClassName="space-y-4"
          footer={<Button disabled={!resolutionReviewed} loading={resolving} onClick={() => void resolveAlert()}>{resolving ? "Resolving…" : "Confirm resolution"}</Button>}
        >
            <label className="flex items-start gap-2 text-sm text-[#1E2A55]">
              <input
                type="checkbox"
                checked={resolutionReviewed}
                disabled={resolving}
                onChange={(event) =>
                  setResolutionReviewed(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                I reviewed the linked record and completed the required
                follow-up. My account and the resolution time will be recorded.
              </span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-[#C42B2B]">
                {error}
              </p>
            )}
        </Modal>
      )}
      {draft && data?.canConfigure && (
        <Modal
          open
          size="form"
          onClose={() => { setDraft(null); setReview(false); }}
          busy={saving}
          title={review ? "Confirm rule changes" : draft.ruleId ? "Edit alert rule" : "Add inventory rule"}
          onSubmit={(event) => {
            event.preventDefault();
            if (review) void saveRule();
            else if (checkDraft()) setReview(true);
          }}
          footer={review ? (
            <>
              <Button variant="secondary" disabled={saving} onClick={() => setReview(false)}>Back to edit</Button>
              <Button type="submit" loading={saving}>{saving ? "Saving…" : "Confirm and save"}</Button>
            </>
          ) : <Button type="submit">Review changes</Button>}
        >
            {error && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-[#FFF5F5] p-3 text-sm text-[#C42B2B]"
              >
                {error}
              </p>
            )}
            {review ? (
              <>
                <dl className="space-y-2 rounded-[10px] border border-[#EAF0F4] bg-[#F9FBFC] p-4 text-sm">
                  <div>
                    <dt className="font-semibold">Rule</dt>
                    <dd>{draft.ruleName}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Severity / status</dt>
                    <dd>
                      {draft.severity} / {draft.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Description</dt>
                    <dd>{draft.description || "—"}</dd>
                  </div>
                  {parameterKey(draft.evaluatorType) && (
                    <div>
                      <dt className="font-semibold">Parameter</dt>
                      <dd>
                        {parameterKey(draft.evaluatorType)}: {draft.parameter}
                      </dd>
                    </div>
                  )}
                  {draft.messageTemplate && (
                    <div>
                      <dt className="font-semibold">Message template</dt>
                      <dd>{draft.messageTemplate}</dd>
                    </div>
                  )}
                </dl>
                <p className="mt-4 text-sm text-muted-foreground">
                  Saving creates an audit entry. Changes apply on the next
                  evaluation. Deactivation stops future generation; an inventory
                  monitor may resolve reminders whose conditions are no longer
                  active.
                </p>
              </>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm font-medium">
                  Rule name
                  <input
                    required
                    readOnly={draft.ruleId !== null}
                    maxLength={80}
                    value={draft.ruleName}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        ruleName: event.target.value.toUpperCase(),
                      })
                    }
                    className={inputClass}
                  />
                </label>
                {draft.ruleId === null && (
                  <label className="block text-sm font-medium">
                    Evaluator
                    <Select
                      value={draft.evaluatorType}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          evaluatorType: event.target.value,
                          parameter:
                            event.target.value === "INVENTORY_LOW_STOCK"
                              ? "10"
                              : "30",
                        })
                      }
                     
                    >
                      <option value="INVENTORY_LOW_STOCK">Low stock</option>
                      <option value="INVENTORY_NEAR_EXPIRY">
                        Near expiry / expired batch
                      </option>
                    </Select>
                  </label>
                )}
                <label className="block text-sm font-medium">
                  Description
                  <textarea
                    maxLength={2000}
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                    className={inputClass}
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    Nutrition risk alerts include this text. Other evaluators
                    generate their own message.
                  </span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Severity
                    <Select
                      value={draft.severity}
                      onChange={(event) =>
                        setDraft({ ...draft, severity: event.target.value })
                      }
                     
                    >
                      {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-sm font-medium">
                    Status
                    <Select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft({ ...draft, status: event.target.value })
                      }
                     
                    >
                      <option>ACTIVE</option>
                      <option>INACTIVE</option>
                    </Select>
                  </label>
                </div>
                {parameterKey(draft.evaluatorType) ? (
                  <label className="block text-sm font-medium">
                    {draft.evaluatorType === "INVENTORY_LOW_STOCK"
                      ? "Low-stock threshold (item stock units)"
                      : draft.evaluatorType === "INVENTORY_NEAR_EXPIRY"
                        ? "Days before expiry"
                        : "Days before health activity"}
                    <input
                      required
                      type="number"
                      min={0}
                      max={
                        draft.evaluatorType === "INVENTORY_LOW_STOCK"
                          ? 1000000000
                          : 365
                      }
                      step={
                        draft.evaluatorType === "INVENTORY_LOW_STOCK"
                          ? "any"
                          : 1
                      }
                      value={draft.parameter}
                      onChange={(event) =>
                        setDraft({ ...draft, parameter: event.target.value })
                      }
                      className={inputClass}
                    />
                  </label>
                ) : (
                  <p className="rounded-lg bg-muted p-3 text-sm">
                    Conditions are maintained by the corresponding program
                    evaluator and cannot be edited here.
                  </p>
                )}
                {draft.evaluatorType.startsWith("INVENTORY_") && (
                  <label className="block text-sm font-medium">
                    Message template (optional)
                    <textarea
                      maxLength={2000}
                      value={draft.messageTemplate}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          messageTemplate: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                    <span className="text-xs font-normal text-muted-foreground">
                      Leave blank for the generated message. Placeholders:{" "}
                      {
                        "{item}, {barangay}, {quantity}, {unit}, {threshold}, {batch}, {expiry}, {days}"
                      }
                      .
                    </span>
                  </label>
                )}
              </div>
            )}
        </Modal>
      )}
    </div>
  );
}
