import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "public/data");
const REPORT_FILE = path.join(DATA_DIR, "verification_report.json");

const ARGS = new Set(process.argv.slice(2));
const FULL_MODE = ARGS.has("--full");
const STRICT_MODE = ARGS.has("--strict");

const CONCURRENCY = 18;
const TIMEOUT_MS = 7000;
const HUBS_SAMPLE_SIZE = 150;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

const DATASET_SPECS = [
  { file: "curated_flagships.json", checkAllLinks: true, requireCoords: true },
  { file: "history_timeline.json", checkAllLinks: true, requireCoords: false },
  { file: "space_frontier.json", checkAllLinks: true, requireCoords: false },
  { file: "domains_catalog.json", checkAllLinks: true, requireCoords: false },
  { file: "private_startups.json", checkAllLinks: true, requireCoords: false },
  { file: "physics_hubs.json", checkAllLinks: false, requireCoords: true }
];

const MOJIBAKE_RE =
  /Ã[\x80-\xBF]|â€™|â€œ|â€\x9D|â€”|â€“|â€¦|Â\u00A0|ï»¿|\uFFFD/;
const BAD_TOKEN_RE = /\b(undefined|NaN)\b/;
const YEAR_FIELDS = ["year", "foundedYear", "established", "launchYear", "startYear", "endYear"];
const URL_STRING_FIELDS = [
  "url",
  "homepage",
  "website",
  "link",
  "sourceUrl",
  "wikiUrl",
  "paperUrl",
  "referenceUrl",
  "officialUrl",
  "arxivUrl"
];

function extractRecords(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const candidateKeys = [
    "hubs",
    "items",
    "flagships",
    "events",
    "timeline",
    "milestones",
    "missions",
    "domains",
    "branches",
    "startups",
    "companies",
    "entries",
    "records",
    "nodes",
    "facilities"
  ];
  for (const key of candidateKeys) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const val of Object.values(data)) {
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
      return val;
    }
  }
  return [];
}

function getItemId(item, index) {
  return String(item?.id ?? item?.slug ?? item?.code ?? `row-${index}`);
}

function getItemName(item) {
  return String(item?.name ?? item?.title ?? item?.label ?? "").trim();
}

function getItemSummary(item) {
  return String(
    item?.summary ?? item?.desc ?? item?.description ?? item?.blurb ?? item?.overview ?? item?.significance ?? ""
  ).trim();
}

function extractItemUrls(item) {
  const urls = [];
  const pushUrl = u => {
    if (typeof u === "string" && u.trim()) urls.push(u.trim());
  };

  for (const field of URL_STRING_FIELDS) {
    if (item && typeof item[field] === "string") pushUrl(item[field]);
  }
  for (const arrField of ["links", "references", "resources", "sources", "materials", "projects"]) {
    if (Array.isArray(item?.[arrField])) {
      for (const entry of item[arrField]) {
        if (typeof entry === "string") pushUrl(entry);
        else if (entry && typeof entry === "object") {
          pushUrl(entry.url || entry.href || entry.link);
        }
      }
    }
  }
  if (Array.isArray(item?.subdomains)) {
    for (const sub of item.subdomains) {
      for (const nested of extractItemUrls(sub)) pushUrl(nested);
    }
  }
  return [...new Set(urls)];
}

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return (u.protocol === "https:" || u.protocol === "http:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}

function collectStringValues(obj, prefix = "", out = []) {
  if (typeof obj === "string") {
    out.push({ field: prefix, value: obj });
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectStringValues(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      collectStringValues(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

function validateRecord(file, item, index, requireCoords) {
  const errors = [];
  const id = getItemId(item, index);
  const name = getItemName(item);
  const summary = getItemSummary(item);

  const pushErr = (field, message) => {
    errors.push({ file, id, name: name || "(unnamed)", field, message });
  };

  if (!name) {
    pushErr("name", "Missing or empty name/title");
  }
  if (!summary) {
    pushErr("summary", "Missing or empty summary/description");
  }

  // Geographic coordinates check
  const lat = item?.lat ?? item?.latitude;
  const lng = item?.lng ?? item?.longitude;
  const hasAnyCoord = lat !== undefined || lng !== undefined;
  if (requireCoords || hasAnyCoord) {
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      pushErr("lat", `Invalid latitude: ${String(lat)}`);
    }
    if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      pushErr("lng", `Invalid longitude: ${String(lng)}`);
    }
  }

  // Year bounds check
  for (const yf of YEAR_FIELDS) {
    if (item && item[yf] !== undefined && item[yf] !== null && item[yf] !== "") {
      const y = Number(item[yf]);
      if (!Number.isFinite(y) || y < -3500 || y > 2150) {
        pushErr(yf, `Out-of-bounds year value: ${String(item[yf])}`);
      }
    }
  }

  // URL syntax check
  const urls = extractItemUrls(item);
  for (const u of urls) {
    if (!isValidHttpUrl(u)) {
      pushErr("url", `Invalid URL syntax: ${u}`);
    }
  }

  // Proofreading / Mojibake / placeholder string hygiene check
  const strings = collectStringValues(item);
  for (const { field, value } of strings) {
    if (MOJIBAKE_RE.test(value)) {
      pushErr(field, `Possible Mojibake/broken encoding detected: "${value.slice(0, 80)}"`);
    }
    const trimmed = value.trim();
    if (trimmed === "null" || trimmed === "undefined" || trimmed === "NaN" || BAD_TOKEN_RE.test(value)) {
      pushErr(field, `Suspicious placeholder token detected: "${value.slice(0, 80)}"`);
    }
  }

  return { errors, urls };
}

function stratifiedSample(records, targetCount) {
  if (records.length <= targetCount) return records;

  // Stratify across entityType + branch so all categories and diverse countries are represented
  const buckets = new Map();
  for (const rec of records) {
    const key = `${rec.entityType || rec.group || "other"}::${rec.branch || "general"}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(rec);
  }

  const bucketList = [...buckets.values()];
  // Deterministic stride selection within each bucket for reproducibility and country spread
  const selected = [];
  const usedIds = new Set();
  const basePerBucket = Math.max(1, Math.floor(targetCount / bucketList.length));

  for (const list of bucketList) {
    const step = Math.max(1, Math.floor(list.length / basePerBucket));
    let taken = 0;
    for (let i = 0; i < list.length && taken < basePerBucket && selected.length < targetCount; i += step) {
      const item = list[i];
      if (!usedIds.has(item.id)) {
        usedIds.add(item.id);
        selected.push(item);
        taken++;
      }
    }
  }

  // Fill any remaining slots evenly across all records
  if (selected.length < targetCount) {
    const stride = Math.max(1, Math.floor(records.length / (targetCount - selected.length + 1)));
    for (let i = 0; i < records.length && selected.length < targetCount; i += stride) {
      const item = records[i];
      if (!usedIds.has(item.id)) {
        usedIds.add(item.id);
        selected.push(item);
      }
    }
  }

  return selected;
}

const hostActive = new Map();
const MAX_PER_HOST = 2;

async function withHostLimit(url, fn) {
  let host = "default";
  try { host = new URL(url).hostname; } catch {}
  while ((hostActive.get(host) || 0) >= MAX_PER_HOST) {
    await new Promise(r => setTimeout(r, 80));
  }
  hostActive.set(host, (hostActive.get(host) || 0) + 1);
  try {
    return await fn();
  } finally {
    hostActive.set(host, Math.max(0, (hostActive.get(host) || 1) - 1));
  }
}

async function probeUrlOnce(url, method) {
  const isWiki = url.includes("wikipedia.org") || url.includes("wikimedia.org");
  const headers = isWiki
    ? { "User-Agent": "PhysAltsAuditBot/2.0 (https://physalts.org; contact@physalts.org)", Accept: "text/html,*/*;q=0.8" }
    : BROWSER_HEADERS;
  const res = await fetch(url, {
    method,
    redirect: "follow",
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  try {
    await res.body?.cancel();
  } catch {}
  return res;
}

function classifyHttpResponse(res) {
  const status = res.status;
  if (status >= 200 && status < 400) {
    return { category: "verified_ok", status, reason: `HTTP ${status}` };
  }
  const server = (res.headers.get("server") || "").toLowerCase();
  const cfMitigated = res.headers.get("cf-mitigated") || "";
  if (status === 403 || status === 429) {
    return { category: "bot_protected", status, reason: `HTTP ${status} (WAF/bot-protected host)` };
  }
  if ((status === 401 || status === 503) && (cfMitigated || server.includes("cloudflare") || server.includes("akamai"))) {
    return { category: "bot_protected", status, reason: `HTTP ${status} (${server || "WAF"} challenge)` };
  }
  return { category: "broken", status, reason: `HTTP ${status}` };
}

async function verifyUrl(url) {
  if (!isValidHttpUrl(url)) {
    return { category: "broken", status: 0, reason: "Invalid URL syntax" };
  }
  return withHostLimit(url, async () => {
    try {
      const headRes = await probeUrlOnce(url, "HEAD");
      if (headRes.status >= 200 && headRes.status < 400) {
        return classifyHttpResponse(headRes);
      }
      if (![400, 403, 405, 501, 406].includes(headRes.status)) {
        return classifyHttpResponse(headRes);
      }
    } catch {}

    try {
      const getRes = await probeUrlOnce(url, "GET");
      return classifyHttpResponse(getRes);
    } catch (err) {
      const causeCode = err?.cause?.code || err?.code || err?.name || "FETCH_ERROR";
      const msg = err?.cause?.message || err?.message || String(err);
      return { category: "broken", status: 0, reason: `${causeCode}: ${msg.slice(0, 120)}` };
    }
  });
}

async function runPool(items, concurrency, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const startedAt = Date.now();
  console.log(`=== PhysAlts Verification & Live Link Audit (${FULL_MODE ? "FULL" : "STANDARD"} mode) ===`);

  const allSchemaErrors = [];
  const datasetReports = {};
  const countriesSet = new Set();
  const linkTasks = []; // { file, id, name, url }

  let totalEntities = 0;
  let presentDatasets = 0;
  let missingDatasets = 0;

  for (const spec of DATASET_SPECS) {
    const filePath = path.join(DATA_DIR, spec.file);
    let raw;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        console.warn(`   [Skip] ${spec.file} not found yet — skipping gracefully.`);
        missingDatasets++;
        datasetReports[spec.file] = { status: "missing", entities: 0, schemaErrors: 0, linksChecked: 0 };
        continue;
      }
      throw err;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error(`   [Error] Invalid JSON in ${spec.file}: ${err.message}`);
      allSchemaErrors.push({ file: spec.file, id: "file", name: spec.file, field: "json", message: err.message });
      datasetReports[spec.file] = { status: "invalid_json", entities: 0, schemaErrors: 1, linksChecked: 0 };
      presentDatasets++;
      continue;
    }

    presentDatasets++;
    const records = extractRecords(parsed);
    totalEntities += records.length;

    let fileSchemaErrors = 0;
    const recordUrlMap = new Map();

    records.forEach((rec, idx) => {
      if (rec?.country && typeof rec.country === "string") {
        countriesSet.add(rec.country.trim());
      }
      const { errors, urls } = validateRecord(spec.file, rec, idx, spec.requireCoords);
      if (errors.length) {
        fileSchemaErrors += errors.length;
        allSchemaErrors.push(...errors);
      }
      if (urls.length) {
        recordUrlMap.set(rec, { id: getItemId(rec, idx), name: getItemName(rec) || "(unnamed)", urls });
      }
    });

    const recordsWithUrls = [...recordUrlMap.keys()];
    const selectedForLinks =
      spec.checkAllLinks || FULL_MODE
        ? recordsWithUrls
        : stratifiedSample(recordsWithUrls, HUBS_SAMPLE_SIZE);

    let scheduledLinks = 0;
    for (const rec of selectedForLinks) {
      const info = recordUrlMap.get(rec);
      for (const url of info.urls) {
        linkTasks.push({ file: spec.file, id: info.id, name: info.name, url });
        scheduledLinks++;
      }
    }

    datasetReports[spec.file] = {
      status: "ok",
      entities: records.length,
      schemaErrors: fileSchemaErrors,
      linksScheduled: scheduledLinks,
      linksChecked: 0,
      linksOk: 0,
      linksBotProtected: 0,
      linksBroken: 0,
      sampling: spec.checkAllLinks || FULL_MODE ? "100%" : `stratified-${HUBS_SAMPLE_SIZE}`
    };

    console.log(
      `   [Schema] ${spec.file}: ${records.length} entities, ${fileSchemaErrors} schema errors, ${scheduledLinks} links queued (${datasetReports[spec.file].sampling})`
    );
  }

  // Deduplicate unique URLs for live HTTP verification
  const uniqueUrls = [...new Set(linkTasks.map(t => t.url))];
  console.log(`\nChecking ${uniqueUrls.length} unique live URLs (${linkTasks.length} references) with concurrency=${CONCURRENCY}...`);

  const urlResultCache = new Map();
  let completed = 0;

  await runPool(uniqueUrls, CONCURRENCY, async url => {
    const result = await verifyUrl(url);
    urlResultCache.set(url, result);
    completed++;
    if (completed % 50 === 0 || completed === uniqueUrls.length) {
      console.log(`   [HTTP] Verified ${completed}/${uniqueUrls.length} unique URLs...`);
    }
  });

  let linksOk = 0;
  let linksBotProtected = 0;
  let linksBroken = 0;
  const brokenLinks = [];

  for (const task of linkTasks) {
    const res = urlResultCache.get(task.url) || { category: "broken", status: 0, reason: "Not checked" };
    const ds = datasetReports[task.file];
    ds.linksChecked++;

    if (res.category === "verified_ok") {
      linksOk++;
      ds.linksOk++;
    } else if (res.category === "bot_protected") {
      linksBotProtected++;
      ds.linksBotProtected++;
    } else {
      linksBroken++;
      ds.linksBroken++;
      brokenLinks.push({
        file: task.file,
        id: task.id,
        name: task.name,
        url: task.url,
        status: res.status,
        reason: res.reason
      });
    }
  }

  const linksChecked = linkTasks.length;
  const passRatePct =
    linksChecked > 0 ? Number((((linksOk + linksBotProtected) / linksChecked) * 100).toFixed(2)) : 100;
  const strictOkRatePct =
    linksChecked > 0 ? Number(((linksOk / linksChecked) * 100).toFixed(2)) : 100;
  const durationSec = Number(((Date.now() - startedAt) / 1000).toFixed(1));

  const report = {
    generatedAt: new Date().toISOString(),
    mode: FULL_MODE ? "full" : "standard",
    durationSec,
    summary: {
      totalDatasets: DATASET_SPECS.length,
      presentDatasets,
      missingDatasets,
      totalEntities,
      totalCountries: countriesSet.size,
      linksChecked,
      linksOk,
      linksBotProtected,
      linksBroken,
      passRatePct,
      strictOkRatePct,
      schemaErrorsCount: allSchemaErrors.length
    },
    datasets: datasetReports,
    schemaErrors: allSchemaErrors.slice(0, 200),
    brokenLinks
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log(`\nAudit completed in ${durationSec}s -> ${REPORT_FILE}`);
  console.log(`Summary:`, JSON.stringify(report.summary, null, 2));

  if (STRICT_MODE && allSchemaErrors.length > 0) {
    console.error(`Strict mode failed: ${allSchemaErrors.length} schema errors detected.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Verification audit fatal error:", err);
  process.exit(1);
});
