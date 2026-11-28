/**
 * physY — Agentic Discovery, arXiv / alphaXiv & Gemini Deep Research Engine
 *
 * Three cleanly layered research engines (100% static-host & Capacitor safe):
 *   1. Open Discovery (Free, Zero Key)   — Live ROR v2 + OpenAlex Institutions (geocoded!),
 *                                          Live arXiv + alphaXiv preprints (DataCite 10.48550 + InspireHEP),
 *                                          OpenAlex Works & Wikipedia — 100% browser CORS-safe!
 *   2. Gemini Fast Search (BYOK)         — gemini-2.5-flash + Google Search Grounding + Live Globe Pin Extraction
 *   3. Gemini Deep Research (BYOK)       — Official Interactions API (deep-research-preview-04-2026 / Max)
 *                                          with async background execution, polling, thought summaries & cancel
 *   + 1-Tap Consumer Handoff             — Pre-engineered atlas brief copied for Google AI Pro / Ultra users
 *                                          running directly in gemini.google.com/app (zero API key required)
 */

import { proxyUrl } from "./config.js";
import { store, universalSearch, mergeHubs } from "./data_store.js";
import { getShanghaiRecord, getHubCollaborations, getNearbyEcosystem } from "./shanghai_engine.js";

const KEY_STORAGE = "physalts_gemini_api_key_v1";
const DISCOVERED_STORAGE = "physalts_discovered_hubs_v1";
const HISTORY_STORAGE = "physalts_research_history_v1";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const FAST_MODEL = "gemini-2.5-flash";
const DEEP_AGENT_STD = "deep-research-preview-04-2026";
const DEEP_AGENT_MAX = "deep-research-max-preview-04-2026";

// ---------------------------------------------------------------------------
// Local BYOK Key Management (stored strictly on-device, never transmitted elsewhere)
// ---------------------------------------------------------------------------

export function getGeminiKey() {
  try {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  } catch {
    return "";
  }
}

export function setGeminiKey(rawKey) {
  const clean = String(rawKey || "").trim();
  try {
    if (!clean) localStorage.removeItem(KEY_STORAGE);
    else localStorage.setItem(KEY_STORAGE, clean);
  } catch {}
  return clean;
}

export function clearGeminiKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {}
}

export function hasGeminiKey() {
  return getGeminiKey().length >= 16;
}

export function maskGeminiKey(key = getGeminiKey()) {
  if (!key || key.length < 10) return "";
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Saved Discovered Hubs (Plotted onto the 3D Globe & Persisted Locally)
// ---------------------------------------------------------------------------

export function loadSavedDiscoveredHubs() {
  try {
    const raw = localStorage.getItem(DISCOVERED_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedDiscoveredHubs(list) {
  try {
    localStorage.setItem(DISCOVERED_STORAGE, JSON.stringify((list || []).slice(0, 120)));
  } catch {}
}

export function isHubSavedLocally(hubId) {
  return loadSavedDiscoveredHubs().some((h) => h.id === hubId);
}

export function saveDiscoveredHub(hub) {
  if (!hub || !hub.id || !hub.name) return false;
  const list = loadSavedDiscoveredHubs();
  if (!list.some((h) => h.id === hub.id)) {
    list.unshift({ ...hub, savedAt: new Date().toISOString() });
    persistSavedDiscoveredHubs(list);
  }
  mergeHubs([hub], "custom");
  return true;
}

export function removeSavedDiscoveredHub(hubId) {
  const list = loadSavedDiscoveredHubs().filter((h) => h.id !== hubId);
  persistSavedDiscoveredHubs(list);
  return list.length;
}

export function hydrateSavedDiscoveredHubs() {
  const saved = loadSavedDiscoveredHubs();
  if (!saved.length) return 0;
  return mergeHubs(saved, "custom");
}

// ---------------------------------------------------------------------------
// Research Report History (Offline-Reaccessible Last 10 Reports)
// ---------------------------------------------------------------------------

export function loadResearchHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveResearchHistoryEntry(entry) {
  if (!entry || !entry.query) return;
  try {
    const prev = loadResearchHistory().filter((x) => x.id !== entry.id);
    prev.unshift({
      id: entry.id || `res-${Date.now()}`,
      query: entry.query,
      mode: entry.mode,
      hubName: entry.hubName || "",
      markdown: String(entry.markdown || "").slice(0, 45000),
      sources: (entry.sources || []).slice(0, 20),
      arxivPapers: (entry.arxivPapers || []).slice(0, 10),
      discoveredHubs: (entry.discoveredHubs || []).slice(0, 12),
      createdAt: entry.createdAt || new Date().toISOString()
    });
    localStorage.setItem(HISTORY_STORAGE, JSON.stringify(prev.slice(0, 10)));
  } catch {}
}

export function clearResearchHistory() {
  try {
    localStorage.removeItem(HISTORY_STORAGE);
  } catch {}
}

// ---------------------------------------------------------------------------
// Free CORS-Safe arXiv + alphaXiv Preprint Discovery (DataCite 10.48550 + InspireHEP)
// ---------------------------------------------------------------------------

function normalizeArxivId(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/^https?:\/\/(www\.)?(arxiv\.org\/abs\/|doi\.org\/10\.48550\/arxiv\.)/i, "")
    .replace(/^10\.48550\/arxiv\./i, "")
    .replace(/^arxiv:/i, "")
    .replace(/v\d+$/i, "")
    .trim();
}

export function buildArxivLinks(arxivId) {
  const clean = normalizeArxivId(arxivId);
  if (!clean) return null;
  return {
    arxivId: clean,
    arxivUrl: `https://arxiv.org/abs/${encodeURIComponent(clean)}`,
    pdfUrl: `https://arxiv.org/pdf/${encodeURIComponent(clean)}`,
    alphaXivUrl: `https://www.alphaxiv.org/abs/${encodeURIComponent(clean)}`
  };
}

// ---------------------------------------------------------------------------
// Smart Query Intent Extraction (prevents natural-language noise in ROR/arXiv)
// ---------------------------------------------------------------------------

const PROMPT_STOP_PHRASES = [
  /\bactive\s+projects?\b/gi,
  /\brecent\s+(?:20\d\d[–-]?20\d\d\s+)?(?:arxiv|alphaxiv)?\s*(?:papers?|preprints?|publications?)\b/gi,
  /\blatest\s+(?:arxiv|alphaxiv)?\s*(?:papers?|preprints?|breakthroughs?)\b/gi,
  /\b(?:arxiv|alphaxiv)\s*(?:papers?|preprints?|breakthroughs?)\b/gi,
  /\btop\s+global\s+peer\s+labs?\b/gi,
  /\bphd\/?research\s+programs?\b/gi,
  /\blesser-known\s+research\s+facilities\b/gi,
  /\bresearch\s+(?:facilities|programs?|overview|collaborations?|partners?)\b/gi,
  /\bconnected\s+to\b/gi,
  /\bworking\s+on\b/gi,
  /\bin\s+20\d\d\b/gi,
  /\b20\d\d[–-]20\d\d\b/gi
];

const PROMPT_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
  "is", "it", "near", "of", "on", "or", "the", "to", "with", "about", "across",
  "active", "arxiv", "alphaxiv", "breakthrough", "breakthroughs", "collaborator",
  "collaborators", "collaboration", "collaborations", "compare", "comparing",
  "discover", "discovering", "emerging", "facilities", "facility", "find",
  "global", "hub", "hubs", "institution", "institutions", "lab", "labs",
  "latest", "leading", "lesser", "list", "major", "new", "overview", "paper",
  "papers", "peer", "peers", "phd", "preprint", "preprints", "program",
  "programs", "project", "projects", "publication", "publications", "recent",
  "research", "search", "show", "spinout", "spinouts", "startup", "startups",
  "top", "universities", "university", "vs", "versus", "what", "which", "who"
]);

const PHYSICS_HINT_RE = /\b(physics|quantum|particle|collider|cern|lhc|fermilab|ligo|neutrino|icecube|fusion|tokamak|iter|plasma|astro|astronomy|cosmology|telescope|jwst|gravity|relativity|superconduct|photon|photonic|optics|laser|condensed|hadron|boson|quark|dark\s+matter|black\s+hole|math|mathematics|algebra|topology|geometry|manifold)\b/i;

function normalizeOrgKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractResearchIntent(rawQuery, hubContext = null) {
  let cleaned = String(rawQuery || "").trim();
  const hubName = String(hubContext?.name || "").trim();
  const hubNorm = normalizeOrgKey(hubName);

  for (const re of PROMPT_STOP_PHRASES) {
    cleaned = cleaned.replace(re, " ");
  }

  // Strip the hub name out of the topic remainder so we don't duplicate ("OpenAI OpenAI ...")
  let topicRemainder = cleaned;
  if (hubName) {
    const escapedHub = hubName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    topicRemainder = topicRemainder.replace(new RegExp(escapedHub, "gi"), " ");
  }

  const tokenize = (s) =>
    String(s || "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !PROMPT_STOP_WORDS.has(w.toLowerCase()));

  const topicTokens = [...new Set(tokenize(topicRemainder).map((w) => w.toLowerCase()))];
  const rawTokens = [...new Set(tokenize(cleaned).map((w) => w.toLowerCase()))];
  const hubShort = hubName
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\b(Department of Physics|Physics Department|Physics)\b/gi, "")
    .trim() || hubName;

  const isPhysicsTopic =
    PHYSICS_HINT_RE.test(cleaned) ||
    (hubContext && ["physics", "math"].includes(String(hubContext.discipline || "").toLowerCase()));

  // Core query used for papers (concise, zero duplicate entity name, zero prompt noise)
  const paperTokens = hubContext
    ? [hubShort, ...topicTokens.filter((t) => !hubNorm.includes(t)).slice(0, 3)]
    : (rawTokens.length ? rawTokens.slice(0, 4) : [String(rawQuery || "").trim()]);

  const topicPhrase = topicTokens.length ? topicTokens.slice(0, 4).join(" ") : "";
  const cleanPhrase = rawTokens.length ? rawTokens.slice(0, 4).join(" ") : String(rawQuery || "").trim();

  // Wikipedia target: exact hub page when researching a hub without extra subtopic
  const wikiTerm = hubContext && !topicTokens.length ? hubShort : cleanPhrase;

  // ROR organization lookup target: ONLY meaningful entity/topic words (never "papers"/"arxiv")
  const orgQuery = hubContext && !topicTokens.length ? hubShort : cleanPhrase;

  return {
    rawQuery: String(rawQuery || "").trim(),
    hubName,
    hubShort,
    hubNorm,
    topicTokens,
    topicPhrase,
    coreTokens: hubContext
      ? [...new Set([...tokenize(hubShort).map((w) => w.toLowerCase()), ...topicTokens])]
      : rawTokens,
    paperTokens,
    paperQuery: paperTokens.filter(Boolean).join(" ").trim(),
    wikiTerm,
    orgQuery,
    isPhysicsTopic,
    isPureHubLookup: Boolean(hubContext && topicTokens.length === 0)
  };
}

/**
 * Queries arXiv preprints 100% free & CORS-safe directly from the browser via DataCite's
 * official 10.48550/arXiv DOI registry (+ InspireHEP for physics/astro/math queries),
 * with title-scoped Lucene matching and strict client-side relevance filtering.
 */
export async function fetchArxivAlphaXivPapers(rawQuery, { limit = 6, signal, hubContext = null, isPhysics = null } = {}) {
  const intent = extractResearchIntent(rawQuery, hubContext);
  const terms = intent.paperTokens.filter(Boolean);
  if (!terms.length) return [];

  const allowHep = isPhysics !== null ? Boolean(isPhysics) : intent.isPhysicsTopic;

  // Build precise Lucene query targeting titles first (dramatically higher precision than untargeted full-text)
  const luceneTerms = terms.slice(0, 3).map((t) => {
    const safe = String(t).replace(/["\\:()]/g, " ").trim();
    return safe.includes(" ") ? `titles.title:"${safe}"` : `titles.title:${safe}`;
  });
  const titleQuery = luceneTerms.join(" AND ");
  const broadQuery = terms.slice(0, 3).map((t) => `"${String(t).replace(/"/g, "")}"`).join(" AND ");

  const [dcTitleData, dcBroadData, hepData] = await Promise.all([
    fetchJsonSafe(
      `https://api.datacite.org/dois?prefix=10.48550&query=${encodeURIComponent(titleQuery)}&page[size]=14&sort=-published`,
      { signal },
      8500
    ),
    fetchJsonSafe(
      `https://api.datacite.org/dois?prefix=10.48550&query=${encodeURIComponent(broadQuery)}&page[size]=10`,
      { signal },
      8500
    ),
    allowHep
      ? fetchJsonSafe(
          `https://inspirehep.net/api/literature?q=${encodeURIComponent(intent.paperQuery)}&size=${Math.min(limit, 5)}&sort=mostrecent`,
          { signal },
          7500
        )
      : Promise.resolve(null)
  ]);

  const matchTokens = intent.coreTokens.filter((t) => t.length >= 2);
  const scoreRelevance = (title, abstract, authors) => {
    if (!matchTokens.length) return 1;
    const tLow = String(title || "").toLowerCase();
    const aLow = String(abstract || "").toLowerCase();
    const cLow = String(authors || "").toLowerCase();
    let score = 0;
    for (const tok of matchTokens) {
      if (tLow.includes(tok)) score += 4;
      else if (aLow.includes(tok)) score += 1.5;
      else if (cLow.includes(tok)) score += 1;
    }
    return score;
  };

  const candidates = [];
  const seenIds = new Set();

  // 1. DataCite official arXiv DOI stream (title-matched first, then broad relevance supplement)
  const dcItems = [...(dcTitleData?.data || []), ...(dcBroadData?.data || [])];
  for (const item of dcItems) {
    const attr = item?.attributes || {};
    const arxivIdent =
      (attr.identifiers || []).find((i) => String(i.identifierType || "").toLowerCase() === "arxiv")?.identifier ||
      attr.doi ||
      item.id;
    const links = buildArxivLinks(arxivIdent);
    if (!links || seenIds.has(links.arxivId)) continue;
    const title = (attr.titles?.[0]?.title || "").replace(/\s+/g, " ").trim();
    if (!title) continue;

    const creators = (attr.creators || []).map((c) => c.name || [c.givenName, c.familyName].filter(Boolean).join(" ")).filter(Boolean);
    const authorLine =
      creators.length > 2 ? `${creators[0]}, ${creators[1]} et al.` : creators.join(", ") || "arXiv Authors";
    const abstractRaw = (attr.descriptions || []).find((d) => d.description)?.description || "";
    const relScore = scoreRelevance(title, abstractRaw, authorLine);
    const titleMatched = matchTokens.some((tok) => title.toLowerCase().includes(tok));
    if (relScore < 1.5) continue; // Strict relevance gate: drop off-topic noise

    seenIds.add(links.arxivId);
    const category = (attr.subjects || []).map((s) => s.subject).filter(Boolean)[0] || "arXiv Preprint";
    const yearNum = Number(attr.publicationYear) || 0;

    candidates.push({
      ...links,
      title,
      authors: authorLine,
      year: attr.publicationYear || "",
      category: String(category).slice(0, 60),
      abstract: String(abstractRaw).replace(/\s+/g, " ").trim().slice(0, 220),
      source: "arXiv",
      _titleMatched: titleMatched,
      _rank: (titleMatched ? 100 : 0) + relScore * 10 + (yearNum >= 2024 ? 5 : yearNum >= 2021 ? 2 : 0)
    });
  }

  // 2. InspireHEP supplement (only for physics/astro/quantum/math queries)
  for (const hit of hepData?.hits?.hits || []) {
    const m = hit?.metadata || {};
    const eprint = m.arxiv_eprints?.[0]?.value;
    const links = buildArxivLinks(eprint);
    if (!links || seenIds.has(links.arxivId)) continue;
    const title = (m.titles?.[0]?.title || "").replace(/\s+/g, " ").trim();
    if (!title) continue;

    const authors = (m.authors || []).slice(0, 2).map((a) => a.full_name).filter(Boolean);
    const authorLine =
      (m.authors?.length || 0) > 2 ? `${authors.join(", ")} et al.` : authors.join(", ") || "Collaboration";
    const abstractRaw = m.abstracts?.[0]?.value || "";
    const relScore = scoreRelevance(title, abstractRaw, authorLine);
    const titleMatched = matchTokens.some((tok) => title.toLowerCase().includes(tok));
    if (relScore < 1.5) continue;

    seenIds.add(links.arxivId);
    const year = String(m.earliest_date || "").slice(0, 4);
    const category = m.arxiv_eprints?.[0]?.categories?.[0] || "Physics / HEP";
    const cites = Number(m.citation_count) || 0;

    candidates.push({
      ...links,
      title,
      authors: authorLine,
      year,
      category,
      citations: cites,
      abstract: String(abstractRaw).replace(/\s+/g, " ").trim().slice(0, 220),
      source: "INSPIRE / arXiv",
      _titleMatched: titleMatched,
      _rank: (titleMatched ? 100 : 0) + relScore * 10 + (Number(year) >= 2024 ? 4 : 0) + Math.min(4, Math.log10(cites + 1))
    });
  }

  candidates.sort((a, b) => (b._rank - a._rank) || (Number(b.year || 0) - Number(a.year || 0)));
  const titleHits = candidates.filter((c) => c._titleMatched);
  const finalPool = titleHits.length >= 3 ? titleHits : candidates;
  return finalPool.slice(0, limit).map(({ _rank, _titleMatched, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Atlas Context & Prompt Engineering
// ---------------------------------------------------------------------------

export function buildAtlasContextSummary(hubContext) {
  if (!hubContext) return "";
  const lines = [
    `Focused Institution: ${hubContext.name}`,
    `Location: ${hubContext.city || ""}${hubContext.country ? `, ${hubContext.country}` : ""} (${Number(hubContext.lat).toFixed(3)}, ${Number(hubContext.lng).toFixed(3)})`,
    `Type / Discipline: ${hubContext.entityType || hubContext.group || "research"} · ${hubContext.discipline || "STEM"} · ${hubContext.branch || ""}`.trim()
  ];
  if (hubContext.foundedYear) lines.push(`Founded: ${hubContext.foundedYear}`);
  if (hubContext.url) lines.push(`Official URL: ${hubContext.url}`);
  if (hubContext.summary) lines.push(`Atlas Summary: ${hubContext.summary}`);

  const sr = getShanghaiRecord(hubContext.id);
  if (sr) {
    if (sr.arwu?.r) lines.push(`ShanghaiRanking ARWU 2026: #${sr.arwu.r}`);
    const topSubjs = Object.entries(sr.subjects || {})
      .sort((a, b) => (a[1].n || 9999) - (b[1].n || 9999))
      .slice(0, 5)
      .map(([code, s]) => `${code} #${s.r}`);
    if (topSubjs.length) lines.push(`Top GRAS 2026 Subjects: ${topSubjs.join(", ")}`);
  }

  const collabs = getHubCollaborations(hubContext.id, store.hubsById) || [];
  if (collabs.length) {
    lines.push(
      `Known Collaborations: ${collabs
        .slice(0, 6)
        .map((c) => `${c.partner?.name || c.partnerId} (${c.role})`)
        .join("; ")}`
    );
  }
  return lines.join("\n");
}

export function buildGeminiAppHandoffPrompt(query, hubContext) {
  const ctx = buildAtlasContextSummary(hubContext);
  const parts = [
    `I am exploring this topic in physY (a global 3D STEM & research atlas) and want a deep, up-to-date, cited research dossier.`
  ];
  if (ctx) {
    parts.push(`\n--- ATLAS CONTEXT ---\n${ctx}\n--- END CONTEXT ---`);
  }
  parts.push(`\nResearch Question:\n${query}`);
  parts.push(
    `\nPlease include:\n1. Key recent breakthroughs, active projects, and upcoming milestones (with verified official URLs, DOIs, and arXiv IDs).\n2. Leading labs, universities, off-grid observatories, or deep-tech companies working on this (with cities & countries).\n3. Notable research collaborations, funding programs, and open datasets or papers to read next.`
  );
  return parts.join("\n");
}

export function getSuggestedPrompts(hubContext) {
  if (hubContext) {
    const n = hubContext.name;
    return [
      `${n} recent breakthroughs & key papers`,
      `${n} research collaborations & peer labs`,
      `Facilities and startups near ${n}`
    ];
  }
  return [
    "Photonic quantum computing",
    "EUV semiconductor lithography",
    "Antarctic neutrino & climate observatories"
  ];
}

// ---------------------------------------------------------------------------
// Helpers: Hub Sanitization, Relevance Gate & Deduplication Against Atlas
// ---------------------------------------------------------------------------

const ORG_NOISE_RE = /\b(arxiv|biorxiv|medrxiv|chemrxiv|zenodo|ssrn|researchgate|osf|figshare|crossref|datacite|orcid|pubmed|papers|paper\s+mill|paper\s+mills|publishing|publisher|publishers|university\s+press|journal|journals)\b/i;

function isRelevantOrgCandidate(displayName, intent) {
  const raw = String(displayName || "").trim();
  if (!raw || raw.length < 3) return false;
  // Block preprint servers, paper companies, and journal/publisher noise
  if (ORG_NOISE_RE.test(raw)) return false;

  const normName = normalizeOrgKey(raw);
  const tokens = (intent?.coreTokens || []).filter((t) => t.length >= 2);
  if (!tokens.length) return true;

  // Require at least one meaningful core token match in the organization name (word-boundary or prefix)
  const nameWords = normName.split(/\s+/).filter(Boolean);
  let matched = 0;
  for (const tok of tokens) {
    if (nameWords.some((w) => w === tok || (tok.length >= 4 && w.startsWith(tok)) || (w.length >= 4 && tok.startsWith(w)))) {
      matched++;
    }
  }
  if (tokens.length === 1) return matched >= 1;
  return matched >= 1;
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function findMatchingAtlasHub(name, lat, lng) {
  const norm = normalizeOrgKey(name);
  if (!norm) return null;
  for (const h of store.hubs) {
    const hn = normalizeOrgKey(h.name);
    if (hn === norm) return h;
    // Match "OpenAI (United States)" -> "OpenAI", or close geo match with shared core token
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Number.isFinite(h.lat) &&
      Number.isFinite(h.lng) &&
      Math.abs(h.lat - lat) < 0.2 &&
      Math.abs(h.lng - lng) < 0.2
    ) {
      if (hn.includes(norm) || norm.includes(hn)) return h;
    }
  }
  return null;
}

function sanitizeDiscoveredHub(raw, sourceTag = "agent") {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!name || name.length < 3) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return null;

  const existing = raw.id && store.hubsById?.get?.(raw.id)
    ? store.hubsById.get(raw.id)
    : findMatchingAtlasHub(name, lat, lng);

  const entityRaw = String(raw.entityType || raw.group || "lab").toLowerCase();
  let group = "lab";
  let entityType = "lab";
  if (/uni|college|school|polytechnic|education/.test(entityRaw)) {
    group = "uni";
    entityType = "university";
  } else if (/company|startup|corp|foundry|firm|industry/.test(entityRaw)) {
    group = "company";
    entityType = "company";
  }

  const discRaw = String(raw.discipline || "physics").toLowerCase();
  const validDisc = ["physics", "ai_cs", "math", "bio_med", "chem_earth", "engineering"];
  const discipline = validDisc.includes(discRaw) ? discRaw : "physics";

  let url = String(raw.url || existing?.url || "").trim();
  if (url && !/^https?:\/\//i.test(url)) url = "";

  return {
    id: existing ? existing.id : `disc_${slugify(name)}_${Math.abs(Math.round(lat * 100))}`,
    alreadyInAtlas: Boolean(existing),
    name: existing ? existing.name : name,
    city: String(raw.city || existing?.city || raw.country || "Discovered Location").trim(),
    country: String(raw.country || existing?.country || "").trim(),
    lat: Number((existing?.lat ?? lat).toFixed(4)),
    lng: Number((existing?.lng ?? lng).toFixed(4)),
    group,
    entityType,
    discipline,
    branch: String(raw.branch || existing?.branch || "Verified Research Hub").trim(),
    url,
    wiki: String(raw.wiki || existing?.wiki || "").trim(),
    summary: String(raw.summary || existing?.summary || `Verified via physY ${sourceTag}.`).trim().slice(0, 320),
    foundedYear: Number.isFinite(Number(raw.foundedYear)) ? Number(raw.foundedYear) : (existing?.foundedYear || null),
    tier: existing?.tier || "custom",
    discoveredBy: sourceTag
  };
}

async function fetchJsonSafe(url, opts = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// ENGINE 1: Live Open-API Agentic Discovery (100% Free, Zero API Key)
//   arXiv/alphaXiv (DataCite + physics-gated InspireHEP) + Crossref + Wikipedia +
//   Verified Atlas Collaborators / Ecosystem + Strictly Filtered ROR v2
// ---------------------------------------------------------------------------

export async function runOpenAgenticDiscovery(rawQuery, { hubContext = null, onProgress, signal } = {}) {
  const query = String(rawQuery || "").trim();
  if (!query) throw new Error("Please enter a research question or topic.");

  const intent = extractResearchIntent(query, hubContext);
  onProgress?.("Searching arXiv / alphaXiv, Crossref, Wikipedia & verified registries…");

  const localQuery = intent.orgQuery || query;
  const local = universalSearch(localQuery, 8);

  // Extract direct Wikipedia slug when researching a known Atlas hub with no subtopic override
  let directWikiSlug = "";
  if (intent.isPureHubLookup && hubContext) {
    if (hubContext.wikiSlug) directWikiSlug = hubContext.wikiSlug;
    else if (hubContext.wiki && hubContext.wiki.includes("/wiki/")) {
      try {
        directWikiSlug = decodeURIComponent(hubContext.wiki.split("/wiki/")[1].split(/[?#]/)[0]);
      } catch {
        directWikiSlug = hubContext.wiki.split("/wiki/")[1].split(/[?#]/)[0];
      }
    }
  }

  const shouldQueryRor = Boolean(intent.orgQuery && intent.orgQuery.length >= 2 && intent.coreTokens.length <= 4);

  const [rorData, arxivPapers, crossrefData, directWiki, wikiSearch] = await Promise.all([
    shouldQueryRor
      ? fetchJsonSafe(
          `https://api.ror.org/v2/organizations?query=${encodeURIComponent(intent.orgQuery)}`,
          { signal },
          8500
        )
      : Promise.resolve(null),
    fetchArxivAlphaXivPapers(query, { limit: 6, signal, hubContext }),
    fetchJsonSafe(
      `https://api.crossref.org/works?query=${encodeURIComponent(intent.paperQuery || intent.orgQuery)}&rows=5&select=DOI,title,author,published,is-referenced-by-count,URL`,
      { signal },
      8000
    ),
    directWikiSlug
      ? fetchJsonSafe(
          proxyUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(directWikiSlug)}`),
          { signal },
          6500
        )
      : Promise.resolve(null),
    !directWikiSlug && intent.wikiTerm
      ? fetchJsonSafe(
          proxyUrl(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(intent.wikiTerm)}&srlimit=2&format=json&origin=*`
          ),
          { signal },
          7000
        )
      : Promise.resolve(null)
  ]);

  let wikiSummary = directWiki && directWiki.type !== "disambiguation" && directWiki.extract ? directWiki : null;
  let topWikiTitle = wikiSummary?.title || wikiSearch?.query?.search?.[0]?.title || "";
  if (!wikiSummary && topWikiTitle) {
    const slug = encodeURIComponent(topWikiTitle.replace(/ /g, "_"));
    const fetched = await fetchJsonSafe(
      proxyUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`),
      { signal },
      6500
    );
    if (fetched && fetched.type !== "disambiguation" && fetched.extract) {
      wikiSummary = fetched;
    }
  }

  // Build high-precision Related & Discovered Institutions list (zero paper-mill/stopword junk!)
  const discoveredHubs = [];
  const seenKeys = new Set();
  const pushHub = (clean) => {
    if (!clean) return;
    const key = normalizeOrgKey(clean.name);
    if (!key || seenKeys.has(key)) return;
    // Don't echo the focused hub itself back as a "discovered" card
    if (hubContext && (clean.id === hubContext.id || key === intent.hubNorm)) return;
    seenKeys.add(key);
    discoveredHubs.push(clean);
  };

  // 1. If focused on a hub: include its verified Research Collaborators first!
  const collabs = hubContext ? (getHubCollaborations(hubContext.id, store.hubsById) || []) : [];
  for (const c of collabs.slice(0, 6)) {
    const p = c.partner;
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    pushHub(
      sanitizeDiscoveredHub(
        {
          ...p,
          branch: c.role ? `Collaborator · ${c.role}` : "Verified Collaborator",
          summary: c.note || p.summary || `${p.name} — verified research collaborator with ${hubContext.name}.`
        },
        "Verified Collaborator"
      )
    );
  }

  // 2. Strictly relevance-gated ROR v2 organizations (filters out arXiv, paper mills, publishers, stopword noise)
  for (const item of (rorData?.items || []).slice(0, 10)) {
    const loc = item?.locations?.[0]?.geonames_details;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    const displayName =
      (item.names || []).find((n) => (n.types || []).includes("ror_display"))?.value ||
      item.names?.[0]?.value;
    if (!displayName || !isRelevantOrgCandidate(displayName, intent)) continue;
    const primaryType = (item.types || [])[0] || "facility";
    const website = (item.links || []).find((l) => l.type === "website")?.value || item.links?.[0]?.value || item.id;
    const cityLabel = [loc.name, loc.country_name].filter(Boolean).join(", ");
    pushHub(
      sanitizeDiscoveredHub(
        {
          name: displayName,
          city: cityLabel || loc.country_name || "Research Center",
          country: loc.country_name || "",
          lat: loc.lat,
          lng: loc.lng,
          entityType: primaryType,
          discipline: hubContext?.discipline || "physics",
          branch: `ROR Verified · ${primaryType}`,
          url: website,
          foundedYear: item.established || null,
          summary: `${displayName} (${cityLabel || loc.country_name || "Global"}) — verified Research Organization Registry (ROR) ${primaryType}${item.established ? `, established ${item.established}` : ""}.`
        },
        "ROR Registry"
      )
    );
    if (discoveredHubs.length >= 8) break;
  }

  // 3. If focused on a hub and user asked for nearby/peer labs (or few collaborators found), surface verified nearby labs!
  if (hubContext && discoveredHubs.length < 6) {
    const exclude = new Set([hubContext.id, ...discoveredHubs.map((h) => h.id)]);
    const nearby = getNearbyEcosystem(hubContext, store.hubs, { maxKm: 65, limit: 6, excludeIds: exclude }) || [];
    for (const nb of nearby) {
      const p = nb.hub || nb;
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      pushHub(
        sanitizeDiscoveredHub(
          {
            ...p,
            branch: nb.distKm != null ? `Nearby · ${nb.distKm < 1 ? "<1 km" : Math.round(nb.distKm) + " km"}` : "Nearby Lab"
          },
          "Nearby Ecosystem"
        )
      );
      if (discoveredHubs.length >= 6) break;
    }
  }

  // 4. For pure topic queries, also surface top verified Atlas institutions matching the topic
  if (!hubContext && discoveredHubs.length < 6) {
    for (const h of (local.hubs || []).slice(0, 6)) {
      if (!Number.isFinite(h.lat) || !Number.isFinite(h.lng)) continue;
      pushHub(sanitizeDiscoveredHub(h, "physY Atlas"));
      if (discoveredHubs.length >= 6) break;
    }
  }

  // Verified reference sources (Wikipedia + strictly relevant Crossref journal works)
  const sources = [];
  const seenUrls = new Set();
  const addSource = (title, url, meta) => {
    if (!title || !url || seenUrls.has(url)) return;
    seenUrls.add(url);
    sources.push({ title, url, meta });
  };

  if (hubContext?.url) {
    addSource(`${hubContext.name} — Official Site`, hubContext.url, "Official Institution");
  }
  if (wikiSummary?.extract) {
    const wUrl = wikiSummary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topWikiTitle)}`;
    addSource(`Wikipedia: ${wikiSummary.title}`, wUrl, "Encyclopedic Overview");
  }

  const crTokens = intent.coreTokens.filter((t) => t.length >= 2);
  for (const w of crossrefData?.message?.items || []) {
    const title = Array.isArray(w?.title) ? w.title[0] : w?.title;
    if (!title) continue;
    const tLow = String(title).toLowerCase();
    if (crTokens.length && !crTokens.some((tok) => tLow.includes(tok))) continue;
    const url = w.DOI ? `https://doi.org/${w.DOI}` : (w.URL || "");
    const yr = w.published?.["date-parts"]?.[0]?.[0] || "";
    const cites = Number(w["is-referenced-by-count"] || 0).toLocaleString("en-US");
    addSource(title, url, `Crossref${yr ? ` · ${yr}` : ""} · ${cites} cites`);
  }

  // Build crisp structured Markdown synthesis
  const md = [];
  md.push(`## Open-Science Synthesis: ${intent.isPureHubLookup ? hubContext.name : query}`);
  if (hubContext) {
    md.push(`*Grounded in **${hubContext.name}** (${hubContext.city || hubContext.country || ""}).*`);
  }
  if (wikiSummary?.extract) {
    md.push(`\n### Overview\n${wikiSummary.extract}`);
  } else if (hubContext?.summary) {
    md.push(`\n### Overview\n${hubContext.summary}`);
  }
  if (collabs.length) {
    md.push(`\n### Verified Research Collaborations`);
    for (const c of collabs.slice(0, 5)) {
      md.push(`- **${c.partner?.name || c.partnerId}** — ${c.note || c.role || "Verified research partner"}`);
    }
  } else if (!hubContext && local.hubs?.length) {
    md.push(`\n### Leading Institutions in physY`);
    for (const h of local.hubs.slice(0, 5)) {
      md.push(`- **${h.name}** (${h.city || h.country}) — ${h.summary ? h.summary.slice(0, 150) : h.branch || "Verified hub"}`);
    }
  }
  if (arxivPapers.length) {
    md.push(`\n### Relevant arXiv & alphaXiv Preprints (${arxivPapers.length})`);
    md.push(`Filtered strictly for **${intent.paperQuery}** — open any paper below on **alphaXiv**, **arXiv**, or **PDF**.`);
  }
  if (!wikiSummary?.extract && !hubContext?.summary && !arxivPapers.length && !discoveredHubs.length) {
    md.push(
      `\nNo direct open-registry matches found for **${query}**. Try a shorter topic keyword, **Gemini Search**, or **Gemini App ↗** for live web synthesis.`
    );
  }

  return {
    id: `open-${Date.now()}`,
    mode: "open",
    query,
    hubName: hubContext?.name || "",
    markdown: md.join("\n"),
    sources,
    arxivPapers,
    discoveredHubs,
    createdAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// ENGINE 2: Gemini Fast Search Grounding (BYOK — gemini-2.5-flash + google_search)
// ---------------------------------------------------------------------------

function extractJsonHubBlock(text) {
  const discovered = [];
  let cleanText = String(text || "");

  const fenced = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (fenced) {
    for (const block of fenced) {
      const inner = block.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
      if (!inner.includes("discovered_hubs") && !inner.startsWith("[")) continue;
      try {
        const parsed = JSON.parse(inner);
        const arr = Array.isArray(parsed) ? parsed : parsed.discovered_hubs || parsed.hubs || [];
        for (const item of arr) {
          const clean = sanitizeDiscoveredHub(item, "Gemini Search");
          if (clean) discovered.push(clean);
        }
        cleanText = cleanText.replace(block, "").trim();
      } catch {
        // Ignore malformed JSON blocks; keep prose intact
      }
    }
  }
  return { cleanText, discovered };
}

export async function runGeminiFastDiscovery(rawQuery, { hubContext = null, apiKey = getGeminiKey(), onProgress, signal } = {}) {
  const query = String(rawQuery || "").trim();
  if (!query) throw new Error("Please enter a research question or topic.");
  if (!apiKey) throw new Error("Add your Google AI Studio API key to run Gemini Search Grounding (or use Open Discovery for free).");

  onProgress?.("Running Gemini 2.5 Flash with live Google Search grounding + arXiv/alphaXiv lookup…");

  const ctx = buildAtlasContextSummary(hubContext);
  const prompt = [
    `You are physY's scientific research agent inside an interactive 3D global STEM atlas.`,
    `Use live Google Search to answer the user's question with up-to-date, factual, well-structured Markdown (headings + concise bullet points, citing real organizations, projects, and papers).`,
    ctx ? `\n--- CURRENT ATLAS CONTEXT ---\n${ctx}\n--- END CONTEXT ---` : "",
    `\nUser Question: ${query}`,
    `\nAfter your Markdown answer, append ONE fenced \`\`\`json block containing up to 6 real, verifiable research labs, universities, observatories, or deep-tech companies directly relevant to this answer (especially lesser-known or newly opened facilities) using this exact schema:`,
    `{"discovered_hubs":[{"name":"...","city":"City, Region","country":"Country","lat":0.0,"lng":0.0,"entityType":"lab|university|company","discipline":"physics|ai_cs|math|bio_med|chem_earth|engineering","branch":"Subfield","url":"https://...","summary":"1-2 sentence verified description."}]}`,
    `Only include real coordinates (never 0,0) and real official URLs.`
  ]
    .filter(Boolean)
    .join("\n");

  const [res, arxivPapers] = await Promise.all([
    fetch(`${GEMINI_API_BASE}/models/${FAST_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096
        }
      }),
      signal
    }),
    fetchArxivAlphaXivPapers(query, { limit: 4, signal, hubContext }).catch(() => [])
  ]);

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Gemini API HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const rawText = (cand?.content?.parts || [])
    .map((p) => p.text || "")
    .join("\n")
    .trim();

  if (!rawText) {
    throw new Error("Gemini returned an empty response. Try rephrasing your prompt.");
  }

  const { cleanText, discovered } = extractJsonHubBlock(rawText);

  const sources = [];
  const seenUrls = new Set();
  const chunks = cand?.groundingMetadata?.groundingChunks || [];
  for (const ch of chunks) {
    const web = ch?.web;
    if (web?.uri && !seenUrls.has(web.uri)) {
      seenUrls.add(web.uri);
      sources.push({
        title: web.title || web.uri,
        url: web.uri,
        meta: "Google Search Grounding"
      });
    }
  }

  const queries = cand?.groundingMetadata?.webSearchQueries || [];

  return {
    id: `gfast-${Date.now()}`,
    mode: "gemini_fast",
    query,
    hubName: hubContext?.name || "",
    markdown: cleanText,
    sources,
    arxivPapers,
    searchQueries: queries,
    discoveredHubs: discovered,
    createdAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// ENGINE 3: Official Gemini Deep Research Agent (Interactions API, background=true)
// ---------------------------------------------------------------------------

function extractTextFromInteraction(interaction) {
  if (!interaction) return "";
  const outputs = interaction.outputs || [];
  const texts = [];
  for (const out of outputs) {
    if (typeof out?.text === "string" && out.text.trim()) {
      texts.push(out.text.trim());
    } else if (Array.isArray(out?.content)) {
      for (const part of out.content) {
        if (typeof part?.text === "string" && part.text.trim()) texts.push(part.text.trim());
      }
    }
  }
  if (!texts.length && typeof interaction.output?.text === "string") {
    texts.push(interaction.output.text);
  }
  return texts.join("\n\n").trim();
}

function extractThoughtFromInteraction(interaction) {
  const outputs = interaction?.outputs || [];
  for (let i = outputs.length - 1; i >= 0; i--) {
    const o = outputs[i];
    if (o?.type === "thought" && o?.summary) {
      return typeof o.summary === "string" ? o.summary : o.summary?.[0]?.text || "";
    }
  }
  return "";
}

function extractUrlsFromMarkdown(md) {
  const sources = [];
  const seen = new Set();
  const re = /\[([^\]]{2,140})\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const [, title, url] = m;
    if (!seen.has(url)) {
      seen.add(url);
      sources.push({ title: title.trim(), url: url.trim(), meta: "Deep Research Citation" });
    }
  }
  return sources.slice(0, 24);
}

export async function runGeminiDeepResearch(
  rawQuery,
  { hubContext = null, apiKey = getGeminiKey(), maxMode = false, onProgress, onInteractionId, signal } = {}
) {
  const query = String(rawQuery || "").trim();
  if (!query) throw new Error("Please enter a research question or topic.");
  if (!apiKey) throw new Error("Add your Google AI Studio API key to run the Gemini Deep Research Agent.");

  const agent = maxMode ? DEEP_AGENT_MAX : DEEP_AGENT_STD;
  const ctx = buildAtlasContextSummary(hubContext);

  const inputPrompt = [
    `Produce a thorough, rigorously cited scientific research report for a user exploring physY (a global 3D STEM & research atlas).`,
    ctx ? `\n--- ATLAS CONTEXT ---\n${ctx}\n--- END CONTEXT ---` : "",
    `\nResearch Prompt:\n${query}`,
    `\nStructure the report with clear Markdown headings, inline citations [Source Title](URL), key findings, institutional comparisons, and recent 2024–2026 developments.`,
    `At the very end, if relevant physical labs, universities, observatories, or deep-tech companies were uncovered, include ONE fenced \`\`\`json block of up to 8 geocoded institutions: {"discovered_hubs":[{"name":"...","city":"...","country":"...","lat":0.0,"lng":0.0,"entityType":"lab|university|company","discipline":"physics|ai_cs|math|bio_med|chem_earth|engineering","branch":"...","url":"https://...","summary":"..."}]}.`
  ]
    .filter(Boolean)
    .join("\n");

  onProgress?.(`Starting ${maxMode ? "Gemini Deep Research Max" : "Gemini Deep Research"} agent…`, "");

  const arxivPromise = fetchArxivAlphaXivPapers(
    hubContext ? `${hubContext.name} ${query}` : query,
    { limit: 5, signal }
  ).catch(() => []);

  const createRes = await fetch(`${GEMINI_API_BASE}/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      agent,
      input: inputPrompt,
      background: true,
      agent_config: {
        type: "deep-research",
        thinking_summaries: "auto"
      }
    }),
    signal
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    const detail = errBody?.error?.message || `Interactions API HTTP ${createRes.status}`;
    throw new Error(
      `${detail}. Note: Gemini Deep Research (${agent}) requires a Paid-tier Google AI Studio API key (Google AI Pro/Ultra plans include monthly Cloud credits you can apply).`
    );
  }

  let interaction = await createRes.json();
  const interactionId = interaction?.id;
  if (!interactionId) {
    throw new Error("Interactions API did not return an interaction ID.");
  }
  onInteractionId?.(interactionId);

  const startedAt = Date.now();
  const maxWaitMs = maxMode ? 18 * 60 * 1000 : 10 * 60 * 1000;

  while (true) {
    if (signal?.aborted) {
      fetch(`${GEMINI_API_BASE}/interactions/${encodeURIComponent(interactionId)}/cancel`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey }
      }).catch(() => {});
      throw new DOMException("Research cancelled by user.", "AbortError");
    }

    const status = String(interaction?.status || "in_progress").toLowerCase();
    const thought = extractThoughtFromInteraction(interaction);
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

    if (status === "completed") break;
    if (status === "failed" || status === "cancelled" || status === "canceled") {
      throw new Error(
        interaction?.error?.message || `Deep Research stopped with status: ${status}`
      );
    }
    if (Date.now() - startedAt > maxWaitMs) {
      throw new Error("Deep Research timed out waiting for completion. Check your AI Studio logs for the full report.");
    }

    onProgress?.(
      `Deep Research agent running (${elapsedSec}s) — planning, searching & synthesizing…`,
      thought
    );

    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 4000);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Cancelled", "AbortError"));
        },
        { once: true }
      );
    });

    const pollRes = await fetch(
      `${GEMINI_API_BASE}/interactions/${encodeURIComponent(interactionId)}`,
      {
        headers: { "x-goog-api-key": apiKey },
        signal
      }
    );
    if (!pollRes.ok) {
      const errBody = await pollRes.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `Polling failed (HTTP ${pollRes.status})`);
    }
    interaction = await pollRes.json();
  }

  const rawReport = extractTextFromInteraction(interaction);
  if (!rawReport) {
    throw new Error("Deep Research completed but returned no text output.");
  }

  const { cleanText, discovered } = extractJsonHubBlock(rawReport);
  const sources = extractUrlsFromMarkdown(cleanText);
  const arxivPapers = await arxivPromise;

  return {
    id: `gdeep-${interactionId}`,
    interactionId,
    mode: maxMode ? "gemini_deep_max" : "gemini_deep",
    query,
    hubName: hubContext?.name || "",
    markdown: cleanText,
    sources,
    arxivPapers,
    discoveredHubs: discovered,
    createdAt: new Date().toISOString()
  };
}
