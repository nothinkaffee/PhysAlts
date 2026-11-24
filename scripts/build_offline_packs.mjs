#!/usr/bin/env node
/**
 * World of Science / PhysAlts — Organic-Maps-Style Offline Pack Compiler
 *
 * Reads all datasets from public/data/ and (when present) public/data/stem/,
 * compiles compact minified offline packs into public/data/packs/*.json,
 * indexes the 21 local NASA Blue Marble z=0..2 globe tiles as a virtual pack,
 * and emits public/data/packs/manifest.json with exact byte sizes and SHA-256 hashes.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(PUBLIC_DIR, "data");
const STEM_DIR = path.join(DATA_DIR, "stem");
const PACKS_DIR = path.join(DATA_DIR, "packs");
const TILES_DIR = path.join(PUBLIC_DIR, "tiles", "bluemarble");

const PACK_SCHEMA_VERSION = "1.0.0";
const BUILD_DATE = new Date().toISOString();
const PACK_VERSION = BUILD_DATE.slice(0, 10);

function sha256Hex(bufOrStr) {
  return crypto.createHash("sha256").update(bufOrStr).digest("hex");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return null;
    console.warn(`[packs] Warning: failed to parse ${path.relative(ROOT_DIR, filePath)}: ${err.message}`);
    return null;
  }
}

function extractArray(data, candidateKeys) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const key of candidateKeys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Discipline definitions & routing
// ---------------------------------------------------------------------------

const DISCIPLINE_PACK_DEFS = [
  {
    id: "pack_physics",
    discipline: "physics",
    name: "Physics & Astronomy",
    description:
      "Flagship particle labs, quantum & fusion hubs, global university physics index, historical milestones (1800 BCE–2045+), Space Frontier missions, and physics domain taxonomy."
  },
  {
    id: "pack_ai_cs",
    discipline: "ai_cs",
    name: "AI & Computer Science",
    description:
      "Frontier AI labs, systems & theory departments, open-source compute centers, AI/CS historical timeline, taxonomy, and guided curiosity trails."
  },
  {
    id: "pack_math",
    discipline: "math",
    name: "Mathematics",
    description:
      "Pure and applied mathematics institutes, Fields Medal centers, foundational theorems timeline, mathematical taxonomy, and rabbit trails."
  },
  {
    id: "pack_bio_med",
    discipline: "bio_med",
    name: "Biology, Genomics & Neuroscience",
    description:
      "Molecular biology, CRISPR genomics, structural biology, neuroscience & biomedical hubs, life-science milestones, and domain guides."
  },
  {
    id: "pack_chem_earth",
    discipline: "chem_earth",
    name: "Chemistry, Materials & Earth",
    description:
      "Chemistry institutes, advanced materials centers, climate & atmospheric observatories, oceanography hubs, milestones, and taxonomy."
  },
  {
    id: "pack_engineering",
    discipline: "engineering",
    name: "Engineering, Robotics & Aerospace",
    description:
      "Robotics labs, semiconductor lithography & fab centers, aerospace propulsion hubs, engineering milestones, and domain guides."
  }
];

const DISCIPLINE_ALIAS_MAP = new Map([
  // Physics
  ["physics", "physics"],
  ["astronomy", "physics"],
  ["astro", "physics"],
  ["astrophysics", "physics"],
  ["particle", "physics"],
  ["quantum", "physics"],
  ["gravity", "physics"],
  ["fusion", "physics"],
  ["condensed", "physics"],
  ["hep", "physics"],
  ["nuclear", "physics"],
  ["optics", "physics"],
  ["photonics", "physics"],
  ["space", "physics"],
  ["physics_astro", "physics"],
  // AI & CS
  ["ai_cs", "ai_cs"],
  ["ai-cs", "ai_cs"],
  ["ai", "ai_cs"],
  ["cs", "ai_cs"],
  ["ai & cs", "ai_cs"],
  ["ai_and_cs", "ai_cs"],
  ["computer_science", "ai_cs"],
  ["computer science", "ai_cs"],
  ["computing", "ai_cs"],
  ["machine_learning", "ai_cs"],
  ["ml", "ai_cs"],
  ["nlp", "ai_cs"],
  ["cybersecurity", "ai_cs"],
  ["systems", "ai_cs"],
  ["hci", "ai_cs"],
  // Mathematics
  ["math", "math"],
  ["maths", "math"],
  ["mathematics", "math"],
  ["pure_math", "math"],
  ["applied_math", "math"],
  ["statistics", "math"],
  ["probability", "math"],
  ["topology", "math"],
  ["algebra", "math"],
  ["geometry", "math"],
  ["number_theory", "math"],
  // Biology, Genomics & Neuroscience
  ["bio_med", "bio_med"],
  ["bio-med", "bio_med"],
  ["bio", "bio_med"],
  ["biology", "bio_med"],
  ["biomed", "bio_med"],
  ["biomedical", "bio_med"],
  ["medicine", "bio_med"],
  ["medical", "bio_med"],
  ["genomics", "bio_med"],
  ["genetics", "bio_med"],
  ["neuro", "bio_med"],
  ["neuroscience", "bio_med"],
  ["biotech", "bio_med"],
  ["biotechnology", "bio_med"],
  ["life_sciences", "bio_med"],
  ["molecular_biology", "bio_med"],
  ["ecology", "bio_med"],
  ["immunology", "bio_med"],
  // Chemistry, Materials & Earth
  ["chem_earth", "chem_earth"],
  ["chem-earth", "chem_earth"],
  ["chem", "chem_earth"],
  ["chemistry", "chem_earth"],
  ["materials", "chem_earth"],
  ["materials_science", "chem_earth"],
  ["earth", "chem_earth"],
  ["earth_science", "chem_earth"],
  ["earth_sciences", "chem_earth"],
  ["climate", "chem_earth"],
  ["geology", "chem_earth"],
  ["geoscience", "chem_earth"],
  ["geophysics", "chem_earth"],
  ["oceanography", "chem_earth"],
  ["atmospheric", "chem_earth"],
  ["environmental", "chem_earth"],
  ["catalysis", "chem_earth"],
  ["chemical", "chem_earth"],
  ["energy_materials", "chem_earth"],
  // Engineering, Robotics, Semiconductors & Aerospace
  ["engineering", "engineering"],
  ["eng", "engineering"],
  ["robotics", "engineering"],
  ["semiconductors", "engineering"],
  ["semiconductor", "engineering"],
  ["aerospace", "engineering"],
  ["mechanical", "engineering"],
  ["electrical", "engineering"],
  ["civil", "engineering"],
  ["hardware", "engineering"],
  ["chips", "engineering"],
  ["manufacturing", "engineering"],
  ["autonomous", "engineering"],
  ["mechatronics", "engineering"],
  ["bioengineering", "engineering"]
]);

function normalizeDisciplineToken(token) {
  if (!token || typeof token !== "string") return null;
  const key = token.trim().toLowerCase().replace(/\s+/g, "_");
  if (DISCIPLINE_ALIAS_MAP.has(key)) return DISCIPLINE_ALIAS_MAP.get(key);
  const spaced = token.trim().toLowerCase();
  if (DISCIPLINE_ALIAS_MAP.has(spaced)) return DISCIPLINE_ALIAS_MAP.get(spaced);
  return null;
}

function classifyChemEarthVsEngineering(item) {
  // Check explicit discipline / domain / category / branch first
  const candidates = [
    item.discipline,
    item.domain,
    item.domainId,
    item.category,
    item.branch,
    item.sector,
    item.subfield,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ];
  for (const c of candidates) {
    const norm = normalizeDisciplineToken(c);
    if (norm === "engineering" || norm === "chem_earth") return norm;
  }

  const text = `${item.id || ""} ${item.name || ""} ${item.title || ""} ${item.sector || ""} ${item.branch || ""} ${item.summary || ""} ${item.desc || ""}`.toLowerCase();
  const engScore =
    (text.match(/\b(robot|robotics|semiconductor|lithography|foundry|microchip|chip|wafer|tsmc|asml|aerospace|propulsion|rocket|avionics|mechatron|autonomous|drone|actuator|mechanical engineering|electrical engineering|civil engineering|control systems|hardware|manufacturing|satellite engineering|jpl|skunk works|boston dynamics|fanuc)\b/g) || []).length;
  const chemEarthScore =
    (text.match(/\b(chem|chemistry|chemical|catalys|molecule|molecular|polymer|battery|electrochem|materials science|metallurg|ceramic|earth|climate|atmospher|ocean|oceanograph|geolog|volcan|seism|glaci|polar|meteorolog|weather|ecolog|hydrolog|carbon|geochem|mineral|woods hole|scripps|ncar|noaa|ecmwf|gfz|alfred wegener)\b/g) || []).length;

  if (engScore > chemEarthScore) return "engineering";
  return "chem_earth";
}

function classifyItemDiscipline(item, fallback = "physics") {
  if (!item || typeof item !== "object") return fallback;

  const directTokens = [
    item.discipline,
    item.disciplineId,
    item.primaryDiscipline,
    item.domainId,
    item.domain,
    item.field,
    item.category,
    item.branch,
    item.sector
  ];

  for (const token of directTokens) {
    const norm = normalizeDisciplineToken(token);
    if (norm) return norm;
  }

  if (Array.isArray(item.tags)) {
    for (const t of item.tags) {
      const norm = normalizeDisciplineToken(t);
      if (norm) return norm;
    }
  }

  if (fallback === "chem_earth_or_engineering") {
    return classifyChemEarthVsEngineering(item);
  }

  if (fallback) return fallback;

  // Keyword fallback when no explicit discipline is present (e.g. mixed timeline/domains)
  const text = `${item.id || ""} ${item.name || ""} ${item.title || ""} ${item.summary || ""} ${item.desc || ""}`.toLowerCase();
  if (/\b(deep learning|neural net|transformer|llm|artificial intelligence|turing|compiler|operating system|cryptography|distributed systems|computer science|algorithm|openai|deepmind|anthropic|csail)\b/.test(text)) {
    return "ai_cs";
  }
  if (/\b(mathematics|mathematician|fields medal|theorem|proof|topology|riemann|euler|gauss|galois|number theory|algebraic geometry|combinatorics|bourbaki)\b/.test(text)) {
    return "math";
  }
  if (/\b(dna|rna|crispr|genome|genomics|protein|cell biology|neuroscience|synapse|brain|vaccine|immunology|molecular biology|evolution|biomedical|broad institute|embl|salk|cold spring harbor)\b/.test(text)) {
    return "bio_med";
  }
  if (/\b(robotics|semiconductor|transistor|microprocessor|aerospace|rocket|propulsion|autonomous|lithography|engineering)\b/.test(text)) {
    return "engineering";
  }
  if (/\b(chemistry|periodic table|catalysis|polymer|battery|materials science|climate|oceanography|plate tectonics|geology|atmosphere|ozone|greenhouse)\b/.test(text)) {
    return "chem_earth";
  }
  return "physics";
}

function extractTrailDisciplines(trail, hubDisciplineById) {
  const matched = new Set();

  const directFields = [
    trail.discipline,
    trail.disciplineId,
    trail.domain,
    trail.category,
    trail.branch
  ];
  for (const f of directFields) {
    const norm = normalizeDisciplineToken(f);
    if (norm) matched.add(norm);
  }

  const listFields = [
    ...(Array.isArray(trail.disciplines) ? trail.disciplines : []),
    ...(Array.isArray(trail.domains) ? trail.domains : []),
    ...(Array.isArray(trail.tags) ? trail.tags : [])
  ];
  for (const token of listFields) {
    const norm = normalizeDisciplineToken(token);
    if (norm) matched.add(norm);
  }

  const stops = Array.isArray(trail.stops) ? trail.stops : (Array.isArray(trail.nodes) ? trail.nodes : []);
  for (const stop of stops) {
    const hubId = typeof stop === "string" ? stop : (stop?.hubId || stop?.nodeId || stop?.id);
    if (hubId && hubDisciplineById.has(hubId)) {
      matched.add(hubDisciplineById.get(hubId));
    }
    if (stop && typeof stop === "object") {
      const stopDisc = normalizeDisciplineToken(stop.discipline || stop.domain || stop.branch);
      if (stopDisc) matched.add(stopDisc);
    }
  }

  if (matched.size === 0) {
    matched.add(classifyItemDiscipline(trail, null));
  }
  return [...matched];
}

// ---------------------------------------------------------------------------
// Continent / Region definitions & routing (Organic Maps style)
// ---------------------------------------------------------------------------

const REGION_PACK_DEFS = [
  {
    id: "region_europe",
    name: "Europe",
    description:
      "All European STEM & Physics research hubs, universities, deep-tech startups, and regional historical milestones for offline exploration."
  },
  {
    id: "region_north_america",
    name: "North America",
    description:
      "All North & Central American and Caribbean STEM & Physics hubs, national labs, deep-tech clusters, and historical milestones."
  },
  {
    id: "region_asia",
    name: "Asia & Middle East",
    description:
      "All Asian and Middle Eastern STEM & Physics universities, megascience labs, semiconductor & deep-tech hubs, and regional milestones."
  },
  {
    id: "region_south_america",
    name: "South America",
    description:
      "All South American STEM & Physics institutions, Andean astronomical observatories, national labs, and regional milestones."
  },
  {
    id: "region_africa",
    name: "Africa",
    description:
      "All African STEM & Physics universities, radio astronomy arrays (MeerKAT/SKA), biomedical & climate centers, and historical milestones."
  },
  {
    id: "region_oceania_antarctica",
    name: "Oceania & Antarctica",
    description:
      "All Australian, New Zealand, Pacific Island, and Antarctic (IceCube, South Pole) STEM & Physics hubs and regional milestones."
  }
];

const COUNTRY_TO_REGION = new Map([
  // Europe
  ["albania", "region_europe"],
  ["andorra", "region_europe"],
  ["austria", "region_europe"],
  ["belarus", "region_europe"],
  ["belgium", "region_europe"],
  ["bosnia and herzegovina", "region_europe"],
  ["bulgaria", "region_europe"],
  ["croatia", "region_europe"],
  ["cyprus", "region_europe"],
  ["czechia", "region_europe"],
  ["czech republic", "region_europe"],
  ["denmark", "region_europe"],
  ["estonia", "region_europe"],
  ["europe", "region_europe"],
  ["faroe islands", "region_europe"],
  ["finland", "region_europe"],
  ["france", "region_europe"],
  ["germany", "region_europe"],
  ["gibraltar", "region_europe"],
  ["greece", "region_europe"],
  ["guernsey", "region_europe"],
  ["holy see", "region_europe"],
  ["vatican city", "region_europe"],
  ["hungary", "region_europe"],
  ["iceland", "region_europe"],
  ["ireland", "region_europe"],
  ["isle of man", "region_europe"],
  ["italy", "region_europe"],
  ["jersey", "region_europe"],
  ["kosovo", "region_europe"],
  ["latvia", "region_europe"],
  ["liechtenstein", "region_europe"],
  ["lithuania", "region_europe"],
  ["luxembourg", "region_europe"],
  ["malta", "region_europe"],
  ["moldova", "region_europe"],
  ["monaco", "region_europe"],
  ["montenegro", "region_europe"],
  ["netherlands", "region_europe"],
  ["the netherlands", "region_europe"],
  ["north macedonia", "region_europe"],
  ["norway", "region_europe"],
  ["poland", "region_europe"],
  ["portugal", "region_europe"],
  ["romania", "region_europe"],
  ["san marino", "region_europe"],
  ["serbia", "region_europe"],
  ["slovakia", "region_europe"],
  ["slovenia", "region_europe"],
  ["spain", "region_europe"],
  ["svalbard and jan mayen", "region_europe"],
  ["sweden", "region_europe"],
  ["switzerland", "region_europe"],
  ["ukraine", "region_europe"],
  ["united kingdom", "region_europe"],
  ["uk", "region_europe"],
  ["scotland", "region_europe"],
  ["england", "region_europe"],
  ["wales", "region_europe"],

  // North America (including Central America & Caribbean)
  ["antigua and barbuda", "region_north_america"],
  ["aruba", "region_north_america"],
  ["bahamas", "region_north_america"],
  ["barbados", "region_north_america"],
  ["belize", "region_north_america"],
  ["bermuda", "region_north_america"],
  ["canada", "region_north_america"],
  ["cayman islands", "region_north_america"],
  ["costa rica", "region_north_america"],
  ["cuba", "region_north_america"],
  ["curacao", "region_north_america"],
  ["dominica", "region_north_america"],
  ["dominican republic", "region_north_america"],
  ["el salvador", "region_north_america"],
  ["greenland", "region_north_america"],
  ["grenada", "region_north_america"],
  ["guadeloupe", "region_north_america"],
  ["guatemala", "region_north_america"],
  ["haiti", "region_north_america"],
  ["honduras", "region_north_america"],
  ["jamaica", "region_north_america"],
  ["martinique", "region_north_america"],
  ["mexico", "region_north_america"],
  ["nicaragua", "region_north_america"],
  ["panama", "region_north_america"],
  ["puerto rico", "region_north_america"],
  ["saint kitts and nevis", "region_north_america"],
  ["saint lucia", "region_north_america"],
  ["saint vincent and the grenadines", "region_north_america"],
  ["trinidad and tobago", "region_north_america"],
  ["u.s. virgin islands", "region_north_america"],
  ["united states", "region_north_america"],
  ["usa", "region_north_america"],
  ["us", "region_north_america"],

  // South America
  ["argentina", "region_south_america"],
  ["bolivia", "region_south_america"],
  ["brazil", "region_south_america"],
  ["chile", "region_south_america"],
  ["colombia", "region_south_america"],
  ["ecuador", "region_south_america"],
  ["falkland islands", "region_south_america"],
  ["french guiana", "region_south_america"],
  ["guyana", "region_south_america"],
  ["paraguay", "region_south_america"],
  ["peru", "region_south_america"],
  ["suriname", "region_south_america"],
  ["uruguay", "region_south_america"],
  ["venezuela", "region_south_america"],

  // Asia & Middle East
  ["afghanistan", "region_asia"],
  ["armenia", "region_asia"],
  ["azerbaijan", "region_asia"],
  ["bahrain", "region_asia"],
  ["bangladesh", "region_asia"],
  ["bhutan", "region_asia"],
  ["brunei", "region_asia"],
  ["cambodia", "region_asia"],
  ["china", "region_asia"],
  ["georgia", "region_asia"],
  ["hong kong", "region_asia"],
  ["india", "region_asia"],
  ["indonesia", "region_asia"],
  ["iran", "region_asia"],
  ["iraq", "region_asia"],
  ["israel", "region_asia"],
  ["japan", "region_asia"],
  ["jordan", "region_asia"],
  ["kazakhstan", "region_asia"],
  ["kuwait", "region_asia"],
  ["kyrgyzstan", "region_asia"],
  ["laos", "region_asia"],
  ["lebanon", "region_asia"],
  ["macao", "region_asia"],
  ["macau", "region_asia"],
  ["malaysia", "region_asia"],
  ["maldives", "region_asia"],
  ["mongolia", "region_asia"],
  ["myanmar", "region_asia"],
  ["nepal", "region_asia"],
  ["north korea", "region_asia"],
  ["oman", "region_asia"],
  ["pakistan", "region_asia"],
  ["palestine", "region_asia"],
  ["philippines", "region_asia"],
  ["qatar", "region_asia"],
  ["saudi arabia", "region_asia"],
  ["singapore", "region_asia"],
  ["south korea", "region_asia"],
  ["republic of korea", "region_asia"],
  ["sri lanka", "region_asia"],
  ["syria", "region_asia"],
  ["taiwan", "region_asia"],
  ["tajikistan", "region_asia"],
  ["thailand", "region_asia"],
  ["timor-leste", "region_asia"],
  ["turkey", "region_asia"],
  ["türkiye", "region_asia"],
  ["turkmenistan", "region_asia"],
  ["united arab emirates", "region_asia"],
  ["uae", "region_asia"],
  ["uzbekistan", "region_asia"],
  ["vietnam", "region_asia"],
  ["yemen", "region_asia"],

  // Africa
  ["algeria", "region_africa"],
  ["angola", "region_africa"],
  ["benin", "region_africa"],
  ["botswana", "region_africa"],
  ["burkina faso", "region_africa"],
  ["burundi", "region_africa"],
  ["cabo verde", "region_africa"],
  ["cape verde", "region_africa"],
  ["cameroon", "region_africa"],
  ["central african republic", "region_africa"],
  ["chad", "region_africa"],
  ["comoros", "region_africa"],
  ["congo republic", "region_africa"],
  ["republic of the congo", "region_africa"],
  ["democratic republic of the congo", "region_africa"],
  ["dr congo", "region_africa"],
  ["djibouti", "region_africa"],
  ["egypt", "region_africa"],
  ["equatorial guinea", "region_africa"],
  ["eritrea", "region_africa"],
  ["eswatini", "region_africa"],
  ["ethiopia", "region_africa"],
  ["gabon", "region_africa"],
  ["gambia", "region_africa"],
  ["the gambia", "region_africa"],
  ["ghana", "region_africa"],
  ["guinea", "region_africa"],
  ["guinea-bissau", "region_africa"],
  ["ivory coast", "region_africa"],
  ["côte d'ivoire", "region_africa"],
  ["kenya", "region_africa"],
  ["lesotho", "region_africa"],
  ["liberia", "region_africa"],
  ["libya", "region_africa"],
  ["madagascar", "region_africa"],
  ["malawi", "region_africa"],
  ["mali", "region_africa"],
  ["mauritania", "region_africa"],
  ["mauritius", "region_africa"],
  ["morocco", "region_africa"],
  ["mozambique", "region_africa"],
  ["namibia", "region_africa"],
  ["niger", "region_africa"],
  ["nigeria", "region_africa"],
  ["réunion", "region_africa"],
  ["rwanda", "region_africa"],
  ["são tomé and príncipe", "region_africa"],
  ["senegal", "region_africa"],
  ["seychelles", "region_africa"],
  ["sierra leone", "region_africa"],
  ["somalia", "region_africa"],
  ["south africa", "region_africa"],
  ["south sudan", "region_africa"],
  ["sudan", "region_africa"],
  ["tanzania", "region_africa"],
  ["togo", "region_africa"],
  ["tunisia", "region_africa"],
  ["uganda", "region_africa"],
  ["western sahara", "region_africa"],
  ["zambia", "region_africa"],
  ["zimbabwe", "region_africa"],

  // Oceania & Antarctica
  ["antarctica", "region_oceania_antarctica"],
  ["australia", "region_oceania_antarctica"],
  ["fiji", "region_oceania_antarctica"],
  ["french polynesia", "region_oceania_antarctica"],
  ["guam", "region_oceania_antarctica"],
  ["kiribati", "region_oceania_antarctica"],
  ["marshall islands", "region_oceania_antarctica"],
  ["micronesia", "region_oceania_antarctica"],
  ["nauru", "region_oceania_antarctica"],
  ["new caledonia", "region_oceania_antarctica"],
  ["new zealand", "region_oceania_antarctica"],
  ["palau", "region_oceania_antarctica"],
  ["papua new guinea", "region_oceania_antarctica"],
  ["samoa", "region_oceania_antarctica"],
  ["solomon islands", "region_oceania_antarctica"],
  ["tonga", "region_oceania_antarctica"],
  ["tuvalu", "region_oceania_antarctica"],
  ["vanuatu", "region_oceania_antarctica"]
]);

function classifyRegionByCoords(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la <= -60) return "region_oceania_antarctica";
  if (lo < -30) {
    if (la >= 12 || (la >= 7 && lo < -77)) return "region_north_america";
    return "region_south_america";
  }
  if ((lo >= 110 && la < -10) || (lo >= 135 && la < 15)) {
    return "region_oceania_antarctica";
  }
  if (lo >= -25 && lo <= 60 && la >= 35) return "region_europe";
  if (lo >= -25 && lo <= 55 && la < 35 && la > -40) return "region_africa";
  return "region_asia";
}

function classifyRegion(item) {
  if (!item || typeof item !== "object") return null;
  const rawCountry = String(
    item.country ||
      (item.city && item.city.includes(",") ? item.city.split(",").pop() : "") ||
      ""
  )
    .trim()
    .toLowerCase();

  // Transcontinental Russia: split along the Urals (~60°E) when coordinates exist
  if (rawCountry === "russia" || rawCountry === "russian federation") {
    const lng = Number(item.lng);
    if (Number.isFinite(lng) && lng >= 60) return "region_asia";
    return "region_europe";
  }

  if (rawCountry && COUNTRY_TO_REGION.has(rawCountry)) {
    return COUNTRY_TO_REGION.get(rawCountry);
  }

  // Handle slash-separated multi-country strings like "USA / Europe" by taking first known token
  if (rawCountry.includes("/") || rawCountry.includes(",")) {
    const parts = rawCountry.split(/[\/,]/).map((s) => s.trim());
    for (const part of parts) {
      if (COUNTRY_TO_REGION.has(part)) return COUNTRY_TO_REGION.get(part);
    }
  }

  // Coordinate fallback (handles "International" or novel country strings)
  return classifyRegionByCoords(item.lat, item.lng);
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

function dedupeHubs(list) {
  const seenIds = new Set();
  const seenNames = new Set();
  const out = [];
  for (const h of list) {
    if (!h || !h.name) continue;
    const lat = Number(h.lat);
    const lng = Number(h.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = h.id || `hub-${h.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
    const nameKey = h.name.trim().toLowerCase();
    if (seenIds.has(id) || seenNames.has(nameKey)) continue;
    seenIds.add(id);
    seenNames.add(nameKey);
    out.push({ ...h, id, lat, lng });
  }
  return out;
}

function dedupeById(list, keyFn = (x) => x.id || x.name || x.title) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item) continue;
    const key = String(keyFn(item) || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Load all datasets (public/data/* + optional public/data/stem/*)
// ---------------------------------------------------------------------------

async function loadAllSources() {
  // Core Physics datasets
  const [
    flagshipsRaw,
    startupsRaw,
    scrapedPhysicsRaw,
    historyTimelineRaw,
    spaceFrontierRaw,
    domainsCatalogRaw
  ] = await Promise.all([
    readJsonSafe(path.join(DATA_DIR, "curated_flagships.json")),
    readJsonSafe(path.join(DATA_DIR, "private_startups.json")),
    readJsonSafe(path.join(DATA_DIR, "physics_hubs.json")),
    readJsonSafe(path.join(DATA_DIR, "history_timeline.json")),
    readJsonSafe(path.join(DATA_DIR, "space_frontier.json")),
    readJsonSafe(path.join(DATA_DIR, "domains_catalog.json"))
  ]);

  // Optional STEM datasets in public/data/stem/
  const [
    aiCsRaw,
    mathRaw,
    bioMedRaw,
    chemEarthEngRaw,
    stemTimelineRaw,
    stemDomainsRaw,
    rabbitTrailsRaw
  ] = await Promise.all([
    readJsonSafe(path.join(STEM_DIR, "ai_cs_hubs.json")),
    readJsonSafe(path.join(STEM_DIR, "math_hubs.json")),
    readJsonSafe(path.join(STEM_DIR, "bio_med_hubs.json")),
    readJsonSafe(path.join(STEM_DIR, "chem_earth_eng_hubs.json")),
    readJsonSafe(path.join(STEM_DIR, "stem_timeline.json")),
    readJsonSafe(path.join(STEM_DIR, "stem_domains.json")),
    readJsonSafe(path.join(STEM_DIR, "rabbit_trails.json"))
  ]);

  // Prepare tagged hubs in priority order: curated flagships > deeptech > STEM curated > scraped
  const physicsCuratedHubs = [
    ...extractArray(flagshipsRaw, ["hubs", "items"]).map((h) => ({
      ...h,
      tier: h.tier || "flagship",
      discipline: classifyItemDiscipline(h, "physics")
    })),
    ...extractArray(startupsRaw, ["hubs", "items"]).map((h) => ({
      ...h,
      tier: h.tier || "deeptech",
      discipline: classifyItemDiscipline(h, "physics")
    }))
  ];

  const physicsScrapedHubs = extractArray(scrapedPhysicsRaw, ["hubs", "items"]).map((h) => ({
    ...h,
    tier: h.tier || "scraped",
    discipline: classifyItemDiscipline(h, "physics")
  }));

  const aiCsHubs = extractArray(aiCsRaw, ["hubs", "items"]).map((h) => ({
    ...h,
    tier: h.tier || "flagship",
    discipline: classifyItemDiscipline(h, "ai_cs")
  }));

  const mathHubs = extractArray(mathRaw, ["hubs", "items"]).map((h) => ({
    ...h,
    tier: h.tier || "flagship",
    discipline: classifyItemDiscipline(h, "math")
  }));

  const bioMedHubs = extractArray(bioMedRaw, ["hubs", "items"]).map((h) => ({
    ...h,
    tier: h.tier || "flagship",
    discipline: classifyItemDiscipline(h, "bio_med")
  }));

  const chemEarthEngHubs = extractArray(chemEarthEngRaw, ["hubs", "items"]).map((h) => ({
    ...h,
    tier: h.tier || "flagship",
    discipline: classifyItemDiscipline(h, "chem_earth_or_engineering")
  }));

  // Also check if any additional *.json hub files exist in public/data/stem/
  const extraStemHubs = [];
  const knownStemFiles = new Set([
    "ai_cs_hubs.json",
    "math_hubs.json",
    "bio_med_hubs.json",
    "chem_earth_eng_hubs.json",
    "stem_timeline.json",
    "stem_domains.json",
    "rabbit_trails.json"
  ]);
  try {
    const entries = await fs.readdir(STEM_DIR);
    for (const fileName of entries.sort()) {
      if (!fileName.endsWith(".json") || knownStemFiles.has(fileName)) continue;
      const raw = await readJsonSafe(path.join(STEM_DIR, fileName));
      const hubs = extractArray(raw, ["hubs", "items"]);
      for (const h of hubs) {
        extraStemHubs.push({
          ...h,
          tier: h.tier || "flagship",
          discipline: classifyItemDiscipline(h, null)
        });
      }
    }
  } catch {
    // public/data/stem does not exist yet — completely expected before STEM build
  }

  const [
    shanghaiExtraRaw,
    shanghai2026Raw,
    collaborationsRaw
  ] = await Promise.all([
    readJsonSafe(path.join(DATA_DIR, "shanghai_extra_hubs.json")),
    readJsonSafe(path.join(DATA_DIR, "shanghai_2026.json")),
    readJsonSafe(path.join(DATA_DIR, "collaborations.json"))
  ]);

  const shanghaiExtraHubs = extractArray(shanghaiExtraRaw, ["hubs", "items"]).map((h) => ({
    ...h,
    tier: h.tier || "shanghai",
    discipline: classifyItemDiscipline(h, "engineering")
  }));

  const allHubs = dedupeHubs([
    ...physicsCuratedHubs,
    ...aiCsHubs,
    ...mathHubs,
    ...bioMedHubs,
    ...chemEarthEngHubs,
    ...extraStemHubs,
    ...physicsScrapedHubs,
    ...shanghaiExtraHubs
  ]);

  // Timeline events
  const physicsEvents = extractArray(historyTimelineRaw, ["events", "timeline", "items"]).map((e) => ({
    ...e,
    discipline: classifyItemDiscipline(e, "physics")
  }));
  const stemEvents = extractArray(stemTimelineRaw, ["events", "timeline", "items"]).map((e) => ({
    ...e,
    discipline: classifyItemDiscipline(e, null)
  }));
  const allEvents = dedupeById([...physicsEvents, ...stemEvents], (e) => e.id || `${e.year}-${e.title}`)
    .sort((a, b) => Number(a.year || 0) - Number(b.year || 0));

  const eras = dedupeById([
    ...extractArray(historyTimelineRaw, ["eras"]),
    ...extractArray(stemTimelineRaw, ["eras"])
  ]);

  // Space Frontier missions & zones
  const allMissions = dedupeById(
    extractArray(spaceFrontierRaw, ["missions", "items"])
  ).sort((a, b) => Number(a.lightTimeSec || 0) - Number(b.lightTimeSec || 0));
  const spaceZones = extractArray(spaceFrontierRaw, ["zones"]);

  // Domains
  const physicsDomains = extractArray(domainsCatalogRaw, ["domains", "items"]).map((d) => ({
    ...d,
    discipline: classifyItemDiscipline(d, "physics")
  }));
  const stemDomains = extractArray(stemDomainsRaw, ["domains", "items"]).map((d) => ({
    ...d,
    discipline: classifyItemDiscipline(d, null)
  }));
  const allDomains = dedupeById([...physicsDomains, ...stemDomains], (d) => d.id || d.name);

  // Rabbit trails
  const allTrails = dedupeById(
    extractArray(rabbitTrailsRaw, ["trails", "rabbitTrails", "paths", "items"]),
    (t) => t.id || t.title || t.name
  );

  return {
    allHubs,
    shanghaiExtraHubs,
    shanghai2026Raw,
    collaborationsRaw,
    allEvents,
    eras,
    allMissions,
    spaceZones,
    allDomains,
    allTrails,
    stemPresent: Boolean(
      aiCsRaw || mathRaw || bioMedRaw || chemEarthEngRaw || stemTimelineRaw || stemDomainsRaw || rabbitTrailsRaw
    )
  };
}

// ---------------------------------------------------------------------------
// Virtual Earth Base Tiles pack (21 local NASA Blue Marble z=0..2 tiles)
// ---------------------------------------------------------------------------

async function buildBaseTilesManifestEntry() {
  const tiles = [];
  const hasher = crypto.createHash("sha256");
  let totalBytes = 0;

  for (let z = 0; z <= 2; z++) {
    const dim = 1 << z;
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const relUrl = `./tiles/bluemarble/${z}/${y}/${x}.jpg`;
        const absPath = path.join(TILES_DIR, String(z), String(y), `${x}.jpg`);
        try {
          const buf = await fs.readFile(absPath);
          totalBytes += buf.length;
          hasher.update(`${relUrl}:${buf.length}:`);
          hasher.update(buf);
          tiles.push(relUrl);
        } catch (err) {
          console.warn(`[packs] Warning: missing base tile ${relUrl} (${err.code || err.message})`);
        }
      }
    }
  }

  return {
    id: "tiles_earth_base",
    name: "Earth Base Globe Tiles (z0–z2)",
    category: "tiles",
    description:
      "All 21 local NASA Blue Marble satellite tiles (zoom levels 0–2) cached into Cache Storage for 100% offline 3D globe rendering.",
    version: PACK_VERSION,
    file: null,
    url: null,
    sizeBytes: totalBytes,
    sizeLabel: formatBytes(totalBytes),
    sha256: hasher.digest("hex"),
    counts: {
      hubs: 0,
      events: 0,
      missions: 0,
      domains: 0,
      trails: 0,
      tiles: tiles.length
    },
    tiles
  };
}

// ---------------------------------------------------------------------------
// Pack writer
// ---------------------------------------------------------------------------

async function writePackFile(packSpec, payloadBody) {
  const fileName = `${packSpec.id}.json`;
  const counts = {
    hubs: payloadBody.hubs.length,
    events: payloadBody.events.length,
    missions: payloadBody.missions.length,
    domains: payloadBody.domains.length,
    trails: payloadBody.trails.length,
    ...(payloadBody.extraCounts || {})
  };

  const packJson = {
    meta: {
      id: packSpec.id,
      name: packSpec.name,
      category: packSpec.category,
      description: packSpec.description,
      version: PACK_VERSION,
      schemaVersion: PACK_SCHEMA_VERSION,
      generatedAt: BUILD_DATE,
      counts,
      ...(payloadBody.extraMeta || {})
    },
    hubs: payloadBody.hubs,
    events: payloadBody.events,
    missions: payloadBody.missions,
    domains: payloadBody.domains,
    trails: payloadBody.trails,
    ...(payloadBody.shanghai2026 ? { shanghai2026: payloadBody.shanghai2026 } : {}),
    ...(payloadBody.collaborations ? { collaborations: payloadBody.collaborations } : {})
  };

  // Compact minified JSON for fast mobile / offline download
  const serialized = JSON.stringify(packJson);
  const buf = Buffer.from(serialized, "utf8");
  const outPath = path.join(PACKS_DIR, fileName);
  await fs.writeFile(outPath, buf);

  return {
    id: packSpec.id,
    name: packSpec.name,
    category: packSpec.category,
    description: packSpec.description,
    version: PACK_VERSION,
    file: fileName,
    url: `./data/packs/${fileName}`,
    sizeBytes: buf.length,
    sizeLabel: formatBytes(buf.length),
    sha256: sha256Hex(buf),
    counts
  };
}

// ---------------------------------------------------------------------------
// Main build pipeline
// ---------------------------------------------------------------------------

async function main() {
  await fs.mkdir(PACKS_DIR, { recursive: true });

  const {
    allHubs,
    shanghaiExtraHubs,
    shanghai2026Raw,
    collaborationsRaw,
    allEvents,
    eras,
    allMissions,
    spaceZones,
    allDomains,
    allTrails,
    stemPresent
  } = await loadAllSources();

  // Build quick lookup maps for trail association
  const hubDisciplineById = new Map();
  const hubRegionById = new Map();
  for (const h of allHubs) {
    hubDisciplineById.set(h.id, h.discipline || "physics");
    const reg = classifyRegion(h);
    if (reg) hubRegionById.set(h.id, reg);
  }

  const manifestPacks = [];

  // 0. Dedicated ShanghaiRanking 2026 + Verified Collaborations Pack (complete offline rankings & ecosystem!)
  if (shanghai2026Raw) {
    const collabCount = collaborationsRaw?.collaborations?.length || 0;
    const srUnivCount = shanghai2026Raw?.meta?.totalUniversities || Object.keys(shanghai2026Raw.universities || {}).length;
    const srSubjCount = shanghai2026Raw?.meta?.subjectCount || (shanghai2026Raw.subjects || []).length;
    const entry = await writePackFile(
      {
        id: "pack_shanghai_2026",
        name: "ShanghaiRanking 2026 & Collaborations",
        category: "discipline",
        description:
          "Complete official ARWU 2026 Top 1,000 + all 57 GRAS 2026 academic subjects (19,650 subject rows across 1,972 universities), 1,126 geocoded ranked campuses, and 176 verified University–Lab–Company–Polar collaborations."
      },
      {
        hubs: shanghaiExtraHubs || [],
        events: [],
        missions: [],
        domains: [],
        trails: [],
        shanghai2026: shanghai2026Raw,
        collaborations: collaborationsRaw || { collaborations: [] },
        extraCounts: {
          rankedUniversities: srUnivCount,
          subjects: srSubjCount,
          collaborations: collabCount
        }
      }
    );
    manifestPacks.push(entry);
  }

  // 0B. Dedicated Polar Frontier Pack (All 75 Arctic, Svalbard, Greenland & Antarctic Bases + Polar Trails)
  const polarRaw = await readJsonSafe(path.join(STEM_DIR, "polar_frontier.json"));
  const polarHubs = extractArray(polarRaw, ["hubs", "items"]).map((h) => ({
    ...h,
    tier: h.tier || "stem",
    discipline: classifyItemDiscipline(h, "chem_earth")
  }));
  if (polarHubs.length) {
    const polarIdSet = new Set(polarHubs.map((h) => h.id));
    const polarCollabs = (collaborationsRaw?.collaborations || []).filter(
      (c) => polarIdSet.has(c.from) || polarIdSet.has(c.to)
    );
    const polarTrailIds = new Set(["polar_arctic_svalbard", "polar_antarctica_frontier", "listening_to_earth_climate_system"]);
    const polarTrails = allTrails.filter(t => polarTrailIds.has(t.id));
    const entry = await writePackFile(
      {
        id: "pack_polar_frontier",
        name: "Arctic, Svalbard & Antarctica Bases",
        category: "region",
        description:
          "75 off-grid polar research bases, Svalbard & Greenland observatories, South Pole neutrino/CMB arrays, 1.5M-year ice-core camps, zero-emission stations, and historic expeditions."
      },
      {
        hubs: polarHubs,
        events: [],
        missions: [],
        domains: [],
        trails: polarTrails,
        collaborations: { collaborations: polarCollabs },
        extraCounts: { collaborations: polarCollabs.length }
      }
    );
    manifestPacks.push(entry);
  }

  // 1. Discipline Packs
  for (const def of DISCIPLINE_PACK_DEFS) {
    const disc = def.discipline;
    const hubs = allHubs.filter((h) => h.discipline === disc);
    const events = allEvents.filter((e) => e.discipline === disc);
    const missions = disc === "physics" ? allMissions : [];
    const domains = allDomains.filter((d) => d.discipline === disc);
    const trails = allTrails.filter((t) => extractTrailDisciplines(t, hubDisciplineById).includes(disc));

    const extraMeta = {};
    if (events.length > 0 && eras.length > 0) extraMeta.eras = eras;
    if (missions.length > 0 && spaceZones.length > 0) extraMeta.spaceZones = spaceZones;

    const entry = await writePackFile(
      {
        id: def.id,
        name: def.name,
        category: "discipline",
        description: def.description
      },
      { hubs, events, missions, domains, trails, extraMeta }
    );
    manifestPacks.push(entry);
  }

  // 2. Continent / Region Packs (Organic Maps style)
  for (const def of REGION_PACK_DEFS) {
    const regionId = def.id;
    const hubs = allHubs.filter((h) => classifyRegion(h) === regionId);
    const events = allEvents.filter((e) => classifyRegion(e) === regionId);
    const missions = allMissions.filter((m) => classifyRegion(m) === regionId);
    const trails = allTrails.filter((t) => {
      const stops = Array.isArray(t.stops) ? t.stops : (Array.isArray(t.nodes) ? t.nodes : []);
      for (const stop of stops) {
        const hubId = typeof stop === "string" ? stop : (stop?.hubId || stop?.nodeId || stop?.id);
        if (hubId && hubRegionById.get(hubId) === regionId) return true;
        if (stop && typeof stop === "object" && classifyRegion(stop) === regionId) return true;
      }
      return classifyRegion(t) === regionId;
    });

    const extraMeta = {};
    if (events.length > 0 && eras.length > 0) extraMeta.eras = eras;
    if (missions.length > 0 && spaceZones.length > 0) extraMeta.spaceZones = spaceZones;

    const entry = await writePackFile(
      {
        id: def.id,
        name: def.name,
        category: "region",
        description: def.description
      },
      { hubs, events, missions, domains: [], trails, extraMeta }
    );
    manifestPacks.push(entry);
  }

  // 3. Base Offline Globe Tiles virtual pack
  const tilesEntry = await buildBaseTilesManifestEntry();
  manifestPacks.push(tilesEntry);

  // 4. Write manifest.json
  const totalPackBytes = manifestPacks.reduce((acc, p) => acc + p.sizeBytes, 0);
  const manifest = {
    schemaVersion: PACK_SCHEMA_VERSION,
    version: PACK_VERSION,
    generatedAt: BUILD_DATE,
    stemDatasetsDetected: stemPresent,
    summary: {
      totalPacks: manifestPacks.length,
      disciplinePacks: manifestPacks.filter((p) => p.category === "discipline").length,
      regionPacks: manifestPacks.filter((p) => p.category === "region").length,
      tilePacks: manifestPacks.filter((p) => p.category === "tiles").length,
      totalBytes: totalPackBytes,
      totalLabel: formatBytes(totalPackBytes),
      indexedHubs: allHubs.length,
      indexedEvents: allEvents.length,
      indexedMissions: allMissions.length,
      indexedDomains: allDomains.length,
      indexedTrails: allTrails.length,
      rankedUniversities: shanghai2026Raw?.meta?.totalUniversities || 0,
      rankedSubjects: shanghai2026Raw?.meta?.subjectCount || 0,
      collaborations: collaborationsRaw?.collaborations?.length || 0
    },
    packs: manifestPacks
  };

  const manifestPath = path.join(PACKS_DIR, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // Report summary
  console.log(`\nOffline Pack Compiler — built ${manifestPacks.length} packs (stem/ detected: ${stemPresent})`);
  console.log("─".repeat(98));
  console.log(
    `${"Pack ID".padEnd(28)} ${"Category".padEnd(11)} ${"Hubs".padStart(6)} ${"Events".padStart(6)} ${"Miss.".padStart(6)} ${"Dom.".padStart(5)} ${"Trls".padStart(5)} ${"Size".padStart(10)}  SHA-256 (short)`
  );
  console.log("─".repeat(98));
  for (const p of manifestPacks) {
    const c = p.counts;
    const hubsCol = p.category === "tiles" ? `${c.tiles}t` : String(c.hubs);
    console.log(
      `${p.id.padEnd(28)} ${p.category.padEnd(11)} ${hubsCol.padStart(6)} ${String(c.events).padStart(6)} ${String(c.missions).padStart(6)} ${String(c.domains).padStart(5)} ${String(c.trails).padStart(5)} ${p.sizeLabel.padStart(10)}  ${p.sha256.slice(0, 12)}`
    );
  }
  console.log("─".repeat(98));
  console.log(`Manifest written to ${path.relative(ROOT_DIR, manifestPath)} (combined packs: ${formatBytes(totalPackBytes)})\n`);
}

main().catch((err) => {
  console.error("[packs] Build failed:", err);
  process.exit(1);
});
