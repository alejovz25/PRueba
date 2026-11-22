const CACHE_NAME = "agro-ia-v1";
const ASSETS = ["/", "/index.html", "/app.js", "/manifest.json", "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => caches.match("/")))
  );
});