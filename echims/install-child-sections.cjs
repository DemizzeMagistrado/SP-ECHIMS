/* Run from the echims project root after copying project/ files. */
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const supplied=process.argv[2];
const candidates=supplied?[supplied]:['app/(dashboard)/children/[childId]/page.tsx','app/(dashboard)/child-profiling/children/[childId]/page.tsx'];
const matches=candidates.filter(p=>fs.existsSync(p) && fs.readFileSync(p,'utf8').includes('export function ChildProfileView'));
if(matches.length!==1)throw new Error('Could not identify exactly one ChildProfileView implementation. Pass its quoted file path as the script argument. No file changed.');
const file=matches[0],source=fs.readFileSync(file,'utf8');
if(!/child\.child_id/.test(source) || !/\bhousehold_id\b/.test(source) || !/\bbarangay_id\b/.test(source) || !/\bmutate\b/.test(source))throw new Error('Profile structure differs from the supplied version. Use the README manual mount. No file changed.');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[],mounts=[],removes=[];
function outerExpression(node){let p=node.parent;while(p && !ts.isJsxElement(p) && !ts.isJsxFragment(p)){if(ts.isJsxExpression(p))return p;p=p.parent}return node}
function visit(node){
 if(ts.isJsxSelfClosingElement(node)){
  const name=node.tagName.getText(ast);
  if(name==='CheckupAppointmentsSection' || name==='ChildCareSections')mounts.push(node);
  if(name==='ChildMovementSection' || name==='RhuTransferSection')removes.push(outerExpression(node));
 }
 if(ts.isJsxExpression(node) && node.expression && /movements\s*&&/.test(node.expression.getText(ast)) && /Movement History/.test(node.getText(ast)))removes.push(node);
 ts.forEachChild(node,visit);
}
visit(ast);
if(mounts.length!==1)throw new Error('Expected exactly one checkup/child-care component mount. Use the README manual mount. No file changed.');
const mount=mounts[0];
const jsx=`<ChildCareSections\n        childId={child.child_id}\n        householdId={child.household_id}\n        barangayId={child.barangay_id}\n        dateOfBirth={child.date_of_birth}\n        registryStatus={child.status ?? ''}\n        canEdit={canEdit}\n        onSaved={() => { void mutate() }}\n      />`;
edits.push({start:mount.getStart(ast),end:mount.end,text:jsx});
for(const node of removes){if(node.getStart(ast)<=mount.getStart(ast) && node.end>=mount.end)throw new Error('Unexpected nested child section. No file changed.');edits.push({start:node.getStart(ast),end:node.end,text:''})}
if(!source.includes("from '@/components/children/child-care-sections'") && !source.includes('from "@/components/children/child-care-sections"')){
 const firstImport=ast.statements.find(ts.isImportDeclaration);if(!firstImport)throw new Error('No import declaration found. No file changed.');
 edits.push({start:firstImport.getStart(ast),end:firstImport.getStart(ast),text:"import { ChildCareSections } from '@/components/children/child-care-sections'\n"});
}
const unique=[...new Map(edits.map(e=>[`${e.start}:${e.end}`,e])).values()].sort((a,b)=>b.start-a.start);
for(let i=1;i<unique.length;i++)if(unique[i].end>unique[i-1].start)throw new Error('Overlapping edits; no file changed.');
let result=source;for(const edit of unique)result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
const check=ts.createSourceFile(file,result,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);if(check.parseDiagnostics.length)throw new Error('Generated JSX did not parse; no file changed.');
if(result===source){console.log('Child care sections are already mounted.');process.exit(0)}
const backup=file+`.before-child-care-${Date.now()}.bak`;fs.writeFileSync(backup,source,{flag:'wx'});fs.writeFileSync(file,result);
console.log(`Mounted checkups, Movement History and RHU Transfers in ${file}. Backup: ${backup}`);
