# PhysALT

**PhysALT** is an interactive, privacy-first **3D global STEM & physics atlas** — mapping **6,926 verified universities, national laboratories, polar off-grid stations, deep-tech startups, particle colliders, and observatories across 166 countries**, paired with **ShanghaiRanking 2026 (ARWU + 57 GRAS subjects)**, **176 verified research collaborations**, **16 Rabbit Hole journeys**, **15 SHA-256 offline packs**, **Deep Research Studio (arXiv / alphaXiv / ROR / Gemini)**, historical breakthroughs (`1800 BCE–2045`), and **36 Space Frontier missions out to 1 Light-Day**.

Built as a **static-first PWA + Capacitor 6 native app (iOS & Android, v2.1.0 / Build 31)** with 100% shared web/native parity.

---

## Feature Matrix

| Capability | Description |
|---|---|
| **3D Satellite Globe & 4K Milky Way Sky** | MapLibre GL CSP WebGL globe with Esri World Imagery + NASA Blue Marble, true 3D camera horizon occlusion, **4K ESO Photographic Milky Way WebGL skybox** (`eso0932a`) synced 1:1 with live globe rotation, and toggleable **3D Orbital Sun Lighting (`Sun`)**. |
| **Global & Polar Open-Science Index** | **6,926 unique verified STEM hubs across 166 countries** — including **75 Polar Frontier off-grid Arctic, Svalbard, Greenland, Siberia & Antarctic stations** — preloaded from static open-registry JSON bundles. |
| **Deep Research Studio (Free + BYOK Gemini)** | Free zero-key agentic discovery across **arXiv & alphaXiv** (via DataCite `10.48550`), **INSPIRE-HEP**, **ROR v2** (110k+ geocoded institutions), **OpenAlex**, and **Wikipedia**, plus optional **BYOK Gemini 2.5 Flash Grounded Search**, **Gemini Deep Research Interactions API**, 1-tap **Gemini App** handoff, and live **Plot & Fly →** globe pins. |
| **ShanghaiRanking 2026 Integration** | Full ARWU & 57 GRAS subject tables, contextual institution badges, and 5-pillar impact breakdowns. |
| **Rabbit Hole Trails & Time Counter** | **16 curated cross-STEM journeys** with clean full-text floating cards and 1-tap stop switchers, plus a chronological **1800 BCE → 2045** breakthrough timeline. |
| **15 SHA-256 Offline Packs** | Modular downloadable discipline, region, Polar Frontier, and base Earth tile packs verified with SHA-256 into IndexedDB & Cache Storage. |
| **1 Light-Day Space Frontier** | Interactive solar-to-interstellar visualizer with **36 verified space missions** from LEO out to Voyager 1 (`24h · 173.1 AU`). |
| **Cross-Platform Parity (Web · iOS · Android)** | Byte-identical Web PWA + **Capacitor 6** native Android (`APK`/`AAB`) & iOS (`IPA`) builds (`org.worldofphysics.app`), automated in GitHub Actions. |

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

PhysALT ships preconfigured for **Capacitor 6** (`org.worldofphysics.app` in `capacitor.config.json`, `v2.1.0` / Build `31`):

```bash
# Sync web assets (public/) into Android & iOS native projects
npx cap sync android
npx cap sync ios

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
