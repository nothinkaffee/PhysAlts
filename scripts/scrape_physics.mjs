import fs from "node:fs/promises";
import path from "node:path";

const OUT_FILE = path.resolve("public/data/physics_hubs.json");
const CONTACT_EMAIL = process.env.OPENALEX_EMAIL || "contact@physalts.org";

const sleep = ms => new Promise(r => setTimeout(r, ms));

function isNoiseOrg(name, types = []) {
  const n = (name || "").toLowerCase();
  const t = types.map(x => String(x || "").toLowerCase());
  if (t.includes("healthcare") || t.includes("archive")) return true;
  if (/hospital|clinic|medical center|medical physics|radiology|west physics|consulting|health system|cancer center|therapy|dental|pharmacy/.test(n)) {
    return true;
  }
  if (
    t.includes("company") &&
    !/quantum|fusion|photonic|asml|laser|cryo|superconduct|cern|plasma|semiconductor|optic|magnet/.test(n)
  ) {
    return true;
  }
  return false;
}

function classifyBranch(text) {
  const t = (text || "").toLowerCase();
  if (/cern|fermi|collider|hadron|neutrino|particle|nuclear|cyclotron|accelerator|desy|kek|triumf|high energy/.test(t)) return "particle";
  if (/quantum|photon|laser|optic|euv|attosecond|qubit|nanophoton/.test(t)) return "quantum";
  if (/astro|observator|telescope|cosmo|space|radio|astron|planetar/.test(t)) return "astro";
  if (/fusion|plasma|tokamak|stellarator|iter|magnet/.test(t)) return "fusion";
  if (/gravit|relativ|ligo|virgo|kagra|theoretical|perimeter|ias|string/.test(t)) return "gravity";
  return "condensed";
}

function normalizeOpenAlex(inst, hint = "") {
  const g = inst.geo;
  if (!g || typeof g.latitude !== "number" || typeof g.longitude !== "number") return null;
  const name = (inst.display_name || "").trim();
  if (!name) return null;
  const type = (inst.type || "").toLowerCase();
  if (isNoiseOrg(name, [type])) return null;

  const group =
    type === "facility" ||
    type === "government" ||
    /lab|institute|observatory|cern|center|centre|synchrotron/.test(name.toLowerCase())
      ? "lab"
      : "uni";
  const topicNames = (inst.topics || []).slice(0, 4).map(t => t.display_name).join(", ");
  const country = g.country || inst.country_code || "";
  const works = inst.works_count || 0;
  const cites = inst.cited_by_count || 0;

  return {
    id: `oa-${(inst.id || name).split("/").pop()}`,
    name,
    city: `${g.city || "Research Hub"}${country ? ", " + country : ""}`,
    country,
    lat: Number(g.latitude.toFixed(5)),
    lng: Number(g.longitude.toFixed(5)),
    zoom: 15.6,
    group,
    branch: classifyBranch(`${name} ${topicNames} ${hint}`),
    pinned: false,
    sourceApi: "OpenAlex",
    url: inst.homepage_url || inst.id || "",
    summary: `Global physics ${group === "lab" ? "research facility" : "university department"} with ${works.toLocaleString()} indexed works and ${cites.toLocaleString()} citations.${topicNames ? " Active in " + topicNames + "." : ""}`
  };
}

function normalizeRor(org, hint = "") {
  const loc = org.locations?.[0]?.geonames_details;
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
  const name = org.names?.find(x => x.types?.includes("ror_display"))?.value || org.names?.[0]?.value;
  if (!name) return null;
  const types = (org.types || []).map(t => t.toLowerCase());
  if (isNoiseOrg(name, types)) return null;

  const group = types.includes("education") ? "uni" : "lab";
  const country = loc.country_name || "";
  return {
    id: `ror-${(org.id || name).split("/").pop()}`,
    name,
    city: `${loc.name || "Lab"}${country ? ", " + country : ""}`,
    country,
    lat: Number(loc.lat.toFixed(5)),
    lng: Number(loc.lng.toFixed(5)),
    zoom: 15.6,
    group,
    branch: classifyBranch(`${name} ${hint}`),
    pinned: false,
    sourceApi: "ROR",
    url: org.links?.[0]?.value || org.id || "",
    summary: `Verified ROR global physics research organization (${(org.types || []).join(", ") || "research"}).`
  };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": `PhysAltsBot/1.0 (mailto:${CONTACT_EMAIL})` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  const dedup = new Map();
  const addItem = item => {
    if (!item || !item.name) return;
    const key = item.name.toLowerCase().trim();
    if (!dedup.has(key)) dedup.set(key, item);
  };

  console.log("1/3 Harvesting OpenAlex Physics & Astronomy Universities (Field 31)...");
  for (let page = 1; page <= 12; page++) {
    try {
      const url = `https://api.openalex.org/institutions?filter=topics.field.id:fields/31,type:education&sort=cited_by_count:desc&per-page=200&page=${page}&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
      const data = await fetchJson(url);
      if (!data.results?.length) break;
      data.results.forEach(inst => addItem(normalizeOpenAlex(inst, "physics")));
      console.log(`   Universities page ${page}: ${dedup.size} total hubs`);
      await sleep(180);
    } catch (e) {
      console.warn(`   Skipped OpenAlex edu page ${page}: ${e.message}`);
    }
  }

  console.log("2/3 Harvesting OpenAlex Physics Facilities & National Labs (Field 31)...");
  for (let page = 1; page <= 6; page++) {
    try {
      const url = `https://api.openalex.org/institutions?filter=topics.field.id:fields/31,type:facility|government&sort=cited_by_count:desc&per-page=200&page=${page}&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
      const data = await fetchJson(url);
      if (!data.results?.length) break;
      data.results.forEach(inst => addItem(normalizeOpenAlex(inst, "particle quantum astro")));
      console.log(`   Facilities page ${page}: ${dedup.size} total hubs`);
      await sleep(180);
    } catch (e) {
      console.warn(`   Skipped OpenAlex facility page ${page}: ${e.message}`);
    }
  }

  console.log("3/3 Harvesting ROR v2 Observatories, Accelerators & Quantum Labs...");
  const rorQueries = ["physics", "observatory", "synchrotron", "quantum", "fusion", "nuclear physics", "astrophysics"];
  for (const q of rorQueries) {
    for (let page = 1; page <= 2; page++) {
      try {
        const url = `https://api.ror.org/v2/organizations?query=${encodeURIComponent(q)}&page=${page}`;
        const data = await fetchJson(url);
        if (!data.items?.length) break;
        data.items.forEach(org => addItem(normalizeRor(org, q)));
        await sleep(220);
      } catch (e) {
        console.warn(`   Skipped ROR (${q} p${page}): ${e.message}`);
      }
    }
  }

  const hubs = [...dedup.values()];
  const countries = new Set(hubs.map(h => h.country).filter(Boolean));
  const payload = {
    meta: {
      name: "PhysAlts Global Physics Index",
      generatedAt: new Date().toISOString(),
      totalHubs: hubs.length,
      totalCountries: countries.size,
      license: "CC0 (OpenAlex, ROR v2)"
    },
    hubs
  };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(payload), "utf8");
  console.log(`Done! Wrote ${hubs.length} clean physics hubs across ${countries.size} countries to ${OUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
