'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { prepareSystemViews } from '@/lib/offline/prepare'

export function SystemOfflineTools() {
  const { user, isReady } = useAuth()
  const owner = useRef(user?.id); owner.current = user?.id
  const active = useRef(true)
  useEffect(() => {active.current=true; return () => {active.current=false}}, [])
  const [online,setOnline]=useState<boolean|null>(null)
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { setMessage(''); setBusy(false) }, [user?.id])
  useEffect(()=>{const update=(event:Event)=>setMessage(String((event as CustomEvent<string>).detail));window.addEventListener('echims-offline-preparation',update);return()=>window.removeEventListener('echims-offline-preparation',update)},[])
  async function prepare() {
    if (!user || !isReady || busy) return
    if (!navigator.onLine) { setMessage('Reconnect to prepare current records.'); return }
    const id = user.id
    setBusy(true)
    try {
      const result = await prepareSystemViews(user, text => {if(owner.current===id)setMessage(text)}, () => active.current && owner.current===id)
      if(owner.current===id && !result.cancelled) setMessage(`Prepared ${result.completed} views and ${result.profiles} child profiles.${result.failures.length ? ` ${result.failures.length} views could not be saved. Reconnect and retry.` : ' Ready for offline use.'} Other report versions and filters are saved when opened online.`)
    } catch { if(owner.current===id)setMessage('Preparation did not finish. Reconnect and retry; existing drafts are retained.') }
    finally { if(owner.current===id)setBusy(false) }
  }

  return <details className="relative"><summary className="cursor-pointer list-none rounded-lg bg-[#F3F4F6] px-3 py-2 text-xs font-medium text-[#6B7280] hover:bg-sky-50">{online===null?'Checking connection…':online?'Online':'Offline access'}</summary>
    <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
      <p>Views save automatically while online. Child profiles and program options prepare at sign-in and reconnection. Saved views belong to this signed-in account.</p>
      <button type="button" disabled={busy || !user || !isReady || online!==true} onClick={() => void prepare()} className="rounded-lg bg-[#0077B6] px-3 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Preparing…' : 'Refresh saved views'}</button>
      {message && <p role="status" className="break-words text-xs">{message}</p>}
      <p className="text-xs text-slate-500">Use each program’s Sync / pending drafts panel to upload and resolve entries. Stock, SMS delivery, approvals, and account changes require the server.</p>
    </div>
  </details>
}
