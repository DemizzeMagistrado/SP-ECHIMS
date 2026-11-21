'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { authInputClass, authSubmitClass } from '@/components/auth/auth-form-style'
import { Spinner } from '@/components/brand/logo-loader'

export function GuardianAuthInput({ label, hint, password, ...input }: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  password?: boolean
}) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[#03045E]">{label}</label>
      <div className="relative">
        <input
          {...input}
          id={id}
          type={password ? visible ? 'text' : 'password' : input.type}
          aria-describedby={hint ? id + '-hint' : undefined}
          className={`${authInputClass}${password ? ' pr-12' : ''}`}
        />
        {password && (
          <button
            type="button"
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#5B6478] hover:bg-[#EAF6FA] hover:text-[#03045E]"
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {hint && <p id={id + '-hint'} className="mt-1.5 text-xs text-brand-muted">{hint}</p>}
    </div>
  )
}

export function GuardianAuthSubmit({ busy, label }: { busy: boolean; label: string }) {
  return <button type="submit" disabled={busy} className={authSubmitClass}>{busy && <Spinner label="Please wait" />}{label}</button>
}

export async function submitGuardianAuth(path: 'login' | 'register', body: unknown) {
  const response = await fetch(`/api/guardian/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true) throw new Error(result?.error ?? 'Unable to connect. Please try again.')
}
