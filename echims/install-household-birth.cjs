const fs=require('node:fs'),ts=require('typescript');
const modal='components/children/child-form-modal.tsx',route='app/api/children/route.ts';
for(const file of [modal,route])if(!fs.existsSync(file))throw Error(`Missing ${file}; run from the echims root. No files changed.`);
function parse(file,text){const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);if(ast.parseDiagnostics.length)throw Error(`Cannot parse ${file}. No files changed.`);return ast}
function section(ast,title){let found;function walk(n){if(ts.isJsxElement(n) && n.openingElement.tagName.getText(ast)==='Section' && n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a) && a.name.getText(ast)==='title' && a.initializer && ts.isStringLiteral(a.initializer) && a.initializer.text===title))found=n;ts.forEachChild(n,walk)}walk(ast);if(!found)throw Error(`Cannot find ${title} section. No files changed.`);return found}
function replaceChecked(s,pattern,replacement,label){if(!pattern.test(s))throw Error(`Cannot locate ${label}; use manual integration. No files changed.`);return s.replace(pattern,replacement)}
let form=fs.readFileSync(modal,'utf8'),api=fs.readFileSync(route,'utf8');const originalForm=form,originalApi=api;
if(!form.includes('ECHIMS_BIRTH_FIELDS_V1')){
 form=replaceChecked(form,/date_of_birth: "",/, 'date_of_birth: "",\n  birth_weight_kg: "",\n  birth_length_cm: "",','empty form');
 form=replaceChecked(form,/date_of_birth: child\.date_of_birth \?\? "",/, 'date_of_birth: child.date_of_birth ?? "",\n          birth_weight_kg: child.birth_weight_kg == null ? "" : String(child.birth_weight_kg),\n          birth_length_cm: child.birth_length_cm == null ? "" : String(child.birth_length_cm),','child form hydration');
 let ast=parse(modal,form),info=section(ast,'Child Information');const at=info.closingElement.getStart(ast);
 form=form.slice(0,at)+`{/* ECHIMS_BIRTH_FIELDS_V1 */}\n<label className="grid gap-1 text-sm"><span>Birth weight (kg) — optional</span><input className="rounded-lg border border-border p-2" type="number" step="any" min="0" value={String(form.birth_weight_kg ?? '')} onChange={e=>set('birth_weight_kg',e.target.value)}/></label>\n<label className="grid gap-1 text-sm"><span>Birth length / height (cm) — optional</span><input className="rounded-lg border border-border p-2" type="number" step="any" min="0" value={String(form.birth_length_cm ?? '')} onChange={e=>set('birth_length_cm',e.target.value)}/></label>\n<p className="text-xs text-muted-foreground sm:col-span-3">Measurements at birth only. Leave blank if unknown; later nutritional assessments are recorded separately.</p>\n`+form.slice(at);
}
if(!form.includes('ECHIMS_TRANSFER_HOUSEHOLD_INLINE_V1')){
 const ast=parse(modal,form),hh=section(ast,'Household'),at=hh.openingElement.end;
 form=form.slice(0,at)+`\n{/* ECHIMS_TRANSFER_HOUSEHOLD_INLINE_V1 */}\n{mode==='edit' && childId && !form.household_id && <TransferredHouseholdRegistration childId={childId} onSaved={()=>{\n void globalThis.fetch('/api/children?childId='+childId,{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('Refresh the profile to see the saved household.');return response.json()}).then(d=>{if(!d.child || d.child.child_id!==childId)return;setForm(previous=>({...previous,household_id:d.child.household_id?String(d.child.household_id):'',address:d.child.address??previous.address}));setHouseholdQuery(d.household?.household_address??'');}).catch(()=>setMessage('Household was saved. Close and reopen this form to refresh its link.'));\n}}/>}\n`+form.slice(at);
 const first=ast.statements.find(ts.isImportDeclaration);if(!first)throw Error('No modal imports found. No files changed.');const pos=first.getStart(ast);
 form=form.slice(0,pos)+"import {TransferredHouseholdRegistration} from '@/components/children/transferred-household-registration'\n"+form.slice(pos);
}
if(!api.includes('ECHIMS_BIRTH_API_V1')){
 api=replaceChecked(api,/child_id, first_name, middle_name, last_name, date_of_birth/g, 'child_id, first_name, middle_name, last_name, date_of_birth, birth_weight_kg, birth_length_cm','child SELECT');
 api=replaceChecked(api,/const informantError = normalizeInformant\(body\);/g, 'const birthError = normalizeChildBirthMeasures(body);\n  if(birthError) return invalid(birthError);\n  const informantError = normalizeInformant(body);','body validation');
 // Add native registration INSERT fields when present. Offline RPC inserts use the SQL submission trigger.
 api=api.replace(/date_of_birth: dob,\s*sex,/, 'date_of_birth: dob,\n      birth_weight_kg: body.birth_weight_kg ?? null,\n      birth_length_cm: body.birth_length_cm ?? null,\n      sex,');
 const ast=parse(route,api);let fields;function walk(n){if(ts.isVariableDeclaration(n) && n.name.getText(ast)==='childFields' && n.initializer && ts.isArrayLiteralExpression(n.initializer))fields=n.initializer;ts.forEachChild(n,walk)}walk(ast);
 if(!fields)throw Error('Cannot find childFields update allowlist. No files changed.');
 let text=fields.getText(ast).slice(0,-1).trimEnd();if(!text.endsWith(','))text+=',';text+="\n    'birth_weight_kg', 'birth_length_cm',\n  ]";api=api.slice(0,fields.getStart(ast))+text+api.slice(fields.end);
 api+=`\n// ECHIMS_BIRTH_API_V1\nfunction normalizeChildBirthMeasures(body: Record<string, unknown>): string | null {\n for(const [key,label] of [['birth_weight_kg','Birth weight in kg'],['birth_length_cm','Birth length in cm']] as const){\n  if(!(key in body))continue;const raw=body[key];if(raw===null || (typeof raw==='string' && raw.trim()==='')){body[key]=null;continue}\n  if(typeof raw!=='string' && typeof raw!=='number')return label+' must be a positive finite number or blank.';\n  const value=Number(raw);if(!Number.isFinite(value) || value<=0)return label+' must be a positive finite number or blank.';body[key]=value;\n }return null;\n}\n`;
}
parse(modal,form);parse(route,api);
for(const [file,before,after] of [[modal,originalForm,form],[route,originalApi,api]]){if(before===after){console.log(`Already installed: ${file}`);continue}fs.writeFileSync(file+`.household-birth-${Date.now()}.bak`,before,{flag:'wx'});fs.writeFileSync(file,after);console.log(`Updated ${file}`)}
// Optional read-only display on the actual profile implementation, not aliases.
const profileCandidates=['app/(dashboard)/children/[childId]/page.tsx','app/(dashboard)/child-profiling/children/[childId]/page.tsx'].filter(p=>fs.existsSync(p) && fs.readFileSync(p,'utf8').includes('export function ChildProfileView'));
if(profileCandidates.length===1){
 const file=profileCandidates[0],before=fs.readFileSync(file,'utf8');
 if(!before.includes('ECHIMS_BIRTH_PROFILE_V1')){
  const ast=parse(file,before);let card;function visit(n){if(ts.isJsxElement(n) && n.openingElement.tagName.getText(ast)==='SectionCard' && n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a) && a.name.getText(ast)==='title' && a.initializer && ts.isStringLiteral(a.initializer) && ['Child Information','Personal Information'].includes(a.initializer.text)))card=n;ts.forEachChild(n,visit)}visit(ast);
  const first=ast.statements.find(ts.isImportDeclaration);
  if(card && first){const at=card.closingElement.getStart(ast);let after=before.slice(0,at)+"{/* ECHIMS_BIRTH_PROFILE_V1 */}<ChildBirthMeasurements child={child}/>\n"+before.slice(at);const pos=first.getStart(ast);after=after.slice(0,pos)+"import {ChildBirthMeasurements} from '@/components/children/child-birth-measurements'\n"+after.slice(pos);parse(file,after);fs.writeFileSync(file+`.birth-display-${Date.now()}.bak`,before,{flag:'wx'});fs.writeFileSync(file,after);console.log(`Updated birth display in ${file}`)}else console.log('Add the read-only birth display manually using the README.');
 }
}else console.log('Profile implementation not uniquely identified; use manual birth display instructions.');
