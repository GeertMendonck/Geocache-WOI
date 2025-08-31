// sw.js – voeg je data toe
const CACHE = 'woi-pwa-v7';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/meta.json',
  './data/stops.json',
  './data/personages.json',
  './data/route.kml'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // HTML: network-first
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(fetch(e.request).then(res => {
      caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  // JSON & KML: network-first (zodat updates zonder code doorstromen)
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.kml')) {
    e.respondWith(fetch(e.request).then(res => {
      caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // overige assets: cache-first
  e.respondWith(caches.match(e.request).then(cached =>
    cached || fetch(e.request).then(res => {
      if (url.origin === location.origin && e.request.method === 'GET') {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    })
  ));
});
