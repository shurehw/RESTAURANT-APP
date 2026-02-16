// Pulse PWA Service Worker v2
// Network-first for API (live data), stale-while-revalidate for shell, offline fallback

const CACHE_VERSION = 'pulse-v2';
const API_CACHE = 'pulse-api-v2';
const MAX_API_ENTRIES = 50;
const OFFLINE_URL = '/offline.html';

const SHELL_ASSETS = [
  '/pulse',
  '/offline.html',
  '/icons/pulse-192.png',
  '/icons/pulse-512.png',
  '/manifest.json',
];

// ── Install: precache shell assets ────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches, claim clients ────────────────────────
self.addEventListener('activate', (event) => {
  const allowedCaches = [CACHE_VERSION, API_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !allowedCaches.includes(k)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Helpers ───────────────────────────────────────────────────────────

// Trim API cache to prevent unbounded growth
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(
      keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k))
    );
  }
}

// Check if a request is a navigation (HTML page request)
function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

// ── Fetch: routing strategies ────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // ── API: network-first with cache fallback ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(event.request, clone);
              trimCache(API_CACHE, MAX_API_ENTRIES);
            });
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((cached) =>
            cached || new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
          )
        )
    );
    return;
  }

  // ── Static assets (JS/CSS/fonts/images): stale-while-revalidate ──
  if (url.pathname.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetched = fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  // ── Navigation (HTML pages): network-first with offline fallback ──
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((cached) =>
            cached || caches.match(OFFLINE_URL)
          )
        )
    );
    return;
  }

  // ── Everything else: stale-while-revalidate ──
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

// ── Message handling: skip-waiting from update prompt ─────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
