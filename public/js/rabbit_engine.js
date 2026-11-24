/**
 * World of Science — Semantic Curiosity-Walk Rabbit Hole Engine
 *
 * 100% client-side, offline-ready (<5 ms per hop across 5,400+ STEM hubs & 36 space missions).
 * Replaces flat Math.random() and static array-order recommendations with:
 *   1. Lazy TF-IDF concept & bigram index + bidirectional curated graph
 *   2. Contextual weighted curiosity walk with Deepen → Deepen → Cross-STEM Pivot rhythm
 *   3. Softmax temperature sampling (alive & non-deterministic) with anti-loop / geo diversity
 *   4. 3 typed Keep Exploring branches per card (Deeper · Cross-STEM/Spinout · Space/Wildcard)
 *   5. Live session path memory for Back navigation & crimson geodesic path arcs on the 3D globe
 */

import { store, getFilteredHubs, getNodeById } from "./data_store.js";
import { COLLABORATION_ARCS, BRANCH_SHORT_LABELS, STEM_DISCIPLINES } from "./config.js";

const DISCIPLINE_SHORT = Object.fromEntries((STEM_DISCIPLINES || []).map(d => [d.id, d.short || d.label]));

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "over", "under", "near",
  "are", "was", "were", "has", "have", "had", "its", "their", "our", "all", "one", "two",
  "most", "more", "very", "also", "such", "well", "many", "major", "world", "leading",
  "global", "international", "national", "public", "private", "large", "largest", "first",
  "oldest", "known", "famous", "based", "located", "founded", "established", "home", "hub",
  "university", "universities", "institute", "institutes", "institution", "institutions",
  "department", "faculty", "school", "college", "center", "centre", "laboratory", "laboratories",
  "lab", "labs", "facility", "facilities", "research", "science", "sciences", "scientific",
  "technology", "technologies", "engineering", "physics", "indexed", "organization", "foundation",
  "academy", "society", "group", "program", "programs", "project", "projects", "system", "systems",
  "study", "studies", "field", "fields", "work", "works", "across", "including", "focusing",
  "focused", "dedicated", "advancing", "pioneering", "developing", "building", "exploring",
  "modern", "advanced", "frontier", "open", "high", "deep", "new", "next", "scale", "data",
  "model", "models", "method", "methods", "theory", "applied", "experimental", "theoretical",
  "top", "premier", "anchored", "medal", "renowned", "elite", "prestigious", "flagship",
  "cutting", "edge", "key", "core", "best", "prime", "great", "notable", "historic", "historical",
  "united", "states", "kingdom", "republic", "north", "south", "east", "west", "central",
  "city", "region", "country", "campus", "site", "official", "wikipedia", "nobel", "prize",
  "laureate", "laureates", "awarded", "won", "years", "year", "century", "era"
]);

const DOMAIN_BIGRAMS = new Set([
  "dark matter", "dark energy", "black hole", "black holes", "gravitational wave", "gravitational waves",
  "quantum computing", "quantum optics", "quantum gravity", "quantum error", "quantum sensing",
  "particle accelerator", "particle collider", "nuclear fusion", "inertial confinement", "magnetic confinement",
  "protein folding", "gene editing", "machine learning", "deep learning", "reinforcement learning",
  "language model", "language models", "neural network", "neural networks", "foundation model",
  "x ray", "synchrotron light", "free electron", "cosmic ray", "cosmic rays", "neutrino detector",
  "superconducting magnet", "condensed matter", "high energy", "heavy ion", "ultra cold",
  "climate modeling", "earth observation", "space telescope", "lunar south", "deep space",
  "drug discovery", "structural biology", "synthetic biology", "stem cell", "cryo em",
  "extreme ultraviolet", "silicon photonics", "solid state", "number theory", "algebraic geometry"
]);

let indexSignature = "";
let hubVectors = new Map();       // hubId -> Map<term, tfidfWeight>
let hubTopTerms = new Map();      // hubId -> string[] (top distinctive concepts)
let postingLists = new Map();     // term -> Set<hubId>
let curatedAdj = new Map();       // hubId -> Set<hubId> (bidirectional node.next + COLLABORATION_ARCS)
let spaceVectors = new Map();     // missionId -> Map<term, weight>

const session = {
  visited: [],          // ordered unique-ish recent IDs
  visitedSet: new Set(),
  recentCountries: [],
  recentDisciplines: [],
  walkHistory: [],      // [{ id, kind, title, city, lat, lng, reason }]
  walkCursor: -1,
  hopCount: 0
};

function tokenizeText(raw) {
  if (!raw) return [];
  const clean = String(raw)
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!clean) return [];
  const words = clean.split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
  const tokens = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!STOP_WORDS.has(w)) tokens.push(w);
    if (i + 1 < words.length) {
      const bg = `${w} ${words[i + 1]}`;
      if (DOMAIN_BIGRAMS.has(bg)) tokens.push(bg);
    }
  }
  return tokens;
}

function getHubDocText(h) {
  const proj = (h.projects || []).map(p => p.name || "").join(" ");
  return `${h.sector || ""} ${h.summary || ""} ${proj} ${h.nobel || ""} ${h.branch || ""}`;
}

function ensureSemanticIndex() {
  const sig = `${store.hubs.length}:${store.spaceMissions.length}`;
  if (sig === indexSignature && hubVectors.size > 0) return;

  hubVectors = new Map();
  hubTopTerms = new Map();
  postingLists = new Map();
  curatedAdj = new Map();
  spaceVectors = new Map();

  const addAdj = (a, b) => {
    if (!a || !b || a === b) return;
    if (!curatedAdj.has(a)) curatedAdj.set(a, new Set());
    if (!curatedAdj.has(b)) curatedAdj.set(b, new Set());
    curatedAdj.get(a).add(b);
    curatedAdj.get(b).add(a);
  };

  for (const [a, b] of COLLABORATION_ARCS) addAdj(a, b);
  for (const h of store.hubs) {
    for (const nxt of h.next || []) addAdj(h.id, nxt);
  }
  for (const tr of store.rabbitTrails || []) {
    const stops = tr.stops || [];
    for (let i = 0; i + 1 < stops.length; i++) {
      if (stops[i]?.hubId && stops[i + 1]?.hubId) addAdj(stops[i].hubId, stops[i + 1].hubId);
    }
  }

  // Pass 1: Term frequencies per hub & document frequency
  const docFreq = new Map();
  const rawTFs = new Map();
  const N = Math.max(1, store.hubs.length);

  for (const h of store.hubs) {
    const toks = tokenizeText(getHubDocText(h));
    if (!toks.length) continue;
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    rawTFs.set(h.id, tf);
    for (const t of tf.keys()) docFreq.set(t, (docFreq.get(t) || 0) + 1);
  }

  // Pass 2: Normalized TF-IDF vectors & selective posting lists
  const maxPostingDf = Math.max(260, Math.floor(N * 0.12));
  for (const [hubId, tf] of rawTFs.entries()) {
    const vec = new Map();
    let normSq = 0;
    const scored = [];
    for (const [term, count] of tf.entries()) {
      const df = docFreq.get(term) || 1;
      if (df > N * 0.35) continue;
      const isBigram = term.includes(" ");
      const idf = Math.log((N + 1) / (df + 1)) + 1;
      const w = (1 + Math.log(count)) * idf * (isBigram ? 1.55 : 1.0);
      vec.set(term, w);
      normSq += w * w;
      scored.push([term, w]);
      if (df <= maxPostingDf) {
        if (!postingLists.has(term)) postingLists.set(term, new Set());
        postingLists.get(term).add(hubId);
      }
    }
    const norm = Math.sqrt(normSq) || 1;
    for (const [term, w] of vec.entries()) vec.set(term, w / norm);
    hubVectors.set(hubId, vec);
    scored.sort((a, b) => b[1] - a[1]);
    hubTopTerms.set(hubId, scored.slice(0, 6).map(x => x[0]));
  }

  // Space mission concept vectors for cross-Earth ↔ 1 Light-Day jumps
  for (const m of store.spaceMissions || []) {
    const toks = tokenizeText(`${m.name || ""} ${m.agency || ""} ${m.summary || ""} ${m.physicsDiscoveries || ""} ${(m.instruments || []).join(" ")}`);
    const vec = new Map();
    let normSq = 0;
    for (const t of toks) {
      const df = docFreq.get(t) || 2;
      const idf = Math.log((N + 1) / (df + 1)) + 1;
      const w = (vec.get(t) || 0) + idf * (t.includes(" ") ? 1.5 : 1.0);
      vec.set(t, w);
    }
    for (const w of vec.values()) normSq += w * w;
    const norm = Math.sqrt(normSq) || 1;
    for (const [t, w] of vec.entries()) vec.set(t, w / norm);
    spaceVectors.set(m.id, vec);
  }

  indexSignature = sig;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lat2)) return 0;
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function cosineWithTopShared(vecA, vecB) {
  if (!vecA || !vecB || !vecA.size || !vecB.size) return { sim: 0, shared: [] };
  const [small, big] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  let dot = 0;
  const shared = [];
  for (const [term, w1] of small.entries()) {
    const w2 = big.get(term);
    if (w2) {
      const contrib = w1 * w2;
      dot += contrib;
      shared.push([term, contrib]);
    }
  }
  shared.sort((a, b) => b[1] - a[1]);
  return { sim: dot, shared: shared.slice(0, 2).map(x => x[0]) };
}

function isHubCurated(h) {
  return h.tier === "flagship" || h.tier === "stem" || h.tier === "deeptech";
}

function getEntityKind(h) {
  if (h.group === "company" || h.entityType === "startup" || h.entityType === "company") return "startup";
  if (h.group === "uni" || h.entityType === "uni") return "uni";
  return "lab";
}

function hasActiveUserFilters() {
  const s = store.state;
  return Boolean(
    (s.discipline && s.discipline !== "all") ||
    (s.branch && s.branch !== "all") ||
    (s.groupFilter && s.groupFilter !== "all") ||
    (s.countryFilter && s.countryFilter !== "all") ||
    s.curatedOnly
  );
}

function getCandidateHubs(sourceNode) {
  ensureSemanticIndex();
  const useFiltered = hasActiveUserFilters();
  const allowedPool = useFiltered ? getFilteredHubs() : store.hubs;
  const allowedSet = useFiltered ? new Set(allowedPool.map(h => h.id)) : null;

  const ids = new Set();

  // 1. Bidirectional curated neighbors
  if (sourceNode?.id) {
    for (const nid of curatedAdj.get(sourceNode.id) || []) {
      if (!allowedSet || allowedSet.has(nid)) ids.add(nid);
    }
    // 2. Semantic posting-list neighbors from top concepts
    for (const term of hubTopTerms.get(sourceNode.id) || []) {
      for (const hid of postingLists.get(term) || []) {
        if (!allowedSet || allowedSet.has(hid)) ids.add(hid);
        if (ids.size >= 420) break;
      }
      if (ids.size >= 420) break;
    }
  }

  // 3. Curated STEM & flagship pool + high-impact indexed hubs for serendipity & hidden gems
  for (const h of allowedPool) {
    if (isHubCurated(h) || (h.impactScore || 0) >= 62) {
      ids.add(h.id);
    }
    if (ids.size >= 750) break;
  }

  // Ensure narrow filters still have all allowed hubs
  if (ids.size < 25) {
    for (const h of allowedPool) ids.add(h.id);
  }

  const out = [];
  for (const id of ids) {
    if (sourceNode && id === sourceNode.id) continue;
    const h = store.hubsById.get(id);
    if (h) out.push(h);
  }
  return out;
}

function softmaxSample(scored, topK = 8, temperature = 0.22) {
  if (!scored.length) return null;
  const slice = scored.slice(0, Math.min(topK, scored.length));
  const maxS = slice[0].score;
  let sum = 0;
  const weights = slice.map(item => {
    const w = Math.exp((item.score - maxS) / Math.max(0.05, temperature));
    sum += w;
    return w;
  });
  let r = Math.random() * sum;
  for (let i = 0; i < slice.length; i++) {
    r -= weights[i];
    if (r <= 0) return slice[i];
  }
  return slice[0];
}

function formatBridgeReason(from, to, shared, beat, isCuratedEdge) {
  const term = shared?.[0];
  const discLabel = DISCIPLINE_SHORT[to.discipline] || BRANCH_SHORT_LABELS[to.branch] || "STEM";
  const destPlace = to.country || to.city || "";
  const fromKind = from ? getEntityKind(from) : "";
  const toKind = getEntityKind(to);

  if (from && to.discipline && from.discipline && to.discipline !== from.discipline) {
    if (term) return `${term} · ${discLabel}`;
    return `Cross-STEM · ${discLabel}`;
  }
  if (from && fromKind !== toKind && toKind === "startup") {
    return term ? `Deep-Tech · ${term}` : `Deep-Tech · ${destPlace}`;
  }
  if (term) {
    return destPlace ? `${term} · ${destPlace}` : term;
  }
  if (isCuratedEdge) {
    return destPlace ? `Connected · ${destPlace}` : "Connected frontier";
  }
  if (beat === "surprise") {
    return destPlace ? `${discLabel} · ${destPlace}` : discLabel;
  }
  return destPlace ? `${BRANCH_SHORT_LABELS[to.branch] || discLabel} · ${destPlace}` : discLabel;
}

function scoreCandidate(from, cand, beat) {
  const vecA = from ? hubVectors.get(from.id) : null;
  const vecB = hubVectors.get(cand.id);
  const { sim, shared } = from ? cosineWithTopShared(vecA, vecB) : { sim: 0, shared: [] };
  const isCuratedEdge = Boolean(from && curatedAdj.get(from.id)?.has(cand.id));

  const sameDisc = from && cand.discipline === from.discipline;
  const sameBranch = from && cand.branch === from.branch;
  const diffCountry = !from || (cand.country && from.country && cand.country !== from.country);
  const fromKind = from ? getEntityKind(from) : "";
  const candKind = getEntityKind(cand);

  let score = 0;

  // 1. Semantic concept affinity & bidirectional curated graph
  score += sim * 2.6;
  if (isCuratedEdge) score += beat === "pivot" ? 0.35 : 0.72;

  // 2. Beat rhythm (Deepen vs Cross-STEM Pivot)
  if (beat === "pivot") {
    if (!sameDisc) {
      score += 0.58 + (sim > 0.04 ? 0.45 : 0);
    } else if (fromKind !== candKind) {
      score += 0.42;
    } else {
      score -= 0.18;
    }
  } else {
    if (sameBranch) score += 0.36;
    else if (sameDisc) score += 0.22;
    if (fromKind !== candKind) score += 0.12;
  }

  // 3. Geographic diversity & era closeness
  if (diffCountry) {
    score += 0.22;
    if (from) {
      const km = haversineKm(from.lat, from.lng, cand.lat, cand.lng);
      if (km > 1800) score += 0.10;
    }
  } else {
    score -= 0.10;
  }
  if (from?.foundedYear && cand.foundedYear && Math.abs(from.foundedYear - cand.foundedYear) <= 12) {
    score += 0.08;
  }

  // 4. ARWU Impact + hidden-gem balance (so curated flagships shine AND 5,100+ catalog enters)
  const impactNorm = Math.min(1, Math.max(0, (cand.impactScore || 45) / 100));
  score += impactNorm * 0.48;
  if (isHubCurated(cand)) score += 0.22;
  else if ((cand.impactScore || 0) >= 65) score += 0.14; // surface high-impact indexed gems

  // 5. Session anti-echo penalties
  if (session.visitedSet.has(cand.id)) score -= 2.4;
  if (cand.country && session.recentCountries.includes(cand.country)) score -= 0.22;
  if (cand.discipline && session.recentDisciplines.filter(d => d === cand.discipline).length >= 2) {
    score -= 0.24;
  }

  return { node: cand, score, sim, shared, isCuratedEdge };
}

/**
 * Record a visited node in the session memory (called on selectHubNode / selectSpaceMission).
 * If `pushWalk` is true (user clicked Next / Surprise / Keep Exploring), appends to live walk path.
 */
export function recordRabbitVisit(node, { pushWalk = false, reason = "" } = {}) {
  if (!node?.id) return;
  const id = node.id;
  if (!session.visitedSet.has(id)) {
    session.visited.push(id);
    session.visitedSet.add(id);
    if (session.visited.length > 48) {
      const old = session.visited.shift();
      session.visitedSet.delete(old);
    }
  }
  if (node.country) {
    session.recentCountries.push(node.country);
    if (session.recentCountries.length > 6) session.recentCountries.shift();
  }
  if (node.discipline) {
    session.recentDisciplines.push(node.discipline);
    if (session.recentDisciplines.length > 6) session.recentDisciplines.shift();
  }

  if (pushWalk && node.lat != null && node.lng != null) {
    // Truncate forward redo stack if user stepped back then branched
    if (session.walkCursor >= 0 && session.walkCursor < session.walkHistory.length - 1) {
      session.walkHistory = session.walkHistory.slice(0, session.walkCursor + 1);
    }
    const last = session.walkHistory[session.walkHistory.length - 1];
    if (!last || last.id !== id) {
      session.walkHistory.push({
        id,
        kind: "hub",
        title: node.name,
        city: node.city || node.country || "",
        lat: node.lat,
        lng: node.lng,
        reason
      });
      if (session.walkHistory.length > 24) session.walkHistory.shift();
      session.walkCursor = session.walkHistory.length - 1;
    }
    session.hopCount++;
    syncStoreRabbitPath();
  }
}

export function clearFreeRoamWalk() {
  session.walkHistory = [];
  session.walkCursor = -1;
  session.hopCount = 0;
  store.state.rabbitPath = [];
}

function syncStoreRabbitPath() {
  if (session.walkHistory.length < 2) {
    store.state.rabbitPath = [];
    return;
  }
  store.state.rabbitPath = session.walkHistory
    .slice(0, session.walkCursor + 1)
    .map(s => ({ id: s.id, lat: s.lat, lng: s.lng }));
}

export function getFreeRoamState() {
  return {
    history: session.walkHistory,
    cursor: session.walkCursor,
    canGoBack: session.walkCursor > 0,
    current: session.walkCursor >= 0 ? session.walkHistory[session.walkCursor] : null
  };
}

export function stepFreeRoamBack() {
  if (session.walkCursor <= 0) return null;
  session.walkCursor--;
  syncStoreRabbitPath();
  return session.walkHistory[session.walkCursor] || null;
}

/**
 * Pick the next Rabbit Hole destination:
 * - mode: "walk" (contextual from currentNode, with Deepen → Deepen → Pivot rhythm)
 * - mode: "surprise" (cold leap to a fresh unvisited discipline & region)
 */
export function pickNextRabbitHop(currentNode = null, { mode = "walk" } = {}) {
  ensureSemanticIndex();

  // Seed walk history with current node if user starts walking from an open card
  if (mode === "walk" && currentNode && session.walkHistory.length === 0 && currentNode.lat != null) {
    session.walkHistory.push({
      id: currentNode.id,
      kind: "hub",
      title: currentNode.name,
      city: currentNode.city || currentNode.country || "",
      lat: currentNode.lat,
      lng: currentNode.lng,
      reason: ""
    });
    session.walkCursor = 0;
  }

  if (mode === "surprise" || !currentNode) {
    const pool = hasActiveUserFilters() ? getFilteredHubs() : store.hubs;
    const fresh = pool.filter(h => !session.visitedSet.has(h.id) && (!currentNode || h.id !== currentNode.id));
    const source = fresh.length ? fresh : pool;
    const scored = source
      .filter(h => isHubCurated(h) || (h.impactScore || 0) >= 58 || source.length < 40)
      .map(h => {
        let s = ((h.impactScore || 50) / 100) * 0.55;
        if (isHubCurated(h)) s += 0.28;
        if (h.discipline && !session.recentDisciplines.includes(h.discipline)) s += 0.40;
        if (h.country && !session.recentCountries.includes(h.country)) s += 0.30;
        if (currentNode && h.lat != null && currentNode.lat != null) {
          if (haversineKm(currentNode.lat, currentNode.lng, h.lat, h.lng) > 2500) s += 0.16;
        }
        return { node: h, score: s, shared: [], isCuratedEdge: false };
      })
      .sort((a, b) => b.score - a.score);

    const pick = softmaxSample(scored, 24, 0.32) || scored[0];
    if (!pick) return null;
    const reason = formatBridgeReason(null, pick.node, [], "surprise", false);
    return { node: pick.node, reason, beat: "surprise" };
  }

  // Contextual curiosity walk with Deepen → Deepen → Cross-STEM Pivot cadence
  const beat = (session.hopCount > 0 && session.hopCount % 3 === 2) ? "pivot" : "deepen";
  const candidates = getCandidateHubs(currentNode);
  const scored = candidates
    .map(c => scoreCandidate(currentNode, c, beat))
    .sort((a, b) => b.score - a.score);

  const pick = softmaxSample(scored, 8, 0.24) || scored[0];
  if (!pick) return null;
  const reason = formatBridgeReason(currentNode, pick.node, pick.shared, beat, pick.isCuratedEdge);
  return { node: pick.node, reason, beat };
}

/**
 * Pick contextual next Space Mission when in 1 Light-Day view (prefers related zone/science + unvisited).
 */
export function pickNextSpaceHop(currentMission = null) {
  ensureSemanticIndex();
  const all = store.spaceMissions || [];
  if (!all.length) return null;
  const fresh = all.filter(m => !session.visitedSet.has(`sp-${m.id}`) && (!currentMission || m.id !== currentMission.id));
  const pool = fresh.length ? fresh : all.filter(m => !currentMission || m.id !== currentMission.id);
  if (!pool.length) return { mission: all[0], reason: all[0].zone || "1 Light-Day" };

  const vecA = currentMission ? spaceVectors.get(currentMission.id) : null;
  const scored = pool.map(m => {
    const { sim, shared } = vecA ? cosineWithTopShared(vecA, spaceVectors.get(m.id)) : { sim: 0, shared: [] };
    let s = sim * 2.0;
    if (currentMission && m.zone !== currentMission.zone) s += 0.25;
    return { mission: m, score: s, shared };
  }).sort((a, b) => b.score - a.score);

  const pick = softmaxSample(scored, 6, 0.30) || scored[0];
  const term = pick.shared?.[0];
  return {
    mission: pick.mission,
    reason: term ? `${term} · ${pick.mission.zone || "Space"}` : (pick.mission.zone || "1 Light-Day")
  };
}

/**
 * Generate 3 distinct, unvisited, zero-bloat Keep Exploring branches for ANY hub card:
 *   1. Deeper (closest semantic / graph peer, ideally different country)
 *   2. Cross-STEM / Spinout Pivot (shared concepts in another discipline or Lab ↔ Startup)
 *   3. Wildcard (matched Space Mission in 1 Light-Day if strongly related, else unvisited hidden gem)
 */
export function getCardRabbitBranches(node) {
  if (!node) return [];
  ensureSemanticIndex();

  const used = new Set([node.id]);
  const branches = [];
  const candidates = getCandidateHubs(node).filter(c => !session.visitedSet.has(c.id));
  const fallbackCandidates = candidates.length >= 6 ? candidates : getCandidateHubs(node);

  // 1. Deeper branch (same thread)
  const deepenScored = fallbackCandidates
    .map(c => scoreCandidate(node, c, "deepen"))
    .sort((a, b) => b.score - a.score);

  if (deepenScored[0]) {
    const d = deepenScored[0];
    used.add(d.node.id);
    branches.push({
      kind: "hub",
      id: d.node.id,
      label: d.node.name.split(" (")[0],
      tooltip: formatBridgeReason(node, d.node, d.shared, "deepen", d.isCuratedEdge)
    });
  }

  // 2. Cross-STEM / Type Pivot branch
  const pivotScored = fallbackCandidates
    .filter(c => !used.has(c.id))
    .map(c => scoreCandidate(node, c, "pivot"))
    .filter(x => x.node.discipline !== node.discipline || getEntityKind(x.node) !== getEntityKind(node))
    .sort((a, b) => b.score - a.score);

  if (pivotScored[0]) {
    const p = pivotScored[0];
    used.add(p.node.id);
    branches.push({
      kind: "hub",
      id: p.node.id,
      label: p.node.name.split(" (")[0],
      tooltip: formatBridgeReason(node, p.node, p.shared, "pivot", p.isCuratedEdge)
    });
  }

  // 3. Wildcard: strongly-linked Space Mission (Earth → 1 Light-Day bridge!) OR hidden gem hub
  const vecA = hubVectors.get(node.id);
  let bestSpace = null;
  if (vecA && (store.spaceMissions || []).length) {
    for (const m of store.spaceMissions) {
      if (session.visitedSet.has(`sp-${m.id}`)) continue;
      const { sim, shared } = cosineWithTopShared(vecA, spaceVectors.get(m.id));
      let s = sim;
      if (node.branch === "astro" || node.branch === "applied") s += 0.06;
      if (!bestSpace || s > bestSpace.score) bestSpace = { mission: m, score: s, shared };
    }
  }

  if (bestSpace && bestSpace.score >= 0.14) {
    const m = bestSpace.mission;
    const term = bestSpace.shared?.[0];
    branches.push({
      kind: "space",
      id: m.id,
      label: m.name.split(" (")[0],
      tooltip: term ? `1 Light-Day · ${term}` : `1 Light-Day · ${m.zone || "Space Mission"}`
    });
  } else {
    // Unvisited high-impact hidden gem (preferring non-flagship indexed leader or distant region)
    const gem = deepenScored.find(x =>
      !used.has(x.node.id) &&
      (!isHubCurated(x.node) || (x.node.country && x.node.country !== node.country))
    ) || deepenScored.find(x => !used.has(x.node.id));
    if (gem) {
      used.add(gem.node.id);
      branches.push({
        kind: "hub",
        id: gem.node.id,
        label: gem.node.name.split(" (")[0],
        tooltip: formatBridgeReason(node, gem.node, gem.shared, "deepen", gem.isCuratedEdge)
      });
    }
  }

  return branches.slice(0, 3);
}
