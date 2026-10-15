'use client'
import { useEffect } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import { offlineScope } from '@/lib/offline/fetch'
import { prepareSystemViews } from '@/lib/offline/prepare'
// Loaded API views save on every successful read. This also prepares linked
// profiles/options proactively, so clicking a child after a sudden outage works.
export function AutomaticPreparation(){
  const {user,isReady}=useAuth(),scope=user?offlineScope(user):''
  useEffect(()=>{
    if(!user||!isReady)return
    let active=true,busy=false,lastStarted=0
    const current=()=>active
    const report=(message:string)=>{if(active)window.dispatchEvent(new CustomEvent('echims-offline-preparation',{detail:message}))}
    async function prepare(){
      if(!active||busy||!navigator.onLine||Date.now()-lastStarted<60000)return
      busy=true;lastStarted=Date.now()
      try{
        const result=await prepareSystemViews(user!,report,current)
        if(!result.cancelled)report(`Automatically saved ${result.completed} views, including ${result.profiles} child profiles.${result.failures.length?' Some views are still unavailable; preparation will retry online.':' Offline views are up to date.'}`)
      }catch{report('Automatic preparation paused. Saved views and drafts are retained; retrying when connected.')}
      finally{busy=false}
    }
    const reconnect=()=>{lastStarted=0;void prepare()}
    void prepare()
    const timer=window.setInterval(()=>{void prepare()},10*60*1000)
    window.addEventListener('online',reconnect)
    return()=>{active=false;clearInterval(timer);window.removeEventListener('online',reconnect)}
  },[user?.id,scope,isReady])
  return null
}
