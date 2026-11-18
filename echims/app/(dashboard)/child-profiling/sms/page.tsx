import { ChildScheduleSmsPanel } from '@/components/sms/child-schedule-sms-panel'
export default async function ChildSmsPage({searchParams}:{searchParams:Promise<{childId?:string}>}){
 const {childId}=await searchParams
 const id=Number(childId)
 return <ChildScheduleSmsPanel childId={Number.isSafeInteger(id)&&id>0?id:undefined}/>
}
