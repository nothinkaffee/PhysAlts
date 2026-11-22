# PhysAlts — SOC 2 Readiness & GDPR Compliance Blueprint

> **Important Scope & Honesty Statement**
>
> This document details the **technical, architectural, and process readiness controls** implemented inside the `PhysAlts` repository to align with the AICPA SOC 2 Trust Services Criteria (TSC) and EU/UK GDPR requirements.
>
> **A software repository alone cannot be "SOC 2 Certified."** Formal SOC 2 Type I (point-in-time control design) and SOC 2 Type II (3–12 month operating effectiveness) attestation reports can **only** be issued by an independent AICPA-licensed CPA firm auditing a legal operating entity (including organizational governance, HR onboarding/offboarding, endpoint security, vendor risk management, and physical/administrative controls). Use this document as your **engineering control baseline and audit-evidence map** when preparing for an external CPA examination or institutional security review.

---

## 1. Architecture & Data Flow Security Overview

PhysAlts is designed around a **static-first, zero-PII architecture** that minimizes compliance surface area by default:

- **Static Dataset Delivery:** 4,000+ curated and open-registry physics hubs across 156 countries are pre-built into `public/data/physics_hubs.json` via open CC0 APIs (OpenAlex, ROR v2) and audited in CI via `scripts/verify_and_audit.mjs --strict`.
- **Zero-PII Client State:** User shortlist selections and academic career-stage filters are stored locally in `localStorage`.
- **Optional Cloud Sync:** If Firebase is enabled in production, the client authenticates exclusively via **Firebase Anonymous Authentication** (no email, name, phone, or password). Owner-scoped preferences are stored at `/artifacts/{appId}/users/{userId}/profile/prefs` and governed by `firestore.rules`.
- **Direct Open-Science Reads:** Live enrichment queries (`OpenAlex`, `ROR v2`, `INSPIRE-HEP`, `Wikimedia REST API`, `Esri World Imagery`) are read-only HTTPS GET requests with zero user PII attached.

---

## 2. SOC 2 Trust Services Criteria (TSC) Readiness Matrix

Status Legend:
- **Implemented (Repo Control):** Enforced directly in code, config, or GitHub Actions in this repository.
- **Org Action Required:** Must be configured/documented by the operating organization prior to a formal CPA audit.

### 2.1 Common Criteria — Security (CC1 – CC9)

| Criterion | Control Objective | PhysAlts Concrete Implementation / Artifact | Status |
|---|---|---|---|
| **CC1 — Control Environment** | Integrity, ethical values, governance, and accountability | Clear data-minimization posture (`public/privacy.html`), public open-source code review workflow, documented security ownership. | **Org Action Required** (assign Security Officer, publish org Code of Conduct & Acceptable Use Policy) |
| **CC2 — Communication & Information** | Internal & external communication of policies and system boundaries | `public/privacy.html` (user-facing notice), `README.md` (architecture), `docs/COMPLIANCE_SOC2_GDPR.md`, `docs/MOBILE_RELEASE_GUIDE.md`. | **Implemented (Repo Control)** + publish public contact/security.txt on production domain |
| **CC3 — Risk Assessment** | Identifying and assessing threats, fraud, and dependency risks | Automated high-severity vulnerability scanning (`npm audit --audit-level=high`) and credential leak scanning in `.github/workflows/security-and-qa.yml`. | **Implemented (Repo Control)** + conduct annual formal organizational Risk Assessment |
| **CC4 — Monitoring Activities** | Ongoing automated verification of control effectiveness | `.github/workflows/security-and-qa.yml` executes on every `push`/`pull_request` to `main`, generating retained 30-day audit artifacts (`public/data/verification_report.json`) and step summaries. | **Implemented (Repo Control)** + enable Firebase/GCP Cloud Monitoring alerts in production |
| **CC5 — Control Activities** | Technical policies mitigating operational and data risks | Hardened `firestore.rules` (strict key whitelists, coordinate bounds, HTTPS-only URLs, immutable public nodes, default-deny fallback), `capacitor.config.json` (`allowMixedContent: false`, `androidScheme: "https"`). | **Implemented (Repo Control)** |
| **CC6 — Logical & Physical Access Controls** | Restricting access to authorized users and enforcing least privilege | **Data layer:** `firestore.rules` enforces `request.auth != null && request.auth.uid == userId` for all private user documents and blocks public `update`/`delete`. **CI layer:** `.github/workflows/security-and-qa.yml` uses least-privilege `permissions: contents: read`. **Transport:** HTTPS/TLS only. | **Implemented (Repo Control)** + enforce GitHub 2FA, SSO/MFA on GCP/Firebase & App Store/Play Store accounts |
| **CC7 — System Operations** | Detecting anomalies, managing vulnerabilities, and handling incidents | Secret-leak regex scanning, `firestore.rules` syntax/invariant verification, `npm audit`, and Section 6 Incident Response Runbook below. | **Implemented (Repo Control)** + configure Dependabot / GitHub Secret Scanning & Push Protection on repo settings |
| **CC8 — Change Management** | Controlled, traceable, tested changes to production | Git commit history, PR-gated CI checks (`security-and-qa.yml`), automated weekly dataset refresh PR/commit trail (`update-and-deploy.yml`), strict pre-deploy verification (`verify_and_audit.mjs --strict`). | **Implemented (Repo Control)** + enable GitHub Branch Protection on `main` (require PR approval + passing `verify-and-audit` status check) |
| **CC9 — Risk Mitigation (Vendor / Sub-processor)** | Managing third-party infrastructure and API risks | Sub-processor inventory (Section 3.3), read-only open-science API isolation, zero third-party ad/analytics SDKs, local static dataset fallback if upstream APIs fail. | **Implemented (Repo Control)** + execute DPAs & review annual vendor SOC 2 reports (Google Cloud/Firebase, GitHub, Cloudflare) |

### 2.2 Additional Trust Services Categories

| Category | Criteria | PhysAlts Concrete Implementation / Artifact | Status |
|---|---|---|---|
| **Availability (A1)** | System availability, graceful degradation, disaster recovery | Static-first architecture (`public/data/physics_hubs.json`) loads in <200 ms even when Firebase or live APIs are unreachable; local vendor bundles (`public/vendor/*`) prevent CDN single-point-of-failure outages; GitHub Pages / CDN edge caching. | **Implemented (Repo Control)** + define RTO/RPO SLA if offering paid enterprise SLAs |
| **Processing Integrity (PI1)** | Complete, accurate, timely, and authorized data processing | `scripts/verify_and_audit.mjs --strict` validates dataset JSON schema, lat/lng bounds, null-island rejection, duplicate detection, and live HTTPS link reachability; publishes `public/data/verification_report.json` as immutable CI evidence. | **Implemented (Repo Control)** |
| **Confidentiality (C1)** | Protecting confidential information from unauthorized disclosure | Zero secrets in repo (enforced in CI); strict user isolation in `firestore.rules`; HTTPS/TLS 1.2+ in transit; Google Cloud AES-256 encryption at rest for Firestore; CSP-compatible MapLibre worker (`maplibre-gl-csp.js`). | **Implemented (Repo Control)** + configure strict HTTP security headers (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`) on production hosting/CDN |
| **Privacy (P1 – P8)** | Notice, choice, collection limitation, retention, access, erasure | Full GDPR Art. 13–17 notice (`public/privacy.html`), zero PII design, in-app **Privacy & Data Controls** panel (1-click JSON export + 1-click local & cloud erasure backed by owner `allow delete` in `firestore.rules`). | **Implemented (Repo Control)** |

### 2.3 Recommended Production HTTP Security Headers (Cloudflare / Firebase Hosting / Nginx)

When serving `public/` from a custom domain or Firebase Hosting (`firebase.json`), apply these response headers:

```json
{
  "headers": [
    {
      "source": "**",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "geolocation=(), camera=(), microphone=(), payment=(), usb=()" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' https://www.gstatic.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://demotiles.maplibre.org; img-src 'self' data: blob: https://services.arcgisonline.com https://upload.wikimedia.org; connect-src 'self' https://api.openalex.org https://api.ror.org https://inspirehep.net https://en.wikipedia.org https://services.arcgisonline.com https://demotiles.maplibre.org https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-ancestors 'none'; base-uri 'self';"
        }
      ]
    }
  ]
}
```

> **Note:** Adjust `script-src` if inline `<script type="module">` blocks remain in `public/index.html` (prefer externalized `public/js/*.js` modules or SHA-256 CSP hashes to eliminate `'unsafe-inline'` for scripts).

---

## 3. GDPR Compliance Checklist

### 3.1 Core GDPR Requirements Mapping

| GDPR Article | Requirement | Implementation in PhysAlts | Verification Method |
|---|---|---|---|
| **Art. 5(1)(c)** | Data Minimization | Collects only random Anonymous UID, shortlist IDs, and career stage. Zero PII, zero GPS, zero ad IDs. | Code audit + network tab inspection |
| **Art. 6(1)(b)/(f)** | Lawful Basis | Documented in `public/privacy.html` (essential requested shortlist sync & anti-abuse rules). No consent banner needed for non-existent ad/analytics cookies. | Review `public/privacy.html` |
| **Art. 12–14** | Transparent Privacy Notice | Mobile-friendly dark glassmorphic `public/privacy.html` linked from app footer and Privacy & Data Controls panel. | Live URL check before store launch |
| **Art. 15 & Art. 20** | Right of Access & Portability | In-app **Privacy & Data Controls → Export My Data (JSON)** exports all stored local & synced preferences in structured JSON. | Manual QA test on Web, iOS, Android |
| **Art. 16** | Right to Rectification | Users modify shortlist/stage directly; institutions can request hub metadata updates via privacy contact. | In-app state test |
| **Art. 17** | Right to Erasure ("Right to be Forgotten") | In-app **Privacy & Data Controls → Permanently Erase Local + Cloud Data** deletes `localStorage` keys and executes `deleteDoc` on `/artifacts/{appId}/users/{uid}/profile/prefs` (explicitly allowed by `firestore.rules`). | Test Firestore doc deletion + verify `404`/missing doc |
| **Art. 25** | Privacy by Design & Default | Local-first operation; Firebase sync is optional; zero third-party trackers bundled; `Permissions-Policy` blocks geolocation/camera/mic. | Repo & build manifest audit |
| **Art. 28** | Sub-processor Governance & DPAs | Sub-processor register documented below; operator must accept DPAs in vendor consoles before production launch. | DPA checklist (Section 3.2) |
| **Art. 30** | Record of Processing Activities (RoPA) | Captured in Section 1 & Section 3.3 (low-risk, non-PII academic directory processing). | Maintain annual review log |
| **Art. 32** | Security of Processing | TLS in transit, Firestore access rules, secret scanning, automated QA audits. | CI workflow pass logs |
| **Art. 33–34** | 72-Hour Breach Notification | Incident response procedure in Section 6; note that zero-PII design drastically limits risk to data subjects. | Tabletop drill before launch |

### 3.2 Production DPA & Pre-Launch Legal Checklist

Before publishing to a public production domain or mobile app stores:

- [ ] Replace placeholder email `privacy@physalts.org` in `public/privacy.html` and `scripts/scrape_physics.mjs` with a monitored mailbox.
- [ ] **Google Cloud / Firebase:** Accept the [Cloud Data Processing Addendum (CDPA)](https://cloud.google.com/terms/data-processing-addendum) in Google Cloud Console (`IAM & Admin → Settings → Privacy & Security`) and select an EU multi-region (e.g., `eur3`) if targeting primarily EU institutions.
- [ ] **Cloudflare (if used for DNS/CDN/WAF):** Execute the Cloudflare Standard DPA in the Cloudflare Dashboard (`Manage Account → Configurations → Legal`).
- [ ] **GitHub Pages / Actions:** Confirm GitHub Data Protection Agreement coverage if running under a GitHub Organization account.
- [ ] Verify that `https://<your-domain>/privacy.html` returns HTTP `200` over HTTPS and is entered in both Apple App Store Connect and Google Play Console.

### 3.3 Sub-processor & External Registry Register

| Entity | Role | Processing Location | Data Processed | Compliance / License |
|---|---|---|---|---|
| **Google Cloud / Firebase** | Infrastructure Sub-processor (optional Auth + Firestore) | Configurable GCP Region | Anonymous UID, shortlist IDs, stage pref | SOC 2 Type II, ISO 27001, GDPR CDPA |
| **GitHub, Inc.** | Static Web Hosting (GitHub Pages) & CI/CD | Global CDN / US | Static asset HTTP access logs | SOC 2 Type II, ISO 27001 |
| **Esri (ArcGIS Online)** | Map Tile Provider (Direct Client Request) | Global CDN | Viewport tile coordinates (z/x/y), HTTP headers | Esri Terms / Attribution |
| **OpenAlex (OurResearch)** | Public Open-Science API (Direct Client / ETL) | Global | Read-only institution/topic queries | CC0 1.0 Public Domain |
| **ROR v2 (Crossref / DataCite / CDL)** | Public Open-Science API (Direct Client / ETL) | Global | Read-only organization queries | CC0 1.0 Public Domain |
| **INSPIRE-HEP (CERN et al.)** | Public Open-Science API (Direct Client) | Switzerland / EU | Read-only HEP institution queries | CC0 1.0 Public Domain |
| **Wikimedia Foundation** | Public Encyclopedia API (Direct Client) | US / EU | Read-only Wikipedia slug lookups | CC BY-SA 4.0 |

---

## 4. Apple App Store Privacy Nutrition Label — Exact Answers

Use these exact responses in **App Store Connect → App Privacy** for `org.physalts.app`:

### Scenario A: Firebase Anonymous Cloud Sync **Enabled** (Default Production Setup)

| App Store Connect Prompt | Exact Answer | Rationale |
|---|---|---|
| **Privacy Policy URL** | `https://<your-domain>/privacy.html` | Hosted copy of `public/privacy.html` |
| **Do you or your third-party partners collect data from this app?** | **Yes** | Firebase Anonymous Auth generates an app-scoped User ID (`uid`) and stores shortlist/stage preferences |
| **Data Types Collected** | **Identifiers → User ID** (Anonymous Firebase UID) and **Usage Data / Product Interaction** (optional — only if you classify saved shortlist/stage as app interaction; or **Other Data** for user preferences) | Strictly limited to functional shortlist persistence |
| **Used to Track You? (ATT)** | **No** | Zero cross-app tracking, zero ad networks, zero data brokers. **No `NSUserTrackingUsageDescription` / ATT prompt is needed.** |
| **Linked to the User's Identity?** | **No (Data Not Linked to You)** | Anonymous Firebase UID has no name, email, phone, or device IDFA association |
| **Purposes** | **App Functionality** only | Syncing bookmarked physics hubs and selected career stage |
| **Account / Data Deletion Requirement (Guideline 5.1.1(v))** | **Compliant** | In-app **Privacy & Data Controls → Permanently Erase Local + Cloud Data** wipes cloud profile & anonymous session |

### Scenario B: Static-Only Build (**Firebase Disabled** / `PROD_FIREBASE_CONFIG = null`)

| App Store Connect Prompt | Exact Answer |
|---|---|
| **Do you or your third-party partners collect data from this app?** | **No — Data Not Collected** (all shortlist preferences stay strictly on-device in `localStorage`) |
| **Used to Track You?** | **No** |

> **iOS Privacy Manifest (`PrivacyInfo.xcprivacy`):** Because PhysAlts uses `localStorage` inside `WKWebView` and Capacitor core APIs, verify that your generated iOS project includes `PrivacyInfo.xcprivacy` declaring `NSPrivacyTracking = false`, empty `NSPrivacyTrackingDomains`, and required-reason API declarations for any Capacitor plugins you add (see `docs/MOBILE_RELEASE_GUIDE.md`).

---

## 5. Google Play Data Safety Form — Exact Answers

Use these exact responses in **Google Play Console → App content → Data safety** for `org.physalts.app`:

| Play Console Question | Exact Answer (Firebase Enabled) | Exact Answer (Static / Local-Only) |
|---|---|---|
| **Does your app collect or share any of the required user data types?** | **Yes** (Collects only; **Shares: No**) | **No** |
| **Is all of the user data collected by your app encrypted in transit?** | **Yes** (`androidScheme: "https"`, `allowMixedContent: false`, HTTPS-only endpoints) | N/A |
| **Do you provide a way for users to request that their data is deleted?** | **Yes** (In-app **Privacy & Data Controls → Permanently Erase Local + Cloud Data** + email fallback) | N/A |
| **Account creation required?** | **No** (Anonymous session only; no user accounts) | **No** |
| **Data Type → App info and performance / App activity / Device or other IDs** | Select **Device or other IDs** (or **Personal info → User IDs** if Firebase Anonymous UID is enabled): **Collected = Yes**, **Shared = No**, **Processed ephemerally = No**, **Required or Optional = Optional**, **Purpose = App functionality** | None selected |
| **Location (Precise or Approximate)** | **Not collected** (App never requests GPS) | **Not collected** |
| **Personal Info (Name, Email, Address, Phone)** | **Not collected** | **Not collected** |
| **Third-party advertising / analytics** | **None** | **None** |
| **Independent Security Review badge** | Leave unchecked unless an accredited MASA / CASA lab audit is completed | Leave unchecked |

---

## 6. Incident Response & Vulnerability Disclosure Checklist

### 6.1 Vulnerability Disclosure Policy
- Publish a security contact (e.g., `security@physalts.org` / `/.well-known/security.txt`) or enable **GitHub Private Vulnerability Reporting** in repository settings.
- Acknowledge security reports within **48 hours** and target patches for Critical/High issues within **7 days**.

### 6.2 Security Incident Runbook

1. **Detect & Triage (0–2 hours):**
   - Identify scope: leaked credential, malicious Firestore node spam, compromised dependency, or unauthorized deployment.
2. **Contain (Immediate):**
   - **Firestore abuse:** Temporarily set `allow create: if false;` on `/artifacts/{appId}/public/data/{col}/{docId}` in `firestore.rules` and run `firebase deploy --only firestore:rules`.
   - **Credential / Key exposure:** Immediately revoke and rotate the affected Firebase/GCP/GitHub/Apple/Google signing secret; purge git history if private keys were committed.
   - **Dependency compromise:** Pin or upgrade the affected package, regenerate `package-lock.json`, and re-run `npm audit` + `security-and-qa.yml`.
3. **Eradicate & Recover:**
   - Merge fix via PR with passing `security-and-qa.yml` checks.
   - Redeploy static assets (`update-and-deploy.yml`) and push mobile hotfix if WebView bundle is impacted.
4. **Regulatory Assessment (GDPR Art. 33 — 72-Hour Clock):**
   - Determine whether personal data was exposed. (Under PhysAlts' zero-PII architecture, confirm that no real-world user identities were linked to anonymous UIDs; if any personal data breach posing a risk to individuals occurred, notify the relevant Supervisory Authority within 72 hours.)
5. **Post-Mortem:**
   - Document root cause, timeline, and preventive CI control additions within 5 business days.
