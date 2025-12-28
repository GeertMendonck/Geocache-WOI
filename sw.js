// sw.js — PWA cache
const CACHE = 'woi-pwa-v22'; // ← bump bij elke release
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/app.js',
  './css/app.css',
  './data/meta.json',
  './data/stops.json',
  './data/personages.json',
  './data/route.gpx',  // of route.kml; laat staan als je het gebruikt
  './data/route.kml'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first voor HTML + (json/kml/gpx/js/css) → updates pushen
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Alleen GET
  if (e.request.method !== 'GET') return;

  // Documents: network-first
if (e.request.mode === 'navigate' || e.request.destination === 'document') {
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)));
      return res;
    }).catch(() => caches.match('./index.html'))
  );
  return;
}

// Data & static assets: network-first zodat nieuwe versies doorkomen
if (/\.(json|kml|gpx|js|css)$/i.test(url.pathname)) {
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)));
      return res;
    }).catch(() => caches.match(e.request))
  );
  return;
}

// Overig: cache-first
e.respondWith(
  caches.match(e.request).then(cached =>
    cached || fetch(e.request).then(res => {
      if (url.origin === location.origin) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)));
      }
      return res;
    })
  )
);

});
