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

async function handleProxy(reqUrl, res) {
  const target = reqUrl.searchParams.get("url");
  if (!target) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing url parameter");
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid url parameter");
    return;
  }

  if (parsed.protocol !== "https:" || !ALLOWED_PROXY_HOSTS.has(parsed.hostname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Host not allowed");
    return;
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { "User-Agent": "PhysAltsDevProxy/1.0" }
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.writeHead(upstream.status, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600"
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "text/plain" });
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
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (reqUrl.pathname === "/_proxy") {
    handleProxy(reqUrl, res);
  } else {
    handleStatic(reqUrl, res);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PhysAlts dev server running at http://localhost:${PORT}`);
});
