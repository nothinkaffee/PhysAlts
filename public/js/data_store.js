/**
 * PhysAlts — Unified Data Store & Filter Engine
 * Loads curated flagships, scraped global hubs (all countries), private deep-tech/startups,
 * chronological history timeline (600 BCE → 2045+), space frontier (0 → ~1 light-day),
 * domains/subdomains/open materials, and automated verification audit reports.
 */

import { SUBJECT_CONFIG, buildDefaultStages, classifyPhysicsBranch } from "./config.js";
import { loadLocalCustomNodes } from "./cloud_sync.js";

export const store = {
  // Primary geo-indexed hubs (flagships + startups + scraped global + custom)
  hubs: [],
  hubsById: new Map(),
  // Timeline events (600 BCE → 2045+)
  eras: [],
  timelineEvents: [],
  // Space Frontier (0 → ~1 light-day)
  spaceZones: [],
  spaceMissions: [],
  // Domains → Subdomains → Open Materials & Projects
  domains: [],
  // Verification & audit report + SHA-256 provenance ledger
  verificationReport: null,
  provenanceLedger: null,
  // Aggregated indexes
  countries: new Map(), // countryName -> count
  sectors: new Map(),   // company/startup sector -> count

  // Active UI filter state
  state: {
    viewMode: "earth",       // "earth" | "space"
    groupFilter: "all",      // "all" | "lab" | "uni" | "company" | "history"
    branch: "all",
    countryFilter: "all",
    stage: "undergrad",
    selectedId: null,
    timeMode: false,         // false = Live Present, true = Time Counter active
    timeYear: 2026,
    timePlaying: false,
    arcs: true,
    labels: false,
    tilted: false,
    shortlist: new Set(),
    bookmarks: [],
    folders: ["Shortlist", "Study List", "Apply & Jobs", "Research"],
    user: null,
    authBackend: "detecting",
    globeReady: false,
    cloudReady: false,
    ingesting: false
  }
};

function normalizeHub(raw, tier = "scraped") {
  if (!raw || !raw.name) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const country = (raw.country || (raw.city && raw.city.includes(",") ? raw.city.split(",").pop().trim() : "") || "").trim();
  const entityType = raw.entityType || raw.group || "uni";
  const group = raw.group || (entityType === "startup" || entityType === "company" ? "company" : entityType === "institute" ? "lab" : entityType);

  return {
    id: raw.id || `${tier}-${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    name: raw.name.trim(),
    city: raw.city || (country || "Global Hub"),
    country,
    lat,
    lng,
    zoom: Number(raw.zoom) || 15.6,
    group,
    entityType,
    branch: raw.branch || classifyPhysicsBranch(`${raw.name} ${raw.summary || ""}`),
    sector: raw.sector || null,
    foundedYear: raw.foundedYear != null ? Number(raw.foundedYear) : null,
    status: raw.status || "active",
    pinned: Boolean(raw.pinned),
    tier, // "flagship" | "deeptech" | "scraped" | "custom"
    sourceApi: raw.sourceApi || (tier === "flagship" ? "Curated Flagship" : tier === "deeptech" ? "Curated Deep-Tech" : "OpenAlex"),
    url: raw.url || "",
    wiki: raw.wiki || "",
    wikiSlug: raw.wikiSlug || "",
    summary: raw.summary || "Indexed global physics research institution.",
    nobel: raw.nobel || "",
    shanghai: raw.shanghai || "",
    funding: raw.funding || "",
    visa: raw.visa || "",
    stages: raw.stages ? buildDefaultStages(raw.stages) : null,
    projects: Array.isArray(raw.projects) ? raw.projects : []
  };
}

function rebuildIndexes() {
  store.hubsById.clear();
  store.countries.clear();
  store.sectors.clear();

  for (const h of store.hubs) {
    store.hubsById.set(h.id, h);
    if (h.country) {
      store.countries.set(h.country, (store.countries.get(h.country) || 0) + 1);
    }
    if (h.sector) {
      store.sectors.set(h.sector, (store.sectors.get(h.sector) || 0) + 1);
    }
  }
}

export function mergeHubs(items, tier = "scraped") {
  const existingNames = new Set(store.hubs.map(h => h.name.toLowerCase()));
  const existingIds = new Set(store.hubs.map(h => h.id));
  let added = 0;

  for (const raw of items || []) {
    const norm = normalizeHub(raw, tier);
    if (!norm) continue;
    const key = norm.name.toLowerCase();
    if (existingNames.has(key) || existingIds.has(norm.id)) continue;
    existingNames.add(key);
    existingIds.add(norm.id);
    store.hubs.push(norm);
    added++;
  }

  if (added > 0) rebuildIndexes();
  return added;
}

async function fetchJsonSafe(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadAllDatasets({ onCoreReady } = {}) {
  const f = SUBJECT_CONFIG.dataFiles;

  // Stage 1: Instant core load (~300 KB total — flagships, startups, timeline, space, domains)
  const scrapedPromise = fetchJsonSafe(f.scrapedHubs);
  const auditPromise = fetchJsonSafe(f.verificationReport);
  const ledgerPromise = fetchJsonSafe(f.provenanceLedger);

  const [flagships, startups, history, space, domains] = await Promise.all([
    fetchJsonSafe(f.flagships),
    fetchJsonSafe(f.privateStartups),
    fetchJsonSafe(f.historyTimeline),
    fetchJsonSafe(f.spaceFrontier),
    fetchJsonSafe(f.domainsCatalog)
  ]);

  if (flagships?.hubs) mergeHubs(flagships.hubs, "flagship");
  if (startups?.hubs) mergeHubs(startups.hubs, "deeptech");
  const localCustom = loadLocalCustomNodes();
  if (localCustom.length) mergeHubs(localCustom, "custom");

  if (history) {
    store.eras = history.eras || [];
    store.timelineEvents = (history.events || []).sort((a, b) => a.year - b.year);
  }
  if (space) {
    store.spaceZones = space.zones || [];
    store.spaceMissions = (space.missions || []).sort((a, b) => a.lightTimeSec - b.lightTimeSec);
  }
  if (domains?.domains) {
    store.domains = domains.domains;
  }

  rebuildIndexes();
  onCoreReady?.();

  // Stage 2: Merge full 156-country index + verification ledger seamlessly
  const [scraped, audit, ledger] = await Promise.all([scrapedPromise, auditPromise, ledgerPromise]);
  if (scraped?.hubs) mergeHubs(scraped.hubs, "scraped");
  if (audit) store.verificationReport = audit;
  if (ledger) store.provenanceLedger = ledger;

  rebuildIndexes();
  return {
    totalHubs: store.hubs.length,
    totalCountries: store.countries.size,
    totalTimeline: store.timelineEvents.length,
    totalMissions: store.spaceMissions.length,
    totalDomains: store.domains.length
  };
}

/**
 * Returns nodes currently visible on the 3D Earth globe respecting group, branch, country, and Time Counter!
 */
export function getVisibleGlobeNodes() {
  const s = store.state;

  // When Time Counter is active for historical eras (< 1995) or future (> 2026), blend timeline events onto the 3D globe!
  if (s.timeMode) {
    const year = s.timeYear;
    const windowSpan = year < 0 ? 350 : year < 1500 ? 220 : year < 1900 ? 60 : year <= 2026 ? 15 : 20;
    const timelinePoints = store.timelineEvents
      .filter(ev => {
        if (s.branch !== "all" && s.branch !== "history" && ev.branch !== s.branch) return false;
        if (s.countryFilter !== "all" && ev.country !== s.countryFilter) return false;
        if (year >= 2027) return ev.year >= 2025;
        return ev.year <= year && (ev.endYear ? ev.endYear >= year - windowSpan : ev.year >= year - windowSpan);
      })
      .map(ev => ({
        id: `tl-${ev.id}`,
        name: `${ev.title} (${ev.year < 0 ? Math.abs(ev.year) + " BCE" : ev.year})`,
        city: `${ev.location}${ev.country ? ", " + ev.country : ""}`,
        country: ev.country || "",
        lat: ev.lat,
        lng: ev.lng,
        zoom: 7.5,
        group: "history",
        entityType: ev.category === "upcoming" ? "project" : "history",
        branch: ev.branch || "history",
        foundedYear: ev.year,
        status: ev.category === "upcoming" ? "upcoming" : "historic",
        pinned: true,
        tier: "timeline",
        sourceApi: "Verified Timeline",
        url: ev.officialUrl || ev.wikiUrl || "",
        wiki: ev.wikiUrl || "",
        summary: `${ev.figure ? ev.figure + " — " : ""}${ev.summary}`,
        nobel: ev.impact || "",
        stages: null,
        projects: []
      }));

    // Also include institutions founded by that year (when year >= 1850)
    const historicHubs = year >= 1850
      ? store.hubs.filter(h => {
          if (h.foundedYear == null || h.foundedYear > year) return false;
          if (s.groupFilter !== "all" && !matchesGroup(h, s.groupFilter)) return false;
          if (s.branch !== "all" && h.branch !== s.branch) return false;
          if (s.countryFilter !== "all" && h.country !== s.countryFilter) return false;
          return true;
        })
      : [];

    return [...timelinePoints, ...historicHubs];
  }

  return store.hubs.filter(h => {
    if (s.groupFilter !== "all" && !matchesGroup(h, s.groupFilter)) return false;
    if (s.branch !== "all" && h.branch !== s.branch) return false;
    if (s.countryFilter !== "all" && h.country !== s.countryFilter) return false;
    return true;
  });
}

function matchesGroup(h, groupFilter) {
  if (groupFilter === "all") return true;
  if (groupFilter === "company") {
    return h.group === "company" || h.entityType === "company" || h.entityType === "startup" || h.entityType === "institute";
  }
  if (groupFilter === "lab") {
    return h.group === "lab" || h.entityType === "lab" || h.entityType === "project";
  }
  return h.group === groupFilter || h.entityType === groupFilter;
}

export function getNodeById(id) {
  if (!id) return null;
  if (store.hubsById.has(id)) return store.hubsById.get(id);
  if (id.startsWith("tl-")) {
    const rawId = id.slice(3);
    const ev = store.timelineEvents.find(e => e.id === rawId);
    if (ev) {
      return {
        id,
        name: ev.title,
        city: `${ev.location}${ev.country ? ", " + ev.country : ""}`,
        country: ev.country || "",
        lat: ev.lat,
        lng: ev.lng,
        zoom: 7.5,
        group: "history",
        entityType: ev.category === "upcoming" ? "project" : "history",
        branch: ev.branch || "history",
        foundedYear: ev.year,
        status: ev.category === "upcoming" ? "upcoming" : "historic",
        pinned: true,
        tier: "timeline",
        sourceApi: "Verified Timeline",
        url: ev.officialUrl || ev.wikiUrl || "",
        wiki: ev.wikiUrl || "",
        summary: `${ev.figure ? ev.figure + " — " : ""}${ev.summary}`,
        nobel: ev.impact || "",
        stages: null,
        projects: []
      };
    }
  }
  return null;
}

/**
 * Universal search across hubs, countries, private companies/startups, timeline events, space missions, and subdomains!
 */
export function universalSearch(query, limit = 14) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    return {
      hubs: store.hubs.filter(h => h.tier === "flagship").slice(0, 8),
      events: [],
      missions: [],
      subdomains: []
    };
  }

  const scoreMatch = (text, qStr) => {
    const t = (text || "").toLowerCase();
    if (t === qStr) return 100;
    if (t.startsWith(qStr)) return 60;
    if (t.includes(qStr)) return 25;
    return 0;
  };

  const hubs = store.hubs
    .map(h => {
      let sc = scoreMatch(h.name, q) * 2 + scoreMatch(h.country, q) * 1.5 + scoreMatch(h.city, q) + scoreMatch(h.sector, q) + scoreMatch(h.branch, q) * 0.8 + scoreMatch(h.summary, q) * 0.4;
      if (sc > 0 && h.tier === "flagship") sc += 15;
      if (sc > 0 && h.tier === "deeptech") sc += 10;
      return { item: h, sc };
    })
    .filter(x => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map(x => x.item);

  const events = store.timelineEvents
    .filter(e => `${e.title} ${e.figure} ${e.location} ${e.country} ${e.year} ${e.summary}`.toLowerCase().includes(q))
    .slice(0, 5);

  const missions = store.spaceMissions
    .filter(m => `${m.name} ${m.agency} ${m.body} ${m.summary} ${m.physicsDiscoveries}`.toLowerCase().includes(q))
    .slice(0, 5);

  const subdomains = [];
  for (const d of store.domains) {
    for (const sub of d.subdomains || []) {
      if (`${d.name} ${sub.name} ${sub.summary}`.toLowerCase().includes(q)) {
        subdomains.push({ domainId: d.id, domainName: d.name, ...sub });
      }
    }
  }

  return { hubs, events, missions, subdomains: subdomains.slice(0, 4) };
}
