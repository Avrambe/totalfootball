const CACHE = "tf-v1";
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
  // network-first for navigations, cache-first for same-origin assets
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
  } else {
    e.respondWith(
      caches.match(e.request).then((r) =>
        r ||
        fetch(e.request).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return resp;
        })
      )
    );
  }
});
