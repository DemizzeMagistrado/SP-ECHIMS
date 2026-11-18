export function ChildBirthMeasurements({child}:{child:unknown}){
 const record=child && typeof child==='object'?child as Record<string,unknown>:{}
 const show=(value:unknown,unit:string)=>{if(value===null || value===undefined || value==='')return 'Not recorded';const n=Number(value);return Number.isFinite(n) && n>0?`${n} ${unit}`:'Not recorded'}
 return <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Birth weight</p><p className="text-sm font-medium">{show(record.birth_weight_kg,'kg')}</p></div><div><p className="text-xs text-muted-foreground">Birth length / height</p><p className="text-sm font-medium">{show(record.birth_length_cm,'cm')}</p></div></div>
}
