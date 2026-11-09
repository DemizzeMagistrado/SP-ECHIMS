"use client";
import Link from "next/link";
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "@/lib/offline/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import type { UserRole } from "@/lib/echims-data";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Spinner } from "@/components/brand/logo-loader";
/* =========================================================
   LOCATION TYPES
========================================================= */
type BarangayOption = { barangay_id: number; barangay_name: string };
type RHUOption = {
  rhu_id: number;
  rhu_name: string;
  barangays: BarangayOption[];
};
type RegionOption = { region_code: string; region_name: string };
type MunicipalityOption = {
  municipality_id: string;
  municipality_name: string;
  type: "Municipality" | "City";
};
type ProvinceOption = { province_id: string; province_name: string };
type RegistrationLocations = {
  region_code: string | null;
  province_code: string | null;
  city_code: string | null;
  regions: RegionOption[];
  provinces: ProvinceOption[];
  hasIndependentCities: boolean;
  municipalities: MunicipalityOption[];
  rhus: RHUOption[];
};
const emptyLocations: RegistrationLocations = {
  region_code: null,
  province_code: null,
  city_code: null,
  regions: [],
  provinces: [],
  hasIndependentCities: false,
  municipalities: [],
  rhus: [],
};
const NO_PROVINCE = "__NONE__";
/* =========================================================
   ROLE OPTIONS
========================================================= */
const roleOptions: {
  value: UserRole;
  description: string;
}[] = [
  {
    value: "Administrator",
    description: "Manages RHU users, permissions, and system operations.",
  },
  {
    value: "Public Health Nurse",
    description: "Coordinates RHU programs and approves health activities.",
  },
  {
    value: "Rural Health Midwife",
    description:
      "Provides maternal and child health services across assigned barangays.",
  },
  {
    value: "Barangay Health Worker",
    description: "Supports household visits and community health records.",
  },
  {
    value: "Barangay Nutrition Scholar",
    description: "Supports nutrition monitoring and supplementation.",
  },
];
/* =========================================================
   FORM STATE
========================================================= */
type RegistrationState = {
  fullName: string;
  username: string;
  contactNumber: string;
  email: string;
  role: UserRole;
  employeeId: string;
  licenseNumber: string;
  region_code: string;
  province_id: string;
  municipality_id: string;
  rhu_id: string;
  barangay_id: string;
  barangay_ids: string[];
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
};
const initialForm: RegistrationState = {
  fullName: "",
  username: "",
  contactNumber: "",
  email: "",
  role: "Barangay Health Worker",
  employeeId: "",
  licenseNumber: "",
  region_code: "",
  province_id: "",
  municipality_id: "",
  rhu_id: "",
  barangay_id: "",
  barangay_ids: [],
  password: "",
  confirmPassword: "",
  acceptedTerms: false,
};
const STORAGE_KEY = "echims-registration-form";
/* =========================================================
   PAGE
========================================================= */
export default function RegisterPage() {
  const router = useRouter();
  const { register, beginEntering } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<RegistrationState>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [restored, setRestored] = useState(false);
  const [locationData, setLocationData] =
    useState<RegistrationLocations>(emptyLocations);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState("");
  /* =======================================================
     ROLE HELPERS
  ======================================================= */
  const isAdministrator = form.role === "Administrator";
  const isPHN = form.role === "Public Health Nurse";
  const isRHM = form.role === "Rural Health Midwife";
  const isBarangayWorker =
    form.role === "Barangay Health Worker" ||
    form.role === "Barangay Nutrition Scholar";
  const requiresLicense = isPHN || isRHM;
  /* =======================================================
     RESTORE FORM
  ======================================================= */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const hasPsgcRegion =
            typeof parsed.region_code === "string" &&
            /^\d{10}$/.test(parsed.region_code);
          setForm((current) => ({
            ...current,
            ...parsed,
            password: "",
            confirmPassword: "",
            ...(!hasPsgcRegion
              ? {
                  region_code: "",
                  province_id: "",
                  municipality_id: "",
                  rhu_id: "",
                  barangay_id: "",
                  barangay_ids: [],
                }
              : {
                  barangay_ids: Array.isArray(parsed.barangay_ids)
                    ? parsed.barangay_ids.map(String)
                    : [],
                }),
          }));
        }
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!restored) return;
    const { password, confirmPassword, ...safeForm } = form;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safeForm));
    } catch {
      /* Storage may be disabled. */
    }
  }, [form, restored]);

  useEffect(() => {
    if (!restored) return;
    let active = true;
    setLocationLoading(true);
    setLocationError("");
    void (async () => {
      try {
        const { data, error: lookupError } = await supabase.rpc(
          "get_registration_locations",
          {
            p_region_code: form.region_code || null,
            p_province_code:
              form.province_id && form.province_id !== NO_PROVINCE
                ? form.province_id
                : null,
            p_city_code: form.municipality_id || null,
          },
        );
        if (!active) return;
        if (lookupError) throw new Error(lookupError.message);
        const locations = data as unknown as RegistrationLocations | null;
        if (
          !locations ||
          !Array.isArray(locations.regions) ||
          !Array.isArray(locations.provinces) ||
          !Array.isArray(locations.municipalities) ||
          !Array.isArray(locations.rhus) ||
          locations.rhus.some((rhu) => !Array.isArray(rhu.barangays))
        ) {
          throw new Error("Location lookup returned an invalid response.");
        }
        setLocationData(locations);
      } catch (cause) {
        if (active) {
          setLocationData(emptyLocations);
          setLocationError(
            cause instanceof Error
              ? cause.message
              : "Unable to load locations. Reload and try again.",
          );
        }
      } finally {
        if (active) setLocationLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    supabase,
    restored,
    form.region_code,
    form.province_id,
    form.municipality_id,
  ]);

  const sameRegion = locationData.region_code === (form.region_code || null);
  const sameProvince =
    sameRegion &&
    locationData.province_code ===
      (form.province_id && form.province_id !== NO_PROVINCE
        ? form.province_id
        : null);
  const sameCity =
    sameProvince && locationData.city_code === (form.municipality_id || null);
  const provinces = sameRegion ? locationData.provinces : [];
  const municipalities = sameProvince ? locationData.municipalities : [];
  const rhus = sameCity ? locationData.rhus : [];
  const selectedMunicipality = municipalities.find(
    (item) => item.municipality_id === form.municipality_id,
  );
  const selectedRhu = rhus.find((item) => String(item.rhu_id) === form.rhu_id);

  /* =======================================================
     FORM HANDLERS
  ======================================================= */
  function updateField<K extends keyof RegistrationState>(
    field: K,
    value: RegistrationState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  function handleRoleChange(role: UserRole) {
    setForm((current) => ({
      ...current,
      role,
      employeeId: role === "Administrator" ? "" : current.employeeId,
      licenseNumber:
        role === "Public Health Nurse" || role === "Rural Health Midwife"
          ? current.licenseNumber
          : "",
      region_code: role === "Administrator" ? "" : current.region_code,
      province_id: role === "Administrator" ? "" : current.province_id,
      municipality_id: role === "Administrator" ? "" : current.municipality_id,
      rhu_id: role === "Administrator" ? "" : current.rhu_id,
      barangay_id: "",
      barangay_ids: [],
    }));
  }
  function handleRegionChange(value: string) {
    setForm((current) => ({
      ...current,
      region_code: value,
      province_id: "",
      municipality_id: "",
      rhu_id: "",
      barangay_id: "",
      barangay_ids: [],
    }));
  }
  function handleProvinceChange(value: string) {
    setForm((current) => ({
      ...current,
      province_id: value,
      municipality_id: "",
      rhu_id: "",
      barangay_id: "",
      barangay_ids: [],
    }));
  }
  function handleMunicipalityChange(value: string) {
    setForm((current) => ({
      ...current,
      municipality_id: value,
      rhu_id: "",
      barangay_id: "",
      barangay_ids: [],
    }));
  }
  function handleRhuChange(value: string) {
    setForm((current) => ({
      ...current,
      rhu_id: value,
      barangay_id: "",
      barangay_ids: [],
    }));
  }
  function toggleRhmBarangay(barangayId: string) {
    setForm((current) => {
      const exists = current.barangay_ids.includes(barangayId);
      return {
        ...current,
        barangay_ids: exists
          ? current.barangay_ids.filter((id) => id !== barangayId)
          : [...current.barangay_ids, barangayId],
      };
    });
  }
  /* =======================================================
     VALIDATION
  ======================================================= */
  function validateForm() {
    if (!form.fullName.trim()) return "Please enter your full name.";
    if (!form.username.trim()) return "Please enter a username.";
    if (!form.contactNumber.trim()) return "Please enter your contact number.";
    if (!form.email.trim()) return "Please enter your email address.";
    if (!isAdministrator && !form.employeeId.trim())
      return "Please enter your employee ID.";
    if (requiresLicense && !form.licenseNumber.trim())
      return "Please enter your license number.";
    if (!isAdministrator) {
      if (locationLoading || locationError)
        return locationError || "Please wait for workplace options to load.";
      if (!form.region_code) return "Please select your region.";
      if (!form.province_id)
        return "Please select your province or the no-province option.";
      if (!form.municipality_id)
        return "Please select your municipality or city.";
      if (!selectedMunicipality)
        return "Please select a valid municipality or city.";
      if (!selectedRhu) return "Please select an available RHU.";
      if (isRHM && form.barangay_ids.length === 0)
        return "Please select at least one barangay.";
      if (isBarangayWorker && !form.barangay_id)
        return "Please select your barangay.";
      const coveredIds = new Set(
        selectedRhu.barangays.map((item) => String(item.barangay_id)),
      );
      if (isBarangayWorker && !coveredIds.has(form.barangay_id))
        return "Select a barangay covered by your RHU.";
      if (isRHM && form.barangay_ids.some((id) => !coveredIds.has(id)))
        return "Select only barangays covered by your RHU.";
    }
    if (form.password.length < 8)
      return "Password must contain at least 8 characters.";
    if (form.password !== form.confirmPassword)
      return "Passwords do not match.";
    if (!form.acceptedTerms) return "Please accept the Terms and Conditions.";
    return null;
  }
  /* =======================================================
     SUBMIT
  ======================================================= */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    const result = await register({
      fullName: form.fullName.trim(),
      username: form.username.trim(),
      contactNumber: form.contactNumber.trim(),
      email: form.email.trim(),
      role: form.role,
      employeeId: isAdministrator ? undefined : form.employeeId.trim(),
      licenseNumber: requiresLicense ? form.licenseNumber.trim() : undefined,
      region_code: isAdministrator ? undefined : form.region_code,
      province_id:
        isAdministrator || form.province_id === NO_PROVINCE
          ? undefined
          : form.province_id,
      municipality_id: isAdministrator ? undefined : form.municipality_id,
      rhu_id: isAdministrator ? undefined : form.rhu_id,
      barangay_id: isBarangayWorker ? form.barangay_id : undefined,
      barangay_ids: isRHM ? form.barangay_ids : [],
      password: form.password,
    });
    if (result.error) {
      setLoading(false);
      setError(result.error);
      return;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    if (result.needsEmailConfirmation) {
      setLoading(false);
      setSuccess(
        "Registration submitted. Please check your email and confirm your account.",
      );
      return;
    }
    // signUp returned a session: the account is signed in (pending approval). Go straight to the
    // dashboard, which shows the pending state, without dropping back to the form or /login.
    beginEntering();
    await createClient().auth.getSession();
    router.replace("/dashboard");
    router.refresh();
  }
  /* =======================================================
     STYLES
  ======================================================= */
  const inputClass =
    "h-12 w-full rounded-xl border border-[#C9DCE6] bg-white px-4 text-base text-[#03045E] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#8A93A6] focus:border-[#087DB9] focus:ring-4 focus:ring-[#087DB9]/15 disabled:bg-[#F4F6F8] disabled:text-[#8A93A6]";
  const selectClass = `${inputClass} appearance-none pr-12`;
  /* =======================================================
     UI
  ======================================================= */
  return (
    <AuthShell scrollable>
          <div className="auth-stagger">
              <h2 className="font-display text-3xl font-bold tracking-tight">
                Create an account
              </h2>
              <p className="mt-2 text-[#5B6478]">
                Your RHU administrator reviews new accounts before first sign-in.
              </p>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 [animation-delay:250ms]">
              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(event) =>
                      updateField("fullName", event.target.value)
                    }
                    className={inputClass}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                    Username
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(event) =>
                      updateField("username", event.target.value)
                    }
                    className={inputClass}
                    placeholder="Enter username"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    value={form.contactNumber}
                    onChange={(event) =>
                      updateField("contactNumber", event.target.value)
                    }
                    className={inputClass}
                    placeholder="09XXXXXXXXX"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateField("email", event.target.value)
                    }
                    className={inputClass}
                    placeholder="name@example.com"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                    User Role
                  </label>
                  <div className="relative">
                    <select
                      value={form.role}
                      onChange={(event) =>
                        handleRoleChange(event.target.value as UserRole)
                      }
                      className={selectClass}
                    >
                      {roleOptions.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.value}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {
                      roleOptions.find((role) => role.value === form.role)
                        ?.description
                    }
                  </p>
                </div>
                {!isAdministrator && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                      Employee ID
                    </label>
                    <input
                      type="text"
                      value={form.employeeId}
                      onChange={(event) =>
                        updateField("employeeId", event.target.value)
                      }
                      className={inputClass}
                      placeholder="Enter employee ID"
                    />
                  </div>
                )}
                {requiresLicense && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                      License Number
                    </label>
                    <input
                      type="text"
                      value={form.licenseNumber}
                      onChange={(event) =>
                        updateField("licenseNumber", event.target.value)
                      }
                      className={inputClass}
                      placeholder="Enter license number"
                    />
                  </div>
                )}
                {!isAdministrator && (
                  <div className="space-y-5 border-t border-gray-100 pt-5">
                    <div>
                      <h3 className="font-semibold text-[#03045E]">
                        Workplace Assignment
                      </h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Your workplace will be verified by an administrator.
                      </p>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                        Region
                      </label>
                      <div className="relative">
                        <select
                          value={form.region_code}
                          disabled={locationLoading}
                          onChange={(event) =>
                            handleRegionChange(event.target.value)
                          }
                          className={selectClass}
                        >
                          <option value="">Select region</option>
                          {locationData.regions.map((region) => (
                            <option
                              key={region.region_code}
                              value={region.region_code}
                            >
                              {region.region_name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                        Province
                      </label>
                      <div className="relative">
                        <select
                          value={form.province_id}
                          disabled={!form.region_code || locationLoading}
                          onChange={(event) =>
                            handleProvinceChange(event.target.value)
                          }
                          className={selectClass}
                        >
                          <option value="">Select province</option>
                          {sameRegion && locationData.hasIndependentCities && (
                            <option value={NO_PROVINCE}>
                              No province / Independent city
                            </option>
                          )}
                          {provinces.map((province) => (
                            <option
                              key={province.province_id}
                              value={province.province_id}
                            >
                              {province.province_name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                        Municipality / City
                      </label>
                      <div className="relative">
                        <select
                          value={form.municipality_id}
                          disabled={!form.province_id || locationLoading}
                          onChange={(event) =>
                            handleMunicipalityChange(event.target.value)
                          }
                          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <option value="">Select municipality or city</option>
                          {municipalities.map((municipality) => (
                            <option
                              key={municipality.municipality_id}
                              value={municipality.municipality_id}
                            >
                              {municipality.municipality_name} (
                              {municipality.type})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                        Rural Health Unit
                      </label>
                      <div className="relative">
                        <select
                          value={form.rhu_id}
                          disabled={
                            !selectedMunicipality ||
                            locationLoading ||
                            rhus.length === 0
                          }
                          onChange={(event) =>
                            handleRhuChange(event.target.value)
                          }
                          className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <option value="">Select RHU</option>
                          {rhus.map((rhu) => (
                            <option key={rhu.rhu_id} value={rhu.rhu_id}>
                              {rhu.rhu_name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      </div>
                    </div>
                    {locationLoading && (
                      <p className="text-xs text-gray-500">
                        <span role="status" className="flex items-center gap-2"><Spinner label="Loading workplace options…" />Loading workplace options…</span>
                      </p>
                    )}
                    {locationError && (
                      <p role="alert" className="text-xs text-red-700">
                        {locationError}
                      </p>
                    )}
                    {!locationLoading &&
                      !locationError &&
                      selectedMunicipality &&
                      rhus.length === 0 && (
                        <p className="text-xs text-gray-500">
                          No RHU is configured for registration in this
                          city/municipality yet.
                        </p>
                      )}
                    {!locationLoading &&
                      selectedRhu &&
                      !isPHN &&
                      selectedRhu.barangays.length === 0 && (
                        <p className="text-xs text-gray-500">
                          Barangay coverage has not been configured for this RHU
                          yet.
                        </p>
                      )}
                    {isRHM && selectedRhu && (
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                          Assigned Barangays
                        </label>
                        <p className="mb-3 text-xs text-gray-500">
                          Select one or more barangays assigned to you.
                        </p>
                        <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                          {selectedRhu.barangays.map((barangay) => {
                            const id = String(barangay.barangay_id);
                            const selected = form.barangay_ids.includes(id);
                            return (
                              <button
                                key={barangay.barangay_id}
                                type="button"
                                onClick={() => toggleRhmBarangay(id)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white"
                              >
                                <span
                                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                                    selected
                                      ? "border-[#0077B6] bg-[#0077B6] text-white"
                                      : "border-gray-300 bg-white"
                                  }`}
                                >
                                  {selected && <Check className="h-3 w-3" />}
                                </span>
                                <span>{barangay.barangay_name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {isBarangayWorker && (
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                          Barangay
                        </label>
                        <div className="relative">
                          <select
                            value={form.barangay_id}
                            disabled={!selectedRhu || locationLoading}
                            onChange={(event) =>
                              updateField("barangay_id", event.target.value)
                            }
                            className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <option value="">Select barangay</option>
                            {selectedRhu?.barangays.map((barangay) => (
                              <option
                                key={barangay.barangay_id}
                                value={barangay.barangay_id}
                              >
                                {barangay.barangay_name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        </div>
                      </div>
                    )}
                    {isPHN && selectedRhu && (
                      <div className="rounded-2xl bg-blue-50 px-4 py-3 text-xs text-[#03045E]">
                        As a Public Health Nurse, your requested workplace is{" "}
                        <strong>{selectedRhu.rhu_name}</strong>. Barangay
                        assignments are not required during registration.
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) =>
                        updateField("password", event.target.value)
                      }
                      className={`${inputClass} pr-12`}
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[#03045E]">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={(event) =>
                        updateField("confirmPassword", event.target.value)
                      }
                      className={`${inputClass} pr-12`}
                      placeholder="Re-enter password"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword((current) => !current)
                      }
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.acceptedTerms}
                    onChange={(event) =>
                      updateField("acceptedTerms", event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-[#0077B6]"
                  />
                  <span>
                    I agree to the{" "}
                    <Link
                      href="/terms"
                      className="font-medium text-[#0077B6] hover:underline"
                    >
                      Terms and Conditions
                    </Link>
                    .
                  </span>
                </label>
                {error && (
                  <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 animate-in fade-in slide-in-from-top-1 duration-200">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 animate-in fade-in slide-in-from-top-1 duration-200">
                    {success}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-lg bg-[#087DB9] px-5 font-semibold text-white shadow-sm shadow-[#087DB9]/30 transition-colors hover:bg-[#056d9e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && <Spinner label="Creating account" className="mr-2" />}
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </form>
              <p className="mt-6 text-center text-sm text-[#5B6478]">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-[#087DB9] hover:underline"
                >
                  Sign in
                </Link>
              </p>
          </div>
    </AuthShell>
  );
}
