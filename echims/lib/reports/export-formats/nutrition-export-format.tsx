import { reportScopeLabel } from "@/lib/reports/report-scope-label";
const Link = ({
  children,
}: {
  children?: import("react").ReactNode;
  [key: string]: unknown;
}) => <span>{children}</span>;
const Printer = (_props: { size?: number }) => null;
import type { ReportRow } from "@/lib/reports/report-utils";
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
function one<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
function childName(child: Child | null) {
  if (!child) return "Child name unavailable";
  return child.last_name
    ? `${child.last_name}, ${[child.first_name, child.middle_name].filter(Boolean).join(" ")}`
    : child.first_name;
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
function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
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
  if (!guardian) return "Not recorded";
  const first = [guardian.first_name, guardian.middle_name]
    .filter(Boolean)
    .join(" ");
  return guardian.last_name
    ? `${guardian.last_name}, ${first}`
    : first || "Not recorded";
}
function childRecordUrl(childId: number) {
  return `/child-profiling/children/${childId}`;
}
type IndicatorField = "weight_for_age" | "height_for_age" | "weight_for_height";
type ListCode = "UW" | "SUW" | "St" | "SSt" | "W" | "SW";
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
export function SummaryReport({
  records,
  year,
  barangay,
  onList,
}: {
  records: Assessment[];
  year: string;
  barangay: string;
  onList: (code: ListCode) => void;
}) {
  const eligible = records.filter(eligibleForReport);
  const underTwo = inAgeBand(eligible, 0, 23);
  const denominators = (field: IndicatorField) =>
    eligible.filter((item) => validIndicator(item, field));
  const cell = "border border-border px-3 py-2 text-center text-xs";
  const summary = [
    ["Children assessed, 0–59 months", eligible.length],
    [
      "Children with UW/SUW, St/SSt or W/SW (unique children)",
      eligible.filter(undernourished).length,
    ],
    [
      "Children with overweight/obesity (WFL/H)",
      eligible.filter(overnourished).length,
    ],
    ["Children assessed, 0–23 months", underTwo.length],
    [
      "Children 0–23 months with UW/St/W classifications",
      underTwo.filter(undernourished).length,
    ],
    [
      "Linked mothers/caregivers of assessed children",
      caregiverCount(eligible),
    ],
    [
      "Linked mothers/caregivers of children with UW/St/W classifications",
      caregiverCount(eligible.filter(undernourished)),
    ],
    [
      "Linked mothers/caregivers of children with overweight/obesity",
      caregiverCount(eligible.filter(overnourished)),
    ],
    [
      "Linked mothers/caregivers of children 0–23 months",
      caregiverCount(underTwo),
    ],
    [
      "Children without a linked caregiver ID",
      eligible.filter(
        (item) => one(one(item.child)?.guardian ?? null)?.guardian_id == null,
      ).length,
    ],
    [
      "WFA unavailable / not verified",
      eligible.length - denominators("weight_for_age").length,
    ],
    [
      "HFA unavailable / not verified",
      eligible.length - denominators("height_for_age").length,
    ],
    [
      "WFL/H unavailable / not verified",
      eligible.length - denominators("weight_for_height").length,
    ],
    [
      "Excluded: age unavailable or outside 0–59 months",
      records.length - eligible.length,
    ],
    [
      "Sex unavailable (included in totals only)",
      eligible.filter(
        (item) => !["MALE", "FEMALE"].includes(assessmentSex(item) ?? ""),
      ).length,
    ],
    [
      "IP children (current profile)",
      eligible.filter((item) => ipMembership(item.profile?.ethnicity) === "Yes")
        .length,
    ],
    [
      "IP membership not confirmed",
      eligible.filter(
        (item) => ipMembership(item.profile?.ethnicity) === "Not confirmed",
      ).length,
    ],
  ];
  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-white p-5"
      aria-label="OPT Plus summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            Nutritional Assessment {year} — Summary
          </h2>
          <p className="text-sm text-muted-foreground">{barangay}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="nutrition-no-print flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <Printer size={16} />
          Print summary
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            "weight_for_age",
            "height_for_age",
            "weight_for_height",
          ] as IndicatorField[]
        ).map((field) => (
          <div key={field} className="rounded-lg bg-sky-50 p-3 text-sm">
            <p>
              {field === "weight_for_age"
                ? "Total valid WFA"
                : field === "height_for_age"
                  ? "Total valid HFA"
                  : "Total valid WFL/H"}
            </p>
            <strong className="text-xl">{denominators(field).length}</strong>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Nutrition classifications by age, sex, prevalence and IP membership
          </caption>
          <thead>
            <tr className="bg-sky-50">
              <th rowSpan={2} className={cell}>
                Classification
              </th>
              {ageBands.map((band) => (
                <th key={band.label} colSpan={3} className={cell}>
                  {band.label}
                </th>
              ))}
              <th colSpan={2} className={cell}>
                0–59 months
              </th>
              <th colSpan={2} className={cell}>
                F1K: 0–23 months
              </th>
              <th colSpan={3} className={cell}>
                IP children
              </th>
            </tr>
            <tr className="bg-muted">
              {ageBands.flatMap((band) =>
                ["Boys", "Girls", "Total"].map((heading) => (
                  <th key={`${band.label}-${heading}`} className={cell}>
                    {heading}
                  </th>
                )),
              )}
              {[
                "Total",
                "Prevalence",
                "F1K total",
                "F1K prevalence",
                "IP boys",
                "IP girls",
                "IP total",
              ].map((heading) => (
                <th key={heading} className={cell}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => {
              const matching = eligible.filter(
                (item) =>
                  validIndicator(item, row.field) &&
                  item[row.field] === row.value,
              );
              const f1k = inAgeBand(matching, 0, 23);
              const ip = sexCounts(
                matching.filter(
                  (item) => ipMembership(item.profile?.ethnicity) === "Yes",
                ),
              );
              return (
                <tr key={row.title}>
                  <th
                    scope="row"
                    className={`${cell} whitespace-nowrap text-left`}
                  >
                    {row.list ? (
                      <button
                        type="button"
                        onClick={() => onList(row.list!)}
                        className="font-medium text-primary underline"
                      >
                        {row.title}
                      </button>
                    ) : (
                      row.title
                    )}
                  </th>
                  {ageBands.flatMap((band) => {
                    const count = sexCounts(
                      inAgeBand(matching, band.min, band.max),
                    );
                    return [count.boys, count.girls, count.total].map(
                      (n, index) => (
                        <td key={`${band.label}-${index}`} className={cell}>
                          {n}
                        </td>
                      ),
                    );
                  })}
                  <td className={cell}>{matching.length}</td>
                  <td className={cell}>
                    {prevalence(
                      matching.length,
                      denominators(row.field).length,
                    )}
                  </td>
                  <td className={cell}>{f1k.length}</td>
                  <td className={cell}>
                    {prevalence(
                      f1k.length,
                      inAgeBand(denominators(row.field), 0, 23).length,
                    )}
                  </td>
                  <td className={cell}>{ip.boys}</td>
                  <td className={cell}>{ip.girls}</td>
                  <td className={cell}>{ip.total}</td>
                </tr>
              );
            })}
            <tr className="bg-slate-800 font-bold text-white">
              <th scope="row" className={`${cell} text-left`}>
                Children assessed
              </th>
              {ageBands.flatMap((band) => {
                const c = sexCounts(inAgeBand(eligible, band.min, band.max));
                return [c.boys, c.girls, c.total].map((n, index) => (
                  <td key={`${band.label}-${index}`} className={cell}>
                    {n}
                  </td>
                ));
              })}
              <td className={cell}>{eligible.length}</td>
              <td className={cell}>—</td>
              <td className={cell}>{underTwo.length}</td>
              <td className={cell}>—</td>
              {(() => {
                const c = sexCounts(
                  eligible.filter(
                    (item) => ipMembership(item.profile?.ethnicity) === "Yes",
                  ),
                );
                return [c.boys, c.girls, c.total].map((n, index) => (
                  <td key={index} className={cell}>
                    {n}
                  </td>
                ));
              })()}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        One latest assessment per child in the saved report period and barangay
        scope. Prevalence uses the number with a valid classification for that
        indicator; missing, implausible, edema-affected and legacy results are
        excluded from its denominator. The six classifications remain separate.
        Profile, IP membership and caregiver links are captured in the report
        snapshot.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {summary.map(([name, value]) => (
          <div
            key={name}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span>{name}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Total barangay population and estimated child population are unavailable
        in the supplied database. Caregivers are counted by linked guardian ID,
        not by name. WFA does not define overweight and HFA does not define
        tallness in the installed engine, so those sample rows are not
        fabricated.
      </p>
    </section>
  );
}
export function ClassificationList({
  records,
  code,
  year,
  barangay,
  onScores,
}: {
  records: Assessment[];
  code: ListCode;
  year: string;
  barangay: string;
  onScores: (item: Assessment) => void;
}) {
  const definition = listDefinitions[code];
  const items = listRecords(records, code);
  const heightIndicator = definition.field === "height_for_age";
  const cell = "border border-border px-4 py-3 text-left text-sm";
  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-white p-5"
      aria-label={`List ${code}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            List {code} — {definition.title} children, 0–59 months
          </h2>
          <p className="text-sm text-muted-foreground">
            {barangay} · {year} · {items.length} children
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="nutrition-no-print flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <Printer size={16} />
          Print list
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-muted">
            <tr>
              {[
                "Child ID",
                "Address / location",
                "Mother / caregiver",
                "Full name of child",
                "Sex",
                "Age (months)",
                "Classification",
                "Weight (kg)",
                "Length/height (cm)",
                "Date measured",
              ].map((name) => (
                <th key={name} rowSpan={2} className={cell}>
                  {name}
                </th>
              ))}
              <th colSpan={4} className={cell}>
                Date of follow-up
              </th>
              <th rowSpan={2} className={`${cell} nutrition-no-print`}>
                Actions
              </th>
            </tr>
            <tr>
              {[1, 2, 3, 4].map((n) => (
                <th key={n} className={cell}>
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.child_id}>
                <td className={cell}>CH-{item.child_id}</td>
                <td className={cell}>
                  {one(item.child)
                    ? residentLocation(one(item.child)!) || "Not recorded"
                    : "Not recorded"}
                </td>
                <td className={cell}>{caregiverName(one(item.child))}</td>
                <td className={cell}>{childName(one(item.child))}</td>
                <td className={cell}>
                  {assessmentSex(item) === "MALE"
                    ? "M"
                    : assessmentSex(item) === "FEMALE"
                      ? "F"
                      : "—"}
                </td>
                <td className={cell}>{assessmentMonths(item)}</td>
                <td className={cell}>{code}</td>
                <td className={cell}>{quantity(item.weight)}</td>
                <td className={cell}>{quantity(item.height)}</td>
                <td className={`${cell} whitespace-nowrap`}>
                  {item.assessment_date}
                </td>
                {[1, 2, 3, 4].map((n) => (
                  <td
                    key={n}
                    aria-label={`Follow-up ${n}: not recorded`}
                    className={`${cell} min-w-24`}
                  >
                    —
                  </td>
                ))}
                <td className={`${cell} nutrition-no-print`}>
                  <Link
                    href={childRecordUrl(item.child_id)}
                    className="block text-primary underline"
                  >
                    View child record
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={15}
                  className={`${cell} py-8 text-center text-muted-foreground`}
                >
                  No {definition.title.toLowerCase()} children in this scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        This list uses{" "}
        {heightIndicator
          ? "height-for-age"
          : definition.field === "weight_for_age"
            ? "weight-for-age"
            : "weight-for-length/height"}{" "}
        classification, independently of SAM/MAM status. It uses each child’s
        latest assessment in the report period. Follow-up dates have no
        dedicated field in the supplied database; the four columns are blank
        spaces for the printed list.
      </p>
    </section>
  );
}

type Snapshot = {
  rows: ReportRow[];
  start: string;
  end: string;
  location?: {
    barangay_name: string;
    municipality: string;
    province: string;
  }[];
};
type Meta = {
  title: string;
  generatedBy: string;
  generatedAt: string;
  validatedBy?: string | null;
  validatedAt?: string | null;
  status?: string;
  version?: number;
};
function reportRows(rows: ReportRow[]): Assessment[] {
  return rows.map((row) => {
    const embedded =
      row.child && typeof row.child === "object" ? (row.child as Child) : null;
    const child: Child = embedded ?? {
      child_id: Number(row.child_id),
      first_name: String(row.child_name ?? "Child name unavailable"),
      middle_name: null,
      last_name: "",
      date_of_birth: String(row.date_of_birth ?? ""),
      sex: row.sex as "MALE" | "FEMALE",
      barangay_id: Number(row.barangay_id ?? 0),
      barangay: null,
      guardian: row.guardian_id
        ? {
            guardian_id: Number(row.guardian_id),
            first_name: String(row.caregiver_name ?? ""),
            middle_name: null,
            last_name: "",
            relationship_to_child: null,
          }
        : null,
    };
    return { ...row, child, profile: embedded?.profile ?? null } as Assessment;
  });
}
function timestamp(value: string | undefined | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function NutritionReportFormat({
  exportSection,
  exportMode,
  snapshot,
  meta,
}: {
  exportSection: string;
  exportMode?: string;
  snapshot: Snapshot;
  meta: Meta;
}) {
  const tab = exportSection,
    setTab = (_value: unknown) => {};
  const mode = exportMode,
    setMode = (_value: unknown) => {};
  const records = latestPerChild(reportRows(snapshot.rows));
  const scope = reportScopeLabel(snapshot.location);
  const year =
    snapshot.start.slice(0, 4) === snapshot.end.slice(0, 4)
      ? snapshot.start.slice(0, 4)
      : snapshot.start.slice(0, 4) + "–" + snapshot.end.slice(0, 4);
  return (
    <div className="space-y-4">
      <nav
        aria-label="Nutrition report sections"
        className="nutrition-no-print flex flex-wrap gap-2 rounded-lg border bg-white p-3"
      >
        {(["Summary", ...listCodes] as const).map((t) => (
          <button
            type="button"
            key={t}
            aria-pressed={tab === t}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${tab === t ? "border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-200" : "border-transparent text-slate-600 hover:border-sky-100 hover:bg-sky-50 hover:text-sky-800"}`}
            onClick={() => setTab(t)}
          >
            {t === "Summary"
              ? "Overview"
              : "List " + t + " (" + listRecords(records, t).length + ")"}
          </button>
        ))}
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-2 text-sm text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </nav>
      <div className="nutrition-report-output space-y-4">
        <header className="rounded-lg border bg-white p-4">
          <h2 className="font-bold">{meta.title}</h2>
          <p className="text-sm">
            {scope} · {snapshot.start} to {snapshot.end}
          </p>

          <p className="text-xs">
            {meta.status ?? "LIVE PREVIEW — NOT SAVED"}
            {meta.version ? " · Version " + meta.version : ""}
          </p>
        </header>
        {tab === "Summary" && (
          <SummaryReport
            records={records}
            year={year}
            barangay={scope}
            onList={(code) => {
              setTab(code);
            }}
          />
        )}
        {listCodes
          .filter((code) => tab === code)
          .map((code) => (
            <div key={code} className="nutrition-list-page">
              <ClassificationList
                records={records}
                code={code}
                year={year}
                barangay={scope}
                onScores={() => {}}
              />
            </div>
          ))}
        <footer className="grid gap-6 rounded-lg border bg-white p-5 text-sm sm:grid-cols-3">
          <div>
            <p>Reported / Generated by</p>
            <p className="mt-5 font-semibold">{meta.generatedBy}</p>
            <p>Date: {timestamp(meta.generatedAt)}</p>
          </div>
          <div>
            <p>Validated by</p>
            <p className="mt-5 font-semibold">
              {meta.validatedBy ?? "Not validated"}
            </p>
            <p>Date: {meta.validatedAt ? timestamp(meta.validatedAt) : "—"}</p>
          </div>
          <div>
            <p>Noted by</p>
            <p className="mt-5">____________________</p>
            <p>Date signed: __________</p>
          </div>
        </footer>
      </div>
      <style>{`@media print { @page {size:A3 landscape;margin:10mm} body * {visibility:hidden} .nutrition-report-output,.nutrition-report-output * {visibility:visible} .nutrition-report-output {position:absolute;left:0;top:0;width:100%;background:white} .nutrition-no-print {display:none!important} .nutrition-report-output .overflow-x-auto {overflow:visible!important} .nutrition-report-output table {width:100%;font-size:7pt} .nutrition-report-output th,.nutrition-report-output td {padding:3px!important;font-size:7pt} .nutrition-list-page {break-before:auto} .nutrition-report-output thead {display:table-header-group} .nutrition-report-output tr {break-inside:avoid} .nutrition-report-output footer {break-inside:avoid;display:grid;grid-template-columns:repeat(3,1fr)} }`}</style>
    </div>
  );
}
