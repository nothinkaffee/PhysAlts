import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT_DIR, "public/data/physics_hubs.json");
const CONTACT_EMAIL = process.env.OPENALEX_EMAIL || "contact@physalts.org";
const OPENALEX_API_KEY = process.env.OPENALEX_API_KEY || "";

const ROR_CONCURRENCY = 4;
const ROR_DELAY_MS = 120;
const REQUEST_TIMEOUT_MS = 15000;
const CURRENT_YEAR = new Date().getFullYear();

const sleep = ms => new Promise(r => setTimeout(r, ms));

class QuotaExhaustedError extends Error {
  constructor(message, retryAfterSec = null) {
    super(message);
    this.name = "QuotaExhaustedError";
    this.retryAfterSec = retryAfterSec;
  }
}

const KNOWN_HTTPS_HOSTS = new Set([
  "openalex.org",
  "ror.org",
  "en.wikipedia.org",
  "wikipedia.org",
  "home.cern",
  "cern.ch",
  "nasa.gov",
  "esa.int",
  "iter.org",
  "fnal.gov",
  "slac.stanford.edu",
  "desy.de",
  "kek.jp",
  "triumf.ca",
  "lbl.gov",
  "bnl.gov",
  "anl.gov",
  "ornl.gov",
  "nist.gov",
  "mpg.de",
  "cnrs.fr",
  "ethz.ch",
  "mit.edu",
  "stanford.edu",
  "harvard.edu",
  "caltech.edu",
  "ox.ac.uk",
  "cam.ac.uk",
  "riken.jp"
]);

const NOISE_NAME_RE =
  /\b(hospital|clinic|medical college|medical university|medical school|medical center|medical centre|medical institute|medical sciences|medical welfare|medical research institute|school of medicine|faculty of medicine|college of medicine|genomic medicine|digital medicine|occupational medicine|health science|health sciences|health system|health care|healthcare|health authority|health canada|health university|health protection|e-health|henry ford health|beaumont health|group health|environment and health|occupational safety|occupational health|cancer center|cancer centre|cancer institute|cancer research|cancer care|cancer trials|cancer society|cancer foundation|cancer agency|against cancer|treatment of cancer|german cancer|heart institute|eye institute|blood center|blood bank|child health|public health|tropical medicine|biomedical|clinical research|pathology|therapy|dental|dentistry|pharmacy|pharmaceuticals?|pharmacolog\w*|pharmacopeial|pharma|biopharma|allergopharma|pharmacyclics|nursing|midwifery|veterinar\w*|pediatric|surgical|surgery|rehabilitation|orthopedic\w*|cardiolog\w*|optometr\w*|podiatr\w*|chiropract\w*|dermatolog\w*|ophthalmolog\w*|psychiatr\w*|obstetric\w*|gynecolog\w*|maternity|sanatorium|hospice|wellness|cosmetic|agricultural|d'agriculture|agronomy|forestry|fisheries|law school|school of law|university of law|business school|management school|school of economics|university of finance|economics and business|economics and management|transport economics|theolog\w*|seminary|divinity|bible college|fine arts|academy of arts|music academy|art institute|school of the art|college of art|university of art|conservatory|culinary|hospitality|tourism|fashion|banking institute|university press|broadcasting corporation|consulting|insurance|real estate|law firm|accounting|restaurant|hotel|credit union|ministry of education|ministry of health|ministry of industry|department of commerce|brain, music)\b/i;

const COUNTRY_NAME_ALIASES = {
  "türkiye": "Turkey",
  "turkiye": "Turkey",
  "palestinian territory": "Palestine",
  "occupied palestinian territory": "Palestine"
};

function normalizeCountryName(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) return "";
  return COUNTRY_NAME_ALIASES[cleaned.toLowerCase()] || cleaned;
}

function groupForEntityType(entityType) {
  if (entityType === "uni") return "uni";
  if (entityType === "company" || entityType === "startup") return "company";
  if (entityType === "history") return "history";
  return "lab";
}

const DEEP_TECH_PHYSICS_RE =
  /quantum|fusion|photonic|asml|laser|cryo|superconduct|cern|plasma|semiconductor|optic|magnet|accelerat|space|astro|physics|particle|nuclear|neutrino|synchrotron|detector|spectroscop|vacuum|nanotech|lithograph|collider|tokamak|stellarator|qubit|trapped.?ion|ionq|rigetti|psiquantum|pasqal|xanadu|d-wave|helion|tae technologies|commonwealth fusion|tokamak energy|first light|marvel fusion|zap energy|type one|proxima|general fusion|coherent|thorlabs|hamamatsu|zeiss|bruker|oxford instruments|bluefors|lake shore|keysight|zurich instruments|toptica|menlo systems|nkt photonics|ipg photonics|trumpf|applied materials|lam research|kla corporation|imec|cea-leti|q-ctrl|quantinuum|quera|atom computing|infleqtion|iqm|alice & bob|orca computing|coldquanta|nord quantique|riverlane|phasecraft|zapata|sandboxaq|renaissance fusion|kyoto fusioneering|focused energy|shine technologies|type one energy/i;

const ROR_DOMAIN_QUERIES = [
  "physics",
  "observatory",
  "synchrotron",
  "quantum",
  "fusion",
  "nuclear physics",
  "astrophysics",
  "photonics",
  "particle physics",
  "condensed matter",
  "plasma physics",
  "cosmology",
  "astronomy",
  "geophysics",
  "theoretical physics"
];

// Curated 80+ small and emerging nations across Europe, Baltics, Balkans, Caucasus,
// Central Asia, South/SE Asia, Pacific, Latin America, Caribbean, Africa, and Middle East
const SMALL_COUNTRY_CODES = [
  // Nordic / Micro-Europe / Baltics / Balkans
  "IS", "LU", "MT", "CY", "EE", "LV", "LT", "SI", "HR", "RS", "BA", "MK", "ME", "AL", "MD", "AD", "LI", "MC", "SM", "FO",
  // Caucasus & Central Asia
  "GE", "AM", "AZ", "KZ", "UZ", "KG", "TJ", "TM", "MN",
  // South / Southeast Asia & Pacific
  "NP", "LK", "BD", "BT", "MM", "KH", "LA", "BN", "FJ", "PG", "WS", "MV",
  // Latin America & Caribbean
  "JM", "TT", "BB", "CU", "DO", "CR", "PA", "UY", "PY", "BO", "EC", "PE", "VE", "GT", "HN", "SV", "NI", "GY", "SR",
  // Africa
  "GH", "SN", "CI", "CM", "ET", "KE", "UG", "TZ", "RW", "BW", "NA", "ZM", "ZW", "MZ", "MG", "MU", "TN", "MA", "DZ", "AO", "SD", "BJ", "ML",
  // Middle East
  "JO", "LB", "OM", "KW", "QA", "BH", "IQ", "YE", "PS"
];

function cleanText(str) {
  return String(str || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(rawUrl, fallbackUrl = "") {
  const tryNormalize = candidate => {
    if (!candidate || typeof candidate !== "string") return "";
    let s = candidate
      .trim()
      .replace(/^["'<(\[]+/, "")
      .replace(/["'>)\],;.\s]+$/, "");
    if (!s || /^(javascript|mailto|data|ftp):/i.test(s)) return "";
    if (!/^https?:\/\//i.test(s)) {
      if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s)) {
        s = `https://${s}`;
      } else {
        return "";
      }
    }
    try {
      const parsed = new URL(s);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (parsed.protocol === "http:" && KNOWN_HTTPS_HOSTS.has(host)) {
        parsed.protocol = "https:";
      }
      return parsed.toString().replace(/\/$/, parsed.pathname === "/" && !parsed.search && !parsed.hash ? "" : "/");
    } catch {
      return "";
    }
  };
  return tryNormalize(rawUrl) || tryNormalize(fallbackUrl) || "";
}

function isFallbackDirectoryUrl(url) {
  if (!url) return true;
  return /^https?:\/\/(openalex\.org|ror\.org)\//i.test(url);
}

function isNoiseOrg(name, types = [], extraText = "") {
  const n = cleanText(name).toLowerCase();
  if (!n || n.length < 2) return true;
  const t = types.map(x => String(x || "").toLowerCase());
  if (t.includes("healthcare") || t.includes("archive")) return true;
  if (NOISE_NAME_RE.test(n)) return true;
  if (t.includes("company")) {
    const combined = `${n} ${cleanText(extraText).toLowerCase()}`;
    if (!DEEP_TECH_PHYSICS_RE.test(combined)) return true;
  }
  return false;
}

function classifyBranch(text) {
  const t = (text || "").toLowerCase();
  if (/cern|fermi|collider|hadron|neutrino|particle|nuclear|cyclotron|accelerator|desy|kek|triumf|high energy|synchrotron/.test(t)) return "particle";
  if (/quantum|photon|laser|optic|euv|attosecond|qubit|nanophoton|spectroscop/.test(t)) return "quantum";
  if (/astro|observator|telescope|cosmo|space|radio|astron|planetar|geophys/.test(t)) return "astro";
  if (/fusion|plasma|tokamak|stellarator|iter|magnet/.test(t)) return "fusion";
  if (/gravit|relativ|ligo|virgo|kagra|theoretical|perimeter|ias|string/.test(t)) return "gravity";
  return "condensed";
}

function classifyEntityType(name, types = []) {
  const n = (name || "").toLowerCase();
  const t = types.map(x => String(x || "").toLowerCase());

  if (t.includes("company")) return "company";

  if (t.includes("facility") || t.includes("government")) {
    if (
      /\b(institute|institut|academy|foundation|society|council|association)\b/.test(n) &&
      !/\b(lab|laboratory|laboratoire|observatory|observatoire|synchrotron|accelerator|collider|cern|fermi|slac|desy|kek|triumf|telescope|reactor)\b/.test(n)
    ) {
      return "institute";
    }
    return "lab";
  }

  if (t.includes("nonprofit")) {
    if (/\b(lab|laboratory|observatory|synchrotron|accelerator|collider|telescope)\b/.test(n)) return "lab";
    if (/\b(university|universit[eéä]|college|polytechnic|school of)\b/.test(n)) return "uni";
    return "institute";
  }

  if (t.includes("education")) {
    if (
      /\b(laboratory|laboratoire|observatory|observatoire|synchrotron|accelerator|collider|telescope)\b/.test(n) &&
      !/\b(university|universit[eéä]|universidad|universidade|università|college|school of)\b/.test(n)
    ) {
      return "lab";
    }
    if (
      /\b(national laboratory|max planck|perimeter institute|institute for advanced study)\b/.test(n) &&
      !/\b(university|universit[eéä]|college)\b/.test(n)
    ) {
      return "institute";
    }
    return "uni";
  }

  if (/\b(lab|laboratory|laboratoire|observatory|observatoire|synchrotron|accelerator|collider|cern|fermi|slac|desy|kek|triumf|telescope)\b/.test(n)) {
    return "lab";
  }
  if (/\b(university|universit[eéä]|universidad|universidade|università|college|polytechnic|hochschule)\b/.test(n)) {
    return "uni";
  }
  if (/\b(institute|institut|center|centre|academy|foundation|society)\b/.test(n)) {
    return "institute";
  }
  if (/\b(inc\.?|corp\.?|ltd\.?|gmbh|llc|technologies|systems|photonics)\b/.test(n)) {
    return "company";
  }
  return "institute";
}

function parseFoundedYear(val) {
  const y = Number(val);
  if (Number.isInteger(y) && y >= 800 && y <= CURRENT_YEAR) return y;
  return null;
}

function normalizeOpenAlex(inst, hint = "") {
  const g = inst.geo;
  if (!g || typeof g.latitude !== "number" || typeof g.longitude !== "number") return null;
  if (!Number.isFinite(g.latitude) || !Number.isFinite(g.longitude)) return null;
  if (g.latitude < -90 || g.latitude > 90 || g.longitude < -180 || g.longitude > 180) return null;

  const name = cleanText(inst.display_name);
  if (!name) return null;
  const type = String(inst.type || "").toLowerCase();
  const topicNames = (inst.topics || []).slice(0, 4).map(t => cleanText(t.display_name)).filter(Boolean).join(", ");
  if (isNoiseOrg(name, [type], `${topicNames} ${hint}`)) return null;

  const entityType = classifyEntityType(name, [type]);
  const group = groupForEntityType(entityType);
  const country = normalizeCountryName(g.country || inst.country_code || "");
  const cityLabel = cleanText(g.city || "Research Hub");
  const works = Number(inst.works_count || 0);
  const cites = Number(inst.cited_by_count || 0);
  const url = normalizeUrl(inst.homepage_url, inst.id);

  const typeLabel =
    entityType === "uni"
      ? "university department"
      : entityType === "company"
        ? "deep-tech physics company"
        : entityType === "institute"
          ? "research institute"
          : "research facility";

  return {
    id: `oa-${String(inst.id || name).split("/").pop()}`,
    name,
    city: `${cityLabel}${country ? ", " + country : ""}`,
    country,
    countryCode: cleanText(inst.country_code || "").toUpperCase() || null,
    lat: Number(g.latitude.toFixed(5)),
    lng: Number(g.longitude.toFixed(5)),
    zoom: 15.6,
    group,
    entityType,
    branch: classifyBranch(`${name} ${topicNames} ${hint}`),
    foundedYear: null,
    status: "active",
    pinned: false,
    sourceApi: "OpenAlex",
    verifiedSource: "OpenAlex",
    url,
    summary: `Global physics ${typeLabel} with ${works.toLocaleString("en-US")} indexed works and ${cites.toLocaleString("en-US")} citations.${topicNames ? " Active in " + topicNames + "." : ""}`
  };
}

function normalizeRor(org, hint = "") {
  if (org.status && String(org.status).toLowerCase() !== "active") return null;

  const loc = org.locations?.[0]?.geonames_details;
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  if (loc.lat < -90 || loc.lat > 90 || loc.lng < -180 || loc.lng > 180) return null;

  const displayObj =
    org.names?.find(x => Array.isArray(x.types) && x.types.includes("ror_display")) ||
    org.names?.find(x => Array.isArray(x.types) && x.types.includes("label")) ||
    org.names?.[0];
  const name = cleanText(displayObj?.value);
  if (!name) return null;

  const types = (org.types || []).map(t => String(t || "").toLowerCase());
  if (isNoiseOrg(name, types, hint)) return null;

  const entityType = classifyEntityType(name, types);
  const group = groupForEntityType(entityType);
  const country = normalizeCountryName(loc.country_name || "");
  const countryCode = cleanText(loc.country_code || "").toUpperCase() || null;
  const cityLabel = cleanText(loc.name || (entityType === "uni" ? "Campus" : "Lab"));
  const foundedYear = parseFoundedYear(org.established);

  const websiteLink =
    org.links?.find(l => l.type === "website")?.value ||
    org.links?.[0]?.value ||
    "";
  const url = normalizeUrl(websiteLink, org.id);

  const roleDesc =
    entityType === "uni"
      ? "university"
      : entityType === "company"
        ? "deep-tech company"
        : entityType === "institute"
          ? "research institute"
          : "research facility";

  return {
    id: `ror-${String(org.id || name).split("/").pop()}`,
    name,
    city: `${cityLabel}${country ? ", " + country : ""}`,
    country,
    countryCode,
    lat: Number(loc.lat.toFixed(5)),
    lng: Number(loc.lng.toFixed(5)),
    zoom: 15.6,
    group,
    entityType,
    branch: classifyBranch(`${name} ${hint}`),
    foundedYear,
    status: "active",
    pinned: false,
    sourceApi: "ROR",
    verifiedSource: "ROR",
    url,
    summary: `Verified ROR global physics ${roleDesc}${foundedYear ? ` (est. ${foundedYear})` : ""} (${(org.types || []).join(", ") || "research"}).`
  };
}

function normalizeExistingHub(hub) {
  if (!hub || !hub.name) return null;
  if (typeof hub.lat !== "number" || typeof hub.lng !== "number") return null;
  if (!Number.isFinite(hub.lat) || !Number.isFinite(hub.lng)) return null;
  if (hub.lat < -90 || hub.lat > 90 || hub.lng < -180 || hub.lng > 180) return null;

  const name = cleanText(hub.name);
  const inferredTypes = hub.entityType
    ? [hub.entityType === "uni" ? "education" : hub.entityType === "company" ? "company" : hub.entityType === "lab" ? "facility" : "nonprofit"]
    : hub.group === "uni"
      ? ["education"]
      : ["facility"];

  if (isNoiseOrg(name, inferredTypes, hub.summary || "")) return null;

  const entityType = ["uni", "lab", "institute", "company", "startup"].includes(hub.entityType)
    ? hub.entityType
    : classifyEntityType(name, inferredTypes);
  const source = hub.verifiedSource || hub.sourceApi || "OpenAlex";
  const url = normalizeUrl(hub.url);
  if (!url) return null;
  const country = normalizeCountryName(hub.country || "");

  return {
    id: String(hub.id || `hub-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}`),
    name,
    city: cleanText(hub.city || country || "Research Hub").replace(/Türkiye/g, "Turkey").replace(/Palestinian Territory/g, "Palestine"),
    country,
    countryCode: hub.countryCode ? cleanText(hub.countryCode).toUpperCase() : null,
    lat: Number(hub.lat.toFixed(5)),
    lng: Number(hub.lng.toFixed(5)),
    zoom: Number(hub.zoom) || 15.6,
    group: groupForEntityType(entityType),
    entityType,
    branch: hub.branch || classifyBranch(`${name} ${hub.summary || ""}`),
    foundedYear: parseFoundedYear(hub.foundedYear),
    status: "active",
    pinned: Boolean(hub.pinned),
    sourceApi: source,
    verifiedSource: source,
    url,
    summary: cleanText(hub.summary || `Global physics ${entityType} in ${country || "worldwide"}.`)
  };
}

function parseRetryAfterMs(headerVal) {
  if (!headerVal) return null;
  const num = Number(headerVal);
  if (Number.isFinite(num) && num >= 0) return num * 1000;
  const ts = Date.parse(headerVal);
  if (Number.isFinite(ts)) return Math.max(0, ts - Date.now());
  return null;
}

async function fetchJsonWithBackoff(url, { maxRetries = 3, isOpenAlex = false } = {}) {
  const backoffSchedule = [1500, 3000, 6000];
  const headers = {
    "User-Agent": `PhysAltsBot/2.0 (mailto:${CONTACT_EMAIL})`,
    Accept: "application/json"
  };
  if (isOpenAlex && OPENALEX_API_KEY) {
    headers.Authorization = `Bearer ${OPENALEX_API_KEY}`;
  }

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      if (res.ok) {
        return await res.json();
      }

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        const remaining = res.headers.get("x-ratelimit-remaining");

        // Detect hard daily IP budget exhaustion on OpenAlex so we don't stall for hours
        if (
          isOpenAlex &&
          res.status === 429 &&
          (remaining === "0" || (retryAfterMs !== null && retryAfterMs > 30000))
        ) {
          throw new QuotaExhaustedError(
            `OpenAlex daily rate-limit budget exhausted (Retry-After: ${Math.round((retryAfterMs || 0) / 1000)}s)`,
            retryAfterMs ? Math.round(retryAfterMs / 1000) : null
          );
        }

        if (attempt < maxRetries) {
          const baseDelay = backoffSchedule[attempt] ?? 6000;
          const waitMs = retryAfterMs !== null ? Math.min(Math.max(retryAfterMs, baseDelay), 20000) : baseDelay;
          console.warn(
            `   [Backoff] HTTP ${res.status} on attempt ${attempt + 1}/${maxRetries + 1}; retrying in ${(waitMs / 1000).toFixed(1)}s...`
          );
          await sleep(waitMs);
          continue;
        }
      }

      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (err instanceof QuotaExhaustedError) throw err;
      lastErr = err;
      if (attempt < maxRetries) {
        const waitMs = backoffSchedule[attempt] ?? 6000;
        console.warn(
          `   [Retry] ${err.message} on attempt ${attempt + 1}/${maxRetries + 1}; retrying in ${(waitMs / 1000).toFixed(1)}s...`
        );
        await sleep(waitMs);
      }
    }
  }
  throw lastErr || new Error(`Failed after ${maxRetries + 1} attempts: ${url}`);
}

function normNameKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

function tokenJaccard(a, b) {
  const sa = new Set(a.split(" ").filter(w => w.length > 1));
  const sb = new Set(b.split(" ").filter(w => w.length > 1));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const tok of sa) if (sb.has(tok)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function createHubStore() {
  const byName = new Map();
  const spatialBuckets = new Map(); // "latBin:lngBin" -> array of hub records

  const bucketKey = (lat, lng) => `${Math.round(lat * 20)}:${Math.round(lng * 20)}`;

  function mergeInto(existing, incoming) {
    if (!existing.foundedYear && incoming.foundedYear) {
      existing.foundedYear = incoming.foundedYear;
    }
    if (!existing.countryCode && incoming.countryCode) {
      existing.countryCode = incoming.countryCode;
    }
    if (!existing.country && incoming.country) {
      existing.country = incoming.country;
    }
    if (isFallbackDirectoryUrl(existing.url) && !isFallbackDirectoryUrl(incoming.url)) {
      existing.url = incoming.url;
    }
    // Prefer richer OpenAlex summary (with works & citations) over generic ROR summary
    if (
      existing.verifiedSource === "ROR" &&
      incoming.verifiedSource === "OpenAlex" &&
      incoming.summary.includes("indexed works")
    ) {
      existing.summary = incoming.summary;
    }
    // Prefer specific entityType over generic fallback
    if (existing.entityType === "lab" && incoming.entityType === "institute" && incoming.verifiedSource === "ROR") {
      existing.entityType = "institute";
    }
  }

  function findNearbyDuplicate(key, lat, lng) {
    const baseLat = Math.round(lat * 20);
    const baseLng = Math.round(lng * 20);
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const list = spatialBuckets.get(`${baseLat + dLat}:${baseLng + dLng}`);
        if (!list) continue;
        for (const rec of list) {
          if (Math.abs(rec.hub.lat - lat) > 0.045 || Math.abs(rec.hub.lng - lng) > 0.045) continue;
          if (rec.key === key) return rec.hub;
          const shorter = Math.min(rec.key.length, key.length);
          if (shorter >= 10 && (rec.key.includes(key) || key.includes(rec.key))) {
            return rec.hub;
          }
          if (tokenJaccard(rec.key, key) >= 0.78) {
            return rec.hub;
          }
        }
      }
    }
    return null;
  }

  function add(item) {
    if (!item || !item.name || !item.url) return false;
    const key = normNameKey(item.name);
    if (!key) return false;

    const exact = byName.get(key);
    if (exact) {
      mergeInto(exact, item);
      return false;
    }

    const nearby = findNearbyDuplicate(key, item.lat, item.lng);
    if (nearby) {
      mergeInto(nearby, item);
      return false;
    }

    byName.set(key, item);
    const bk = bucketKey(item.lat, item.lng);
    if (!spatialBuckets.has(bk)) spatialBuckets.set(bk, []);
    spatialBuckets.get(bk).push({ key, hub: item });
    return true;
  }

  function values() {
    return [...byName.values()];
  }

  function hasCountryCode(cc) {
    const target = cc.toUpperCase();
    for (const h of byName.values()) {
      if (h.countryCode === target) return true;
    }
    return false;
  }

  return { add, values, hasCountryCode, get size() { return byName.size; } };
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

async function loadExistingHubs() {
  try {
    const raw = await fs.readFile(OUT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.hubs) ? parsed.hubs : [];
  } catch {
    return [];
  }
}

async function harvestOpenAlex(store) {
  const segments = [
    { label: "Universities", filter: "topics.field.id:fields/31,type:education", pages: 15, hint: "physics" },
    { label: "Facilities & National Labs", filter: "topics.field.id:fields/31,type:facility|government", pages: 8, hint: "particle quantum astro" },
    { label: "Nonprofits & Deep-Tech Companies", filter: "topics.field.id:fields/31,type:nonprofit|company", pages: 4, hint: "quantum fusion photonics" }
  ];

  let harvestedCount = 0;
  let quotaExhausted = false;

  for (const seg of segments) {
    if (quotaExhausted) break;
    console.log(`Harvesting OpenAlex ${seg.label} (pages 1..${seg.pages})...`);
    for (let page = 1; page <= seg.pages; page++) {
      try {
        const url = `https://api.openalex.org/institutions?filter=${seg.filter}&sort=cited_by_count:desc&per-page=200&page=${page}&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
        const data = await fetchJsonWithBackoff(url, { maxRetries: 3, isOpenAlex: true });
        if (!data.results?.length) break;
        let addedOnPage = 0;
        for (const inst of data.results) {
          if (store.add(normalizeOpenAlex(inst, seg.hint))) {
            addedOnPage++;
            harvestedCount++;
          }
        }
        console.log(`   [OpenAlex] ${seg.label} p${page}: +${addedOnPage} (total ${store.size})`);
        await sleep(180);
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          console.warn(`   [OpenAlex] ${err.message}. Preserving cached OpenAlex hubs and continuing with ROR v2.`);
          quotaExhausted = true;
          break;
        }
        console.warn(`   [OpenAlex] Skipped ${seg.label} p${page}: ${err.message}`);
      }
    }
  }

  return { harvestedCount, quotaExhausted };
}

async function harvestRorDomains(store) {
  console.log(`Harvesting ROR v2 across ${ROR_DOMAIN_QUERIES.length} physics domains (concurrency=${ROR_CONCURRENCY})...`);
  const tasks = [];
  for (const q of ROR_DOMAIN_QUERIES) {
    for (let page = 1; page <= 2; page++) {
      tasks.push({ q, page });
    }
  }

  let addedTotal = 0;
  await runPool(tasks, ROR_CONCURRENCY, async ({ q, page }) => {
    try {
      const url = `https://api.ror.org/v2/organizations?query=${encodeURIComponent(q)}&page=${page}`;
      const data = await fetchJsonWithBackoff(url, { maxRetries: 2 });
      if (!data.items?.length) return;
      for (const org of data.items) {
        if (store.add(normalizeRor(org, q))) addedTotal++;
      }
    } catch (err) {
      console.warn(`   [ROR domain] Skipped "${q}" p${page}: ${err.message}`);
    } finally {
      await sleep(ROR_DELAY_MS);
    }
  });
  console.log(`   [ROR domains] Added +${addedTotal} new hubs (total ${store.size})`);
}

async function harvestRorSmallCountries(store) {
  const uniqueCodes = [...new Set(SMALL_COUNTRY_CODES)];
  console.log(`Running ROR v2 small/emerging country sweep across ${uniqueCodes.length} countries (concurrency=${ROR_CONCURRENCY})...`);

  let addedPhysics = 0;
  const zeroPhysicsCountries = [];

  await runPool(uniqueCodes, ROR_CONCURRENCY, async cc => {
    try {
      const url = `https://api.ror.org/v2/organizations?query=physics&filter=${encodeURIComponent(`country.country_code:${cc}`)}`;
      const data = await fetchJsonWithBackoff(url, { maxRetries: 2 });
      let countryHits = 0;
      for (const org of data.items || []) {
        const norm = normalizeRor(org, "physics");
        if (norm) {
          countryHits++;
          if (store.add(norm)) addedPhysics++;
        }
      }
      if (countryHits === 0) {
        zeroPhysicsCountries.push(cc);
      }
    } catch (err) {
      console.warn(`   [ROR country] Skipped ${cc}: ${err.message}`);
    } finally {
      await sleep(ROR_DELAY_MS);
    }
  });

  console.log(`   [ROR small-country physics] Added +${addedPhysics} new hubs; ${zeroPhysicsCountries.length} countries need flagship university fallback.`);

  // Fallback sweep for small countries with 0 explicit "physics"-named ROR orgs:
  // fetch top active national/science universities from ROR so every small nation is represented.
  const fallbackTargets = zeroPhysicsCountries.filter(cc => !store.hasCountryCode(cc));
  let addedFallback = 0;
  if (fallbackTargets.length > 0) {
    await runPool(fallbackTargets, ROR_CONCURRENCY, async cc => {
      try {
        const url = `https://api.ror.org/v2/organizations?filter=${encodeURIComponent(`country.country_code:${cc},types:education`)}`;
        const data = await fetchJsonWithBackoff(url, { maxRetries: 2 });
        const candidates = (data.items || [])
          .map(org => normalizeRor(org, "physics university"))
          .filter(Boolean);
        // Prefer national/science/technology universities first, cap at 3 per small country
        candidates.sort((a, b) => {
          const score = h =>
            (/\b(national|state|science|technology|polytechnic|royal|academy)\b/i.test(h.name) ? 2 : 0) +
            (h.foundedYear ? 1 : 0);
          return score(b) - score(a);
        });
        for (const hub of candidates.slice(0, 3)) {
          if (store.add(hub)) addedFallback++;
        }
      } catch (err) {
        console.warn(`   [ROR fallback] Skipped ${cc}: ${err.message}`);
      } finally {
        await sleep(ROR_DELAY_MS);
      }
    });
    console.log(`   [ROR small-country fallback] Added +${addedFallback} flagship universities (total ${store.size})`);
  }
}

async function main() {
  const startedAt = Date.now();
  const store = createHubStore();

  console.log("=== PhysAlts Global Physics Scraper v2 ===");
  const { harvestedCount, quotaExhausted } = await harvestOpenAlex(store);

  // If OpenAlex daily IP quota was exhausted before completing, seed previously cached OpenAlex hubs
  // (re-normalized and enriched with the new schema) so we never regress coverage.
  if (quotaExhausted || harvestedCount === 0) {
    const existing = await loadExistingHubs();
    let seeded = 0;
    for (const rawHub of existing) {
      if ((rawHub.sourceApi || rawHub.verifiedSource) === "OpenAlex" || harvestedCount === 0) {
        const norm = normalizeExistingHub(rawHub);
        if (norm && store.add(norm)) seeded++;
      }
    }
    if (seeded > 0) {
      console.log(`   [Cache Preserve] Re-normalized and preserved ${seeded} existing hubs from previous index.`);
    }
  }

  await harvestRorDomains(store);
  await harvestRorSmallCountries(store);

  // Strip internal helper field countryCode? Actually keeping clean fields without nulls or keeping it compact:
  const hubs = store.values().map(({ countryCode: _cc, ...hub }) => hub);

  const countriesSet = new Set(hubs.map(h => h.country).filter(Boolean));
  const countriesList = [...countriesSet].sort((a, b) => a.localeCompare(b));
  const byEntityType = { uni: 0, lab: 0, institute: 0, company: 0 };
  for (const h of hubs) {
    byEntityType[h.entityType] = (byEntityType[h.entityType] || 0) + 1;
  }

  const payload = {
    meta: {
      name: "PhysAlts Global Physics Index",
      generatedAt: new Date().toISOString(),
      totalHubs: hubs.length,
      totalCountries: countriesList.length,
      byEntityType,
      countriesList,
      license: "CC0 (OpenAlex, ROR v2)"
    },
    hubs
  };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(payload), "utf8");

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsedSec}s! Wrote ${hubs.length} clean physics hubs across ${countriesList.length} countries to ${OUT_FILE}`);
  console.log(`Entity breakdown:`, JSON.stringify(byEntityType));
}

main().catch(err => {
  console.error("Scraper fatal error:", err);
  process.exit(1);
});
