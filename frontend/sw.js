const CACHE_NAME = "agro-ia-v4";
const ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.json",
  "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return (
        cached ||
        fetch(e.request)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
            return resp;
          })
          .catch(() => caches.match("/"))
      );
    })
  );
});