// sw.js
const CACHE = 'woi-pwa-v12';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/app.js',
  './data/meta.json',
  './data/stops.json',
  './data/personages.json',
  './data/route.gpx',   // of route.kml (of beide)
  './data/route.kml'
];

// install/activate zoals je al had…

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // HTML: network-first
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(fetch(e.request).then(res => {
      caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // JSON/KML/GPX: network-first (zodat data-updates zónder code ook doorstromen)
  if (/\.(json|kml|gpx)$/i.test(url.pathname)) {
    e.respondWith(fetch(e.request).then(res => {
      caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res;
    }).catch(() => caches.match(e.request)));
    return;
  }

  // Overig (incl. js/css/img): cache-first
  e.respondWith(caches.match(e.request).then(cached =>
    cached || fetch(e.request).then(res => {
      if (url.origin === location.origin && e.request.method === 'GET') {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    })
  ));
});
