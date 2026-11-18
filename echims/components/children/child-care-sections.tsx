'use client'
import {CheckupAppointmentsSection} from '@/components/children/checkup-appointments-section'
import {RhuTransferSection} from '@/components/children/rhu-transfer-section'
type Props={childId:number;householdId:number|null;barangayId:number|null;dateOfBirth:string;registryStatus:string;canEdit:boolean;onSaved?:()=>void}
export function ChildCareSections(props:Props){
 const validChild=Number.isSafeInteger(props.childId) && props.childId>0
 if(!validChild)return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm">Unable to load child care sections: use the database child_id from the loaded child record.</p>
 const assigned=props.barangayId!==null && Number.isSafeInteger(props.barangayId) && props.barangayId>0
 return <div className="space-y-6">
  <CheckupAppointmentsSection childId={props.childId} dateOfBirth={props.dateOfBirth} registryStatus={props.registryStatus} canEdit={props.canEdit}/>
  <RhuTransferSection child={{childId:props.childId,householdId:props.householdId,barangayId:props.barangayId??0,dateOfBirth:props.dateOfBirth,registryStatus:props.registryStatus}} canEdit={props.canEdit && assigned} onSaved={props.onSaved}/>
 </div>
}
