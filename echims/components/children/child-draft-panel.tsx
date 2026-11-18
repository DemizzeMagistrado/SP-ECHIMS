'use client'
import { useEffect,useState } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { offlineScope } from '@/lib/offline/fetch'
import { listChildDrafts,deleteChildDraft,type ChildRegistrationDraft } from '@/lib/child-registration-drafts'
import { submitSafeDraft } from '@/lib/offline/safe-submit'
import { ChildFormModal } from './child-form-modal'
import { toast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
export function ChildDraftPanel({onUploaded}:{onUploaded:()=>void}){
  const {user}=useAuth(),scope=user?offlineScope(user):'',confirm=useConfirm()
  const [rows,setRows]=useState<ChildRegistrationDraft[]>([]),[selected,setSelected]=useState<ChildRegistrationDraft|null>(null),[error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false
    const refresh=()=>{if(user)listChildDrafts(user.id,scope).then(r=>{if(!cancelled)setRows(r)}).catch(e=>{if(!cancelled)setError(String(e.message))})}
    refresh();window.addEventListener('echims-child-drafts',refresh)
    return()=>{cancelled=true;window.removeEventListener('echims-child-drafts',refresh)}
  },[user?.id,scope])
  // Nothing to show until a draft exists on this device.
  if(!rows.length&&!error&&!selected)return null
  return <section className="space-y-3 rounded-2xl border border-warn/25 bg-warn-soft p-4">
    <h2 className="font-semibold text-brand-navy">Registration drafts on this device</h2>
    <p className="text-sm">Drafts stay here after reconnecting. Review each draft before uploading; they do not upload automatically.</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {rows.map(row=><div key={row.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm">
      <div><strong>{String(row.form.first_name)} {String(row.form.last_name)}</strong><p>Born {String(row.form.date_of_birth)} · {row.status==='DRAFT'?'Awaiting recorder review':row.safeRetry?'Submission uncertain — retry the original request to confirm its result.':'Older uncertain upload — reconcile server records before resubmission.'}</p></div>
      <div className="flex gap-2">{row.status==='UNCERTAIN'&&row.safeRetry&&<Button variant="secondary" onClick={async()=>{try{await submitSafeDraft('CHILD',row);onUploaded()}catch(e){setError(e instanceof Error?e.message:'Retry failed.')}}}>Retry unchanged submission</Button>}{row.status==='DRAFT'&&<Button variant="secondary" onClick={()=>setSelected(row)}>Review / Edit</Button>}
      {row.status==='DRAFT'&&<Button variant="secondary" onClick={async()=>{if(await confirm({title:'Delete this local draft?',description:'This child registration has not been uploaded. Deleting it cannot be undone.',confirmLabel:'Delete draft',tone:'danger'}))try{await deleteChildDraft(row);toast.success('Local draft deleted.')}catch(e){setError(e instanceof Error?e.message:'Unable to delete draft.')}}}>Delete draft</Button>}</div>
    </div>)}
    {selected&&user&&selected.ownerId===user.id&&selected.scope===scope&&<ChildFormModal key={selected.requestId} mode="create" draft={selected} onClose={()=>setSelected(null)} onDraftSaved={()=>setSelected(null)} onSaved={()=>{setSelected(null);onUploaded()}}/>}
  </section>
}
