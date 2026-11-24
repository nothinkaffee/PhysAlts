/**
 * World of Physics — Production PWA Service Worker
 * - Cache-First persistent caching for 3D Earth globe imagery tiles (both proxied & direct Esri)
 * - Pre-caches core globe tiles (z=0..2) + app shell + physics JSON datasets for instant reloads
 * - Always bypasses /api/* auth/account endpoints and /_diag
 */

const APP_CACHE = "world-physics-app-v14";
const TILE_CACHE = "world-physics-tiles-v1";

const PRECACHE_APP = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./vendor/inter-var.woff2",
  "./vendor/tailwind.css",
  "./vendor/maplibre-gl.css",
  "./vendor/maplibre-gl-csp.js",
  "./vendor/maplibre-gl-csp-worker.js",
  "./vendor/lucide.min.js",
  "./tiles/bluemarble/0/0/0.jpg",
  "./tiles/bluemarble/1/0/0.jpg",
  "./tiles/bluemarble/1/0/1.jpg",
  "./tiles/bluemarble/1/1/0.jpg",
  "./tiles/bluemarble/1/1/1.jpg",
  "./data/curated_flagships.json",
  "./data/private_startups.json",
  "./data/history_timeline.json",
  "./data/space_frontier.json",
  "./data/domains_catalog.json",
  "./data/stem/ai_cs_hubs.json",
  "./data/stem/math_hubs.json",
  "./data/stem/bio_med_hubs.json",
  "./data/stem/chem_earth_eng_hubs.json",
  "./data/stem/engineering_hubs.json",
  "./data/stem/stem_timeline.json",
  "./data/stem/stem_domains.json",
  "./data/stem/rabbit_trails.json",
  "./data/packs/manifest.json"
];

function isGlobeTileRequest(url) {
  if (url.origin === self.location.origin && url.pathname.includes("/tiles/bluemarble/")) {
    return true;
  }
  if (url.origin === self.location.origin && url.pathname === "/_proxy") {
    const target = url.searchParams.get("url") || "";
    return /World_Imagery\/MapServer\/tile\//i.test(target);
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE_APP).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([APP_CACHE, TILE_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Cache-First for all 3D Earth satellite tiles (matches preloaded tiles by URL string!)
  if (isGlobeTileRequest(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = (await cache.match(req.url)) || (await cache.match(req));
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === "opaque")) {
            cache.put(req.url, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          return Response.error();
        }
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_proxy") || url.pathname.startsWith("/_diag")) return;

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const isCode = /\.(html|js|css)$/.test(url.pathname) || url.pathname === "/";

  // Network-First for code on localhost so edits show up on reload; SWR in production & for datasets/vendor
  if (isLocal && isCode) {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch {
          return (await cache.match(req)) || Response.error();
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || networkPromise;
    })
  );
});
