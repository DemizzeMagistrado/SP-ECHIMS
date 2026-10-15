'use client'
import { useEffect,useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { offlineScope } from '@/lib/offline/fetch'
import { listChildDrafts,deleteChildDraft,type ChildRegistrationDraft } from '@/lib/child-registration-drafts'
import { submitSafeDraft } from '@/lib/offline/safe-submit'
import { ChildFormModal } from './child-form-modal'
export function ChildDraftPanel({onUploaded}:{onUploaded:()=>void}){
  const {user}=useAuth(),scope=user?offlineScope(user):''
  const [rows,setRows]=useState<ChildRegistrationDraft[]>([]),[selected,setSelected]=useState<ChildRegistrationDraft|null>(null),[error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false
    const refresh=()=>{if(user)listChildDrafts(user.id,scope).then(r=>{if(!cancelled)setRows(r)}).catch(e=>{if(!cancelled)setError(String(e.message))})}
    refresh();window.addEventListener('echims-child-drafts',refresh)
    return()=>{cancelled=true;window.removeEventListener('echims-child-drafts',refresh)}
  },[user?.id,scope])
  return <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <h2 className="font-semibold">Child registration drafts on this device ({rows.length})</h2>
    <p className="text-sm">Drafts stay here after reconnecting. Review each draft before uploading; they do not upload automatically.</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {rows.map(row=><div key={row.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm">
      <div><strong>{String(row.form.first_name)} {String(row.form.last_name)}</strong><p>Born {String(row.form.date_of_birth)} · {row.status==='DRAFT'?'Awaiting recorder review':row.safeRetry?'Submission uncertain — retry the original request to confirm its result.':'Older uncertain upload — reconcile server records before resubmission.'}</p></div>
      <div className="flex gap-2">{row.status==='UNCERTAIN'&&row.safeRetry&&<button className="rounded-lg border px-3 py-2" onClick={async()=>{try{await submitSafeDraft('CHILD',row);onUploaded()}catch(e){setError(e instanceof Error?e.message:'Retry failed.')}}}>Retry unchanged submission</button>}{row.status==='DRAFT'&&<button className="rounded-lg border px-3 py-2 hover:bg-sky-50" onClick={()=>setSelected(row)}>Review / Edit</button>}
      {row.status==='DRAFT'&&<button className="rounded-lg border px-3 py-2 hover:bg-red-50" onClick={async()=>{if(window.confirm('Delete this local draft?'))try{await deleteChildDraft(row)}catch(e){setError(e instanceof Error?e.message:'Unable to delete draft.')}}}>Delete draft</button>}</div>
    </div>)}
    {selected&&user&&selected.ownerId===user.id&&selected.scope===scope&&<ChildFormModal key={selected.requestId} mode="create" draft={selected} onClose={()=>setSelected(null)} onDraftSaved={()=>setSelected(null)} onSaved={()=>{setSelected(null);onUploaded()}}/>}
  </section>
}
