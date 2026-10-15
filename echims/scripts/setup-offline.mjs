import { readFile, writeFile } from 'node:fs/promises'
const path='package.json',pkg=JSON.parse(await readFile(path,'utf8'))
pkg.devDependencies??={};pkg.devDependencies['workbox-build']='^7.3.0'
pkg.scripts??={};pkg.scripts['build:offline']='node scripts/build-offline.mjs'
if(!pkg.scripts.build.includes('build:offline'))pkg.scripts.build+=' && node scripts/build-offline.mjs'
await writeFile(path,JSON.stringify(pkg,null,2)+'\n')
console.log('Updated package.json. Run pnpm install to update pnpm-lock.yaml, then pnpm build.')
