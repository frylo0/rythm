const CACHE_NAME = "__RYTHM_CACHE_NAME__";
const ASSETS = __RYTHM_ASSETS__;
const APP_SHELL = "/index.html";

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(ASSETS.map((asset) => cache.add(new Request(asset, { cache: "reload" }))));
}

async function networkFirst(request) {
  try {
    const response = await fetch(new Request(request, { cache: "reload" }));
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(APP_SHELL, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(APP_SHELL)) || caches.match("/");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(APP_SHELL);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const staleCaches = keys.filter((key) => key !== CACHE_NAME);
      await Promise.all(staleCaches.map((key) => caches.delete(key)));
      await self.clients.claim();
      if (!staleCaches.length) return;
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});
