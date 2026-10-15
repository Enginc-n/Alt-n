// Uygulama kabuğunu önbelleğe alır; her zaman önce ağdan EN GÜNCEL sürüm (tarayıcı önbelleği atlanır), çevrimdışıysa önbellek.
const C = 'altin-v5';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, {cache: 'no-store'}).then(r => { const c = r.clone(); caches.open(C).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
