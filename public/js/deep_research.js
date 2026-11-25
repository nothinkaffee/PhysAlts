/**
 * PhysALT — Agentic Discovery, arXiv / alphaXiv & Gemini Deep Research Engine
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
import { getShanghaiRecord, getHubCollaborations } from "./shanghai_engine.js";

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

/**
 * Queries arXiv preprints 100% free & CORS-safe directly from the browser via DataCite's
 * official 10.48550/arXiv DOI registry + InspireHEP (for physics/astro/quantum), returning
 * unified paper cards with direct arXiv, PDF, and alphaXiv links.
 */
export async function fetchArxivAlphaXivPapers(rawQuery, { limit = 6, signal } = {}) {
  const query = String(rawQuery || "").trim();
  if (!query) return [];

  const [dcData, hepData] = await Promise.all([
    fetchJsonSafe(
      `https://api.datacite.org/dois?prefix=10.48550&query=${encodeURIComponent(query)}&page[size]=${Math.min(limit + 2, 10)}&sort=-published`,
      { signal },
      8500
    ),
    fetchJsonSafe(
      `https://inspirehep.net/api/literature?q=${encodeURIComponent(query)}&size=${Math.min(limit, 5)}&sort=mostrecent`,
      { signal },
      7500
    )
  ]);

  const papers = [];
  const seenIds = new Set();

  // 1. DataCite official arXiv DOI stream (all STEM fields: cs, physics, math, q-bio, stat, eess)
  for (const item of dcData?.data || []) {
    const attr = item?.attributes || {};
    const arxivIdent =
      (attr.identifiers || []).find((i) => String(i.identifierType || "").toLowerCase() === "arxiv")?.identifier ||
      attr.doi ||
      item.id;
    const links = buildArxivLinks(arxivIdent);
    if (!links || seenIds.has(links.arxivId)) continue;
    const title = (attr.titles?.[0]?.title || "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    seenIds.add(links.arxivId);

    const creators = (attr.creators || []).map((c) => c.name || [c.givenName, c.familyName].filter(Boolean).join(" ")).filter(Boolean);
    const authorLine =
      creators.length > 2 ? `${creators[0]}, ${creators[1]} et al.` : creators.join(", ") || "arXiv Authors";
    const abstractRaw = (attr.descriptions || []).find((d) => d.description)?.description || "";
    const category = (attr.subjects || []).map((s) => s.subject).filter(Boolean)[0] || "arXiv Preprint";

    papers.push({
      ...links,
      title,
      authors: authorLine,
      year: attr.publicationYear || "",
      category: String(category).slice(0, 60),
      abstract: String(abstractRaw).replace(/\s+/g, " ").trim().slice(0, 220),
      source: "arXiv"
    });
  }

  // 2. InspireHEP supplement (rich physics, astrophysics, particle & quantum metadata + citations)
  for (const hit of hepData?.hits?.hits || []) {
    const m = hit?.metadata || {};
    const eprint = m.arxiv_eprints?.[0]?.value;
    const links = buildArxivLinks(eprint);
    if (!links || seenIds.has(links.arxivId)) continue;
    const title = (m.titles?.[0]?.title || "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    seenIds.add(links.arxivId);

    const authors = (m.authors || []).slice(0, 2).map((a) => a.full_name).filter(Boolean);
    const authorLine =
      (m.authors?.length || 0) > 2 ? `${authors.join(", ")} et al.` : authors.join(", ") || "Collaboration";
    const year = String(m.earliest_date || "").slice(0, 4);
    const category = m.arxiv_eprints?.[0]?.categories?.[0] || "Physics / HEP";
    const abstractRaw = m.abstracts?.[0]?.value || "";
    const cites = Number(m.citation_count) || 0;

    papers.push({
      ...links,
      title,
      authors: authorLine,
      year,
      category,
      citations: cites,
      abstract: String(abstractRaw).replace(/\s+/g, " ").trim().slice(0, 220),
      source: "INSPIRE / arXiv"
    });
  }

  return papers.slice(0, limit);
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
    if (sr.arwu?.rank) lines.push(`ShanghaiRanking ARWU 2026: #${sr.arwu.rank} (Score ${sr.arwu.score || "—"})`);
    const topSubjs = Object.entries(sr.subjects || {})
      .sort((a, b) => (a[1].rankNum || 9999) - (b[1].rankNum || 9999))
      .slice(0, 5)
      .map(([code, s]) => `${code} #${s.rank}`);
    if (topSubjs.length) lines.push(`Top GRAS 2026 Subjects: ${topSubjs.join(", ")}`);
  }

  const collabs = getHubCollaborations(hubContext.id, store.byId) || [];
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
    `I am exploring this topic in PhysALT (a global 3D STEM & research atlas) and want a deep, up-to-date, cited research dossier.`
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
      `Recent 2025–2026 arXiv papers, active projects & spinouts connected to ${n}`,
      `Compare ${n} with top global peer labs and PhD/research programs`,
      `Discover lesser-known research facilities and startups near ${n}`
    ];
  }
  return [
    "Photonic & neutral-atom quantum computing labs and latest arXiv breakthroughs",
    "EUV semiconductor lithography & GaN wafer research collaborations in 2026",
    "Off-grid Arctic, Svalbard, and Antarctic climate & neutrino observatories"
  ];
}

// ---------------------------------------------------------------------------
// Helpers: Hub Sanitization & Deduplication Against Existing 6,926 Atlas Hubs
// ---------------------------------------------------------------------------

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
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

  const existing = store.hubs.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );

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

  let url = String(raw.url || "").trim();
  if (url && !/^https?:\/\//i.test(url)) url = "";

  return {
    id: existing ? existing.id : `disc_${slugify(name)}_${Math.abs(Math.round(lat * 100))}`,
    alreadyInAtlas: Boolean(existing),
    name,
    city: String(raw.city || raw.country || "Discovered Location").trim(),
    country: String(raw.country || "").trim(),
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    group,
    entityType,
    discipline,
    branch: String(raw.branch || "Discovered via Research Agent").trim(),
    url,
    wiki: String(raw.wiki || "").trim(),
    summary: String(raw.summary || `Discovered via PhysALT ${sourceTag} search.`).trim().slice(0, 320),
    foundedYear: Number.isFinite(Number(raw.foundedYear)) ? Number(raw.foundedYear) : null,
    tier: "custom",
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
//   ROR v2 (110k+ geocoded orgs) + arXiv/alphaXiv (DataCite + InspireHEP) + OpenAlex + Wikipedia
// ---------------------------------------------------------------------------

export async function runOpenAgenticDiscovery(rawQuery, { hubContext = null, onProgress, signal } = {}) {
  const query = String(rawQuery || "").trim();
  if (!query) throw new Error("Please enter a research question or topic.");

  const searchTerm = hubContext ? `${hubContext.name} ${query}` : query;
  onProgress?.("Searching arXiv / alphaXiv, ROR v2 Registry, OpenAlex & Wikipedia…");

  const local = universalSearch(query, 8);

  const [rorData, arxivPapers, oaInst, oaWorks, wikiSearch] = await Promise.all([
    fetchJsonSafe(
      `https://api.ror.org/v2/organizations?query=${encodeURIComponent(query)}`,
      { signal },
      8500
    ),
    fetchArxivAlphaXivPapers(searchTerm, { limit: 6, signal }),
    fetchJsonSafe(
      proxyUrl(
        `https://api.openalex.org/institutions?search=${encodeURIComponent(query)}&per-page=8&sort=cited_by_count:desc`
      ),
      { signal },
      7500
    ),
    fetchJsonSafe(
      proxyUrl(
        `https://api.openalex.org/works?search=${encodeURIComponent(searchTerm)}&sort=cited_by_count:desc&per-page=4&select=id,title,publication_year,cited_by_count,doi,primary_location,authorships`
      ),
      { signal },
      7500
    ),
    fetchJsonSafe(
      proxyUrl(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&format=json&origin=*`
      ),
      { signal },
      7000
    )
  ]);

  let wikiSummary = null;
  const topWikiTitle = wikiSearch?.query?.search?.[0]?.title;
  if (topWikiTitle) {
    const slug = encodeURIComponent(topWikiTitle.replace(/ /g, "_"));
    wikiSummary = await fetchJsonSafe(
      proxyUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`),
      { signal },
      6500
    );
  }

  // Merge geocoded institutions from ROR v2 (100% reliable, zero rate-limit) + OpenAlex
  const discoveredHubs = [];
  const seenNames = new Set();

  for (const item of (rorData?.items || []).slice(0, 8)) {
    const loc = item?.locations?.[0]?.geonames_details;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    const displayName =
      (item.names || []).find((n) => (n.types || []).includes("ror_display"))?.value ||
      item.names?.[0]?.value;
    if (!displayName) continue;
    const primaryType = (item.types || [])[0] || "facility";
    const website = (item.links || []).find((l) => l.type === "website")?.value || item.links?.[0]?.value || item.id;
    const cityLabel = [loc.name, loc.country_name].filter(Boolean).join(", ");
    const clean = sanitizeDiscoveredHub(
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
    );
    if (clean && !seenNames.has(clean.name.toLowerCase())) {
      seenNames.add(clean.name.toLowerCase());
      discoveredHubs.push(clean);
    }
  }

  for (const inst of oaInst?.results || []) {
    const geo = inst?.geo;
    if (!geo || !Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) continue;
    const cityLabel = [geo.city, geo.region, geo.country].filter(Boolean).join(", ");
    const clean = sanitizeDiscoveredHub(
      {
        name: inst.display_name,
        city: cityLabel || geo.country || "Research Center",
        country: geo.country || "",
        lat: geo.latitude,
        lng: geo.longitude,
        entityType: inst.type || "lab",
        discipline: hubContext?.discipline || "physics",
        branch: `${inst.type || "research"} · ${(inst.works_count || 0).toLocaleString()} works`,
        url: inst.homepage_url || inst.ror || "",
        summary: `${inst.display_name} (${cityLabel || geo.country || "Global"}) — ${(inst.works_count || 0).toLocaleString()} indexed works and ${(inst.cited_by_count || 0).toLocaleString()} citations in OpenAlex.`
      },
      "OpenAlex"
    );
    if (clean && !seenNames.has(clean.name.toLowerCase())) {
      seenNames.add(clean.name.toLowerCase());
      discoveredHubs.push(clean);
    }
  }

  // Verified reference sources
  const sources = [];
  const seenUrls = new Set();
  const addSource = (title, url, meta) => {
    if (!title || !url || seenUrls.has(url)) return;
    seenUrls.add(url);
    sources.push({ title, url, meta });
  };

  if (wikiSummary?.extract) {
    const wUrl = wikiSummary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topWikiTitle)}`;
    addSource(`Wikipedia: ${wikiSummary.title}`, wUrl, "Encyclopedic Overview");
  }

  for (const w of oaWorks?.results || []) {
    if (!w?.title) continue;
    const url =
      w.primary_location?.landing_page_url ||
      (w.doi ? (w.doi.startsWith("http") ? w.doi : `https://doi.org/${w.doi}`) : "") ||
      w.id;
    const cites = (w.cited_by_count || 0).toLocaleString("en-US");
    addSource(w.title, url, `OpenAlex · ${w.publication_year || ""} · ${cites} cites`);
  }

  // Build crisp structured Markdown report
  const md = [];
  md.push(`## Open-Science Synthesis: ${query}`);
  if (hubContext) {
    md.push(`*Contextualized around **${hubContext.name}** (${hubContext.city || hubContext.country || ""}).*`);
  }
  if (wikiSummary?.extract) {
    md.push(`\n### Concept Overview\n${wikiSummary.extract}`);
  }
  if (local.hubs?.length) {
    md.push(`\n### Top Matching Institutions Already in PhysALT`);
    for (const h of local.hubs.slice(0, 5)) {
      md.push(`- **${h.name}** (${h.city || h.country}) — ${h.summary ? h.summary.slice(0, 150) : h.branch || "Verified hub"}`);
    }
  }
  if (discoveredHubs.length) {
    const newOnes = discoveredHubs.filter((h) => !h.alreadyInAtlas);
    md.push(
      `\n### Live Geocoded Institutions Discovered (${newOnes.length} new to plot on 3D globe)`
    );
    for (const h of discoveredHubs.slice(0, 6)) {
      md.push(
        `- **${h.name}** (${h.city}) — ${h.alreadyInAtlas ? "Already mapped" : "New discovery ready to plot"}`
      );
    }
  }
  if (arxivPapers.length) {
    md.push(`\n### Latest arXiv & alphaXiv Preprints (${arxivPapers.length} found)`);
    md.push(`Open any card below on **arXiv**, **alphaXiv** (AI overview + peer discussion), or direct **PDF**.`);
  }
  if (!wikiSummary?.extract && !arxivPapers.length && !discoveredHubs.length && !local.hubs?.length) {
    md.push(
      `\nNo open-registry matches returned right now. Try **Gemini Search (Fast)** or **Open in Gemini App ↗** for live web synthesis.`
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
    `You are PhysALT's scientific research agent inside an interactive 3D global STEM atlas.`,
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
    fetchArxivAlphaXivPapers(hubContext ? `${hubContext.name} ${query}` : query, { limit: 4, signal }).catch(() => [])
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
    `Produce a thorough, rigorously cited scientific research report for a user exploring PhysALT (a global 3D STEM & research atlas).`,
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
