"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'

// Shared child registration + edit form, as a stepper: Child → Guardian → Household → Review.
// Used by /children (create, and reviewing offline drafts) and /children/[childId] (edit).
// Each step validates before moving on; errors show under the field. Offline, "create" saves a
// local draft that is reviewed and uploaded later (see child-draft-panel.tsx).

import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { Check, X } from "lucide-react";
import { useAuth } from '@/components/auth/auth-provider'
import { offlineScope } from '@/lib/offline/fetch'
import { submitSafeDraft } from '@/lib/offline/safe-submit'
import { saveChildDraft, type ChildRegistrationDraft } from '@/lib/child-registration-drafts'
import { PhilippineAddressPicker } from "@/components/children/philippine-address-picker";
import { Spinner } from '@/components/brand/logo-loader'
import { Button } from '@/components/ui/button'
import { Checkbox, DateInput, Field, Input, Select, Textarea } from '@/components/ui/form'
import { cn } from '@/lib/utils'
import {
  STEPS, classificationForDob, emptyChildForm, options, otherAwareFields, validateStep,
  type ChildForm, type StepKey,
} from '@/lib/children/profile-fields'

type Mode = "create" | "edit";
type Barangay = { barangay_id: number; barangay_name: string };
type Guardian = {
  guardian_id: number; first_name: string; middle_name: string | null; last_name: string;
  relationship_to_child: string | null; contact_number?: string | null; address?: string | null;
};
type Household = { household_id: number; household_no: string | null; household_address: string | null; purok?: string | null };

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load records.");
  return data;
};

const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
const wide = "sm:col-span-2 lg:col-span-3";

export function ChildFormModal({
  mode, childId, onClose, onSaved, onError, draft, onDraftSaved,
}: {
  draft?: ChildRegistrationDraft;
  onDraftSaved?: () => void;
  mode: Mode;
  childId?: number | null;
  onClose: () => void;
  onSaved: () => void;
  onError?: (message: string) => void;
}) {
  const { user } = useAuth()
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine); update()
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  const draftId = useRef(draft?.requestId ?? '')
  const [reviewed, setReviewed] = useState(false)
  const [form, setForm] = useState<ChildForm>({ ...emptyChildForm, ...draft?.form });
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(draft ? STEPS.length - 1 : 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newGuardian, setNewGuardian] = useState(draft?.newGuardian ?? false);
  const [originalGuardianContact, setOriginalGuardianContact] = useState("");
  const [newHousehold, setNewHousehold] = useState(draft?.newHousehold ?? false);
  const [householdQuery, setHouseholdQuery] = useState("");
  const [guardianQuery, setGuardianQuery] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingChild, setLoadingChild] = useState(mode === "edit");
  const body = useRef<HTMLDivElement>(null);

  const { data: barangays } = useSWR<Barangay[]>("/api/barangays", fetcher);
  const { data: householdMatches = [] } = useSWR<Household[]>(
    !newHousehold && form.barangay_id && householdQuery.length > 1
      ? `/api/households?q=${encodeURIComponent(householdQuery)}&barangayId=${form.barangay_id}` : null,
    fetcher,
  );
  const { data: guardianMatches = [] } = useSWR<Guardian[]>(
    !newGuardian && guardianQuery.length > 1 ? `/api/guardians?q=${encodeURIComponent(guardianQuery)}` : null,
    fetcher,
  );

  // Edit mode: hydrate once from the API, including the linked household/guardian search labels.
  useEffect(() => {
    if (mode !== "edit" || !childId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/children?childId=${childId}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Unable to load child record.");
        if (cancelled) return;
        const child = d.child ?? {};
        const guardian = d.guardian ?? null;
        const profile = d.profile ?? {};
        const household = d.household ?? null;
        setHouseholdQuery(household
          ? `${household.household_no ?? `HH-${household.household_id}`}${household.household_address ? ` — ${household.household_address}` : ""}` : "");
        setGuardianQuery(guardian
          ? `${[guardian.first_name, guardian.middle_name, guardian.last_name].filter(Boolean).join(" ")}${guardian.relationship_to_child ? ` (${guardian.relationship_to_child})` : ""}` : "");
        setOriginalGuardianContact(guardian?.contact_number ?? "");
        const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
        setForm({
          ...emptyChildForm,
          first_name: str(child.first_name), middle_name: str(child.middle_name), last_name: str(child.last_name),
          date_of_birth: str(child.date_of_birth),
          sex: child.sex === "MALE" ? "Male" : child.sex === "FEMALE" ? "Female" : "",
          birth_place: str(child.birth_place), address: str(child.address),
          birth_weight_kg: str(child.birth_weight_kg), birth_height_cm: str(child.birth_height_cm),
          mother_name: str(child.mother_name), father_name: str(child.father_name),
          barangay_id: str(child.barangay_id), household_id: str(child.household_id), guardian_id: str(child.guardian_id),
          guardian_contact_number: guardian?.contact_number ?? "",
          relationship_to_household_head: str(profile.relationship_to_household_head),
          civil_status: str(profile.civil_status), educational_attainment: str(profile.educational_attainment),
          religion: str(profile.religion), ethnicity: str(profile.ethnicity),
          philhealth_id_number: str(profile.philhealth_id_number),
          philhealth_membership_type: str(profile.philhealth_membership_type),
          philhealth_category: str(profile.philhealth_category),
          medical_history_notes: str(profile.medical_history),
          last_menstrual_period: str(profile.last_menstrual_period),
          water_source_type: str(profile.water_source_type), toilet_facility_type: str(profile.toilet_facility_type),
          informant_name: str(profile.informant_name), informant_relationship: str(profile.informant_relationship),
        });
      } catch (e) {
        if (!cancelled) setMessage(e instanceof Error ? e.message : "Unable to load child record.");
      } finally {
        if (!cancelled) setLoadingChild(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, childId]);

  const set = (key: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  };
  const str = (key: string) => String(form[key] ?? "");

  const contactChanged = mode === "edit" && Boolean(form.guardian_id) &&
    str("guardian_contact_number").trim() !== originalGuardianContact.trim();
  const ctx = { mode, newGuardian, newHousehold, contactChanged };
  const current: StepKey = STEPS[step].key;

  function goTo(index: number) {
    setStep(index);
    setVisited((v) => Math.max(v, index));
    setMessage("");
    body.current?.scrollTo({ top: 0 });
  }
  function next() {
    const found = validateStep(current, form, ctx);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      setMessage("Check the highlighted fields before continuing.");
      return;
    }
    goTo(step + 1);
  }
  /** Validates every data step; jumps to the first one with problems. */
  function validateAll() {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const found = validateStep(STEPS[i].key, form, ctx);
      if (Object.values(found).some(Boolean)) {
        setErrors(found);
        goTo(i);
        setMessage(`Some ${STEPS[i].title} details need attention.`);
        return false;
      }
    }
    return true;
  }

  function resolveOthers(source: ChildForm) {
    const resolved: Record<string, string> = {};
    for (const field of otherAwareFields) {
      if (source[field] === "Other") resolved[field] = String(source[`${field}_other`] ?? "").trim() || "Other";
    }
    const conditions: string[] = [];
    if (source.has_hypertension) conditions.push("Hypertension");
    if (source.has_diabetes_mellitus) conditions.push("Diabetes Mellitus");
    if (source.has_tuberculosis) conditions.push("Tuberculosis");
    const medicalOther = String(source.medical_history_other ?? "").trim();
    if (source.has_others && medicalOther) conditions.push(medicalOther);
    const notes = String(source.medical_history_notes ?? "").trim();
    resolved.medical_history = [conditions.join("; "), notes].filter(Boolean).join(". ");
    return resolved;
  }

  async function saveLocalDraft() {
    if (saving) return
    setMessage(''); setSaving(true)
    try {
      if (!user) throw new Error('Sign in online once on this device before saving child drafts.')
      if (draft?.status === 'UNCERTAIN') throw new Error('This upload needs to be checked against the server before the draft can be changed.')
      if (!draftId.current) draftId.current = crypto.randomUUID()
      await saveChildDraft({ requestId: draftId.current, ownerId: user.id, scope: offlineScope(user), savedAt: new Date().toISOString(), form: { ...form }, newGuardian, newHousehold, status: 'DRAFT' })
      onDraftSaved?.()
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Device storage is unavailable.'
      setMessage('The draft was not saved on this device. ' + detail); onError?.('Child draft was not saved: ' + detail)
    } finally { setSaving(false) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (current !== "review") { next(); return; }
    if (!validateAll()) return;
    if (mode === 'create' && !navigator.onLine) { await saveLocalDraft(); return }
    setMessage("");
    setSaving(true);
    try {
      const resolved = resolveOthers(form);
      if (mode === 'create' && draft) {
        if (!user) throw new Error('Sign in before uploading this draft.')
        if (draft.status === 'UNCERTAIN') throw new Error('Check the server records for this child before resolving this upload. Do not submit it again.')
        if (!reviewed) throw new Error('Tick the review confirmation before uploading the draft.')
      }
      let r: Response;
      if (mode === "edit" && childId) {
        r = await fetch("/api/children", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            child_id: childId, ...form, ...resolved,
            guardian_contact_number: contactChanged ? str("guardian_contact_number").trim() : undefined,
          }),
        });
      } else {
        const payload = {
          ...form, ...resolved,
          new_household: newHousehold ? {
            household_no: form.household_no, household_address: form.household_address,
            purok: form.purok, is_4ps_member: form.is_4ps_member,
          } : undefined,
          new_guardian: newGuardian ? {
            first_name: form.guardian_first_name, middle_name: form.guardian_middle_name,
            last_name: form.guardian_last_name, contact_number: form.guardian_contact_number,
            address: form.guardian_address, relationship_to_child: form.guardian_relationship_to_child,
          } : undefined,
        };
        if (draft) {
          await submitSafeDraft('CHILD', { ...draft, form: { ...form }, newGuardian, newHousehold }, payload)
          onSaved(); return
        }
        r = await fetch("/api/children", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "The child record was not saved. Check your connection and try again.");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The child record was not saved.";
      setMessage(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loadingChild) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Loading child record" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <div className="w-64 rounded-2xl bg-white p-6 shadow-xl">
          <Spinner showLabel label="Loading child record…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
        </div>
      </div>
    );
  }

  const text = (key: string, label: string, opts: { required?: boolean; type?: string; className?: string; hint?: string; inputMode?: "decimal" | "tel" } = {}) => (
    <Field label={label} required={opts.required} error={errors[key]} hint={opts.hint} className={opts.className}>
      <Input type={opts.type ?? "text"} inputMode={opts.inputMode} value={str(key)} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );
  const choice = (key: string, label: string, opts: { required?: boolean; values?: string[] } = {}) => (
    <Field label={label} required={opts.required} error={errors[key]}>
      <Select value={str(key)} onChange={(e) => set(key, e.target.value)}>
        <option value="">Select</option>
        {(opts.values ?? options[key as keyof typeof options]).map((item) => <option key={item}>{item}</option>)}
      </Select>
      {str(key) === "Other" && (
        <Input aria-label={`${label} (specify)`} value={str(`${key}_other`)} onChange={(e) => set(`${key}_other`, e.target.value)} placeholder="Please specify" />
      )}
    </Field>
  );

  const barangayName = barangays?.find((b) => String(b.barangay_id) === str("barangay_id"))?.barangay_name;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="child-form-title" className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/30 sm:items-center sm:p-4">
      <form onSubmit={submit} noValidate className="flex max-h-dvh w-full max-w-4xl flex-col bg-white shadow-xl sm:max-h-[92dvh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <h2 id="child-form-title" className="font-display text-xl font-bold text-brand-navy">
            {mode === "edit" ? "Edit Child" : draft ? "Review Child Draft" : "Register Child"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X /></button>
        </div>

        <Stepper current={step} visited={visited} onSelect={goTo} />

        <div ref={body} className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {message && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{message}</p>}
          {mode === 'create' && !online && (
            <p className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-warn">
              You are offline. Saving keeps this registration as a draft on this device. Reconnect, reopen it from the drafts list and review it before uploading.
            </p>
          )}

          {current === "child" && (
            <StepSection title="Child Information" subtitle="Details of the child being registered.">
              <div className={grid}>
                {text("first_name", "First name", { required: true })}
                {text("middle_name", "Middle name")}
                {text("last_name", "Last name", { required: true })}
                <Field label="Date of birth" required error={errors.date_of_birth}>
                  <DateInput value={str("date_of_birth")} onChange={(e) => set("date_of_birth", e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                </Field>
                {choice("sex", "Sex", { required: true, values: ["Male", "Female"] })}
                <Field label="Age group">
                  <div className="flex h-10 items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground">
                    {classificationForDob(str("date_of_birth")) || "Enter the date of birth first"}
                  </div>
                </Field>
                {text("birth_weight_kg", "Birth weight (kg)", { type: "number", inputMode: "decimal", hint: "e.g. 3.2" })}
                {text("birth_height_cm", "Birth height (cm)", { type: "number", inputMode: "decimal", hint: "e.g. 49" })}
                <div className={wide}>
                  <PhilippineAddressPicker
                    currentValue={str("birth_place")}
                    onChange={(fullLabel) => { if (fullLabel) set("birth_place", fullLabel); }}
                  />
                </div>
                {choice("relationship_to_household_head", "Relationship to household head")}
                {choice("civil_status", "Civil status")}
                {choice("educational_attainment", "Educational attainment")}
                {choice("religion", "Religion")}
                {choice("ethnicity", "Ethnicity")}
              </div>
              <SubHeading>PhilHealth</SubHeading>
              <div className={grid}>
                {choice("philhealth_membership_type", "Membership type")}
                {text("philhealth_id_number", "PhilHealth ID")}
                {choice("philhealth_category", "Category")}
              </div>
              <SubHeading>Medical history</SubHeading>
              <fieldset className="space-y-3">
                <legend className="sr-only">Medical history</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Checkbox label="Hypertension" checked={Boolean(form.has_hypertension)} onChange={(e) => set("has_hypertension", e.target.checked)} />
                  <Checkbox label="Diabetes Mellitus" checked={Boolean(form.has_diabetes_mellitus)} onChange={(e) => set("has_diabetes_mellitus", e.target.checked)} />
                  <Checkbox label="Tuberculosis" checked={Boolean(form.has_tuberculosis)} onChange={(e) => set("has_tuberculosis", e.target.checked)} />
                  <Checkbox label="Others" checked={Boolean(form.has_others)} onChange={(e) => set("has_others", e.target.checked)} />
                </div>
                {Boolean(form.has_others) && <Input aria-label="Other condition" value={str("medical_history_other")} onChange={(e) => set("medical_history_other", e.target.value)} placeholder="Please specify other condition" />}
                <Field label="Notes" hint="Allergies, past hospitalizations, ongoing medicines…">
                  <Textarea value={str("medical_history_notes")} onChange={(e) => set("medical_history_notes", e.target.value)} className="min-h-20" />
                </Field>
              </fieldset>
            </StepSection>
          )}

          {current === "guardian" && (
            <StepSection title="Guardian Information" subtitle="Given by the parent or guardian and encoded by the health worker.">
              <div className={grid}>
                {text("mother_name", "Mother’s name", { hint: "Full name, as on the immunization card" })}
                {text("father_name", "Father’s name")}
              </div>
              <SubHeading>Present guardian</SubHeading>
              <div className={grid}>
                <Field label="Existing guardian" className={cn("relative", wide)} error={errors.guardian_id}>
                  <Input
                    value={guardianQuery}
                    onChange={(e) => { setGuardianQuery(e.target.value); if (form.guardian_id) set("guardian_id", ""); }}
                    disabled={newGuardian}
                    placeholder="Type the guardian’s name to search…"
                    autoComplete="off"
                  />
                  {!newGuardian && !form.guardian_id && guardianQuery.length > 1 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-white shadow-lg">
                      {guardianMatches.length > 0 ? guardianMatches.map((g) => (
                        <button key={g.guardian_id} type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, guardian_id: String(g.guardian_id), guardian_contact_number: g.contact_number ?? "" }));
                            setOriginalGuardianContact(g.contact_number ?? "");
                            setGuardianQuery(`${g.first_name} ${g.last_name}${g.relationship_to_child ? ` (${g.relationship_to_child})` : ""}`);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                          {g.first_name} {g.last_name}{g.relationship_to_child ? ` (${g.relationship_to_child})` : ""}
                        </button>
                      )) : <p className="px-3 py-2 text-xs text-muted-foreground">No guardian found. Tick “Register new guardian” below.</p>}
                    </div>
                  )}
                  {Boolean(form.guardian_id) && <p className="text-xs font-medium text-good">Guardian selected</p>}
                </Field>
                {mode === "create" && (
                  <div className={wide}>
                    <Checkbox label="Register new guardian" checked={newGuardian}
                      onChange={(e) => { setNewGuardian(e.target.checked); if (e.target.checked) { set("guardian_id", ""); setGuardianQuery(""); } }} />
                  </div>
                )}
                {mode === "edit" && !newGuardian && Boolean(form.guardian_id) && (
                  text("guardian_contact_number", "Guardian contact number", { type: "tel", inputMode: "tel", hint: "Shared by every child linked to this guardian. Changing it asks for SMS consent again." })
                )}
                {newGuardian && (<>
                  {text("guardian_first_name", "First name", { required: true })}
                  {text("guardian_middle_name", "Middle name")}
                  {text("guardian_last_name", "Last name", { required: true })}
                  {choice("guardian_relationship_to_child", "Relationship to child", { required: true })}
                  {text("guardian_contact_number", "Contact number", { type: "tel", inputMode: "tel", hint: "09XXXXXXXXX" })}
                  {text("guardian_address", "Address", { className: "sm:col-span-2" })}
                </>)}
              </div>
              <p className="rounded-xl bg-brand-ice px-4 py-3 text-xs text-brand-muted">
                SMS reminder consent is confirmed on the child’s profile after saving, once the guardian’s number is verified.
              </p>
              <SubHeading>Information provided by</SubHeading>
              <div className={grid}>
                {text("informant_name", "Informant’s name", { hint: "The parent or guardian who gave these details" })}
                {text("informant_relationship", "Relationship to child")}
              </div>
            </StepSection>
          )}

          {current === "household" && (
            <StepSection title="Household Information" subtitle="Where the child lives. Siblings in the same household share its Family Serial Number.">
              <div className={grid}>
                <Field label="Barangay" required error={errors.barangay_id}>
                  <Select value={str("barangay_id")} onChange={(e) => { set("barangay_id", e.target.value); set("household_id", ""); setHouseholdQuery(""); }}>
                    <option value="">Select barangay</option>
                    {(barangays ?? []).map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.barangay_name}</option>)}
                  </Select>
                </Field>
                {text("address", "Child’s address", { className: "sm:col-span-2" })}
                <Field label="Existing household" className={cn("relative", wide)} error={errors.household_id}>
                  <Input
                    value={householdQuery}
                    onChange={(e) => { setHouseholdQuery(e.target.value); if (form.household_id) set("household_id", ""); }}
                    disabled={newHousehold || !form.barangay_id}
                    placeholder={form.barangay_id ? "Type the household number or address to search…" : "Choose a barangay first"}
                    autoComplete="off"
                  />
                  {!newHousehold && !form.household_id && householdQuery.length > 1 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-white shadow-lg">
                      {householdMatches.length > 0 ? householdMatches.map((h) => (
                        <button key={h.household_id} type="button"
                          onClick={() => { set("household_id", String(h.household_id)); setHouseholdQuery(`${h.household_no} — ${h.household_address}`); }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                          {h.household_no} — {h.household_address}
                        </button>
                      )) : <p className="px-3 py-2 text-xs text-muted-foreground">No household found. Tick “Create new household” below.</p>}
                    </div>
                  )}
                  {Boolean(form.household_id) && <p className="text-xs font-medium text-good">Household selected</p>}
                </Field>
                {mode === "create" && (
                  <div className={wide}>
                    <Checkbox label="Create new household" checked={newHousehold}
                      onChange={(e) => { setNewHousehold(e.target.checked); if (e.target.checked) { set("household_id", ""); setHouseholdQuery(""); } }} />
                  </div>
                )}
                {newHousehold && (<>
                  {text("household_no", "Household number")}
                  {text("purok", "Purok")}
                  {text("household_address", "Household address", { required: true })}
                  <div className={wide}>
                    <Checkbox label="4Ps household member" checked={Boolean(form.is_4ps_member)} onChange={(e) => set("is_4ps_member", e.target.checked)} />
                  </div>
                </>)}
                {choice("water_source_type", "Water source")}
                {choice("toilet_facility_type", "Toilet facility")}
              </div>
            </StepSection>
          )}

          {current === "review" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Check everything before saving. Use Edit to go back to a section.</p>
              <ReviewCard title="Child Information" onEdit={() => goTo(0)} rows={[
                ["Name", [str("first_name"), str("middle_name"), str("last_name")].filter(Boolean).join(" ")],
                ["Sex", str("sex")], ["Date of birth", str("date_of_birth")], ["Age group", classificationForDob(str("date_of_birth"))],
                ["Place of birth", str("birth_place")],
                ["Birth weight", str("birth_weight_kg") && `${str("birth_weight_kg")} kg`],
                ["Birth height", str("birth_height_cm") && `${str("birth_height_cm")} cm`],
                ["PhilHealth", [str("philhealth_membership_type"), str("philhealth_id_number"), str("philhealth_category")].filter(Boolean).join(" · ")],
                ["Medical history", resolveOthers(form).medical_history],
              ]} />
              <ReviewCard title="Guardian Information" onEdit={() => goTo(1)} rows={[
                ["Mother", str("mother_name")], ["Father", str("father_name")],
                ["Guardian", newGuardian
                  ? [str("guardian_first_name"), str("guardian_last_name")].filter(Boolean).join(" ") + (str("guardian_relationship_to_child") && ` (${str("guardian_relationship_to_child")})`)
                  : form.guardian_id ? guardianQuery : ""],
                ["Contact number", str("guardian_contact_number")],
                ["Information provided by", [str("informant_name"), str("informant_relationship")].filter(Boolean).join(" · ")],
              ]} />
              <ReviewCard title="Household Information" onEdit={() => goTo(2)} rows={[
                ["Barangay", barangayName ?? ""], ["Child’s address", str("address")],
                ["Household", newHousehold
                  ? `New: ${[str("household_no"), str("household_address"), str("purok") && `Purok ${str("purok")}`].filter(Boolean).join(" · ")}${form.is_4ps_member ? " · 4Ps" : ""}`
                  : form.household_id ? householdQuery : ""],
                ["Water source", str("water_source_type")], ["Toilet facility", str("toilet_facility_type")],
              ]} />
              {mode === 'create' && draft && online && (
                <div className="rounded-xl border border-warn/25 bg-warn-soft p-4">
                  <Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)}
                    label="I reviewed these details and checked that this child is not already registered." />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
          <div>
            {step > 0 && <Button variant="ghost" onClick={() => goTo(step - 1)}>Back</Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {mode === 'create' && <Button variant="secondary" disabled={saving} onClick={saveLocalDraft}>Save draft on device</Button>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            {current !== "review" ? (
              <Button type="submit">Next: {STEPS[step + 1].label}</Button>
            ) : (
              <Button type="submit" loading={saving} disabled={Boolean(draft && online && !reviewed)}>
                {mode === "edit" ? "Save changes" : !online ? "Save draft on device" : draft ? "Upload reviewed draft" : "Save child record"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function Stepper({ current, visited, onSelect }: { current: number; visited: number; onSelect: (index: number) => void }) {
  return (
    <ol aria-label="Registration steps" className="flex gap-1 overflow-x-auto border-b border-border bg-brand-ice/50 px-3 py-3 sm:px-6">
      {STEPS.map((s, i) => {
        const done = i < current;
        const reachable = i <= visited && i !== current;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onSelect(i)}
              aria-current={i === current ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium",
                i === current ? "text-brand-navy" : done ? "text-good" : "text-muted-foreground",
                reachable && "hover:bg-white",
              )}
            >
              <span className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                i === current ? "bg-primary text-white" : done ? "bg-good-soft text-good" : "bg-white text-muted-foreground ring-1 ring-border",
              )}>
                {done ? <Check size={14} aria-hidden="true" /> : i + 1}
              </span>
              <span className="truncate">{s.label}</span>
              {done && <span className="sr-only">(completed)</span>}
            </button>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="hidden h-px flex-1 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

function StepSection({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-brand-navy">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="border-t border-border pt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>;
}

function ReviewCard({ title, rows, onEdit }: { title: string; rows: [string, string | false | undefined][]; onEdit: () => void }) {
  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-brand-navy">{title}</h3>
        <button type="button" onClick={onEdit} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Edit</button>
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[180px_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{value || <span className="text-muted-foreground">Not provided</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
