#!/usr/bin/env node
/**
 * Prunes heavy Web-only/on-demand data duplicates (~18 MB) from synced Capacitor
 * Android & iOS asset bundles while keeping packs/manifest.json intact so users
 * can download any SHA-256 verified offline pack on demand over HTTPS.
 */
import fs from "node:fs";
import path from "node:path";

const TARGETS = [
  "android/app/src/main/assets/public/data",
  "ios/App/App/public/data"
];

let totalSaved = 0;

for (const dir of TARGETS) {
  if (!fs.existsSync(dir)) continue;

  // 1. Remove 5.4 MB researcher NDJSON export from native binary (remains hosted on Web)
  const ndjson = path.join(dir, "physalts_unified.ndjson");
  if (fs.existsSync(ndjson)) {
    totalSaved += fs.statSync(ndjson).size;
    fs.unlinkSync(ndjson);
  }

  // 2. Remove 13 MB on-demand pack JSONs from native binary (keep manifest.json; downloaded on demand with SHA-256)
  const packsDir = path.join(dir, "packs");
  if (fs.existsSync(packsDir)) {
    for (const f of fs.readdirSync(packsDir)) {
      if (f === "manifest.json") continue;
      const fp = path.join(packsDir, f);
      if (fs.statSync(fp).isFile()) {
        totalSaved += fs.statSync(fp).size;
        fs.unlinkSync(fp);
      }
    }
  }
}

console.log(`Pruned ${(totalSaved / (1024 * 1024)).toFixed(2)} MB of redundant on-demand data from native mobile bundles.`);
