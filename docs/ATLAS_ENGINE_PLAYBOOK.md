# Atlas Engine Playbook — Reusable Multi-Subject Blueprint ("Physics → AI → All Sciences")

**PhysAlts** was architected not as a one-off physics map, but as the reference implementation of a **reusable, static-first, 3D Scientific & Knowledge Atlas Engine**.

This playbook documents every architectural layer, data schema, open-registry ETL pattern, live link-verification method, 3D globe + Time Counter + Scale Engine pattern, and compliance control built for PhysAlts — followed by a concrete, hour-by-hour blueprint to **clone PhysAlts into an AI Atlas (`aialts` / `org.aialts.app`) in 1 day**.

---

## 1. Core Architectural Principle: Engine Core vs. Subject Adapter

To spin up a new discipline without rewriting rendering, clustering, offline caching, mobile packaging, or GDPR compliance, the architecture strictly separates two layers:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    REUSABLE ATLAS ENGINE CORE (85%)                     │
│  • MapLibre GL 3D Satellite Globe + Hemisphere Culling + rAF Overlays   │
│  • Spatial Clustering + Collaboration Arcs / Pathway Connections        │
│  • Time Counter Engine (Chronological Epoch Scrubber & Filter)          │
│  • Scale / Frontier Visualizer (Logarithmic Multi-Order Zoom Axis)      │
│  • Instant Static Dataset Preloader (<200ms) + Live Registry Enrichment │
│  • 7-Stage Career Pathway Drawer + Shortlist Persistence                │
│  • Privacy & Data Controls (1-Click GDPR Export & Local+Cloud Erasure)  │
│  • Capacitor 6 Mobile Shell (iOS/Android) + CI Security/Link Auditor    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ reads
┌────────────────────────────────────▼────────────────────────────────────┐
│                       THIN SUBJECT ADAPTER (15%)                        │
│  1. config.js          — Subject identity, branches, stages, timeline,  │
│                          scale stops, API query hooks                   │
│  2. data/*_hubs.json   — Curated seeds + open-registry ETL dataset      │
│  3. scripts/scrape_*.mjs — OpenAlex/ROR/domain registry harvester       │
│  4. Brand assets       — public/icon.svg, manifest.json, capacitor ID   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Design Rule:** Never hardcode discipline terminology ("CERN", "Physics", "Field 31", "Light-Day") inside engine rendering modules (`globe`, `timeline`, `scale`, `privacy`, `search`). Every label, color palette, taxonomy key, milestone array, and scale stop is injected via the **Subject Adapter** (`config.js`).

---

## 2. Canonical Data Schema Standard

Every Atlas instance produces a single pre-verified static JSON bundle (`public/data/<subject>_hubs.json`) consumed in <200 ms at startup.

### 2.1 Top-Level Dataset Envelope

```json
{
  "meta": {
    "name": "PhysAlts Global Physics Index",
    "subject": "physics",
    "schemaVersion": "2.0",
    "generatedAt": "2026-11-22T21:39:24.170Z",
    "totalHubs": 4032,
    "totalCountries": 156,
    "license": "CC0 (OpenAlex, ROR v2)"
  },
  "hubs": [ /* Canonical Hub Objects */ ]
}
```

### 2.2 Canonical Hub Record

| Field | Type | Required | Constraints / Purpose |
|---|---|---|---|
| `id` | `string` | Yes | Globally unique slug (`cern`, `oa-I136199984`, `ror-01ggx4157`), 1–120 chars |
| `name` | `string` | Yes | Official display name, 2–160 chars |
| `city` | `string` | Yes | `"City, Country"` display string, ≤120 chars |
| `country` | `string` | Yes | Standardized country name (used for global coverage stats) |
| `lat` / `lng` | `number` | Yes | Valid WGS-84 coordinates (`-90..90`, `-180..180`); `(0, 0)` Null Island rejected |
| `zoom` | `number` | No | Preferred camera fly-to zoom (`12.0`–`17.0`, default `15.6`) |
| `group` | `string` | Yes | Entity archetype (`lab`, `uni`, `compute`, `policy`, `observatory`) |
| `branch` | `string` | Yes | Subject taxonomy key defined in `config.js` |
| `era` / `founded` | `number` | No | Founding/milestone year (powers the **Time Counter** chronological filter) |
| `pinned` | `boolean` | No | Highlights flagship/seed hubs at low globe zoom |
| `sourceApi` | `string` | Yes | Provenance (`Curated`, `OpenAlex`, `ROR`, `HuggingFace`, `TOP500`) |
| `url` | `string` | No | Must be empty `""` or valid `https://` homepage URL (verified in CI) |
| `wikiSlug` | `string` | No | Exact English Wikipedia article slug for live REST API summary/thumbnail |
| `summary` | `string` | Yes | Factual 1–3 sentence overview, ≤2000 chars |
| `nobel` / `breakthrough` | `string` | No | Landmark achievement or award attribution |
| `stages` | `object` | No | Map of career-stage keys → actionable entry pathways |
| `next` | `string[]` | No | Related hub IDs rendered as 3D geodesic collaboration arcs |
| `verified` | `boolean` | No | Set `true` for manually or CI-verified flagship records |

---

## 3. Open-Registry ETL & Anti-Noise Pipeline Pattern

PhysAlts proves you can index **4,000+ verified institutions across 156 countries** for \$0 infrastructure cost using open CC0 registries:

1. **Primary Bibliometric Backbone — OpenAlex (`api.openalex.org`):**
   - Query `https://api.openalex.org/institutions` filtered by `topics.field.id` or `topics.subfield.id` and `type:education` / `type:facility|government`.
   - Sort by `cited_by_count:desc` to guarantee highest-impact departments and national labs are harvested first.
   - Always pass `&mailto=<CONTACT_EMAIL>` to join the OpenAlex **Polite Pool** (higher rate limits, ethical scraping) and throttle requests (`150–250 ms` sleep between pages).
2. **Canonical Facility Backbone — ROR v2 (`api.ror.org/v2/organizations`):**
   - Captures specialized labs, observatories, consortia, and institutes that don't always rank high in general university citations.
   - Use `geonames_details.lat/lng` and `names[types=ror_display]`.
3. **Domain-Specific Curated Seed Overlay (`SEED_NODES`):**
   - Hand-verify 40–100 flagship hubs with rich multi-stage career pathways, milestone years, `next` collaboration arcs, and verified `wikiSlug`s.
   - Seed hubs always win deduplication merges over automated API records.
4. **Anti-Noise Filter (`isNoiseOrg`):**
   - Explicitly strip irrelevant entity types (`healthcare`, `archive`, hospitals, clinics, unrelated commercial consultancies) while whitelisting deep-tech/R&D companies matching domain keywords.
5. **Deterministic Deduplication & Classification:**
   - Deduplicate by normalized lowercase name (and optionally Haversine distance `< 1.5 km` with fuzzy name match to collapse duplicate campuses).
   - Map raw institution names + OpenAlex top topics into your Subject Adapter's 6–7 clean `branch` buckets.

---

## 4. Fact-Checking & Live Link Verification Pipeline (`verify_and_audit.mjs`)

Trust is the #1 moat of a scientific atlas. Every PR and weekly refresh must pass an automated verification gate (`node scripts/verify_and_audit.mjs --strict`):

1. **Schema & Structural Integrity:**
   - Valid JSON parse, required fields (`id`, `name`, `lat`, `lng`, `group`, `branch`, `sourceApi`) present on 100% of records.
   - Zero duplicate IDs; duplicate normalized names flagged.
   - Valid branch & group enums matching the Subject Adapter.
2. **Geospatial Sanity:**
   - `-90 <= lat <= 90`, `-180 <= lng <= 180`.
   - Reject Null Island (`lat === 0 && lng === 0`) and `NaN` / `Infinity` values.
3. **URL & Content Hygiene:**
   - Every non-empty `url` / `wiki` uses `https://` (upgrade or flag `http://`, strictly reject `javascript:` or malformed URIs).
   - Detect placeholder text (`TODO`, `TBD`, `example.com`) and zero unescaped HTML tags in summaries.
4. **Live Link Reachability Audit:**
   - Concurrently probe curated/flagship URLs (and sampled open-registry URLs) using `HEAD` with automatic `GET` fallback, respectful timeouts (e.g., 8–10 s), and retry on transient `429`/`5xx`.
   - Flag persistent `404`/`410`/DNS failures in `public/data/verification_report.json`.
   - Upload `verification_report.json` as a 30-day GitHub Actions audit artifact (`.github/workflows/security-and-qa.yml`) for traceability and SOC 2 PI1 evidence.

---

## 5. Interactive Spatial + Temporal + Scale Engine Pattern

PhysAlts pairs three coordinated mental models that generalize cleanly to any scientific domain:

### 5.1 3D Satellite Globe & Main-Thread Overlay Fallback
- **MapLibre GL CSP (`maplibre-gl-csp.js`)** renders high-resolution satellite tiles (Esri World Imagery) on a spherical 3D globe projection.
- **Hemisphere Culling & rAF Throttling:** Nodes on the far side of the globe are culled via spherical dot-product visibility checks so antipode pins never bleed through; canvas/DOM overlays are throttled to `requestAnimationFrame` for smooth 60 FPS orbiting on mobile GPUs.
- **Geodesic Arcs:** Connecting related hubs (`node.next`) turns a flat directory into an interactive research-collaboration graph.

### 5.2 Time Counter Engine (Chronological Epoch Scrubber)
- An interactive year scrubber lets users step through the history of the discipline (e.g., `1600 → 1905 → 1927 → 1964 → 2012 → 2026+`).
- Each epoch highlights **historical milestone pins** (where breakthroughs happened), filters/dim-codes institutions by founding/active era, and surfaces a concise narrative card explaining why that era changed the field.

### 5.3 Scale / Frontier Visualizer
- In Physics, zooming smoothly beyond Earth enters the **Space Frontier Scale** (`Earth 10⁷ m → Moon → Mars → Voyager 1 / 1 Light-Day → Observable Universe`) — grounding terrestrial observatories and particle colliders in the physical scales they probe.
- In other disciplines, swap this axis to the **defining logarithmic scale of that field** (e.g., Training Compute FLOPs for AI, Molecular Ångströms → Biosphere for Biology, Geologic Deep Time for Earth Sciences).

---

## 6. Security, Privacy & Compliance Reuse (4-Variable Swap)

Every new Atlas inherits PhysAlts' GDPR Art. 13–17 and SOC 2 technical readiness baseline with minimal edits:

1. **`firestore.rules`:** Change `col == 'physics_nodes'` → `col == '<subject>_nodes'`. Keep all coordinate bounds, HTTPS URL validation, key whitelists, immutable public nodes, and owner-only `allow delete` (GDPR Art. 17) intact.
2. **`public/privacy.html`:** Find/replace `PhysAlts` → `<NewAtlasName>`, `org.physalts.app` → `org.<newatlas>.app`, `privacy@physalts.org` → your domain email, and update the Open Science API table if you add new registries (e.g., Hugging Face / arXiv).
3. **`.github/workflows/security-and-qa.yml`:** Works out of the box with zero edits as long as your verifier remains at `scripts/verify_and_audit.mjs`.
4. **`capacitor.config.json` & `public/manifest.json`:** Update `appId`, `appName`, `name`, `short_name`, and `description`. Follow `docs/MOBILE_RELEASE_GUIDE.md` identically.

---

## 7. Cloning to AI Atlas (`aialts`) in 1 Day — Actionable Blueprint

Follow this exact 8-hour plan to launch **AIAlts — World of Artificial Intelligence** (`org.aialts.app`) by cloning PhysAlts.

### Hour 1 — Clone, Rebrand & Scaffold
```bash
git clone https://github.com/nothinkaffee/PhysAlts.git AIAlts
cd AIAlts
rm -rf .git && git init
```
Update core identity fields in:
- `package.json`: `"name": "aialts"`, description → AI labs, research universities, compute clusters, and AI career pathways.
- `capacitor.config.json`: `"appId": "org.aialts.app"`, `"appName": "AIAlts"`.
- `public/manifest.json`: `"name": "AIAlts — World of AI"`, `"short_name": "AIAlts"`.
- `firestore.rules`: change `col == 'physics_nodes'` → `col == 'ai_nodes'`.
- `public/privacy.html`: update brand, contact email (`privacy@aialts.org`), and add Hugging Face / arXiv / Epoch AI to the Open Data Attribution table.

### Hours 2–3 — Swap `config.js` Subject Adapter

Define the AI domain taxonomy, career stages, Time Counter milestones, and Compute Scale stops in `public/js/config.js`:

```js
export const SUBJECT_CONFIG = {
  id: "aialts",
  appName: "AIAlts",
  tagline: "World of Artificial Intelligence",
  datasetPath: "./data/ai_hubs.json",
  firestoreCollection: "ai_nodes",

  groups: {
    lab:     { label: "AI Labs & Startups", color: "#38bdf8" },
    uni:     { label: "University AI Institutes", color: "#a78bfa" },
    compute: { label: "Supercomputers & Compute", color: "#fbbf24" },
    policy:  { label: "AI Safety & Governance", color: "#34d399" }
  },

  branches: {
    frontier_models:  { label: "Frontier Models & Pretraining", color: "#38bdf8" },
    interpretability: { label: "Mechanistic Interpretability", color: "#c084fc" },
    rl_agents:        { label: "RL, Reasoning & Agents", color: "#f472b6" },
    robotics:         { label: "Embodied AI & Robotics", color: "#fb923c" },
    ai_hardware:      { label: "AI Hardware & Compute", color: "#fbbf24" },
    ai_safety:        { label: "AI Safety & Alignment", color: "#34d399" },
    ai_history:       { label: "Foundations & History of AI", color: "#94a3b8" }
  },

  stages: {
    highschool: { label: "High School / IOAI", hint: "AI Olympiads, fast.ai, Karpathy Zero-to-Hero, open-weights tinkering" },
    undergrad:  { label: "Undergrad / ML Intern", hint: "Research internships, NeurIPS/ICML undergrad workshops, Hugging Face OSS" },
    masters:    { label: "MSc / Research Engineer", hint: "Specialized ML MSc programs, training/eval engineering roles" },
    phd:        { label: "PhD / AI Residency", hint: "Funded ML PhDs (Mila, ETH, Stanford, CMU, ELLIS) & frontier lab residencies" },
    postdoc:    { label: "Postdoc / Research Scientist", hint: "Independent alignment, robotics, or pretraining research fellowships" },
    assoc_prof: { label: "Faculty / Staff Scientist", hint: "PI lab leadership, compute grants (NAIRR / EuroHPC), Staff ML roles" },
    prof:       { label: "Lab Director / Chief Scientist", hint: "Institute directorships, international AI safety boards, foundation consortia" }
  },

  // ── Time Counter: 1950 → 2030+ ───────────────────────────────────────────
  timeline: [
    { year: 1950, title: "Turing Test", place: "Manchester, UK", lat: 53.4668, lng: -2.2339, branch: "ai_history",
      summary: "Alan Turing publishes 'Computing Machinery and Intelligence', framing the imitation game and machine learning." },
    { year: 1956, title: "Dartmouth Workshop", place: "Hanover, NH, USA", lat: 43.7044, lng: -72.2887, branch: "ai_history",
      summary: "McCarthy, Minsky, Rochester, and Shannon coin 'Artificial Intelligence' as a research discipline." },
    { year: 1986, title: "Backpropagation Popularized", place: "San Diego / Pittsburgh, USA", lat: 32.8801, lng: -117.2340, branch: "ai_history",
      summary: "Rumelhart, Hinton, and Williams demonstrate practical multi-layer neural network training via backprop." },
    { year: 2012, title: "AlexNet & GPU Deep Learning", place: "Toronto, Canada", lat: 43.6629, lng: -79.3957, branch: "frontier_models",
      summary: "Krizhevsky, Sutskever, and Hinton shatter ImageNet error rates using CUDA GPUs, igniting modern deep learning." },
    { year: 2016, title: "AlphaGo", place: "London, UK / Seoul, South Korea", lat: 51.5322, lng: -0.1257, branch: "rl_agents",
      summary: "DeepMind combines deep neural networks with Monte Carlo Tree Search to master Go." },
    { year: 2017, title: "Attention Is All You Need", place: "Mountain View, CA, USA", lat: 37.4220, lng: -122.0841, branch: "frontier_models",
      summary: "The Transformer architecture eliminates recurrence, unlocking massive parallel pretraining and scaling." },
    { year: 2022, title: "Frontier LLMs & Multimodal Era (2022–2026)", place: "San Francisco / London / Paris / Beijing", lat: 37.7749, lng: -122.4194, branch: "frontier_models",
      summary: "Chat-tuned LLMs, test-time reasoning models, open-weights ecosystems, embodied robotics, and national AI Safety Institutes." },
    { year: 2030, title: "Scientific AI & Gigawatt Compute Frontier (2030+)", place: "Global Distributed Clusters", lat: 46.2330, lng: 6.0557, branch: "ai_hardware",
      summary: "Autonomous scientific discovery loops, formally verified alignment, and optical/neuromorphic compute substrates." }
  ],

  // ── Scale View Swap: Training Compute & Parameter Frontier ───────────────
  scaleAxis: {
    name: "Compute & Parameter Scale",
    unit: "FLOP",
    stops: [
      { id: "perceptron",  year: 1958, label: "Mark I Perceptron",       flops: 1e3,  params: "400 photocells",   note: "Hardware electro-mechanical weights at Cornell Aeronautical Lab." },
      { id: "lenet",       year: 1989, label: "LeNet-1 (CNN)",           flops: 1e9,  params: "~10K params",      note: "First practical convolutional net reading handwritten digits at Bell Labs." },
      { id: "alexnet",     year: 2012, label: "AlexNet",                 flops: 5e17, params: "60M params",       note: "Trained on 2× NVIDIA GTX 580 GPUs in Toronto." },
      { id: "transformer", year: 2017, label: "Transformer (Big)",       flops: 1e19, params: "213M params",      note: "8× P100 GPUs for 3.5 days; architectural root of modern LLMs." },
      { id: "gpt3",        year: 2020, label: "GPT-3 / Scaling Laws",    flops: 3e23, params: "175B params",      note: "Demonstrated smooth power-law capability gains across orders of magnitude." },
      { id: "frontier25",  year: 2025, label: "Frontier Multimodal Pods",flops: 5e25, params: "100K+ GPU pods",   note: "10²⁵–10²⁶ FLOP training runs with test-time RL reasoning." },
      { id: "gigawatt26",  year: 2027, label: "10²⁶–10²⁸+ FLOP Clusters",flops: 1e27, params: "Gigawatt fabrics", note: "Multi-datacenter optical interconnects powering next-gen frontier systems." }
    ]
  }
};
```

### Hours 4–5 — Build Open-Registry AI ETL (`scripts/scrape_ai.mjs`)

Clone `scripts/scrape_physics.mjs` → `scripts/scrape_ai.mjs` and swap the open registries:

| Registry | Endpoint / Filter | License | What It Contributes |
|---|---|---|---|
| **OpenAlex (CS & AI)** | `topics.field.id:fields/17` (and `topics.subfield.id:subfields/1702\|1707`) | CC0 1.0 | Top 2,500+ global university AI/ML/CV/NLP departments with citation counts & coordinates |
| **ROR v2** | Queries: `"artificial intelligence"`, `"machine learning"`, `"robotics"`, `"supercomputing"`, `"ai safety"`, `"computer vision"` | CC0 1.0 | Dedicated AI institutes (ELLIS, Mila, Vector, DFKI, RIKEN AIP, BAAI, MBZUAI, Alan Turing Institute) |
| **arXiv / Papers with Code** | `cs.AI`, `cs.LG`, `cs.CL`, `cs.RO`, `cs.CV` metadata | CC0 / CC BY-SA | Live paper enrichment & benchmark links in the facility detail card (replaces INSPIRE-HEP hook) |
| **Hugging Face Hub API** | `https://huggingface.co/api/organizations` (read-only public org stats) | Public API | Open-weights model & dataset counts for AI labs and universities |
| **Epoch AI / TOP500 Public Data** | Curated open CSV/JSON snapshots (with attribution) | CC BY 4.0 | Compute clusters & supercomputing centers (Frontier, El Capitan, Alps, LUMI, Fugaku, Jupiter) |
| **Curated Global AI Labs & Startups** | Maintained `AI_SEED_NODES` array | Curated | Flagship labs & startups across every region (US, UK, France, Germany, Switzerland, Canada, China, Japan, South Korea, India, UAE, Israel, Singapore, Africa, LATAM) |

Update `classifyBranch(text)` in `scripts/scrape_ai.mjs`:
- `/interpretability|mechanistic|sparse autoencoder|circuit/` → `"interpretability"`
- `/safety|alignment|governance|aisi|policy|ethics/` → `"ai_safety"`
- `/robot|embodied|manipulation|humanoid|autonomous/` → `"robotics"`
- `/reinforcement|agent|reasoning|rlhf|planning/` → `"rl_agents"`
- `/supercomput|hpc|cluster|chip|semiconductor|tpu|gpu|neuromorphic|photonic/` → `"ai_hardware"`
- `/foundation|llm|language model|multimodal|frontier|generative/` → `"frontier_models"`
- fallback → `"frontier_models"` (or `"ai_history"` for historical seed pins)

### Hour 6 — Run ETL & Strict Verification Audit
```bash
node scripts/scrape_ai.mjs
node scripts/verify_and_audit.mjs --strict
```
Inspect `public/data/verification_report.json` to ensure:
- Zero schema errors, zero Null Island `(0,0)` pins, zero broken flagship URLs.
- Balanced geographic representation across North America, Europe, Asia, Middle East, Africa, and Latin America.

### Hour 7 — Visual QA & Privacy Verification
```bash
npm run dev
```
Verify in browser (`http://localhost:5173`):
1. 3D globe loads `< 200 ms` with AI hubs, branch filter pills, and collaboration arcs.
2. Time Counter steps smoothly from `1950 Turing Test` → `2030+`.
3. Scale View transitions cleanly from `1958 Perceptron` → `10²⁶+ FLOP Frontier Clusters`.
4. **Privacy & Data Controls** exports JSON and erases local + cloud state cleanly.
5. `public/privacy.html` reflects `AIAlts` and all AI registries accurately.

### Hour 8 — Push to GitHub, Enable CI & Ship
1. Push to `main` — `.github/workflows/security-and-qa.yml` and `.github/workflows/update-and-deploy.yml` run automatically and publish your live GitHub Pages preview.
2. Run `npm run cap:add:android && npm run cap:add:ios && npm run cap:sync` to package native mobile apps following `docs/MOBILE_RELEASE_GUIDE.md`.

---

## 8. Future Atlas Family Roadmap

Using the exact same Subject Adapter swap, the Atlas Engine scales cleanly across all sciences:

| Atlas | App ID | OpenAlex Field | Time Counter Span | Scale Axis Swap |
|---|---|---|---|---|
| **PhysAlts** | `org.physalts.app` | Field 31 (Physics & Astronomy) | `1600` → `2035+` | Subatomic / Earth → 1 Light-Day Space Frontier |
| **AIAlts** | `org.aialts.app` | Field 17 (CS / AI & ML) | `1950` → `2030+` | Compute Scale (`10³` → `10²⁸+` FLOPs) |
| **BioAlts** | `org.bioalts.app` | Field 13 (Biochemistry, Genetics & Molecular Bio) | `1859` → `2030+` | Molecular (`10⁻¹⁰ m` DNA) → Global Biosphere |
| **ChemAlts** | `org.chemalts.app` | Field 16 (Chemistry & Materials) | `1789` → `2030+` | Atomic Bond (`1 Å`) → Industrial Catalysis |
| **GeoAlts** | `org.geoalts.app` | Field 19 (Earth & Planetary Sciences) | `4.5 Ga` → `2100` | Crustal Core → Planetary Atmosphere / Deep Time |
| **MathAlts** | `org.mathalts.app` | Field 26 (Mathematics) | `300 BCE` → `2030+` | Axiom → Formalized Proof Graphs (Lean/Mathlib) |

---

## 9. Google AI Pro Cloud & Android Stack (Multi-Atlas Hosting on Private Repos)

With **Google AI Pro** (via the Google Developer Program — **\$10/month Google Cloud & GenAI credits**, **30 Firebase Studio workspaces**, **Gemini Code Assist / CLI**, and **Android Studio Gemini**), you can run an entire family of private-repo atlases (`PhysAlts`, `AIAlts`, `BioAlts`, …) on production-grade global infrastructure at effectively **\$0 out-of-pocket**:

- **Multi-Site Firebase Hosting (Private GitHub Repos Supported):** Host each subject atlas (`physalts.org`, `aialts.org`, …) as its own Firebase Hosting site inside one GCP project (or isolated per-atlas projects), complete with global CDN, automatic SSL, and SOC 2/GDPR HTTP security headers (see the ready-to-use `firebase.json` snippet in [`docs/MOBILE_RELEASE_GUIDE.md`](./MOBILE_RELEASE_GUIDE.md#8-google-ai-pro-cloud--android-stack-public-hosting-from-a-private-repo)).
- **Shared or Isolated Firestore Rules:** Deploy `firestore.rules` alongside hosting (`firebase deploy --only hosting,firestore:rules`) using separate `appId` namespaces (`/artifacts/physalts/...`, `/artifacts/aialts/...`) or dedicated projects.
- **30 Firebase Studio Workspaces:** Spin up one isolated cloud workspace per subject atlas to prototype new Subject Adapters (`config.js`), test Firestore rules in emulators, and preview changes before merging.
- **Gemini CLI / Code Assist & Optional Server-Side Gemini API:** Use Gemini Code Assist/CLI to accelerate new domain scrapers (`scripts/scrape_ai.mjs`) and Android Studio Gemini for Capacitor 6 `.aab` builds. If you ever use your GenAI credits with the Gemini API (e.g., offline batch taxonomy classification during ETL or server-side Cloud Run enrichment), **keep API keys strictly server-side / in CI secrets — never embed Gemini API keys in `public/` client bundles**, and configure GCP billing alerts at \$5 / \$8 / \$10 per month.

