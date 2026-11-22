import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const VERIFICATION_REPORT_PATH = path.join(PUBLIC_DIR, "data/verification_report.json");
const DISK_CACHE_DIR = "/tmp/physalts_tile_cache";
const STARTED_AT_MS = Date.now();

const ALLOWED_PROXY_HOSTS = new Set([
  "services.arcgisonline.com",
  "demotiles.maplibre.org",
  "api.openalex.org",
  "api.ror.org",
  "inspirehep.net",
  "en.wikipedia.org",
  "upload.wikimedia.org",
  "thumb.wikimedia.org"
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pbf": "application/x-protobuf",
  ".woff2": "font/woff2"
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Access-Control-Allow-Origin": "*"
};

const DEV_HEAD_SNIPPET = `<head>
  <script>
    window.__PHYSALTS_DEV_PROXY__ = true;
    (function() {
      const send = (tag, detail) => {
        try {
          fetch("./_diag?tag=" + encodeURIComponent(tag) + "&d=" + encodeURIComponent(String(detail).slice(0, 600))).catch(() => {});
        } catch (_) {}
      };
      window.addEventListener("error", (e) => send("onerror", (e.message || e.type) + " @" + (e.filename || "") + ":" + (e.lineno || "")));
      window.addEventListener("unhandledrejection", (e) => send("rejection", e.reason && (e.reason.stack || e.reason.message) || String(e.reason)));
      window.addEventListener("load", () => {
        setTimeout(() => {
          const c = document.querySelector("#map canvas");
          const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
          send("loaded", JSON.stringify({
            href: location.href,
            base: document.baseURI,
            hasMaplibre: typeof window.maplibregl !== "undefined",
            hasWorkerUrl: typeof window.maplibregl?.getWorkerUrl === "function" ? window.maplibregl.getWorkerUrl() : null,
            canvas: c ? [c.width, c.height] : null,
            webgl: Boolean(gl)
          }));
        }, 1500);
      });
    })();
  </script>`;

const proxyCache = new Map();
const MAX_CACHE = 600;
let cacheHits = 0;
let diskCacheHits = 0;
let diskCacheReady = false;

fs.mkdir(DISK_CACHE_DIR, { recursive: true })
  .then(() => {
    diskCacheReady = true;
  })
  .catch(() => {
    diskCacheReady = false;
  });

function hashKey(urlStr) {
  return crypto.createHash("sha256").update(urlStr).digest("hex");
}

function setMemoryLru(urlStr, entry) {
  if (proxyCache.has(urlStr)) {
    proxyCache.delete(urlStr);
  } else if (proxyCache.size >= MAX_CACHE) {
    const oldestKey = proxyCache.keys().next().value;
    proxyCache.delete(oldestKey);
  }
  proxyCache.set(urlStr, entry);
}

async function readDiskCache(urlStr) {
  if (!diskCacheReady) return null;
  const key = hashKey(urlStr);
  const binPath = path.join(DISK_CACHE_DIR, `${key}.bin`);
  const metaPath = path.join(DISK_CACHE_DIR, `${key}.meta.json`);
  try {
    const [metaRaw, buf] = await Promise.all([
      fs.readFile(metaPath, "utf8"),
      fs.readFile(binPath)
    ]);
    const meta = JSON.parse(metaRaw);
    return {
      status: Number(meta.status) || 200,
      contentType: meta.contentType || "application/octet-stream",
      buf
    };
  } catch {
    return null;
  }
}

async function writeDiskCache(urlStr, entry) {
  if (!diskCacheReady) return;
  const key = hashKey(urlStr);
  const binPath = path.join(DISK_CACHE_DIR, `${key}.bin`);
  const metaPath = path.join(DISK_CACHE_DIR, `${key}.meta.json`);
  const tmpBin = `${binPath}.${process.pid}.tmp`;
  const tmpMeta = `${metaPath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tmpBin, entry.buf);
    await fs.writeFile(
      tmpMeta,
      JSON.stringify({ status: entry.status, contentType: entry.contentType, cachedAt: Date.now() }),
      "utf8"
    );
    await Promise.all([fs.rename(tmpBin, binPath), fs.rename(tmpMeta, metaPath)]);
  } catch {
    await Promise.all([
      fs.rm(tmpBin, { force: true }).catch(() => {}),
      fs.rm(tmpMeta, { force: true }).catch(() => {})
    ]);
  }
}

async function fetchCached(urlStr) {
  // 1. In-memory LRU lookup
  const mem = proxyCache.get(urlStr);
  if (mem) {
    cacheHits++;
    setMemoryLru(urlStr, mem);
    return mem;
  }

  // 2. Persistent disk cache lookup
  const disk = await readDiskCache(urlStr);
  if (disk) {
    cacheHits++;
    diskCacheHits++;
    setMemoryLru(urlStr, disk);
    return disk;
  }

  // 3. Upstream fetch
  const upstream = await fetch(urlStr, {
    headers: { "User-Agent": "PhysAlts/2.0 (https://physalts.org; contact@physalts.org)" },
    signal: AbortSignal.timeout(15000)
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  const entry = {
    status: upstream.status,
    contentType: upstream.headers.get("content-type") || "application/octet-stream",
    buf
  };
  if (upstream.ok) {
    setMemoryLru(urlStr, entry);
    writeDiskCache(urlStr, entry).catch(() => {});
  }
  return entry;
}

function sendJson(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-cache"
  });
  res.end(buf);
}

async function handleHealth(res) {
  sendJson(res, 200, {
    ok: true,
    uptimeSec: Number(((Date.now() - STARTED_AT_MS) / 1000).toFixed(1)),
    cacheHits,
    diskCacheHits,
    cacheSize: proxyCache.size,
    diskCacheDir: DISK_CACHE_DIR
  });
}

async function handleStats(res) {
  try {
    const raw = await fs.readFile(VERIFICATION_REPORT_PATH, "utf8");
    const buf = Buffer.from(raw, "utf8");
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": buf.length,
      "Cache-Control": "no-cache"
    });
    res.end(buf);
  } catch (err) {
    if (err.code === "ENOENT") {
      sendJson(res, 200, {
        ok: true,
        available: false,
        message: "verification_report.json not generated yet. Run: node scripts/verify_and_audit.mjs"
      });
      return;
    }
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleProxy(reqUrl, res) {
  const target = reqUrl.searchParams.get("url");
  if (!target) {
    res.writeHead(400, { ...SECURITY_HEADERS, "Content-Type": "text/plain" });
    res.end("Missing url parameter");
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400, { ...SECURITY_HEADERS, "Content-Type": "text/plain" });
    res.end("Invalid url parameter");
    return;
  }

  if (parsed.protocol !== "https:" || !ALLOWED_PROXY_HOSTS.has(parsed.hostname)) {
    res.writeHead(403, { ...SECURITY_HEADERS, "Content-Type": "text/plain" });
    res.end("Host not allowed");
    return;
  }

  try {
    const entry = await fetchCached(parsed.toString());
    res.writeHead(entry.status, {
      ...SECURITY_HEADERS,
      "Content-Type": entry.contentType,
      "Content-Length": entry.buf.length,
      "Cache-Control": "public, max-age=3600"
    });
    res.end(entry.buf);
  } catch (err) {
    res.writeHead(502, { ...SECURITY_HEADERS, "Content-Type": "text/plain" });
    res.end(`Upstream error: ${err.message}`);
  }
}

async function handleStatic(reqUrl, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(reqUrl.pathname);
  } catch {
    res.writeHead(400, { ...SECURITY_HEADERS, "Content-Type": "text/plain" });
    res.end("Malformed path");
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(PUBLIC_DIR, "." + pathname);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    res.writeHead(403, { ...SECURITY_HEADERS, "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(resolved);
    const filePath = stat.isDirectory() ? path.join(resolved, "index.html") : resolved;
    let data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".html" && path.basename(filePath) === "index.html") {
      const html = data.toString("utf8").replace("<head>", DEV_HEAD_SNIPPET);
      data = Buffer.from(html, "utf8");
    }
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache"
    });
    res.end(data);
  } catch {
    if (pathname.startsWith("/vendor/fonts/") && pathname.endsWith(".pbf")) {
      const rel = pathname.slice("/vendor/fonts/".length);
      try {
        const entry = await fetchCached(
          `https://demotiles.maplibre.org/font/${rel.split("/").map(encodeURIComponent).join("/")}`
        );
        res.writeHead(entry.status, {
          ...SECURITY_HEADERS,
          "Content-Type": entry.contentType,
          "Content-Length": entry.buf.length,
          "Cache-Control": "public, max-age=3600"
        });
        res.end(entry.buf);
        return;
      } catch {}
    }
    res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...SECURITY_HEADERS,
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (reqUrl.pathname === "/_diag") {
    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => {
        body += chunk;
      });
      req.on("end", () => {
        console.log("[DIAG:POST]", body.slice(0, 1000));
        res.writeHead(204, SECURITY_HEADERS);
        res.end();
      });
    } else {
      console.log("[DIAG]", reqUrl.searchParams.get("tag"), reqUrl.searchParams.get("d"));
      res.writeHead(204, SECURITY_HEADERS);
      res.end();
    }
    return;
  }

  if (reqUrl.pathname === "/api/health") {
    handleHealth(res);
    return;
  }

  if (reqUrl.pathname === "/api/stats") {
    handleStats(res);
    return;
  }

  if (reqUrl.pathname !== "/_proxy") {
    console.log(`[REQ] ${req.method} ${reqUrl.pathname}`);
  }

  if (reqUrl.pathname === "/_proxy") {
    handleProxy(reqUrl, res);
  } else {
    handleStatic(reqUrl, res);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PhysAlts dev server running at http://localhost:${PORT} (disk cache: ${DISK_CACHE_DIR})`);
});
