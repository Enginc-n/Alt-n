// Uygulama kabuğunu önbelleğe alır; fiyat verisi her zaman ağdan gelir.
const C = 'altin-v3', FILES = ['./', './index.html', './ind2.js', './smc.js', './ideas/session_breakout.js', './ideas/mean_reversion.js', './manifest.json', './icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES))));
self.addEventListener('fetch', e => {
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
