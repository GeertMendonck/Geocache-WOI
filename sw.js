// sw.js – ultrakleine offline cache
const CACHE = 'woi-pwa-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r =>
      r ||
      fetch(e.request).then(res => {
        try {
          if (e.request.method === 'GET' &&
              new URL(e.request.url).origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
        } catch {}
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
