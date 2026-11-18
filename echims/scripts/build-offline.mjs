import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { injectManifest, getManifest } from 'workbox-build'
import { createHash } from 'node:crypto'

// Resolve paths from this script, independent of the build runner's working directory.
process.chdir(fileURLToPath(new URL('../', import.meta.url)))
const hash = value => createHash('sha256').update(value).digest('hex')
async function optionalFile(path) {
  try { return await readFile(path) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

// Never substitute dashboard HTML or skip the public-shell check. A physical HTML file
// is useful locally, but cache revisions must not depend on platform-internal output paths.
const prerender = JSON.parse(await readFile('.next/prerender-manifest.json', 'utf8'))
const offlineRoute = prerender.routes?.['/offline']
if (!offlineRoute || offlineRoute.initialRevalidateSeconds !== false) {
  throw new Error('Offline shell is not a static prerendered route. Keep app/offline/page.tsx and the force-static app/offline/layout.tsx committed. Inspect the /offline entry in the Vercel route table.')
}
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim()
if (!buildId) throw new Error('Next build ID is missing; finish next build before preparing offline assets.')
const shell = await optionalFile('.next/server/app/offline.html')
if (shell?.includes(Buffer.from('"accountStatus":"APPROVED"'))) {
  throw new Error('Refusing to precache a personalized shell.')
}
const shellRevision = shell ? hash(shell) : hash(`public-offline-shell:${buildId}`)
if (!shell) console.log('Static /offline verified in prerender manifest; using build ID for its cache revision.')

const assetManifest = await getManifest({
  globDirectory: '.next/static', globPatterns: ['**/*.{js,css,woff,woff2}'],
  globIgnores: ['**/_*Manifest.js'], maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
  modifyURLPrefix: { '': '/_next/static/' },
})
if (assetManifest.warnings.length) throw new Error(assetManifest.warnings.join('\n'))
if (!assetManifest.manifestEntries.length) throw new Error('No Next static assets found; refusing to produce an empty offline bundle.')
const additional = [...assetManifest.manifestEntries, { url: '/offline', revision: shellRevision }]
for (const icon of ['favicon.ico', 'icon.png', 'apple-icon.png', 'brand/echims-wordmark-dark.png', 'brand/echims-wordmark-light.png', 'brand/echims-icon.png', 'brand/echims-mark.png']) {
  const bytes = await optionalFile((icon.startsWith('brand/') ? 'public/' : 'app/') + icon)
  if (bytes) additional.push({ url: '/' + icon, revision: hash(bytes) })
}
const manifest = await optionalFile('.next/server/app/manifest.webmanifest.body')
additional.push({ url: '/manifest.webmanifest', revision: manifest ? hash(manifest) : hash(`webmanifest:${buildId}`) })
const source = await readFile('scripts/sw-source.js', 'utf8')
const workerVersion = hash(JSON.stringify(additional))
await writeFile('.next/echims-sw-source.js', source.replace('__BUILD__', workerVersion))
const result = await injectManifest({
  swSrc: '.next/echims-sw-source.js', swDest: 'public/sw.js', globDirectory: 'public',
  globPatterns: [], additionalManifestEntries: additional, maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
})
if (result.warnings.length) throw new Error(result.warnings.join('\n'))
console.log(`Offline public shell and ${result.count} public assets prepared.`)

// Keep the deployment check: the runtime worker route must include the generated worker.
const trace = JSON.parse(await readFile('.next/server/app/offline-worker/route.js.nft.json', 'utf8'))
if (!trace.files.some(file => file.replaceAll('\\', '/').endsWith('/public/sw.js'))) {
  throw new Error('Offline worker missing from route trace. Check outputFileTracingIncludes.')
}
console.log('Offline worker endpoint verified: current generated worker included in deployment.')
