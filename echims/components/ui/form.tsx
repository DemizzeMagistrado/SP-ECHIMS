'use client'

// Form controls with one look: 40px height, rounded-lg, sky focus ring, muted disabled, red error.
// Wrap a control in <Field> to get its label, required marker, hint and error wired up:
//   <Field label="Birth date" required error={errors.dob} hint="As written on the birth certificate">
//     <DateInput value={dob} onChange={(e) => setDob(e.target.value)} />
//   </Field>

import { createContext, useContext, useId, type AriaAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type FieldContext = { id: string; describedBy?: string; invalid: boolean; required: boolean }
const Ctx = createContext<FieldContext | null>(null)

export function Field({ label, required = false, hint, error, children, className }: {
  label: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <Ctx.Provider value={{ id, describedBy, invalid: Boolean(error), required }}>
      <div className={cn('space-y-1.5', className)}>
        <label htmlFor={id} className="block text-sm font-semibold text-brand-navy">
          {label}
          {required && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
        </label>
        {children}
        {hint && <p id={hintId} className="text-xs text-brand-muted">{hint}</p>}
        {error && <p id={errorId} className="text-xs font-medium text-danger">{error}</p>}
      </div>
    </Ctx.Provider>
  )
}

/** id, aria-describedby, aria-invalid and required from the enclosing Field; explicit props win. */
function useFieldProps<P extends AriaAttributes & { id?: string; required?: boolean }>(props: P): P {
  const f = useContext(Ctx)
  if (!f) return props
  return {
    ...props,
    id: props.id ?? f.id,
    required: props.required ?? (f.required || undefined),
    'aria-describedby': [f.describedBy, props['aria-describedby']].filter(Boolean).join(' ') || undefined,
    'aria-invalid': props['aria-invalid'] ?? (f.invalid || undefined),
  }
}

export const controlClass =
  'w-full rounded-lg border border-brand-line bg-white px-3 text-sm text-brand-navy outline-none transition-[border-color,box-shadow] placeholder:text-brand-muted/80 focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/20 disabled:cursor-not-allowed disabled:bg-brand-ice disabled:text-brand-muted aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...useFieldProps(props)} className={cn(controlClass, 'h-10', className)} />
}

export function DateInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <Input type="date" {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...useFieldProps(props)} className={cn(controlClass, 'h-10 pr-8', className)}>{children}</select>
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...useFieldProps(props)} className={cn(controlClass, 'min-h-24 py-2.5 leading-6', className)} />
}

type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }

function Check({ type, label, hint, className, ...props }: CheckProps & { type: 'checkbox' | 'radio' }) {
  const id = useId()
  return (
    <label htmlFor={props.id ?? id} className={cn('flex items-start gap-2.5 text-sm text-brand-navy has-disabled:cursor-not-allowed has-disabled:opacity-60', className)}>
      <input
        id={id}
        {...props}
        type={type}
        className="mt-0.5 size-4 shrink-0 accent-brand-blue outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-brand-muted">{hint}</span>}
      </span>
    </label>
  )
}

export const Checkbox = (props: CheckProps) => <Check type="checkbox" {...props} />
export const Radio = (props: CheckProps) => <Check type="radio" {...props} />
