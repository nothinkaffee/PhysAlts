# PhysALT

**PhysALT** is an interactive, privacy-first **3D global STEM & physics atlas** — mapping **6,926 verified universities, national laboratories, polar off-grid stations, deep-tech startups, particle colliders, and observatories across 166 countries**, paired with **ShanghaiRanking 2026 (ARWU + 57 GRAS subjects)**, **176 verified research collaborations**, **16 Rabbit Hole journeys**, **15 SHA-256 offline packs**, **Deep Research Studio (arXiv / alphaXiv / ROR / Gemini)**, historical breakthroughs (`1800 BCE–2045`), and **36 Space Frontier missions out to 1 Light-Day**.

Built as a **static-first PWA + Capacitor 6 native app (iOS & Android, v2.2.0 / Build 34)** with 100% shared web/native parity and pruned ~18 MB leaner mobile binaries.

---

## Feature Matrix

| Capability | Description |
|---|---|
| **3D Satellite Globe & Hybrid Milky Way Sky** | MapLibre GL CSP WebGL globe with Esri World Imagery + NASA Blue Marble, true 3D camera horizon occlusion, **2-pass hybrid WebGL skybox** (faded star-free ESO Milky Way dust + 3,200 crisp native-Retina stars locked 1:1 to live globe rotation), and **3-state 3D Sunlight (`Orbital 45°` · `Live UTC` · `Off`)** with subtle golden night-side city lights. |
| **Global & Polar Open-Science Index** | **6,926 unique verified STEM hubs across 166 countries** — including **75 Polar Frontier off-grid Arctic, Svalbard, Greenland, Siberia & Antarctic stations** — with two-stage deferred boot for fast mobile startup. |
| **Deep Research Studio & Side-by-Side Compare** | Free zero-key agentic discovery across **arXiv & alphaXiv**, **INSPIRE-HEP**, **ROR v2**, **OpenAlex**, and **Wikipedia**, optional **BYOK Gemini 2.5 Flash & Deep Research**, plus **Side-by-Side Institution Compare** (up to 3 hubs across ARWU/GRAS, Impact, Citations, Collaborators & arXiv). |
| **ShanghaiRanking 2026 Integration** | Full ARWU & 57 GRAS subject tables, contextual institution badges, and 5-pillar impact breakdowns. |
| **Cinematic Timeline Tour & Rabbit Hole Trails** | **133 milestones (`1800 BCE–2045`)** with discipline filter tabs, documentary story spotlight, scrubber hover previews, 3 tour paces (`0.5× / 1× / 1.5×`), chronological geodesic arcs, and **16 curated cross-STEM Rabbit Hole journeys**. |
| **15 SHA-256 Offline Packs** | Modular downloadable discipline, region, Polar Frontier, and base Earth tile packs verified with SHA-256 into IndexedDB & Cache Storage (with automatic CDN fallback on slim mobile builds). |
| **1 Light-Day Space Frontier** | Interactive solar-to-interstellar visualizer with **36 verified space missions** from LEO to Voyager 1 (`24h · 173.1 AU`) and interactive **Fire Light Pulse (`c`)**. |
| **Cross-Platform Parity (Web · iOS · Android)** | Byte-identical Web PWA + **Capacitor 6** native Android (`APK`/`AAB` with optional CI signing) & iOS (`IPA`) builds (`org.worldofphysics.app`), mobile Globe Display controls, and native swipe-down-to-dismiss sheets. |

---

## Quickstart

### Prerequisites
- **Node.js 22+** and `npm`

### Run Locally
```bash
# 1. Install dependencies
npm install

# 2. (Optional) Refresh global dataset & provenance ledger
npm run scrape
npm run build:db

# 3. Run strict schema, hygiene & live link verification audit
npm run verify

# 4. Launch local dev server with CORS-safe API/tile proxy
npm run dev
```

---

## Mobile Packaging (Android & iOS via Capacitor 6)

PhysALT ships preconfigured for **Capacitor 6** (`org.worldofphysics.app` in `capacitor.config.json`, `v2.2.0` / Build `34`):

```bash
# Sync web assets (public/) into Android & iOS native projects and trim on-demand packs
npx cap sync android
npx cap sync ios
node scripts/prune_native_assets.mjs

# Open native IDEs
npm run cap:android   # Android Studio
npm run cap:ios       # Xcode (macOS)
```

GitHub Actions (`.github/workflows/build-mobile-apps.yml`) automatically builds and uploads both **Android (`APK` + `AAB`)** and **iOS (`macOS-15` Xcode Archive + unsigned `IPA`)** artifacts on every push to `main`.

See [`docs/MOBILE_RELEASE_GUIDE.md`](./docs/MOBILE_RELEASE_GUIDE.md) and [`store_submission/STORE_LISTING.md`](./store_submission/STORE_LISTING.md) for signing and store submission steps.

---

## Security, Compliance & CI Quality Gates

- **Hardened Firestore Rules ([`firestore.rules`](./firestore.rules)):** Whitelisted keys, coordinate bounds, HTTPS-only URLs, and owner-only erasure (`GDPR Art. 17`).
- **Privacy & Open Data Policy ([`public/privacy.html`](./public/privacy.html)):** Zero ads, zero GPS tracking, 1-click JSON/CSV export (`GDPR Art. 20`), and permanent local + cloud erasure.
- **Automated CI Workflows:**
  - [`.github/workflows/security-and-qa.yml`](./.github/workflows/security-and-qa.yml) — Schema & live link verification, `npm audit`, secret scan, and `firestore.rules` validation.
  - [`.github/workflows/update-and-deploy.yml`](./.github/workflows/update-and-deploy.yml) — Automated GitHub Pages deployment (`https://nothinkaffee.github.io/PhysAlts/`).
  - [`.github/workflows/build-mobile-apps.yml`](./.github/workflows/build-mobile-apps.yml) — Automated Android (`APK`/`AAB`) and iOS (`IPA`) builds.

---

## Open Data Attribution & Fair Use

- **OpenAlex** (`api.openalex.org`) — CC0 1.0 Public Domain
- **Research Organization Registry (ROR v2)** (`api.ror.org`) — CC0 1.0 Public Domain
- **INSPIRE-HEP** (`inspirehep.net`) — CC0 1.0 Public Domain
- **arXiv / alphaXiv via DataCite** (`api.datacite.org`) — Open scholarly metadata
- **Wikimedia REST API / Wikipedia** — CC BY-SA 4.0
- **ESO / Serge Brunier Milky Way Panorama (`eso0932a`)** — CC BY 4.0
- **NASA Blue Marble & Esri World Imagery** — Global satellite basemap imagery

Institution names are listed for factual educational directory purposes under nominative fair use. PhysALT is an independent open-science platform and is not affiliated with or endorsed by CERN, NASA, ESO, or any listed institution.
