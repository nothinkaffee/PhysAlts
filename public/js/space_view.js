/**
 * PhysAlts — Museum-Grade Space Frontier Visualizer (Earth → Moon → Planets → 1 Light-Day)
 * Pure neutral monochrome obsidian/silver palette + rgb(160, 70, 70) crimson accent.
 * Features logarithmic light-time scale (0 s → 24h / 173.1 AU), interactive "Fire Light Pulse (c)"
 * photon wavefront simulation, refined celestial landmarks, parallax starfield, smooth wheel/pinch
 * zoom & drag panning, animated camera focus, and deterministic non-overlapping mission labels.
 */

import { store } from "./data_store.js";

// Physical constants (exact IAU / SI)
const C_KM_S = 299792.458;
const AU_SEC = 499.0047838; // 1 AU in light-seconds (8m 19.0s)
const LIGHT_DAY_SEC = 86400; // 24h 00m 00s (~173.14 AU, 25.90B km)

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 8.5;
const PULSE_DURATION_MS = 15200;

const FONT_FAMILY = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CRIMSON = "rgb(160, 70, 70)";

// Strictly monotonic landmarks along normalized cosmic track u ∈ [0, 1]
const LANDMARKS = [
  { id: "earth",      label: "Earth / LEO",   sub: "0 s",      sec: 0.0014, u: 0.00, r: 12.5, type: "earth",      zone: "leo" },
  { id: "moon",       label: "Moon",          sub: "1.28 s",   sec: 1.28,   u: 0.11, r: 7.5,  type: "moon",       zone: "moon" },
  { id: "lagrange",   label: "L1 / L2",       sub: "5.0 s",    sec: 5.0,    u: 0.21, r: 5.0,  type: "lagrange",   zone: "lagrange" },
  { id: "sun",        label: "Sun · 1 AU",    sub: "8m 19s",   sec: 499,    u: 0.34, r: 13.5, type: "sun",        zone: "inner" },
  { id: "mars",       label: "Mars",          sub: "12m 38s",  sec: 758,    u: 0.44, r: 8.0,  type: "mars",       zone: "mars" },
  { id: "belt",       label: "Asteroid Belt", sub: "24m",      sec: 1457,   u: 0.52, r: 0,    type: "belt",       zone: "mars", subtle: true },
  { id: "jupiter",    label: "Jupiter",       sub: "43m",      sec: 2595,   u: 0.61, r: 13.5, type: "jupiter",    zone: "giants" },
  { id: "saturn",     label: "Saturn",        sub: "1h 19m",   sec: 4760,   u: 0.71, r: 11.0, type: "saturn",     zone: "giants" },
  { id: "kuiper",     label: "Kuiper Belt",   sub: "5.5–9.3h", sec: 24000,  u: 0.81, r: 0,    type: "kuiper",     zone: "interstellar", subtle: true },
  { id: "heliopause", label: "Heliopause",    sub: "~120 AU",  sec: 59880,  u: 0.90, r: 0,    type: "heliopause", zone: "interstellar", boundary: true },
  { id: "lightday",   label: "1 Light-Day",   sub: "173.1 AU", sec: 86400,  u: 1.00, r: 9.5,  type: "frontier",   zone: "interstellar", frontier: true }
];

const ZONE_CAMERA = {
  all:          { centerU: 0.50, zoom: 1.0 },
  leo:          { centerU: 0.045, zoom: 3.1 },
  moon:         { centerU: 0.11, zoom: 3.4 },
  lagrange:     { centerU: 0.21, zoom: 3.4 },
  inner:        { centerU: 0.325, zoom: 3.0 },
  mars:         { centerU: 0.455, zoom: 2.8 },
  giants:       { centerU: 0.66, zoom: 2.7 },
  interstellar: { centerU: 0.90, zoom: 2.5 }
};

const DECADE_TICKS = [
  { sec: 0.01,  label: "10 ms" },
  { sec: 0.1,   label: "0.1 s" },
  { sec: 1,     label: "1 s" },
  { sec: 10,    label: "10 s" },
  { sec: 60,    label: "1 m" },
  { sec: 600,   label: "10 m" },
  { sec: 3600,  label: "1 h" },
  { sec: 36000, label: "10 h" }
];

const PULSE_MILESTONES = [
  { sec: 0.0014, label: "Departing Earth · LEO" },
  { sec: 0.2,    label: "High Earth Orbit · XMM & Chandra" },
  { sec: 1.28,   label: "Passing Moon · 384,400 km" },
  { sec: 5.0,    label: "Passing L1 / L2 · JWST & Euclid" },
  { sec: 175,    label: "Inner Solar · LISA Orbit" },
  { sec: 499,    label: "Passing Sun · Parker Solar (1.0 AU)" },
  { sec: 758,    label: "Passing Mars · 1.52 AU" },
  { sec: 1457,   label: "Main Asteroid Belt · Psyche" },
  { sec: 2595,   label: "Passing Jupiter · 5.2 AU" },
  { sec: 4760,   label: "Passing Saturn · 9.54 AU" },
  { sec: 19800,  label: "Entering Kuiper Belt" },
  { sec: 33333,  label: "Passing New Horizons · 66.8 AU" },
  { sec: 59880,  label: "Crossing Heliopause · ~120 AU" },
  { sec: 72555,  label: "Passing Voyager 2 · 145.4 AU" },
  { sec: 86400,  label: "Reached Voyager 1 · 1 Light-Day!" }
];

const SHORT_NAMES = {
  iss_ams02: "ISS · AMS-02",
  hubble: "Hubble",
  fermi_glast: "Fermi",
  ixpe: "IXPE",
  xmm_newton: "XMM-Newton",
  chandra: "Chandra",
  apollo_llr: "Apollo LLR",
  lro: "LRO",
  chandrayaan3: "Chandrayaan-3",
  change4: "Chang'e-4",
  artemis_gateway: "Artemis",
  soho: "SOHO",
  planck_obs: "Planck",
  gaia: "Gaia",
  jwst: "JWST",
  euclid: "Euclid",
  roman: "Roman",
  lisa_space: "LISA",
  solar_orbiter: "Solar Orbiter",
  bepicolombo: "BepiColombo",
  parker_solar_probe: "Parker Solar",
  hayabusa2: "Hayabusa2",
  osiris_rex: "OSIRIS-REx",
  curiosity: "Curiosity",
  perseverance: "Perseverance",
  insight: "InSight",
  dart: "DART",
  psyche: "Psyche",
  juno: "Juno",
  juice: "JUICE",
  europa_clipper: "Europa Clipper",
  cassini_huygens: "Cassini",
  dragonfly: "Dragonfly",
  new_horizons: "New Horizons",
  voyager2: "Voyager 2",
  voyager1: "Voyager 1"
};

const FEATURED_IDS = new Set([
  "voyager1", "voyager2", "new_horizons", "cassini_huygens", "juno",
  "psyche", "perseverance", "parker_solar_probe", "jwst", "apollo_llr", "hubble"
]);

// Module state
let canvas = null;
let ctx = null;
let rafId = null;
let initialized = false;
let lastFrameTime = 0;

let activeZone = "all";
let selectedMissionId = null;
let hoveredMissionId = null;
let hoveredLandmarkId = null;
let onSelectMissionCb = () => {};

let missionHitboxes = [];
let landmarkHitboxes = [];

// Smooth camera state
let camZoom = 1.0;
let targetZoom = 1.0;
let camCenterU = 0.5;
let targetCenterU = 0.5;
let camPanY = 0;
let targetPanY = 0;
let hasInteracted = false;

// Pointer / Touch interaction state
let isDragging = false;
let dragMoved = false;
let dragStartX = 0;
let dragStartY = 0;
let dragLastX = 0;
let dragLastY = 0;
let pinchActive = false;
let pinchLastDist = 0;
let pinchLastMidX = 0;
let lastTapTime = 0;

// Procedural cosmic geometry (precomputed once)
let stars = [];
let asteroidSpecks = [];
let kuiperSpecks = [];

// Light Pulse (c) simulation state
const pulse = {
  active: false,
  completed: false,
  u: 0,
  startTime: 0,
  lastTickText: "",
  ripples: [],
  crossedIds: new Set(),
  litAt: new Map()
};

// HUD DOM refs
let hudRoot = null;
let pulseBtn = null;
let pulseBtnLabel = null;
let pulseReadoutWrap = null;
let pulseTimeEl = null;
let pulseStatusEl = null;
let zoomBadgeEl = null;
let resetBtnEl = null;

// Deterministic PRNG for stable starfield and belts
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initCosmicFields() {
  const rand = mulberry32(19770905); // Voyager 1 launch date seed
  stars = [];
  for (let i = 0; i < 250; i++) {
    const layer = i < 120 ? 0 : i < 205 ? 1 : 2;
    const parallax = layer === 0 ? 0.12 : layer === 1 ? 0.28 : 0.52;
    stars.push({
      x: rand(),
      y: rand(),
      r: (layer === 0 ? 0.45 : layer === 1 ? 0.85 : 1.35) * (0.65 + rand() * 0.55),
      a: (layer === 0 ? 0.20 : layer === 1 ? 0.36 : 0.58) * (0.6 + rand() * 0.5),
      twinkle: rand() * Math.PI * 2,
      speed: 0.45 + rand() * 0.9,
      parallax,
      glint: layer === 2 && rand() > 0.72
    });
  }

  asteroidSpecks = [];
  for (let i = 0; i < 92; i++) {
    asteroidSpecks.push({
      du: (rand() - 0.5) * 0.036,
      yNorm: (rand() - 0.5) * 0.64,
      r: 0.55 + rand() * 1.15,
      a: 0.16 + rand() * 0.32,
      drift: (rand() - 0.5) * 0.008,
      phase: rand() * Math.PI * 2
    });
  }

  kuiperSpecks = [];
  for (let i = 0; i < 115; i++) {
    kuiperSpecks.push({
      du: (rand() - 0.5) * 0.064,
      yNorm: (rand() - 0.5) * 0.76,
      r: 0.5 + rand() * 1.25,
      a: 0.12 + rand() * 0.28,
      drift: (rand() - 0.5) * 0.005,
      phase: rand() * Math.PI * 2
    });
  }
}

// Piecewise logarithmic mapping: light-time (sec) <-> normalized track u ∈ [0, 1]
function lightTimeToU(sec) {
  const s = Math.max(LANDMARKS[0].sec, Number(sec) || LANDMARKS[0].sec);
  if (s <= LANDMARKS[0].sec) return LANDMARKS[0].u;
  for (let i = 1; i < LANDMARKS.length; i++) {
    if (s <= LANDMARKS[i].sec) {
      const a = LANDMARKS[i - 1];
      const b = LANDMARKS[i];
      const t = (Math.log10(s) - Math.log10(a.sec)) / Math.max(1e-6, Math.log10(b.sec) - Math.log10(a.sec));
      return a.u + t * (b.u - a.u);
    }
  }
  return 1.0;
}

function uToLightTime(u) {
  const clamped = Math.max(0, Math.min(1, u));
  if (clamped <= LANDMARKS[0].u) return LANDMARKS[0].sec;
  for (let i = 1; i < LANDMARKS.length; i++) {
    if (clamped <= LANDMARKS[i].u) {
      const a = LANDMARKS[i - 1];
      const b = LANDMARKS[i];
      const t = (clamped - a.u) / Math.max(1e-6, b.u - a.u);
      const logS = Math.log10(a.sec) + t * (Math.log10(b.sec) - Math.log10(a.sec));
      return Math.pow(10, logS);
    }
  }
  return LIGHT_DAY_SEC;
}

function formatPulseClock(sec) {
  const s = Math.max(0, Math.min(LIGHT_DAY_SEC, sec));
  if (s >= LIGHT_DAY_SEC - 0.5) return "24h 00m 00s";
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const hh = String(hrs).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  if (s < 10) {
    const ss = rem < 10 ? `0${rem.toFixed(2)}` : rem.toFixed(2);
    return `${hh}h ${mm}m ${ss}s`;
  }
  const ss = String(Math.floor(rem)).padStart(2, "0");
  return `${hh}h ${mm}m ${ss}s`;
}

function formatCompactLightTime(sec) {
  if (sec < 0.01) return `${sec.toFixed(4)}s`;
  if (sec < 1) return `${sec.toFixed(2)}s`;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 2 : 0)}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatDistanceLabel(sec) {
  if (sec < 0.01) return `${Math.round(sec * C_KM_S)} km`;
  if (sec < 2.2) return `${Math.round(sec * C_KM_S).toLocaleString()} km`;
  if (sec < 30) return `${((sec * C_KM_S) / 1e6).toFixed(2)}M km`;
  const au = sec / AU_SEC;
  if (au < 10) return `${au.toFixed(2)} AU`;
  return `${au.toFixed(1)} AU`;
}

function getPulseMilestoneText(sec) {
  let label = PULSE_MILESTONES[0].label;
  for (let i = 0; i < PULSE_MILESTONES.length; i++) {
    if (sec >= PULSE_MILESTONES[i].sec * 0.96) {
      label = PULSE_MILESTONES[i].label;
    }
  }
  return label;
}

function clampCameraTargets() {
  targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
  const halfSpan = 0.5 / targetZoom;
  const minC = Math.min(0.5, Math.max(0.0, halfSpan - 0.04));
  const maxC = Math.max(0.5, Math.min(1.0, 1.0 - halfSpan + 0.04));
  targetCenterU = Math.max(minC, Math.min(maxC, targetCenterU));
  targetPanY = Math.max(-68, Math.min(68, targetPanY));
}

function getViewportMetrics(w, h) {
  const railVisible = false;
  const isMobile = w < 768;
  const isTablet = w >= 768 && w < 1024;

  const leftPad = isMobile ? 28 : 56;
  const rightPad = isMobile ? 28 : 56;
  const stageLeft = leftPad;
  const stageRight = Math.max(stageLeft + 180, w - rightPad);
  const stageW = stageRight - stageLeft;

  const topSafe = isMobile ? 204 : 192;
  const bottomSafe = isMobile ? h - 88 : h - 102;
  const axisY = (topSafe + bottomSafe) * 0.51 + camPanY;

  return {
    w, h, railVisible, isMobile, isTablet,
    stageLeft, stageRight, stageW,
    topSafe, bottomSafe, axisY
  };
}

function uToScreenX(u, m) {
  const span = m.stageW * camZoom;
  const centerX = m.stageLeft + m.stageW * 0.5;
  return centerX + (u - camCenterU) * span;
}

function screenXToU(sx, m) {
  const span = m.stageW * camZoom;
  const centerX = m.stageLeft + m.stageW * 0.5;
  return camCenterU + (sx - centerX) / Math.max(1, span);
}

function drawRoundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  if (typeof c.roundRect === "function") {
    c.roundRect(x, y, w, h, rr);
  } else {
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
}

// =========================================================================
// FLOATING "FIRE LIGHT PULSE (c)" HUD CONTROL (pure monochrome + crimson)
// =========================================================================

function injectHudStyles() {
  if (document.getElementById("space-view-hud-css")) return;
  const style = document.createElement("style");
  style.id = "space-view-hud-css";
  style.textContent = `
    #space-pulse-hud {
      position: fixed;
      top: 150px;
      right: 24px;
      z-index: 24;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 6px;
      border-radius: 999px;
      max-width: calc(100vw - 48px);
      pointer-events: auto;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #space-pulse-hud .sp-pulse-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 500;
      color: #f4f4f5;
      background: rgba(160, 70, 70, 0.20);
      border: 1px solid rgba(160, 70, 70, 0.52);
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.16s ease, border-color 0.16s ease, transform 0.12s ease, box-shadow 0.2s ease;
    }
    #space-pulse-hud .sp-pulse-btn:hover {
      background: rgba(160, 70, 70, 0.34);
      border-color: rgba(190, 92, 92, 0.78);
      color: #ffffff;
    }
    #space-pulse-hud .sp-pulse-btn:active {
      transform: scale(0.97);
    }
    #space-pulse-hud .sp-pulse-btn.is-firing {
      background: rgba(244, 244, 245, 0.94);
      border-color: rgba(255, 255, 255, 0.98);
      color: #09090b;
      box-shadow: 0 0 18px rgba(160, 70, 70, 0.38);
    }
    #space-pulse-hud .sp-pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: rgb(190, 92, 92);
      box-shadow: 0 0 8px rgba(190, 92, 92, 0.85);
      flex-shrink: 0;
    }
    #space-pulse-hud .sp-pulse-btn.is-firing .sp-pulse-dot {
      background: rgb(160, 70, 70);
      animation: spPhotonBeat 0.9s ease-in-out infinite;
    }
    @keyframes spPhotonBeat {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.42); opacity: 0.72; }
    }
    #space-pulse-readout {
      display: none;
      align-items: center;
      gap: 7px;
      padding: 0 10px 0 6px;
      min-width: 0;
      overflow: hidden;
    }
    #space-pulse-readout.is-visible {
      display: inline-flex;
    }
    #space-pulse-time {
      font-size: 13.5px;
      font-weight: 600;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      flex-shrink: 0;
    }
    #space-pulse-status {
      font-size: 13px;
      color: #d4d4d8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }
    #space-pulse-hud .sp-divider {
      width: 1px;
      height: 18px;
      background: rgba(255, 255, 255, 0.14);
      flex-shrink: 0;
    }
    #space-pulse-hud .sp-mini-btn {
      width: 30px;
      height: 30px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      line-height: 1;
      padding: 0;
      flex-shrink: 0;
    }
    #space-pulse-hud .sp-reset-btn {
      height: 30px;
      padding: 0 11px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    #space-pulse-hud .sp-zoom-tag {
      font-size: 12px;
      color: #a1a1aa;
      font-variant-numeric: tabular-nums;
      padding: 0 4px;
      white-space: nowrap;
      display: none;
    }
    #space-pulse-hud .sp-zoom-tag.is-visible {
      display: inline-block;
    }
    @media (max-width: 1180px) {
      #space-pulse-status {
        max-width: 165px;
      }
    }
    @media (max-width: 1023px) and (min-width: 768px) {
      #space-pulse-hud {
        right: 20px;
        left: auto;
        transform: none;
        top: 150px;
        max-width: calc(100vw - 40px);
      }
      body.card-open #space-pulse-hud .sp-zoom-group {
        display: none !important;
      }
    }
    @media (max-width: 767px) {
      #space-pulse-hud {
        top: calc(116px + env(safe-area-inset-top, 0px));
        right: auto;
        left: 50%;
        transform: translateX(-50%);
        max-width: calc(100vw - 20px);
        padding: 4px 5px;
        gap: 4px;
      }
      #space-pulse-hud .sp-pulse-btn {
        padding: 6px 11px;
        font-size: 12.5px;
        gap: 6px;
      }
      #space-pulse-time {
        font-size: 12.5px;
      }
      #space-pulse-status {
        font-size: 12px;
        max-width: 130px;
      }
      #space-pulse-hud .sp-zoom-group {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureSpaceHud() {
  if (document.getElementById("space-pulse-hud")) {
    hudRoot = document.getElementById("space-pulse-hud");
    return;
  }
  const container = document.getElementById("space-frontier-view");
  if (!container) return;

  injectHudStyles();

  hudRoot = document.createElement("div");
  hudRoot.id = "space-pulse-hud";
  hudRoot.className = "liquid-pill";
  hudRoot.setAttribute("aria-label", "Light Pulse Simulator and Space Zoom Controls");
  hudRoot.innerHTML = `
    <button id="btn-space-pulse" type="button" class="sp-pulse-btn" title="Launch a real-time photon wavefront at speed c from Earth to Voyager 1 (Spacebar)">
      <span class="sp-pulse-dot" aria-hidden="true"></span>
      <span id="space-pulse-btn-label">Fire Light Pulse (c)</span>
    </button>
    <div id="space-pulse-readout" aria-live="polite">
      <span id="space-pulse-time">00h 00m 00.00s</span>
      <span id="space-pulse-status">Departing Earth · LEO</span>
    </div>
    <span class="sp-divider sp-zoom-group" aria-hidden="true"></span>
    <span class="sp-zoom-group" style="display:inline-flex;align-items:center;gap:4px;">
      <button id="btn-space-zoom-out" type="button" class="glass-btn sp-mini-btn" title="Zoom out space scale" aria-label="Zoom out space scale">−</button>
      <span id="space-zoom-tag" class="sp-zoom-tag">1.0×</span>
      <button id="btn-space-zoom-in" type="button" class="glass-btn sp-mini-btn" title="Zoom in space scale" aria-label="Zoom in space scale">+</button>
    </span>
    <button id="btn-space-reset" type="button" class="glass-btn sp-reset-btn" style="display:none;" title="Reset space zoom, pan, and zone">Reset</button>
  `;

  container.appendChild(hudRoot);

  pulseBtn = hudRoot.querySelector("#btn-space-pulse");
  pulseBtnLabel = hudRoot.querySelector("#space-pulse-btn-label");
  pulseReadoutWrap = hudRoot.querySelector("#space-pulse-readout");
  pulseTimeEl = hudRoot.querySelector("#space-pulse-time");
  pulseStatusEl = hudRoot.querySelector("#space-pulse-status");
  zoomBadgeEl = hudRoot.querySelector("#space-zoom-tag");
  resetBtnEl = hudRoot.querySelector("#btn-space-reset");

  pulseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pulse.active) {
      stopLightPulse();
    } else {
      fireLightPulse();
    }
  });

  hudRoot.querySelector("#btn-space-zoom-in")?.addEventListener("click", (e) => {
    e.stopPropagation();
    hasInteracted = true;
    targetZoom *= 1.45;
    clampCameraTargets();
    syncHudControls();
  });

  hudRoot.querySelector("#btn-space-zoom-out")?.addEventListener("click", (e) => {
    e.stopPropagation();
    hasInteracted = true;
    targetZoom /= 1.45;
    clampCameraTargets();
    syncHudControls();
  });

  resetBtnEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasFiltered = activeZone !== "all";
    resetSpaceView();
    if (wasFiltered) {
      document.querySelector('#space-zone-pills .szone-btn[data-szone="all"]')?.click();
    }
  });
}

function syncHudControls() {
  if (!hudRoot) return;
  const zoomedOrFiltered = targetZoom > 1.06 || Math.abs(targetPanY) > 4 || activeZone !== "all";
  if (zoomBadgeEl) {
    if (camZoom > 1.06) {
      zoomBadgeEl.textContent = `${camZoom.toFixed(1)}×`;
      zoomBadgeEl.classList.add("is-visible");
    } else {
      zoomBadgeEl.classList.remove("is-visible");
    }
  }
  if (resetBtnEl) {
    resetBtnEl.style.display = zoomedOrFiltered ? "inline-flex" : "none";
  }

  if (pulseBtn && pulseBtnLabel) {
    if (pulse.active) {
      pulseBtn.classList.add("is-firing");
      pulseBtnLabel.textContent = "Stop Pulse";
    } else if (pulse.completed) {
      pulseBtn.classList.remove("is-firing");
      pulseBtnLabel.textContent = "Replay Pulse (c)";
    } else {
      pulseBtn.classList.remove("is-firing");
      pulseBtnLabel.textContent = "Fire Light Pulse (c)";
    }
  }

  if (pulseReadoutWrap) {
    if (pulse.active || pulse.completed) {
      pulseReadoutWrap.classList.add("is-visible");
    } else {
      pulseReadoutWrap.classList.remove("is-visible");
    }
  }
}

function fireLightPulse() {
  hasInteracted = true;
  pulse.active = true;
  pulse.completed = false;
  pulse.u = 0;
  pulse.startTime = performance.now();
  pulse.ripples = [];
  pulse.crossedIds.clear();
  pulse.litAt.clear();
  pulse.lastTickText = "";

  // Smoothly widen to full overview if user is tightly zoomed into a sub-zone
  if (targetZoom > 1.35) {
    targetZoom = 1.0;
    targetCenterU = 0.5;
    targetPanY = 0;
  }

  // Launch origin flash at Earth
  pulse.ripples.push({
    u: 0,
    yOffset: 0,
    born: pulse.startTime,
    maxR: 54,
    crimson: true
  });

  updatePulseReadout(0.0014, "Departing Earth · LEO");
  syncHudControls();
}

function stopLightPulse() {
  pulse.active = false;
  pulse.completed = false;
  pulse.u = 0;
  pulse.ripples = [];
  pulse.crossedIds.clear();
  pulse.litAt.clear();
  pulse.lastTickText = "";
  syncHudControls();
}

function updatePulseReadout(sec, statusText) {
  if (!pulseTimeEl || !pulseStatusEl) return;
  const timeStr = formatPulseClock(sec);
  const key = `${timeStr}|${statusText}`;
  if (key === pulse.lastTickText) return;
  pulse.lastTickText = key;
  pulseTimeEl.textContent = timeStr;
  pulseStatusEl.textContent = statusText;
}

// =========================================================================
// MISSION LAYOUT (deterministic micro-fan & non-overlapping tiers)
// =========================================================================

function computeMissionLayout(missions, m) {
  const sorted = [...missions].sort((a, b) => (a.lightTimeSec || 0) - (b.lightTimeSec || 0));

  // Group missions with nearly identical light-time so clusters fan cleanly instead of overlapping stems
  const groups = [];
  for (const mission of sorted) {
    const u = lightTimeToU(mission.lightTimeSec);
    const prev = groups[groups.length - 1];
    if (prev && Math.abs(prev.baseU - u) < 0.004) {
      prev.items.push(mission);
    } else {
      groups.push({ baseU: u, items: [mission] });
    }
  }

  const placed = [];
  const results = [];
  const minY = m.topSafe + 16;
  const maxY = m.bottomSafe - 16;

  for (const grp of groups) {
    const count = grp.items.length;
    const baseScreenX = uToScreenX(grp.baseU, m);
    const fanSpacing = m.isMobile ? 16 : 22;

    grp.items.forEach((mission, gIdx) => {
      const u = lightTimeToU(mission.lightTimeSec);
      const anchorX = uToScreenX(u, m);

      // Alternate above (-1) and below (+1), spreading horizontally within dense clusters
      const dir = gIdx % 2 === 0 ? -1 : 1;
      const sideIndex = Math.floor(gIdx / 2);
      const sideCount = Math.ceil((count - (dir > 0 ? 1 : 0)) / 2);
      const centerOffset = sideCount > 1 ? (sideIndex - (sideCount - 1) / 2) * fanSpacing : 0;

      // Gently scale fan spread when zoomed out vs zoomed in
      const fanScale = Math.min(1.2, 0.85 + (camZoom - 1) * 0.14);
      const x = baseScreenX + centerOffset * fanScale;

      const baseDist = m.isMobile ? 54 : 64;
      const tierStep = m.isMobile ? 30 : 34;
      let y = m.axisY + dir * (baseDist + (sideIndex % 3) * tierStep);

      // Collision-free vertical refinement against already placed beacons
      for (let step = 0; step < 8; step++) {
        const cand = m.axisY + dir * (baseDist + ((sideIndex + step) % 6) * tierStep);
        const clamped = Math.max(minY, Math.min(maxY, cand));
        const clash = placed.some(p => Math.abs(p.x - x) < 22 && Math.abs(p.y - clamped) < 22);
        y = clamped;
        if (!clash) break;
      }

      placed.push({ x, y });
      results.push({
        mission,
        u,
        anchorX,
        x,
        y,
        dir
      });
    });
  }

  return results;
}

// =========================================================================
// CELESTIAL LANDMARK RENDERERS (refined monochrome + crimson frontier)
// =========================================================================

function drawLandmarkBody(c, lm, x, y, nowSec, litBoost) {
  const r = lm.r;
  if (r <= 0) return;

  // Soft outer halo (brightens dynamically when Light Pulse passes!)
  const haloScale = (lm.type === "sun" ? 3.4 : 2.6) + litBoost * 1.4;
  const halo = c.createRadialGradient(x, y, r * 0.15, x, y, r * haloScale);
  if (lm.frontier) {
    halo.addColorStop(0, `rgba(160, 70, 70, ${(0.34 + litBoost * 0.36).toFixed(3)})`);
    halo.addColorStop(0.55, `rgba(160, 70, 70, ${(0.10 + litBoost * 0.12).toFixed(3)})`);
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  } else {
    halo.addColorStop(0, `rgba(244, 244, 245, ${(0.22 + litBoost * 0.38).toFixed(3)})`);
    halo.addColorStop(0.5, `rgba(212, 212, 216, ${(0.07 + litBoost * 0.14).toFixed(3)})`);
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  }
  c.fillStyle = halo;
  c.beginPath();
  c.arc(x, y, r * haloScale, 0, Math.PI * 2);
  c.fill();

  if (lm.type === "earth") {
    // Tilted LEO orbital tracks
    c.save();
    c.strokeStyle = "rgba(228, 228, 231, 0.28)";
    c.lineWidth = 0.85;
    c.beginPath();
    c.ellipse(x, y, r * 1.65, r * 0.62, -0.42, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = "rgba(228, 228, 231, 0.16)";
    c.beginPath();
    c.ellipse(x, y, r * 1.42, r * 0.52, 0.62, 0, Math.PI * 2);
    c.stroke();
    c.restore();

    // Shaded Earth sphere with bright atmospheric rim
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.55, "#a1a1aa");
    g.addColorStop(1, "#27272a");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = "rgba(255, 255, 255, 0.68)";
    c.lineWidth = 1.1;
    c.stroke();
    return;
  }

  if (lm.type === "moon") {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, "#f4f4f5");
    g.addColorStop(0.62, "#a1a1aa");
    g.addColorStop(1, "#3f3f46");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();

    // Subtle monochrome crater hints
    c.strokeStyle = "rgba(24, 24, 27, 0.38)";
    c.lineWidth = 0.7;
    c.beginPath();
    c.arc(x - 2.1, y - 1.4, 2.0, 0, Math.PI * 2);
    c.moveTo(x + 3.4, y + 1.8);
    c.arc(x + 2.0, y + 1.8, 1.4, 0, Math.PI * 2);
    c.stroke();
    return;
  }

  if (lm.type === "lagrange") {
    // Minimalist gravitational Lissajous / halo orbit geometry
    c.save();
    c.strokeStyle = `rgba(228, 228, 231, ${(0.42 + litBoost * 0.45).toFixed(3)})`;
    c.lineWidth = 1;
    c.setLineDash([2.5, 2.5]);
    c.beginPath();
    c.ellipse(x, y, r * 2.1, r * 1.15, 0.25, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);

    // Diamond saddle reticle
    c.fillStyle = "#e4e4e7";
    c.beginPath();
    c.moveTo(x, y - 4.5);
    c.lineTo(x + 4.5, y);
    c.lineTo(x, y + 4.5);
    c.lineTo(x - 4.5, y);
    c.closePath();
    c.fill();
    c.restore();
    return;
  }

  if (lm.type === "sun") {
    // Pure monochrome silver-white radiant solar corona (zero yellow)
    c.save();
    c.translate(x, y);
    c.rotate(nowSec * 0.05);
    c.strokeStyle = `rgba(244, 244, 245, ${(0.22 + litBoost * 0.25).toFixed(3)})`;
    c.lineWidth = 0.85;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const len = i % 2 === 0 ? r * 1.85 : r * 1.5;
      c.beginPath();
      c.moveTo(Math.cos(ang) * (r * 1.08), Math.sin(ang) * (r * 1.08));
      c.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      c.stroke();
    }
    c.restore();

    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.7, "#f4f4f5");
    g.addColorStop(1, "#d4d4d8");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    return;
  }

  if (lm.type === "mars") {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, "#e4e4e7");
    g.addColorStop(0.55, "#9a8282"); // restrained muted crimson-grey tone
    g.addColorStop(1, "#32292a");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();

    // Subtle north polar cap highlight
    c.fillStyle = "rgba(255, 255, 255, 0.55)";
    c.beginPath();
    c.ellipse(x - 0.5, y - r + 1.5, r * 0.38, 1.3, -0.1, 0, Math.PI * 2);
    c.fill();
    return;
  }

  if (lm.type === "jupiter") {
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.clip();

    const baseG = c.createRadialGradient(x - r * 0.35, y - r * 0.3, r * 0.1, x, y, r * 1.1);
    baseG.addColorStop(0, "#f4f4f5");
    baseG.addColorStop(0.6, "#a1a1aa");
    baseG.addColorStop(1, "#3f3f46");
    c.fillStyle = baseG;
    c.fillRect(x - r, y - r, r * 2, r * 2);

    // Subtle monochrome cloud bands
    const bands = [
      { dy: -0.52, h: 0.20, color: "rgba(39, 39, 42, 0.28)" },
      { dy: -0.16, h: 0.22, color: "rgba(255, 255, 255, 0.20)" },
      { dy: 0.14,  h: 0.24, color: "rgba(39, 39, 42, 0.32)" },
      { dy: 0.50,  h: 0.18, color: "rgba(24, 24, 27, 0.26)" }
    ];
    for (const b of bands) {
      c.fillStyle = b.color;
      c.fillRect(x - r, y + b.dy * r, r * 2, b.h * r);
    }

    // Subtle storm oval
    c.fillStyle = "rgba(160, 70, 70, 0.28)";
    c.beginPath();
    c.ellipse(x + r * 0.22, y + r * 0.26, r * 0.24, r * 0.13, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.strokeStyle = "rgba(244, 244, 245, 0.24)";
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
    return;
  }

  if (lm.type === "saturn") {
    const tilt = -0.34;
    // Back half of rings (behind planet)
    c.save();
    c.translate(x, y);
    c.rotate(tilt);

    c.strokeStyle = "rgba(228, 228, 231, 0.42)";
    c.lineWidth = 2.4;
    c.beginPath();
    c.ellipse(0, 0, r * 2.15, r * 0.54, 0, Math.PI, Math.PI * 2);
    c.stroke();

    c.strokeStyle = "rgba(244, 244, 245, 0.58)";
    c.lineWidth = 1.6;
    c.beginPath();
    c.ellipse(0, 0, r * 1.68, r * 0.42, 0, Math.PI, Math.PI * 2);
    c.stroke();
    c.restore();

    // Shaded Saturn orb
    const g = c.createRadialGradient(x - r * 0.32, y - r * 0.32, r * 0.1, x, y, r);
    g.addColorStop(0, "#f4f4f5");
    g.addColorStop(0.58, "#b4b4bc");
    g.addColorStop(1, "#3f3f46");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();

    // Front half of rings (in front of planet) with subtle Cassini gap
    c.save();
    c.translate(x, y);
    c.rotate(tilt);

    c.strokeStyle = "rgba(228, 228, 231, 0.58)";
    c.lineWidth = 2.5;
    c.beginPath();
    c.ellipse(0, 0, r * 2.15, r * 0.54, 0, 0, Math.PI);
    c.stroke();

    c.strokeStyle = "rgba(255, 255, 255, 0.78)";
    c.lineWidth = 1.7;
    c.beginPath();
    c.ellipse(0, 0, r * 1.68, r * 0.42, 0, 0, Math.PI);
    c.stroke();
    c.restore();
    return;
  }

  if (lm.type === "frontier") {
    // 1 Light-Day frontier reticle with crimson pulse ring
    const breath = 0.5 + 0.5 * Math.sin(nowSec * 2.2);
    c.strokeStyle = `rgba(160, 70, 70, ${(0.55 + breath * 0.3 + litBoost * 0.25).toFixed(3)})`;
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(x, y, r + 4.5 + breath * 2.5, 0, Math.PI * 2);
    c.stroke();

    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(x, y, r * 0.62, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = CRIMSON;
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  }
}

// =========================================================================
// MAIN 60FPS RENDER LOOP
// =========================================================================

function drawFrame(now) {
  if (!canvas || !ctx || store.state.viewMode !== "space") {
    rafId = null;
    return;
  }

  const dt = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) / 1000) : 0.016;
  lastFrameTime = now;
  const nowSec = now * 0.001;

  // Smooth exponential camera damping (frame-rate independent)
  const ease = 1 - Math.exp(-9.5 * dt);
  camZoom += (targetZoom - camZoom) * ease;
  camCenterU += (targetCenterU - camCenterU) * ease;
  camPanY += (targetPanY - camPanY) * ease;

  if (Math.abs(targetZoom - camZoom) < 0.001) camZoom = targetZoom;
  if (Math.abs(targetCenterU - camCenterU) < 0.0001) camCenterU = targetCenterU;
  if (Math.abs(targetPanY - camPanY) < 0.05) camPanY = targetPanY;

  // Keep zoom badge updated softly
  if (zoomBadgeEl && camZoom > 1.06) {
    const zTxt = `${camZoom.toFixed(1)}×`;
    if (zoomBadgeEl.textContent !== zTxt) zoomBadgeEl.textContent = zTxt;
  }

  // Advance Light Pulse (c) simulation
  const allMissions = Array.isArray(store.spaceMissions) ? store.spaceMissions : [];
  if (pulse.active) {
    const rawT = Math.min(1, (now - pulse.startTime) / PULSE_DURATION_MS);
    // Gentle S-curve at start & arrival for dramatic pacing while staying near-linear in log-space
    const easedT = rawT < 0.06
      ? (rawT / 0.06) * (rawT / 0.06) * 0.06
      : rawT > 0.94
        ? 1 - Math.pow((1 - rawT) / 0.06, 2) * 0.06
        : rawT;
    pulse.u = Math.max(0, Math.min(1, easedT));

    const currentSec = uToLightTime(pulse.u);
    const milestoneText = getPulseMilestoneText(currentSec);
    updatePulseReadout(currentSec, milestoneText);

    // Trigger arrival ripples on landmarks
    for (const lm of LANDMARKS) {
      if (pulse.u >= lm.u && !pulse.crossedIds.has(`lm:${lm.id}`)) {
        pulse.crossedIds.add(`lm:${lm.id}`);
        pulse.litAt.set(`lm:${lm.id}`, now);
        pulse.ripples.push({
          u: lm.u,
          yOffset: 0,
          born: now,
          maxR: lm.frontier ? 84 : lm.boundary ? 64 : 44,
          crimson: Boolean(lm.frontier || lm.boundary)
        });
      }
    }

    // Trigger arrival pings on missions
    for (const mission of allMissions) {
      const mu = lightTimeToU(mission.lightTimeSec);
      if (pulse.u >= mu && !pulse.crossedIds.has(`ms:${mission.id}`)) {
        pulse.crossedIds.add(`ms:${mission.id}`);
        pulse.litAt.set(`ms:${mission.id}`, now);
      }
    }

    if (rawT >= 1) {
      pulse.active = false;
      pulse.completed = true;
      pulse.u = 1.0;
      updatePulseReadout(LIGHT_DAY_SEC, "Reached Voyager 1 · 1 Light-Day!");
      // Grand arrival ripple at Voyager 1
      pulse.ripples.push({ u: 1.0, yOffset: 0, born: now, maxR: 110, crimson: true });
      pulse.ripples.push({ u: 1.0, yOffset: 0, born: now + 180, maxR: 72, crimson: false });
      syncHudControls();
    }
  }

  // Size canvas cleanly for HiDPI displays
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const m = getViewportMetrics(w, h);
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // -----------------------------------------------------------------------
  // LAYER 0: Subtle Monochrome Cosmic Depth Gradient
  // -----------------------------------------------------------------------
  const sunX = uToScreenX(0.34, m);
  const bgGlow = ctx.createRadialGradient(sunX, m.axisY, 20, sunX, m.axisY, Math.max(w, h) * 0.65);
  bgGlow.addColorStop(0, "rgba(255, 255, 255, 0.032)");
  bgGlow.addColorStop(0.45, "rgba(255, 255, 255, 0.008)");
  bgGlow.addColorStop(1, "rgba(5, 5, 6, 0)");
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, w, h);

  // -----------------------------------------------------------------------
  // LAYER 1: Multi-Depth Parallax Starfield
  // -----------------------------------------------------------------------
  const parallaxShiftX = (0.5 - camCenterU) * m.stageW * 0.22;
  const parallaxShiftY = camPanY * 0.25;
  for (const st of stars) {
    const sx = ((st.x * w + parallaxShiftX * st.parallax) % w + w) % w;
    const sy = ((st.y * h + parallaxShiftY * st.parallax) % h + h) % h;
    const twinkle = prefersReducedMotion ? 1 : (0.76 + 0.24 * Math.sin(nowSec * st.speed + st.twinkle));
    const alpha = st.a * twinkle;

    ctx.fillStyle = `rgba(232, 232, 236, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, st.r, 0, Math.PI * 2);
    ctx.fill();

    if (st.glint && alpha > 0.36) {
      ctx.strokeStyle = `rgba(244, 244, 245, ${(alpha * 0.45).toFixed(3)})`;
      ctx.lineWidth = 0.6;
      const gLen = st.r * 3.1;
      ctx.beginPath();
      ctx.moveTo(sx - gLen, sy);
      ctx.lineTo(sx + gLen, sy);
      ctx.moveTo(sx, sy - gLen);
      ctx.lineTo(sx, sy + gLen);
      ctx.stroke();
    }
  }

  // -----------------------------------------------------------------------
  // LAYER 2: Planetary Orbit Arcs, Belts, Heliopause & Frontier Lines
  // -----------------------------------------------------------------------
  const originX = uToScreenX(0, m) - Math.max(220, m.stageW * 0.42);
  const clipTop = Math.max(138, m.topSafe - 54);
  const clipBottom = Math.min(h - 68, m.bottomSafe + 34);
  const arcHalfH = Math.min(h * 0.34, (clipBottom - clipTop) * 0.52);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, clipTop, w, Math.max(10, clipBottom - clipTop));
  ctx.clip();

  for (const lm of LANDMARKS) {
    const lx = uToScreenX(lm.u, m);
    if (lx < -120 || lx > w + 120) continue;

    if (lm.type === "belt") {
      // Subtle curved Asteroid Belt stipple field
      for (const sp of asteroidSpecks) {
        const driftY = prefersReducedMotion ? 0 : Math.sin(nowSec * 0.35 + sp.phase) * 3;
        const sy = m.axisY + sp.yNorm * (arcHalfH * 1.85) + driftY;
        const curveOffset = -Math.pow((sy - m.axisY) / Math.max(120, arcHalfH), 2) * 14;
        const sx = uToScreenX(lm.u + sp.du, m) + curveOffset;
        if (sx < -10 || sx > w + 10) continue;
        ctx.fillStyle = `rgba(180, 180, 188, ${sp.a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Faint belt center hairline
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(lx, m.axisY - arcHalfH * 0.85);
      ctx.lineTo(lx, m.axisY + arcHalfH * 0.85);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }

    if (lm.type === "kuiper") {
      // Subtle scattered Kuiper Belt icy dust band
      for (const sp of kuiperSpecks) {
        const driftY = prefersReducedMotion ? 0 : Math.cos(nowSec * 0.25 + sp.phase) * 2.5;
        const sy = m.axisY + sp.yNorm * (arcHalfH * 1.95) + driftY;
        const curveOffset = -Math.pow((sy - m.axisY) / Math.max(120, arcHalfH), 2) * 22;
        const sx = uToScreenX(lm.u + sp.du, m) + curveOffset;
        if (sx < -10 || sx > w + 10) continue;
        ctx.fillStyle = `rgba(161, 161, 170, ${sp.a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }

    if (lm.type === "heliopause") {
      // Dramatic curved Heliopause bow-shock boundary (~120 AU)
      const litT = pulse.litAt.has("lm:heliopause") ? Math.max(0, 1 - (now - pulse.litAt.get("lm:heliopause")) / 2200) : 0;
      const bowCurve = Math.min(72, 34 + camZoom * 8);

      // Soft outer heliosheath glow
      ctx.strokeStyle = `rgba(212, 212, 216, ${(0.10 + litT * 0.24).toFixed(3)})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(lx - bowCurve, m.axisY - arcHalfH);
      ctx.quadraticCurveTo(lx + bowCurve * 0.55, m.axisY, lx - bowCurve, m.axisY + arcHalfH);
      ctx.stroke();

      // Crisp primary heliopause arc
      ctx.strokeStyle = `rgba(228, 228, 231, ${(0.34 + litT * 0.42).toFixed(3)})`;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(lx - bowCurve, m.axisY - arcHalfH);
      ctx.quadraticCurveTo(lx + bowCurve * 0.55, m.axisY, lx - bowCurve, m.axisY + arcHalfH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Subtle Interstellar Medium indicator to the right of Heliopause
      if (!m.isMobile || camZoom > 1.4) {
        const ismX = lx + 12;
        const maxRight = m.railVisible ? w - 372 : w - 20;
        if (ismX + 95 < maxRight) {
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.font = `500 11px ${FONT_FAMILY}`;
          ctx.fillStyle = "rgba(161, 161, 170, 0.52)";
          ctx.fillText("Interstellar Medium →", ismX, m.axisY - arcHalfH + 16);
        }
      }
      continue;
    }

    if (lm.frontier) {
      // 1 Light-Day crimson dashed frontier meridian
      const litT = pulse.litAt.has("lm:lightday") ? Math.max(0, 1 - (now - pulse.litAt.get("lm:lightday")) / 2600) : 0;
      ctx.strokeStyle = `rgba(160, 70, 70, ${(0.48 + litT * 0.42).toFixed(3)})`;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(lx, m.axisY - arcHalfH);
      ctx.lineTo(lx, m.axisY + arcHalfH);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }

    // Subtle concentric planetary orbit arc curving through each landmark
    const radius = Math.max(80, lx - originX);
    const maxAngle = Math.min(0.42, arcHalfH / radius);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.065)";
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.arc(originX, m.axisY, radius, -maxAngle, maxAngle);
    ctx.stroke();
  }
  ctx.restore();

  // -----------------------------------------------------------------------
  // LAYER 3: Calibrated Logarithmic Horizontal Spine & Decade Ruler Ticks
  // -----------------------------------------------------------------------
  const spineLeft = uToScreenX(0, m);
  const spineRight = uToScreenX(1, m);

  const spineGrad = ctx.createLinearGradient(spineLeft, m.axisY, spineRight, m.axisY);
  spineGrad.addColorStop(0, "rgba(244, 244, 245, 0.56)");
  spineGrad.addColorStop(0.45, "rgba(161, 161, 170, 0.26)");
  spineGrad.addColorStop(0.88, "rgba(212, 212, 216, 0.36)");
  spineGrad.addColorStop(1, "rgba(160, 70, 70, 0.72)");
  ctx.strokeStyle = spineGrad;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(spineLeft, m.axisY);
  ctx.lineTo(spineRight, m.axisY);
  ctx.stroke();

  // Precision logarithmic decade ticks along spine
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 0.9;
  for (const tk of DECADE_TICKS) {
    const tx = uToScreenX(lightTimeToU(tk.sec), m);
    if (tx < 12 || tx > (m.railVisible ? w - 364 : w - 12)) continue;
    ctx.beginPath();
    ctx.moveTo(tx, m.axisY - 4);
    ctx.lineTo(tx, m.axisY + 4);
    ctx.stroke();
  }

  // -----------------------------------------------------------------------
  // LAYER 3B: Luminous Light Pulse (c) Beam, Wavefront Bow & Arrival Ripples
  // -----------------------------------------------------------------------
  if (pulse.active || pulse.completed) {
    const frontX = uToScreenX(pulse.u, m);

    // Illuminated crimson-silver energy wake behind photon
    const beamGrad = ctx.createLinearGradient(spineLeft, m.axisY, frontX, m.axisY);
    beamGrad.addColorStop(0, "rgba(160, 70, 70, 0.14)");
    beamGrad.addColorStop(0.65, "rgba(160, 70, 70, 0.46)");
    beamGrad.addColorStop(0.92, "rgba(244, 244, 245, 0.85)");
    beamGrad.addColorStop(1, "#ffffff");

    // Soft outer beam aura
    ctx.save();
    ctx.strokeStyle = "rgba(160, 70, 70, 0.34)";
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(spineLeft, m.axisY);
    ctx.lineTo(frontX, m.axisY);
    ctx.stroke();

    // Crisp photonic core line
    ctx.strokeStyle = beamGrad;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(spineLeft, m.axisY);
    ctx.lineTo(frontX, m.axisY);
    ctx.stroke();
    ctx.restore();

    // Curved spherical photon wavefront arc while actively propagating
    if (pulse.active && frontX > -40 && frontX < w + 40) {
      const waveH = Math.min(180, arcHalfH * 0.72);
      const bow = 22;

      // Chromatic crimson trailing sheath
      ctx.strokeStyle = "rgba(160, 70, 70, 0.32)";
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(frontX - bow - 4, m.axisY - waveH);
      ctx.quadraticCurveTo(frontX + 2, m.axisY, frontX - bow - 4, m.axisY + waveH);
      ctx.stroke();

      // Razor-bright white photon wavefront edge
      const wfGrad = ctx.createLinearGradient(frontX, m.axisY - waveH, frontX, m.axisY + waveH);
      wfGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      wfGrad.addColorStop(0.32, "rgba(244, 244, 245, 0.62)");
      wfGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.98)");
      wfGrad.addColorStop(0.68, "rgba(244, 244, 245, 0.62)");
      wfGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.strokeStyle = wfGrad;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(frontX - bow, m.axisY - waveH);
      ctx.quadraticCurveTo(frontX + 6, m.axisY, frontX - bow, m.axisY + waveH);
      ctx.stroke();

      // Luminous photon spark at spine intersection
      const sparkGlow = ctx.createRadialGradient(frontX, m.axisY, 0, frontX, m.axisY, 24);
      sparkGlow.addColorStop(0, "rgba(255, 255, 255, 0.98)");
      sparkGlow.addColorStop(0.3, "rgba(244, 244, 245, 0.55)");
      sparkGlow.addColorStop(0.65, "rgba(160, 70, 70, 0.34)");
      sparkGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = sparkGlow;
      ctx.beginPath();
      ctx.arc(frontX, m.axisY, 24, 0, Math.PI * 2);
      ctx.fill();

      // Floating compact speed-of-light tag riding above the photon
      const curSec = uToLightTime(pulse.u);
      const tagText = `c · ${formatCompactLightTime(curSec)} · ${formatDistanceLabel(curSec)}`;
      ctx.font = `500 11.5px ${FONT_FAMILY}`;
      const tw = ctx.measureText(tagText).width + 18;
      const th = 24;
      const maxTagRight = m.railVisible ? w - 372 : w - 16;
      const tx = Math.max(14, Math.min(maxTagRight - tw, frontX - tw / 2));
      const ty = Math.max(m.topSafe + 4, m.axisY - waveH * 0.58 - 18);

      ctx.fillStyle = "rgba(14, 14, 16, 0.88)";
      ctx.strokeStyle = "rgba(160, 70, 70, 0.62)";
      ctx.lineWidth = 1;
      drawRoundRect(ctx, tx, ty, tw, th, 999);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f4f4f5";
      ctx.fillText(tagText, tx + tw / 2, ty + th / 2 + 0.5);
    }
  }

  // Expanding arrival ripples
  for (let i = pulse.ripples.length - 1; i >= 0; i--) {
    const rp = pulse.ripples[i];
    const age = (now - rp.born) / 1000;
    if (age < 0) continue;
    const dur = 1.15;
    if (age > dur) {
      pulse.ripples.splice(i, 1);
      continue;
    }
    const p = age / dur;
    const easeOut = 1 - Math.pow(1 - p, 3);
    const rx = uToScreenX(rp.u, m);
    const ry = m.axisY + rp.yOffset;
    const rad = 6 + easeOut * rp.maxR;
    const alpha = (1 - p) * 0.65;

    ctx.strokeStyle = rp.crimson
      ? `rgba(160, 70, 70, ${alpha.toFixed(3)})`
      : `rgba(244, 244, 245, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.4 * (1 - p * 0.5);
    ctx.beginPath();
    ctx.arc(rx, ry, rad, 0, Math.PI * 2);
    ctx.stroke();
  }

  // -----------------------------------------------------------------------
  // LAYER 4: Celestial Landmarks & Collision-Tested Landmark Labels
  // -----------------------------------------------------------------------
  const labelBoxes = [];
  const lmHits = [];
  const maxSafeRight = m.railVisible ? w - 366 : w - 12;

  for (const lm of LANDMARKS) {
    const x = uToScreenX(lm.u, m);
    if (x < -80 || x > w + 80) continue;

    const litTime = pulse.litAt.get(`lm:${lm.id}`);
    const litBoost = litTime ? Math.max(0, 1 - (now - litTime) / 1800) : 0;
    const isHoveredLm = hoveredLandmarkId === lm.id;

    drawLandmarkBody(ctx, lm, x, m.axisY, nowSec, Math.max(litBoost, isHoveredLm ? 0.55 : 0));

    if (lm.r > 0) {
      lmHits.push({ id: lm.id, zone: lm.zone, u: lm.u, x, y: m.axisY, r: Math.max(16, lm.r + 8) });
      // Reserve orb bounding box so mission labels never collide with planets
      labelBoxes.push({
        x1: x - lm.r - 6,
        y1: m.axisY - lm.r - 6,
        x2: x + lm.r + 6,
        y2: m.axisY + lm.r + 6
      });
    }

    // Landmark label placement (hide non-essential intermediate belt labels on tight mobile overview)
    const hideOnTightMobile = m.isMobile && camZoom < 1.55 && (lm.type === "belt" || lm.type === "lagrange" || lm.type === "kuiper");
    if (hideOnTightMobile) continue;
    if (x < 24 || x > maxSafeRight - 20) continue;

    const labelY = lm.r > 0 ? m.axisY + lm.r + 19 : m.axisY + 24;
    ctx.font = `500 ${m.isMobile ? 11.5 : 12.5}px ${FONT_FAMILY}`;
    const lw = Math.max(ctx.measureText(lm.label).width, ctx.measureText(lm.sub).width);
    const box = {
      x1: x - lw / 2 - 5,
      y1: labelY - 8,
      x2: x + lw / 2 + 5,
      y2: labelY + 24
    };

    const collides = labelBoxes.some(b =>
      !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)
    );
    if (!collides || lm.frontier || lm.id === "earth" || lm.id === "sun") {
      labelBoxes.push(box);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = lm.frontier
        ? "#ffffff"
        : lm.subtle || lm.boundary
          ? `rgba(212, 212, 216, ${(0.70 + litBoost * 0.28).toFixed(3)})`
          : `rgba(244, 244, 245, ${(0.90 + litBoost * 0.1).toFixed(3)})`;
      ctx.fillText(lm.label, x, labelY);

      ctx.font = `400 ${m.isMobile ? 10.5 : 11.5}px ${FONT_FAMILY}`;
      ctx.fillStyle = lm.frontier
        ? "rgb(196, 102, 102)"
        : "rgba(161, 161, 170, 0.76)";
      ctx.fillText(lm.sub, x, labelY + 15);
    }
  }
  landmarkHitboxes = lmHits;

  // -----------------------------------------------------------------------
  // LAYER 5: Mission Beacons, Subtle Ghost Context, Stems & Clean Labels
  // -----------------------------------------------------------------------
  const activeMissions = allMissions.filter(ms => activeZone === "all" || ms.zoneId === activeZone);

  // When filtered to a zone, draw faint ghost dots on the spine for out-of-zone context
  if (activeZone !== "all") {
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    for (const ms of allMissions) {
      if (ms.zoneId === activeZone) continue;
      const gx = uToScreenX(lightTimeToU(ms.lightTimeSec), m);
      if (gx < 8 || gx > maxSafeRight) continue;
      ctx.beginPath();
      ctx.arc(gx, m.axisY, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const layout = computeMissionLayout(activeMissions, m);
  const hits = [];
  let tooltipItem = null;

  for (const item of layout) {
    const { mission, u, anchorX, x, y, dir } = item;
    if (x < -40 || x > w + 40) continue;

    const isSelected = selectedMissionId === mission.id;
    const isHovered = hoveredMissionId === mission.id;
    const litTime = pulse.litAt.get(`ms:${mission.id}`);
    const pulseFlash = litTime ? Math.max(0, 1 - (now - litTime) / 1600) : 0;
    const pulsePassed = (pulse.active || pulse.completed) && pulse.u >= u;

    // Refined tether stem (smooth subtle elbow curve when fanned horizontally from anchor)
    ctx.strokeStyle = isSelected
      ? "rgba(160, 70, 70, 0.82)"
      : isHovered || pulseFlash > 0.25
        ? `rgba(255, 255, 255, ${(0.45 + pulseFlash * 0.45).toFixed(3)})`
        : pulsePassed
          ? "rgba(228, 228, 231, 0.28)"
          : "rgba(255, 255, 255, 0.13)";
    ctx.lineWidth = isSelected || isHovered ? 1.5 : 0.95;
    ctx.beginPath();
    ctx.moveTo(anchorX, m.axisY);
    if (Math.abs(x - anchorX) > 2) {
      const midY = m.axisY + (y - m.axisY) * 0.45;
      ctx.bezierCurveTo(anchorX, midY, x, midY, x, y);
    } else {
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Small anchor tick on spine
    ctx.fillStyle = isSelected ? CRIMSON : "rgba(228, 228, 231, 0.45)";
    ctx.beginPath();
    ctx.arc(anchorX, m.axisY, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Beacon halo
    const baseR = isSelected ? 6.2 : isHovered ? 5.4 : 4.1;
    const glowR = baseR + 5.5 + pulseFlash * 8;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fillStyle = isSelected
      ? "rgba(160, 70, 70, 0.40)"
      : pulseFlash > 0.05
        ? `rgba(160, 70, 70, ${(0.18 + pulseFlash * 0.36).toFixed(3)})`
        : isHovered
          ? "rgba(244, 244, 245, 0.24)"
          : "rgba(228, 228, 231, 0.11)";
    ctx.fill();

    // Beacon core (status differentiated cleanly within monochrome palette)
    const dotColor = isSelected
      ? "#ffffff"
      : pulseFlash > 0.25
        ? "#ffffff"
        : mission.status === "active"
          ? "#e4e4e7"
          : mission.status === "upcoming"
            ? "#18181b"
            : "#71717a";

    ctx.beginPath();
    ctx.arc(x, y, baseR, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.lineWidth = isSelected ? 1.7 : mission.status === "upcoming" ? 1.5 : 1.15;
    ctx.strokeStyle = isSelected ? CRIMSON : mission.status === "upcoming" ? "#d4d4d8" : "#f4f4f5";
    ctx.stroke();

    // Reserve beacon circle in labelBoxes so other labels don't overlap dots
    labelBoxes.push({ x1: x - 10, y1: y - 10, x2: x + 10, y2: y + 10 });

    if (isHovered || isSelected) {
      // Hover takes precedence over selection if hovering another beacon
      if (!tooltipItem || isHovered) {
        tooltipItem = item;
      }
    }

    if (x >= 8 && x <= maxSafeRight) {
      hits.push({ id: mission.id, x, y, r: m.isMobile ? 24 : 20 });
    }
  }
  missionHitboxes = hits;

  // Deterministic non-overlapping micro-labels for key missions (and all visible when zoomed in!)
  const prioritized = [...layout].sort((a, b) => {
    const score = (it) => {
      if (it.mission.id === selectedMissionId) return 100;
      if (it.mission.id === hoveredMissionId) return 90;
      if (FEATURED_IDS.has(it.mission.id)) return 50;
      return 10;
    };
    return score(b) - score(a);
  });

  ctx.font = `500 ${m.isMobile ? 11 : 11.5}px ${FONT_FAMILY}`;
  for (const item of prioritized) {
    const { mission, x, y, dir } = item;
    if (tooltipItem && tooltipItem.mission.id === mission.id) continue;
    if (x < 24 || x > maxSafeRight - 24) continue;

    // On overview (zoom < 1.65), only label featured flagships or active zone missions
    const eligible = activeZone !== "all" || camZoom >= 1.65 || FEATURED_IDS.has(mission.id);
    if (!eligible) continue;

    const shortLabel = SHORT_NAMES[mission.id] || mission.name.split(" (")[0];
    const tw = ctx.measureText(shortLabel).width;
    const ly = dir < 0 ? y - 16 : y + 17;
    if (ly < m.topSafe + 8 || ly > m.bottomSafe - 8) continue;

    const box = {
      x1: x - tw / 2 - 5,
      y1: ly - 7,
      x2: x + tw / 2 + 5,
      y2: ly + 7
    };
    if (box.x1 < 12 || box.x2 > maxSafeRight - 6) continue;

    const collides = labelBoxes.some(b =>
      !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2)
    );
    if (collides) continue;

    labelBoxes.push(box);

    const litTime = pulse.litAt.get(`ms:${mission.id}`);
    const pulseFlash = litTime ? Math.max(0, 1 - (now - litTime) / 1800) : 0;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = pulseFlash > 0.1
      ? "#ffffff"
      : mission.id === "voyager1"
        ? "rgba(244, 244, 245, 0.94)"
        : "rgba(212, 212, 216, 0.72)";
    ctx.fillText(shortLabel, x, ly);
  }

  // Elevated floating frosted telemetry pill for hovered or selected mission
  if (tooltipItem) {
    const { mission, x, y, dir } = tooltipItem;
    const primaryText = mission.name;
    const metaText = `${mission.lightTimeLabel.split(" (")[0]} · ${mission.distanceAU >= 1 ? `${mission.distanceAU} AU` : mission.body.split(" (")[0]}`;

    ctx.font = `500 13px ${FONT_FAMILY}`;
    const w1 = ctx.measureText(primaryText).width;
    ctx.font = `400 11.5px ${FONT_FAMILY}`;
    const w2 = ctx.measureText(metaText).width;
    const tw = Math.min(m.isMobile ? w - 28 : 340, Math.max(w1, w2) + 28);
    const th = 46;

    const maxPillRight = m.railVisible ? w - 368 : w - 14;
    const bx = Math.max(14, Math.min(maxPillRight - tw, x - tw / 2));
    let by = dir < 0 ? y - th - 14 : y + 14;
    if (by < m.topSafe + 4) by = y + 14;
    if (by + th > m.bottomSafe - 4) by = y - th - 14;

    ctx.fillStyle = "rgba(15, 15, 17, 0.94)";
    ctx.strokeStyle = selectedMissionId === mission.id
      ? "rgba(160, 70, 70, 0.72)"
      : "rgba(255, 255, 255, 0.24)";
    ctx.lineWidth = 1;
    drawRoundRect(ctx, bx, by, tw, th, 14);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx + 10, by, tw - 20, th);
    ctx.clip();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `500 13px ${FONT_FAMILY}`;
    ctx.fillStyle = "#f4f4f5";
    ctx.fillText(primaryText, bx + 14, by + 16);

    ctx.font = `400 11.5px ${FONT_FAMILY}`;
    ctx.fillStyle = selectedMissionId === mission.id ? "rgb(210, 120, 120)" : "#a1a1aa";
    ctx.fillText(metaText, bx + 14, by + 33);
    ctx.restore();
  }

  // Subtle quiet legend / gesture hint at bottom-left on desktop (fades out once interacted)
  if (!m.isMobile && !hasInteracted && !document.body.classList.contains("card-open")) {
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = `400 12px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(161, 161, 170, 0.56)";
    ctx.fillText("Scroll to zoom · Drag to pan · Click any beacon or planet", 26, h - 98);
  }

  rafId = requestAnimationFrame(drawFrame);
}

// =========================================================================
// HIT TESTING & INTERACTIONS (Mouse, Wheel, Touch Pinch & Pan, Keyboard)
// =========================================================================

function findNearestHit(list, x, y) {
  let best = null;
  let bestD2 = Infinity;
  for (const h of list) {
    const d2 = (x - h.x) ** 2 + (y - h.y) ** 2;
    if (d2 <= h.r * h.r && d2 < bestD2) {
      bestD2 = d2;
      best = h;
    }
  }
  return best;
}

function handleWheel(e) {
  if (store.state.viewMode !== "space") return;
  e.preventDefault();
  hasInteracted = true;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const m = getViewportMetrics(rect.width, rect.height);
  const anchorU = screenXToU(mx, m);

  const zoomFactor = Math.exp(-e.deltaY * 0.0016);
  const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom * zoomFactor));

  // Keep the cursor's world u coordinate anchored smoothly under the pointer
  const centerX = m.stageLeft + m.stageW * 0.5;
  targetZoom = nextZoom;
  targetCenterU = anchorU - (mx - centerX) / Math.max(1, m.stageW * targetZoom);
  clampCameraTargets();
  syncHudControls();
}

function handlePointerDown(e) {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  isDragging = true;
  dragMoved = false;
  dragStartX = e.clientX - rect.left;
  dragStartY = e.clientY - rect.top;
  dragLastX = dragStartX;
  dragLastY = dragStartY;
  canvas.style.cursor = "grabbing";
}

function handlePointerMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (isDragging) {
    const dx = x - dragLastX;
    const dy = y - dragLastY;
    dragLastX = x;
    dragLastY = y;

    if (Math.hypot(x - dragStartX, y - dragStartY) > 5) {
      dragMoved = true;
      hasInteracted = true;
    }

    if (dragMoved) {
      const m = getViewportMetrics(rect.width, rect.height);
      const span = Math.max(1, m.stageW * Math.max(1, camZoom));
      targetCenterU -= dx / span;
      targetPanY += dy * 0.55;
      clampCameraTargets();
      syncHudControls();
      return;
    }
  }

  const mHit = findNearestHit(missionHitboxes, x, y);
  hoveredMissionId = mHit ? mHit.id : null;
  const lHit = mHit ? null : findNearestHit(landmarkHitboxes, x, y);
  hoveredLandmarkId = lHit ? lHit.id : null;

  canvas.style.cursor = (mHit || lHit) ? "pointer" : (camZoom > 1.05 ? "grab" : "default");
}

function handlePointerUp(e) {
  if (!isDragging) return;
  isDragging = false;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (!dragMoved) {
    const mHit = findNearestHit(missionHitboxes, x, y);
    if (mHit) {
      hasInteracted = true;
      selectedMissionId = mHit.id;
      onSelectMissionCb(mHit.id);
    } else {
      const lHit = findNearestHit(landmarkHitboxes, x, y);
      if (lHit) {
        hasInteracted = true;
        targetCenterU = lHit.u;
        targetZoom = Math.max(targetZoom, lHit.id === "lightday" ? 2.6 : 3.0);
        targetPanY = 0;
        clampCameraTargets();
        syncHudControls();
      }
    }
  }
  canvas.style.cursor = hoveredMissionId || hoveredLandmarkId ? "pointer" : "default";
}

function handleDoubleClick(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (findNearestHit(missionHitboxes, x, y)) return;

  hasInteracted = true;
  const m = getViewportMetrics(rect.width, rect.height);
  if (targetZoom > 2.4) {
    targetZoom = 1.0;
    targetCenterU = 0.5;
    targetPanY = 0;
  } else {
    targetCenterU = screenXToU(x, m);
    targetZoom = Math.min(MAX_ZOOM, targetZoom * 2.2);
  }
  clampCameraTargets();
  syncHudControls();
}

function handleTouchStart(e) {
  if (store.state.viewMode !== "space") return;
  const rect = canvas.getBoundingClientRect();
  if (e.touches.length === 2) {
    pinchActive = true;
    isDragging = false;
    hasInteracted = true;
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    pinchLastDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    pinchLastMidX = ((t0.clientX + t1.clientX) * 0.5) - rect.left;
    e.preventDefault();
  } else if (e.touches.length === 1) {
    pinchActive = false;
    isDragging = true;
    dragMoved = false;
    dragStartX = e.touches[0].clientX - rect.left;
    dragStartY = e.touches[0].clientY - rect.top;
    dragLastX = dragStartX;
    dragLastY = dragStartY;
  }
}

function handleTouchMove(e) {
  if (store.state.viewMode !== "space") return;
  const rect = canvas.getBoundingClientRect();
  const m = getViewportMetrics(rect.width, rect.height);

  if (pinchActive && e.touches.length === 2) {
    e.preventDefault();
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const midX = ((t0.clientX + t1.clientX) * 0.5) - rect.left;
    if (pinchLastDist > 10) {
      const anchorU = screenXToU(pinchLastMidX, m);
      const ratio = dist / pinchLastDist;
      targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom * ratio));
      const centerX = m.stageLeft + m.stageW * 0.5;
      targetCenterU = anchorU - (midX - centerX) / Math.max(1, m.stageW * targetZoom);
      clampCameraTargets();
      syncHudControls();
    }
    pinchLastDist = dist;
    pinchLastMidX = midX;
    return;
  }

  if (isDragging && e.touches.length === 1) {
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;
    const dx = x - dragLastX;
    const dy = y - dragLastY;
    dragLastX = x;
    dragLastY = y;

    if (Math.hypot(x - dragStartX, y - dragStartY) > 6) {
      dragMoved = true;
      hasInteracted = true;
    }
    if (dragMoved) {
      e.preventDefault();
      const span = Math.max(1, m.stageW * Math.max(1, camZoom));
      targetCenterU -= dx / span;
      targetPanY += dy * 0.5;
      clampCameraTargets();
      syncHudControls();
    }
  }
}

function handleTouchEnd(e) {
  if (e.touches.length < 2) pinchActive = false;
  if (isDragging && e.touches.length === 0) {
    isDragging = false;
    if (!dragMoved) {
      const mHit = findNearestHit(missionHitboxes, dragStartX, dragStartY);
      if (mHit) {
        hasInteracted = true;
        selectedMissionId = mHit.id;
        onSelectMissionCb(mHit.id);
      } else {
        const now = performance.now();
        if (now - lastTapTime < 300) {
          // Double tap zooms in or resets
          const rect = canvas.getBoundingClientRect();
          const m = getViewportMetrics(rect.width, rect.height);
          if (targetZoom > 2.0) {
            targetZoom = 1.0;
            targetCenterU = 0.5;
            targetPanY = 0;
          } else {
            targetCenterU = screenXToU(dragStartX, m);
            targetZoom = Math.min(MAX_ZOOM, targetZoom * 2.2);
          }
          clampCameraTargets();
          syncHudControls();
        } else {
          const lHit = findNearestHit(landmarkHitboxes, dragStartX, dragStartY);
          if (lHit) {
            hasInteracted = true;
            targetCenterU = lHit.u;
            targetZoom = Math.max(targetZoom, 2.8);
            targetPanY = 0;
            clampCameraTargets();
            syncHudControls();
          }
        }
        lastTapTime = now;
      }
    }
  }
}

function handleKeyDown(e) {
  if (store.state.viewMode !== "space") return;
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (!document.getElementById("spotlight-backdrop")?.classList.contains("hidden")) return;
  if (!document.getElementById("drawer-backdrop")?.classList.contains("hidden")) return;

  if (e.code === "Space") {
    e.preventDefault();
    if (pulse.active) stopLightPulse();
    else fireLightPulse();
  }
}

// =========================================================================
// PUBLIC EXPORTS (100% backward compatible + resetSpaceView)
// =========================================================================

export function initSpaceFrontierView({ onSelectMission } = {}) {
  onSelectMissionCb = onSelectMission || (() => {});
  canvas = document.getElementById("space-canvas");
  if (!canvas) return;
  ctx = canvas.getContext("2d");

  if (!stars.length) initCosmicFields();
  ensureSpaceHud();

  if (initialized) return;
  initialized = true;

  canvas.style.touchAction = "none";

  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("mousedown", handlePointerDown);
  window.addEventListener("mousemove", (e) => {
    if (store.state.viewMode !== "space") return;
    if (isDragging || e.target === canvas) handlePointerMove(e);
  });
  window.addEventListener("mouseup", (e) => {
    if (isDragging) handlePointerUp(e);
  });
  canvas.addEventListener("mouseleave", () => {
    if (!isDragging) {
      hoveredMissionId = null;
      hoveredLandmarkId = null;
    }
  });
  canvas.addEventListener("dblclick", handleDoubleClick);

  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("keydown", handleKeyDown);
}

// Alias preserved for compatibility
export const initSpaceView = initSpaceFrontierView;

export function setSpaceZone(zoneId) {
  activeZone = zoneId || "all";
  const focus = ZONE_CAMERA[activeZone] || ZONE_CAMERA.all;
  targetCenterU = focus.centerU;
  targetZoom = focus.zoom;
  targetPanY = 0;
  clampCameraTargets();
  syncHudControls();
}

export function getSpaceZone() {
  return activeZone;
}

export function setSelectedSpaceMission(id) {
  selectedMissionId = id || null;
  if (!selectedMissionId) return;

  const list = Array.isArray(store.spaceMissions) ? store.spaceMissions : [];
  const mission = list.find(ms => ms.id === selectedMissionId);
  if (!mission) return;

  const u = lightTimeToU(mission.lightTimeSec);
  const w = canvas?.clientWidth || window.innerWidth;
  // On desktop when #place-card is open on the left, shift focus subtly left of centerU so the beacon lands in the unobstructed central viewport
  const desiredZoom = Math.max(targetZoom, w < 768 ? 1.8 : 1.9);
  const cardShiftU = w >= 1024 ? -0.10 / desiredZoom : 0;

  targetZoom = desiredZoom;
  targetCenterU = u + cardShiftU;
  targetPanY = 0;
  clampCameraTargets();
  syncHudControls();
}

export function resetSpaceView() {
  activeZone = "all";
  selectedMissionId = null;
  hoveredMissionId = null;
  hoveredLandmarkId = null;
  targetZoom = 1.0;
  targetCenterU = 0.5;
  targetPanY = 0;
  stopLightPulse();

  // Keep #space-zone-pills visual state cleanly synced if already rendered
  const bar = document.getElementById("space-zone-pills");
  if (bar) {
    bar.querySelectorAll(".szone-btn").forEach((btn) => {
      const isAll = btn.dataset.szone === "all";
      btn.classList.toggle("glass-btn-active", isAll);
      btn.classList.toggle("glass-btn", !isAll);
    });
  }
  syncHudControls();
}

export function startSpaceLoop() {
  ensureSpaceHud();
  syncHudControls();
  lastFrameTime = 0;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(drawFrame);
}

export function stopSpaceLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (pulse.active) {
    stopLightPulse();
  }
}
