# PhysALT — App Store & Google Play Store Submission Kit

## 1. Core App Identity
- **App Name:** PhysALT — 3D STEM & Physics Atlas
- **Subtitle (iOS, 30 chars max):** 3D Globe for STEM, AI & Space
- **Short Description (Google Play, 80 chars max):** Explore 6,900+ STEM & polar labs, arXiv research, offline packs & 1 light-day.
- **Bundle ID / Application ID:** `org.worldofphysics.app`
- **Version:** `2.1.0` (Build `31`)
- **Primary Category:** Education (Secondary: Reference)
- **Age Rating:** 4+ (iOS) / Everyone (Google Play)
- **Pricing:** Free · Zero Ads · Open Science
- **Support & Website URL:** `https://nothinkaffee.github.io/PhysAlts/`
- **Privacy Policy URL:** `https://nothinkaffee.github.io/PhysAlts/privacy.html`
- **Terms of Service URL:** `https://nothinkaffee.github.io/PhysAlts/terms.html`

---

## 2. Full Store Description (Play Store & App Store)

Discover the entire world of science on one photoreal 3D globe — from ancient Miletus (580 BCE) to Voyager 1 at 1 Light-Day (173.1 AU) — set against a live 3D 4K ESO Milky Way sky dome and toggleable orbital sunlight.

**PhysALT** is an interactive, zero-clutter 3D satellite atlas built for curious minds, students, researchers, and engineers across **all of STEM & AI**:

- **6,926 Verified Institutions Across 166 Countries (Including 75 Polar Frontier Off-Grid Bases):** Physics colliders & observatories (CERN, IceCube, LIGO, ITER, ALMA), frontier AI & CS labs (Google DeepMind, OpenAI, Anthropic, MIT CSAIL, Mila), Arctic/Svalbard/Greenland/Siberia/Antarctic research stations, Mathematics, Biology, Chemistry, Earth & Climate, and Robotics & Semiconductors.
- **ShanghaiRanking 2026 (ARWU + 57 GRAS Subjects):** Official subject rankings, contextual institution badges, and transparent 5-pillar impact scoring.
- **Deep Research Studio (Free arXiv / alphaXiv / ROR + Optional Gemini):** Run zero-key agentic literature & institution discovery across arXiv, alphaXiv, INSPIRE-HEP, ROR v2, OpenAlex, and Wikipedia — or plug in your own Gemini API key for Grounded Search & Deep Research — and plot newly discovered institutions directly onto the 3D globe.
- **16 Curated Cross-STEM Rabbit Hole Trails:** Follow guided multi-stop journeys connecting Physics, AI, Polar Science, Math, Biology, and Space with full readable narrative cards and 1-tap stop switching.
- **15 SHA-256 Verified Offline Packages:** Download modular STEM Discipline Packs, Polar Frontier, Region Packs, and the Base Offline Earth Globe Tile Pack to explore 100% offline.
- **Interactive 1 Light-Day Space Frontier:** Inspect 36 verified missions from LEO to interstellar space and **Fire a Light Pulse** from Earth to Voyager 1 (`24h 00m 00s · 173.1 AU`).
- **Wikipedia Briefs & Official Primary Links:** Every hub card pairs hero photography with an expandable summary, recent arXiv/alphaXiv preprints, and direct links to official sites, OpenAlex, ROR, and Google Earth.

---

## 3. Keywords (Apple App Store — 100 chars max)
`science,physics,stem,ai,atlas,3d globe,research,university,space,voyager,arxiv,offline maps,labs`

---

## 4. Privacy & Data Safety Declarations (App Store Nutrition Label + Play Data Safety)
- **Data Used to Track You:** None. Zero third-party ad SDKs, zero cross-app tracking (`NSPrivacyTracking = false`).
- **Data Linked to You:** Optional account email & bookmarks only if the user voluntarily creates an account; full guest mode works with zero account required.
- **On-Device Offline Storage:** Downloaded STEM & region packs are stored exclusively locally in browser/WebView IndexedDB and Cache Storage.
- **GDPR Art. 17 & Art. 20:** Built-in 1-click data export (`.json` / `.csv`) and 1-click permanent erasure inside **Saved → Privacy & Tools**.

---

## 5. Build Artifacts & Submission Checklist

### Android (Google Play Console)
- **Debug / Sideload APK:** `dist/WorldOfPhysics-android.apk`
- **Play Store App Bundle (AAB):** `dist/WorldOfPhysics-android.aab`
- **Next Step to Publish:**
  1. Sign `dist/WorldOfPhysics-android.aab` with your Play App Signing upload keystore (`jarsigner` or Android Studio → Build → Generate Signed Bundle).
  2. Upload to Google Play Console → Production / Internal Testing track.
  3. Attach screenshots from `store_submission/screenshots/` and paste the listing copy above.

### iOS (Apple App Store Connect)
- **Synced Capacitor Project:** `ios/App/App.xcworkspace` (all All-STEM datasets, offline packs, and Wave-2 UI synced via `npx cap sync`).
- **Next Step to Publish (requires macOS + Xcode 15+):**
  1. Open `ios/App/App.xcworkspace` in Xcode.
  2. Select your Apple Developer Team under **Signing & Capabilities**.
  3. Select **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect**.
  4. Attach screenshots from `store_submission/screenshots/` and submit for App Review.

---

## 6. Launch Video A/B Testing Creative Matrix (Blender 4.0 + FFmpeg)
All 4 rendered videos are located in `dist/videos/`:
| Variant | Creative Angle | 16:9 Widescreen (1920×1080) | 9:16 Vertical (1080×1920) | Target Hypothesis |
| :--- | :--- | :--- | :--- | :--- |
| **Variant A** | *The Curiosity Rabbit Hole* | `dist/videos/launch_video_A_curiosity_rabbithole.mp4` | `dist/videos/launch_video_A_vertical.mp4` | Tests curiosity-driven hook (IceCube Wikipedia card + Agent Rabbit-Hole curation + Offline Packs) for learners & STEM students |
| **Variant B** | *From 1800 BCE to 1 Light-Day* | `dist/videos/launch_video_B_scale_of_science.mp4` | `dist/videos/launch_video_B_vertical.mp4` | Tests cosmic-scale awe hook (3D Light-Pulse rings + ARWU Impact filtering + live Voyager 1 Light Pulse) for broad tech/science audiences |
