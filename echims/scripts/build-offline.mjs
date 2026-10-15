import { readFile, writeFile } from 'node:fs/promises'
import { injectManifest, getManifest } from 'workbox-build'
import { createHash } from 'node:crypto'
// Build the public /offline page before running this script. Never copy dashboard HTML.
const shell=await readFile('.next/server/app/offline.html')
if(shell.includes(Buffer.from('"accountStatus":"APPROVED"')))throw new Error('Refusing to precache a personalized shell.')
const assetManifest=await getManifest({globDirectory:'.next/static',globPatterns:['**/*.{js,css,woff,woff2}'],maximumFileSizeToCacheInBytes:12*1024*1024,modifyURLPrefix:{'':'/_next/static/'}})
if(assetManifest.warnings.length)throw new Error(assetManifest.warnings.join('\n'))
const htmlHash=createHash('sha256').update(shell).digest('hex')
const additional=[...assetManifest.manifestEntries,{url:'/offline',revision:htmlHash}]
for(const icon of ['offline-icon.svg','icon.svg','sidebar-logo.png','apple-icon.png','landing-logo.png','login-logo.png','logo.png','icon-light-32x32.png','icon-dark-32x32.png']){
 try{const bytes=await readFile('public/'+icon);additional.push({url:'/'+icon,revision:createHash('sha256').update(bytes).digest('hex')})}catch{}
}
const manifest=await readFile('.next/server/app/manifest.webmanifest.body')
additional.push({url:'/manifest.webmanifest',revision:createHash('sha256').update(manifest).digest('hex')})
const source=await readFile('scripts/sw-source.js','utf8')
const buildId=createHash('sha256').update(JSON.stringify(additional)).digest('hex')
await writeFile('.next/echims-sw-source.js',source.replace('__BUILD__',buildId))
const result=await injectManifest({swSrc:'.next/echims-sw-source.js',swDest:'public/sw.js',globDirectory:'public',globPatterns:[],additionalManifestEntries:additional,maximumFileSizeToCacheInBytes:12*1024*1024})
if(result.warnings.length)throw new Error(result.warnings.join('\n'))
console.log(`Offline public shell and ${result.count} public assets prepared.`)
