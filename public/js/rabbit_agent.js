/**
 * World of Science & STEM — Deep Rabbit-Hole Research Agent
 * Curates an interconnected chain of verified official nodes (institutions, historical milestones,
 * space missions, open references, landmark peer-reviewed papers, and Wikipedia primary facts)
 * for any query — focused strictly on official links, fun facts, and curiosity hops (never bloated essays).
 */

import { proxyUrl, formatYear } from "./config.js";
import { store, universalSearch } from "./data_store.js";

function cleanExtract(text, maxLen = 210) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastPeriod = cut.lastIndexOf(".");
  if (lastPeriod > maxLen * 0.55) return cut.slice(0, lastPeriod + 1);
  return cut.replace(/\s+\S*$/, "").trim() + "…";
}

async function fetchJsonQuiet(url, timeoutMs = 6500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Search Wikipedia safely (always HTTP 200 via MediaWiki query API — zero 404s) and return
 * official summary + thumbnail for the top matching encyclopedic concept.
 */
async function fetchWikiConceptNode(query) {
  const searchUrl = proxyUrl(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&format=json&origin=*`
  );
  const searchData = await fetchJsonQuiet(searchUrl);
  const hit = searchData?.query?.search?.[0];
  if (!hit?.title) return null;

  const slug = encodeURIComponent(hit.title.replace(/ /g, "_"));
  const sumUrl = proxyUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
  const sum = await fetchJsonQuiet(sumUrl);
  if (!sum || sum.type === "disambiguation" || !sum.extract) return null;

  return {
    id: `agent-wiki-${slug}`,
    kind: "reference",
    badge: "Primary Reference · Wikipedia",
    title: sum.title || hit.title,
    subtitle: sum.description || "Encyclopedic concept overview",
    funFact: cleanExtract(sum.extract, 230),
    officialUrl: sum.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${slug}`,
    wikiUrl: sum.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${slug}`,
    image: sum.thumbnail?.source || null
  };
}

/**
 * Fetch top 2 landmark peer-reviewed papers from OpenAlex (sorted by citations) with official DOI links.
 */
async function fetchLandmarkPapers(query) {
  const oaUrl = proxyUrl(
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&sort=cited_by_count:desc&per-page=3&select=id,title,publication_year,cited_by_count,doi,primary_location,authorships`
  );
  const data = await fetchJsonQuiet(oaUrl);
  const works = data?.results || [];
  const nodes = [];
  for (const w of works) {
    if (!w.title) continue;
    const officialUrl =
      w.primary_location?.landing_page_url ||
      (w.doi ? (w.doi.startsWith("http") ? w.doi : `https://doi.org/${w.doi}`) : "") ||
      w.id;
    if (!officialUrl) continue;
    const firstAuthor = w.authorships?.[0]?.author?.display_name || "Research Collaboration";
    const authorSuffix = (w.authorships?.length || 0) > 1 ? " et al." : "";
    const venue = w.primary_location?.source?.display_name || "Peer-Reviewed Journal";
    nodes.push({
      id: `agent-paper-${String(w.id).split("/").pop()}`,
      kind: "paper",
      badge: `Landmark Paper · ${w.publication_year || ""}`.trim(),
      title: w.title,
      subtitle: `${firstAuthor}${authorSuffix} · ${venue}`,
      funFact: `Cited ${(w.cited_by_count || 0).toLocaleString("en-US")} times in OpenAlex — a foundational reference node for diving deeper into ${query}.`,
      officialUrl,
      doiUrl: w.doi || ""
    });
    if (nodes.length >= 2) break;
  }
  return nodes;
}

/**
 * Curate a structured, official-sources-only Rabbit Hole Trail for any topic or question.
 */
export async function curateRabbitHoleNodes(rawQuery) {
  const query = String(rawQuery || "").trim();
  if (!query) return { query: "", nodes: [], trailStops: [], matchedTrails: [] };

  const local = universalSearch(query, 8);

  // Fire live official reference & landmark paper lookups in parallel (non-blocking if offline)
  const [wikiNode, papers] = await Promise.all([
    fetchWikiConceptNode(query),
    fetchLandmarkPapers(query)
  ]);

  const nodes = [];
  const trailStops = [];
  const seenUrls = new Set();

  // 1. Primary Encyclopedic Concept Hook (fun fact + official Wikipedia entry)
  if (wikiNode) {
    nodes.push(wikiNode);
    seenUrls.add(wikiNode.officialUrl);
  }

  // 2. Top Verified STEM Hubs (sorted by ARWU-inspired Impact Score + query match)
  const topHubs = (local.hubs || []).slice(0, 4);
  for (const h of topHubs) {
    const funFact = h.nobel
      ? `${h.nobel} ${h.summary ? "— " + cleanExtract(h.summary, 140) : ""}`
      : cleanExtract(h.summary, 200);
    nodes.push({
      id: `agent-hub-${h.id}`,
      kind: "hub",
      hubId: h.id,
      badge: `${h.discipline ? h.discipline.toUpperCase().replace("_", " / ") : "STEM"} · Impact ${h.impactScore || 50}`,
      title: h.name,
      subtitle: `${h.city}${h.foundedYear ? " · Est. " + formatYear(h.foundedYear) : ""}`,
      funFact,
      officialUrl: h.url || h.wiki || "",
      wikiUrl: h.wiki || "",
      bridge: `Official ${h.entityType || "research"} hub active in ${h.branch || "STEM"}`
    });
    trailStops.push({
      hubId: h.id,
      title: h.name,
      bridge: cleanExtract(h.nobel || h.summary, 110)
    });
    if (h.url) seenUrls.add(h.url);
  }

  // 3. Relevant Historical Milestones (origin story hop!)
  for (const ev of (local.events || []).slice(0, 2)) {
    nodes.push({
      id: `agent-ev-${ev.id}`,
      kind: "timeline",
      year: ev.year,
      eventId: ev.id,
      badge: `Origin Milestone · ${formatYear(ev.year)}`,
      title: ev.title,
      subtitle: `${ev.figure ? ev.figure + " · " : ""}${ev.location}`,
      funFact: cleanExtract(ev.summary, 210),
      officialUrl: ev.officialUrl || ev.wikiUrl || "",
      wikiUrl: ev.wikiUrl || ""
    });
  }

  // 4. Relevant Space Mission (if applicable)
  for (const m of (local.missions || []).slice(0, 1)) {
    nodes.push({
      id: `agent-sp-${m.id}`,
      kind: "space",
      missionId: m.id,
      badge: `Space Frontier · ${m.lightTimeLabel}`,
      title: m.name,
      subtitle: `${m.agency} · ${m.body}`,
      funFact: cleanExtract(m.physicsDiscoveries || m.summary, 210),
      officialUrl: m.officialUrl || m.wikiUrl || "",
      wikiUrl: m.wikiUrl || ""
    });
  }

  // 5. Verified Open Textbooks / Datasets from matching STEM Subdomains
  for (const sub of (local.subdomains || []).slice(0, 2)) {
    for (const mat of (sub.materials || []).slice(0, 1)) {
      if (!mat.url || seenUrls.has(mat.url)) continue;
      seenUrls.add(mat.url);
      nodes.push({
        id: `agent-mat-${sub.id}-${nodes.length}`,
        kind: "material",
        badge: `Open ${mat.type || "Resource"} · ${sub.domainName}`,
        title: mat.title,
        subtitle: `${mat.provider || "Official Open Archive"} · ${sub.name}`,
        funFact: cleanExtract(sub.summary, 180),
        officialUrl: mat.url
      });
    }
  }

  // 6. Live Highly-Cited Landmark Papers from OpenAlex (official DOI links)
  for (const p of papers) {
    if (!seenUrls.has(p.officialUrl)) {
      seenUrls.add(p.officialUrl);
      nodes.push(p);
    }
  }

  // 7. Also surface any pre-curated Rabbit Hole Trails matching the query
  const qLow = query.toLowerCase();
  const matchedTrails = (store.rabbitTrails || []).filter(t =>
    `${t.title} ${t.tagline} ${(t.disciplines || []).join(" ")} ${(t.stops || []).map(s => s.title + " " + s.bridge).join(" ")}`
      .toLowerCase()
      .includes(qLow)
  );

  return {
    query,
    nodes: nodes.slice(0, 9),
    trailStops,
    matchedTrails,
    curatedAt: new Date().toISOString()
  };
}
