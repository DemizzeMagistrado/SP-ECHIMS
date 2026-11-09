'use client'

import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { FormEvent, useState, useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { Logo } from '@/components/brand/logo'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [offline,setOffline]=useState(false)
  const [busy,setBusy]=useState(false)
  const [entering,setEntering]=useState(false)
  useEffect(()=>{const update=()=>setOffline(!navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if(busy)return
    setBusy(true)
    let result: {error?:string}
    try{result=await login(email,password)}catch{result={error:'Unable to sign in. Check your connection or saved offline account.'}}finally{setBusy(false)}
    if (result.error) {
      setError(result.error)
      return
    }
    // Hard navigation (not router.push) so the dashboard mounts with the auth cookie
    // already visible to getUser()/SSR. router.push races the just-written session
    // cookie — on the first try the layout sees isReady=true, user=null, and bounces
    // back to /login; a second attempt works only because the cookie is finally there.
    // Cover the page with the dashboard's opening color first, so the hard navigation
    // reads as one continuous transition instead of a blank flash.
    setEntering(true)
    const target=navigator.onLine?'/dashboard':'/offline?path=%2Fdashboard'
    window.setTimeout(()=>window.location.assign(target),280)
  }

  return (
    <AuthShell>
      {entering && (
        <div role="status" className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[linear-gradient(180deg,#CAF0F8_0%,#E4F6FA_40%,#F1FAFC_100%)] animate-in fade-in duration-300">
          <Logo size={52} className="animate-in fade-in zoom-in-95 duration-500" />
          <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#03045E]"><Loader2 size={16} aria-hidden className="animate-spin" />Opening your dashboard…</p>
        </div>
      )}
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
          {busy && <Loader2 size={18} aria-hidden className="animate-spin" />}
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
