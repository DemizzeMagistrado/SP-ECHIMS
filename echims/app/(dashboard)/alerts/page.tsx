"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  X,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { alertDestination } from "@/lib/alerts/alert-destination";
import { SmsSimulationPanel } from "@/components/alerts/sms-simulation-panel";
import { createClient } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
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
    <section
      aria-label="Evaluation monitoring"
      className="rounded-2xl border border-border bg-white p-5"
    >
      <h2 className="font-semibold text-foreground">Evaluation monitoring</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Latest recorded run for each hourly evaluator. Use Refresh to check for
        updates.
      </p>
      {monitoring?.error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {monitoring.error}
        </p>
      ) : !monitoring ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Monitoring is unavailable. Update the Alerts API.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {modules.map(({ code, label }) => {
            const run = monitoring.runs.find((item) => item.module === code);
            const color =
              run?.status === "FAILED"
                ? "bg-red-100 text-red-800"
                : run?.status === "SUCCEEDED"
                  ? "bg-teal-100 text-teal-800"
                  : run?.status === "RUNNING"
                    ? "bg-sky-100 text-sky-800"
                    : "bg-muted text-muted-foreground";
            const status =
              run?.status === "SUCCEEDED"
                ? "Succeeded"
                : run?.status === "FAILED"
                  ? "Failed"
                  : run?.status === "RUNNING"
                    ? "Running"
                    : "Not yet run";
            return (
              <div key={code} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}
                  >
                    {status}
                  </span>
                </div>
                {run ? (
                  <>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Started · Manila time
                        </dt>
                        <dd>{formatTime(run.started_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Completed · Manila time
                        </dt>
                        <dd>
                          {run.completed_at
                            ? formatTime(run.completed_at)
                            : "Not recorded"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Alerts created
                        </dt>
                        <dd>{run.alerts_created ?? "Unavailable"}</dd>
                      </div>
                    </dl>
                    {run.status === "FAILED" && (
                      <p className="mt-3 break-words rounded-lg bg-red-50 p-3 text-xs text-red-800">
                        {run.error_message ?? "Evaluation failed."}
                        {run.error_code ? ` (${run.error_code})` : ""}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No evaluation log has been recorded.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Nutrition is evaluated when assessments are saved; it is not included in
        these scheduled run logs. A successful run with zero new alerts is
        valid.
      </p>
    </section>
  );
}
export default function AlertsPage() {
  const client = useMemo(() => createClient(), []);
  const [owner, setOwner] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<
    "ALERTS" | "RULES" | "AUDIT" | "MONITORING" | "SMS"
  >("ALERTS");
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
  useEffect(() => {
    const { data: subscription } = client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const next = session?.user.id ?? null;
        if (next !== ownerRef.current) {
          sequence.current++;
          ownerRef.current = next;
          setData(null);
          setDraft(null);
          setResolveTarget(null);
          setResolutionReviewed(false);
          setTab("ALERTS");
          setPage(1);
          setError("");
          setNotice("");
          setOwner(next);
        }
        setAuthReady(true);
      },
    );
    return () => {
      sequence.current++;
      subscription.subscription.unsubscribe();
    };
  }, [client]);
  const load = useCallback(async () => {
    if (!owner) return;
    const token = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const body: Data = await jsonResponse(
        await fetch(`/api/alerts?page=${page}`, { cache: "no-store" }),
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
  }, [owner, page]);
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
  const alerts = (data?.alerts ?? []).filter(
    (alert) =>
      (program === "ALL" ||
        (alert.source_module ?? alert.alert_type) === program) &&
      (filter === "all" ||
        (filter === "unresolved" && alert.status !== "RESOLVED") ||
        (filter === "critical" &&
          alert.severity === "CRITICAL" &&
          alert.status !== "RESOLVED") ||
        (filter === "warning" &&
          ["HIGH", "MEDIUM"].includes(alert.severity) &&
          alert.status !== "RESOLVED") ||
        (filter === "info" && alert.severity === "LOW") ||
        (filter === "resolved" && alert.status === "RESOLVED")),
  );
  const programs = [
    ...new Set(
      (data?.alerts ?? []).map(
        (alert) => alert.source_module ?? alert.alert_type,
      ),
    ),
  ].sort();
  const summary = data?.summary;
  const inputClass =
    "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-6">
      {data?.canConfigure && (
        <div
          className="flex flex-wrap gap-2 border-b border-border pb-3"
          role="tablist"
          aria-label="Alert sections"
        >
          {(
            [
              { value: "ALERTS", label: "Alerts" },
              { value: "RULES", label: "Rules" },
              { value: "AUDIT", label: "Rule change history" },
              { value: "MONITORING", label: "Evaluation monitoring" },
              { value: "SMS", label: "SMS Overview" },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === item.value
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Alert Management
          </h1>
          <p className="mt-1 text-muted-foreground">
            Monitor system alerts and configure supported evaluation rules
          </p>
        </div>
        <button
          type="button"
          disabled={loading || !owner}
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 disabled:opacity-50"
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800"
        >
          {notice}
        </p>
      )}
      {!authReady || loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !owner ? (
        <p>Please sign in to access alerts.</p>
      ) : null}
      {data?.canConfigure && tab === "MONITORING" && (
        <div role="tabpanel" aria-label="Evaluation monitoring">
          <EvaluationMonitoring monitoring={data.monitoring} />
        </div>
      )}
      {data?.canConfigure && tab === "SMS" && (
        <div role="tabpanel" aria-label="SMS Overview">
          <SmsSimulationPanel
            key={data.currentUserId}
            ownerId={data.currentUserId}
          />
        </div>
      )}
      {data && tab === "ALERTS" && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[
              ["Total Alerts", summary?.total, "text-foreground"],
              ["Critical", summary?.critical, "text-destructive"],
              ["Warning", summary?.warning, "text-orange-500"],
              ["Resolved", summary?.resolved, "text-teal-600"],
            ].map(([label, count, color]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-border bg-white p-6"
              >
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className={`mt-2 text-3xl font-bold ${color}`}>
                  {count ?? 0}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              "all",
              "unresolved",
              "critical",
              "warning",
              "info",
              "resolved",
            ].map((button) => (
              <button
                key={button}
                type="button"
                onClick={() => setFilter(button)}
                className={`rounded-lg px-4 py-2 font-medium capitalize ${filter === button ? "bg-primary text-white" : "border border-border bg-white text-foreground hover:bg-muted"}`}
              >
                {button}
              </button>
            ))}
            <select
              aria-label="Filter by program"
              value={program}
              onChange={(event) => setProgram(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2"
            >
              <option value="ALL">All programs</option>
              {programs.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Cards count all alerts you can access. Filters apply to the current
            page of 50 alerts. High and medium severity appear under Warning.
          </p>
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white p-10 text-center">
                <CheckCircle size={40} className="mx-auto mb-3 text-teal-600" />
                <h3 className="font-semibold">
                  No matching alerts on this page
                </h3>
              </div>
            ) : (
              alerts.map((alert) => {
                const destination = alertDestination(alert);
                const resolved = alert.status === "RESOLVED";
                const critical = alert.severity === "CRITICAL";
                const warning = ["HIGH", "MEDIUM"].includes(alert.severity);
                const Icon = resolved
                  ? CheckCircle
                  : critical
                    ? AlertTriangle
                    : warning
                      ? AlertCircle
                      : Info;
                return (
                  <div
                    key={alert.alert_id}
                    className={`rounded-2xl border p-4 ${resolved ? "border-border bg-muted" : critical ? "border-red-200 bg-red-50" : warning ? "border-orange-200 bg-orange-50" : "border-blue-200 bg-blue-50"}`}
                  >
                    <div className="flex gap-4">
                      <Icon
                        size={24}
                        className={`mt-1 shrink-0 ${resolved ? "text-teal-600" : critical ? "text-destructive" : warning ? "text-orange-500" : "text-secondary"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap justify-between gap-2">
                          <h3 className="font-semibold">
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
                          <span className="text-xs text-muted-foreground">
                            {formatTime(alert.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {alert.alert_message}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                          <span>
                            {alert.severity} · {alert.status} · #
                            {alert.alert_id}
                          </span>
                          {alert.child_id && (
                            <Link
                              href={`/child-profiling/children/${alert.child_id}`}
                              className="font-medium text-primary underline"
                            >
                              View child record
                            </Link>
                          )}
                          {destination.moduleHref &&
                            destination.moduleHref !==
                              destination.childHref && (
                              <Link
                                href={destination.moduleHref}
                                className="font-medium text-primary underline"
                              >
                                {destination.moduleLabel}
                              </Link>
                            )}
                          {alert.recipient_id === owner &&
                            alert.status === "UNREAD" && (
                              <button
                                type="button"
                                disabled={reading !== null}
                                onClick={() => void markRead(alert)}
                                className="rounded-lg border border-border bg-white px-3 py-1.5 disabled:opacity-50"
                              >
                                Mark as read
                              </button>
                            )}
                          {alert.recipient_id === owner &&
                            alert.status !== "RESOLVED" && (
                              <button
                                type="button"
                                disabled={resolving || reading !== null}
                                onClick={() => {
                                  setResolveTarget(alert);
                                  setResolutionReviewed(false);
                                }}
                                className="rounded-lg bg-primary px-3 py-1.5 text-white disabled:opacity-50"
                              >
                                Mark as Resolved
                              </button>
                            )}
                          {alert.status === "RESOLVED" && alert.resolved_at && (
                            <span className="text-muted-foreground">
                              Resolved {formatTime(alert.resolved_at)} ·{" "}
                              {alert.resolved_by === owner
                                ? "by you"
                                : "handler recorded"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={page === 1 || loading}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border bg-white px-4 py-2 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm">
              Page {page} of{" "}
              {Math.max(1, Math.ceil((summary?.total ?? 0) / 50))}
            </span>
            <button
              type="button"
              disabled={page * 50 >= (summary?.total ?? 0) || loading}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border bg-white px-4 py-2 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
      {data?.canConfigure && tab === "RULES" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Clinical criteria and saved protocol intervals are maintained by
              their evaluators. Inventory thresholds are local settings.
            </p>
            <button
              type="button"
              onClick={() => {
                setDraft(fresh());
                setReview(false);
                setError("");
              }}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white"
            >
              <Plus size={18} />
              Add inventory rule
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {[
                    "Rule",
                    "Program / evaluator",
                    "Condition",
                    "Severity",
                    "Status",
                    "Action",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rules.map((rule) => (
                  <tr key={rule.rule_id}>
                    <td className="px-4 py-4 font-medium">
                      #{rule.rule_id} {rule.rule_name}
                    </td>
                    <td className="px-4 py-4">
                      {rule.rule_category}
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {rule.evaluator_type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="max-w-md px-4 py-4">
                      <p className="break-words">{conditionLabel(rule)}</p>
                    </td>
                    <td className="px-4 py-4">{rule.severity}</td>
                    <td className="px-4 py-4">{rule.status}</td>
                    <td className="px-4 py-4">
                      {["EXTERNAL", "HEALTH_ACTIVITY_ACTION"].includes(
                        rule.evaluator_type,
                      ) ? (
                        <span className="text-xs text-muted-foreground">
                          Managed by existing module
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => editRule(rule)}
                          className="flex items-center gap-1 font-medium text-primary"
                        >
                          <Settings size={16} />
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data?.canConfigure && tab === "AUDIT" && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <p className="border-b p-4 text-sm text-muted-foreground">
            Latest 50 rule changes. Changes made before installation are not
            backfilled.
          </p>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                {["Date", "Rule", "Action", "Administrator ID", "Changes"].map(
                  (label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.audit.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No rule changes recorded yet.
                  </td>
                </tr>
              ) : (
                data.audit.map((entry) => (
                  <tr key={entry.audit_id}>
                    <td className="px-4 py-3">
                      {formatTime(entry.changed_at)}
                    </td>
                    <td className="px-4 py-3">
                      {String(entry.new_values.rule_name ?? entry.rule_id)}
                    </td>
                    <td className="px-4 py-3">{entry.action}</td>
                    <td className="px-4 py-3 text-xs">{entry.actor_id}</td>
                    <td className="px-4 py-3">
                      <details>
                        <summary className="cursor-pointer text-primary">
                          View saved changes
                        </summary>
                        <pre className="mt-2 max-w-lg overflow-auto whitespace-pre-wrap text-xs">
                          {JSON.stringify(
                            {
                              before: entry.old_values,
                              after: entry.new_values,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {resolveTarget && resolveTarget.recipient_id === owner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolve-alert-title"
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="resolve-alert-title" className="font-semibold">
              Resolve assigned alert
            </h2>
            <p className="text-sm text-muted-foreground">
              {resolveTarget.alert_message}
            </p>
            <label className="flex items-start gap-2 text-sm">
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
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={resolving}
                onClick={() => setResolveTarget(null)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!resolutionReviewed || resolving}
                onClick={() => void resolveAlert()}
                className="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {resolving ? "Resolving…" : "Confirm Resolution"}
              </button>
            </div>
          </section>
        </div>
      )}
      {draft && data?.canConfigure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rule-dialog-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6"
          >
            <div className="mb-5 flex justify-between gap-3">
              <h2 id="rule-dialog-title" className="text-xl font-bold">
                {review
                  ? "Confirm rule changes"
                  : draft.ruleId
                    ? "Edit alert rule"
                    : "Add inventory rule"}
              </h2>
              <button
                type="button"
                aria-label="Close rule form"
                disabled={saving}
                onClick={() => {
                  setDraft(null);
                  setReview(false);
                }}
              >
                <X />
              </button>
            </div>
            {error && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
            {review ? (
              <>
                <dl className="space-y-2 rounded-xl bg-muted p-4 text-sm">
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
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setReview(false)}
                    className="rounded-lg border px-4 py-2"
                  >
                    Back to edit
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveRule()}
                    className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Confirm and save"}
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (checkDraft()) setReview(true);
                }}
                className="space-y-4"
              >
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
                    <select
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
                      className={inputClass}
                    >
                      <option value="INVENTORY_LOW_STOCK">Low stock</option>
                      <option value="INVENTORY_NEAR_EXPIRY">
                        Near expiry / expired batch
                      </option>
                    </select>
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
                    <select
                      value={draft.severity}
                      onChange={(event) =>
                        setDraft({ ...draft, severity: event.target.value })
                      }
                      className={inputClass}
                    >
                      {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Status
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft({ ...draft, status: event.target.value })
                      }
                      className={inputClass}
                    >
                      <option>ACTIVE</option>
                      <option>INACTIVE</option>
                    </select>
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
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="rounded-lg border px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-4 py-2 text-white"
                  >
                    Review changes
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
