# World of Science — App Store & Google Play Store Submission Kit

## 1. Core App Identity
- **App Name:** World of Science — STEM & Physics Atlas
- **Subtitle (iOS, 30 chars max):** 3D Globe for STEM, AI & Space
- **Short Description (Google Play, 80 chars max):** Explore 5,200+ STEM & AI labs, offline packs, rabbit-hole trails & 1 light-day.
- **Bundle ID / Application ID:** `org.worldofphysics.app`
- **Version:** `2.0.0` (Build `20`)
- **Primary Category:** Education (Secondary: Reference)
- **Age Rating:** 4+ (iOS) / Everyone (Google Play)
- **Pricing:** Free · Zero Ads · Open Science
- **Support & Website URL:** `https://nothinkaffee.github.io/PhysAlts/`
- **Privacy Policy URL:** `https://nothinkaffee.github.io/PhysAlts/privacy.html`
- **Terms of Service URL:** `https://nothinkaffee.github.io/PhysAlts/terms.html`

---

## 2. Full Store Description (Play Store & App Store)

Discover the entire world of science on one photoreal 3D globe — from ancient Miletus (580 BCE) to Voyager 1 at 1 Light-Day (173.1 AU).

**World of Science** is an interactive, zero-clutter 3D satellite atlas built for curious minds, students, researchers, and engineers across **all of STEM & AI**:

- **5,200+ Verified Institutions Across 155+ Countries:** Physics colliders & observatories (CERN, IceCube, LIGO, ITER, ALMA), frontier AI & CS labs (Google DeepMind, OpenAI, Anthropic, MIT CSAIL, Mila), Mathematics institutes (IHÉS, Oberwolfach, IAS, SLMath), Biology & Genomics centers (Broad Institute, Sanger, EMBL, Crick), Chemistry & Materials, Earth & Climate, and Robotics & Semiconductors.
- **ShanghaiRanking (ARWU/GRAS)-Inspired Research Impact Index:** Transparent 5-pillar impact scoring (Awards, OpenAlex Citations, CNCI Impact per Work, Mega-Facility Infrastructure, and International Collaboration) — extended across historical eras in Timeline mode.
- **Agent Deep Rabbit-Hole Research:** Search any concept (like *AlphaFold*, *CRISPR*, or *Quantum Error Correction*) and tap **Curate Trail** to generate a list of official primary references, verified hubs, origin milestones, landmark OpenAlex papers with DOIs, and crisp fun facts — never bloated filler essays.
- **Curated Cross-STEM Rabbit Hole Trails:** Follow 8 guided multi-stop journeys connecting Physics, AI, Math, Biology, and Space with 1-line bridges showing why each breakthrough connects to the next.
- **Organic-Maps Style Downloadable Offline Packages:** Download modular STEM Discipline Packs, 6 Continent/Region Packs, and the Base Offline Earth Globe Tile Pack (SHA-256 verified into IndexedDB & Cache Storage) to explore 100% offline on flights or trains.
- **Tailored Academic & Career Pathways (8 Levels):** Switch effortlessly from High School → Undergraduate → Master's → PhD → Postdoc → Associate Professor → Professor / PI to see relevant programs, internships, fellowships, and official portals on every card.
- **Interactive 1 Light-Day Space Frontier:** Switch to Space mode, inspect 36 verified missions from LEO to interstellar space, and **Fire a Light Pulse ($c$)** from Earth to Voyager 1 (`24h 00m 00s · 173.1 AU`).
- **Wikipedia Briefs & Official Primary Links:** Every hub card pairs hero photography with a crisp Wikipedia brief excerpt and direct links to official institution sites, OpenAlex papers, ROR records, and Google Earth.

---

## 3. Keywords (Apple App Store — 100 chars max)
`science,physics,stem,ai,atlas,3d globe,research,university,space,voyager,offline maps,phd,labs`

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
