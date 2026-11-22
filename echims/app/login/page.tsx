'use client'

import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { FormEvent, useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from '@/lib/offline/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { Spinner } from '@/components/brand/logo-loader'

export default function LoginPage() {
  const { login, beginEntering } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [offline,setOffline]=useState(false)
  const [busy,setBusy]=useState(false)
  useEffect(()=>{const update=()=>setOffline(!navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if(busy)return
    setBusy(true)
    let result: {error?:string}
    try{result=await login(email,password)}catch{result={error:'Unable to sign in. Check your connection or saved offline account.'}}
    if (result.error) {
      // Only an error re-enables the form; on success it stays busy until the dashboard replaces this page.
      setBusy(false)
      setError(result.error)
      return
    }
    // The auth overlay covers this page until the dashboard has rendered, then crossfades into it.
    beginEntering()
    if (!navigator.onLine) { router.replace('/offline?path=%2Fdashboard'); return }
    // signInWithPassword has written the session cookie; confirm it before the server render reads it.
    await createClient().auth.getSession()
    router.replace('/dashboard')
    // Inside the offline shell the router's refresh is a full reload, which would cancel the navigation.
    if (window.location.pathname !== '/offline') router.refresh()
  }

  return (
    <AuthShell>
      <div className="auth-stagger">
        <h2 className="font-display text-3xl font-bold tracking-tight">Welcome back</h2>
        <p className="mt-2 text-[#5B6478]">{offline?'Sign in to your saved account on this device':'Sign in to your RHU account'}</p>
        {offline && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">Use the email and password you last used to sign in online on this browser. Saved access lasts seven days from online verification. New accounts and password resets require internet.</p>}
      </div>
      <form onSubmit={handleSubmit} className="auth-stagger mt-8 space-y-5">
        <div>
          <label htmlFor="email" className="text-sm font-semibold">Username or email</label>
          <input id="email" type="text" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} mt-2`} placeholder="you@example.com" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-semibold">Password</label>
            <Link href="/forgot-password" className="rounded text-sm font-semibold text-[#087DB9] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9]">Forgot password?</Link>
          </div>
          <div className="relative mt-2">
            <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} pr-12`} placeholder="Enter your password" required />
            <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#5B6478] transition-colors hover:bg-[#EAF6FA] hover:text-[#03045E]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </div>
        <label className="flex w-fit items-center gap-2 text-sm text-[#5B6478]"><input type="checkbox" className="h-4 w-4 accent-[#087DB9]" />Remember me</label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 animate-in fade-in slide-in-from-top-1 duration-200">{error}</p>}
        <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#087DB9] font-semibold text-white shadow-sm shadow-[#087DB9]/30 transition-colors hover:bg-[#056d9e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB9] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70">
          {busy && <Spinner label="Signing in" />}
          {busy?'Signing in…':offline?'Sign in offline':'Sign in'}
        </button>
      </form>
      <div className="auth-stagger">
        <p className="mt-7 text-center text-sm text-[#5B6478]">New to eCHIMS? <Link href="/register" className="font-semibold text-[#087DB9] hover:underline">Create an account</Link></p>
        <p className="mt-8 text-center text-xs leading-5 text-[#8A93A6]">By signing in, you agree to our <Link href="/terms" className="text-[#087DB9] hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-[#087DB9] hover:underline">Privacy Policy</Link></p>
      </div>
    </AuthShell>
  )
}

const inputClass = 'h-12 w-full rounded-xl border border-[#C9DCE6] bg-white px-4 text-base text-[#03045E] placeholder:text-[#8A93A6] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#087DB9] focus:ring-4 focus:ring-[#087DB9]/15'
