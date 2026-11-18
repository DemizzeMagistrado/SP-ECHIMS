const fs=require('node:fs');
function edit(file,marker,change){if(!fs.existsSync(file)){console.log(`Not found: ${file}. Use manual instructions.`);return}const source=fs.readFileSync(file,'utf8');if(source.includes(marker)){console.log(`Already installed: ${file}`);return}const next=change(source);if(!next){console.log(`Unrecognized structure: ${file}. Use manual instructions.`);return}fs.writeFileSync(file+`.transfer-links-${Date.now()}.bak`,source,{flag:'wx'});fs.writeFileSync(file,next);console.log(`Updated ${file}`)}
edit('components/dashboard/module-tabs.tsx','ECHIMS_ARCHIVED_CHILDREN_TAB',s=>{
 const token='  const tabs = [';if(!s.includes(token))return null;
 return s.replace(token,`  // ECHIMS_ARCHIVED_CHILDREN_TAB\n  if(parent === 'Child Profiling' && ['Public Health Nurse','Rural Health Midwife','Barangay Health Worker'].includes(role) && !existingTabs.some(tab=>tab.href==='/child-profiling/archived')) {\n    existingTabs.push({label:'Archived Children',href:'/child-profiling/archived',module:'Child Profiling'})\n  }\n\n${token}`)
});
edit('components/dashboard/top-nav.tsx','ECHIMS_TRANSFER_NOTIFICATION_LINK',s=>{
 const start=s.indexOf('function notificationTarget(');if(start<0)return null;const pos=s.indexOf('\n  if (',start);if(pos<0)return null;
 return s.slice(0,pos)+"\n  // ECHIMS_TRANSFER_NOTIFICATION_LINK\n  if(item.source_module === 'CHILD_TRANSFER') return {href:'/child-profiling/transfers',label:'Review transfer'}\n"+s.slice(pos)
});
