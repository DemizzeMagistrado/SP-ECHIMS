'use client'

// Batch number input with the one system format (lib/vaccination-config): trims, uppercases and
// joins words with dashes when the field loses focus, and shows the error inline under the field.
// The APIs apply the same rule, so what is shown is what is saved.

import { useState } from 'react'
import { Field, Input } from '@/components/ui/form'
import { BATCH_NUMBER_EXAMPLE, batchNumberError, normalizeBatchNumber } from '@/lib/vaccination-config'

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
  const formatError = touched ? batchNumberError(value) : null
  return (
    <Field label={label} required={required} hint={hint ?? `Letters and numbers joined by dashes, e.g. ${BATCH_NUMBER_EXAMPLE}`} error={formatError ?? error ?? undefined} className={className}>
      <Input
        id={id}
        value={value}
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        placeholder={BATCH_NUMBER_EXAMPLE}
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
  return { value: v, error: batchNumberError(v) }
}
