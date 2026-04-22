// ============================================================
// Service Worker — caches static files and map tiles for offline use
// ============================================================

const CACHE_NAME = "offline-gis-v5";

// Static files to cache on install (relative to SW scope)
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./state.js",
  "./db.js",
  "./api.js",
  "./map.js",
  "./forms.js",
  "./ui.js",
  "./app.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/dexie@4.0.11/dist/dexie.min.js",
];

// Install: pre-cache all static assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching static assets");
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: serve from cache, fall back to network, cache map tiles on the fly
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API requests — they must always go to the network (or fail gracefully)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // For map tiles (OpenStreetMap), use a stale-while-revalidate strategy
  if (url.hostname.includes("tile.openstreetmap.org")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((response) => {
              if (response.ok) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached); // If network fails, use cache

          return cached || networkFetch;
        }),
      ),
    );
    return;
  }

  // For everything else: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Don't cache non-GET or opaque responses
        if (event.request.method !== "GET" || response.status !== 200) {
          return response;
        }
        const clone = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, clone));
        return response;
      });
    }),
  );
});
