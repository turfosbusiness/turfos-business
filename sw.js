const V='turfos-v40-d1-primary';
const SHELL=['app.html','index.html','customer.html','business.html','offline.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','turfos-logo.png','turfos-logo.svg','turfos-icon.svg','d1-migrate.html'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
  if(!(u.origin===location.origin||u.hostname==='cdnjs.cloudflare.com'))return;
  const isPage=e.request.mode==='navigate'||u.pathname.endsWith('.html');
  if(isPage){e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(V).then(c=>c.put(e.request,copy))}return r}).catch(async()=>await caches.match(e.request)||await caches.match('app.html')||await caches.match('offline.html')));return}
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok||r.type==='opaque'){const copy=r.clone();caches.open(V).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match('offline.html'))));
});
