# PhysAlts — Mobile Release Guide (Android & iOS via Capacitor 6)

This guide provides a step-by-step, reproducible workflow to package, sign, test, and ship **PhysAlts** (`org.physalts.app`) to **Google Play (Android)** and the **Apple App Store (iOS)** using **Capacitor 6** (`@capacitor/core` `^6.1.2`).

It includes dedicated instructions for **Linux / Ubuntu developers shipping to iOS without a Mac** via Codemagic CI/CD.

---

## 1. App Identity & Current Configuration

Defined in `capacitor.config.json`:

| Field | Value |
|---|---|
| **App ID / Bundle ID** | `org.physalts.app` |
| **App Name** | `PhysAlts` |
| **Web Assets Directory (`webDir`)** | `public` |
| **Android Scheme** | `https` (`allowMixedContent: false`) |
| **iOS Content Inset** | `always` (respects notch & Dynamic Island safe areas) |
| **Background / Splash Color** | `#030509` (`launchShowDuration: 1200`, `showSpinner: false`) |

---

## 2. Prerequisites

### Common (All Platforms)
- **Node.js 20 LTS** and `npm`
- Clean, audited web build inside `public/` (`npm run verify` passing)

### Android Release (Linux, macOS, or Windows)
- **JDK 17** (Temurin / OpenJDK 17)
- **Android Studio** (Jellyfish / Ladybug or newer) with:
  - Android SDK Platform **34** (Android 14) or **35** (Android 15 — required by Google Play for new releases)
  - Android SDK Build-Tools & Command-Line Tools
- **Google Play Console** developer account

### iOS Release (Two Options)
- **Option A — Local macOS:** macOS 14+, **Xcode 15+**, **CocoaPods** (`brew install cocoapods`), and an **Apple Developer Program** account.
- **Option B — Linux / Ubuntu (No Mac Required):** An **Apple Developer Program** account + **App Store Connect API Key** + **Codemagic CI/CD** (free macOS build minutes available; see Section 6.2).

---

## 3. Initialize Native Projects & Sync Web Assets

Run from the repository root (`/path/to/PhysAlts`):

```bash
# 1. Install dependencies
npm ci

# 2. Refresh dataset (optional) and run strict verification audit
node scripts/verify_and_audit.mjs --strict

# 3. Generate native Android & iOS projects (first time only)
npm run cap:add:android
npm run cap:add:ios

# 4. Copy public/ web bundle and sync native plugins/config
npm run cap:sync
```

> **Note:** By default `.gitignore` excludes generated `android/` and `ios/` folders so the web repo stays lightweight. If you add custom native signing templates, icons, or `PrivacyInfo.xcprivacy`, either commit the tailored native config files or generate them deterministically in CI (shown in Section 6.2).

---

## 4. Adaptive Icons, Splash Screens & Safe-Area Handling

### 4.1 Generating All iOS & Android Icons/Splashes from `public/icon.svg`

Capacitor's official asset generator (`@capacitor/assets`) creates Android Adaptive Icons, monochrome notification icons, iOS `AppIcon.appiconset`, and dark splash screens automatically.

1. Export `public/icon.svg` to PNG source assets inside a `resources/` folder:
   - `resources/icon-only.png` (`1024x1024`, opaque `#030509` background)
   - `resources/icon-foreground.png` (`1024x1024`, transparent background, orbital atom centered with ~20% outer padding for Android adaptive mask safety)
   - `resources/icon-background.png` (`1024x1024`, solid `#030509` or subtle radial `#1d2432 -> #030509`)
   - `resources/splash-dark.png` (`2732x2732`, `#030509` background with centered logo)
   - `resources/splash.png` (copy of `splash-dark.png` to maintain dark-first startup)

   Quick rasterization on Ubuntu/macOS using ImageMagick or Inkscape:
   ```bash
   mkdir -p resources
   # Using Inkscape (recommended for crisp SVG rendering)
   inkscape public/icon.svg --export-type=png --export-width=1024 --export-height=1024 --export-filename=resources/icon-only.png
   cp resources/icon-only.png resources/icon-foreground.png
   ```

2. Run `@capacitor/assets`:
   ```bash
   npx @capacitor/assets generate \
     --iconBackgroundColor '#030509' \
     --iconBackgroundColorDark '#030509' \
     --splashBackgroundColor '#030509' \
     --splashBackgroundColorDark '#030509'
   ```

### 4.2 Safe-Area & Edge-to-Edge Display Checklist
PhysAlts already includes:
- `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`
- `ios.contentInset: "always"` in `capacitor.config.json`
- Dark `#030509` WebView background to eliminate white flashes on launch or overscroll

Verify on both notched iPhone simulators and Android gesture-navigation devices that:
- Top navigation pills clear `env(safe-area-inset-top)`
- Bottom dock / timeline controls clear `env(safe-area-inset-bottom)` (Home Indicator / gesture bar)
- MapLibre WebGL canvas fills `100dvh` cleanly in both portrait and landscape orientations.

---

## 5. Android Build, Keystore Signing & Google Play Release

### 5.1 Generate an Upload Keystore (One-Time Setup)

Store your upload keystore **outside the repository** (e.g., `~/keystores/`) and back it up securely in an encrypted password manager. **Never commit `.jks` or `.keystore` files to Git.**

```bash
mkdir -p ~/keystores
keytool -genkeypair -v \
  -keystore ~/keystores/physalts-upload.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias physalts-upload
```

### 5.2 Configure Gradle Signing

Create `android/keystore.properties` (ensure `keystore.properties` is gitignored):

```properties
storeFile=/home/YOUR_USER/keystores/physalts-upload.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=physalts-upload
keyPassword=YOUR_KEY_PASSWORD
```

Update `android/app/build.gradle` to load `keystore.properties` and set `versionCode` / `versionName`:

```groovy
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    defaultConfig {
        applicationId "org.physalts.app"
        minSdkVersion 24
        targetSdkVersion 35
        versionCode 1
        versionName "1.0.0"
    }

    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            shrinkResources false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 5.3 Verify Android Network Security & Permissions
Check `android/app/src/main/AndroidManifest.xml`:
- Keep only `android.permission.INTERNET` (do **not** add `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION` — PhysAlts is zero-GPS).
- Confirm `android:usesCleartextTraffic="false"` (matches `allowMixedContent: false` in `capacitor.config.json`).

### 5.4 Build the Signed Android App Bundle (`.aab`)

```bash
npm run cap:sync
cd android
./gradlew clean bundleRelease
```

The signed release artifact is written to:
`android/app/build/outputs/bundle/release/app-release.aab`

Test locally on a physical Android device before uploading:
```bash
# Or open in Android Studio:
npm run cap:android
```

Upload `app-release.aab` to **Google Play Console → Testing → Internal testing**, verify the Data Safety form (see `docs/COMPLIANCE_SOC2_GDPR.md` Section 5), complete closed/internal testing, and promote to Production.

---

## 6. iOS Build, Signing & App Store Release

### 6.1 Track A — Building on macOS with Xcode

```bash
npm run cap:sync
npm run cap:ios
```

Inside Xcode:
1. Select the **App** target → **Signing & Capabilities**:
   - Check **Automatically manage signing**
   - Select your Apple Developer **Team**
   - Confirm Bundle Identifier is `org.physalts.app`
2. Set **Version** (`1.0.0`) and **Build** (`1`) under **General**.
3. Verify `ios/App/App/PrivacyInfo.xcprivacy` exists with `NSPrivacyTracking` set to `false` (required by Apple App Store Review for iOS SDK compliance).
4. Verify `Info.plist` does **not** request unnecessary permissions (no `NSLocationWhenInUseUsageDescription`, no `NSUserTrackingUsageDescription`).
5. Select **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect → Upload**.
6. Test via **TestFlight**, complete App Privacy Nutrition Labels (`docs/COMPLIANCE_SOC2_GDPR.md` Section 4), and submit for App Review.

### 6.2 Track B — Shipping iOS from Linux / Ubuntu (No Mac) via Codemagic CI/CD

If you develop on Ubuntu/Linux without macOS hardware, **Codemagic** builds, signs, and uploads your Capacitor iOS `.ipa` directly to TestFlight on Apple Silicon macOS runners.

#### Step 1: Prepare App Store Connect Credentials
1. In **App Store Connect → Users and Access → Integrations → App Store Connect API**, create a key with **App Manager** role. Download the `.p8` file and note the **Key ID** and **Issuer ID**.
2. In **App Store Connect → Apps**, create a new iOS App with Bundle ID `org.physalts.app`.
3. In the **Codemagic Dashboard**:
   - Connect your GitHub repository (`nothinkaffee/PhysAlts`).
   - Add an **App Store Connect** integration named `physalts_asc` using your Issuer ID, Key ID, and `.p8` key.
   - Under **Code signing identities**, upload or let Codemagic auto-manage your iOS Distribution Certificate.

#### Step 2: Add `codemagic.yaml` to Your Repository Root

```yaml
workflows:
  ios-release:
    name: PhysAlts iOS Release (TestFlight)
    instance_type: mac_mini_m2
    max_build_duration: 45
    integrations:
      app_store_connect: physalts_asc
    environment:
      ios_signing:
        distribution_type: app_store
        bundle_identifier: org.physalts.app
      vars:
        APP_STORE_APPLE_ID: 1234567890 # Replace with your App Store Connect Apple ID
        XCODE_WORKSPACE: "ios/App/App.xcworkspace"
        XCODE_SCHEME: "App"
      node: 20
      xcode: latest
      cocoapods: default
    scripts:
      - name: Install Node dependencies & run strict QA audit
        script: |
          npm ci
          node scripts/verify_and_audit.mjs --strict

      - name: Generate & sync Capacitor iOS project
        script: |
          if [ ! -d "ios" ]; then
            npx cap add ios
          fi
          npx cap sync ios

      - name: Install CocoaPods dependencies
        script: |
          cd ios/App
          pod install --repo-update

      - name: Configure Xcode automatic code signing
        script: |
          xcode-project use-profiles

      - name: Increment build number from TestFlight
        script: |
          cd ios/App
          LATEST_BUILD=$(app-store-connect get-latest-testflight-build-number "$APP_STORE_APPLE_ID" || echo 0)
          agvtool new-version -all $((LATEST_BUILD + 1))

      - name: Build signed IPA
        script: |
          xcode-project build-ipa \
            --workspace "$XCODE_WORKSPACE" \
            --scheme "$XCODE_SCHEME"
    artifacts:
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
        submit_to_app_store: false
```

Trigger the `ios-release` workflow from Codemagic (or on version tags like `v1.0.0`) and your signed `.ipa` lands directly in **TestFlight**.

---

## 7. Pre-Submission Compliance & QA Checklists

### 7.1 Functional Mobile QA
- [ ] Cold launch splash screen displays cleanly (`#030509`, no white flash).
- [ ] 3D satellite globe renders smoothly via WebGL with zero console errors.
- [ ] Touch gestures work cleanly: pinch-to-zoom, single-finger orbit, two-finger tilt, marker tap.
- [ ] Offline / airplane-mode test: static `public/data/physics_hubs.json` loads 4,000+ hubs gracefully with clear status indicator.
- [ ] External links (university homepages, Wikipedia, OpenAlex) open safely in system browser / in-app browser without hijacking the WebView.
- [ ] In-app **Privacy & Data Controls** panel successfully exports JSON and permanently erases local + cloud user state.

### 7.2 Apple App Store Review Checklist
- [ ] **Guideline 4.2 (Minimum Functionality):** Highlight PhysAlts' interactive 3D WebGL satellite globe, historical Time Counter, Space Frontier Scale visualizer, and 7-stage career pathway explorer in your App Review notes (demonstrates rich native-grade utility far beyond a static webpage).
- [ ] **Guideline 5.1.1(v) (Data Deletion):** In-app deletion control works end-to-end; mention exact navigation steps in App Review notes.
- [ ] **Privacy Policy URL:** Live HTTPS `privacy.html` entered in App Store Connect and accessible in-app.
- [ ] **App Privacy Nutrition Label:** Matches `docs/COMPLIANCE_SOC2_GDPR.md` Section 4 (Zero Tracking, No ATT prompt).
- [ ] **Privacy Manifest:** `PrivacyInfo.xcprivacy` bundled in app archive.

### 7.3 Google Play Store Review Checklist
- [ ] **Target API Level:** `targetSdkVersion` meets current Google Play requirement (API 35 for 2025/2026+ releases).
- [ ] **64-bit & AAB Format:** Released as signed `.aab` via Play App Signing.
- [ ] **Data Safety Form:** Matches `docs/COMPLIANCE_SOC2_GDPR.md` Section 5.
- [ ] **Privacy Policy URL:** Live HTTPS `privacy.html` linked in Store Listing and in-app.
- [ ] **Zero Unused Permissions:** Manifest contains `INTERNET` only (no location, contacts, storage, or ad-ID permissions).

---

## 8. Google AI Pro Cloud & Android Stack (Public Hosting from a Private Repo)

If you are on **Google AI Pro** (enrolled in the **Google Developer Program**), your subscription includes:
- **\$10/month in Google Cloud & GenAI developer credits** (usable for Firebase Hosting / App Hosting, Cloud Firestore, Cloud Run, Maps, and Gemini API)
- **30 Firebase Studio workspaces** (cloud IDE with instant preview and Firebase emulators)
- **Gemini Code Assist / Gemini CLI** and **Android Studio Gemini** (accelerated Gradle, Kotlin/Capacitor debugging, and layout QA)

### Why Firebase Hosting Beats GitHub Pages for Private Repos
GitHub Pages requires a public repository on Free plans and does not allow custom HTTP security headers (`CSP`, `HSTS`, `Permissions-Policy`). **Firebase Hosting + Firestore** lets you keep your GitHub repository **private** while serving PhysAlts publicly over a global HTTPS CDN with custom domain support, strict SOC 2/GDPR security headers, and zero-PII Anonymous Auth sync — all comfortably within Firebase's free tier plus your \$10/month Google Cloud credit.

### Ready-to-Use `firebase.json` Configuration

Place this `firebase.json` in the repository root (already aligned with `public/` and `firestore.rules`):

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "cleanUrls": true,
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "geolocation=(), camera=(), microphone=(), payment=(), usb=()" }
        ]
      },
      {
        "source": "/vendor/**",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      },
      {
        "source": "/data/**",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=3600, stale-while-revalidate=86400" }
        ]
      }
    ]
  }
}
```

### Deploy Publicly in 4 Commands

```bash
# 1. Install Firebase CLI and authenticate with your Google AI Pro account
npm install -g firebase-tools
firebase login

# 2. Link your GCP/Firebase project (select your Blaze project backed by your $10/mo credit)
firebase use --add

# 3. Verify datasets & rules before publishing
node scripts/verify_and_audit.mjs --strict

# 4. Deploy public web app + hardened Firestore security rules together
firebase deploy --only hosting,firestore:rules
```

### Best Practices for Google AI Pro Credits & Android Workflow
1. **Billing Guardrail:** Set GCP Billing Budget Alerts at **\$5, \$8, and \$10/month** in Google Cloud Console (`Billing → Budgets & alerts`) so you stay strictly inside your included \$10/month developer credit.
2. **EU/GDPR Data Residency:** Choose a multi-region like `eur3` (or `nam5`) when creating Firestore, and accept the Google Cloud Data Processing Addendum (see `docs/COMPLIANCE_SOC2_GDPR.md` Section 3.2).
3. **Android Studio Gemini:** Open `android/` via `npm run cap:android` and use Android Studio Gemini to inspect WebView console telemetry, validate adaptive icon masks across API 34/35 emulators, and troubleshoot Gradle signing configs.
4. **Firebase Studio:** Use one of your 30 included Firebase Studio workspaces to test `firestore.rules` against the Firebase Local Emulator Suite before pushing to production.

