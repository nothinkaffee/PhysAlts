import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "public/data");

const SCHEMA_OUT = path.join(DATA_DIR, "physalts_schema.json");
const LEDGER_OUT = path.join(DATA_DIR, "provenance_ledger.json");
const NDJSON_OUT = path.join(DATA_DIR, "physalts_unified.ndjson");

const SCHEMA_VERSION = "2.0.0";
const ATLAS_DOMAIN = "physics";

const GENERATED_FILES = new Set([
  "physalts_schema.json",
  "provenance_ledger.json",
  "physalts_unified.ndjson"
]);

const DATASET_METADATA = {
  "curated_flagships.json": {
    recordType: "Hub",
    tier: "curated_flagship",
    upstreamSources: ["Official Institution Websites", "Nobel Prize Archive", "Wikipedia API", "INSPIRE-HEP"],
    license: "Curated Nominative Fair Use + CC-BY-SA Reference Metadata"
  },
  "private_startups.json": {
    recordType: "Hub",
    tier: "private_startup",
    upstreamSources: ["Official Company Websites", "Fusion Industry Association", "QED-C", "ROR v2"],
    license: "Curated Nominative Fair Use"
  },
  "physics_hubs.json": {
    recordType: "Hub",
    tier: "global_index",
    upstreamSources: ["OpenAlex Institutions API (Field 31)", "ROR v2 Organizations API"],
    license: "CC0 (OpenAlex, ROR v2)"
  },
  "history_timeline.json": {
    recordType: "TimelineEvent",
    tier: "curated_timeline",
    upstreamSources: ["Nobel Prize Archive", "Stanford Encyclopedia of Philosophy", "Wikipedia CC-BY-SA"],
    license: "Curated Factual Chronology + CC-BY-SA Reference Links"
  },
  "space_frontier.json": {
    recordType: "SpaceMission",
    tier: "curated_space",
    upstreamSources: ["NASA", "ESA", "JAXA", "CNSA", "ISRO", "Wikipedia CC-BY-SA"],
    license: "Public Domain Agency Facts + CC-BY-SA Reference Links"
  },
  "domains_catalog.json": {
    recordType: "DomainCatalog",
    tier: "curated_taxonomy",
    upstreamSources: ["APS Physics Taxonomy", "arXiv Physics Categories", "Particle Data Group", "CODATA"],
    license: "Curated Taxonomy + CC0/CC-BY-SA References"
  },
  "verification_report.json": {
    recordType: "AuditReport",
    tier: "verification",
    upstreamSources: ["PhysAlts Automated Schema & Live HTTP Verifier"],
    license: "CC0 (Generated Audit Telemetry)"
  }
};

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}

function computeContentHash(record) {
  const clean = {};
  for (const [k, v] of Object.entries(record)) {
    if (!k.startsWith("_")) clean[k] = v;
  }
  return sha256Hex(JSON.stringify(canonicalize(clean)));
}

function buildAtlasEngineSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://physalts.org/schemas/atlas-engine-v2.schema.json",
    title: "Atlas Engine Unified Record Schema (PhysAlts v1 & Future AI Atlas v2)",
    description:
      "Formal Draft 2020-12 JSON Schema defining reusable record contracts across geographic research hubs, chronological milestones, frontier missions, domain taxonomies, and unified NDJSON warehouse exports.",
    version: SCHEMA_VERSION,
    $defs: {
      UrlString: {
        type: "string",
        format: "uri",
        pattern: "^https?://"
      },
      NullableUrlString: {
        oneOf: [
          { $ref: "#/$defs/UrlString" },
          { type: "string", maxLength: 0 },
          { type: "null" }
        ]
      },
      Latitude: {
        type: "number",
        minimum: -90,
        maximum: 90
      },
      Longitude: {
        type: "number",
        minimum: -180,
        maximum: 180
      },
      ContentHash: {
        type: "string",
        pattern: "^[a-f0-9]{64}$",
        description: "Deterministic SHA-256 hex digest of canonicalized record payload."
      },
      Hub: {
        type: "object",
        title: "Hub",
        description:
          "Geographic research institution, university department, national lab, observatory, private institute, or deep-tech company.",
        required: ["id", "name", "lat", "lng", "branch", "summary"],
        properties: {
          id: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1 },
          city: { type: "string" },
          country: { type: "string" },
          lat: { $ref: "#/$defs/Latitude" },
          lng: { $ref: "#/$defs/Longitude" },
          zoom: { type: "number", minimum: 1, maximum: 22 },
          group: { type: "string", enum: ["uni", "lab", "company", "institute", "observatory"] },
          entityType: { type: "string", enum: ["uni", "lab", "institute", "company"] },
          branch: { type: "string", minLength: 1 },
          foundedYear: { type: ["integer", "null"], minimum: 800, maximum: 2150 },
          status: { type: "string", enum: ["active", "planned", "historical", "merged"] },
          pinned: { type: "boolean" },
          url: { $ref: "#/$defs/NullableUrlString" },
          wiki: { $ref: "#/$defs/NullableUrlString" },
          wikiSlug: { type: ["string", "null"] },
          summary: { type: "string", minLength: 1 },
          nobel: { type: ["string", "null"] },
          stages: { type: "array", items: { type: "string" } },
          next: { type: "array", items: { type: "string" } },
          projects: { type: "array", items: { type: "string" } },
          fundingStage: { type: ["string", "null"] },
          focusArea: { type: ["string", "null"] },
          sourceApi: { type: "string" },
          verifiedSource: { type: "string" }
        },
        additionalProperties: true
      },
      TimelineEvent: {
        type: "object",
        title: "TimelineEvent",
        description:
          "Chronological milestone in the history of science/physics (or AI in v2) optionally anchored to geographic coordinates.",
        required: ["id", "year", "title", "summary"],
        properties: {
          id: { type: "string", minLength: 1 },
          year: { type: "integer", minimum: -3500, maximum: 2150 },
          endYear: { type: ["integer", "null"], minimum: -3500, maximum: 2150 },
          eraId: { type: "string" },
          title: { type: "string", minLength: 1 },
          figure: { type: "string" },
          location: { type: "string" },
          country: { type: "string" },
          lat: { oneOf: [{ $ref: "#/$defs/Latitude" }, { type: "null" }] },
          lng: { oneOf: [{ $ref: "#/$defs/Longitude" }, { type: "null" }] },
          branch: { type: "string" },
          category: { type: "string" },
          summary: { type: "string", minLength: 1 },
          impact: { type: "string" },
          officialUrl: { $ref: "#/$defs/NullableUrlString" },
          wikiUrl: { $ref: "#/$defs/NullableUrlString" }
        },
        additionalProperties: true
      },
      SpaceMission: {
        type: "object",
        title: "SpaceMission",
        description:
          "Spaceborne observatory, orbital laboratory, or deep-space probe mapped along logarithmic light-time distance.",
        required: ["id", "name", "summary"],
        properties: {
          id: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1 },
          agency: { type: "string" },
          country: { type: "string" },
          zoneId: { type: "string" },
          body: { type: "string" },
          distanceAU: { type: ["number", "null"], minimum: 0 },
          lightTimeSec: { type: ["number", "null"], minimum: 0 },
          lightTimeLabel: { type: "string" },
          launchYear: { type: ["integer", "null"], minimum: 1957, maximum: 2150 },
          status: { type: "string" },
          branch: { type: "string" },
          summary: { type: "string", minLength: 1 },
          physicsDiscoveries: { type: "string" },
          instruments: { type: "array", items: { type: "string" } },
          officialUrl: { $ref: "#/$defs/NullableUrlString" },
          wikiUrl: { $ref: "#/$defs/NullableUrlString" }
        },
        additionalProperties: true
      },
      DomainCatalog: {
        type: "object",
        title: "DomainCatalog",
        description:
          "Hierarchical taxonomy node representing a major branch or specialized subdomain, equations, open problems, and flagship facilities.",
        required: ["id", "name", "summary"],
        properties: {
          id: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1 },
          title: { type: "string" },
          parentDomainId: { type: ["string", "null"] },
          level: { type: "string", enum: ["domain", "subdomain", "topic"] },
          branch: { type: "string" },
          color: { type: "string" },
          summary: { type: "string", minLength: 1 },
          keyEquations: { type: "array", items: { type: "string" } },
          openProblems: { type: "array", items: { type: "string" } },
          keyConcepts: { type: "array", items: { type: "string" } },
          flagshipHubIds: { type: "array", items: { type: "string" } },
          officialUrl: { $ref: "#/$defs/NullableUrlString" },
          wikiUrl: { $ref: "#/$defs/NullableUrlString" }
        },
        additionalProperties: true
      },
      UnifiedNdjsonRecord: {
        type: "object",
        title: "UnifiedNdjsonRecord",
        description:
          "Canonical NDJSON warehouse row ready for BigQuery, Firestore, DuckDB, PostgreSQL/PostGIS, or Capacitor SQLite.",
        required: ["_recordType", "_atlasDomain", "_sourceDataset", "_schemaVersion", "_contentHash"],
        properties: {
          _recordType: {
            type: "string",
            enum: ["Hub", "TimelineEvent", "SpaceMission", "DomainCatalog"]
          },
          _atlasDomain: { type: "string", minLength: 1 },
          _sourceDataset: { type: "string", minLength: 1 },
          _tier: { type: "string" },
          _schemaVersion: { type: "string" },
          _contentHash: { $ref: "#/$defs/ContentHash" }
        },
        allOf: [
          {
            if: { properties: { _recordType: { const: "Hub" } } },
            then: { $ref: "#/$defs/Hub" }
          },
          {
            if: { properties: { _recordType: { const: "TimelineEvent" } } },
            then: { $ref: "#/$defs/TimelineEvent" }
          },
          {
            if: { properties: { _recordType: { const: "SpaceMission" } } },
            then: { $ref: "#/$defs/SpaceMission" }
          },
          {
            if: { properties: { _recordType: { const: "DomainCatalog" } } },
            then: { $ref: "#/$defs/DomainCatalog" }
          }
        ]
      }
    },
    oneOf: [{ $ref: "#/$defs/UnifiedNdjsonRecord" }]
  };
}

function extractPrimaryRecords(filename, parsed) {
  if (filename === "verification_report.json") {
    return { records: [], isUnifiedExport: false };
  }
  if (Array.isArray(parsed)) {
    return { records: parsed, isUnifiedExport: true };
  }
  if (!parsed || typeof parsed !== "object") {
    return { records: [], isUnifiedExport: false };
  }

  // Domain catalogs may hold top-level domains with nested subdomains
  if (filename === "domains_catalog.json") {
    const domains =
      parsed.domains || parsed.branches || parsed.catalog || parsed.items || [];
    const flattened = [];
    for (const dom of Array.isArray(domains) ? domains : []) {
      const domId = String(dom.id || dom.slug || dom.name || dom.title || "domain");
      const domName = dom.name || dom.title || domId;
      const domSummary = dom.summary || dom.description || dom.overview || `${domName} physics domain.`;
      const { subdomains, subfields, topics, ...restDom } = dom;
      flattened.push({
        ...restDom,
        id: domId,
        name: domName,
        parentDomainId: null,
        level: "domain",
        summary: domSummary
      });
      const children = subdomains || subfields || topics || [];
      if (Array.isArray(children)) {
        for (const sub of children) {
          if (typeof sub === "string") {
            const subId = `${domId}__${sub.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
            flattened.push({
              id: subId,
              name: sub,
              parentDomainId: domId,
              branch: dom.branch || domId,
              level: "subdomain",
              summary: `Subdomain of ${domName}: ${sub}.`
            });
          } else if (sub && typeof sub === "object") {
            const subId = String(
              sub.id || `${domId}__${String(sub.name || sub.title || "sub").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
            );
            const subName = sub.name || sub.title || subId;
            flattened.push({
              ...sub,
              id: subId,
              name: subName,
              parentDomainId: domId,
              branch: sub.branch || dom.branch || domId,
              level: "subdomain",
              summary: sub.summary || sub.description || sub.overview || `Subdomain of ${domName}: ${subName}.`
            });
          }
        }
      }
    }
    return { records: flattened, isUnifiedExport: true };
  }

  const candidateKeys = [
    "hubs",
    "events",
    "missions",
    "startups",
    "companies",
    "flagships",
    "items",
    "entries",
    "records",
    "domains"
  ];
  for (const key of candidateKeys) {
    if (Array.isArray(parsed[key])) {
      return { records: parsed[key], isUnifiedExport: true };
    }
  }
  return { records: [], isUnifiedExport: false };
}

function inferRecordType(filename, parsed) {
  if (DATASET_METADATA[filename]) return DATASET_METADATA[filename].recordType;
  if (parsed?.events) return "TimelineEvent";
  if (parsed?.missions) return "SpaceMission";
  if (parsed?.domains) return "DomainCatalog";
  return "Hub";
}

function collectDistinctCountries(records) {
  const set = new Set();
  for (const rec of records) {
    if (rec && typeof rec.country === "string" && rec.country.trim()) {
      set.add(rec.country.trim());
    }
  }
  return set;
}

async function main() {
  const startedAt = Date.now();
  await fs.mkdir(DATA_DIR, { recursive: true });

  console.log("=== PhysAlts Provenance Ledger, Schema & Unified NDJSON Builder ===");

  // 1. Write formal Draft 2020-12 JSON Schema
  const schemaObj = buildAtlasEngineSchema();
  const schemaJson = JSON.stringify(schemaObj, null, 2) + "\n";
  await fs.writeFile(SCHEMA_OUT, schemaJson, "utf8");
  const schemaSha256 = sha256Hex(Buffer.from(schemaJson, "utf8"));
  console.log(`1/3 Wrote JSON Schema (Draft 2020-12) -> ${SCHEMA_OUT}`);

  // 2. Discover and process all JSON datasets in public/data/
  const dirEntries = await fs.readdir(DATA_DIR);
  const datasetFiles = dirEntries
    .filter(f => f.endsWith(".json") && !GENERATED_FILES.has(f))
    .sort((a, b) => a.localeCompare(b));

  const ledgerDatasets = [];
  const globalCountries = new Set();
  const ndjsonLines = [];
  const byRecordType = { Hub: 0, TimelineEvent: 0, SpaceMission: 0, DomainCatalog: 0 };

  let totalBytes = 0;
  let totalRecords = 0;

  for (const file of datasetFiles) {
    const fullPath = path.join(DATA_DIR, file);
    const [rawBuf, stat] = await Promise.all([fs.readFile(fullPath), fs.stat(fullPath)]);
    const fileSha256 = sha256Hex(rawBuf);
    const parsed = JSON.parse(rawBuf.toString("utf8"));

    const metaSpec = DATASET_METADATA[file] || {};
    const recordType = inferRecordType(file, parsed);
    const tier = metaSpec.tier || "dataset";
    const { records, isUnifiedExport } = extractPrimaryRecords(file, parsed);
    const countries = collectDistinctCountries(records);
    for (const c of countries) globalCountries.add(c);

    const license =
      parsed?.meta?.license || metaSpec.license || "Curated Nominative Fair Use";
    const upstreamSources =
      Array.isArray(parsed?.meta?.sources) && parsed.meta.sources.length
        ? parsed.meta.sources
        : metaSpec.upstreamSources || ["PhysAlts Data Pipeline"];

    const recordCount =
      file === "verification_report.json"
        ? Number(parsed?.summary?.linksChecked || 0)
        : records.length;

    totalBytes += stat.size;
    if (isUnifiedExport) totalRecords += records.length;

    ledgerDatasets.push({
      file,
      sha256: fileSha256,
      byteSize: stat.size,
      recordType,
      tier,
      recordCount,
      distinctCountries: countries.size,
      upstreamSources,
      license,
      schemaVersion: SCHEMA_VERSION,
      datasetVersion: parsed?.meta?.version || null,
      modifiedAt: stat.mtime.toISOString()
    });

    if (isUnifiedExport) {
      for (const rec of records) {
        const contentHash = computeContentHash(rec);
        const unifiedRow = {
          _recordType: recordType,
          _atlasDomain: ATLAS_DOMAIN,
          _sourceDataset: file,
          _tier: tier,
          _schemaVersion: SCHEMA_VERSION,
          _contentHash: contentHash,
          ...rec
        };
        ndjsonLines.push(JSON.stringify(unifiedRow));
        byRecordType[recordType] = (byRecordType[recordType] || 0) + 1;
      }
    }

    console.log(
      `   [Ledger] ${file}: ${recordCount} records, ${countries.size} countries, ${(stat.size / 1024).toFixed(1)} KB, sha256=${fileSha256.slice(0, 12)}...`
    );
  }

  // 3. Write unified NDJSON export
  const ndjsonContent = ndjsonLines.length ? ndjsonLines.join("\n") + "\n" : "";
  await fs.writeFile(NDJSON_OUT, ndjsonContent, "utf8");
  const ndjsonBuf = Buffer.from(ndjsonContent, "utf8");
  const ndjsonSha256 = sha256Hex(ndjsonBuf);
  console.log(
    `2/3 Wrote unified NDJSON (${ndjsonLines.length} rows, ${(ndjsonBuf.length / 1024).toFixed(1)} KB) -> ${NDJSON_OUT}`
  );

  // 4. Compute deterministic Merkle-style integrity root over all source datasets
  const merkleInput = ledgerDatasets
    .map(d => `${d.file}:${d.sha256}`)
    .sort()
    .join("\n");
  const merkleRootSha256 = sha256Hex(merkleInput);

  const ledger = {
    name: "PhysAlts Cryptographic Data Provenance Ledger",
    atlasDomain: ATLAS_DOMAIN,
    schemaVersion: SCHEMA_VERSION,
    jsonSchemaDraft: "https://json-schema.org/draft/2020-12/schema",
    schemaRef: "physalts_schema.json",
    generatedAt: new Date().toISOString(),
    merkleRootSha256,
    summary: {
      totalSourceFiles: ledgerDatasets.length,
      totalSourceBytes: totalBytes,
      totalUnifiedRecords: ndjsonLines.length,
      totalDistinctCountries: globalCountries.size,
      byRecordType
    },
    datasets: ledgerDatasets,
    generatedArtifacts: {
      schema: {
        file: "physalts_schema.json",
        sha256: schemaSha256,
        byteSize: Buffer.byteLength(schemaJson, "utf8")
      },
      unifiedNdjson: {
        file: "physalts_unified.ndjson",
        sha256: ndjsonSha256,
        byteSize: ndjsonBuf.length,
        rowCount: ndjsonLines.length
      }
    }
  };

  await fs.writeFile(LEDGER_OUT, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`3/3 Wrote provenance ledger (merkle=${merkleRootSha256.slice(0, 16)}...) -> ${LEDGER_OUT}`);
  console.log(`\nDone in ${elapsedSec}s! Unified breakdown:`, JSON.stringify(byRecordType));
}

main().catch(err => {
  console.error("Provenance/DB build failed:", err);
  process.exit(1);
});
