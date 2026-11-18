type Tab={label:string;href:string;module:string}
export function withTransferInbox(tabs:Tab[],role:string|undefined):Tab[]{
 const archive='/child-profiling/archived',inbox='/child-profiling/transfers'
 const allowed=['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(role??'')
 const rest=tabs.filter(tab=>tab.href!==archive&&tab.href!==inbox)
 if(!allowed)return rest
 const archiveIndex=tabs.findIndex(tab=>tab.href===archive)
 const index=archiveIndex<0?rest.length:tabs.slice(0,archiveIndex).filter(tab=>tab.href!==archive&&tab.href!==inbox).length
 rest.splice(index,0,{label:'Archived Children',href:archive,module:'Child Profiling'},{label:'Transfer Inbox',href:inbox,module:'Child Profiling'})
 return rest
}
