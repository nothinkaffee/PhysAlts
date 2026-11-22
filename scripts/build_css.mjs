import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_CSS = path.join(ROOT_DIR, "public/vendor/tailwind.css");
const CONTENT_GLOB = "./public/index.html,./public/privacy.html,./public/js/**/*.js";

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const startedAt = Date.now();
  await fs.mkdir(path.dirname(OUTPUT_CSS), { recursive: true });

  const localInput = path.join(ROOT_DIR, "tailwind.input.css");
  let inputFile = localInput;
  let tempDir = null;

  if (!(await fileExists(localInput))) {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "physalts-tw-"));
    inputFile = path.join(tempDir, "input.css");
    await fs.writeFile(
      inputFile,
      "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n",
      "utf8"
    );
  }

  console.log("Building minified Tailwind CSS v3.4.17...");
  console.log(`  Content: ${CONTENT_GLOB}`);
  console.log(`  Output:  ${OUTPUT_CSS}`);

  try {
    const args = [
      "--yes",
      "tailwindcss@3.4.17",
      "-i",
      inputFile,
      "-o",
      OUTPUT_CSS,
      "--content",
      CONTENT_GLOB,
      "--minify"
    ];

    const result = spawnSync("npx", args, {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: process.env
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`tailwindcss exited with status ${result.status}`);
    }

    const stat = await fs.stat(OUTPUT_CSS);
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `Done in ${elapsedSec}s! Wrote ${(stat.size / 1024).toFixed(1)} KB to ${OUTPUT_CSS}`
    );
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch(err => {
  console.error("CSS build failed:", err.message);
  process.exit(1);
});
