// Offline support. Pages: network first (always fresh when online), cached copy offline.
// Hashed assets + fonts: cache first. The build stamps BUILD so each deploy gets a fresh cache.
const CACHE = 'daechung-__BUILD__';
// the build replaces the empty list with this deploy's hashed JS/CSS, so the very first
// visit already has everything needed to start offline
const ASSETS = /*__ASSETS__*/ [];
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './favicon.svg', ...ASSETS];

self.addEventListener('install', (e) => {
  // No catch: if precaching fails, this worker doesn't install and the previous one
  // (with its complete cache) keeps serving. cache: 'reload' skips the HTTP cache, so a
  // deploy within the CDN max-age can't store the previous build's index.html.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('daechung-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            e.waitUntil(caches.open(CACHE).then((c) => c.put('./index.html', copy)));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }
  const cacheable = url.origin === location.origin || url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (!cacheable) return;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
          }
          return res;
        }),
    ),
  );
});
