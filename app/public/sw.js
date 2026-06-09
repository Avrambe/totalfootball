const CACHE = "tf-v2";
const PRECACHE = ["/", "/bundle.js", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // skip cross-origin (Supabase, analytics, fonts) — never cache those
  if (url.origin !== self.location.origin) return;
  // Network-first for all same-origin requests: the bundle/cards have stable
  // (non-hashed) names, so cache-first would pin a stale build forever. We try
  // the network, refresh the cache on success, and fall back to cache offline.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return resp;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
