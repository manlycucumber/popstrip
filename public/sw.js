// PopStrip service worker — dependency-free, offline-first.
//
// • App shell (navigation) is network-first with a cached "/" fallback, so a
//   reload works with no connection.
// • Hashed build assets (/assets/*, immutable) are cache-first — including the
//   pixi.js chunks, so once GPU effects have been used online they also work
//   offline.
// • Everything else same-origin is stale-while-revalidate.
//
// Bump CACHE on release to evict the old shell.

const CACHE = 'popstrip-v2_6_0';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Only cache genuinely successful, non-opaque responses. fetch() resolves (not
// rejects) on 4xx/5xx, so without this a transient 503 / maintenance / captive-
// portal page would overwrite the good app shell or — worse, since assets are
// cache-first and never re-fetched — permanently poison an immutable chunk.
function cacheable(res) {
  return res && res.ok && res.type !== 'opaque';
}
function put(req, res) {
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through

  // App shell: network-first, fall back to the cached index for offline reloads.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(res) && (res.headers.get('content-type') || '').includes('text/html')) put('/', res);
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(req))),
    );
    return;
  }

  // Immutable hashed assets: cache-first (populate on first successful fetch).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (cacheable(res)) put(req, res);
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (cacheable(res)) put(req, res);
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
