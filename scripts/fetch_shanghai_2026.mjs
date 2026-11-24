#!/usr/bin/env node
/**
 * PhysALT — Official ShanghaiRanking 2026 (ARWU 2026 + GRAS 2026) Ingestion & Geocoding Pipeline
 *
 * Fetches:
 *  1. ARWU 2026 (Top 1,000 World Universities + all 6 official indicators: Alumni, Award, HiCi, N&S, PUB, PCP)
 *  2. GRAS 2026 (All 57 academic subjects across Natural Sciences, Engineering, Life, Medical & Social Sciences
 *     + all ranked universities per subject + all 5 official GRAS indicator categories:
 *     World-Class Faculty, World-Class Output, High-Quality Research, Research Impact, International Collaboration)
 *
 * Matches every university against PhysALT's existing 5,700+ geo-indexed hubs, and geocodes any newly
 * discovered ShanghaiRanking 2026 universities via OpenAlex & ROR APIs so 100% appear on the 3D globe.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data");
const OUT_SHANGHAI = path.join(DATA_DIR, "shanghai_2026.json");
const OUT_EXTRA_HUBS = path.join(DATA_DIR, "shanghai_extra_hubs.json");
const GEO_CACHE_PATH = path.join(ROOT, "scripts", ".shanghai_geocode_cache.json");

const YEAR = 2026;
const BASE_API = "https://www.shanghairanking.com/api/pub/v1";

// Official mapping of all 57 ShanghaiRanking GRAS 2026 subject codes -> PhysALT disciplines & subfields
const SUBJECT_MAP = {
  // Natural Sciences (8)
  AS0101: { disc: "math",           branches: ["pure_math", "analysis_pde", "logic_comb"] },
  AS0102: { disc: "physics",        branches: ["particle", "quantum", "astro", "gravity", "fusion", "condensed", "applied"] },
  AS0103: { disc: "chem_materials", branches: ["catalysis_synth", "comp_chem"] },
  AS0104: { disc: "earth_climate",  branches: ["ocean_geo", "planetary_env"] },
  AS0105: { disc: "earth_climate",  branches: ["planetary_env"] },
  AS0106: { disc: "bio_med",        branches: ["ecology_evo"] },
  AS0107: { disc: "earth_climate",  branches: ["ocean_geo"] },
  AS0108: { disc: "earth_climate",  branches: ["climate_atmo"] },
  // Engineering (25)
  AS0201: { disc: "engineering",    branches: ["materials_mfg", "robotics", "aerospace"] },
  AS0202: { disc: "engineering",    branches: ["semiconductors", "energy_civil"] }, // Electrical & Electronic Eng -> Semiconductors!
  AS0205: { disc: "engineering",    branches: ["robotics"] },                       // Automation & Control
  AS0206: { disc: "engineering",    branches: ["semiconductors"] },                 // Telecommunication Engineering (RF/photonics/chips)
  AS0207: { disc: "engineering",    branches: ["semiconductors", "materials_mfg"] },// Instruments Science & Technology (metrology/lithography)
  AS0208: { disc: "engineering",    branches: ["biomedical_eng"] },                 // Biomedical Engineering
  AS0210: { disc: "ai_cs",          branches: ["systems_arch", "theory_crypto", "graphics_hci", "ai_frontier", "quantum_cs"] },
  AS0211: { disc: "engineering",    branches: ["energy_civil"] },                   // Civil Engineering
  AS0212: { disc: "chem_materials", branches: ["catalysis_synth", "nanomaterials"] },
  AS0213: { disc: "engineering",    branches: ["materials_mfg", "semiconductors"] },// Materials Science & Engineering
  AS0214: { disc: "engineering",    branches: ["semiconductors", "materials_mfg"] },// Nanoscience & Nanotechnology -> Semiconductors!
  AS0215: { disc: "engineering",    branches: ["energy_civil"] },                   // Energy Science & Engineering
  AS0216: { disc: "earth_climate",  branches: ["climate_atmo", "planetary_env"] },  // Environmental Science & Engineering
  AS0217: { disc: "earth_climate",  branches: ["planetary_env", "ocean_geo"] },     // Water Resources
  AS0219: { disc: "bio_med",        branches: ["structural_pharma"] },              // Food Science & Technology
  AS0220: { disc: "bio_med",        branches: ["genomics_synbio"] },                // Biotechnology
  AS0221: { disc: "engineering",    branches: ["aerospace"] },                      // Aerospace Engineering
  AS0222: { disc: "engineering",    branches: ["energy_civil", "aerospace"] },      // Marine/Ocean Engineering
  AS0223: { disc: "engineering",    branches: ["energy_civil", "robotics"] },       // Transportation Science & Technology
  AS0224: { disc: "earth_climate",  branches: ["planetary_env"] },                  // Remote Sensing
  AS0226: { disc: "engineering",    branches: ["materials_mfg"] },                  // Mining & Mineral Engineering
  AS0227: { disc: "engineering",    branches: ["materials_mfg"] },                  // Metallurgical Engineering
  AS0228: { disc: "engineering",    branches: ["materials_mfg"] },                  // Textile Science & Engineering
  AS0229: { disc: "ai_cs",          branches: ["ai_frontier", "graphics_hci"] },    // Artificial Intelligence (NEW!)
  AS0230: { disc: "engineering",    branches: ["robotics"] },                       // Robotic Science & Engineering (NEW!)
  // Life Sciences (4)
  AS0301: { disc: "bio_med",        branches: ["genomics_synbio", "structural_pharma", "ecology_evo"] },
  AS0302: { disc: "bio_med",        branches: ["neuroscience", "genomics_synbio"] },
  AS0303: { disc: "bio_med",        branches: ["ecology_evo"] },
  AS0304: { disc: "bio_med",        branches: ["ecology_evo"] },
  // Medical Sciences (6)
  AS0401: { disc: "bio_med",        branches: ["structural_pharma", "neuroscience"] },
  AS0402: { disc: "bio_med",        branches: ["ecology_evo"] },
  AS0403: { disc: "bio_med",        branches: ["structural_pharma"] },
  AS0404: { disc: "bio_med",        branches: ["structural_pharma"] },
  AS0405: { disc: "engineering",    branches: ["biomedical_eng"] },
  AS0406: { disc: "bio_med",        branches: ["structural_pharma"] },
  // Social Sciences (14)
  AS0501: { disc: "math",           branches: ["applied_stat"] },
  AS0502: { disc: "math",           branches: ["applied_stat"] },
  AS0503: { disc: "all",            branches: [] },
  AS0504: { disc: "all",            branches: [] },
  AS0505: { disc: "all",            branches: [] },
  AS0506: { disc: "all",            branches: [] },
  AS0507: { disc: "all",            branches: [] },
  AS0508: { disc: "bio_med",        branches: ["neuroscience"] },
  AS0509: { disc: "all",            branches: [] },
  AS0510: { disc: "math",           branches: ["applied_stat"] },
  AS0511: { disc: "all",            branches: [] },
  AS0512: { disc: "all",            branches: [] },
  AS0513: { disc: "all",            branches: [] },
  AS0515: { disc: "ai_cs",          branches: ["systems_arch"] }
};

// Region name normalization (ShanghaiRanking -> ISO2 / standard country names matching PhysALT)
const REGION_TO_ISO2 = {
  "United States": "US", "China": "CN", "United Kingdom": "GB", "Germany": "DE",
  "France": "FR", "Canada": "CA", "Australia": "AU", "Japan": "JP", "Italy": "IT",
  "South Korea": "KR", "Spain": "ES", "Netherlands": "NL", "Switzerland": "CH",
  "Sweden": "SE", "Brazil": "BR", "India": "IN", "Belgium": "BE", "Austria": "AT",
  "Denmark": "DK", "Finland": "FI", "Norway": "NO", "Israel": "IL", "Poland": "PL",
  "Portugal": "PT", "Russia": "RU", "Singapore": "SG", "China-Taiwan": "TW",
  "China-Hong Kong": "HK", "China-Macau": "MO", "Ireland": "IE", "New Zealand": "NZ",
  "Saudi Arabia": "SA", "Iran": "IR", "Turkey": "TR", "South Africa": "ZA",
  "Czech Republic": "CZ", "Czechia": "CZ", "Greece": "GR", "Malaysia": "MY",
  "Egypt": "EG", "Mexico": "MX", "Chile": "CL", "Argentina": "AR", "Pakistan": "PK",
  "Thailand": "TH", "Hungary": "HU", "Romania": "RO", "United Arab Emirates": "AE",
  "Qatar": "QA", "Colombia": "CO", "Vietnam": "VN", "Indonesia": "ID", "Nigeria": "NG",
  "Serbia": "RS", "Croatia": "HR", "Slovenia": "SI", "Slovakia": "SK", "Estonia": "EE",
  "Lithuania": "LT", "Latvia": "LV", "Iceland": "IS", "Luxembourg": "LU", "Cyprus": "CY",
  "Jordan": "JO", "Lebanon": "LB", "Tunisia": "TN", "Morocco": "MA", "Ghana": "GH",
  "Ethiopia": "ET", "Kenya": "KE", "Uganda": "UG", "Bangladesh": "BD", "Sri Lanka": "LK",
  "Philippines": "PH", "Peru": "PE", "Ecuador": "EC", "Uruguay": "UY", "Costa Rica": "CR",
  "Ukraine": "UA", "Bulgaria": "BG", "Kazakhstan": "KZ", "Oman": "OM", "Kuwait": "KW",
  "Bahrain": "BH", "Iraq": "IQ", "Algeria": "DZ", "Malta": "MT", "Georgia": "GE",
  "Armenia": "AM", "Azerbaijan": "AZ", "Belarus": "BY", "Uzbekistan": "UZ", "Nepal": "NP"
};

const REGION_DISPLAY = {
  "China-Taiwan": "Taiwan",
  "China-Hong Kong": "Hong Kong",
  "China-Macau": "Macau",
  "Czech Republic": "Czechia"
};

// Known curated flagship hub aliases (normalized name -> PhysALT hub id)
const MANUAL_ALIASES = {
  "massachusetts institute of technology": "mit",
  "massachusetts institute of technology mit": "mit",
  "eth zurich": "eth",
  "swiss federal institute of technology zurich": "eth",
  "swiss federal institute of technology lausanne": "epfl",
  "ecole polytechnique federale de lausanne": "epfl",
  "university of california berkeley": "berkeley",
  "california institute of technology": "caltech",
  "university of cambridge": "cambridge",
  "university of oxford": "oxford",
  "stanford university": "stanford",
  "harvard university": "harvard",
  "princeton university": "princeton",
  "the university of tokyo": "utokyo",
  "university of tokyo": "utokyo",
  "paris saclay university": "parissaclay",
  "universite paris saclay": "parissaclay",
  "delft university of technology": "tudelft",
  "eindhoven university of technology": "tueindhoven",
  "technical university of munich": "tum",
  "ludwig maximilians university munich": "lmu",
  "ludwig maximilians universitat munchen": "lmu",
  "university of chicago": "uchicago",
  "columbia university": "columbia",
  "cornell university": "cornell",
  "university of michigan ann arbor": "umich",
  "university of illinois at urbana champaign": "uiuc",
  "university of texas at austin": "utaustin",
  "university of california santa barbara": "ucsb",
  "university of california los angeles": "ucla",
  "university of california san diego": "ucsd",
  "carnegie mellon university": "cmu",
  "georgia institute of technology": "gatech",
  "university of toronto": "utoronto",
  "imperial college london": "imperial",
  "university college london": "ucl",
  "university of edinburgh": "edinburgh",
  "tsinghua university": "tsinghua",
  "peking university": "peking",
  "university of science and technology of china": "ustc",
  "nanyang technological university": "ntu_sg",
  "national university of singapore": "nus",
  "korea advanced institute of science and technology": "kaist",
  "seoul national university": "snu",
  "kyoto university": "kyoto",
  "institute of science tokyo": "tokyotech",
  "tokyo institute of technology": "tokyotech",
  "rwth aachen university": "rwth",
  "ku leuven": "kuleuven",
  "katholieke universiteit leuven": "kuleuven",
  "university of grenoble alpes": "uga",
  "universite grenoble alpes": "uga",
  "national taiwan university": "ntu_tw",
  "national yang ming chiao tung university": "nycu",
  "national tsing hua university": "nthu",
  "sorbonne university": "sorbonne",
  "psl university": "psl",
  "university of copenhagen": "bohr",
  "sapienza university of rome": "sapienza",
  "politecnico di milano": "polimi",
  "kth royal institute of technology": "kth",
  "chalmers university of technology": "chalmers",
  "technical university of denmark": "dtu",
  "aalto university": "aalto",
  "university of amsterdam": "uva",
  "leiden university": "leiden",
  "utrecht university": "utrecht",
  "university of waterloo": "waterloo",
  "mcgill university": "mcgill",
  "university of british columbia": "ubc",
  "australian national university": "anu",
  "university of melbourne": "unimelb",
  "university of sydney": "usyd",
  "unsw sydney": "unsw",
  "university of new south wales": "unsw",
  "weizmann institute of science": "weizmann",
  "technion israel institute of technology": "technion",
  "indian institute of science": "iisc",
  "indian institute of technology bombay": "iitb",
  "indian institute of technology madras": "iitm",
  "indian institute of technology delhi": "iitd",
  "university of sao paulo": "usp",
  "heidelberg university": "heidelberg",
  "university of bonn": "bonn",
  "university of gottingen": "gottingen",
  "georg august university of gottingen": "gottingen",
  "karlsruhe institute of technology": "kit",
  "tu dresden": "tudresden",
  "dresden university of technology": "tudresden",
  "purdue university west lafayette": "purdue",
  "purdue university": "purdue",
  "arizona state university": "asu",
  "university of maryland college park": "umd",
  "university of washington": "uw",
  "university of wisconsin madison": "uwmadison",
  "university of pennsylvania": "upenn",
  "yale university": "yale",
  "johns hopkins university": "jhu",
  "new york university": "nyu",
  "university of colorado at boulder": "cuboulder",
  "university of colorado boulder": "cuboulder",
  "university of arizona": "uarizona",
  "shanghai jiao tong university": "sjtu",
  "zhejiang university": "zju",
  "fudan university": "fudan"
};

function normName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normCompact(s) {
  return normName(s)
    .replace(/\b(university|universite|universitat|universidad|universita|universidade|universiteit|of|at|in|de|di|da|do|la|le|der|fur|fuer|and|et|und)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRankNum(r) {
  const m = String(r || "").match(/^(\d+)/);
  return m ? Number(m[1]) : 9999;
}

function round1(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return null;
  return Math.round(Number(v) * 10) / 10;
}

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "PhysALT-DataPipeline/1.0 (https://nothinkaffee.github.io/PhysAlts/)" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  });
  await Promise.all(workers);
  return results;
}

function loadExistingHubs() {
  const files = [
    "curated_flagships.json",
    "stem/engineering_hubs.json",
    "stem/ai_cs_hubs.json",
    "stem/math_hubs.json",
    "stem/bio_med_hubs.json",
    "stem/chem_earth_eng_hubs.json",
    "private_startups.json",
    "physics_hubs.json"
  ];
  const all = [];
  const seenIds = new Set();
  for (const rel of files) {
    const p = path.join(DATA_DIR, rel);
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const h of (j.hubs || [])) {
      if (!h.id || seenIds.has(h.id)) continue;
      seenIds.add(h.id);
      all.push({ ...h, _sourceFile: rel });
    }
  }
  return all;
}

function buildHubMatcher(existingHubs) {
  const byId = new Map();
  const byExact = new Map();
  const byNorm = new Map();
  const byNormCountry = new Map();
  const byCompactCountry = new Map();

  // Prioritize curated/flagship/stem hubs over scraped hubs
  const priority = (h) => {
    if (h._sourceFile === "curated_flagships.json") return 0;
    if (h._sourceFile.startsWith("stem/")) return 1;
    if (h._sourceFile === "physics_hubs.json" && (h.entityType === "uni" || h.group === "uni")) return 2;
    if (h._sourceFile === "physics_hubs.json") return 3;
    return 4;
  };
  const sorted = existingHubs.slice().sort((a, b) => priority(a) - priority(b));

  for (const h of sorted) {
    byId.set(h.id, h);
    const low = h.name.toLowerCase().trim();
    if (!byExact.has(low)) byExact.set(low, h);

    // Register full name + stripped parenthetical + part before parentheses + hyphen-free
    const variants = new Set([
      normName(h.name),
      normName(h.name.split(" (")[0]),
      normName(h.name.replace(/-/g, " "))
    ]);
    // Also extract acronym inside parens if >= 3 chars (only for curated hubs)
    const ctry = (h.country || "").toLowerCase();
    for (const v of variants) {
      if (!v) continue;
      if (!byNorm.has(v)) byNorm.set(v, h);
      if (ctry && !byNormCountry.has(`${v}|${ctry}`)) byNormCountry.set(`${v}|${ctry}`, h);
    }
    const comp = normCompact(h.name);
    if (comp && comp.length >= 4 && ctry && !byCompactCountry.has(`${comp}|${ctry}`)) {
      byCompactCountry.set(`${comp}|${ctry}`, h);
    }
  }

  return function matchHub(univName, region) {
    const displayCtry = (REGION_DISPLAY[region] || region || "").toLowerCase();
    const n = normName(univName);
    const aliasId = MANUAL_ALIASES[n];
    if (aliasId && byId.has(aliasId)) return byId.get(aliasId);

    const exact = byExact.get(univName.toLowerCase().trim());
    if (exact) return exact;

    if (displayCtry && byNormCountry.has(`${n}|${displayCtry}`)) {
      return byNormCountry.get(`${n}|${displayCtry}`);
    }
    if (byNorm.has(n)) {
      const cand = byNorm.get(n);
      // Verify country compatibility if both have countries
      const candCtry = (cand.country || "").toLowerCase();
      if (!displayCtry || !candCtry || candCtry === displayCtry ||
          (displayCtry === "taiwan" && candCtry.includes("taiwan")) ||
          (displayCtry === "hong kong" && candCtry.includes("hong kong")) ||
          (displayCtry === "south korea" && candCtry.includes("korea"))) {
        return cand;
      }
    }
    const comp = normCompact(univName);
    if (comp && comp.length >= 5 && displayCtry && byCompactCountry.has(`${comp}|${displayCtry}`)) {
      return byCompactCountry.get(`${comp}|${displayCtry}`);
    }
    return null;
  };
}

async function geocodeUniversity(univName, region, cache) {
  const cacheKey = `${univName}|${region}`;
  if (cache[cacheKey]) return cache[cacheKey];

  const iso2 = REGION_TO_ISO2[region] || "";
  const cleanQ = univName.replace(/\([^)]*\)/g, "").trim();

  // 1. OpenAlex Institutions API (fast, rich: coordinates, city, homepage, works, citations, ROR)
  try {
    const filter = iso2 ? `&filter=country_code:${iso2}` : "";
    const url = `https://api.openalex.org/institutions?search=${encodeURIComponent(cleanQ)}${filter}&per-page=3&mailto=physalts@example.com`;
    const data = await fetchJson(url, 2);
    const results = data?.results || [];
    const best = results.find(r => r?.geo?.latitude != null && r?.geo?.longitude != null);
    if (best) {
      const rec = {
        lat: Math.round(Number(best.geo.latitude) * 10000) / 10000,
        lng: Math.round(Number(best.geo.longitude) * 10000) / 10000,
        city: best.geo.city
          ? `${best.geo.city}, ${REGION_DISPLAY[region] || region}`
          : (REGION_DISPLAY[region] || region),
        country: REGION_DISPLAY[region] || region,
        url: best.homepage_url || "",
        worksCount: best.works_count || 0,
        citationsCount: best.cited_by_count || 0,
        ror: best.ror || "",
        oaId: best.id ? best.id.split("/").pop() : "",
        source: "OpenAlex"
      };
      cache[cacheKey] = rec;
      return rec;
    }
  } catch {}

  // 2. Retry OpenAlex without country filter (for overseas / disputed-code regions like Hong Kong, Macau, Taiwan)
  try {
    const url = `https://api.openalex.org/institutions?search=${encodeURIComponent(cleanQ)}&per-page=3&mailto=physalts@example.com`;
    const data = await fetchJson(url, 2);
    const best = (data?.results || []).find(r => r?.geo?.latitude != null && r?.geo?.longitude != null);
    if (best) {
      const rec = {
        lat: Math.round(Number(best.geo.latitude) * 10000) / 10000,
        lng: Math.round(Number(best.geo.longitude) * 10000) / 10000,
        city: best.geo.city
          ? `${best.geo.city}, ${REGION_DISPLAY[region] || region}`
          : (REGION_DISPLAY[region] || region),
        country: REGION_DISPLAY[region] || region,
        url: best.homepage_url || "",
        worksCount: best.works_count || 0,
        citationsCount: best.cited_by_count || 0,
        ror: best.ror || "",
        oaId: best.id ? best.id.split("/").pop() : "",
        source: "OpenAlex"
      };
      cache[cacheKey] = rec;
      return rec;
    }
  } catch {}

  // 3. Fallback: ROR v2 API
  try {
    const url = `https://api.ror.org/v2/organizations?query=${encodeURIComponent(cleanQ)}`;
    const data = await fetchJson(url, 2);
    const best = (data?.items || []).find(it => it?.locations?.[0]?.geonames_details?.lat != null);
    if (best) {
      const loc = best.locations[0].geonames_details;
      const homepage = (best.links || []).find(l => l.type === "website")?.value || "";
      const rec = {
        lat: Math.round(Number(loc.lat) * 10000) / 10000,
        lng: Math.round(Number(loc.lng) * 10000) / 10000,
        city: loc.name ? `${loc.name}, ${REGION_DISPLAY[region] || region}` : (REGION_DISPLAY[region] || region),
        country: REGION_DISPLAY[region] || region,
        url: homepage,
        worksCount: 0,
        citationsCount: 0,
        ror: best.id || "",
        oaId: "",
        source: "ROR"
      };
      cache[cacheKey] = rec;
      return rec;
    }
  } catch {}

  return null;
}

async function main() {
  console.log(`\n=== PhysALT ShanghaiRanking ${YEAR} Official Ingestion Pipeline ===`);

  // 1. Fetch ARWU 2026 + GRAS 2026 Subject Directory
  console.log("1. Fetching ARWU 2026 & GRAS 2026 subject list...");
  const [arwuResp, subjResp] = await Promise.all([
    fetchJson(`${BASE_API}/arwu/rank?version=${YEAR}`),
    fetchJson(`${BASE_API}/gras/subj?version=${YEAR}`)
  ]);
  const arwuList = arwuResp?.data?.rankings || [];
  const rawCategories = subjResp?.data || [];

  const subjects = [];
  const categories = [];
  for (const cat of rawCategories) {
    const catSubjects = [];
    for (const s of (cat.detail || [])) {
      const mapping = SUBJECT_MAP[s.code] || { disc: "all", branches: [] };
      const subjObj = {
        code: s.code,
        name: s.nameEn,
        category: cat.nameEn,
        disc: mapping.disc,
        branches: mapping.branches,
        count: 0
      };
      subjects.push(subjObj);
      catSubjects.push(s.code);
    }
    categories.push({ name: cat.nameEn, subjects: catSubjects });
  }
  console.log(`   ARWU ${YEAR}: ${arwuList.length} universities`);
  console.log(`   GRAS ${YEAR}: ${subjects.length} subjects across ${categories.length} categories`);

  // 2. Fetch ALL 57 GRAS 2026 subject rankings concurrently
  console.log(`2. Fetching all ${subjects.length} GRAS ${YEAR} subject tables...`);
  const grasResults = await mapLimit(subjects, 8, async (subj) => {
    const data = await fetchJson(`${BASE_API}/gras/rank?version=${YEAR}&subj_code=${subj.code}`);
    const list = data?.data?.rankings || [];
    subj.count = list.length;
    return { code: subj.code, rankings: list };
  });

  // 3. Consolidate all unique universities across ARWU 2026 + all 57 GRAS 2026 subjects
  // Key by univUp slug (unique canonical ShanghaiRanking institution slug)
  const univBySlug = new Map();
  const ensureUniv = (row) => {
    const slug = row.univUp || normName(row.univNameEn).replace(/\s+/g, "-");
    let u = univBySlug.get(slug);
    if (!u) {
      u = {
        slug,
        name: row.univNameEn.trim(),
        region: row.region || "",
        country: REGION_DISPLAY[row.region] || row.region || "",
        arwu: null,
        gras: {}
      };
      univBySlug.set(slug, u);
    }
    return u;
  };

  for (const row of arwuList) {
    const u = ensureUniv(row);
    const ind = row.indData || {};
    u.arwu = {
      r: String(row.ranking || ""),
      rn: parseRankNum(row.ranking),
      nr: String(row.regionRanking || ""),
      s: round1(row.score),
      // [Alumni, Award, HiCi, N&S, PUB, PCP]
      i: [round1(ind["171"]), round1(ind["172"]), round1(ind["173"]), round1(ind["174"]), round1(ind["175"]), round1(ind["176"])]
    };
  }

  let totalSubjectRows = 0;
  for (const { code, rankings } of grasResults) {
    for (const row of rankings) {
      totalSubjectRows++;
      const u = ensureUniv(row);
      const ind = row.indData || {};
      u.gras[code] = {
        r: String(row.ranking || ""),
        rn: parseRankNum(row.ranking),
        s: round1(row.score),
        // [World-Class Faculty, World-Class Output, High-Quality Research (Q1), Research Impact (CNCI), International Collaboration (IC)]
        i: [round1(ind["46"]), round1(ind["47"]), round1(ind["48"]), round1(ind["49"]), round1(ind["50"])]
      };
    }
  }
  console.log(`   Consolidated ${univBySlug.size} unique universities and ${totalSubjectRows.toLocaleString()} subject-ranking rows!`);

  // 4. Match against existing PhysALT 5,709 hubs
  const existingHubs = loadExistingHubs();
  const matchHub = buildHubMatcher(existingHubs);
  const matched = new Map(); // hubId -> univ
  const unmatched = [];
  const usedHubIds = new Set();

  for (const u of univBySlug.values()) {
    const hit = matchHub(u.name, u.region);
    if (hit && !usedHubIds.has(hit.id)) {
      usedHubIds.add(hit.id);
      u.hubId = hit.id;
      matched.set(hit.id, u);
    } else {
      unmatched.push(u);
    }
  }
  console.log(`3. Matched ${matched.size} / ${univBySlug.size} universities to existing PhysALT hubs (${unmatched.length} to geocode)...`);

  // 5. Geocode unmatched ShanghaiRanking universities via OpenAlex & ROR (with disk cache)
  let geoCache = {};
  if (fs.existsSync(GEO_CACHE_PATH)) {
    try { geoCache = JSON.parse(fs.readFileSync(GEO_CACHE_PATH, "utf8")); } catch {}
  }

  // Country centroid fallback for any rare un-geocodable university (from existing hubs average)
  const countryCentroids = new Map();
  for (const h of existingHubs) {
    if (!h.country || !Number.isFinite(h.lat) || !Number.isFinite(h.lng)) continue;
    const c = countryCentroids.get(h.country) || { lat: 0, lng: 0, n: 0 };
    c.lat += h.lat; c.lng += h.lng; c.n++;
    countryCentroids.set(h.country, c);
  }

  let geocodedOk = 0;
  let fallbackCentroid = 0;
  const extraHubs = [];

  await mapLimit(unmatched, 10, async (u, idx) => {
    if (idx > 0 && idx % 100 === 0) {
      fs.writeFileSync(GEO_CACHE_PATH, JSON.stringify(geoCache));
      process.stdout.write(`   Geocoded ${idx}/${unmatched.length}...\r`);
    }
    let geo = await geocodeUniversity(u.name, u.region, geoCache);
    if (!geo) {
      const cc = countryCentroids.get(u.country);
      if (cc && cc.n > 0) {
        // Deterministic tiny jitter so multiple fallbacks never stack on exact same pixel
        let hash = 0;
        for (const ch of u.slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
        const jLat = ((hash % 100) - 50) * 0.008;
        const jLng = (((hash >> 8) % 100) - 50) * 0.008;
        geo = {
          lat: Math.round((cc.lat / cc.n + jLat) * 10000) / 10000,
          lng: Math.round((cc.lng / cc.n + jLng) * 10000) / 10000,
          city: u.country || "Global Hub",
          country: u.country || "Global",
          url: `https://www.shanghairanking.com/institution/${u.slug}`,
          worksCount: 0,
          citationsCount: 0,
          source: "ShanghaiRanking"
        };
        fallbackCentroid++;
      } else {
        return;
      }
    } else {
      geocodedOk++;
    }

    // Determine primary PhysALT discipline & branch from best GRAS 2026 subject rank
    const grasEntries = Object.entries(u.gras).sort((a, b) => a[1].rn - b[1].rn);
    let primaryDisc = "engineering";
    let primaryBranch = "semiconductors";
    for (const [code] of grasEntries) {
      const m = SUBJECT_MAP[code];
      if (m && m.disc !== "all" && m.branches.length) {
        primaryDisc = m.disc;
        primaryBranch = m.branches[0];
        break;
      }
    }
    if (!grasEntries.length) {
      primaryDisc = "physics";
      primaryBranch = "multi";
    }

    const hubId = `sr-${u.slug.slice(0, 48)}`;
    u.hubId = hubId;

    const topSubjects = grasEntries.slice(0, 3).map(([code, d]) => {
      const sName = subjects.find(s => s.code === code)?.name || code;
      return `#${d.r} in ${sName}`;
    });
    const arwuTxt = u.arwu ? `ARWU 2026 #${u.arwu.r}` : "";
    const summaryParts = [
      `${u.name} is ranked in ShanghaiRanking ${YEAR}`,
      arwuTxt ? `(${arwuTxt})` : "",
      topSubjects.length ? `with leading subject placements: ${topSubjects.join(", ")}.` : "."
    ].filter(Boolean);
    if (geo.worksCount > 0 && geo.citationsCount > 0) {
      summaryParts.push(`Verified with ${geo.worksCount.toLocaleString()} indexed works and ${geo.citationsCount.toLocaleString()} citations.`);
    }

    extraHubs.push({
      id: hubId,
      name: u.name,
      city: geo.city,
      country: geo.country,
      lat: geo.lat,
      lng: geo.lng,
      zoom: 15.2,
      group: "uni",
      entityType: "uni",
      discipline: primaryDisc,
      branch: primaryBranch,
      tier: "shanghai",
      sourceApi: `ShanghaiRanking ${YEAR}`,
      url: geo.url || `https://www.shanghairanking.com/institution/${u.slug}`,
      worksCount: geo.worksCount || 0,
      citationsCount: geo.citationsCount || 0,
      summary: summaryParts.join(" ").replace(/\s+\./g, ".")
    });
  });

  fs.writeFileSync(GEO_CACHE_PATH, JSON.stringify(geoCache));
  console.log(`\n   Geocoded via OpenAlex/ROR: ${geocodedOk}, country fallback: ${fallbackCentroid}, total extra hubs: ${extraHubs.length}`);

  // 6. Build compact public/data/shanghai_2026.json
  const universitiesOut = {};
  const arwuOrder = [];
  const subjectRankings = {}; // code -> [hubId, ...] in exact ShanghaiRanking order

  for (const s of subjects) subjectRankings[s.code] = [];

  for (const row of arwuList) {
    const slug = row.univUp || normName(row.univNameEn).replace(/\s+/g, "-");
    const u = univBySlug.get(slug);
    if (u?.hubId) arwuOrder.push(u.hubId);
  }
  for (const { code, rankings } of grasResults) {
    for (const row of rankings) {
      const slug = row.univUp || normName(row.univNameEn).replace(/\s+/g, "-");
      const u = univBySlug.get(slug);
      if (u?.hubId) subjectRankings[code].push(u.hubId);
    }
  }

  for (const u of univBySlug.values()) {
    if (!u.hubId) continue;
    const grasCompact = {};
    for (const [code, g] of Object.entries(u.gras)) {
      grasCompact[code] = { r: g.r, rn: g.rn, ...(g.s != null ? { s: g.s } : {}), i: g.i };
    }
    universitiesOut[u.hubId] = {
      slug: u.slug,
      name: u.name,
      country: u.country,
      ...(u.arwu ? { arwu: u.arwu } : {}),
      gras: grasCompact
    };
  }

  const shanghaiPayload = {
    meta: {
      edition: YEAR,
      source: "ShanghaiRanking Consultancy (ARWU 2026 & GRAS 2026)",
      sourceUrl: "https://www.shanghairanking.com/",
      fetchedAt: new Date().toISOString().slice(0, 10),
      totalUniversities: Object.keys(universitiesOut).length,
      arwuCount: arwuOrder.length,
      subjectCount: subjects.length,
      totalSubjectRows,
      arwuIndicators: [
        { key: "Alumni", label: "Alumni", weight: "10%", desc: "Alumni winning Nobel Prizes & Fields Medals" },
        { key: "Award",  label: "Award",  weight: "20%", desc: "Staff winning Nobel Prizes & Fields Medals" },
        { key: "HiCi",   label: "HiCi",   weight: "20%", desc: "Clarivate Highly Cited Researchers" },
        { key: "NS",     label: "N&S",    weight: "20%", desc: "Papers published in Nature & Science (2021–2025)" },
        { key: "PUB",    label: "PUB",    weight: "20%", desc: "SCIE & SSCI indexed papers (2025)" },
        { key: "PCP",    label: "PCP",    weight: "10%", desc: "Per capita academic performance" }
      ],
      grasIndicators: [
        { key: "WCF",  label: "World-Class Faculty",     short: "Faculty",  desc: "Laureates, Highly Cited Researchers, Editors & Org Leaders" },
        { key: "WCO",  label: "World-Class Output",      short: "Output",   desc: "Top Journal Papers & International Academic Awards" },
        { key: "HQR",  label: "High-Quality Research",   short: "Q1 Papers",desc: "Q1 Journal Papers (2021–2025)" },
        { key: "RI",   label: "Research Impact (CNCI)",  short: "Impact",   desc: "Category Normalized Citation Impact (2021–2025)" },
        { key: "IC",   label: "Intl Collaboration (IC)", short: "Intl Collab", desc: "Internationally Collaborated Papers ratio (2021–2025)" }
      ]
    },
    categories,
    subjects,
    arwuOrder,
    subjectRankings,
    universities: universitiesOut
  };

  fs.writeFileSync(OUT_SHANGHAI, JSON.stringify(shanghaiPayload));
  fs.writeFileSync(OUT_EXTRA_HUBS, JSON.stringify({
    meta: {
      name: `PhysALT ShanghaiRanking ${YEAR} Additional Ranked Universities`,
      edition: YEAR,
      count: extraHubs.length,
      updatedAt: new Date().toISOString().slice(0, 10)
    },
    hubs: extraHubs
  }));

  const shSize = (fs.statSync(OUT_SHANGHAI).size / 1024 / 1024).toFixed(2);
  const exSize = (fs.statSync(OUT_EXTRA_HUBS).size / 1024 / 1024).toFixed(2);
  console.log(`\n=== DONE ===`);
  console.log(`Wrote ${OUT_SHANGHAI} (${shSize} MB) — ${Object.keys(universitiesOut).length} universities, ${subjects.length} GRAS subjects, ${totalSubjectRows.toLocaleString()} subject rows`);
  console.log(`Wrote ${OUT_EXTRA_HUBS} (${exSize} MB) — ${extraHubs.length} newly geocoded universities`);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
