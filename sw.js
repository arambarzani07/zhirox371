/* ============================================================================
   Retail OS PC — 100% Offline-First Service Worker (PWA Cache + Asset Shell)
   Strategy: Cache-First with background update for static shell, offline fallback
   ============================================================================ */
const CACHE_NAME = "retail-os-offline-v2";
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/operations.html",
  "/operations.js",
  "/workspace.html",
  "/workspace.js",
  "/receipt-print.html",
  "/receipt-print.js",
  "/diagnostics.html",
  "/diagnostics.js",
  "/diagnostics-core.mjs",
  "/qa.html",
  "/customer-display.html",
  "/config.js",
  "/cashier-v20-core.js",
  "/product-catalog.js",
  "/card-icons.js",
  "/card-icons.css",
  "/ui-global.css",
  "/ui-fixed-pc.css",
  "/ui-contrast-lock.css"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  if (url.origin !== self.location.origin) {
    if (url.hostname.includes("jsdelivr.net") || url.pathname.includes("supabase-js")) {
      event.respondWith(
        caches.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request)
            .then(res => {
              if (res && res.ok) {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
              }
              return res;
            })
            .catch(() =>
              new Response("/* Offline Local Supabase Engine Active */", {
                status: 200,
                headers: { "Content-Type": "application/javascript; charset=utf-8" }
              })
            );
        })
      );
    }
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(cached => {
        const fetchPromise = fetch(request)
          .then(networkRes => {
            if (networkRes && networkRes.ok) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
            }
            return networkRes;
          })
          .catch(() => {
            if (cached) return cached;
            if (request.mode === "navigate" || request.destination === "document") {
              return caches.match("/index.html");
            }
            return new Response("/* Asset offline fallback */", {
              status: 404,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
          });
        return cached || fetchPromise;
      })
    );
  }
});
