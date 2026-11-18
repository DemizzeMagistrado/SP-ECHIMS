'use client'
import {useEffect,useState} from 'react'
import useSWR from 'swr'
import {useAuth} from '@/components/auth/auth-provider'
import {readVaccinationView,vaccinationScope,VaccinationReadError,type CachedView} from '@/lib/vaccination-cache'
export function useVaccinationView<T>(url:string|null){
 const {user,isReady}=useAuth();const [online,setOnline]=useState(true)
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 const owner=isReady&&user?.accountStatus==='APPROVED'?user.id:null,scope=user?vaccinationScope(user):''
 const query=useSWR<CachedView<T>>(owner&&url?['vaccination-view',owner,scope,url,online]:null,()=>readVaccinationView<T>(owner!,scope,url!),{shouldRetryOnError:false,revalidateOnFocus:online,keepPreviousData:true})
 const denied=query.error instanceof VaccinationReadError&&[401,403].includes(query.error.status)
 const view=query.data?.ownerId===owner&&query.data.scope===scope&&!denied?query.data:undefined
 // A new filter keeps the previous rows on screen (the guard above still rejects another account's or scope's view);
 // isLoading is the first load only, and the top bar shows the refetch.
 return {data:view?.data,error:query.error,isLoading:query.isLoading&&!view,refreshing:query.isValidating&&Boolean(view),online,readOnly:!online||Boolean(view?.fromCache),savedAt:view?.savedAt,mutate:query.mutate}
}
