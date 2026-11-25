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

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const fresh = await caches.open(CACHE);
      for (const k of await caches.keys()) {
        if (!k.startsWith('daechung-') || k === CACHE) continue;
        // fonts don't change between deploys: carry them over so offline keeps its look
        const old = await caches.open(k);
        for (const req of await old.keys()) {
          if (!FONT_HOSTS.includes(new URL(req.url).host)) continue;
          const res = await old.match(req);
          if (res) await fresh.put(req, res);
        }
        await caches.delete(k);
      }
      await self.clients.claim();
    })(),
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
