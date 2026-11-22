import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = path.resolve("public");

const ALLOWED_PROXY_HOSTS = new Set([
  "services.arcgisonline.com",
  "demotiles.maplibre.org",
  "api.openalex.org",
  "api.ror.org",
  "inspirehep.net",
  "en.wikipedia.org",
  "upload.wikimedia.org"
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

async function fetchCached(urlStr) {
  const cached = proxyCache.get(urlStr);
  if (cached) return cached;
  const upstream = await fetch(urlStr, {
    headers: { "User-Agent": "PhysAltsDevProxy/1.0" }
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  const entry = {
    status: upstream.status,
    contentType: upstream.headers.get("content-type") || "application/octet-stream",
    buf
  };
  if (upstream.ok) {
    if (proxyCache.size >= MAX_CACHE) {
      const oldestKey = proxyCache.keys().next().value;
      proxyCache.delete(oldestKey);
    }
    proxyCache.set(urlStr, entry);
  }
  return entry;
}

async function handleProxy(reqUrl, res) {
  const target = reqUrl.searchParams.get("url");
  if (!target) {
    res.writeHead(400, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("Missing url parameter");
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("Invalid url parameter");
    return;
  }

  if (parsed.protocol !== "https:" || !ALLOWED_PROXY_HOSTS.has(parsed.hostname)) {
    res.writeHead(403, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("Host not allowed");
    return;
  }

  try {
    const entry = await fetchCached(parsed.toString());
    res.writeHead(entry.status, {
      "Content-Type": entry.contentType,
      "Content-Length": entry.buf.length,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(entry.buf);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end(`Upstream error: ${err.message}`);
  }
}

async function handleStatic(reqUrl, res) {
  let pathname = decodeURIComponent(reqUrl.pathname);
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(PUBLIC_DIR, "." + pathname);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    res.writeHead(403, { "Content-Type": "text/plain" });
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
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(data);
  } catch {
    if (pathname.startsWith("/vendor/fonts/") && pathname.endsWith(".pbf")) {
      const rel = pathname.slice("/vendor/fonts/".length);
      try {
        const entry = await fetchCached(`https://demotiles.maplibre.org/font/${rel.split("/").map(encodeURIComponent).join("/")}`);
        res.writeHead(entry.status, {
          "Content-Type": entry.contentType,
          "Content-Length": entry.buf.length,
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(entry.buf);
        return;
      } catch {}
    }
    res.writeHead(404, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (reqUrl.pathname === "/_diag") {
    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        console.log("[DIAG:POST]", body.slice(0, 1000));
        res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
        res.end();
      });
    } else {
      console.log("[DIAG]", reqUrl.searchParams.get("tag"), reqUrl.searchParams.get("d"));
      res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      res.end();
    }
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
  console.log(`PhysAlts dev server running at http://localhost:${PORT}`);
});
