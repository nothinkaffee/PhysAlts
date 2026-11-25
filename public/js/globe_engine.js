/**
 * World of Physics — 3D Globe Engine (MapLibre GL JS v5)
 * - Instant preloaded & multi-tier cached satellite imagery (in-memory ArrayBuffer + Cache API + SW)
 * - Razor-sharp Retina 'Inter' / 'Helvetica Neue' 2D Canvas labels with strict collision avoidance
 *   (zero blurry Open Sans SDF glyphs, zero pixelated Esri raster label overlays)
 * - Effortless padded click & hover targeting (clickTolerance: 10, ±22px dot hitboxes, clickable label pills)
 * - Living deep-space starfield behind a transparent 3D Earth sphere
 */

import { USE_DEV_PROXY, COLLABORATION_ARCS } from "./config.js";
import { store, getVisibleGlobeNodes, getNodeById, getFilteredTimelineEvents } from "./data_store.js";
import { getSelectedEcosystemArcs, getHubContextualRank } from "./shanghai_engine.js";

const FONT_STACK = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const TILE_CACHE_NAME = "world-physics-tiles-v1";
const ESRI_SAT_TEMPLATE = "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const RESTING_GLOBE_CENTER = [12, 20];
const TOP_UI_SAFE_PX = 88;
const BOTTOM_UI_SAFE_PX = 96;
const SIDE_UI_SAFE_PX = 16;
const GLOBE_MIN_ZOOM = 0.55;
const GLOBE_MAX_RESTING_ZOOM = 2.15;

/**
 * Exact silhouette radius (CSS px) of the 3D Earth sphere in MapLibre GL JS v5 globe projection
 * at pitch = 0 (default vertical FOV ~36.87 deg => tan(fov/2) = 1/3 => cameraToCenterDistance = 1.5 * H).
 */
function getGlobeRadiusPx(viewportHeight, zoom, latDeg = RESTING_GLOBE_CENTER[1]) {
  const h = Math.max(240, viewportHeight || 800);
  const dc = 1.5 * h;
  const cosLat = Math.max(0.15, Math.cos((latDeg * Math.PI) / 180));
  const sphereR = (256 * Math.pow(2, zoom)) / (Math.PI * cosLat);
  return sphereR / Math.sqrt(1 + (2 * sphereR) / dc);
}

/**
 * Compute responsive resting zoom so the entire 3D Earth sphere + orbital rim halo
 * fits cleanly inside the visible viewport between the top island (~88px) and bottom dock (~96px).
 */
export function getRestingGlobeZoom(container = null, latDeg = RESTING_GLOBE_CENTER[1]) {
  const el = container || (typeof document !== "undefined" ? document.getElementById("map") : null);
  const w = el?.clientWidth || el?.width || (typeof window !== "undefined" ? window.innerWidth : 1280);
  const h = el?.clientHeight || el?.height || (typeof window !== "undefined" ? window.innerHeight : 800);

  const safeW = Math.max(220, w - SIDE_UI_SAFE_PX * 2);
  const safeH = Math.max(220, h - TOP_UI_SAFE_PX - BOTTOM_UI_SAFE_PX);
  // Sphere is centered vertically at h/2; ensure clearance above bottom dock & below top island
  const symSafeH = Math.max(220, Math.min(safeH, (h / 2 - Math.max(TOP_UI_SAFE_PX, BOTTOM_UI_SAFE_PX)) * 2));

  const targetRadiusPx = Math.min(safeW * 0.38, symSafeH * 0.36);
  const dc = 1.5 * Math.max(240, h);
  const k = targetRadiusPx / dc;
  const sphereR = targetRadiusPx * (k + Math.sqrt(1 + k * k));
  const cosLat = Math.max(0.15, Math.cos((latDeg * Math.PI) / 180));
  const rawZoom = Math.log2((sphereR * Math.PI * cosLat) / 256);

  return Math.round(Math.max(GLOBE_MIN_ZOOM, Math.min(GLOBE_MAX_RESTING_ZOOM, rawZoom)) * 100) / 100;
}

function getMinGlobeZoom(container = null) {
  const resting = getRestingGlobeZoom(container);
  return Math.round(Math.min(GLOBE_MIN_ZOOM, Math.max(0.45, resting - 0.15)) * 100) / 100;
}

// Clean Inter country/region labels toggled by the "Labels" pill (replaces pixelated Esri raster text)
const WORLD_REGION_LABELS = [
  { name: "United States", lng: -98.5, lat: 39.8, minZ: 1.2 },
  { name: "Canada", lng: -106.3, lat: 56.1, minZ: 1.4 },
  { name: "Mexico", lng: -102.5, lat: 23.6, minZ: 2.4 },
  { name: "Brazil", lng: -51.9, lat: -14.2, minZ: 1.4 },
  { name: "Argentina", lng: -64.0, lat: -36.5, minZ: 2.2 },
  { name: "Chile", lng: -71.0, lat: -31.5, minZ: 2.8 },
  { name: "United Kingdom", lng: -2.5, lat: 54.0, minZ: 2.6 },
  { name: "France", lng: 2.2, lat: 46.6, minZ: 2.8 },
  { name: "Germany", lng: 10.4, lat: 51.2, minZ: 2.8 },
  { name: "Switzerland", lng: 8.2, lat: 46.8, minZ: 3.8 },
  { name: "Italy", lng: 12.6, lat: 42.6, minZ: 3.0 },
  { name: "Spain", lng: -3.7, lat: 40.4, minZ: 2.8 },
  { name: "Sweden", lng: 16.5, lat: 62.5, minZ: 2.8 },
  { name: "Netherlands", lng: 5.3, lat: 52.2, minZ: 4.0 },
  { name: "Poland", lng: 19.4, lat: 52.1, minZ: 3.2 },
  { name: "Greece", lng: 22.9, lat: 39.1, minZ: 3.4 },
  { name: "Turkey", lng: 35.2, lat: 39.0, minZ: 2.6 },
  { name: "Egypt", lng: 30.8, lat: 26.8, minZ: 2.4 },
  { name: "Jordan", lng: 36.6, lat: 31.2, minZ: 4.0 },
  { name: "Israel", lng: 34.9, lat: 31.5, minZ: 4.4 },
  { name: "South Africa", lng: 24.5, lat: -29.0, minZ: 1.8 },
  { name: "Kenya", lng: 37.9, lat: 0.4, minZ: 2.8 },
  { name: "Nigeria", lng: 8.7, lat: 9.1, minZ: 2.6 },
  { name: "Morocco", lng: -7.1, lat: 31.8, minZ: 2.8 },
  { name: "Russia", lng: 96.0, lat: 61.5, minZ: 1.4 },
  { name: "India", lng: 79.0, lat: 22.0, minZ: 1.4 },
  { name: "China", lng: 104.2, lat: 35.8, minZ: 1.4 },
  { name: "Japan", lng: 138.3, lat: 36.2, minZ: 2.0 },
  { name: "South Korea", lng: 127.8, lat: 36.4, minZ: 3.4 },
  { name: "Taiwan", lng: 121.0, lat: 23.7, minZ: 3.8 },
  { name: "Singapore", lng: 103.8, lat: 1.35, minZ: 4.2 },
  { name: "Australia", lng: 133.8, lat: -25.3, minZ: 1.4 },
  { name: "New Zealand", lng: 172.5, lat: -41.5, minZ: 2.4 },
  { name: "Antarctica", lng: 0, lat: -82.0, minZ: 1.6 }
];

let map = null;
let useMainThreadOverlay = false;
let hudCanvas = null;
let interactiveHits = [];
const QA_HOOKS = typeof location !== "undefined" && /[?&]qa=1\b/.test(location.search);
const CANVAS_MARKERS = true;
const REDUCED_MOTION = typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
let hoveredKey = null;
let drawHudFn = () => {};
let onSelectNodeCb = () => {};
let onSelectStackCb = () => {};
let onBackgroundClickCb = () => {};

// Multi-tier tile cache (RAM ArrayBuffer + Cache Storage API) for instant globe loads
const tileMemCache = new Map();
const TILE_MEM_MAX = 420;
const inflightTiles = new Map();

// Tiles load DIRECT from Esri's global CDN (CORS-enabled, HTTP/2) — far faster than tunnelling
// through the dev server. The local proxy is only a fallback if the direct request fails.
let tilesViaProxy = false;
function proxiedTileUrl(rawHttpsUrl) {
  return `./_proxy?url=${encodeURIComponent(rawHttpsUrl)}`;
}

function setTileMemCache(key, buf) {
  if (tileMemCache.has(key)) {
    tileMemCache.delete(key);
  } else if (tileMemCache.size >= TILE_MEM_MAX) {
    const oldest = tileMemCache.keys().next().value;
    tileMemCache.delete(oldest);
  }
  tileMemCache.set(key, buf);
}

async function fetchTileCached(rawHttpsUrl) {
  // 1. Instant RAM hit (0ms) — always slice() so Worker transfer never detaches our cached buffer
  const mem = tileMemCache.get(rawHttpsUrl);
  if (mem) return mem.slice(0);

  if (inflightTiles.has(rawHttpsUrl)) {
    const buf = await inflightTiles.get(rawHttpsUrl);
    return buf.slice(0);
  }

  const work = (async () => {
    // 2. Persistent browser Cache Storage hit (~1ms)
    if (typeof caches !== "undefined" && location.protocol !== "blob:") {
      try {
        const cache = await caches.open(TILE_CACHE_NAME);
        const matched = (await cache.match(rawHttpsUrl)) || (await cache.match(proxiedTileUrl(rawHttpsUrl)));
        if (matched && matched.ok) {
          const buf = await matched.arrayBuffer();
          setTileMemCache(rawHttpsUrl, buf);
          return buf;
        }
      } catch {}
    }

    // 3. Network fetch (backed by local server RAM+disk cache in dev, or Esri CDN in prod)
    let res = null;
    if (!tilesViaProxy) {
      try {
        res = await fetch(rawHttpsUrl, { cache: "force-cache", mode: "cors", credentials: "omit" });
        if (!res.ok && res.status !== 404) res = null;
      } catch {
        res = null;
      }
      if (!res && USE_DEV_PROXY) tilesViaProxy = true;
    }
    if (!res && USE_DEV_PROXY) {
      res = await fetch(proxiedTileUrl(rawHttpsUrl), { cache: "force-cache" });
    }
    if (!res || !res.ok) throw new Error(`Tile HTTP ${res ? res.status : "network"}`);
    if (typeof caches !== "undefined" && location.protocol !== "blob:") {
      try {
        const cache = await caches.open(TILE_CACHE_NAME);
        cache.put(rawHttpsUrl, res.clone()).catch(() => {});
      } catch {}
    }
    const buf = await res.arrayBuffer();
    setTileMemCache(rawHttpsUrl, buf);
    return buf;
  })();

  inflightTiles.set(rawHttpsUrl, work);
  try {
    const buf = await work;
    return buf.slice(0);
  } finally {
    inflightTiles.delete(rawHttpsUrl);
  }
}

/**
 * Warm core Earth satellite tiles (z=0..2 = 21 tiles covering 100% of Earth)
 * into browser Cache Storage after initial paint so spinning anywhere on Earth is instant.
 */
function preloadCoreGlobeTiles() {
  if (typeof caches === "undefined" || location.protocol === "blob:") return;
  const urls = [];
  for (let z = 0; z <= 2; z++) {
    const dim = 1 << z;
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        urls.push(ESRI_SAT_TEMPLATE.replace("{z}", z).replace("{y}", y).replace("{x}", x));
      }
    }
  }
  let idx = 0;
  const worker = async () => {
    const cache = await caches.open(TILE_CACHE_NAME).catch(() => null);
    while (idx < urls.length) {
      const u = urls[idx++];
      try {
        if (cache && (await cache.match(u))) continue;
        const res = await fetch(u, { mode: "cors", credentials: "omit", cache: "force-cache" });
        if (res.ok && cache) cache.put(u, res.clone()).catch(() => {});
      } catch {}
    }
  };
  Promise.all(Array.from({ length: 4 }, worker)).catch(() => {});
}

// Geographic cluster cache keyed by integer zoom + dataset version (for main-thread fallback)
let geoClusterVersion = 0;
const geoClusterCache = new Map();

function invalidateGeoClusterCache() {
  geoClusterVersion++;
  geoClusterCache.clear();
}

/**
 * Seeded angular clustering (supercluster-style, but on the sphere):
 * - Seeds are taken in priority order (selected > curated flagships > everything else),
 *   so famous places anchor their own bubble ("CERN" bubble is centred on CERN).
 * - Every seed is > CLUSTER_PX apart on screen at the bucket zoom, so bubbles never overlap.
 * - Spatial hash keeps it O(n); results cached per 0.5-zoom bucket + dataset version.
 */
const CLUSTER_PX = 54;
function nodePriority(n) {
  if (store.state.selectedId === n.id) return 3;
  if (n.pinned) return 2;
  if (n.tier === "flagship" || n.tier === "timeline") return 1;
  return 0;
}

function getAnchoredClusters(zoom) {
  const zb = Math.max(0.5, Math.min(9.5, Math.floor(zoom * 2) / 2));
  const key = `${geoClusterVersion}:${zb}:${store.state.selectedId || ""}`;
  if (geoClusterCache.has(key)) return geoClusterCache.get(key);

  const nodes = getVisibleGlobeNodes().filter(n => Number.isFinite(n.lat) && Number.isFinite(n.lng));
  if (zb >= 9.5 || (store.state.timeMode && nodes.length < 160)) {
    const singles = nodes.map(n => ({ isCluster: false, lat: n.lat, lng: n.lng, count: 1, node: n }));
    geoClusterCache.set(key, singles);
    return singles;
  }

  const RAD = Math.PI / 180;
  const pxPerRad = (512 * Math.pow(2, zb)) / (2 * Math.PI);
  const theta = CLUSTER_PX / pxPerRad;            // angular radius (radians)
  const cosTheta = Math.cos(theta);
  const cellDeg = Math.max(theta / RAD, 0.0005);

  const pts = nodes.map((n, i) => {
    const la = n.lat * RAD, lo = n.lng * RAD;
    return { n, i, x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la), pr: nodePriority(n), used: false };
  });

  // Spatial hash on lat rows; lng neighbourhood widened by 1/cos(lat)
  const grid = new Map();
  const rowOf = (lat) => Math.floor((lat + 90) / cellDeg);
  const colOf = (lat, lng) => {
    const w = cellDeg / Math.max(0.08, Math.cos(lat * RAD));
    return Math.floor((lng + 180) / w);
  };
  for (const p of pts) {
    const k = `${rowOf(p.n.lat)}:${colOf(p.n.lat, p.n.lng)}`;
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(p);
  }

  const order = pts.slice().sort((a, b) => b.pr - a.pr || a.i - b.i);
  const result = [];
  for (const seed of order) {
    if (seed.used) continue;
    seed.used = true;
    const members = [seed];
    if (seed.pr < 3) {
      const r0 = rowOf(seed.n.lat);
      for (let dr = -1; dr <= 1; dr++) {
        const rowLat = Math.max(-89.9, Math.min(89.9, seed.n.lat + dr * cellDeg));
        const w = cellDeg / Math.max(0.08, Math.cos(rowLat * RAD));
        const span = Math.ceil(cellDeg / Math.max(0.08, Math.cos(Math.min(89.9, Math.abs(seed.n.lat) + cellDeg) * RAD)) / w) + 1;
        const c0 = Math.floor((seed.n.lng + 180) / w);
        for (let dc = -span; dc <= span; dc++) {
          const arr = grid.get(`${r0 + dr}:${c0 + dc}`);
          if (!arr) continue;
          for (const p of arr) {
            if (p.used || p.pr >= 3) continue;
            if (p.x * seed.x + p.y * seed.y + p.z * seed.z >= cosTheta) {
              p.used = true;
              members.push(p);
            }
          }
        }
      }
    }

    if (members.length === 1) {
      result.push({ isCluster: false, lat: seed.n.lat, lng: seed.n.lng, count: 1, node: seed.n });
      continue;
    }
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    let sx = 0, sy = 0, sz = 0;
    for (const m of members) {
      sx += m.x; sy += m.y; sz += m.z;
      if (m.n.lat < minLat) minLat = m.n.lat;
      if (m.n.lat > maxLat) maxLat = m.n.lat;
      if (m.n.lng < minLng) minLng = m.n.lng;
      if (m.n.lng > maxLng) maxLng = m.n.lng;
    }
    const norm = Math.hypot(sx, sy, sz) || 1;
    const centerLat = Math.asin(Math.max(-1, Math.min(1, sz / norm))) / RAD;
    const centerLng = Math.atan2(sy, sx) / RAD;
    const rawSpanLng = Math.min(maxLng - minLng, 360 - (maxLng - minLng));
    const spanDeg = Math.max(maxLat - minLat, rawSpanLng * Math.max(0.15, Math.cos(centerLat * RAD)));
    const top = members.reduce((a, b) => (b.pr > a.pr ? b : a), seed).n;
    result.push({
      isCluster: true,
      lat: centerLat,
      lng: centerLng,
      count: members.length,
      top,
      spanDeg
    });
  }

  geoClusterCache.set(key, result);
  return result;
}

function greatCircleCoords(lng1, lat1, lng2, lat2, steps = 40) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const p1 = toRad(lat1), l1 = toRad(lng1);
  const p2 = toRad(lat2), l2 = toRad(lng2);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2
  ));
  if (d < 1e-5) return [[lng1, lat1], [lng2, lat2]];
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    coords.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return coords;
}

function buildGeoJSON(nodes) {
  return {
    type: "FeatureCollection",
    features: nodes
      .filter(n => typeof n.lat === "number" && typeof n.lng === "number" && !Number.isNaN(n.lat) && !Number.isNaN(n.lng))
      .map(n => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [n.lng, n.lat] },
        properties: {
          id: n.id,
          name: n.name,
          pinned: n.pinned ? 1 : 0,
          selected: store.state.selectedId === n.id ? 1 : 0,
          curated: n.tier === "flagship" || n.tier === "timeline" ? 1 : 0,
          kind: n.group === "company" || n.entityType === "startup" ? "company" : (n.group === "history" || n.tier === "timeline" ? "history" : "academic")
        }
      }))
  };
}

function buildArcsGeoJSON() {
  const features = [];
  if (store.state.arcs && !store.state.timeMode) {
    const visible = new Map(getVisibleGlobeNodes().map(n => [n.id, n]));
    const seen = new Set();
    for (const [idA, idB] of COLLABORATION_ARCS) {
      const a = visible.get(idA) || getNodeById(idA);
      const b = visible.get(idB) || getNodeById(idB);
      if (!a || !b) continue;
      if (store.state.branch !== "all" && a.branch !== store.state.branch && b.branch !== store.state.branch) continue;
      const focused = (store.state.selectedId === idA || store.state.selectedId === idB) ? 1 : 0;
      const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
      seen.add(key);
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: greatCircleCoords(a.lng, a.lat, b.lng, b.lat) },
        properties: { focused, rabbit: 0, eco: 0 }
      });
    }

    // Live selected institution ecosystem: verified collaborations (crimson) + nearby labs & companies (silver)
    if (store.state.selectedId && !store.state.selectedId.startsWith("sp-") && !store.state.selectedId.startsWith("tl-")) {
      const sel = getNodeById(store.state.selectedId);
      if (sel) {
        const ecoArcs = getSelectedEcosystemArcs(sel, store.hubs, store.hubsById);
        for (const ea of ecoArcs) {
          const key = ea.a.id < ea.b.id ? `${ea.a.id}|${ea.b.id}` : `${ea.b.id}|${ea.a.id}`;
          if (ea.kind === "collab" && seen.has(key)) continue;
          seen.add(key);
          features.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: greatCircleCoords(ea.a.lng, ea.a.lat, ea.b.lng, ea.b.lat) },
            properties: {
              focused: 1,
              rabbit: 0,
              eco: ea.kind === "collab" ? 2 : 1
            }
          });
        }
      }
    }
  }

  // Live Rabbit Hole curiosity path (free-roam walk or active curated/agent trail)
  if (!store.state.timeMode) {
    let pathPts = [];
    if (store.state.activeTrail?.stops?.length >= 2) {
      const lim = Math.min(store.state.activeTrail.stops.length - 1, store.state.activeTrail.index || 0);
      for (let i = 0; i <= lim; i++) {
        const n = getNodeById(store.state.activeTrail.stops[i]?.hubId);
        if (n?.lat != null && n?.lng != null) pathPts.push({ lat: n.lat, lng: n.lng });
      }
    } else if (store.state.rabbitPath?.length >= 2) {
      pathPts = store.state.rabbitPath;
    }
    for (let i = 0; i + 1 < pathPts.length; i++) {
      const a = pathPts[i];
      const b = pathPts[i + 1];
      if (a.lat === b.lat && a.lng === b.lng) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: greatCircleCoords(a.lng, a.lat, b.lng, b.lat) },
        properties: { focused: 1, rabbit: 1, eco: 0 }
      });
    }
  }

  // Chronological Timeline Discovery Path (subtle historical lineage + luminous active jump arc)
  if (store.state.timeMode) {
    const events = getFilteredTimelineEvents();
    if (events.length >= 2) {
    let activeIdx = store.state.activeTimelineId
      ? events.findIndex(e => e.id === store.state.activeTimelineId)
      : -1;
    if (activeIdx < 0) {
      const curYear = store.state.timeYear;
      activeIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < events.length; i++) {
        const d = Math.abs(events[i].year - curYear);
        if (d < bestDist) { bestDist = d; activeIdx = i; }
      }
    }
    const startIdx = Math.max(0, activeIdx - 10);
    for (let i = startIdx; i < activeIdx; i++) {
      const a = events[i];
      const b = events[i + 1];
      if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) continue;
      if (Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lng - b.lng) < 0.05) continue;
      const isCurrentJump = (i === activeIdx - 1);
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: greatCircleCoords(a.lng, a.lat, b.lng, b.lat) },
        properties: { focused: isCurrentJump ? 1 : 0, rabbit: isCurrentJump ? 1 : 0, eco: 0 }
      });
    }
    }
  }

  return { type: "FeatureCollection", features };
}

function probeWorkerSupport(workerUrl) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    try {
      const testBlob = URL.createObjectURL(new Blob(["self.postMessage('ok');"], { type: "application/javascript" }));
      const w = new Worker(workerUrl && !workerUrl.startsWith("blob:") ? workerUrl : testBlob);
      const timer = setTimeout(() => { try { w.terminate(); } catch (_) {} finish(false); }, 600);
      w.onmessage = () => { clearTimeout(timer); try { w.terminate(); } catch (_) {} finish(true); };
      w.onerror = () => { clearTimeout(timer); try { w.terminate(); } catch (_) {} finish(false); };
      if (workerUrl && !workerUrl.startsWith("blob:")) {
        setTimeout(() => { clearTimeout(timer); try { w.terminate(); } catch (_) {} finish(true); }, 220);
      }
    } catch {
      finish(false);
    }
  });
}

function shortGlobeName(name, maxLen = 28) {
  if (!name) return "";
  const clean = String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen - 1);
  const sp = cut.lastIndexOf(" ");
  const trimmed = sp >= Math.floor(maxLen * 0.58) ? cut.slice(0, sp) : cut;
  return trimmed.replace(/[,;:\-–—]+$/, "").trimEnd() + "…";
}

function fmtCount(n) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function rectsOverlap(a, b, pad = 4) {
  return !(
    a[0] + a[2] + pad < b[0] ||
    b[0] + b[2] + pad < a[0] ||
    a[1] + a[3] + pad < b[1] ||
    b[1] + b[3] + pad < a[1]
  );
}

function setupWebGLVectorLayers() {
  if (!map || map.getSource("physics-arcs")) return;

  map.addSource("physics-arcs", { type: "geojson", data: buildArcsGeoJSON() });
  map.addLayer({
    id: "physics-arcs-glow",
    type: "line",
    source: "physics-arcs",
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "rabbit"], 1], "rgba(160, 70, 70, 0.36)",
        ["==", ["get", "eco"], 2], "rgba(180, 82, 82, 0.38)",
        "rgba(228, 228, 231, 0.14)"
      ],
      "line-width": [
        "case",
        ["==", ["get", "rabbit"], 1], 5.0,
        ["==", ["get", "eco"], 2], 4.6,
        ["==", ["get", "focused"], 1], 3.8,
        2.0
      ],
      "line-blur": 3
    }
  });
  map.addLayer({
    id: "physics-arcs-line",
    type: "line",
    source: "physics-arcs",
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "rabbit"], 1], "rgba(196, 98, 98, 0.94)",
        ["==", ["get", "eco"], 2], "rgba(208, 110, 110, 0.92)",
        ["==", ["get", "focused"], 1], "rgba(255, 255, 255, 0.84)",
        "rgba(212, 212, 216, 0.36)"
      ],
      "line-width": [
        "case",
        ["==", ["get", "rabbit"], 1], 1.8,
        ["==", ["get", "eco"], 2], 1.7,
        ["==", ["get", "focused"], 1], 1.4,
        1.0
      ],
      "line-dasharray": [2, 2]
    }
  });

  if (CANVAS_MARKERS) {
    store.state.globeReady = true;
    return;
  }

  map.addSource("physics-hubs", {
    type: "geojson",
    data: buildGeoJSON(getVisibleGlobeNodes()),
    cluster: true,
    clusterMaxZoom: 9,
    clusterRadius: 48
  });

  map.addLayer({
    id: "clusters-glow",
    type: "circle",
    source: "physics-hubs",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(228, 228, 231, 0.14)",
      "circle-radius": ["step", ["get", "point_count"], 22, 15, 27, 60, 33, 150, 39],
      "circle-blur": 0.45
    }
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "physics-hubs",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(16, 16, 18, 0.84)",
      "circle-radius": ["step", ["get", "point_count"], 16, 15, 20, 60, 24, 150, 28],
      "circle-stroke-width": 1.35,
      "circle-stroke-color": "rgba(255, 255, 255, 0.72)"
    }
  });

  map.addLayer({
    id: "unclustered-halo",
    type: "circle",
    source: "physics-hubs",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "selected"], 1], "rgba(160, 70, 70, 0.48)",
        ["==", ["get", "kind"], "company"], "rgba(228, 228, 231, 0.26)",
        ["==", ["get", "kind"], "history"], "rgba(212, 212, 216, 0.28)",
        "rgba(212, 212, 216, 0.20)"
      ],
      "circle-radius": ["case", ["==", ["get", "selected"], 1], 15, ["==", ["get", "curated"], 1], 11, 8]
    }
  });

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "physics-hubs",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "selected"], 1], "#ffffff",
        ["==", ["get", "kind"], "company"], "#e4e4e7",
        ["==", ["get", "kind"], "history"], "#d4d4d8",
        ["==", ["get", "curated"], 1], "#f4f4f5",
        "#a1a1aa"
      ],
      "circle-radius": ["case", ["==", ["get", "selected"], 1], 7.5, ["==", ["get", "curated"], 1], 5.8, 4.5],
      "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 2.5, 1.5],
      "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], "rgb(160, 70, 70)", "rgba(255, 255, 255, 0.90)"]
    }
  });

  store.state.globeReady = true;
}

function findHitAt(px, py) {
  // 1. Direct click on any crisp Inter label pill (highest accuracy & easiest UX)
  for (let i = interactiveHits.length - 1; i >= 0; i--) {
    const h = interactiveHits[i];
    if (h.rect) {
      const [rx, ry, rw, rh] = h.rect;
      if (px >= rx - 4 && px <= rx + rw + 4 && py >= ry - 4 && py <= ry + rh + 4) {
        return h;
      }
    }
  }

  // 2. Nearest unclustered node within generous padded radius (min 22px radius = 44px diameter)
  let bestNode = null;
  let bestNodeDist = Infinity;
  let bestStack = null;
  let bestStackDist = Infinity;
  let bestCluster = null;
  let bestClusterDist = Infinity;

  for (const h of interactiveHits) {
    if (h.type === "pill" || h.rect) continue;
    const dx = px - h.x;
    const dy = py - h.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= h.r * h.r) {
      if (h.type === "stack" && d2 < bestStackDist) {
        bestStackDist = d2;
        bestStack = h;
      } else if (h.type === "node" && d2 < bestNodeDist) {
        bestNodeDist = d2;
        bestNode = h;
      } else if (h.type === "cluster" && d2 < bestClusterDist) {
        bestClusterDist = d2;
        bestCluster = h;
      }
    }
  }

  if (bestStack && (!bestNode || bestStackDist <= bestNodeDist + 144)) return bestStack;
  if (bestNode) return bestNode;
  if (bestStack) return bestStack;
  if (bestCluster) return bestCluster;
  return null;
}

/**
 * Unified Retina 2D Canvas HUD & Interaction Engine:
 * - Renders ALL globe typography in razor-sharp 'Inter' / 'Helvetica Neue' at 2x DPR
 * - Handles collision-free frosted glass label pills + hover highlight rings + optional Inter country labels
 * - Provides effortless padded clicking for every dot, cluster, and label pill on the 3D globe
 */
function initGlobeHudOverlay() {
  const container = document.getElementById("map");
  if (!container || hudCanvas) return;

  hudCanvas = document.createElement("canvas");
  hudCanvas.id = "globe-hud-canvas";
  hudCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;";
  container.appendChild(hudCanvas);

  let rafPending = false;
  let cachedUiZones = [];
  let lastUiZonesAt = 0;
  const getUiZones = (force = false) => {
    const now = performance.now();
    if (!force && now - lastUiZonesAt < 180) return cachedUiZones;
    lastUiZonesAt = now;
    const zones = [];
    for (const id of [
      "dynamic-island", "bottom-dock", "earth-only-controls", "zoom-controls",
      "place-card", "cluster-sheet", "time-bar", "rabbit-trail-bar", "active-filter-pill"
    ]) {
      const el = document.getElementById(id);
      if (!el || el.classList.contains("hidden")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) zones.push(r);
    }
    const attribEl = document.querySelector(".maplibregl-ctrl-attrib");
    if (attribEl) {
      const ar = attribEl.getBoundingClientRect();
      if (ar.width > 0 && ar.height > 0) zones.push(ar);
    }
    cachedUiZones = zones;
    return zones;
  };

  const renderHudNow = (forceUiMeasure = false) => {
    rafPending = false;
    if (!hudCanvas || !map || typeof map.project !== "function") return;
    if (store.state.viewMode !== "earth") return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (hudCanvas.width !== Math.round(w * dpr) || hudCanvas.height !== Math.round(h * dpr)) {
      hudCanvas.width = Math.round(w * dpr);
      hudCanvas.height = Math.round(h * dpr);
    }

    const ctx = hudCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const zoom = map.getZoom();
    const pitch = typeof map.getPitch === "function" ? map.getPitch() : 0;
    const is3D = pitch > 10;
    const transform = map.transform;
    const hasNativeOcclusion = Boolean(transform && typeof transform.isLocationOccluded === "function" && window.maplibregl?.LngLat);
    const hasSurfaceRay = Boolean(transform && typeof transform.isPointOnMapSurface === "function");

    const center = map.getCenter();
    const rad = Math.PI / 180;
    const bearingDeg = typeof map.getBearing === "function" ? map.getBearing() : 0;

    // True 3D spherical solar day/night terminator (3-state: Orbital 45° · Live UTC Astronomical · Off)
    // Strictly alpha = 0 across the entire sunlit hemisphere so Earth stays 100% vivid & crisp (zero grey wash!)
    const sunMode = store.state.sunMode || (store.state.sunLighting ? "orbital" : "off");
    if (sunMode !== "off" && zoom < 4.7 && pitch < 32 && hasSurfaceRay) {
      const sunFade = Math.max(0, Math.min(1, 1 - (zoom - 3.15) / 1.55));
      if (sunFade > 0.01) {
        let sx, sy, sz;
        if (sunMode === "utc") {
          const now = new Date();
          const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
          const doy = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - startOfYear) / 86400000;
          const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
          const sunLatRad = (-23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10))) * rad;
          let sunLngDeg = (12 - utcHours) * 15;
          sunLngDeg = ((sunLngDeg + 540) % 360) - 180;
          const sunLngRad = sunLngDeg * rad;

          // ECEF sun unit vector (+Z = 0°E,0°N; +X = 90°E,0°N; +Y = North Pole)
          const vx = Math.cos(sunLatRad) * Math.sin(sunLngRad);
          const vy = Math.sin(sunLatRad);
          const vz = Math.cos(sunLatRad) * Math.cos(sunLngRad);

          // Transform into camera frame (center.lng, center.lat, bearing)
          const cLng = center.lng * rad;
          const cLat = center.lat * rad;
          const bRad = bearingDeg * rad;
          const x1 = vx * Math.cos(cLng) - vz * Math.sin(cLng);
          const y1 = vy;
          const z1 = vx * Math.sin(cLng) + vz * Math.cos(cLng);
          const x2 = x1;
          const y2 = y1 * Math.cos(cLat) - z1 * Math.sin(cLat);
          const z2 = y1 * Math.sin(cLat) + z1 * Math.cos(cLat);
          sx = x2 * Math.cos(bRad) - y2 * Math.sin(bRad);
          sy = x2 * Math.sin(bRad) + y2 * Math.cos(bRad);
          sz = z2;
        } else {
          // Orbital 45° showcase angle: vivid untouched sunlit hemisphere + crisp curved night limb
          const slx = -0.64, sly = 0.28, slz = 0.71;
          const slen = Math.hypot(slx, sly, slz);
          sx = slx / slen; sy = sly / slen; sz = slz / slen;
        }

        const prevSun = renderHudNow._lastSunVec;
        const sunMoved = !prevSun
          || Math.abs(prevSun.sx - sx) > 0.014
          || Math.abs(prevSun.sy - sy) > 0.014
          || Math.abs(prevSun.sz - sz) > 0.014;

        if (!renderHudNow._sunMask || sunMoved) {
          const S = 160;
          const sc = renderHudNow._sunMask || document.createElement("canvas");
          if (sc.width !== S || sc.height !== S) {
            sc.width = S;
            sc.height = S;
          }
          const sctx = sc.getContext("2d");
          const img = renderHudNow._sunImg || sctx.createImageData(S, S);
          const data = img.data;
          data.fill(0);
          const half = S * 0.5;
          for (let py = 0; py < S; py++) {
            const v = (py + 0.5 - half) / half; // +down
            for (let px = 0; px < S; px++) {
              const u = (px + 0.5 - half) / half; // +right
              const r2 = u * u + v * v;
              if (r2 > 1.0) continue;
              const nz = Math.sqrt(Math.max(0, 1 - r2));
              // Exact 3D unit sphere normal N = (u, -v, nz)
              const ndotl = u * sx - v * sy + nz * sz;
              // Sunlit day hemisphere (ndotl >= 0.12): strictly untouched (alpha = 0 -> ZERO grey veil!)
              if (ndotl >= 0.12) continue;
              // Smooth physically curved twilight transition from ndotl = +0.12 -> -0.16
              let t = (0.12 - ndotl) / 0.28;
              if (t > 1) t = 1;
              const smooth = t * t * (3 - 2 * t);
              // Subtle warm atmospheric dusk glow right along the razor terminator line
              const duskBand = Math.exp(-Math.pow((ndotl + 0.01) / 0.055, 2));
              const idx = (py * S + px) * 4;
              data[idx] = Math.round(1 + duskBand * 26);
              data[idx + 1] = Math.round(3 + duskBand * 11);
              data[idx + 2] = Math.round(10 + duskBand * 6);
              data[idx + 3] = Math.round(smooth * 228);
            }
          }
          sctx.putImageData(img, 0, 0);
          renderHudNow._sunMask = sc;
          renderHudNow._sunImg = img;
          renderHudNow._lastSunVec = { sx, sy, sz };
        }

        const cx0 = w * 0.5;
        const cy0 = h * 0.5;
        let onCenter = false;
        try { onCenter = transform.isPointOnMapSurface({ x: cx0, y: cy0 }); } catch {}
        if (onCenter) {
          const probeEdge = (dx, dy, maxDist) => {
            let lo = 0, hi = maxDist;
            for (let step = 0; step < 10; step++) {
              const mid = (lo + hi) * 0.5;
              let hit = false;
              try { hit = transform.isPointOnMapSurface({ x: cx0 + dx * mid, y: cy0 + dy * mid }); } catch {}
              if (hit) lo = mid; else hi = mid;
            }
            return lo;
          };
          const maxSpan = Math.max(w, h) * 0.65;
          const rRight = probeEdge(1, 0, maxSpan);
          const rLeft = probeEdge(-1, 0, maxSpan);
          const rDown = probeEdge(0, 1, maxSpan);
          const rUp = probeEdge(0, -1, maxSpan);
          const gCx = cx0 + (rRight - rLeft) * 0.5;
          const gCy = cy0 + (rDown - rUp) * 0.5;
          const gR = Math.min((rRight + rLeft) * 0.5, (rDown + rUp) * 0.5);

          if (gR > 55 && gR < Math.min(w, h) * 0.498) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(gCx, gCy, gR + 0.6, 0, Math.PI * 2);
            ctx.clip();
            ctx.globalAlpha = sunFade;
            ctx.drawImage(renderHudNow._sunMask, gCx - gR - 0.8, gCy - gR - 0.8, (gR + 0.8) * 2, (gR + 0.8) * 2);

            // Subtle warm golden city-light glints on Earth's night hemisphere (science metros & major hubs)
            if (store.hubs.length && zoom < 4.3) {
              if (!renderHudNow._nightCities || renderHudNow._nightCitiesCount !== store.hubs.length) {
                const seenGrid = new Set();
                const picked = [];
                for (const hNode of store.hubs) {
                  if (!Number.isFinite(hNode.lat) || !Number.isFinite(hNode.lng)) continue;
                  const imp = hNode.impactScore || 0;
                  if (imp < 52 && hNode.tier !== "flagship" && hNode.tier !== "stem") continue;
                  const gKey = `${Math.round(hNode.lat * 0.9)}:${Math.round(hNode.lng * 0.9)}`;
                  if (seenGrid.has(gKey)) continue;
                  seenGrid.add(gKey);
                  picked.push({ lat: hNode.lat, lng: hNode.lng, weight: Math.min(1, 0.45 + (imp / 110) * 0.55) });
                  if (picked.length >= 260) break;
                }
                renderHudNow._nightCities = picked;
                renderHudNow._nightCitiesCount = store.hubs.length;
              }
              const cLatR = center.lat * rad;
              const cLngR = center.lng * rad;
              const cX = Math.cos(cLatR) * Math.cos(cLngR);
              const cY = Math.cos(cLatR) * Math.sin(cLngR);
              const cZ = Math.sin(cLatR);
              for (const city of renderHudNow._nightCities) {
                const clat = city.lat * rad;
                const clng = city.lng * rad;
                const dotCam = Math.cos(clat) * Math.cos(clng) * cX + Math.cos(clat) * Math.sin(clng) * cY + Math.sin(clat) * cZ;
                if (dotCam <= 0.14) continue;
                const pt = map.project([city.lng, city.lat]);
                if (!pt) continue;
                const u = (pt.x - gCx) / gR;
                const v = (pt.y - gCy) / gR;
                const r2 = u * u + v * v;
                if (r2 >= 0.95) continue;
                const nz = Math.sqrt(1 - r2);
                const ndotl = u * sx - v * sy + nz * sz;
                if (ndotl >= -0.05) continue;
                const nightT = Math.min(1, (-0.05 - ndotl) / 0.22);
                const alpha = sunFade * nightT * city.weight;
                const haloR = 3.6 + city.weight * 2.2;
                const g = ctx.createRadialGradient(pt.x, pt.y, 0.2, pt.x, pt.y, haloR);
                g.addColorStop(0, `rgba(255, 224, 168, ${(0.52 * alpha).toFixed(3)})`);
                g.addColorStop(0.45, `rgba(246, 186, 102, ${(0.18 * alpha).toFixed(3)})`);
                g.addColorStop(1, "rgba(246, 186, 102, 0)");
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, haloR, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.restore();
          }
        }
      }
    }

    const cx = Math.cos(center.lat * rad) * Math.cos(center.lng * rad);
    const cy = Math.cos(center.lat * rad) * Math.sin(center.lng * rad);
    const cz = Math.sin(center.lat * rad);
    const minDot = zoom >= 7 ? 0.86 : zoom >= 4.5 ? 0.45 : 0.14;

    // Exact 3D-camera-aware visibility & projection helper:
    // - Uses MapLibre's exact tilted-globe horizon clipping plane (isLocationOccluded)
    // - Uses MapLibre's 3D ray-vs-planet surface test (isPointOnMapSurface) so ZERO nodes/labels float in black space
    // - Guards against behind-camera inverted clip-space projections (w <= 0) on steep 3D tilt
    const projectVisible3D = (lng, lat, { horizonMarginPx = 0, allowEdge = false } = {}) => {
      if (hasNativeOcclusion) {
        try {
          if (transform.isLocationOccluded(new window.maplibregl.LngLat(lng, lat))) return null;
        } catch {}
      }
      // At whole-globe flat zoom (pitch <= 10°, z < 3.5), keep a gentle limb margin so bubbles stay inside Earth's rim
      if (!is3D && (!hasNativeOcclusion || (zoom < 3.5 && !allowEdge))) {
        const x = Math.cos(lat * rad) * Math.cos(lng * rad);
        const y = Math.cos(lat * rad) * Math.sin(lng * rad);
        const z = Math.sin(lat * rad);
        if (x * cx + y * cy + z * cz <= minDot) return null;
      }

      const pt = map.project([lng, lat]);
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
      const pad = allowEdge ? 140 : 36;
      if (pt.x < -pad || pt.x > w + pad || pt.y < -pad || pt.y > h + pad) return null;

      if (hasSurfaceRay && (is3D || !allowEdge)) {
        try {
          if (!transform.isPointOnMapSurface(pt)) return null;
          // Keep bubbles seated cleanly inside Earth's curved horizon limb in 3D mode (never half-floating in space)
          if (is3D && horizonMarginPx > 0 && !transform.isPointOnMapSurface({ x: pt.x, y: pt.y - horizonMarginPx })) {
            return null;
          }
        } catch {}
      }

      // Guard against steep-pitch behind-camera wrap near upper screen edge
      if (is3D && pt.y < h * 0.34 && typeof map.unproject === "function") {
        try {
          const back = map.unproject([pt.x, pt.y]);
          if (back && Number.isFinite(back.lat) && Number.isFinite(back.lng)) {
            const dLat = Math.abs(back.lat - lat);
            const rawDLng = Math.abs(back.lng - lng) % 360;
            const dLng = Math.min(rawDLng, 360 - rawDLng);
            if (dLat > 4 || dLng > 6) return null;
          }
        } catch {}
      }

      return pt;
    };

    const hits = [];
    const placedRects = [];
    const regionRects = [];
    const normalLabels = [];
    const priorityLabels = [];
    let clusterHint = null;

    // Safe UI exclusion margins & live fixed-panel masks
    const safeTop = TOP_UI_SAFE_PX;
    const safeBottom = h - BOTTOM_UI_SAFE_PX;
    const safeLeft = SIDE_UI_SAFE_PX;
    const safeRight = w - SIDE_UI_SAFE_PX;

    const uiZones = getUiZones(forceUiMeasure);
    const underUi = (x, y, r) => uiZones.some(z => x + r > z.left - 6 && x - r < z.right + 6 && y + r > z.top - 6 && y - r < z.bottom + 6);
    const labelBlocked = (rx, ry, rw, rh) => uiZones.some(z => rx + rw > z.left - 6 && rx < z.right + 6 && ry + rh > z.top - 6 && ry < z.bottom + 6);

    // 1. Optional clean Inter country/region labels (drawn softly behind markers, never blocking hub labels)
    if (store.state.labels) {
      ctx.save();
      ctx.font = `500 12px ${FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const reg of WORLD_REGION_LABELS) {
        if (zoom < reg.minZ) continue;
        const pt = projectVisible3D(reg.lng, reg.lat, { horizonMarginPx: 18 });
        if (!pt) continue;
        if (pt.x < safeLeft + 40 || pt.x > safeRight - 40 || pt.y < safeTop + 12 || pt.y > safeBottom - 12) continue;
        const tw = ctx.measureText(reg.name).width;
        const rect = [pt.x - tw / 2 - 4, pt.y - 8, tw + 8, 16];
        if (labelBlocked(rect[0], rect[1], rect[2], rect[3])) continue;
        if (regionRects.some(r => rectsOverlap(r, rect, 14))) continue;
        regionRects.push(rect);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(8, 8, 10, 0.78)";
        ctx.strokeText(reg.name, pt.x, pt.y);
        ctx.fillStyle = "rgba(244, 244, 245, 0.64)";
        ctx.fillText(reg.name, pt.x, pt.y);
      }
      ctx.restore();
    }

    // 2. Gather visible clusters & unclustered nodes (single source of truth for bubbles, counts, labels & hitboxes)
    if (CANVAS_MARKERS || useMainThreadOverlay) {
      if (useMainThreadOverlay || store.state.timeMode) {
        const arcs = buildArcsGeoJSON().features || [];
        ctx.save();
        ctx.setLineDash([4, 4]);
        for (const f of arcs) {
          const coords = f.geometry?.coordinates || [];
          const isRabbit = f.properties?.rabbit === 1;
          const isCollab = f.properties?.eco === 2;
          const focused = f.properties?.focused === 1;
          ctx.beginPath();
          let started = false;
          for (const [lng, lat] of coords) {
            const pt = projectVisible3D(lng, lat, { allowEdge: true });
            if (!pt) { started = false; continue; }
            if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
            else ctx.lineTo(pt.x, pt.y);
          }
          ctx.strokeStyle = isRabbit
            ? "rgba(208, 110, 110, 0.94)"
            : isCollab
              ? "rgba(208, 110, 110, 0.90)"
              : (focused ? "rgba(255,255,255,0.82)" : "rgba(212,212,216,0.34)");
          ctx.lineWidth = isRabbit ? 2.0 : isCollab ? 1.7 : (focused ? 1.4 : 1.0);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Active Timeline discovery beacon ring so the user's eye locks immediately onto the current milestone
      if (store.state.timeMode) {
        const tlList = getFilteredTimelineEvents();
        let activeEv = store.state.activeTimelineId
          ? tlList.find(ev => ev.id === store.state.activeTimelineId)
          : null;
        if (!activeEv && tlList.length) {
          activeEv = tlList[0];
          let bestDist = Infinity;
          for (const ev of tlList) {
            const d = Math.abs(ev.year - store.state.timeYear);
            if (d < bestDist) { bestDist = d; activeEv = ev; }
          }
        }
        if (activeEv && Number.isFinite(activeEv.lat) && Number.isFinite(activeEv.lng)) {
          const pt = projectVisible3D(activeEv.lng, activeEv.lat, { allowEdge: true });
          if (pt) {
            ctx.save();
            const grad = ctx.createRadialGradient(pt.x, pt.y, 4, pt.x, pt.y, 34);
            grad.addColorStop(0, "rgba(208, 110, 110, 0.44)");
            grad.addColorStop(0.55, "rgba(208, 110, 110, 0.15)");
            grad.addColorStop(1, "rgba(208, 110, 110, 0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 34, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(240, 198, 198, 0.88)";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 13, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Pass 1: project nodes & clusters with true 3D horizon culling + perspective depth scaling.
      // When pitched in 3D mode (pitch > 10°), slightly coarsen base cluster zoom below z=9.5 so
      // perspective-foreshortened distant regions merge cleanly instead of swarming the horizon.
      const clusterZoom = (is3D && zoom < 9.5)
        ? Math.max(0.8, zoom - (Math.min(pitch, 60) / 55) * 0.95)
        : zoom;
      const anchored = getAnchoredClusters(clusterZoom);
      const baseBubbleR = (count) => (count >= 150 ? 25 : count >= 60 ? 22 : count >= 15 ? 19 : 16);
      const depthForY = (py) => {
        if (!is3D) return 1;
        return Math.max(0, Math.min(1, (py - h * 0.14) / (h * 0.56)));
      };
      const bubbleRFor = (count, py) => {
        const base = baseBubbleR(count);
        if (!is3D) return base;
        const d = depthForY(py);
        return Math.round(base * (0.68 + 0.32 * d));
      };

      const projected = [];
      for (const item of anchored) {
        const selected = !item.isCluster && store.state.selectedId === item.node.id;
        const horizonMargin = selected ? 4 : (is3D ? (item.isCluster ? 24 : 14) : 0);
        const pt = projectVisible3D(item.lng, item.lat, { horizonMarginPx: horizonMargin });
        if (!pt) continue;
        const stableKey = item.isCluster ? (item.top?.id || `${item.lat}:${item.lng}`) : item.node.id;
        projected.push({
          isCluster: item.isCluster,
          node: item.node || null,
          top: item.top || item.node || null,
          lat: item.lat, lng: item.lng,
          x: pt.x, y: pt.y,
          anchorX: pt.x, anchorY: pt.y,
          spiderfied: false,
          count: item.count,
          span: item.spanDeg || 0,
          selected,
          stableKey,
          depthT: depthForY(pt.y)
        });
      }
      projected.sort((a, b) => (b.selected - a.selected) || (b.count - a.count) || (a.stableKey < b.stableKey ? -1 : 1));

      let kept = [];
      if (zoom >= 9.5) {
        // Group co-located nodes (within 22px):
        // - 2..6 nodes: neat breathable mini spiderfy ring
        // - >6 nodes: NEVER draw an unreadable 80-dot dandelion wheel! Collapse into a crisp tappable Stack Hub badge!
        const groups = [];
        for (const p of projected) {
          let g = null;
          for (const cand of groups) {
            const dx = cand.x - p.x, dy = cand.y - p.y;
            if (dx * dx + dy * dy < 22 * 22) { g = cand; break; }
          }
          if (g) g.items.push(p);
          else groups.push({ x: p.x, y: p.y, items: [p] });
        }
        for (const g of groups) {
          if (g.items.length === 1) {
            kept.push(g.items[0]);
            continue;
          }
          const n = g.items.length;
          if (n <= 6) {
            const ringR = Math.max(24, n * 6.5);
            g.items.forEach((p, idx) => {
              const ang = -Math.PI / 2 + (idx * Math.PI * 2) / n;
              p.anchorX = g.x;
              p.anchorY = g.y;
              p.x = g.x + Math.cos(ang) * ringR;
              p.y = g.y + Math.sin(ang) * ringR;
              p.spiderfied = true;
              kept.push(p);
            });
          } else {
            const members = g.items
              .map(it => it.node || it.top)
              .filter(Boolean)
              .sort((a, b) => {
                const pa = (a.tier === "flagship" || a.tier === "stem" ? 1 : 0);
                const pb = (b.tier === "flagship" || b.tier === "stem" ? 1 : 0);
                return (pb - pa) || ((b.impactScore || 0) - (a.impactScore || 0)) || a.name.localeCompare(b.name);
              });
            const avgLat = g.items.reduce((s, it) => s + it.lat, 0) / n;
            const avgLng = g.items.reduce((s, it) => s + it.lng, 0) / n;
            const top = members[0] || g.items[0].top;
            const cityRaw = (top?.city || "").split(",")[0].trim();
            kept.push({
              isCluster: true,
              isStack: true,
              node: null,
              top,
              stackNodes: members,
              stackTitle: cityRaw || top?.country || "Nearby Institutions",
              lat: avgLat,
              lng: avgLng,
              x: g.x,
              y: g.y,
              anchorX: g.x,
              anchorY: g.y,
              spiderfied: false,
              count: members.length,
              span: 0,
              selected: g.items.some(it => it.selected),
              depthT: depthForY(g.y),
              stableKey: `stack:${top?.id || Math.round(avgLat * 1000)}`
            });
          }
        }
      } else {
        for (const p of projected) {
          const pr = p.isCluster ? bubbleRFor(p.count, p.y) : 9;
          let host = null;
          if (!p.selected) {
            // In 3D tilted mode, enforce generous perspective breathing room near the foreshortened horizon
            const extraGap = is3D ? (12 + (1 - p.depthT) * 28) : 5;
            for (const k of kept) {
              if (k.selected) continue;
              const kr = k.isCluster ? bubbleRFor(k.count, k.y) : 9;
              const dx = k.x - p.x, dy = k.y - p.y;
              const minDist = kr + pr + extraGap;
              if (dx * dx + dy * dy < minDist * minDist) { host = k; break; }
            }
          }
          if (host) {
            const total = host.count + p.count;
            const sepLat = Math.abs(host.lat - p.lat);
            const sepLng = Math.min(Math.abs(host.lng - p.lng), 360 - Math.abs(host.lng - p.lng)) * Math.max(0.15, Math.cos(host.lat * rad));
            host.lat = (host.lat * host.count + p.lat * p.count) / total;
            host.lng = (host.lng * host.count + p.lng * p.count) / total;
            host.isCluster = true;
            host.count = total;
            host.span = Math.max(host.span, p.span, Math.hypot(sepLat, sepLng));
            const hp = host.top ? nodePriority(host.top) : -1;
            if (p.top && nodePriority(p.top) > hp) host.top = p.top;
          } else {
            kept.push(p);
          }
        }
      }

      // Pass 2: draw markers & collect deterministic label candidates
      for (const item of kept) {
        const x = item.x, y = item.y;
        const depthT = item.depthT ?? 1;
        const depthAlpha = (is3D && !item.selected) ? (0.48 + 0.52 * depthT) : 1;

        if (item.isCluster) {
          const count = item.count;
          const radius = bubbleRFor(count, y);
          if (underUi(x, y, radius)) continue;
          const cKey = `c:${item.top?.id || ""}:${Math.round(item.lat * 100)}:${Math.round(item.lng * 100)}`;
          const isHov = hoveredKey === cKey;
          const isStack = Boolean(item.isStack);

          ctx.save();
          ctx.globalAlpha = isHov ? 1 : depthAlpha;

          ctx.beginPath();
          ctx.arc(x, y, radius + (isHov ? 8 : 5), 0, Math.PI * 2);
          ctx.fillStyle = isStack
            ? (isHov ? "rgba(196, 98, 98, 0.34)" : "rgba(160, 70, 70, 0.24)")
            : (isHov ? "rgba(255, 255, 255, 0.22)" : "rgba(228, 228, 231, 0.13)");
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = isStack ? "rgba(12, 12, 14, 0.92)" : "rgba(16, 16, 18, 0.86)";
          ctx.fill();
          ctx.lineWidth = isHov ? 2.2 : isStack ? 1.85 : 1.35;
          ctx.strokeStyle = isStack
            ? (isHov ? "#ffffff" : "rgba(196, 98, 98, 0.92)")
            : (isHov ? "#ffffff" : "rgba(255, 255, 255, 0.72)");
          ctx.stroke();

          ctx.fillStyle = "#f4f4f5";
          const fontPx = Math.max(10, Math.round(13 * (is3D ? (0.78 + 0.22 * depthT) : 1)));
          ctx.font = `600 ${fontPx}px ${FONT_STACK}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(fmtCount(count), x, y + 0.5);
          ctx.restore();

          placedRects.push([x - radius - 2, y - radius - 2, (radius + 2) * 2, (radius + 2) * 2]);
          if (isStack) {
            hits.push({
              type: "stack",
              key: cKey,
              x, y,
              r: radius + 12,
              lng: item.lng,
              lat: item.lat,
              title: item.stackTitle,
              nodes: item.stackNodes
            });
            priorityLabels.push({
              id: cKey,
              name: `${item.stackTitle} · ${count}`,
              x, y,
              dotR: radius,
              selected: item.selected,
              hovered: isHov,
              priority: 75,
              stackHit: { title: item.stackTitle, lat: item.lat, lng: item.lng, nodes: item.stackNodes }
            });
          } else {
            hits.push({ type: "cluster", key: cKey, x, y, r: radius + 10, lng: item.lng, lat: item.lat, span: item.span });
            if (isHov && item.top) {
              const hoverMax = w >= 1024 ? 36 : w >= 640 ? 28 : 22;
              clusterHint = { name: `${shortGlobeName(item.top.name, hoverMax)} + ${fmtCount(count - 1)} more`, x, y, r: radius };
            }
          }
        } else {
          const n = item.node;
          const selected = store.state.selectedId === n.id;
          const isHov = hoveredKey === `n:${n.id}`;
          const curated = n.tier === "flagship" || n.tier === "timeline";
          const scale3D = (is3D && !selected) ? (0.78 + 0.22 * depthT) : 1;
          const radius = (selected ? 7.5 : curated ? 5.8 : 4.5) * scale3D;
          if (!selected && underUi(x, y, radius + 4)) continue;

          ctx.save();
          ctx.globalAlpha = selected || isHov ? 1 : depthAlpha;

          if (item.spiderfied) {
            ctx.beginPath();
            ctx.moveTo(item.anchorX, item.anchorY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = selected || isHov ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 255, 255, 0.24)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(x, y, (selected ? 15 : isHov ? 14 : curated ? 11 : 8) * scale3D, 0, Math.PI * 2);
          ctx.fillStyle = selected ? "rgba(160, 70, 70, 0.48)" : isHov ? "rgba(255, 255, 255, 0.30)" : "rgba(212, 212, 216, 0.22)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = selected || isHov ? "#ffffff" : curated ? "#f4f4f5" : "#a1a1aa";
          ctx.fill();
          ctx.lineWidth = selected ? 2.5 : isHov ? 2 : 1.5;
          ctx.strokeStyle = selected ? "rgb(160, 70, 70)" : "rgba(255, 255, 255, 0.90)";
          ctx.stroke();
          ctx.restore();

          placedRects.push([x - radius - 1, y - radius - 1, (radius + 1) * 2, (radius + 1) * 2]);
          hits.push({ type: "node", key: `n:${n.id}`, id: n.id, name: n.name, x, y, r: Math.max(radius + 16, 22) });

          const normalLabelMax = w >= 1024 ? 34 : w >= 640 ? 28 : 22;
          const emphasisLabelMax = w >= 1024 ? 44 : w >= 640 ? 36 : 28;
          const showRankBadge = !store.state.timeMode && (
            store.state.shanghaiSubject !== "all" ||
            (store.state.sortBy === "shanghai" && (store.state.branch !== "all" || store.state.discipline !== "all"))
          );
          const ctxRank = showRankBadge ? getHubContextualRank(n, {
            shanghaiSubject: store.state.shanghaiSubject,
            discipline: store.state.discipline,
            branch: store.state.branch
          }) : null;
          const rankPrefix = (ctxRank && ctxRank.rankNum <= 50) ? `#${ctxRank.rankLabel} ` : "";
          const baseName = shortGlobeName(n.name, selected || isHov ? emphasisLabelMax : normalLabelMax);
          const rankPriority = ctxRank ? (ctxRank.rankNum <= 10 ? 68 : ctxRank.rankNum <= 30 ? 58 : ctxRank.rankNum <= 100 ? 44 : 26) : 0;
          const cand = {
            id: n.id,
            name: `${rankPrefix}${baseName}`,
            x, y,
            dotR: radius,
            selected,
            hovered: isHov,
            priority: store.state.timeMode ? 70 : Math.max(rankPriority, n.pinned ? 60 : curated ? 50 : 20)
          };
          if (selected || isHov) {
            priorityLabels.push(cand);
          } else if (store.state.timeMode || n.pinned || (ctxRank && ctxRank.rankNum <= 25 && zoom >= 1.7) || (curated && zoom >= 2.3) || zoom >= 3.8) {
            normalLabels.push(cand);
          }
        }
      }
    }

    // 3. Draw stable, non-flickering Inter glass pills (normal pass first, then selected/hovered on top)
    // Deterministic sort with id tie-breaker so labels NEVER swap or jump when panning/hovering.
    normalLabels.sort((a, b) => (b.priority - a.priority) || (a.id < b.id ? -1 : 1));
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const drawPill = (c, isEmphasis) => {
      if (!c.name) return;
      ctx.font = `${isEmphasis ? 600 : 500} 13px ${FONT_STACK}`;
      const textW = ctx.measureText(c.name).width;
      const padX = 9;
      const pillW = Math.ceil(textW + padX * 2);
      const pillH = 26;

      // Always prefer right of dot; only flip left if near right viewport edge (never bounces randomly)
      let lx = c.x + c.dotR + 10;
      if (lx + pillW > safeRight) {
        lx = c.x - c.dotR - 10 - pillW;
      }
      if (isEmphasis) {
        lx = Math.max(safeLeft, Math.min(safeRight - pillW, lx));
      }
      const ly = c.y - pillH / 2;

      if (!isEmphasis) {
        if (lx < safeLeft || lx + pillW > safeRight || ly < safeTop || ly + pillH > safeBottom) return;
        if (labelBlocked(lx, ly, pillW, pillH)) return;
        const rect = [lx, ly, pillW, pillH];
        if (placedRects.some(r => rectsOverlap(r, rect, 4))) return;
        placedRects.push(rect);
      } else if (!c.selected && labelBlocked(lx, ly, pillW, pillH)) {
        return;
      }

      const rect = [lx, ly, pillW, pillH];
      drawRoundedRect(ctx, lx, ly, pillW, pillH, 13);
      ctx.fillStyle = c.selected
        ? "rgba(22, 16, 17, 0.92)"
        : c.hovered
          ? "rgba(24, 24, 27, 0.94)"
          : "rgba(14, 14, 16, 0.78)";
      ctx.fill();

      ctx.lineWidth = isEmphasis ? 1.35 : 1;
      ctx.strokeStyle = c.selected
        ? "rgba(160, 70, 70, 0.95)"
        : c.hovered
          ? "rgba(255, 255, 255, 0.56)"
          : "rgba(255, 255, 255, 0.16)";
      ctx.stroke();

      ctx.fillStyle = isEmphasis ? "#ffffff" : "rgba(244, 244, 245, 0.94)";
      ctx.fillText(c.name, lx + padX, ly + pillH / 2 + 0.5);

      hits.push(c.stackHit ? {
        type: "stack",
        key: c.id,
        title: c.stackHit.title,
        lat: c.stackHit.lat,
        lng: c.stackHit.lng,
        nodes: c.stackHit.nodes,
        x: c.x,
        y: c.y,
        r: 0,
        rect
      } : {
        type: "node",
        key: `n:${c.id}`,
        id: c.id,
        name: c.name,
        x: c.x,
        y: c.y,
        r: 0,
        rect
      });
    };

    for (const c of normalLabels) drawPill(c, false);
    // Selected draws below hovered if both exist
    priorityLabels.sort((a, b) => (a.hovered ? 1 : 0) - (b.hovered ? 1 : 0));
    for (const c of priorityLabels) drawPill(c, true);

    // Cluster hover preview tooltip (drawn last, never perturbs any other label)
    if (clusterHint) {
      ctx.font = `500 13px ${FONT_STACK}`;
      const tw = ctx.measureText(clusterHint.name).width;
      const pw = Math.ceil(tw + 20), ph = 28;
      let lx = clusterHint.x - pw / 2;
      let ly = clusterHint.y - clusterHint.r - ph - 8;
      if (ly < safeTop) ly = clusterHint.y + clusterHint.r + 8;
      lx = Math.max(safeLeft, Math.min(safeRight - pw, lx));
      drawRoundedRect(ctx, lx, ly, pw, ph, 14);
      ctx.fillStyle = "rgba(20, 20, 22, 0.94)";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.30)";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(clusterHint.name, lx + 10, ly + ph / 2 + 0.5);
    }

    interactiveHits = hits;
    if (QA_HOOKS) window.__qaGlobe = { hits, zoom: map.getZoom(), restingZoom: getRestingGlobeZoom(container) };
  };

  drawHudFn = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => renderHudNow(true));
  };

  // Frame-lock HUD directly to MapLibre's WebGL render pass (ZERO 1-frame drag lag!)
  map.on("render", () => renderHudNow(false));
  map.on("resize", () => renderHudNow(true));

  map.on("mousemove", (e) => {
    if (!e?.point) return;
    const hit = findHitAt(e.point.x, e.point.y);
    const nextKey = hit ? hit.key : null;
    map.getCanvas().style.cursor = hit ? "pointer" : "";
    if (nextKey !== hoveredKey) {
      hoveredKey = nextKey;
      drawHudFn();
    }
  });

  map.on("mouseout", () => {
    if (hoveredKey !== null) {
      hoveredKey = null;
      map.getCanvas().style.cursor = "";
      drawHudFn();
    }
  });

  map.on("click", async (e) => {
    if (!e?.point) return;
    const { x, y } = e.point;
    let hit = findHitAt(x, y);

    // Secondary padded MapLibre query fallback in case render frame just updated
    if (!hit && !useMainThreadOverlay && map.getLayer("unclustered-point") && map.getLayer("clusters")) {
      const pad = 20;
      const feats = map.queryRenderedFeatures(
        [[x - pad, y - pad], [x + pad, y + pad]],
        { layers: ["unclustered-point", "clusters"] }
      );
      if (feats.length) {
        const nodeF = feats.find(f => f.layer?.id === "unclustered-point");
        const f = nodeF || feats[0];
        if (f.layer?.id === "unclustered-point" && f.properties?.id) {
          hit = { type: "node", id: f.properties.id };
        } else if (f.properties?.cluster_id != null) {
          hit = {
            type: "cluster",
            clusterId: f.properties.cluster_id,
            lng: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1]
          };
        }
      }
    }

    if (!hit) {
      onBackgroundClickCb();
      return;
    }

    if (hit.type === "node" && hit.id) {
      onSelectNodeCb(hit.id, true);
      return;
    }

    if (hit.type === "stack" && hit.nodes?.length) {
      onSelectStackCb({ title: hit.title, lat: hit.lat, lng: hit.lng, nodes: hit.nodes });
      return;
    }

    if (hit.type === "cluster") {
      const cur = map.getZoom();
      const spanDeg = hit.span || 0;
      let targetZoom;
      if (spanDeg < 0.015) {
        // Co-located / same-city institutions: zoom cleanly and let stack hub badge show or open directly
        targetZoom = Math.max(cur + 2.0, 10.6);
      } else {
        // Spread cluster members comfortably across ~360px on screen, guaranteeing a visible split
        const viewMin = Math.min(container.clientWidth || 1200, container.clientHeight || 800);
        const targetPx = Math.max(260, Math.min(440, viewMin * 0.48));
        const fitZoom = Math.log2((targetPx * 360) / (512 * spanDeg));
        const minStep = spanDeg < 2.0 ? 2.2 : 1.9;
        const maxStep = spanDeg < 0.2 ? 6.0 : 3.4;
        targetZoom = Math.max(cur + minStep, Math.min(fitZoom, cur + maxStep));
      }
      targetZoom = Math.min(targetZoom, 14.5);
      map.easeTo({
        center: [hit.lng, hit.lat],
        zoom: targetZoom,
        duration: 620,
        easing: t => 1 - Math.pow(1 - t, 3),
        essential: true
      });
    }
  });

  drawHudFn();
}

export async function initGlobe({ onSelectNode, onSelectStack, onBackgroundClick }) {
  onSelectNodeCb = onSelectNode || (() => {});
  onSelectStackCb = onSelectStack || (() => {});
  onBackgroundClickCb = onBackgroundClick || (() => {});

  if (typeof window.maplibregl === "undefined") {
    throw new Error("MapLibre GL JS failed to load");
  }

  const isBlobPage = location.protocol === "blob:";
  let workerOk = false;
  if (typeof window.maplibregl.setWorkerUrl === "function") {
    if (isBlobPage) {
      const wCode = await fetch("./vendor/maplibre-gl-csp-worker.js").then(r => r.text());
      window.maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([wCode], { type: "application/javascript" })));
    } else {
      const directWorker = new URL("./vendor/maplibre-gl-csp-worker.js", location.href).href;
      try {
        const probe = new Worker(directWorker);
        probe.terminate();
        window.maplibregl.setWorkerUrl(directWorker);
        workerOk = true;
      } catch {
        const wCode = await fetch("./vendor/maplibre-gl-csp-worker.js").then(r => r.text());
        window.maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([wCode], { type: "application/javascript" })));
      }
    }
  }

  useMainThreadOverlay = isBlobPage || !workerOk;

  // Load local NASA Blue Marble z=0..2 tiles:
  // On blob: preview pages, relative URLs cannot be resolved against location.href or fetched
  // directly inside a blob Web Worker — so route the 21 tiny base tiles via RAM-cached main-thread fetch.
  let baseTileUrl = "";
  if (isBlobPage && typeof window.maplibregl.addProtocol === "function") {
    const localTileCache = new Map();
    window.maplibregl.addProtocol("localtile", async (params) => {
      const rel = params.url.slice("localtile://".length);
      let buf = localTileCache.get(rel);
      if (!buf) {
        const res = await fetch(`./tiles/bluemarble/${rel}`);
        if (!res.ok) throw new Error(`Local tile HTTP ${res.status}`);
        buf = await res.arrayBuffer();
        localTileCache.set(rel, buf);
      }
      return { data: buf.slice(0) };
    });
    baseTileUrl = "localtile://{z}/{y}/{x}.jpg";
  } else {
    const baseDir = new URL("../tiles/bluemarble/", import.meta.url).href;
    baseTileUrl = `${baseDir}{z}/{y}/{x}.jpg`;
  }
  const esriMirrorA = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const esriMirrorB = ESRI_SAT_TEMPLATE;

  let satProxyRegistered = false;
  const getProxySatTiles = () => {
    if (isBlobPage && typeof window.maplibregl.addProtocol === "function") {
      if (!satProxyRegistered) {
        satProxyRegistered = true;
        window.maplibregl.addProtocol("satproxy", async (params, abortController) => {
          const rest = params.url.slice("satproxy://".length);
          const raw = esriMirrorB.replace("{z}/{y}/{x}", rest);
          const mem = tileMemCache.get(raw);
          if (mem) return { data: mem.slice(0) };
          const res = await fetch(proxiedTileUrl(raw), { cache: "force-cache", signal: abortController?.signal });
          if (!res.ok) throw new Error(`Proxy tile HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          setTileMemCache(raw, buf);
          return { data: buf.slice(0) };
        });
      }
      return ["satproxy://{z}/{y}/{x}"];
    }
    const proxyBase = new URL("./_proxy?url=", location.href).href;
    return [
      `${proxyBase}${encodeURIComponent(esriMirrorB).replace(/%7B([zxy])%7D/gi, "{$1}")}`
    ];
  };

  // Use DIRECT dual-host Esri HTTP/2 URLs so MapLibre fetches & decodes tiles natively in its
  // Web Worker using the browser's C++ HTTP cache. Probe once at startup; if direct Esri access
  // is blocked (e.g. strict iframe sandbox / firewall), fall back seamlessly to the local dev proxy.
  let satTileUrl = [esriMirrorA, esriMirrorB];
  if (USE_DEV_PROXY) {
    let directOk = false;
    try {
      const probe = await fetch(
        "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/0/0/0",
        { mode: "cors", credentials: "omit", cache: "force-cache", signal: AbortSignal.timeout(2500) }
      );
      directOk = probe.ok;
    } catch {
      directOk = false;
    }
    if (!directOk) {
      satTileUrl = getProxySatTiles();
    }
  }

  try {
    if (typeof window.maplibregl.setMaxParallelImageRequests === "function") {
      window.maplibregl.setMaxParallelImageRequests(32);
    }
  } catch {}

  const mapContainer = document.getElementById("map");
  const initialZoom = getRestingGlobeZoom(mapContainer, RESTING_GLOBE_CENTER[1]);
  const initialMinZoom = getMinGlobeZoom(mapContainer);

  map = new window.maplibregl.Map({
    container: "map",
    center: RESTING_GLOBE_CENTER,
    zoom: initialZoom,
    minZoom: initialMinZoom,
    maxZoom: 17.0,
    pitch: 0,
    bearing: 0,
    antialias: true,
    clickTolerance: 10,
    attributionControl: { compact: true },
    canvasContextAttributes: { alpha: true, antialias: true },
    maxTileCacheSize: 1536,
    fadeDuration: 0,
    style: {
      version: 8,
      projection: { type: "globe" },
      sky: {
        "sky-color": "rgba(0, 0, 0, 0)",
        "horizon-color": "rgba(122, 178, 255, 0.24)",
        "fog-color": "rgba(0, 0, 0, 0)",
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.26, 4.5, 0.14, 7, 0]
      },
      sources: {
        "nasa-bluemarble": {
          type: "raster",
          tiles: [baseTileUrl],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 2,
          attribution: "Blue Marble © NASA"
        },
        "esri-satellite": {
          type: "raster",
          tiles: satTileUrl,
          tileSize: 256,
          minzoom: 0,
          maxzoom: 17,
          attribution: "Imagery © Esri"
        }
      },
      layers: [
        {
          id: "bluemarble-base",
          type: "raster",
          source: "nasa-bluemarble",
          paint: {
            "raster-fade-duration": 0,
            "raster-saturation": 0.04,
            "raster-contrast": 0.05
          }
        },
        {
          id: "satellite-layer",
          type: "raster",
          source: "esri-satellite",
          minzoom: 0,
          paint: {
            "raster-fade-duration": 80,
            "raster-saturation": 0.04,
            "raster-contrast": 0.05
          }
        }
      ]
    }
  });

  // Real ESO Photographic Milky Way Dust (eso0932a · CC BY 4.0) + 3,200 Razor-Sharp Native-Retina WebGL Stars
  // Pass 1 renders subtle, faded galactic dust (keeping Earth the hero); Pass 2 renders mathematically crisp 1px–2px
  // native-resolution gl.POINTS stars locked 1:1 to the exact same 3D spherical rotation matrix — ZERO upscaling blur!
  (function initDeepSpaceBackdrop() {
    const bg = document.getElementById("space-bg-canvas");
    if (!bg) return;

    const gl = bg.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true })
      || bg.getContext("experimental-webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) return;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    // --- Program 1: Faded ESO Milky Way Dust Skybox (smooth star-free nebula & Great Rift, zero blurry photo stars) ---
    const skyProg = gl.createProgram();
    gl.attachShader(skyProg, compile(gl.VERTEX_SHADER, `
      attribute vec2 aPos;
      void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
    `));
    gl.attachShader(skyProg, compile(gl.FRAGMENT_SHADER, `
      precision highp float;
      uniform sampler2D uSky;
      uniform vec2 uRes;
      uniform float uFov;
      uniform mat3 uMat;
      const float PI = 3.14159265359;
      const float TAU = 6.28318530718;
      void main() {
        vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uFov;
        vec3 ray = normalize(vec3(p.x, p.y, 1.0));
        vec3 d = uMat * ray;
        float lon = atan(d.x, d.z);
        float lat = asin(clamp(d.y, -1.0, 1.0));
        vec2 uv = vec2(lon / TAU + 0.5, 0.5 - lat / PI);
        vec3 col = texture2D(uSky, uv).rgb;
        // Calm, faded galactic dust glow so Earth stays the bright hero highlight
        col = max(vec3(0.0), col - vec3(0.014));
        col = pow(col, vec3(1.12)) * 0.44;
        gl_FragColor = vec4(col + vec3(0.004, 0.005, 0.009), 1.0);
      }
    `));
    gl.linkProgram(skyProg);

    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const skyAPos = gl.getAttribLocation(skyProg, "aPos");
    const uSkyLoc = gl.getUniformLocation(skyProg, "uSky");
    const uResLoc = gl.getUniformLocation(skyProg, "uRes");
    const uFovLoc = gl.getUniformLocation(skyProg, "uFov");
    const uMatLoc = gl.getUniformLocation(skyProg, "uMat");

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([1, 2, 4, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let texReady = false;
    let dirty = true;
    const skyImg = new Image();
    skyImg.decoding = "async";
    skyImg.onload = () => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skyImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      texReady = true;
      dirty = true;
    };
    skyImg.src = "./assets/milky_way_dust.jpg";

    // --- Program 2: 3,200 Razor-Sharp Native-Retina 3D gl.POINTS Stars (locked to the exact same 3D sky matrix) ---
    const starProg = gl.createProgram();
    gl.attachShader(starProg, compile(gl.VERTEX_SHADER, `
      attribute vec3 aDir;
      attribute vec4 aCol;
      attribute float aSize;
      uniform mat3 uInvMat;
      uniform vec2 uRes;
      uniform float uFov;
      uniform float uDpr;
      varying vec4 vCol;
      void main() {
        vec3 v = uInvMat * aDir;
        if (v.z <= 0.12) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          vCol = vec4(0.0);
          return;
        }
        vec2 ndc = (v.xy / v.z) * (uFov / (0.5 * uRes));
        gl_Position = vec4(ndc, 0.0, 1.0);
        gl_PointSize = aSize * uDpr;
        float edgeFade = clamp((v.z - 0.12) * 3.5, 0.0, 1.0);
        vCol = vec4(aCol.rgb, aCol.a * edgeFade);
      }
    `));
    gl.attachShader(starProg, compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec4 vCol;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c) * 2.0;
        if (d > 1.0) discard;
        // Tack-sharp optical star core (zero blurry halo smear!)
        float core = pow(1.0 - d, 1.6);
        gl_FragColor = vec4(vCol.rgb, vCol.a * core);
      }
    `));
    gl.linkProgram(starProg);

    // Deterministic astronomical star catalog in galactic coordinates (matches milky_way_dust.jpg equator!)
    let seed = 42197;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const gauss = () => (rand() + rand() + rand() - 1.5) * 0.66;

    const STAR_COUNT = 3200;
    // Stride = 8 floats: x, y, z, r, g, b, a, size
    const starData = new Float32Array(STAR_COUNT * 8);
    for (let i = 0; i < STAR_COUNT; i++) {
      let x, y, z;
      const inBand = i < STAR_COUNT * 0.52;
      if (inBand) {
        const glon = rand() * Math.PI * 2;
        const coreDist = Math.abs(Math.atan2(Math.sin(glon), Math.cos(glon)));
        const coreBoost = Math.exp(-coreDist * coreDist * 1.5);
        const glat = gauss() * (0.14 + coreBoost * 0.07);
        const cl = Math.cos(glat);
        x = cl * Math.sin(glon);
        y = Math.sin(glat);
        z = cl * Math.cos(glon);
      } else {
        const u = rand() * 2 - 1;
        const phi = rand() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        x = s * Math.cos(phi);
        y = u;
        z = s * Math.sin(phi);
      }
      const mag = rand();
      const bright = mag > 0.978;
      const med = !bright && mag > 0.84;
      // Tack-sharp sizes (1.1px–2.5px) and calm, faded alpha so Earth stays the clear highlight
      const size = bright ? (2.1 + rand() * 0.7) : med ? (1.45 + rand() * 0.45) : (1.05 + rand() * 0.35);
      const alpha = bright ? (0.64 + rand() * 0.22) : med ? (0.34 + rand() * 0.22) : (0.14 + rand() * 0.18);
      const temp = rand();
      let cr = 0.96, cg = 0.97, cb = 1.0;
      if (temp > 0.72) { cr = 0.80; cg = 0.89; cb = 1.0; }       // subtle O/B blue-white
      else if (temp < 0.25) { cr = 1.0; cg = 0.90; cb = 0.78; }  // subtle K/M warm ivory
      const o = i * 8;
      starData[o] = x; starData[o + 1] = y; starData[o + 2] = z;
      starData[o + 3] = cr; starData[o + 4] = cg; starData[o + 5] = cb; starData[o + 6] = alpha;
      starData[o + 7] = size;
    }

    const starBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);

    const starADir = gl.getAttribLocation(starProg, "aDir");
    const starACol = gl.getAttribLocation(starProg, "aCol");
    const starASize = gl.getAttribLocation(starProg, "aSize");
    const starUInvMat = gl.getUniformLocation(starProg, "uInvMat");
    const starURes = gl.getUniformLocation(starProg, "uRes");
    const starUFov = gl.getUniformLocation(starProg, "uFov");
    const starUDpr = gl.getUniformLocation(starProg, "uDpr");

    // 3x3 row-major rotation matrix helpers
    const mul3 = (a, b) => [
      a[0]*b[0] + a[1]*b[3] + a[2]*b[6], a[0]*b[1] + a[1]*b[4] + a[2]*b[7], a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
      a[3]*b[0] + a[4]*b[3] + a[5]*b[6], a[3]*b[1] + a[4]*b[4] + a[5]*b[7], a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
      a[6]*b[0] + a[7]*b[3] + a[8]*b[6], a[6]*b[1] + a[7]*b[4] + a[8]*b[7], a[6]*b[2] + a[7]*b[5] + a[8]*b[8]
    ];
    const rotX = (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; };
    const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
    const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };

    // Constant galactic-to-equatorial orientation (authentic ~60 deg galactic tilt framed subtly behind Earth)
    const galBase = mul3(rotY(-0.34), mul3(rotX(-0.18), rotZ(0.96)));

    let w = 0, h = 0, pxW = 0, pxH = 0, curDpr = 1;
    const resize = () => {
      curDpr = Math.min(window.devicePixelRatio || 1, 2);
      w = bg.clientWidth || window.innerWidth;
      h = bg.clientHeight || window.innerHeight;
      pxW = Math.max(1, Math.round(w * curDpr));
      pxH = Math.max(1, Math.round(h * curDpr));
      bg.width = pxW;
      bg.height = pxH;
      gl.viewport(0, 0, pxW, pxH);
      dirty = true;
    };
    resize();
    window.addEventListener("resize", resize);

    let lastKey = "";
    const draw = () => {
      if (store.state.viewMode === "earth" && map) {
        const c = map.getCenter?.() || { lng: RESTING_GLOBE_CENTER[0], lat: RESTING_GLOBE_CENTER[1] };
        const z = map.getZoom?.() ?? initialZoom;
        const bearing = map.getBearing?.() ?? 0;
        const pitch = map.getPitch?.() ?? 0;
        const key = `${c.lng.toFixed(3)}|${c.lat.toFixed(3)}|${z.toFixed(3)}|${bearing.toFixed(2)}|${pitch.toFixed(2)}|${pxW}x${pxH}|${texReady ? 1 : 0}`;

        if (dirty || key !== lastKey) {
          dirty = false;
          lastKey = key;

          const camMat = mul3(
            rotY(c.lng * Math.PI / 180),
            mul3(
              rotX((-c.lat * 0.92 - pitch * 0.72) * Math.PI / 180),
              rotZ(bearing * Math.PI / 180)
            )
          );
          const m = mul3(galBase, camMat);
          // m is orthogonal: col-major(m) transforms view->galactic, col-major(transpose(m)) = row-major(m) transforms galactic->view!
          const matColMajor = new Float32Array([
            m[0], m[3], m[6],
            m[1], m[4], m[7],
            m[2], m[5], m[8]
          ]);
          const invMatColMajor = new Float32Array([
            m[0], m[1], m[2],
            m[3], m[4], m[5],
            m[6], m[7], m[8]
          ]);

          const fovPx = Math.max(pxW, pxH) * (0.78 + Math.min(z, 6) * 0.032);

          // Pass 1: Faded ESO Milky Way galactic dust backdrop
          gl.disable(gl.BLEND);
          gl.useProgram(skyProg);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(uSkyLoc, 0);
          gl.uniform2f(uResLoc, pxW, pxH);
          gl.uniform1f(uFovLoc, fovPx);
          gl.uniformMatrix3fv(uMatLoc, false, matColMajor);
          gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
          gl.enableVertexAttribArray(skyAPos);
          gl.vertexAttribPointer(skyAPos, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.disableVertexAttribArray(skyAPos);

          // Pass 2: 3,200 tack-sharp native-resolution gl.POINTS stars locked 1:1 to the exact same sky sphere
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          gl.useProgram(starProg);
          gl.uniformMatrix3fv(starUInvMat, false, invMatColMajor);
          gl.uniform2f(starURes, pxW, pxH);
          gl.uniform1f(starUFov, fovPx);
          gl.uniform1f(starUDpr, curDpr);
          gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
          const stride = 8 * 4;
          gl.enableVertexAttribArray(starADir);
          gl.vertexAttribPointer(starADir, 3, gl.FLOAT, false, stride, 0);
          gl.enableVertexAttribArray(starACol);
          gl.vertexAttribPointer(starACol, 4, gl.FLOAT, false, stride, 3 * 4);
          gl.enableVertexAttribArray(starASize);
          gl.vertexAttribPointer(starASize, 1, gl.FLOAT, false, stride, 7 * 4);
          gl.drawArrays(gl.POINTS, 0, STAR_COUNT);
          gl.disableVertexAttribArray(starADir);
          gl.disableVertexAttribArray(starACol);
          gl.disableVertexAttribArray(starASize);
        }
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  })();

  const syncViewportBounds = () => {
    if (!map) return;
    const mapEl = document.getElementById("map");
    const nextMin = getMinGlobeZoom(mapEl);
    if (typeof map.setMinZoom === "function" && Math.abs(map.getMinZoom() - nextMin) > 0.01) {
      map.setMinZoom(nextMin);
    }
    map.resize();
  };

  if (typeof ResizeObserver !== "undefined") {
    const mapEl = document.getElementById("map");
    if (mapEl) {
      const ro = new ResizeObserver(syncViewportBounds);
      ro.observe(mapEl);
    }
  }
  window.addEventListener("resize", syncViewportBounds, { passive: true });

  map.on("style.load", () => {
    const attrib = map.getContainer()?.querySelector(".maplibregl-ctrl-attrib");
    if (attrib) {
      attrib.classList.remove("maplibregl-compact-show");
      attrib.removeAttribute("open");
    }
    if (!useMainThreadOverlay) {
      setupWebGLVectorLayers();
    } else {
      store.state.globeReady = true;
    }
    initGlobeHudOverlay();
    syncGlobeMarkers();
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => drawHudFn()).catch(() => {});
    }
    initIdleDrift();
  });

  // Automatic fallback to local dev proxy only if direct Esri CDN is unreachable
  let switchedToProxy = satTileUrl !== null && satTileUrl[0] !== esriMirrorA;
  map.on("error", (ev) => {
    if (switchedToProxy || !USE_DEV_PROXY) return;
    if (ev?.sourceId === "esri-satellite") {
      switchedToProxy = true;
      const src = map.getSource("esri-satellite");
      if (src?.setTiles) {
        src.setTiles(getProxySatTiles());
      }
    }
  });
}

/**
 * Attract-mode idle drift: after a quiet period at overview zoom, Earth slowly turns
 * (≈4°/s). Any pointer, wheel, key or touch input stops it instantly. Disabled for
 * prefers-reduced-motion, while a card/timeline is open, or in automated QA runs.
 */
let idleDriftInit = false;
function initIdleDrift() {
  if (idleDriftInit || !map || QA_HOOKS) return;
  idleDriftInit = true;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const IDLE_MS = 14000;
  const DEG_PER_SEC = 4;
  let lastInput = performance.now();
  let lastFrame = 0;

  const bump = () => { lastInput = performance.now(); };
  ["pointerdown", "wheel", "keydown", "touchstart"].forEach(ev =>
    window.addEventListener(ev, bump, { passive: true, capture: true })
  );

  const tick = (now) => {
    const dt = lastFrame ? Math.min(now - lastFrame, 64) : 16;
    lastFrame = now;
    const eligible =
      !reduce?.matches &&
      !document.hidden &&
      store.state.viewMode === "earth" &&
      !store.state.timeMode &&
      !store.state.selectedId &&
      map.getZoom() < 3.2 &&
      !document.querySelector("#spotlight-backdrop:not(.hidden), #drawer-backdrop:not(.hidden), #auth-modal-backdrop:not(.hidden)");
    if (eligible && now - lastInput > IDLE_MS && !map.isEasing?.()) {
      const c = map.getCenter();
      map.jumpTo({ center: [c.lng + (DEG_PER_SEC * dt) / 1000, c.lat] });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function syncGlobeMarkers() {
  invalidateGeoClusterCache();
  if (!store.state.globeReady || !map) return;
  if (!useMainThreadOverlay) {
    const src = map.getSource("physics-hubs");
    if (src?.setData) src.setData(buildGeoJSON(getVisibleGlobeNodes()));
    const arcSrc = map.getSource("physics-arcs");
    if (arcSrc?.setData) arcSrc.setData(buildArcsGeoJSON());
  }
  drawHudFn();
}

export function flyToHub(node, zoomOverride = null) {
  if (!map || !node) return;
  const defaultZoom = Math.min(node.zoom || 5.8, 6.2);
  const curZoom = map.getZoom();
  const targetZoom = zoomOverride != null ? zoomOverride : Math.max(curZoom, defaultZoom);
  map.easeTo({
    center: [node.lng, node.lat],
    zoom: Math.min(targetZoom, 14.5),
    pitch: store.state.tilted ? 48 : 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    duration: 620,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });
}

export function flyToTimelineEvent(ev, isTour = false) {
  if (!map || !ev || !Number.isFinite(ev.lat) || !Number.isFinite(ev.lng)) return;
  const isMobile = (window.innerWidth || 1280) < 768;
  const targetZoom = isMobile ? 3.5 : 4.25;
  const targetPitch = store.state.tilted ? 44 : (isTour ? 22 : 12);
  map.easeTo({
    center: [ev.lng, ev.lat],
    zoom: targetZoom,
    pitch: targetPitch,
    bearing: 0,
    padding: { top: 72, bottom: isMobile ? 260 : 240, left: 0, right: 0 },
    duration: isTour ? 1350 : 850,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });
}

export function resetGlobeToSpace(center = RESTING_GLOBE_CENTER, zoom = null) {
  if (!map) return;
  store.state.tilted = false;
  const tiltBtn = typeof document !== "undefined" ? document.getElementById("btn-tilt") : null;
  if (tiltBtn) {
    tiltBtn.classList.remove("glass-btn-active");
    tiltBtn.classList.add("glass-btn");
  }
  const targetCenter = Array.isArray(center) && center.length === 2 ? center : RESTING_GLOBE_CENTER;
  const targetZoom = Number.isFinite(zoom)
    ? zoom
    : getRestingGlobeZoom(map.getContainer?.(), targetCenter[1]);
  map.easeTo({
    center: targetCenter,
    zoom: targetZoom,
    pitch: 0,
    bearing: 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    duration: 750,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });
}

export const resetGlobeToRest = resetGlobeToSpace;

export function setGlobeLabels(visible) {
  store.state.labels = Boolean(visible);
  drawHudFn();
}

export function setGlobeTilt(tilted) {
  if (!map) return;
  const z = map.getZoom();
  const targetPitch = tilted ? (z < 2.8 ? 36 : 48) : 0;
  map.easeTo({ pitch: targetPitch, duration: 650, easing: t => 1 - Math.pow(1 - t, 3) });
}

export function zoomInGlobe() {
  if (map) map.zoomIn({ duration: 340 });
}

export function zoomOutGlobe() {
  if (map) map.zoomOut({ duration: 340 });
}
