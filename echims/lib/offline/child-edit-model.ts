import { normalizePhMobile } from '@/lib/phone'
export type EditSnapshot={currentUserId:string;revision:number;child:Record<string,unknown>;profile:Record<string,unknown>|null;guardian:Record<string,unknown>|null;household:Record<string,unknown>|null}
export type EditChanges={child:Record<string,unknown>;profile:Record<string,unknown>;household:Record<string,unknown>;guardian:Record<string,unknown>}
export const childEditFields=['first_name','middle_name','last_name','date_of_birth','sex','birth_place','address','birth_weight_kg','birth_length_cm','mother_name','father_name'] as const
export const profileEditFields=['relationship_to_household_head','civil_status','educational_attainment','religion','ethnicity','philhealth_id_number','philhealth_membership_type','philhealth_category','medical_history','last_menstrual_period','informant_name','informant_relationship','medical_history_structured'] as const
export function buildEditChanges(form:Record<string,string|boolean>,resolved:Record<string,unknown>,base:EditSnapshot):EditChanges{
 for(const k of ['barangay_id','household_id','guardian_id'])if(String(form[k]??'')!==String(base.child[k]??''))throw Error('Keep barangay, household and guardian links unchanged in a profile edit draft. Use Movement & Transfers for relocation; guardian reassignment requires an online update.')
 const result:EditChanges={child:{},profile:{},household:{},guardian:{}}
 const value=(v:unknown)=>typeof v==='string'?v.trim()||null:v??null
 for(const key of childEditFields){if(!(key in form))continue;let next:unknown=value(form[key]);if(key==='birth_length_cm' && next===value(base.child.birth_height_cm ?? base.child.birth_length_cm))continue;if(key==='sex')next=String(next??'').toUpperCase();if(key==='birth_weight_kg'||key==='birth_length_cm'){if(next!==null){next=Number(next);if(!Number.isFinite(next)||Number(next)<=0)throw Error('Birth measurements must be positive finite numbers or blank.')}}if(next!==value(base.child[key]))result.child[key]=next}
 for(const key of profileEditFields){if(!(key in form)&&!(key in resolved))continue;const next=value(key in resolved?resolved[key]:form[key]);if(JSON.stringify(next)!==JSON.stringify(value(base.profile?.[key])))result.profile[key]=next}
 for(const key of ['water_source_type','toilet_facility_type']){if(!(key in form)&&!(key in resolved))continue;const next=value(resolved[key]??form[key]);if(next!==value(base.household?.[key]))result.household[key]=next}
 const contact=value(form.guardian_contact_number);const oldContact=value(base.guardian?.contact_number);if((normalizePhMobile(String(contact??''))??contact)!==(normalizePhMobile(String(oldContact??''))??oldContact))result.guardian.contact_number=contact
 if(!Object.values(result).some(section=>Object.keys(section).length))throw Error('No profile changes to save.')
 return result
}
