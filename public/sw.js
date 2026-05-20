const CACHE_NAME = "rythm-shell-v3";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/vendor/jquery.min.js",
  "/vendor/bootstrap/bootstrap.min.css",
  "/vendor/bootstrap/bootstrap.bundle.min.js",
  "/vendor/bootstrap-icons/bootstrap-icons.min.css",
  "/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2",
  "/icons/icon-32.png",
  "/src/client/styles.css",
  "/src/client/state.js",
  "/src/client/storage.js",
  "/src/client/sync.js",
  "/src/client/color-picker.js",
  "/src/client/week-view.js",
  "/src/client/activities-view.js",
  "/src/client/stats-view.js",
  "/src/client/app.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("/index.html")))
  );
});
