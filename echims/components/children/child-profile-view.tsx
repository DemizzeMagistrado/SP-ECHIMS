"use client";

import { childProgramEligibility, manilaDate } from '@/lib/child-program-eligibility'
import { TransferredHouseholdRegistration } from '@/components/children/transferred-household-registration'
import { HouseholdLocationCapture, formatCoords } from '@/components/geospatial/device-location'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
// CHILD-USR003 — View Child Profile
// Centralized profile view that pulls the child record, their linked guardian,
// their household and barangay context, and every related health record
// (vaccinations, nutritional assessments, supplementations) in one page.
// Backed by GET /api/children?childId={id} which fans the queries out in parallel.
import { useState } from "react";
import { ChildProfileDetailsView, formatDate, latestAssessment, type Assessment, type ChildProfileDetails } from "@/components/children/child-profile-details-view";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { SupplementationHistorySection } from "@/components/children/supplementation-history-section";

import { NutritionHistorySection } from "@/components/children/nutrition-history-section";
import {
  ArrowLeft,
  Pencil,
  Printer,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { canPerform, type UserRole } from "@/lib/echims-data";
import { formatChildId } from "@/lib/formatters";
import { useMedicalHistoryOptions } from "@/components/children/medical-history-picker";
import { ChildFormModal } from "@/components/children/child-form-modal";
import { ChildCareSections } from '@/components/children/child-care-sections'
import { ChildChangeDraftPanel } from '@/components/children/child-change-draft-panel'
import { VaccinationScheduleSection } from "@/components/children/vaccination-schedule-section";
import { toast } from '@/components/ui/toast'
import { GuardianSmsConsent } from "@/components/children/guardian-sms-consent";
import { GuardianSmsHistory } from "@/components/children/guardian-sms-history";
import { LogoLoader } from '@/components/brand/logo-loader'
import { Button, buttonVariants } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { StickySubnav, subnavPill } from "@/components/ui/sticky-subnav";
import { BackToTop } from "@/components/landing/section-nav";

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

type ProfilePayload = ChildProfileDetails & {
  masterlistImported?: boolean;
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
  if (url.startsWith('/api/children?') && (!data || typeof data !== 'object' || !data.child || !Number.isSafeInteger(Number(data.child.child_id)))) {
    throw new Error('This saved child profile is incomplete. Reconnect and open the child online to refresh it.');
  }
  return data;
};

// Accept database IDs, formatted display IDs, and links from older child lists.
function parseChildRouteId(value: string): number {
  const match = /^(?:E?CH-)?(?:\d{4}-)?(\d+)$/i.exec(value.trim());
  if (!match) return Number.NaN;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : Number.NaN;
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
  // After an edit (e.g. a corrected birth date) every section for this child must refetch, not
  // only the profile: the NIP schedule and history are computed from the date of birth.
  const { mutate: mutateAll } = useSWRConfig();
  const refreshChildSections = () => mutateAll((key) => {
    const k = Array.isArray(key) ? String(key[0]) : String(key ?? "");
    return k.includes(`child_id=${parsedId}`) || k.includes(`childId=${parsedId}`) || k.startsWith(`/api/children/${parsedId}/`);
  });
  const [editOpen, setEditOpen] = useState(false);

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

  const { child, guardian, household, assessments, siblings = [], openAlertCount } = data;
  const programEligibility = childProgramEligibility(child.date_of_birth, child.status ?? '', manilaDate());
  const fields = [
    {label: 'Child information incomplete', missing: [!child.birth_place && 'Birthplace', !child.address && 'Current address']},
    {label: 'Household information incomplete', missing: [!household && 'Linked household', household && !household.household_address && 'Household address']},
    {label: 'Guardian information incomplete', missing: [!guardian && 'Linked guardian', guardian && !guardian.relationship_to_child && 'Relationship', guardian && !guardian.contact_number && 'Contact number']},
  ].map(section => ({...section, missing: section.missing.filter(Boolean)})).filter(section => section.missing.length)
  const latestNutrition = latestAssessment(assessments ?? []);

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
          <Button variant="tonal" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" />
            Print
          </Button>
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={16} aria-hidden="true" />
              Edit profile
            </Button>
          )}
        </div>
      </div>

      {programEligibility.underFive === false && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Archived from the under-five program after the fifth birthday. The profile, service history and continuing care remain available.</div>}
      {data.masterlistImported && fields.length > 0 && <div role="status" className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:grid-cols-3">
        {fields.map(section => <div key={section.label}><p className="font-semibold">{section.label}</p><p>{section.missing.join(', ')}</p></div>)}
      </div>}

      {/* Transfer accepted without a household: a task until one is assigned (NIP-REV01). */}
      {!household && !data.masterlistImported && (
        <TransferredHouseholdRegistration childId={child.child_id} onSaved={() => void mutate()} />
      )}

      <BackToTop />
      <ChildProfileDetailsView
        data={data}
        latestNutrition={latestNutrition}
        canAddNutrition={canAddNutrition}
        canViewNutrition={canViewNutrition}
        medicalConditions={medicalOptions?.conditions}
        householdLocation={household && (household.latitude != null && household.longitude != null
          ? <span className="font-mono">{formatCoords({ latitude: Number(household.latitude), longitude: Number(household.longitude) })}</span>
          : canEdit
            ? <HouseholdLocationCapture householdId={household.household_id} onSaved={() => { toast.success("Location saved for this household"); void mutate() }} />
            : "Not set")}
        navigation={
          <StickySubnav
            label="Jump to section"
            items={[
              { id: "vaccination-schedule", label: "Vaccination schedule" },
              { id: "nutrition-history", label: "Nutrition history" },
              { id: "supplementation", label: "Supplementation" },
              { id: "checkups-transfers", label: "Checkups & transfers" },
            ]}
            extra={canViewAlerts && (
              <Link href="/alerts" className={subnavPill(false)}>
                Alerts
                {typeof openAlertCount === "number" && openAlertCount > 0 && (
                  <StatusBadge status="open" tone="danger" label={`${openAlertCount} open`} className="py-0.5" />
                )}
              </Link>
            )}
          />
        }
        guardianActions={
          guardian ? (
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
              No present guardian is linked yet.{canEdit ? " Use Edit profile to update guardian information." : ""}
            </p>
          )
        }
        householdMembers={
          <div id="household-members" className="mt-4 scroll-mt-[var(--subnav-offset,8rem)] border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-brand-navy">
              Household members <span className="font-normal text-muted-foreground">· same Family Serial No.</span>
            </h3>
            {siblings.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No other children registered in this household.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {siblings.map((sib) => (
                  <li key={sib.child_id}>
                    <Link
                      href={`/child-profiling/children/${sib.child_id}`}
                      className="group flex items-center justify-between gap-3 rounded-lg border-l-[3px] border-transparent px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-brand-ice/70 focus-visible:border-primary focus-visible:bg-brand-ice/70 focus-visible:outline-2 focus-visible:outline-ring active:bg-brand-ice"
                    >
                      <span>
                        <span className="font-medium text-brand-navy">{sib.first_name} {sib.last_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-mono">{sib.child_code ?? formatChildId(sib.child_id)}</span> · Born {formatDate(sib.date_of_birth)}
                        </span>
                      </span>
                      <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        View <ChevronRight size={14} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
      />

      {/* NIP-USR001 — Vaccination Schedule request + preview. Computed from DOB + NIP
          catalog, already-administered doses excluded. BHW/RHM can request, PHN reviews. */}
      <div id="vaccination-schedule" className="scroll-mt-[var(--subnav-offset,8rem)]">
        <VaccinationScheduleSection childId={child.child_id} />
      </div>

      {/* Nutritional assessment history */}
      <div id="nutrition-history" className="scroll-mt-[var(--subnav-offset,8rem)]">
        <NutritionHistorySection
          assessments={assessments ?? []}
          actions={canViewNutrition && <Link href="/nutritional-assessment/records" className={buttonVariants({ variant: "secondary", size: "sm" })}>{canAddNutrition ? "Review / Record" : "Review nutrition"}</Link>}
        />
      </div>

      {/* Full saved administration, dispensing, plans and due dates. */}
      <div id="supplementation" className="scroll-mt-[var(--subnav-offset,8rem)]">
        <SupplementationHistorySection childId={child.child_id} />
      </div>

      <ChildChangeDraftPanel childId={child.child_id} onUploaded={() => { void mutate() }} />
      <div id="checkups-transfers" className="scroll-mt-[var(--subnav-offset,8rem)]">
        <ChildCareSections
          childId={child.child_id}
          householdId={child.household_id}
          barangayId={child.barangay_id}
          dateOfBirth={child.date_of_birth}
          registryStatus={child.status ?? ''}
          canEdit={canEdit}
          onSaved={() => { void mutate() }}
        />
      </div>

      {editOpen && canEdit && (
        <ChildFormModal
          mode="edit"
          childId={parsedId}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            // Refresh the profile and its related sections after saving.
            mutate();
            void refreshChildSections();
            toast.success("Changes saved");
          }}
          onError={(message) => toast.error(message)}
        />
      )}
    </div>
  );
}