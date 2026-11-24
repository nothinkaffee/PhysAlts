/**
 * PhysAlts — Unified Data Store & Filter Engine
 * Loads curated flagships, scraped global hubs (all countries), private deep-tech/startups,
 * chronological history timeline (600 BCE → 2045+), space frontier (0 → ~1 light-day),
 * domains/subdomains/open materials, and automated verification audit reports.
 */

import { SUBJECT_CONFIG, buildDefaultStages, classifyPhysicsBranch, BRANCH_TO_DISCIPLINE } from "./config.js";
import { loadLocalCustomNodes } from "./cloud_sync.js";
import { computeImpactScore, attachImpactScores, sortHubsByRanking } from "./impact_ranking.js";
import { loadAllOfflinePacks } from "./offline_packs.js";
import {
  initShanghaiData,
  initCollaborationsData,
  getShanghaiRecord,
  matchesShanghaiFilter
} from "./shanghai_engine.js";

export const store = {
  // Primary geo-indexed hubs (physics flagships + STEM/AI hubs + startups + scraped global + ShanghaiRanking 2026 + custom)
  hubs: [],
  hubsById: new Map(),
  // Timeline events (1800 BCE → 2045+ across Physics & STEM/AI)
  eras: [],
  timelineEvents: [],
  // Space Frontier (0 → 1 light-day)
  spaceZones: [],
  spaceMissions: [],
  // Domains → Subdomains → Open Materials & Projects (Physics + All STEM)
  domains: [],
  // Curated cross-disciplinary Rabbit Hole Journeys
  rabbitTrails: [],
  // Verification & audit report + SHA-256 provenance ledger
  verificationReport: null,
  provenanceLedger: null,
  // Aggregated indexes
  countries: new Map(), // countryName -> count
  sectors: new Map(),   // company/startup sector -> count

  // Active UI filter state
  state: {
    viewMode: "earth",       // "earth" | "space"
    discipline: "all",       // "all" | "physics" | "ai_cs" | "math" | "bio_med" | "chem_materials" | "earth_climate" | "engineering"
    groupFilter: "all",      // "all" | "lab" | "institute" | "uni" | "company" | "history"
    branch: "all",
    shanghaiSubject: "all",  // "all" | "ARWU" | "AS0202" | ... (57 GRAS 2026 subjects)
    countryFilter: "all",
    sortBy: "shanghai",      // "shanghai" | "impact" | "citations" | "founded" | "name"
    curatedOnly: false,
    stageOnly: false,
    stage: "undergrad",
    selectedId: null,
    activeTrail: null,       // { id, title, stops: [{ hubId, title, bridge }], index: 0 }
    trailHistory: [],        // breadcrumb trail of visited hub IDs
    rabbitPath: [],          // [{ id, lat, lng }] live curiosity-walk geodesic path
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

function inferDiscipline(raw, tier) {
  if (raw.discipline) return raw.discipline;
  const br = raw.branch || "";
  if (BRANCH_TO_DISCIPLINE[br]) return BRANCH_TO_DISCIPLINE[br];
  if (["ai_cs", "math", "bio_med", "chem_materials", "earth_climate", "engineering"].includes(br)) return br;
  return "physics";
}

function normalizeHub(raw, tier = "scraped") {
  if (!raw || !raw.name) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const country = (raw.country || (raw.city && raw.city.includes(",") ? raw.city.split(",").pop().trim() : "") || "").trim();
  const entityType = raw.entityType || raw.group || "uni";
  const group = raw.group || (entityType === "startup" || entityType === "company" ? "company" : entityType === "institute" ? "lab" : entityType);
  const discipline = inferDiscipline(raw, tier);

  const hub = {
    id: raw.id || `${tier}-${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    name: raw.name.trim(),
    city: raw.city || (country || "Global Hub"),
    country,
    lat,
    lng,
    zoom: Number(raw.zoom) || 15.6,
    group,
    entityType,
    discipline,
    branch: raw.branch || (discipline !== "physics" ? discipline : classifyPhysicsBranch(`${raw.name} ${raw.summary || ""}`)),
    sector: raw.sector || null,
    foundedYear: raw.foundedYear != null ? Number(raw.foundedYear) : null,
    status: raw.status || "active",
    pinned: Boolean(raw.pinned),
    tier, // "flagship" | "stem" | "deeptech" | "scraped" | "custom"
    sourceApi: raw.sourceApi || (tier === "flagship" ? "Curated Flagship" : tier === "stem" ? "Curated STEM" : tier === "deeptech" ? "Curated Deep-Tech" : "OpenAlex"),
    url: raw.url || "",
    wiki: raw.wiki || "",
    wikiSlug: raw.wikiSlug || "",
    summary: raw.summary || "Indexed global research institution.",
    nobel: raw.nobel || raw.awards || "",
    shanghai: raw.shanghai || "",
    funding: raw.funding || "",
    visa: raw.visa || "",
    stages: raw.stages ? buildDefaultStages(raw.stages) : null,
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    next: Array.isArray(raw.next) ? raw.next : [],
    rabbitLinks: Array.isArray(raw.rabbitLinks) ? raw.rabbitLinks : []
  };
  hub._impact = computeImpactScore(hub);
  hub.impactScore = hub._impact.total;
  return hub;
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

function mergeTimelineEvents(events) {
  if (!Array.isArray(events) || !events.length) return;
  const seen = new Set(store.timelineEvents.map(e => e.id));
  for (const ev of events) {
    if (!ev || !ev.id || seen.has(ev.id)) continue;
    seen.add(ev.id);
    store.timelineEvents.push(ev);
  }
  store.timelineEvents.sort((a, b) => a.year - b.year);
}

function mergeDomains(domains) {
  if (!Array.isArray(domains) || !domains.length) return;
  const seen = new Set(store.domains.map(d => d.id));
  for (const dom of domains) {
    if (!dom || !dom.id || seen.has(dom.id)) continue;
    seen.add(dom.id);
    store.domains.push(dom);
  }
}

function mergeTrails(trails) {
  if (!Array.isArray(trails) || !trails.length) return;
  const seen = new Set(store.rabbitTrails.map(t => t.id));
  for (const tr of trails) {
    if (!tr || !tr.id || seen.has(tr.id)) continue;
    seen.add(tr.id);
    store.rabbitTrails.push(tr);
  }
}

export function mergeOfflinePackPayload(pack) {
  if (!pack || typeof pack !== "object") return 0;
  let added = 0;
  if (Array.isArray(pack.hubs)) {
    const curated = pack.hubs.filter(h => h.tier === "flagship" || h.tier === "stem" || h.tier === "deeptech" || h.pinned);
    const rest = pack.hubs.filter(h => !curated.includes(h));
    added += mergeHubs(curated, "stem");
    added += mergeHubs(rest, "scraped");
  }
  if (Array.isArray(pack.events)) mergeTimelineEvents(pack.events);
  if (Array.isArray(pack.domains)) mergeDomains(pack.domains);
  if (Array.isArray(pack.trails)) mergeTrails(pack.trails);
  if (Array.isArray(pack.missions) && !store.spaceMissions.length) {
    store.spaceMissions = pack.missions.slice().sort((a, b) => a.lightTimeSec - b.lightTimeSec);
  }
  rebuildIndexes();
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

  // Stage 1: Instant core load (flagships + all STEM/AI hubs + startups + timelines + space + domains + rabbit trails)
  const scrapedPromise = fetchJsonSafe(f.scrapedHubs);
  const shanghaiPromise = fetchJsonSafe(f.shanghai2026);
  const shanghaiExtraPromise = fetchJsonSafe(f.shanghaiExtraHubs);
  const collabsPromise = fetchJsonSafe(f.collaborations);
  const auditPromise = fetchJsonSafe(f.verificationReport);
  const ledgerPromise = fetchJsonSafe(f.provenanceLedger);

  const [
    flagships, startups, history, space, domains,
    stemAiCs, stemMath, stemBioMed, stemChemEarthEng, stemEngineering,
    stemTimeline, stemDomains, rabbitTrails, offlinePacks
  ] = await Promise.all([
    fetchJsonSafe(f.flagships),
    fetchJsonSafe(f.privateStartups),
    fetchJsonSafe(f.historyTimeline),
    fetchJsonSafe(f.spaceFrontier),
    fetchJsonSafe(f.domainsCatalog),
    fetchJsonSafe(f.stemAiCs),
    fetchJsonSafe(f.stemMath),
    fetchJsonSafe(f.stemBioMed),
    fetchJsonSafe(f.stemChemEarthEng),
    fetchJsonSafe(f.stemEngineering),
    fetchJsonSafe(f.stemTimeline),
    fetchJsonSafe(f.stemDomains),
    fetchJsonSafe(f.rabbitTrails),
    loadAllOfflinePacks().catch(() => [])
  ]);

  if (flagships?.hubs) mergeHubs(flagships.hubs, "flagship");
  if (stemAiCs?.hubs) mergeHubs(stemAiCs.hubs, "stem");
  if (stemMath?.hubs) mergeHubs(stemMath.hubs, "stem");
  if (stemBioMed?.hubs) mergeHubs(stemBioMed.hubs, "stem");
  if (stemChemEarthEng?.hubs) mergeHubs(stemChemEarthEng.hubs, "stem");
  if (stemEngineering?.hubs) mergeHubs(stemEngineering.hubs, "stem");
  if (startups?.hubs) mergeHubs(startups.hubs, "deeptech");
  const localCustom = loadLocalCustomNodes();
  if (localCustom.length) mergeHubs(localCustom, "custom");

  if (history) {
    store.eras = history.eras || [];
    mergeTimelineEvents(history.events || []);
  }
  if (stemTimeline?.events) mergeTimelineEvents(stemTimeline.events);

  if (space) {
    store.spaceZones = space.zones || [];
    store.spaceMissions = (space.missions || []).sort((a, b) => a.lightTimeSec - b.lightTimeSec);
  }
  if (domains?.domains) mergeDomains(domains.domains);
  if (stemDomains?.domains) mergeDomains(stemDomains.domains);
  if (rabbitTrails?.trails) mergeTrails(rabbitTrails.trails);

  // Also hydrate any user-downloaded IndexedDB offline packs (critical for 100% airplane-mode use!)
  for (const pack of offlinePacks || []) {
    mergeOfflinePackPayload(pack);
  }

  attachImpactScores(store.hubs);
  rebuildIndexes();
  onCoreReady?.();

  // Stage 2: Merge full 155-country index + ShanghaiRanking 2026 (ARWU + 57 GRAS subjects) + verified collaborations
  const [scraped, shanghaiData, shanghaiExtra, collabsData, audit, ledger] = await Promise.all([
    scrapedPromise, shanghaiPromise, shanghaiExtraPromise, collabsPromise, auditPromise, ledgerPromise
  ]);
  if (scraped?.hubs) mergeHubs(scraped.hubs, "scraped");
  if (shanghaiExtra?.hubs) mergeHubs(shanghaiExtra.hubs, "shanghai");
  if (shanghaiData) initShanghaiData(shanghaiData);
  if (audit) store.verificationReport = audit;
  if (ledger) store.provenanceLedger = ledger;

  attachImpactScores(store.hubs);
  rebuildIndexes();
  for (const h of store.hubs) {
    const sr = getShanghaiRecord(h.id);
    if (sr) {
      h._sr = sr;
      if (sr.arwu?.r && !h.shanghai) h.shanghai = `ARWU 2026 #${sr.arwu.r}`;
    }
  }
  initCollaborationsData(collabsData, store.hubsById);
  return {
    totalHubs: store.hubs.length,
    totalCountries: store.countries.size,
    totalTimeline: store.timelineEvents.length,
    totalMissions: store.spaceMissions.length,
    totalDomains: store.domains.length,
    totalTrails: store.rabbitTrails.length
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
        city: ev.country && !String(ev.location || "").toLowerCase().includes(ev.country.toLowerCase())
          ? `${ev.location}, ${ev.country}`
          : (ev.location || ev.country || ""),
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
      ? getFilteredHubs().filter(h => h.foundedYear != null && h.foundedYear <= year)
      : [];

    return [...timelinePoints, ...historicHubs];
  }

  return getFilteredHubs();
}

export function getFilteredHubs(overrides = {}) {
  const s = store.state;
  const discipline = overrides.discipline !== undefined ? overrides.discipline : s.discipline;
  const groupFilter = overrides.groupFilter !== undefined ? overrides.groupFilter : s.groupFilter;
  const branch = overrides.branch !== undefined ? overrides.branch : s.branch;
  const shanghaiSubject = overrides.shanghaiSubject !== undefined ? overrides.shanghaiSubject : s.shanghaiSubject;
  const countryFilter = overrides.countryFilter !== undefined ? overrides.countryFilter : s.countryFilter;
  const curatedOnly = overrides.curatedOnly !== undefined ? overrides.curatedOnly : s.curatedOnly;
  const stageOnly = overrides.stageOnly !== undefined ? overrides.stageOnly : s.stageOnly;
  const stage = overrides.stage !== undefined ? overrides.stage : s.stage;
  const sortBy = overrides.sortBy !== undefined ? overrides.sortBy : s.sortBy;

  const filtered = store.hubs.filter(h => {
    if (groupFilter !== "all" && !matchesGroup(h, groupFilter)) return false;
    if (countryFilter !== "all" && h.country !== countryFilter) return false;
    if (curatedOnly && h.tier !== "flagship" && h.tier !== "stem" && h.tier !== "deeptech") return false;
    if (stageOnly && stage !== "all" && !h.stages) return false;

    // Explicit ShanghaiRanking 2026 subject or ARWU Top 1,000 filter
    if (shanghaiSubject && shanghaiSubject !== "all") {
      return matchesShanghaiFilter(h, { shanghaiSubject });
    }

    // Discipline & Subfield filter: matches native STEM classification OR official GRAS 2026 subject membership!
    if (discipline !== "all") {
      const nativeDisc = h.discipline === discipline;
      const srDisc = matchesShanghaiFilter(h, { discipline });
      if (!nativeDisc && !srDisc) return false;
    }
    if (branch !== "all") {
      const nativeBranch = h.branch === branch;
      const srBranch = matchesShanghaiFilter(h, { branch });
      if (!nativeBranch && !srBranch) return false;
    }
    return true;
  });

  return overrides.skipSort
    ? filtered
    : sortHubsByRanking(filtered, sortBy, s.timeMode ? s.timeYear : null, {
        shanghaiSubject,
        discipline,
        branch,
        groupFilter
      });
}

function matchesGroup(h, groupFilter) {
  if (groupFilter === "all") return true;
  if (groupFilter === "company") {
    return h.group === "company" || h.entityType === "company" || h.entityType === "startup";
  }
  if (groupFilter === "institute") {
    return h.entityType === "institute";
  }
  if (groupFilter === "lab") {
    return (
      h.group === "lab" ||
      h.entityType === "lab" ||
      h.entityType === "project" ||
      (h.entityType === "institute" && h.group !== "uni")
    );
  }
  if (groupFilter === "uni") {
    return h.group === "uni" || h.entityType === "uni";
  }
  if (groupFilter === "history") {
    return h.group === "history" || h.entityType === "history";
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
        city: ev.country && !String(ev.location || "").toLowerCase().includes(ev.country.toLowerCase())
          ? `${ev.location}, ${ev.country}`
          : (ev.location || ev.country || ""),
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
 * Universal search across all STEM hubs, countries, startups, timeline events, space missions, subdomains, and curated Rabbit Hole trails!
 */
export function universalSearch(query, limit = 14) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    const topCurated = sortHubsByRanking(
      store.hubs.filter(h => h.tier === "flagship" || h.tier === "stem"),
      "impact"
    ).slice(0, 8);
    return {
      hubs: topCurated,
      events: [],
      missions: [],
      subdomains: [],
      trails: store.rabbitTrails.slice(0, 4)
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
      let sc =
        scoreMatch(h.name, q) * 2 +
        scoreMatch(h.country, q) * 1.5 +
        scoreMatch(h.city, q) +
        scoreMatch(h.sector, q) +
        scoreMatch(h.discipline, q) * 0.9 +
        scoreMatch(h.branch, q) * 0.8 +
        scoreMatch(h.nobel, q) * 0.6 +
        scoreMatch(h.summary, q) * 0.4;
      if (sc > 0 && (h.tier === "flagship" || h.tier === "stem")) sc += 16;
      if (sc > 0 && h.tier === "deeptech") sc += 10;
      if (sc > 0 && h.impactScore) sc += h.impactScore * 0.18;
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

  const trails = (store.rabbitTrails || []).filter(t =>
    `${t.title} ${t.tagline} ${(t.disciplines || []).join(" ")} ${(t.stops || []).map(s => s.title).join(" ")}`.toLowerCase().includes(q)
  ).slice(0, 4);

  return { hubs, events, missions, subdomains: subdomains.slice(0, 4), trails };
}
