/**
 * PhysAlts — Production PWA Service Worker (Stale-While-Revalidate)
 * Caches app shell, vendor bundles, and open physics JSON datasets for instant repeat loads.
 * Always bypasses /api/* auth/account endpoints and /_proxy requests.
 */

const CACHE_NAME = "physalts-web-v2";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./vendor/tailwind.css",
  "./vendor/maplibre-gl.css",
  "./vendor/maplibre-gl-csp.js",
  "./vendor/lucide.min.js",
  "./data/curated_flagships.json",
  "./data/private_startups.json",
  "./data/history_timeline.json",
  "./data/space_frontier.json",
  "./data/domains_catalog.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_proxy") || url.pathname.startsWith("/_diag")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || networkPromise;
    })
  );
});
