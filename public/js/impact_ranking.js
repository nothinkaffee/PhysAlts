/**
 * World of Science & STEM — Research Impact & Excellence Index
 * Transparent methodology inspired by ShanghaiRanking (ARWU / GRAS) extended across STEM & historical eras:
 *   1. World-Class Awards & Laureates (Nobel, Fields, Turing, Abel, Breakthrough) — up to 30 pts
 *   2. Research Citation Volume (log-scaled OpenAlex verified citations) — up to 25 pts
 *   3. Impact per Work / CNCI proxy (citations / works efficiency) — up to 20 pts
 *   4. Mega-Facility & Frontier Research Leadership (curated flagships / frontier labs) — up to 15 pts
 *   5. International & Cross-Disciplinary Collaboration (arcs & rabbit links) — up to 10 pts
 */

import { COLLABORATION_ARCS } from "./config.js";

const arcDegreeCache = new Map();
function getArcDegree(hubId) {
  if (arcDegreeCache.size === 0) {
    for (const [a, b] of COLLABORATION_ARCS) {
      arcDegreeCache.set(a, (arcDegreeCache.get(a) || 0) + 1);
      arcDegreeCache.set(b, (arcDegreeCache.get(b) || 0) + 1);
    }
  }
  return arcDegreeCache.get(hubId) || 0;
}

function parseOpenAlexMetrics(summary) {
  const s = String(summary || "");
  const m = s.match(/([\d,]+)\s+indexed\s+(?:OpenAlex\s+)?works\s*(?:and|,)\s*([\d,]+)\s+citations/i);
  if (!m) return { works: 0, citations: 0 };
  const works = Number(m[1].replace(/,/g, "")) || 0;
  const citations = Number(m[2].replace(/,/g, "")) || 0;
  return { works, citations };
}

function scoreAwards(hub) {
  const text = `${hub.nobel || ""} ${hub.awards || ""} ${hub.summary || ""}`;
  let pts = 0;

  // Explicit laureate count mentions like "30+ physics laureates", "40+ Nobel laureates", "31 Nobel laureates"
  const countMatch = text.match(/(\d+)\+?\s*(?:physics\s+)?(?:nobel|fields|turing|laureate)/i);
  if (countMatch) {
    const n = Number(countMatch[1]) || 0;
    pts = Math.max(pts, Math.min(30, 12 + Math.round(Math.log2(n + 1) * 4.2)));
  }

  // Individual prize mentions
  const nobelHits = (text.match(/nobel/gi) || []).length;
  const fieldsHits = (text.match(/fields\s+medal/gi) || []).length;
  const turingHits = (text.match(/turing\s+award/gi) || []).length;
  const abelHits = (text.match(/abel\s+prize/gi) || []).length;
  const breakthroughHits = (text.match(/breakthrough\s+prize/gi) || []).length;

  const mentionScore =
    Math.min(18, nobelHits * 9) +
    Math.min(14, fieldsHits * 10) +
    Math.min(14, turingHits * 10) +
    Math.min(10, abelHits * 8) +
    Math.min(8, breakthroughHits * 6);
  pts = Math.max(pts, Math.min(30, mentionScore));

  // Flagship national mega-facilities / frontier labs with landmark discoveries
  if (pts === 0 && (hub.tier === "flagship" || hub.tier === "stem")) {
    if (/higgs|gravitational|black hole|alphafold|crispr|transformer|genome|euv|ignition|superconduct|neutrino/i.test(text)) {
      pts = 18;
    } else {
      pts = 10;
    }
  } else if (pts === 0 && hub.tier === "deeptech") {
    pts = 8;
  }

  return Math.min(30, Math.round(pts));
}

export function computeImpactScore(hub) {
  if (!hub) return { total: 0, tierLabel: "Indexed", breakdown: { awards: 0, output: 0, cnci: 0, infra: 0, collab: 0 }, works: 0, citations: 0 };

  const parsed = parseOpenAlexMetrics(hub.summary);
  const works = Number(hub.worksCount) || parsed.works;
  const citations = Number(hub.citationsCount) || parsed.citations;

  const awards = scoreAwards(hub);

  // Citation volume (log10 scale: 1k -> ~10, 100k -> ~16, 1M -> ~20, 30M -> 25)
  let output = 0;
  if (citations > 0) {
    output = Math.min(25, Math.max(2, Math.round(((Math.log10(citations + 10) - 2) / 5.6) * 25)));
  } else if (hub.tier === "flagship" || hub.tier === "stem") {
    output = 19;
  } else if (hub.tier === "deeptech") {
    output = 16;
  } else {
    output = 8;
  }

  // Per-paper citation efficiency / CNCI proxy (50+ cites/work -> 20 pts, 25 -> 15, 10 -> 10)
  let cnci = 0;
  if (works > 0 && citations > 0) {
    const ratio = citations / works;
    cnci = Math.min(20, Math.max(3, Math.round((Math.log2(ratio + 1) / Math.log2(65)) * 20)));
  } else if (hub.tier === "flagship" || hub.tier === "stem") {
    cnci = 17;
  } else if (hub.tier === "deeptech") {
    cnci = 15;
  } else {
    cnci = 7;
  }

  // Mega-facility & frontier leadership
  let infra = 0;
  if (hub.tier === "flagship") infra = 15;
  else if (hub.tier === "stem") infra = 14;
  else if (hub.tier === "deeptech") infra = 12;
  else if (hub.group === "lab" || hub.entityType === "lab") infra = 8;
  else if (hub.entityType === "institute") infra = 7;
  else infra = 5;

  // International & cross-disciplinary collaboration
  const deg = getArcDegree(hub.id) + (Array.isArray(hub.rabbitLinks) ? hub.rabbitLinks.length : 0);
  const collab = Math.min(10, deg > 0 ? Math.min(10, 4 + deg * 2) : (hub.tier === "flagship" || hub.tier === "stem" ? 6 : 3));

  const total = Math.min(100, awards + output + cnci + infra + collab);
  const tierLabel =
    total >= 86 ? "Global Tier 1"
    : total >= 72 ? "Global Leader"
    : total >= 56 ? "Major Center"
    : total >= 40 ? "Active Hub"
    : "Indexed Hub";

  return {
    total,
    tierLabel,
    breakdown: { awards, output, cnci, infra, collab },
    works,
    citations
  };
}

/**
 * Era-adjusted impact score when exploring the chronological Timeline.
 * Highlights institutions active during a selected historical year and boosts foundational pioneers of that era.
 */
export function scoreHubForYear(hub, year) {
  const base = hub._impact?.total ?? computeImpactScore(hub).total;
  if (year == null || year >= 2025) return base;
  if (hub.foundedYear == null || hub.foundedYear > year) return 0;

  const ageAtYear = Math.max(0, year - hub.foundedYear);
  let eraBonus = 0;
  // Boost historical golden-age centers during their defining decades
  if (year <= 1940 && ["gottingen", "bohr", "cambridge", "bern", "eth", "princeton", "oxford", "solvay", "miletus"].includes(hub.id)) {
    eraBonus = 18;
  } else if (year >= 1945 && year <= 1985 && ["cern", "fermilab", "slac", "berkeley", "caltech", "mit", "princeton", "desy", "bell_labs", "mrc_lmb", "ihes"].includes(hub.id)) {
    eraBonus = 14;
  } else if (ageAtYear <= 25 && (hub.tier === "flagship" || hub.tier === "stem")) {
    eraBonus = 8;
  }
  return Math.min(100, base + eraBonus);
}

export function attachImpactScores(hubs) {
  for (const h of hubs) {
    h._impact = computeImpactScore(h);
    h.impactScore = h._impact.total;
  }
  return hubs;
}

export function sortHubsByRanking(hubs, sortBy = "impact", year = null) {
  const arr = hubs.slice();
  if (sortBy === "citations") {
    return arr.sort((a, b) => (b._impact?.citations || 0) - (a._impact?.citations || 0) || (b.impactScore || 0) - (a.impactScore || 0));
  }
  if (sortBy === "founded") {
    return arr.sort((a, b) => (a.foundedYear ?? 9999) - (b.foundedYear ?? 9999));
  }
  if (sortBy === "name") {
    return arr.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }
  // Default: ShanghaiRanking-inspired Impact Score (era-weighted if year provided)
  return arr.sort((a, b) => {
    const sa = year != null ? scoreHubForYear(a, year) : (a.impactScore ?? computeImpactScore(a).total);
    const sb = year != null ? scoreHubForYear(b, year) : (b.impactScore ?? computeImpactScore(b).total);
    return sb - sa || (b._impact?.citations || 0) - (a._impact?.citations || 0);
  });
}
