'use client'
import {useEffect,useRef,useState} from 'react'
// Updating is explicit: neither an install nor controllerchange silently reloads a form.
export function OfflineUpdateNotice(){
 const [waiting,setWaiting]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[online,setOnline]=useState(true)
 const registration=useRef<ServiceWorkerRegistration|null>(null),requested=useRef(false)
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return
  let alive=true,lastCheck=0
  const connection=()=>{setOnline(navigator.onLine);if(navigator.onLine)void check()}
  const controller=()=>{if(requested.current)window.location.reload()}
  const blocked=(event:MessageEvent)=>{if(event.data?.type==='ECHIMS_UPDATE_BLOCKED'){requested.current=false;setBusy(false);setMessage(String(event.data.message))}}
  const inspect=()=>{if(alive)setWaiting(!!registration.current?.waiting)}
  async function check(){
   if(!alive||!navigator.onLine||Date.now()-lastCheck<60000)return
   lastCheck=Date.now()
   try{await registration.current?.update();inspect()}catch{if(alive)setMessage('Could not check the offline app update. Reconnect and try again.')}
  }
  const found=()=>{const worker=registration.current?.installing;worker?.addEventListener('statechange',()=>{inspect();if(alive && worker.state==='redundant')setMessage('Offline preparation did not finish. Reconnect and reload to retry.')});inspect()}
  if(process.env.NODE_ENV==='production'){
   void navigator.serviceWorker.register('/offline-worker',{scope:'/',updateViaCache:'none'}).then(r=>{
    if(!alive)return;registration.current=r;inspect();r.addEventListener('updatefound',found);found();void check()
   }).catch(()=>{if(alive)setMessage('Offline app preparation failed. Run a fresh production build and reconnect.')})
  }else if(navigator.serviceWorker.controller){setMessage('Development mode: the offline shell uses the last production build. Test current offline screens with npm run build, then npm run start.')}
  setOnline(navigator.onLine)
  window.addEventListener('online',connection);window.addEventListener('offline',connection);window.addEventListener('focus',check)
  navigator.serviceWorker.addEventListener('controllerchange',controller);navigator.serviceWorker.addEventListener('message',blocked)
  const timer=window.setInterval(()=>void check(),5*60*1000)
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('focus',check);navigator.serviceWorker.removeEventListener('controllerchange',controller);navigator.serviceWorker.removeEventListener('message',blocked);registration.current?.removeEventListener('updatefound',found)}
 },[])
 function apply(){const worker=registration.current?.waiting;if(!worker||!online)return;requested.current=true;setBusy(true);setMessage('Applying the prepared app update…');worker.postMessage({type:'ECHIMS_ACTIVATE_UPDATE'})}
 if(!waiting&&!message)return null
 return <aside role="status" className="space-y-2 border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">{waiting&&<><p>A newer offline app is ready. Save unfinished entries as drafts and close other eCHIMS tabs before updating. Saved drafts are retained.</p><button type="button" disabled={busy||!online} onClick={apply} className="rounded-lg border border-sky-400 bg-white px-3 py-2 font-semibold disabled:opacity-50">{busy?'Updating…':'Update app and reload'}</button></>}{message&&<p>{message}</p>}</aside>
}
