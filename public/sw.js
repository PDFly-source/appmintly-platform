// AppMintly Service Worker - Cache Versioning
const CACHE_VERSION = 'appmintly-v3.0.0';
const STATIC_CACHE_NAME = `appmintly-static-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `appmintly-data-${CACHE_VERSION}`;

// Base path derived from the registration scope so the worker works both at
// the site root and under GitHub Pages project sub-paths (e.g. /appmintly-platform/).
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');

const PRECACHE_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/brand/appmintly-icon.png`,
  `${BASE_PATH}/brand/appmintly-icon-512.png`,
  `${BASE_PATH}/brand/appmintly-icon-1024.png`,
  `${BASE_PATH}/data/apps.json`,
  `${BASE_PATH}/data/categories.json`,
  `${BASE_PATH}/data/collections.json`
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

  // SECURITY (Phase 11): never intercept or cache anything headed to the
  // publisher backend, any request carrying credentials/authorization, or
  // any non-https source. Publisher publish/responses are never cached.
  if (event.request.url.includes('workers.dev')) return;
  if (requestUrl.protocol !== 'https:' && requestUrl.protocol !== self.location.protocol) return;
  if (event.request.headers.has('Authorization')) return;
  if (event.request.credentials && event.request.credentials === 'include') return;
  if (requestUrl.pathname.startsWith('/api/publish') || requestUrl.pathname.startsWith('/publisher')) {
    // publisher console pages must never be served from a stale cache
    return;
  }

  // Handle data requests (apps.json, api)
  if (requestUrl.pathname.includes('/data/apps.json') || requestUrl.pathname.startsWith('/api/')) {
    // Network-first: canonical production data ALWAYS wins when the network
    // is reachable; the cache is only an offline fallback and is refreshed on
    // every successful fetch, so stale catalog data can never permanently
    // override canonical production data.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches
              .open(DATA_CACHE_NAME)
              .then((cache) => cache.put(event.request, clone))
              .then(() => {
                // stale-cache cleanup: drop other cached copies of the same
                // catalog path from previous cache versions (already removed
                // on activate) and prune duplicate entries.
                caches.open(DATA_CACHE_NAME).then((cache) => {
                  cache.keys().then((keys) => {
                    keys.forEach((k) => {
                      try {
                        const ku = new URL(k.url);
                        const ru = new URL(event.request.url);
                        if (ku.pathname === ru.pathname && k.url !== event.request.url) {
                          cache.delete(k);
                        }
                      } catch (e) {
                        /* ignore malformed */
                      }
                    });
                  });
                });
              });
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
        // If navigating to an HTML route offline, serve the precached
        // offline shell (BASE_PATH-correct — '/' never exists on Pages).
        if (event.request.mode === 'navigate') {
          const shell =
            (await caches.match(`${BASE_PATH}/`)) ||
            (await caches.match(`${BASE_PATH}/index.html`));
          if (shell) return shell;
        }
        return new Response('Offline: Content unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        });
      })
  );
});
