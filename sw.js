// BonKu Service Worker
const CACHE_VERSION = 'bonku-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon.ico'
];

// Install: pre-cache app shell
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_VERSION; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Fetch strategy:
// - Never cache Supabase API/data calls or other cross-origin API traffic — always go to network.
// - App shell & static assets: cache-first, falling back to network, then updating cache in background.
self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // Let Supabase (and any non-GET/API) requests always hit the network directly.
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Network-first for navigation requests, so users get the latest app version when online.
  // cache:'no-store' forces bypassing the browser's HTTP cache too, not just the SW cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(function (res) {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put('./index.html', resClone); });
          return res;
        })
        .catch(function () {
          return caches.match('./index.html');
        })
    );
    return;
  }

  // Cache-first for everything else (static assets, fonts, CDN scripts)
  event.respondWith(
    caches.match(req).then(function (cached) {
      const networkFetch = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, resClone); });
        }
        return res;
      }).catch(function () {
        return cached;
      });
      return cached || networkFetch;
    })
  );
});
