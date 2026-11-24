/**
 * PhysALT — ShanghaiRanking 2026 (ARWU + GRAS 57 Subjects) & Ecosystem Engine
 *
 * Provides:
 *  - Complete ARWU 2026 & GRAS 2026 subject-level lookup, filtering, and sorting
 *  - Automatic mapping between PhysALT STEM disciplines/subfields and GRAS 2026 subjects
 *  - Curated real-world University <-> National Lab <-> Deep-Tech Company collaboration graph
 *  - Dynamic Haversine nearby ecosystem discovery (nearby labs, companies, institutes & universities)
 */

import { COLLABORATION_ARCS } from "./config.js";

// Reverse mapping: PhysALT subfield (branch) -> prioritized GRAS 2026 subject codes
export const BRANCH_TO_GRAS_CODES = {
  // Engineering
  semiconductors: ["AS0202", "AS0214", "AS0206", "AS0207"],
  aerospace:      ["AS0221", "AS0201"],
  robotics:       ["AS0230", "AS0205", "AS0201"],
  energy_civil:   ["AS0215", "AS0211", "AS0222", "AS0223"],
  biomedical_eng: ["AS0208", "AS0405"],
  materials_mfg:  ["AS0213", "AS0227", "AS0201", "AS0226", "AS0228"],
  // Physics
  particle:       ["AS0102"],
  quantum:        ["AS0102", "AS0214"],
  astro:          ["AS0102"],
  gravity:        ["AS0102"],
  fusion:         ["AS0102", "AS0215"],
  condensed:      ["AS0102", "AS0213", "AS0214"],
  applied:        ["AS0102", "AS0207"],
  // AI & CS
  ai_frontier:    ["AS0229", "AS0210"],
  systems_arch:   ["AS0210", "AS0202"],
  theory_crypto:  ["AS0210", "AS0101"],
  graphics_hci:   ["AS0210", "AS0229"],
  quantum_cs:     ["AS0210", "AS0102"],
  // Math
  pure_math:      ["AS0101"],
  analysis_pde:   ["AS0101"],
  applied_stat:   ["AS0502", "AS0101"],
  logic_comb:     ["AS0101"],
  // Bio & Med
  genomics_synbio:   ["AS0301", "AS0220", "AS0302"],
  neuroscience:      ["AS0302", "AS0401", "AS0508"],
  structural_pharma: ["AS0301", "AS0406", "AS0401"],
  ecology_evo:       ["AS0106", "AS0301", "AS0303"],
  // Chemistry
  catalysis_synth:   ["AS0103", "AS0212"],
  nanomaterials:     ["AS0214", "AS0213", "AS0103"],
  comp_chem:         ["AS0103"],
  // Earth & Climate
  climate_atmo:      ["AS0108", "AS0216", "AS0104"],
  ocean_geo:         ["AS0107", "AS0104", "AS0217"],
  planetary_env:     ["AS0104", "AS0224", "AS0105", "AS0216"]
};

export const DISCIPLINE_TO_GRAS_CODES = {
  physics:        ["AS0102"],
  engineering:    ["AS0202", "AS0214", "AS0213", "AS0201", "AS0221", "AS0230", "AS0205", "AS0208", "AS0215", "AS0211", "AS0206", "AS0207", "AS0222", "AS0223", "AS0226", "AS0227", "AS0228"],
  ai_cs:          ["AS0210", "AS0229"],
  math:           ["AS0101", "AS0502"],
  bio_med:        ["AS0301", "AS0302", "AS0220", "AS0401", "AS0406", "AS0402", "AS0106", "AS0303", "AS0304"],
  chem_materials: ["AS0103", "AS0212", "AS0213", "AS0214"],
  earth_climate:  ["AS0104", "AS0108", "AS0107", "AS0216", "AS0217", "AS0224", "AS0105"]
};

const state = {
  loaded: false,
  meta: null,
  categories: [],
  subjects: [],
  subjectsByCode: new Map(),
  arwuOrder: [],
  subjectRankings: {},
  universities: {},     // hubId -> { slug, name, country, arwu, gras }
  collabAdj: new Map(), // hubId -> [{ partnerId, role, detail, category }]
  collabEdges: []       // [{ a, b, role, detail, category }]
};

export function getShanghaiState() {
  return state;
}

export function initShanghaiData(payload) {
  if (!payload || !payload.universities) return;
  state.loaded = true;
  state.meta = payload.meta || {};
  state.categories = payload.categories || [];
  state.subjects = payload.subjects || [];
  state.subjectsByCode.clear();
  for (const s of state.subjects) state.subjectsByCode.set(s.code, s);
  state.arwuOrder = payload.arwuOrder || [];
  state.subjectRankings = payload.subjectRankings || {};
  state.universities = payload.universities || {};
}

export function initCollaborationsData(payload, hubsById) {
  state.collabAdj.clear();
  state.collabEdges = [];
  const seenEdge = new Set();

  const addEdge = (a, b, role, detail, category = "research") => {
    if (!a || !b || a === b) return;
    if (hubsById && (!hubsById.has(a) || !hubsById.has(b))) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    const edge = { a, b, role: role || "Research Collaboration", detail: detail || "", category };
    state.collabEdges.push(edge);
    if (!state.collabAdj.has(a)) state.collabAdj.set(a, []);
    if (!state.collabAdj.has(b)) state.collabAdj.set(b, []);
    state.collabAdj.get(a).push({ partnerId: b, role: edge.role, detail: edge.detail, category });
    state.collabAdj.get(b).push({ partnerId: a, role: edge.role, detail: edge.detail, category });
  };

  for (const c of (payload?.collaborations || [])) {
    addEdge(c.a, c.b, c.role, c.detail, c.category || "research");
  }
  // Ensure every existing COLLABORATION_ARCS pair is also represented in the rich collaboration graph
  for (const [a, b] of COLLABORATION_ARCS) {
    addEdge(a, b, "Global Research Consortium", "Joint instrumentation, beamline & co-authored frontier research.", "consortium");
  }
}

export function getShanghaiRecord(hubId) {
  return state.universities[hubId] || null;
}

export function getSubjectMeta(code) {
  return state.subjectsByCode.get(code) || null;
}

/**
 * Returns the active GRAS subject codes implied by the current UI filters.
 * - Explicit `shanghaiSubject` ("AS0202", etc.) takes precedence.
 * - Otherwise, maps active subfield (`branch`) or `discipline` to its GRAS 2026 subjects.
 */
export function getActiveGrasCodes({ shanghaiSubject = "all", discipline = "all", branch = "all" } = {}) {
  if (shanghaiSubject && shanghaiSubject !== "all" && shanghaiSubject !== "ARWU") {
    return [shanghaiSubject];
  }
  if (branch && branch !== "all" && BRANCH_TO_GRAS_CODES[branch]) {
    return BRANCH_TO_GRAS_CODES[branch];
  }
  if (discipline && discipline !== "all" && DISCIPLINE_TO_GRAS_CODES[discipline]) {
    return DISCIPLINE_TO_GRAS_CODES[discipline];
  }
  return [];
}

/**
 * Checks whether a hub matches a given discipline/branch/shanghaiSubject via its official GRAS 2026 rankings.
 */
export function matchesShanghaiFilter(hub, { shanghaiSubject = "all", discipline = "all", branch = "all" } = {}) {
  const sr = state.universities[hub.id];
  if (!sr) return false;

  if (shanghaiSubject === "ARWU") {
    return Boolean(sr.arwu);
  }
  if (shanghaiSubject && shanghaiSubject !== "all") {
    return Boolean(sr.gras && sr.gras[shanghaiSubject]);
  }
  if (branch && branch !== "all") {
    const codes = BRANCH_TO_GRAS_CODES[branch] || [];
    return codes.some(c => Boolean(sr.gras && sr.gras[c]));
  }
  if (discipline && discipline !== "all") {
    const codes = DISCIPLINE_TO_GRAS_CODES[discipline] || [];
    return codes.some(c => Boolean(sr.gras && sr.gras[c]));
  }
  return true;
}

/**
 * Computes a numeric sort key for a hub under the current ShanghaiRanking 2026 context.
 * Lower = higher ranked (1 = #1 in world). Returns { rankNum, rankLabel, subjectCode, subjectName, score, isOfficial }.
 */
export function getHubContextualRank(hub, ctx = {}) {
  const sr = state.universities[hub.id];
  if (!sr) return null;

  const { shanghaiSubject = "all", discipline = "all", branch = "all" } = ctx;

  // 1. Explicit ARWU 2026 mode
  if (shanghaiSubject === "ARWU") {
    if (!sr.arwu) return null;
    return {
      rankNum: sr.arwu.rn || 9999,
      rankLabel: sr.arwu.r,
      subjectCode: "ARWU",
      subjectName: "ARWU 2026 World",
      score: sr.arwu.s ?? null,
      ind: sr.arwu.i || [],
      isArwu: true
    };
  }

  // 2. Explicit GRAS 2026 subject selected
  if (shanghaiSubject && shanghaiSubject !== "all") {
    const g = sr.gras?.[shanghaiSubject];
    if (!g) return null;
    const sm = state.subjectsByCode.get(shanghaiSubject);
    return {
      rankNum: g.rn || 9999,
      rankLabel: g.r,
      subjectCode: shanghaiSubject,
      subjectName: sm?.name || shanghaiSubject,
      score: g.s ?? null,
      ind: g.i || [],
      isArwu: false
    };
  }

  // 3. Implicit subject from active STEM subfield or discipline (pick primary/best matching GRAS subject)
  const codes = getActiveGrasCodes({ shanghaiSubject, discipline, branch });
  if (codes.length && sr.gras) {
    let best = null;
    for (let idx = 0; idx < codes.length; idx++) {
      const c = codes[idx];
      const g = sr.gras[c];
      if (!g) continue;
      // Primary subject gets slight tie-break preference over secondary subjects
      const effRank = (g.rn || 9999) + idx * 0.25;
      if (!best || effRank < best._eff) {
        const sm = state.subjectsByCode.get(c);
        best = {
          _eff: effRank,
          rankNum: g.rn || 9999,
          rankLabel: g.r,
          subjectCode: c,
          subjectName: sm?.name || c,
          score: g.s ?? null,
          ind: g.i || [],
          isArwu: false
        };
      }
    }
    if (best) return best;
  }

  // 4. Overall fallback: ARWU 2026 rank, or best GRAS subject rank if unranked in ARWU Top 1000
  if (sr.arwu) {
    return {
      rankNum: sr.arwu.rn || 9999,
      rankLabel: sr.arwu.r,
      subjectCode: "ARWU",
      subjectName: "ARWU 2026",
      score: sr.arwu.s ?? null,
      ind: sr.arwu.i || [],
      isArwu: true
    };
  }
  const grasEntries = Object.entries(sr.gras || {});
  if (grasEntries.length) {
    grasEntries.sort((a, b) => (a[1].rn || 9999) - (b[1].rn || 9999) || (b[1].s || 0) - (a[1].s || 0));
    const [bestCode, g] = grasEntries[0];
    const sm = state.subjectsByCode.get(bestCode);
    return {
      rankNum: g.rn || 9999,
      rankLabel: g.r,
      subjectCode: bestCode,
      subjectName: sm?.name || bestCode,
      score: g.s ?? null,
      ind: g.i || [],
      isArwu: false
    };
  }
  return null;
}

/**
 * Returns all GRAS 2026 subjects for a hub sorted best-rank first.
 */
export function getHubGrasSubjectsSorted(hubId, activeSubjectCode = null) {
  const sr = state.universities[hubId];
  if (!sr || !sr.gras) return [];
  const rows = Object.entries(sr.gras).map(([code, g]) => {
    const sm = state.subjectsByCode.get(code);
    return {
      code,
      name: sm?.name || code,
      category: sm?.category || "",
      rankLabel: g.r,
      rankNum: g.rn || 9999,
      score: g.s ?? null,
      ind: g.i || [],
      isActive: code === activeSubjectCode
    };
  });
  rows.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.rankNum - b.rankNum || (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name);
  });
  return rows;
}

/**
 * Haversine distance in kilometers between two lat/lng points.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistanceKm(km) {
  if (km < 1) return `${Math.max(100, Math.round(km * 1000 / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Returns verified research collaborations for a given hubId.
 */
export function getHubCollaborations(hubId, hubsById) {
  const list = state.collabAdj.get(hubId) || [];
  return list
    .map(item => {
      const partner = hubsById.get(item.partnerId);
      if (!partner) return null;
      return {
        hub: partner,
        role: item.role,
        detail: item.detail,
        category: item.category
      };
    })
    .filter(Boolean);
}

/**
 * Computes nearby ecosystem hubs (national labs, deep-tech companies/startups, research institutes, and partner universities)
 * within `maxKm` of a selected hub, excluding already-listed direct collaborators so both lists stay complementary & crisp.
 */
export function getNearbyEcosystem(hub, allHubs, { maxKm = 80, limit = 8, excludeIds = new Set() } = {}) {
  if (!hub || !Number.isFinite(hub.lat) || !Number.isFinite(hub.lng)) return [];
  const latDeg = maxKm / 111;
  const cosLat = Math.max(0.15, Math.cos((hub.lat * Math.PI) / 180));
  const lngDeg = maxKm / (111 * cosLat);

  const isSelectedUni = hub.entityType === "uni" || hub.group === "uni";
  const candidates = [];

  for (const other of allHubs) {
    if (!other || other.id === hub.id || excludeIds.has(other.id)) continue;
    if (other.tier === "timeline" || other.group === "history") continue;
    if (Math.abs(other.lat - hub.lat) > latDeg || Math.abs(other.lng - hub.lng) > lngDeg) continue;

    const km = haversineKm(hub.lat, hub.lng, other.lat, other.lng);
    if (km > maxKm) continue;

    const isCompany = other.group === "company" || other.entityType === "company" || other.entityType === "startup";
    const isLabOrInst = other.group === "lab" || other.entityType === "lab" || other.entityType === "institute";
    const isUni = other.group === "uni" || other.entityType === "uni";

    // Rank nearby ecosystem by relevance:
    // - For a university, prioritize nearby labs, institutes, and deep-tech companies first!
    // - For a lab/company, prioritize nearby universities, labs, and companies!
    let typeWeight = 0;
    if (isSelectedUni) {
      if (isCompany) typeWeight = 38;
      else if (isLabOrInst) typeWeight = 34;
      else if (isUni) typeWeight = 14;
    } else {
      if (isUni) typeWeight = 34;
      else if (isCompany) typeWeight = 32;
      else if (isLabOrInst) typeWeight = 28;
    }

    const tierBonus =
      other.tier === "flagship" ? 26
      : other.tier === "stem" ? 22
      : other.tier === "deeptech" ? 22
      : state.universities[other.id]?.arwu ? 16
      : 0;
    const branchBonus = (other.branch && other.branch === hub.branch) ? 14 : 0;
    const proximityBonus = Math.max(0, 20 - (km / maxKm) * 20);
    const score = typeWeight + tierBonus + branchBonus + proximityBonus + (other.impactScore || 0) * 0.12;

    candidates.push({
      hub: other,
      km,
      distLabel: formatDistanceKm(km),
      kind: isCompany ? "Company" : isLabOrInst ? (other.entityType === "institute" ? "Institute" : "Lab") : "University",
      score
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.km - b.km);

  // Deduplicate near-identical parent/dept hubs at same spot (keep highest scoring)
  const out = [];
  const seenPrefix = new Set();
  for (const c of candidates) {
    const key = c.hub.name.toLowerCase().slice(0, 18);
    if (seenPrefix.has(key)) continue;
    seenPrefix.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Returns active ecosystem edges (collaborations + top nearby labs/companies) for rendering
 * glowing geodesic arcs on the 3D globe around the currently selected institution.
 */
export function getSelectedEcosystemArcs(selectedHub, allHubs, hubsById) {
  if (!selectedHub || selectedHub.tier === "timeline") return [];
  const arcs = [];
  const collabIds = new Set();

  for (const c of getHubCollaborations(selectedHub.id, hubsById)) {
    collabIds.add(c.hub.id);
    arcs.push({ a: selectedHub, b: c.hub, kind: "collab", role: c.role });
  }

  const nearby = getNearbyEcosystem(selectedHub, allHubs, { maxKm: 65, limit: 6, excludeIds: collabIds });
  for (const nb of nearby) {
    // Only draw proximity spoke if >= 0.4 km away so zero-length arcs don't flicker
    if (nb.km >= 0.4) {
      arcs.push({ a: selectedHub, b: nb.hub, kind: "nearby", role: `${nb.kind} · ${nb.distLabel}` });
    }
  }
  return arcs;
}
