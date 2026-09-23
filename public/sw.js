// APPFORGE Service Worker - Cache Versioning
const CACHE_VERSION = 'appforge-v2.5.0';
const STATIC_CACHE_NAME = `appforge-static-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `appforge-data-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icon.svg',
  '/appforge-logo.svg',
  '/data/apps.json',
  '/data/categories.json',
  '/data/collections.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE_NAME && key !== DATA_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Handle data requests (apps.json, api)
  if (requestUrl.pathname.includes('/data/apps.json') || requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DATA_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first with cache fallback for HTML pages and assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || requestUrl.origin === location.origin)
        ) {
          const clone = networkResponse.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // If navigating to an HTML route offline, serve root shell
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
        return new Response('Offline: Content unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        });
      })
  );
});
