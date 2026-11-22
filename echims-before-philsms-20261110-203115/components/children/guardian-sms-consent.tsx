"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'

import { useState } from "react";

type Props = {
  guardian: {
    guardian_id: number;
    contact_number: string | null;
    sms_opt_in?: boolean;
    sms_verified_contact_number?: string | null;
    sms_contact_verified_at?: string | null;
  };
  canEdit: boolean;
  onSaved: () => Promise<unknown> | void;
};

function normalizeMobile(value: string | null | undefined): string | null {
  const number = value?.trim() ?? "";
  if (/^09[0-9]{9}$/.test(number)) return `63${number.slice(1)}`;
  if (/^639[0-9]{9}$/.test(number)) return number;
  if (/^\+639[0-9]{9}$/.test(number)) return number.slice(1);
  return null;
}

export function GuardianSmsConsent({ guardian, canEdit, onSaved }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const number = normalizeMobile(guardian.contact_number);
  const enabled = Boolean(
    number &&
      guardian.sms_opt_in === true &&
      guardian.sms_verified_contact_number === number &&
      guardian.sms_contact_verified_at,
  );

  async function save(optIn: boolean) {
    if (saving || !canEdit || (optIn && (!number || !confirmed))) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/guardians/${guardian.guardian_id}/sms-consent`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            optIn,
            contactNumber: guardian.contact_number,
            confirmedWithGuardian: optIn && confirmed,
          }),
        },
      );
      const result: unknown = await response.json().catch(() => null);
      const message =
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : null;
      if (!response.ok)
        throw new Error(
          message ??
            `Unable to save SMS preferences (HTTP ${response.status}).`,
        );
      if (!result)
        throw new Error(
          "The consent API returned an unexpected response. Refresh and check the saved preference.",
        );
      setConfirmed(false);
      setNotice(
        optIn ? "Consent saved. No SMS was sent." : "SMS reminders disabled.",
      );
      try {
        await onSaved();
      } catch {
        setNotice(
          "Preference saved. Refresh this page to see the updated status.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save SMS preferences.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Guardian SMS reminders</p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${enabled ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
        >
          {enabled ? "Consent confirmed" : "Not enabled"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Reminders use the saved guardian number. Consent applies to all children
        linked to this guardian. Changing the number requires confirmation
        again.
      </p>
      {canEdit && !enabled && (
        <>
          {!number ? (
            <p className="text-sm text-amber-800">
              Use Edit to save a valid Philippine mobile number first.
            </p>
          ) : (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={saving}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1"
              />
              <span>
                I confirmed with the guardian that {guardian.contact_number} is
                their contact number and they agree to receive child health SMS
                reminders.
              </span>
            </label>
          )}
          <button
            type="button"
            disabled={!number || !confirmed || saving}
            onClick={() => void save(true)}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Confirm SMS Consent"}
          </button>
        </>
      )}
      {canEdit && (enabled || guardian.sms_opt_in === true) && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(false)}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Disable SMS Reminders"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-700">
          {notice}
        </p>
      )}
    </div>
  );
}
