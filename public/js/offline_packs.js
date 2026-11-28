/**
 * World of Science / physY — Offline Pack Manager (Organic Maps Style)
 *
 * Zero-dependency browser ES module managing modular downloadable packs:
 *  - IndexedDB ("world-stem-offline-v1", store "packs") for full offline JSON data packs
 *  - Cache Storage ("world-physics-tiles-v1") for the 21 local NASA Blue Marble Earth tiles
 *  - localStorage metadata mirror + graceful fallback when IndexedDB is unavailable
 */

export const OFFLINE_DB_NAME = "world-stem-offline-v1";
export const OFFLINE_STORE_NAME = "packs";
export const OFFLINE_TILE_CACHE = "world-physics-tiles-v1";

const DB_VERSION = 1;
const MANIFEST_URL = "./data/packs/manifest.json";
const MANIFEST_CACHE_KEY = "world_stem_offline_manifest_v1";
const META_INDEX_KEY = "world_stem_offline_meta_v1";
const FALLBACK_PACK_PREFIX = "world_stem_offline_pack_v1_";

const DEFAULT_BASE_TILES = (() => {
  const urls = [];
  for (let z = 0; z <= 2; z++) {
    const dim = 1 << z;
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        urls.push(`./tiles/bluemarble/${z}/${y}/${x}.jpg`);
      }
    }
  }
  return urls;
})();

// In-memory fallback state (protects strict sandboxed / private browsing environments)
const memoryMeta = Object.create(null);
const memoryPacks = new Map();
let cachedManifestMem = null;
let dbPromise = null;
let idbUnavailable = false;

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Storage helpers: localStorage metadata mirror
// ---------------------------------------------------------------------------

function readMetaIndex() {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(META_INDEX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return { ...memoryMeta, ...parsed };
        }
      }
    }
  } catch {
    // Fall back to in-memory mirror
  }
  return { ...memoryMeta };
}

function writeMetaIndex(metaMap) {
  for (const k of Object.keys(memoryMeta)) delete memoryMeta[k];
  Object.assign(memoryMeta, metaMap);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(META_INDEX_KEY, JSON.stringify(metaMap));
    }
  } catch {
    // Ignore quota or private-mode errors; memoryMeta remains accurate for session
  }
}

function upsertMetaEntry(entry) {
  const current = readMetaIndex();
  current[entry.id] = {
    id: entry.id,
    name: entry.name || entry.id,
    category: entry.category || "discipline",
    version: entry.version || "1.0.0",
    sizeBytes: Number(entry.sizeBytes) || 0,
    sizeLabel: entry.sizeLabel || formatBytes(entry.sizeBytes || 0),
    sha256: entry.sha256 || null,
    downloadedAt: entry.downloadedAt || new Date().toISOString(),
    counts: entry.counts || { hubs: 0, events: 0, missions: 0, domains: 0, trails: 0 },
    storage: entry.storage || "idb",
    ...(Array.isArray(entry.tiles) ? { tiles: entry.tiles } : {})
  };
  writeMetaIndex(current);
  return current[entry.id];
}

function removeMetaEntry(packId) {
  const current = readMetaIndex();
  delete current[packId];
  writeMetaIndex(current);
}

// ---------------------------------------------------------------------------
// Storage helpers: IndexedDB ("world-stem-offline-v1", store "packs")
// ---------------------------------------------------------------------------

function openOfflineDB() {
  if (idbUnavailable || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(OFFLINE_DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
          db.createObjectStore(OFFLINE_STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        idbUnavailable = true;
        dbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        resolve(null);
      };
    } catch {
      idbUnavailable = true;
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

async function idbPutPack(record) {
  const db = await openOfflineDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite");
      tx.objectStore(OFFLINE_STORE_NAME).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbGetPack(packId) {
  const db = await openOfflineDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readonly");
      const req = tx.objectStore(OFFLINE_STORE_NAME).get(packId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGetAllPacks() {
  const db = await openOfflineDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readonly");
      const req = tx.objectStore(OFFLINE_STORE_NAME).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbDeletePack(packId) {
  const db = await openOfflineDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite");
      tx.objectStore(OFFLINE_STORE_NAME).delete(packId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

// ---------------------------------------------------------------------------
// Integrity & payload helpers
// ---------------------------------------------------------------------------

async function computeSha256Hex(uint8Array) {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const hashBuf = await crypto.subtle.digest("SHA-256", uint8Array);
    const bytes = new Uint8Array(hashBuf);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return null;
  }
}

function normalizePackPayload(raw, fallbackMeta = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid offline pack JSON: expected an object payload.");
  }
  const hubs = Array.isArray(raw.hubs) ? raw.hubs : [];
  const events = Array.isArray(raw.events) ? raw.events : [];
  const missions = Array.isArray(raw.missions) ? raw.missions : [];
  const domains = Array.isArray(raw.domains) ? raw.domains : [];
  const trails = Array.isArray(raw.trails) ? raw.trails : [];
  const rawMeta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};

  const counts = {
    hubs: hubs.length,
    events: events.length,
    missions: missions.length,
    domains: domains.length,
    trails: trails.length
  };

  return {
    meta: {
      id: rawMeta.id || fallbackMeta.id || "unknown_pack",
      name: rawMeta.name || fallbackMeta.name || fallbackMeta.id || "Offline Pack",
      category: rawMeta.category || fallbackMeta.category || "discipline",
      description: rawMeta.description || fallbackMeta.description || "",
      version: rawMeta.version || fallbackMeta.version || "1.0.0",
      generatedAt: rawMeta.generatedAt || null,
      counts,
      ...(rawMeta.eras ? { eras: rawMeta.eras } : {}),
      ...(rawMeta.spaceZones ? { spaceZones: rawMeta.spaceZones } : {})
    },
    hubs,
    events,
    missions,
    domains,
    trails
  };
}

function resolveAbsoluteUrl(relUrl) {
  try {
    if (typeof location !== "undefined" && location.href) {
      return new URL(relUrl, location.href).href;
    }
  } catch {
    // Ignore
  }
  return relUrl;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches ./data/packs/manifest.json with offline cache fallback.
 */
export async function fetchPackManifest({ forceNetwork = false } = {}) {
  try {
    const res = await fetch(MANIFEST_URL, forceNetwork ? { cache: "no-cache" } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.packs)) {
      throw new Error("Malformed offline pack manifest");
    }
    cachedManifestMem = data;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(data));
      }
    } catch {
      // Ignore storage quota errors
    }
    return data;
  } catch {
    // Offline fallback: return cached manifest from memory or localStorage
    if (cachedManifestMem) {
      return { ...cachedManifestMem, fromCache: true };
    }
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(MANIFEST_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.packs)) {
            cachedManifestMem = parsed;
            return { ...parsed, fromCache: true };
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
    return {
      schemaVersion: "1.0.0",
      version: "offline",
      generatedAt: null,
      packs: [],
      fromCache: true,
      unavailable: true
    };
  }
}

/**
 * Returns a Set<string> of currently installed offline pack IDs.
 */
export function getDownloadedPackIds() {
  return new Set(Object.keys(readMetaIndex()));
}

/**
 * Returns a map object: id -> { id, name, category, version, sizeBytes, sizeLabel, sha256, downloadedAt, counts, storage }.
 */
export function getDownloadedPackMeta() {
  return readMetaIndex();
}

/**
 * Returns aggregate offline storage usage: { packCount, totalBytes, totalLabel }.
 */
export function getOfflineStorageStats() {
  const meta = readMetaIndex();
  const entries = Object.values(meta);
  let totalBytes = 0;
  for (const item of entries) {
    totalBytes += Number(item?.sizeBytes) || 0;
  }
  return {
    packCount: entries.length,
    totalBytes,
    totalLabel: formatBytes(totalBytes)
  };
}

/**
 * Downloads the 21 local NASA Blue Marble z=0..2 tiles into Cache Storage ("world-physics-tiles-v1").
 */
async function downloadTilesPack(packMeta, onProgress) {
  const tiles = Array.isArray(packMeta.tiles) && packMeta.tiles.length > 0
    ? packMeta.tiles
    : DEFAULT_BASE_TILES;

  const hasCaches = typeof caches !== "undefined";
  const cache = hasCaches ? await caches.open(OFFLINE_TILE_CACHE) : null;

  let completed = 0;
  let loadedBytes = 0;
  const cachedUrls = [];
  const concurrency = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < tiles.length) {
      const idx = cursor++;
      const tileUrl = tiles[idx];
      const absUrl = resolveAbsoluteUrl(tileUrl);
      const res = await fetch(tileUrl, { cache: "force-cache" });
      if (!res.ok) {
        throw new Error(`Failed to fetch base tile ${tileUrl} (HTTP ${res.status})`);
      }
      const cloneForSize = res.clone();
      const buf = await cloneForSize.arrayBuffer();
      loadedBytes += buf.byteLength;

      if (cache) {
        // Store under resolved URL (matches sw.js cache.match(req.url)) and relative URL
        await cache.put(absUrl, res.clone());
        if (absUrl !== tileUrl) {
          await cache.put(tileUrl, res.clone());
        }
      }
      cachedUrls.push(tileUrl);
      completed++;
      const pct = Math.min(99, Math.round((completed / tiles.length) * 100));
      onProgress?.(pct, { phase: "tiles", done: completed, total: tiles.length, loadedBytes });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, () => worker()));

  const downloadedAt = new Date().toISOString();
  const finalBytes = loadedBytes || Number(packMeta.sizeBytes) || 0;
  const counts = {
    hubs: 0,
    events: 0,
    missions: 0,
    domains: 0,
    trails: 0,
    tiles: cachedUrls.length
  };

  upsertMetaEntry({
    id: packMeta.id,
    name: packMeta.name || "Earth Base Globe Tiles (z0–z2)",
    category: "tiles",
    version: packMeta.version || "1.0.0",
    sizeBytes: finalBytes,
    sizeLabel: formatBytes(finalBytes),
    sha256: packMeta.sha256 || null,
    downloadedAt,
    counts,
    storage: cache ? "cache-storage" : "memory",
    tiles: cachedUrls
  });

  onProgress?.(100, { phase: "complete", done: cachedUrls.length, total: tiles.length, loadedBytes: finalBytes });

  return {
    meta: {
      id: packMeta.id,
      name: packMeta.name || "Earth Base Globe Tiles (z0–z2)",
      category: "tiles",
      version: packMeta.version || "1.0.0",
      downloadedAt,
      sizeBytes: finalBytes,
      counts
    },
    hubs: [],
    events: [],
    missions: [],
    domains: [],
    trails: [],
    tiles: cachedUrls
  };
}

/**
 * Streams a pack JSON with progress callback (0..100), validates JSON & optional SHA-256,
 * persists it to IndexedDB (or Cache Storage for tiles_earth_base), and returns the payload.
 */
export async function downloadPack(packMetaOrId, onProgress) {
  let packMeta = packMetaOrId;
  if (typeof packMetaOrId === "string") {
    const manifest = await fetchPackManifest();
    packMeta = manifest.packs.find((p) => p.id === packMetaOrId);
    if (!packMeta) {
      throw new Error(`Offline pack "${packMetaOrId}" not found in manifest.`);
    }
  }
  if (!packMeta || !packMeta.id) {
    throw new Error("downloadPack requires a valid pack metadata object or pack ID.");
  }

  onProgress?.(0, { phase: "starting", loaded: 0, total: Number(packMeta.sizeBytes) || 0 });

  // Virtual base globe tiles pack -> Cache Storage ("world-physics-tiles-v1")
  if (packMeta.category === "tiles" || packMeta.id === "tiles_earth_base" || Array.isArray(packMeta.tiles)) {
    return downloadTilesPack(packMeta, onProgress);
  }

  // Standard JSON data pack -> Stream & verify & persist to IndexedDB
  // Supports remote GitHub Pages fallback when native mobile builds prune duplicate pack files to save ~13 MB
  const relPath = `data/packs/${packMeta.file || `${packMeta.id}.json`}`;
  const localUrl = packMeta.url || `./${relPath}`;
  let res = await fetch(localUrl).catch(() => null);
  if (!res || !res.ok) {
    const remoteUrl = `https://planckmaxxing.github.io/physY/${relPath}`;
    res = await fetch(remoteUrl);
  }
  if (!res || !res.ok) {
    throw new Error(`Failed to download pack "${packMeta.id}" (HTTP ${res?.status || 0})`);
  }

  const contentLengthHeader = Number(res.headers.get("content-length") || 0);
  const expectedTotal = contentLengthHeader || Number(packMeta.sizeBytes) || 0;

  let bytes;
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength) {
        chunks.push(value);
        loaded += value.byteLength;
        const pct = expectedTotal > 0
          ? Math.min(92, Math.round((loaded / expectedTotal) * 92))
          : Math.min(90, Math.round(10 + Math.log10(loaded + 1) * 14));
        onProgress?.(pct, { phase: "downloading", loaded, total: expectedTotal });
      }
    }

    bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } else {
    const ab = await res.arrayBuffer();
    bytes = new Uint8Array(ab);
    onProgress?.(92, { phase: "downloading", loaded: bytes.byteLength, total: bytes.byteLength });
  }

  onProgress?.(94, { phase: "verifying", loaded: bytes.byteLength, total: bytes.byteLength });

  // Optional cryptographic SHA-256 verification when SubtleCrypto is available (HTTPS / localhost)
  let verifiedSha256 = packMeta.sha256 || null;
  if (packMeta.sha256) {
    const actualSha = await computeSha256Hex(bytes);
    if (actualSha && actualSha !== packMeta.sha256) {
      throw new Error(`Integrity check failed for "${packMeta.id}" (SHA-256 mismatch).`);
    }
    if (actualSha) verifiedSha256 = actualSha;
  }

  // Decode & verify valid JSON
  const text = new TextDecoder("utf-8").decode(bytes);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Downloaded pack "${packMeta.id}" is not valid JSON: ${err.message}`);
  }

  const payload = normalizePackPayload(parsed, packMeta);
  const downloadedAt = new Date().toISOString();
  const actualBytes = bytes.byteLength;

  payload.meta.downloadedAt = downloadedAt;
  payload.meta.sizeBytes = actualBytes;
  if (verifiedSha256) payload.meta.sha256 = verifiedSha256;

  onProgress?.(97, { phase: "storing", loaded: actualBytes, total: actualBytes });

  // Persist into IndexedDB (primary), with localStorage / memory fallback
  const record = {
    id: packMeta.id,
    version: payload.meta.version,
    sizeBytes: actualBytes,
    sha256: verifiedSha256,
    downloadedAt,
    meta: payload.meta,
    payload
  };

  let storageBackend = "idb";
  const savedToIdb = await idbPutPack(record);
  if (!savedToIdb) {
    storageBackend = "memory";
    // Best-effort localStorage fallback for compact packs (< 2 MB) when IDB is unavailable
    if (actualBytes < 2 * 1024 * 1024 && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`${FALLBACK_PACK_PREFIX}${packMeta.id}`, text);
        storageBackend = "localStorage";
      } catch {
        storageBackend = "memory";
      }
    }
  }

  memoryPacks.set(packMeta.id, payload);

  upsertMetaEntry({
    id: packMeta.id,
    name: payload.meta.name,
    category: payload.meta.category,
    version: payload.meta.version,
    sizeBytes: actualBytes,
    sizeLabel: formatBytes(actualBytes),
    sha256: verifiedSha256,
    downloadedAt,
    counts: payload.meta.counts,
    storage: storageBackend
  });

  onProgress?.(100, { phase: "complete", loaded: actualBytes, total: actualBytes });
  return payload;
}

/**
 * Deletes an installed offline pack from IndexedDB, Cache Storage, and metadata index.
 */
export async function deletePack(packId) {
  if (!packId) return false;
  const metaMap = readMetaIndex();
  const existing = metaMap[packId];

  memoryPacks.delete(packId);
  removeMetaEntry(packId);

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(`${FALLBACK_PACK_PREFIX}${packId}`);
    }
  } catch {
    // Ignore
  }

  await idbDeletePack(packId);

  if (packId === "tiles_earth_base" || existing?.category === "tiles") {
    if (typeof caches !== "undefined") {
      try {
        const cache = await caches.open(OFFLINE_TILE_CACHE);
        const tiles = Array.isArray(existing?.tiles) && existing.tiles.length > 0
          ? existing.tiles
          : DEFAULT_BASE_TILES;
        await Promise.all(
          tiles.map(async (tileUrl) => {
            await cache.delete(resolveAbsoluteUrl(tileUrl)).catch(() => {});
            await cache.delete(tileUrl).catch(() => {});
          })
        );
      } catch {
        // Ignore Cache Storage errors
      }
    }
  }

  return true;
}

/**
 * Loads all downloaded offline data packs from IndexedDB (or fallback storage) on app boot.
 * Works 100% offline and reconciles localStorage metadata with actual persisted records.
 */
export async function loadAllOfflinePacks() {
  const loadedPayloads = [];
  const metaIndex = readMetaIndex();
  const reconciledMeta = {};

  // 1. Preserve & verify tiles_earth_base if present in Cache Storage
  if (metaIndex.tiles_earth_base) {
    let tilesOk = true;
    if (typeof caches !== "undefined") {
      try {
        const cache = await caches.open(OFFLINE_TILE_CACHE);
        const probe =
          (await cache.match(resolveAbsoluteUrl(DEFAULT_BASE_TILES[0]))) ||
          (await cache.match(DEFAULT_BASE_TILES[0]));
        if (!probe) tilesOk = false;
      } catch {
        // Keep metadata if Cache API probe fails
      }
    }
    if (tilesOk) {
      reconciledMeta.tiles_earth_base = metaIndex.tiles_earth_base;
    }
  }

  // 2. Read all stored packs from IndexedDB
  const idbRecords = await idbGetAllPacks();
  if (Array.isArray(idbRecords)) {
    for (const rec of idbRecords) {
      if (!rec || !rec.id || !rec.payload) continue;
      try {
        const payload = normalizePackPayload(rec.payload, rec.meta || { id: rec.id });
        payload.meta.downloadedAt = rec.downloadedAt || payload.meta.downloadedAt || null;
        payload.meta.sizeBytes = Number(rec.sizeBytes) || payload.meta.sizeBytes || 0;
        memoryPacks.set(rec.id, payload);
        loadedPayloads.push(payload);

        reconciledMeta[rec.id] = {
          id: rec.id,
          name: payload.meta.name,
          category: payload.meta.category,
          version: rec.version || payload.meta.version,
          sizeBytes: payload.meta.sizeBytes,
          sizeLabel: formatBytes(payload.meta.sizeBytes),
          sha256: rec.sha256 || null,
          downloadedAt: rec.downloadedAt || new Date().toISOString(),
          counts: payload.meta.counts,
          storage: "idb"
        };
      } catch {
        // Skip corrupted record gracefully
      }
    }
    writeMetaIndex(reconciledMeta);
    return loadedPayloads;
  }

  // 3. Fallback path when IndexedDB is unavailable: load from localStorage / memory
  for (const [packId, entry] of Object.entries(metaIndex)) {
    if (packId === "tiles_earth_base" || entry?.category === "tiles") continue;
    if (memoryPacks.has(packId)) {
      loadedPayloads.push(memoryPacks.get(packId));
      reconciledMeta[packId] = entry;
      continue;
    }
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(`${FALLBACK_PACK_PREFIX}${packId}`);
        if (raw) {
          const payload = normalizePackPayload(JSON.parse(raw), entry);
          memoryPacks.set(packId, payload);
          loadedPayloads.push(payload);
          reconciledMeta[packId] = entry;
        }
      }
    } catch {
      // Skip unreadable entry
    }
  }

  writeMetaIndex(reconciledMeta);
  return loadedPayloads;
}

/**
 * Triggers a browser .json download of an offline pack so users can back up or share bundles.
 */
export async function exportPackToFile(packId) {
  if (!packId) throw new Error("exportPackToFile requires a packId.");

  const metaIndex = readMetaIndex();
  const entry = metaIndex[packId] || null;
  let exportPayload = null;

  // Special case: virtual tile pack exports its manifest descriptor + tile list
  if (packId === "tiles_earth_base" || entry?.category === "tiles") {
    exportPayload = {
      meta: {
        id: packId,
        name: entry?.name || "Earth Base Globe Tiles (z0–z2)",
        category: "tiles",
        version: entry?.version || "1.0.0",
        exportedAt: new Date().toISOString(),
        sizeBytes: entry?.sizeBytes || 0,
        counts: entry?.counts || { tiles: DEFAULT_BASE_TILES.length }
      },
      tiles: Array.isArray(entry?.tiles) ? entry.tiles : DEFAULT_BASE_TILES
    };
  } else {
    // 1. Try IndexedDB
    const rec = await idbGetPack(packId);
    if (rec?.payload) {
      exportPayload = rec.payload;
    }
    // 2. Try in-memory cache
    if (!exportPayload && memoryPacks.has(packId)) {
      exportPayload = memoryPacks.get(packId);
    }
    // 3. Try localStorage fallback
    if (!exportPayload && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(`${FALLBACK_PACK_PREFIX}${packId}`);
        if (raw) exportPayload = JSON.parse(raw);
      } catch {
        // Ignore
      }
    }
    // 4. Last resort: fetch directly from ./data/packs/<packId>.json
    if (!exportPayload) {
      const res = await fetch(`./data/packs/${encodeURIComponent(packId)}.json`);
      if (!res.ok) {
        throw new Error(`Pack "${packId}" is not installed locally and could not be fetched.`);
      }
      exportPayload = await res.json();
    }
  }

  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    throw new Error("File export requires a browser environment.");
  }

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `world-stem-${packId}.json`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  return true;
}
