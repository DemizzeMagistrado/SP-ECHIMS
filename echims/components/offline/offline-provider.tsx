'use client'
import { useEffect, useState, type ReactNode } from 'react'
export function OfflineProvider({children}:{children:ReactNode}){
 const [offline,setOffline]=useState(false)
 const [workerError,setWorkerError]=useState('')
 useEffect(()=>{
  const update=()=>setOffline(!navigator.onLine);update()
  window.addEventListener('online',update);window.addEventListener('offline',update)
  if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator){
   void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>setWorkerError('Offline page preparation failed. Retry while online.'))
  }
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}
 },[])
 return <>{offline&&<div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">Offline — entries saved on this device remain pending synchronization. <a className="font-semibold underline" href="/offline">Open offline workspace</a></div>}{workerError&&<div role="alert" className="bg-rose-50 p-2 text-sm text-rose-700">{workerError}</div>}{children}</>
}
