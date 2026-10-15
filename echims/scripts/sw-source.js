/* Workbox-build injects the public-asset manifest; private data stays in owner-scoped IndexedDB. */
const assets = self.__WB_MANIFEST;
const CACHE = 'echims-public-__BUILD__';
const urls = new Set(assets.map(x => new URL(x.url, self.location.origin).pathname));
self.addEventListener('install', event => {
 event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(assets.map(x => x.url))));
 // Do not skipWaiting: keep an open form on its current application version.
});
self.addEventListener('activate', event => {
 event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('echims-public-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})());
});
self.addEventListener('fetch', event => {
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // No API caching, mutation replay, authentication caching, or RSC response caching.
 if(url.pathname.startsWith('/api/')||request.headers.get('RSC')==='1'||url.searchParams.has('_rsc'))return;
 if(urls.has(url.pathname)&&url.pathname!=='/offline'){
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(request)));return;
 }
 if(request.mode==='navigate')event.respondWith((async()=>{
  if(url.pathname==='/offline')return (await caches.open(CACHE)).match('/offline').then(r=>r||fetch(request));
  try{return await fetch(request)}catch{
   // A document redirect keeps Next's /offline tree consistent with the address bar.
   return Response.redirect(new URL('/offline',self.location.origin).href,302);
  }
 })());
});
