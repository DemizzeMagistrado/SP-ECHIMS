'use client'

// Batch number input with the one system format (lib/vaccination-config): trims, uppercases and
// joins words with dashes when the field loses focus, and shows the error inline under the field.
// The APIs apply the same rule, so what is shown is what is saved.

import { useState } from 'react'
import useSWR from 'swr'
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { Field, Input } from '@/components/ui/form'
import { DEFAULT_BATCH_RULE, batchNumberError, describeBatchRule, normalizeBatchNumber, parseBatchRule, type BatchRule } from '@/lib/vaccination-config'

// The format set in Vaccination › Vaccines (Catalog settings). Kept module-wide so submit checks use the same
// rule the field shows; the APIs check against the stored rule anyway.
let currentRule: BatchRule = DEFAULT_BATCH_RULE
const ruleFetcher = async (url: string) => {
  const r = await fetch(url)
  const d = await r.json().catch(() => ({}))
  currentRule = r.ok ? parseBatchRule(d.batch_number_format) : DEFAULT_BATCH_RULE
  return currentRule
}
export function useBatchRule(): BatchRule {
  const { data } = useSWR('/api/vaccination/settings', ruleFetcher, { revalidateOnFocus: false })
  return data ?? DEFAULT_BATCH_RULE
}

export function BatchNumberField({ value, onChange, required = false, label = 'Batch number', hint, error, className, id }: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  label?: string
  hint?: string
  /** An error from the form's own submit check (e.g. "required"). */
  error?: string | null
  className?: string
  id?: string
}) {
  const [touched, setTouched] = useState(false)
  const rule = useBatchRule()
  const formatError = touched ? batchNumberError(value, rule) : null
  return (
    <Field label={label} required={required} hint={hint ?? describeBatchRule(rule)} error={formatError ?? error ?? undefined} className={className}>
      <Input
        id={id}
        value={value}
        autoComplete="off"
        spellCheck={false}
        maxLength={rule.max + 10}
        placeholder={rule.example}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { setTouched(true); const n = normalizeBatchNumber(value) ?? ''; if (n !== value) onChange(n) }}
        className="uppercase placeholder:normal-case"
      />
    </Field>
  )
}

/** For submit handlers: the saved form of the value, or an error message. */
export function checkBatchNumber(value: string, required: boolean): { value: string | null; error: string | null } {
  const v = normalizeBatchNumber(value)
  if (!v) return { value: null, error: required ? 'Enter the batch number from the vial or box.' : null }
  return { value: v, error: batchNumberError(v, currentRule) }
}
