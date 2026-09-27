const V='turfos-v41-d1-primary-organized';
const SHELL=['pages/app.html','index.html','pages/customer.html','pages/business.html','pages/offline.html','pages/d1-migrate.html','manifest.webmanifest','assets/images/icon-192.png','assets/images/icon-512.png','assets/images/apple-touch-icon.png','assets/images/turfos-logo.png','assets/images/turfos-logo.svg','assets/images/turfos-icon.svg','css/app.css','css/index.css','css/business.css','css/customer.css','css/d1-migrate.css','css/offline.css','css/privacy.css','css/terms.css','js/app.js','js/business.js','js/customer.js','js/d1-migrate.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
  if(!(u.origin===location.origin||u.hostname==='cdnjs.cloudflare.com'))return;
  const isPage=e.request.mode==='navigate'||u.pathname.endsWith('.html');
  if(isPage){e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(V).then(c=>c.put(e.request,copy))}return r}).catch(async()=>await caches.match(e.request)||await caches.match('/pages/app.html')||await caches.match('/pages/offline.html')));return}
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok||r.type==='opaque'){const copy=r.clone();caches.open(V).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match('/pages/offline.html'))));
});
