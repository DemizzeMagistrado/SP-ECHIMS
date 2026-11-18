const fs=require('node:fs');
if(!fs.existsSync('package.json')||!fs.existsSync('scripts/build-offline.mjs'))throw Error('Run from the echims project root after copying project files.');
// Next supports one active config; the delivered .mjs contains the uploaded settings plus tracing/root.
if(fs.existsSync('next.config.ts')){const backup='next.config.ts.offline-backup-'+Date.now();fs.renameSync('next.config.ts',backup);console.log('Preserved duplicate config as '+backup)}
const p=JSON.parse(fs.readFileSync('package.json','utf8'));if(!p.scripts?.build?.includes('scripts/build-offline.mjs')&&!p.scripts?.build?.includes('build:offline'))throw Error('Your build script must run the offline generator after next build. See README.');
console.log('Offline configuration ready. Stop the current server, run npm run build, then npm run start. Do not delete site data or drafts.');
