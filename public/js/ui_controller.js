/**
 * PhysAlts — Interactive Production UI Controller (Atlas Engine v2.1)
 * Pure neutral grey palette + rgb(160, 70, 70) editorial link accent (zero blue, zero yellow, zero all-caps).
 * Generous 8pt spacing, 14–16px Helvetica/Inter typography, sleek Continent + Country selector,
 * full Account/Login/Bookmarks workspace, Deep-Link sharing, Keyboard Shortcuts, and GDPR controls.
 */

import {
  PHYSICS_BRANCHES, STAGE_META, proxyUrl, formatYear, buildDefaultStages, classifyPhysicsBranch
} from "./config.js";
import {
  store, getNodeById, getVisibleGlobeNodes, universalSearch, mergeHubs
} from "./data_store.js";
import {
  syncGlobeMarkers, flyToHub, resetGlobeToSpace,
  setGlobeLabels, setGlobeTilt, zoomInGlobe, zoomOutGlobe
} from "./globe_engine.js";
import {
  setSpaceZone, getSpaceZone, setSelectedSpaceMission, startSpaceLoop, stopSpaceLoop
} from "./space_view.js";
import {
  isBookmarked, toggleBookmark, updateAccountProfile, getAuthSnapshot
} from "./auth_service.js";
import {
  refreshAccountHeader, openAuthModal, closeAuthModal,
  renderAccountWorkspaceModal, renderSubmitInstitutionModal, renderKeyboardShortcutsModal
} from "./account_ui.js";
import { isCloudReady, exportUserData, eraseAllUserData } from "./cloud_sync.js";

let activeWikiReq = 0;
let toastTimer = null;
let timeTourTimer = null;
let activeTimelineIdx = 0;

// Clean Continent → Camera Anchor + Country classification helper
const CONTINENTS = [
  { id: "all",           label: "All",           lat: 20,  lng: 12,  zoom: 1.9 },
  { id: "Europe",        label: "Europe",        lat: 50,  lng: 12,  zoom: 3.6 },
  { id: "North America", label: "North America", lat: 40,  lng: -98, zoom: 3.2 },
  { id: "Asia",          label: "Asia",          lat: 32,  lng: 95,  zoom: 3.2 },
  { id: "Africa",        label: "Africa",        lat: 4,   lng: 20,  zoom: 3.1 },
  { id: "South America", label: "South America", lat: -16, lng: -60, zoom: 3.2 },
  { id: "Oceania",       label: "Oceania",       lat: -25, lng: 138, zoom: 3.6 }
];

function inferContinent(countryName) {
  const c = (countryName || "").toLowerCase();
  if (/antarctica/.test(c)) return "Antarctica";
  if (/united states|canada|mexico|cuba|jamaica|puerto rico|costa rica|panama|guatemala|barbados|trinidad|dominican|haiti|honduras|el salvador|nicaragua|bahamas|belize/.test(c)) return "North America";
  if (/brazil|argentina|chile|colombia|peru|venezuela|ecuador|bolivia|paraguay|uruguay|guyana|suriname/.test(c)) return "South America";
  if (/australia|new zealand|fiji|papua|samoa|tonga|vanuatu/.test(c)) return "Oceania";
  if (/south africa|egypt|nigeria|kenya|morocco|algeria|tunisia|ghana|ethiopia|tanzania|uganda|rwanda|senegal|cameroon|zimbabwe|zambia|botswana|namibia|mozambique|angola|sudan|libya|benin|mali|niger|burkina|malawi|madagascar|mauritius|congo|ivory coast|cote d'ivoire|gabon|togo|sierra leone|liberia|somalia|chad|eritrea|lesotho|eswatini|gambia|guinea|seychelles|cape verde/.test(c)) return "Africa";
  if (/china|japan|india|south korea|korea|taiwan|singapore|israel|iran|iraq|saudi|united arab|uae|turkey|türkiye|pakistan|bangladesh|indonesia|malaysia|thailand|vietnam|philippines|kazakhstan|uzbekistan|jordan|lebanon|qatar|kuwait|oman|bahrain|sri lanka|nepal|bhutan|mongolia|myanmar|cambodia|laos|brunei|azerbaijan|armenia|georgia|kyrgyzstan|tajikistan|turkmenistan|afghanistan|yemen|syria|palestine|hong kong|macao/.test(c)) return "Asia";
  return "Europe";
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function showToast(msg) {
  const el = document.getElementById("toast");
  const txt = document.getElementById("toast-text");
  if (!el || !txt) return;
  txt.textContent = msg;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 2600);
}

export function refreshDbBadge() {
  const dot = document.getElementById("db-dot");
  const lbl = document.getElementById("db-status-text");
  const snap = getAuthSnapshot();
  if (dot) {
    dot.className = "w-2 h-2 rounded-full " + (isCloudReady() || snap.isAuthenticated ? "bg-white" : "bg-neutral-400");
  }
  if (lbl) {
    lbl.textContent = isCloudReady() ? "Cloud Synced" : "Verified Index";
  }
}

function updateIslandExpanded() {
  const island = document.getElementById("dynamic-island");
  if (!island) return;
  const searchOpen = !document.getElementById("search-dropdown")?.classList.contains("hidden");
  const menuOpen = !document.getElementById("site-menu-dropdown")?.classList.contains("hidden");
  island.classList.toggle("island-expanded", searchOpen || menuOpen);
}

export function closeDropdown() {
  document.getElementById("search-dropdown")?.classList.add("hidden");
  document.getElementById("stage-dropdown-menu")?.classList.add("hidden");
  document.getElementById("site-menu-dropdown")?.classList.add("hidden");
  document.getElementById("btn-site-menu")?.setAttribute("aria-expanded", "false");
  updateIslandExpanded();
}

function closePlaceCard() {
  store.state.selectedId = null;
  setSelectedSpaceMission(null);
  document.getElementById("place-card")?.classList.add("hidden");
  document.body.classList.remove("card-open");
  syncGlobeMarkers();
  if (store.state.viewMode === "space") renderSpaceMissionRail();
}

function closeModal() {
  document.getElementById("drawer-backdrop")?.classList.add("hidden");
}

/**
 * Single-Surface Mutual Exclusion State Machine:
 * Guarantees only ONE overlay surface is open at any time — zero stacked overlaps ever.
 */
function closeAllSurfaces(except = null) {
  if (except !== "dropdown") closeDropdown();
  if (except !== "modal") closeModal();
  if (except !== "auth") closeAuthModal();
  if (except !== "card") closePlaceCard();
}

function updateBookmarkButtonUI(id) {
  const saveBtn = document.getElementById("btn-save-shortlist");
  if (!saveBtn) return;
  const saved = isBookmarked(id);
  saveBtn.textContent = saved ? "✓ Bookmarked" : "+ Bookmark";
  saveBtn.className = `rounded-full px-4 py-2 text-[13.5px] transition ${saved ? "glass-btn-active" : "glass-btn"}`;
}

// =========================================================================
// EARTH <-> SPACE FRONTIER (0 -> ~1 LIGHT-DAY)
// =========================================================================

export function setViewMode(mode) {
  store.state.viewMode = mode;
  const spaceOverlay = document.getElementById("space-frontier-view");
  const btnEarth = document.getElementById("btn-mode-earth");
  const btnSpace = document.getElementById("btn-mode-space");
  const earthControls = document.getElementById("earth-only-controls");
  const zoomControls = document.getElementById("zoom-controls");
  const timeBar = document.getElementById("time-bar");

  closeAllSurfaces();

  if (mode === "space") {
    spaceOverlay?.classList.remove("space-hidden");
    document.body.classList.add("space-mode");
    btnSpace?.classList.add("glass-btn-active");
    btnEarth?.classList.remove("glass-btn-active");
    if (earthControls) earthControls.style.display = "none";
    if (zoomControls) zoomControls.style.display = "none";
    timeBar?.classList.add("hidden");
    document.body.classList.remove("time-open");
    stopTimeTour();
    renderSpaceZoneBar();
    renderSpaceMissionRail();
    startSpaceLoop();
  } else {
    spaceOverlay?.classList.add("space-hidden");
    document.body.classList.remove("space-mode");
    btnEarth?.classList.add("glass-btn-active");
    btnSpace?.classList.remove("glass-btn-active");
    if (earthControls) earthControls.style.display = "";
    if (zoomControls) zoomControls.style.display = "";
    if (store.state.timeMode) {
      timeBar?.classList.remove("hidden");
      document.body.classList.add("time-open");
    }
    stopSpaceLoop();
    syncGlobeMarkers();
  }
}

const COMPACT_ZONE_LABELS = {
  all: "All",
  leo: "Earth & LEO",
  moon: "Moon",
  lagrange: "L1 / L2",
  inner: "Inner Solar",
  mars: "Mars",
  giants: "Outer Planets",
  interstellar: "Kuiper & 1 LD"
};

function renderSpaceZoneBar() {
  const bar = document.getElementById("space-zone-pills");
  if (!bar) return;
  const current = getSpaceZone();
  const zones = [{ id: "all", label: "All" }, ...store.spaceZones];
  bar.innerHTML = zones.map(z => `
    <button type="button" data-szone="${esc(z.id)}" class="szone-btn px-3.5 py-2 rounded-full text-[13px] whitespace-nowrap transition ${z.id === current ? "glass-btn-active" : "glass-btn"}">
      ${esc(COMPACT_ZONE_LABELS[z.id] || z.label)}
    </button>
  `).join("");
  bar.querySelectorAll(".szone-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setSpaceZone(btn.dataset.szone);
      renderSpaceZoneBar();
      renderSpaceMissionRail();
    });
  });
}

function renderSpaceMissionRail() {
  const listEl = document.getElementById("space-mission-list");
  if (!listEl) return;
  const zone = getSpaceZone();
  const missions = store.spaceMissions.filter(m => zone === "all" || m.zoneId === zone);
  listEl.innerHTML = missions.map(m => {
    const active = store.state.selectedId === `sp-${m.id}`;
    return `
      <button type="button" data-rail-mission="${esc(m.id)}" class="rail-mission w-full text-left rounded-2xl px-4 py-3 transition ${active ? "glass-row-active" : "glass-row"}">
        <div class="flex items-center justify-between gap-2.5">
          <span class="text-[14px] font-medium truncate">${esc(m.name)}</span>
          <span class="text-[12.5px] shrink-0 ${active ? "text-black/65" : "accent-text"}">${esc(m.lightTimeLabel.split(" (")[0])}</span>
        </div>
        <div class="text-[13px] mt-1 truncate ${active ? "text-black/65" : "text-neutral-400"}">${esc(m.body)} · ${esc(m.agency)} · ${m.launchYear}</div>
      </button>
    `;
  }).join("");

  listEl.querySelectorAll(".rail-mission").forEach(btn => {
    btn.addEventListener("click", () => selectSpaceMission(btn.dataset.railMission));
  });
}

export function selectSpaceMission(missionId) {
  const m = store.spaceMissions.find(x => x.id === missionId);
  if (!m) return;
  closeAllSurfaces("card");
  const fullId = `sp-${m.id}`;
  store.state.selectedId = fullId;
  setSelectedSpaceMission(m.id);
  renderSpaceMissionRail();

  const card = document.getElementById("place-card");
  if (!card) return;
  card.classList.remove("hidden");
  document.body.classList.add("card-open");

  document.getElementById("card-badge").textContent = `${m.body} · ${m.lightTimeLabel}`;
  document.getElementById("card-title").textContent = m.name;
  document.getElementById("card-sub").textContent = `${m.agency} (${m.country}) · Launched ${m.launchYear} · ${m.distanceAU} AU`;
  document.getElementById("card-summary").textContent = m.summary;
  document.getElementById("card-pathway-label").textContent = "Key Physics Discoveries";
  document.getElementById("card-pathway").textContent = m.physicsDiscoveries || m.summary;

  const extra = document.getElementById("card-extra-chips");
  if (extra) {
    extra.innerHTML = (m.instruments || []).slice(0, 6).map(inst =>
      `<span class="px-3 py-1 rounded-full text-[13px] bg-white/[0.07] border border-white/12 text-neutral-200">${esc(inst)}</span>`
    ).join("");
  }

  const linksEl = document.getElementById("card-links");
  const links = [];
  if (m.officialUrl) links.push(`<a href="${esc(m.officialUrl)}" target="_blank" rel="noopener noreferrer" class="glass-btn-active rounded-full px-4 py-2 text-[13.5px] inline-flex items-center gap-1.5">Official Mission Site ↗</a>`);
  if (m.wikiUrl) links.push(`<a href="${esc(m.wikiUrl)}" target="_blank" rel="noopener noreferrer" class="accent-link px-3 py-2 text-[14px]">Wikipedia ↗</a>`);
  if (linksEl) linksEl.innerHTML = links.join("");

  document.getElementById("card-deeper-wrap")?.classList.add("hidden");
  document.getElementById("btn-deeper-toggle")?.classList.add("hidden");
  document.getElementById("btn-save-shortlist")?.classList.remove("hidden");
  document.getElementById("card-photo-wrap")?.classList.add("hidden");
  updateBookmarkButtonUI(fullId);

  // Connected Space Missions (Keep Exploring revolving door)
  const rWrap = document.getElementById("card-rabbit-wrap");
  const rLinks = document.getElementById("card-rabbit-links");
  if (rWrap && rLinks) {
    const idx = store.spaceMissions.findIndex(x => x.id === m.id);
    const nearby = [
      store.spaceMissions[idx + 1],
      store.spaceMissions[idx - 1],
      store.spaceMissions[(idx + 5) % store.spaceMissions.length]
    ].filter(x => x && x.id !== m.id);
    if (nearby.length) {
      rWrap.classList.remove("hidden");
      rLinks.innerHTML = nearby.slice(0, 3).map(nb => `
        <button type="button" data-jump-space="${esc(nb.id)}" class="glass-btn rounded-full px-3 py-1 text-[13px] truncate max-w-[175px]">
          ${esc(nb.name.split(" (")[0])} →
        </button>
      `).join("");
      rLinks.querySelectorAll("[data-jump-space]").forEach(btn => {
        btn.addEventListener("click", () => selectSpaceMission(btn.dataset.jumpSpace));
      });
    } else {
      rWrap.classList.add("hidden");
    }
  }
}

// =========================================================================
// CHRONOLOGICAL PHYSICS TIMELINE (1800 BCE -> 2045 CE)
// =========================================================================

function yearToPercent(year) {
  const y = Number(year);
  if (y <= 500)  return Math.max(0, ((y + 1850) / 2350) * 20);
  if (y <= 1500) return 20 + ((y - 500) / 1000) * 18;
  if (y <= 1850) return 38 + ((y - 1500) / 350) * 18;
  if (y <= 2026) return 56 + ((y - 1850) / 176) * 32;
  return Math.min(100, 88 + ((y - 2026) / 24) * 12);
}

function percentToYear(pct) {
  const p = Math.max(0, Math.min(100, Number(pct)));
  if (p <= 20) return Math.round(-1850 + (p / 20) * 2350);
  if (p <= 38) return Math.round(500 + ((p - 20) / 18) * 1000);
  if (p <= 56) return Math.round(1500 + ((p - 38) / 18) * 350);
  if (p <= 88) return Math.round(1850 + ((p - 56) / 32) * 176);
  return Math.round(2026 + ((p - 88) / 12) * 24);
}

function stopTimeTour() {
  store.state.timePlaying = false;
  if (timeTourTimer) {
    clearInterval(timeTourTimer);
    timeTourTimer = null;
  }
  const btn = document.getElementById("btn-time-play");
  if (btn) btn.textContent = "Play Tour";
}

function findNearestTimelineIndex(year) {
  if (!store.timelineEvents.length) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  store.timelineEvents.forEach((ev, idx) => {
    const d = Math.abs(ev.year - year);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

function renderTimelineUI(flyToActive = false) {
  const y = store.state.timeYear;
  const pct = yearToPercent(y);
  const era = store.eras.find(e => y >= e.startYear && y <= e.endYear) || store.eras[0];

  const yearEl = document.getElementById("time-year-display");
  const eraTitleEl = document.getElementById("time-era-title");
  const countEl = document.getElementById("time-visible-count");
  const fillEl = document.getElementById("timeline-fill");
  const needleEl = document.getElementById("timeline-needle");
  const rulerEl = document.getElementById("timeline-ruler");

  if (yearEl) yearEl.textContent = formatYear(y);
  if (eraTitleEl && era) eraTitleEl.textContent = era.label;
  if (fillEl) fillEl.style.width = `${pct.toFixed(2)}%`;
  if (needleEl) needleEl.style.left = `${pct.toFixed(2)}%`;
  if (rulerEl) rulerEl.setAttribute("aria-valuenow", String(y));

  const tabsEl = document.getElementById("time-era-tabs");
  if (tabsEl && store.eras.length) {
    tabsEl.innerHTML = store.eras.map(e => {
      const act = era && era.id === e.id;
      const shortLabel = e.label.split(" (")[0];
      return `
        <button type="button" data-era-id="${esc(e.id)}" class="era-tab px-3.5 py-1.5 rounded-full text-[13px] whitespace-nowrap transition ${act ? "glass-btn-active" : "glass-btn"}">
          ${esc(shortLabel)}
        </button>
      `;
    }).join("");
    tabsEl.querySelectorAll(".era-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        stopTimeTour();
        const targetEra = store.eras.find(e => e.id === btn.dataset.eraId);
        if (!targetEra) return;
        const firstInEra = store.timelineEvents.findIndex(ev => ev.eraId === targetEra.id);
        if (firstInEra >= 0) {
          jumpToTimelineIndex(firstInEra, true);
        } else {
          store.state.timeYear = targetEra.startYear;
          renderTimelineUI(false);
        }
      });
    });
  }

  const dotsEl = document.getElementById("timeline-dots");
  if (dotsEl && store.timelineEvents.length) {
    activeTimelineIdx = findNearestTimelineIndex(y);
    dotsEl.innerHTML = store.timelineEvents.map((ev, idx) => {
      const ep = yearToPercent(ev.year);
      const isAct = idx === activeTimelineIdx;
      return `<span class="timeline-dot ${isAct ? "active" : ""}" style="left:${ep.toFixed(2)}%" title="${esc(formatYear(ev.year) + " — " + ev.title)}"></span>`;
    }).join("");
  }

  const stripEl = document.getElementById("timeline-event-strip");
  if (stripEl && store.timelineEvents.length) {
    const eraEvents = era
      ? store.timelineEvents.filter(ev => ev.eraId === era.id)
      : store.timelineEvents.slice(Math.max(0, activeTimelineIdx - 2), activeTimelineIdx + 4);
    const activeEv = store.timelineEvents[activeTimelineIdx];

    stripEl.innerHTML = eraEvents.map(ev => {
      const isSel = activeEv && ev.id === activeEv.id;
      return `
        <button type="button" data-tl-card="${esc(ev.id)}" class="tl-card shrink-0 w-[256px] text-left rounded-2xl px-4 py-3 transition ${isSel ? "glass-row-active" : "glass-row"}">
          <div class="flex items-center justify-between gap-2 text-[12.5px] ${isSel ? "text-black/65" : "accent-text"}">
            <span class="font-semibold">${formatYear(ev.year)}</span>
            <span class="truncate ${isSel ? "text-black/60" : "text-neutral-400"}">${esc(ev.location)}</span>
          </div>
          <div class="text-[14px] font-medium mt-1 line-clamp-1 ${isSel ? "text-black" : "text-white"}">${esc(ev.title)}</div>
          <div class="text-[13px] mt-0.5 line-clamp-1 ${isSel ? "text-black/70" : "text-neutral-400"}">${esc(ev.figure)}</div>
        </button>
      `;
    }).join("");

    stripEl.querySelectorAll(".tl-card").forEach(btn => {
      btn.addEventListener("click", () => {
        stopTimeTour();
        const idx = store.timelineEvents.findIndex(e => e.id === btn.dataset.tlCard);
        if (idx >= 0) jumpToTimelineIndex(idx, true);
      });
    });

    const activeCard = stripEl.querySelector(".glass-row-active");
    activeCard?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  const visible = getVisibleGlobeNodes();
  if (countEl) countEl.textContent = `${visible.length.toLocaleString()} in view`;
  syncGlobeMarkers();

  if (flyToActive && store.timelineEvents[activeTimelineIdx]) {
    const ev = store.timelineEvents[activeTimelineIdx];
    flyToHub({ lat: ev.lat, lng: ev.lng, zoom: 4.2 }, 4.2);
  }
}

function jumpToTimelineIndex(idx, openCard = false) {
  if (!store.timelineEvents.length) return;
  const clamped = Math.max(0, Math.min(store.timelineEvents.length - 1, idx));
  activeTimelineIdx = clamped;
  const ev = store.timelineEvents[clamped];
  store.state.timeYear = ev.year;
  renderTimelineUI(true);
  if (openCard) selectHubNode(`tl-${ev.id}`, false);
}

function bindTimelineRuler() {
  const ruler = document.getElementById("timeline-ruler");
  if (!ruler) return;
  let dragging = false;

  const scrubFromClientX = (clientX) => {
    const rect = ruler.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
    store.state.timeYear = percentToYear(pct);
    renderTimelineUI(false);
  };

  ruler.addEventListener("pointerdown", (e) => {
    dragging = true;
    stopTimeTour();
    ruler.setPointerCapture?.(e.pointerId);
    scrubFromClientX(e.clientX);
  });
  ruler.addEventListener("pointermove", (e) => {
    if (dragging) scrubFromClientX(e.clientX);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    const nearest = findNearestTimelineIndex(store.state.timeYear);
    if (store.timelineEvents[nearest]) {
      store.state.timeYear = store.timelineEvents[nearest].year;
      renderTimelineUI(true);
    }
  };
  ruler.addEventListener("pointerup", endDrag);
  ruler.addEventListener("pointercancel", endDrag);
}

export function setTimeMode(enabled, jumpYear = null) {
  store.state.timeMode = Boolean(enabled);
  const bar = document.getElementById("time-bar");
  const btn = document.getElementById("btn-toggle-time");

  if (enabled) {
    closeAllSurfaces("card");
    if (store.state.viewMode === "space") setViewMode("earth");
    bar?.classList.remove("hidden");
    document.body.classList.add("time-open");
    btn?.classList.add("glass-btn-active");
    if (jumpYear !== null) store.state.timeYear = jumpYear;
    else if (store.state.timeYear === 2026) store.state.timeYear = -580;
    renderTimelineUI(true);
  } else {
    bar?.classList.add("hidden");
    document.body.classList.remove("time-open");
    btn?.classList.remove("glass-btn-active");
    stopTimeTour();
    syncGlobeMarkers();
  }
}

// =========================================================================
// PLACE / MILESTONE DETAIL CARD
// =========================================================================

export function selectHubNode(id, fly = true) {
  const node = getNodeById(id);
  if (!node) return;
  if (store.state.viewMode === "space") setViewMode("earth");

  closeAllSurfaces("card");
  store.state.selectedId = node.id;
  if (fly) flyToHub(node, node.tier === "timeline" ? 4.8 : null);
  syncGlobeMarkers();

  const card = document.getElementById("place-card");
  if (!card) return;
  card.classList.remove("hidden");
  document.body.classList.add("card-open");
  document.getElementById("btn-deeper-toggle")?.classList.remove("hidden");
  document.getElementById("btn-save-shortlist")?.classList.remove("hidden");
  document.getElementById("card-photo-wrap")?.classList.add("hidden");

  const typeLabel = node.sector || (
    node.entityType === "startup" ? "Deep-Tech Startup"
    : node.entityType === "company" ? "Private Deep-Tech"
    : node.entityType === "institute" ? "Private Institute"
    : node.entityType === "lab" ? "National Lab & Facility"
    : node.entityType === "history" ? "Historical Milestone"
    : node.entityType === "project" ? "Mega-Project"
    : "University Physics"
  );
  const yearPart = node.foundedYear != null ? ` · ${formatYear(node.foundedYear)}` : "";
  document.getElementById("card-badge").textContent = `${typeLabel}${yearPart}`;
  document.getElementById("card-title").textContent = node.name;
  document.getElementById("card-sub").textContent = node.city;
  document.getElementById("card-summary").textContent = node.summary;

  const st = store.state.stage;
  const stages = node.stages || buildDefaultStages();
  const stageText = st === "all" ? stages.undergrad : (stages[st] || stages.undergrad);
  document.getElementById("card-pathway-label").textContent = node.tier === "timeline"
    ? "Historical & Scientific Impact"
    : `${STAGE_META[st]?.label || "Academic"} Pathway`;
  document.getElementById("card-pathway").textContent = node.tier === "timeline" ? (node.nobel || node.summary) : stageText;

  updateBookmarkButtonUI(node.id);

  // Connected Rabbit Hole Portals (3 one-click revolving-door jumps to related hubs worldwide)
  const rWrap = document.getElementById("card-rabbit-wrap");
  const rLinks = document.getElementById("card-rabbit-links");
  if (rWrap && rLinks) {
    const picks = [];
    const seen = new Set([node.id]);
    for (const nextId of node.next || []) {
      const target = getNodeById(nextId);
      if (target && !seen.has(target.id)) {
        picks.push(target);
        seen.add(target.id);
      }
    }
    if (picks.length < 3) {
      const pool = store.hubs.filter(h =>
        !seen.has(h.id) && (h.tier === "flagship" || h.tier === "deeptech") &&
        (h.branch === node.branch || h.country !== node.country)
      );
      // Deterministic-feeling spread with light shuffle so each hop explores a new nation
      for (const cand of pool) {
        if (picks.length >= 3) break;
        if (cand.branch === node.branch && cand.country !== node.country) {
          picks.push(cand);
          seen.add(cand.id);
        }
      }
      for (const cand of pool) {
        if (picks.length >= 3) break;
        if (!seen.has(cand.id)) {
          picks.push(cand);
          seen.add(cand.id);
        }
      }
    }
    if (picks.length) {
      rWrap.classList.remove("hidden");
      rLinks.innerHTML = picks.slice(0, 3).map(p => `
        <button type="button" data-jump-hub="${esc(p.id)}" class="glass-btn rounded-full px-3 py-1 text-[13px] truncate max-w-[175px]">
          ${esc(p.name.split(" (")[0])} →
        </button>
      `).join("");
      rLinks.querySelectorAll("[data-jump-hub]").forEach(btn => {
        btn.addEventListener("click", () => selectHubNode(btn.dataset.jumpHub, true));
      });
    } else {
      rWrap.classList.add("hidden");
    }
  }

  // Concise project links (max 2 so action bar stays above the fold — full details inside More ↓)
  const extra = document.getElementById("card-extra-chips");
  if (extra) {
    const chips = [];
    for (const p of (node.projects || []).slice(0, 2)) {
      chips.push(`<a href="${esc(p.url || node.url)}" target="_blank" rel="noopener noreferrer" class="accent-chip px-3 py-1 rounded-full text-[13px] transition">${esc(p.name)} ↗</a>`);
    }
    extra.innerHTML = chips.join("");
  }

  // Official verified links
  const linksEl = document.getElementById("card-links");
  const links = [];
  if (node.url) links.push(`<a href="${esc(node.url)}" target="_blank" rel="noopener noreferrer" class="glass-btn-active rounded-full px-4 py-2 text-[13.5px] inline-flex items-center gap-1.5">Official Site ↗</a>`);
  if (node.wiki) links.push(`<a href="${esc(node.wiki)}" target="_blank" rel="noopener noreferrer" class="accent-link px-3 py-2 text-[14px]">Wikipedia ↗</a>`);
  const gEarth = `https://earth.google.com/web/@${node.lat},${node.lng},500a,2500d,35y,0h,45t,0r`;
  links.push(`<a href="${gEarth}" target="_blank" rel="noopener noreferrer" class="accent-link px-2 py-2 text-[14px]">Google Earth ↗</a>`);
  if (linksEl) linksEl.innerHTML = links.join("");

  const stagesEl = document.getElementById("deeper-stages");
  if (stagesEl) {
    stagesEl.innerHTML = Object.keys(STAGE_META).filter(k => k !== "all").map(k => `
      <div class="rounded-2xl px-3.5 py-2.5 ${k === st ? "bg-white/12 border border-white/22" : "bg-white/[0.04] border border-white/10"}">
        <div class="text-[13px] font-semibold text-white">${STAGE_META[k].label}</div>
        <div class="text-[13.5px] text-neutral-300 mt-1 leading-snug">${esc(stages[k] || "—")}</div>
      </div>
    `).join("");
  }

  // Live Wikimedia photo (skip .svg logo badges; only reveal container on actual photo load)
  const photoWrap = document.getElementById("card-photo-wrap");
  const imgEl = document.getElementById("card-photo");
  const fallbackEl = document.getElementById("card-photo-fallback");
  imgEl?.classList.add("opacity-0");
  fallbackEl?.classList.remove("hidden");
  const reqId = ++activeWikiReq;
  const slug = node.wikiSlug || node.name.replace(/\s+/g, "_");

  fetch(proxyUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`))
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (reqId !== activeWikiReq || !data || !imgEl) return;
      const pic = data.originalimage?.source || data.thumbnail?.source;
      if (pic && !/\.svg(\.png)?(\?|$)/i.test(pic)) {
        imgEl.onload = () => {
          if (reqId !== activeWikiReq) return;
          photoWrap?.classList.remove("hidden");
          imgEl.classList.remove("opacity-0");
          fallbackEl?.classList.add("hidden");
        };
        imgEl.src = proxyUrl(pic);
        imgEl.alt = node.name;
      }
    }).catch(() => {});

  const papersEl = document.getElementById("deeper-papers");
  if (papersEl) {
    papersEl.innerHTML = `<div class="text-neutral-400 text-[13.5px]">Loading recent papers…</div>`;
    fetch(proxyUrl(`https://api.openalex.org/works?search=${encodeURIComponent(node.name + " physics")}&sort=publication_date:desc&per-page=3`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (reqId !== activeWikiReq) return;
        if (!data?.results?.length) {
          papersEl.innerHTML = `<div class="text-neutral-400 text-[13.5px]">No recent OpenAlex papers returned.</div>`;
          return;
        }
        papersEl.innerHTML = data.results.map(w => `
          <a href="${esc(w.doi || w.id || "https://openalex.org/")}" target="_blank" rel="noopener noreferrer" class="block rounded-2xl bg-white/[0.05] hover:bg-white/10 border border-white/10 p-3.5 transition">
            <div class="text-[14px] text-white leading-snug line-clamp-2">${esc(w.title || "Physics Publication")}</div>
            <div class="text-[13px] accent-text mt-1">${esc(w.publication_year || "")} · ${(w.cited_by_count ?? 0).toLocaleString()} citations ↗</div>
          </a>
        `).join("");
      }).catch(() => {
        if (reqId === activeWikiReq) papersEl.innerHTML = `<div class="text-neutral-400 text-[13.5px]">OpenAlex papers unavailable right now.</div>`;
      });
  }

  const authorsEl = document.getElementById("deeper-authors");
  if (authorsEl) {
    authorsEl.innerHTML = `<div class="text-neutral-400 text-[13.5px]">Loading physicists…</div>`;
    fetch(proxyUrl(`https://api.openalex.org/authors?search=${encodeURIComponent(node.name + " physics")}&sort=cited_by_count:desc&per-page=3`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (reqId !== activeWikiReq) return;
        const list = data?.results || [];
        if (!list.length) {
          authorsEl.innerHTML = `<div class="text-neutral-400 text-[13.5px]">No indexed PIs returned.</div>`;
          return;
        }
        authorsEl.innerHTML = list.map(a => `
          <a href="${esc(a.orcid || a.id || "https://openalex.org/")}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] hover:bg-white/10 border border-white/10 px-3.5 py-2.5 transition">
            <div class="min-w-0">
              <div class="text-[14px] font-medium text-white truncate">${esc(a.display_name || "Researcher")}</div>
              <div class="text-[13px] text-neutral-400 truncate">${esc(a.last_known_institutions?.[0]?.display_name || node.name)}</div>
            </div>
            <span class="text-[13px] accent-text shrink-0">${(a.cited_by_count || 0).toLocaleString()} cites ↗</span>
          </a>
        `).join("");
      }).catch(() => {
        if (reqId === activeWikiReq) authorsEl.innerHTML = `<div class="text-neutral-400 text-[13.5px]">Researcher index unavailable right now.</div>`;
      });
  }
}

// =========================================================================
// UNIVERSAL SEARCH DROPDOWN
// =========================================================================

function renderSearchDropdown(query) {
  const box = document.getElementById("search-dropdown");
  if (!box) return;
  const { hubs, events, missions, subdomains } = universalSearch(query, 8);
  const parts = [];

  if (hubs.length) {
    parts.push(`<div class="section-label px-3.5 pt-2 pb-1.5">Institutions, Labs &amp; Startups</div>`);
    parts.push(hubs.map(h => `
      <button type="button" data-pick-hub="${esc(h.id)}" class="pick-hub w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[14.5px] font-medium text-white truncate">${esc(h.name)}</div>
          <div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(h.city)}${h.sector ? " · " + esc(h.sector) : ""}</div>
        </div>
        <span class="text-[12.5px] px-2.5 py-0.5 rounded-full bg-white/[0.08] text-neutral-300 shrink-0">${esc(h.entityType)}</span>
      </button>
    `).join(""));
  }

  if (events.length) {
    parts.push(`<div class="section-label px-3.5 pt-3 pb-1.5">History &amp; Timeline</div>`);
    parts.push(events.map(ev => `
      <button type="button" data-pick-ev="${esc(ev.id)}" data-ev-year="${ev.year}" class="pick-ev w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[14.5px] font-medium text-white truncate">${esc(ev.title)}</div>
          <div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(ev.figure)} · ${esc(ev.location)}</div>
        </div>
        <span class="text-[13px] accent-text font-medium shrink-0">${formatYear(ev.year)}</span>
      </button>
    `).join(""));
  }

  if (missions.length) {
    parts.push(`<div class="section-label px-3.5 pt-3 pb-1.5">Space Frontier (0 → 1 Light-Day)</div>`);
    parts.push(missions.map(m => `
      <button type="button" data-pick-mission="${esc(m.id)}" class="pick-mission w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[14.5px] font-medium text-white truncate">${esc(m.name)}</div>
          <div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(m.body)} · ${esc(m.agency)}</div>
        </div>
        <span class="text-[13px] accent-text shrink-0">${esc(m.lightTimeLabel.split(" (")[0])}</span>
      </button>
    `).join(""));
  }

  if (subdomains.length) {
    parts.push(`<div class="section-label px-3.5 pt-3 pb-1.5">Domains &amp; Materials</div>`);
    parts.push(subdomains.map(s => `
      <button type="button" data-pick-sub="${esc(s.domainId)}" class="pick-sub w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 transition cursor-pointer">
        <div class="text-[14.5px] font-medium text-white truncate">${esc(s.name)}</div>
        <div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(s.domainName)}</div>
      </button>
    `).join(""));
  }

  if (!parts.length) {
    parts.push(`<div class="px-4 py-5 text-center text-[14px] text-neutral-400">No local matches. Try <strong class="text-white">Live Search</strong> below.</div>`);
  }

  box.innerHTML = parts.join("");
  closeAllSurfaces("dropdown");
  document.getElementById("site-menu-dropdown")?.classList.add("hidden");
  document.getElementById("stage-dropdown-menu")?.classList.add("hidden");
  box.classList.remove("hidden");
  updateIslandExpanded();

  box.querySelectorAll(".pick-hub").forEach(btn => {
    btn.addEventListener("click", () => selectHubNode(btn.dataset.pickHub, true));
  });
  box.querySelectorAll(".pick-ev").forEach(btn => {
    btn.addEventListener("click", () => {
      setTimeMode(true, Number(btn.dataset.evYear));
      selectHubNode(`tl-${btn.dataset.pickEv}`, true);
    });
  });
  box.querySelectorAll(".pick-mission").forEach(btn => {
    btn.addEventListener("click", () => {
      setViewMode("space");
      selectSpaceMission(btn.dataset.pickMission);
    });
  });
  box.querySelectorAll(".pick-sub").forEach(btn => {
    btn.addEventListener("click", () => {
      closeDropdown();
      openModal("domains", btn.dataset.pickSub);
    });
  });
}

// =========================================================================
// CENTERED WORKSPACE WINDOW (Strict Single-Surface Mutual Exclusion)
// =========================================================================

export function openModal(mode, focusId = null) {
  closeAllSurfaces("modal");
  const backdrop = document.getElementById("drawer-backdrop");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");
  if (!backdrop || !titleEl || !bodyEl) return;

  backdrop.classList.remove("hidden");
  const titles = {
    domains: "Domains & Vetted Materials",
    countries: "Countries & Continents",
    live: "Live Open-Science Search",
    pathways: "Bookmarks & Account",
    account: "Bookmarks & Account",
    submit: "Submit Missing Institution",
    shortcuts: "Keyboard Shortcuts",
    audit: "Verification & Open Data"
  };
  titleEl.textContent = titles[mode] || "PhysAlts";

  if (mode === "domains") renderDomainsModal(bodyEl, focusId);
  if (mode === "countries") renderCountriesModal(bodyEl);
  if (mode === "live") renderLiveSearchModal(bodyEl);
  if (mode === "pathways" || mode === "account") {
    renderAccountWorkspaceModal(bodyEl, {
      initialTab: focusId || "bookmarks",
      onNavigateToBookmark: (id, kind) => {
        closeModal();
        if (kind === "space" || id.startsWith("sp-")) {
          setViewMode("space");
          selectSpaceMission(id.replace(/^sp-/, ""));
        } else if (kind === "timeline" || id.startsWith("tl-")) {
          const ev = store.timelineEvents.find(e => `tl-${e.id}` === id);
          if (ev) setTimeMode(true, ev.year);
          selectHubNode(id, true);
        } else {
          selectHubNode(id, true);
        }
      },
      onOpenAuth: (tab) => {
        closeModal();
        openAuthModal(tab, {
          showToast,
          onSuccess: () => {
            renderStageMenu();
            refreshDbBadge();
            openModal("account", "bookmarks");
          }
        });
      },
      onStageUpdated: () => {
        renderStageMenu();
        if (store.state.selectedId && !store.state.selectedId.startsWith("sp-")) {
          selectHubNode(store.state.selectedId, false);
        }
      },
      showToast
    });
  }
  if (mode === "submit") {
    renderSubmitInstitutionModal(bodyEl, {
      showToast,
      onSubmitted: (node) => {
        refreshDbBadge();
        syncGlobeMarkers();
        closeModal();
        selectHubNode(node.id, true);
      }
    });
  }
  if (mode === "shortcuts") renderKeyboardShortcutsModal(bodyEl);
  if (mode === "audit") renderAuditAndPrivacyModal(bodyEl);
}

function renderDomainsModal(bodyEl, focusDomainId = null) {
  const activeDomain = focusDomainId || (store.state.branch !== "all" ? store.state.branch : (store.domains[0]?.id || "particle"));
  const branchPills = PHYSICS_BRANCHES.map(b => {
    const isAct = store.state.branch === b.id;
    return `
      <button type="button" data-filter-branch="${esc(b.id)}" class="branch-pill px-3.5 py-1.5 rounded-full text-[13.5px] transition ${isAct ? "glass-btn-active" : "glass-btn"}">
        ${esc(b.label.split(/[\s,]+/)[0])}
      </button>
    `;
  }).join("");

  const domainTabs = store.domains.map(d => `
    <button type="button" data-dom-tab="${esc(d.id)}" class="dom-tab px-3.5 py-2 rounded-xl text-[13.5px] transition ${d.id === activeDomain ? "glass-row-active font-medium" : "glass-row"}">
      ${esc(d.name.split(",")[0].split(" &")[0])}
    </button>
  `).join("");

  const selectedDom = store.domains.find(d => d.id === activeDomain) || store.domains[0];
  const subCards = (selectedDom?.subdomains || []).map(sub => `
    <details class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 group" open>
      <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
        <div>
          <div class="text-[15.5px] font-semibold text-white">${esc(sub.name)}</div>
          <p class="text-[13.5px] text-neutral-400 mt-0.5 leading-relaxed">${esc(sub.summary)}</p>
        </div>
      </summary>

      <div class="mt-4 space-y-3.5">
        ${sub.materials?.length ? `
          <div class="space-y-2">
            <div class="section-label">Vetted Open Materials</div>
            <div class="space-y-2">
              ${sub.materials.map((m, idx) => {
                const matId = `mat-${selectedDom.id}-${sub.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${idx}`;
                const saved = isBookmarked(matId);
                return `
                  <div class="glass-row rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
                    <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer" class="min-w-0 flex-1">
                      <div class="text-[14px] font-medium text-white truncate">${esc(m.title)}</div>
                      <div class="text-[13px] accent-text truncate">${esc(m.provider)} · ${esc(m.type)} ↗</div>
                    </a>
                    <button type="button" data-save-mat="${esc(matId)}" data-mat-title="${esc(m.title)}" data-mat-sub="${esc(m.provider + " · " + sub.name)}" data-mat-url="${esc(m.url)}" class="px-3 py-1 rounded-full text-[12.5px] shrink-0 transition ${saved ? "glass-btn-active" : "glass-btn"}">
                      ${saved ? "✓ Saved" : "+ Save"}
                    </button>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        ` : ""}
        ${sub.projects?.length ? `
          <div class="space-y-2">
            <div class="section-label">Active &amp; Upcoming Projects</div>
            <div class="flex flex-wrap gap-2">
              ${sub.projects.map(p => `
                <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="accent-chip px-3 py-1.5 rounded-full text-[13px]">
                  ${esc(p.name)} ↗
                </a>
              `).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    </details>
  `).join("");

  bodyEl.innerHTML = `
    <div class="space-y-5">
      <div class="space-y-2.5">
        <div class="section-label">Filter Globe by Branch</div>
        <div class="flex flex-wrap gap-2">${branchPills}</div>
      </div>
      <div class="border-t border-white/10 pt-4 space-y-3.5">
        <div class="section-label">Browse Domain Materials</div>
        <div class="flex flex-wrap gap-2">${domainTabs}</div>
        <div class="space-y-3">${subCards || '<div class="text-neutral-400 text-[14px]">Loading domains…</div>'}</div>
      </div>
    </div>
  `;

  bodyEl.querySelectorAll(".branch-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      store.state.branch = btn.dataset.filterBranch;
      updateActiveFiltersPill();
      syncGlobeMarkers();
      renderDomainsModal(bodyEl, btn.dataset.filterBranch === "all" ? activeDomain : btn.dataset.filterBranch);
      showToast(`Branch: ${PHYSICS_BRANCHES.find(b => b.id === store.state.branch)?.label || store.state.branch}`);
    });
  });
  bodyEl.querySelectorAll(".dom-tab").forEach(btn => {
    btn.addEventListener("click", () => renderDomainsModal(bodyEl, btn.dataset.domTab));
  });
  bodyEl.querySelectorAll("[data-save-mat]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const saved = await toggleBookmark({
        id: btn.dataset.saveMat,
        kind: "material",
        title: btn.dataset.matTitle,
        subtitle: btn.dataset.matSub,
        url: btn.dataset.matUrl,
        folder: "Study List"
      });
      refreshAccountHeader();
      btn.textContent = saved ? "✓ Saved" : "+ Save";
      btn.className = `px-3 py-1 rounded-full text-[12.5px] shrink-0 transition ${saved ? "glass-btn-active" : "glass-btn"}`;
      showToast(saved ? "Saved material to Study List" : "Removed bookmark");
    });
  });
}

// Sleek, uncluttered Continent + Quick Search Country Selector (zero wall of text!)
function renderCountriesModal(bodyEl) {
  let tab = "regions"; // "regions" | "private"
  let selectedContinent = "all";
  let query = "";

  const sortedCountries = [...store.countries.entries()]
    .map(([name, count]) => ({ name, count, continent: inferContinent(name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const companies = store.hubs.filter(h => h.group === "company" || h.entityType === "startup" || h.entityType === "institute");

  const render = () => {
    const headerTabs = `
      <div class="flex items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div class="flex items-center gap-2">
          <button type="button" data-ctab="regions" class="px-4 py-2 rounded-full text-[13.5px] transition ${tab === "regions" ? "glass-btn-active" : "glass-btn"}">Continents &amp; Countries</button>
          <button type="button" data-ctab="private" class="px-4 py-2 rounded-full text-[13.5px] transition ${tab === "private" ? "glass-btn-active" : "glass-btn"}">Private &amp; Startups</button>
        </div>
        ${store.state.countryFilter !== "all" ? `<button type="button" id="btn-clear-country" class="accent-link text-[13.5px] bg-transparent border-0 cursor-pointer">Reset</button>` : ""}
      </div>
    `;

    if (tab === "regions") {
      const f = query.trim().toLowerCase();
      const filtered = sortedCountries.filter(c => {
        if (selectedContinent !== "all" && c.continent !== selectedContinent) return false;
        if (f && !c.name.toLowerCase().includes(f) && !c.continent.toLowerCase().includes(f)) return false;
        return true;
      });

      const activeContObj = CONTINENTS.find(x => x.id === selectedContinent);

      bodyEl.innerHTML = `
        <div class="space-y-4">
          ${headerTabs}
          <input id="country-search-input" type="text" value="${esc(query)}" placeholder="Search a country or continent…" class="glass-input" />
          <div class="flex flex-wrap gap-2">
            ${CONTINENTS.map(ct => `
              <button type="button" data-cont="${esc(ct.id)}" class="px-3.5 py-1.5 rounded-full text-[13.5px] transition ${selectedContinent === ct.id ? "glass-btn-active" : "glass-btn"}">
                ${esc(ct.label)}
              </button>
            `).join("")}
          </div>
          ${selectedContinent !== "all" && activeContObj ? `
            <div class="flex items-center justify-between rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-2.5">
              <span class="text-[14px] text-neutral-200">${esc(activeContObj.label)}</span>
              <button type="button" id="btn-fly-continent" class="accent-link text-[13.5px] font-medium bg-transparent border-0 cursor-pointer">Center globe on ${esc(activeContObj.label)} →</button>
            </div>
          ` : ""}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[310px] scroll-clean pr-1">
            ${filtered.map(c => {
              const act = store.state.countryFilter === c.name;
              return `
                <button type="button" data-country="${esc(c.name)}" class="country-btn rounded-xl px-4 py-2.5 text-left text-[14px] flex items-center justify-between gap-2 transition ${act ? "glass-row-active font-medium" : "glass-row"}">
                  <span class="truncate">${esc(c.name)}</span>
                  <span class="text-[12.5px] ${act ? "text-black/60" : "text-neutral-500"} shrink-0">${c.count}</span>
                </button>
              `;
            }).join("") || `<div class="col-span-2 text-center py-6 text-[14px] text-neutral-400">No matching countries found.</div>`}
          </div>
        </div>
      `;

      const inp = bodyEl.querySelector("#country-search-input");
      inp?.addEventListener("input", (e) => {
        query = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const next = bodyEl.querySelector("#country-search-input");
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      });

      bodyEl.querySelectorAll("[data-cont]").forEach(btn => {
        btn.addEventListener("click", () => {
          selectedContinent = btn.dataset.cont;
          render();
          const obj = CONTINENTS.find(x => x.id === selectedContinent);
          if (obj && selectedContinent !== "all") {
            flyToHub({ lat: obj.lat, lng: obj.lng, zoom: obj.zoom }, obj.zoom);
          }
        });
      });

      bodyEl.querySelector("#btn-fly-continent")?.addEventListener("click", () => {
        if (activeContObj) {
          flyToHub({ lat: activeContObj.lat, lng: activeContObj.lng, zoom: activeContObj.zoom }, activeContObj.zoom);
          closeModal();
        }
      });

      bodyEl.querySelectorAll(".country-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const chosen = btn.dataset.country;
          store.state.countryFilter = store.state.countryFilter === chosen ? "all" : chosen;
          updateActiveFiltersPill();
          syncGlobeMarkers();
          const firstHub = store.hubs.find(h => h.country === store.state.countryFilter);
          if (firstHub) flyToHub(firstHub, 5.2);
          closeModal();
          showToast(store.state.countryFilter === "all" ? "Showing all countries" : store.state.countryFilter);
        });
      });
    } else {
      const f = query.trim().toLowerCase();
      const filteredComp = companies.filter(c =>
        !f || c.name.toLowerCase().includes(f) || (c.city || "").toLowerCase().includes(f) || (c.sector || "").toLowerCase().includes(f)
      );

      bodyEl.innerHTML = `
        <div class="space-y-4">
          ${headerTabs}
          <div class="flex items-center gap-2.5">
            <input id="comp-search-input" type="text" value="${esc(query)}" placeholder="Search startups, institutes, or sectors…" class="glass-input" />
            <button type="button" id="btn-filter-companies" class="glass-btn rounded-full px-4 py-2.5 text-[13.5px] whitespace-nowrap shrink-0">Show on Globe</button>
          </div>
          <div class="space-y-2 max-h-[340px] scroll-clean pr-1">
            ${filteredComp.slice(0, 60).map(c => `
              <button type="button" data-pick-comp="${esc(c.id)}" class="comp-row glass-row w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[14.5px] font-medium text-white truncate">${esc(c.name)}</div>
                  <div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(c.city)}${c.sector ? " · " + esc(c.sector) : ""}</div>
                </div>
                <span class="text-[12.5px] accent-text shrink-0">${esc(c.entityType)}</span>
              </button>
            `).join("") || `<div class="text-center py-6 text-[14px] text-neutral-400">No matching organizations.</div>`}
          </div>
        </div>
      `;

      const inp = bodyEl.querySelector("#comp-search-input");
      inp?.addEventListener("input", (e) => {
        query = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const next = bodyEl.querySelector("#comp-search-input");
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      });

      bodyEl.querySelector("#btn-filter-companies")?.addEventListener("click", () => {
        setGroupFilter("company");
        closeModal();
      });

      bodyEl.querySelectorAll(".comp-row").forEach(btn => {
        btn.addEventListener("click", () => {
          closeModal();
          selectHubNode(btn.dataset.pickComp, true);
        });
      });
    }

    bodyEl.querySelectorAll("[data-ctab]").forEach(btn => {
      btn.addEventListener("click", () => {
        tab = btn.dataset.ctab;
        query = "";
        render();
      });
    });

    bodyEl.querySelector("#btn-clear-country")?.addEventListener("click", () => {
      store.state.countryFilter = "all";
      updateActiveFiltersPill();
      syncGlobeMarkers();
      render();
    });
  };

  render();
}

function renderLiveSearchModal(bodyEl) {
  bodyEl.innerHTML = `
    <div class="space-y-4">
      <p class="text-[14px] text-neutral-400 leading-relaxed">
        Query live OpenAlex &amp; ROR registries for any research institution worldwide and plot it immediately.
      </p>
      <form id="live-search-form" class="flex gap-2.5">
        <input id="live-search-input" type="text" placeholder="e.g., synchrotron, neutrino, Leiden, quantum…" class="glass-input flex-1" />
        <button type="submit" class="glass-btn-active rounded-full px-5 py-2.5 text-[14px] shrink-0">Search</button>
      </form>
      <div class="flex flex-wrap gap-2">
        ${["Quantum", "Fusion", "Observatory", "Synchrotron", "Photonics"].map(tag => `
          <button type="button" data-quick="${esc(tag)}" class="live-quick glass-btn rounded-full px-3.5 py-1.5 text-[13px]">${esc(tag)}</button>
        `).join("")}
      </div>
      <div id="live-results" class="space-y-2.5 pt-1"></div>
    </div>
  `;

  const runLive = async (q) => {
    const out = document.getElementById("live-results");
    if (!out || !q.trim()) return;
    out.innerHTML = `<div class="text-[14px] text-neutral-400 py-2">Searching registries…</div>`;
    try {
      const [oa, ror] = await Promise.allSettled([
        fetch(proxyUrl(`https://api.openalex.org/institutions?search=${encodeURIComponent(q)}&per-page=10`)).then(r => r.ok ? r.json() : null),
        fetch(proxyUrl(`https://api.ror.org/v2/organizations?query=${encodeURIComponent(q)}`)).then(r => r.ok ? r.json() : null)
      ]);
      const items = [];
      if (oa.status === "fulfilled" && oa.value?.results) {
        for (const inst of oa.value.results) {
          if (!inst.geo || typeof inst.geo.latitude !== "number") continue;
          items.push({
            id: `oa-${(inst.id || inst.display_name).split("/").pop()}`,
            name: inst.display_name,
            city: `${inst.geo.city || "Hub"}, ${inst.geo.country || inst.country_code || ""}`.replace(/,\s*$/, ""),
            country: inst.geo.country || "",
            lat: inst.geo.latitude,
            lng: inst.geo.longitude,
            group: inst.type === "education" ? "uni" : inst.type === "company" ? "company" : "lab",
            entityType: inst.type === "education" ? "uni" : inst.type === "company" ? "company" : "lab",
            branch: classifyPhysicsBranch(inst.display_name),
            sourceApi: "OpenAlex Live",
            url: inst.homepage_url || inst.id || "",
            summary: `Live OpenAlex institution (${(inst.works_count || 0).toLocaleString()} indexed works).`
          });
        }
      }
      if (ror.status === "fulfilled" && ror.value?.items) {
        for (const org of ror.value.items.slice(0, 10)) {
          const loc = org.locations?.[0]?.geonames_details;
          const name = org.names?.find(x => x.types?.includes("ror_display"))?.value || org.names?.[0]?.value;
          if (!loc || typeof loc.lat !== "number" || !name) continue;
          const types = (org.types || []).map(t => t.toLowerCase());
          items.push({
            id: `ror-${(org.id || name).split("/").pop()}`,
            name,
            city: `${loc.name || "Hub"}, ${loc.country_name || ""}`.replace(/,\s*$/, ""),
            country: loc.country_name || "",
            lat: loc.lat,
            lng: loc.lng,
            group: types.includes("education") ? "uni" : types.includes("company") ? "company" : "lab",
            entityType: types.includes("education") ? "uni" : types.includes("company") ? "company" : "lab",
            branch: classifyPhysicsBranch(name),
            sourceApi: "ROR v2 Live",
            url: org.links?.[0]?.value || org.id || "",
            summary: `Verified ROR v2 organization.`
          });
        }
      }

      if (!items.length) {
        out.innerHTML = `<div class="text-[14px] text-neutral-400">No geocoded results found for "${esc(q)}".</div>`;
        return;
      }

      mergeHubs(items, "scraped");
      syncGlobeMarkers();

      out.innerHTML = items.map(it => `
        <button type="button" data-live-id="${esc(it.id)}" class="live-pick glass-row w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[14.5px] font-medium text-white truncate">${esc(it.name)}</div>
            <div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(it.city)} · ${esc(it.sourceApi)}</div>
          </div>
          <span class="text-[13.5px] accent-text shrink-0">Locate →</span>
        </button>
      `).join("");

      out.querySelectorAll(".live-pick").forEach(btn => {
        btn.addEventListener("click", () => {
          closeModal();
          selectHubNode(btn.dataset.liveId, true);
        });
      });
    } catch {
      out.innerHTML = `<div class="text-[14px] accent-text">Live query failed. Please try again.</div>`;
    }
  };

  document.getElementById("live-search-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    runLive(document.getElementById("live-search-input")?.value || "");
  });
  bodyEl.querySelectorAll(".live-quick").forEach(btn => {
    btn.addEventListener("click", () => {
      const inp = document.getElementById("live-search-input");
      if (inp) inp.value = btn.dataset.quick;
      runLive(btn.dataset.quick);
    });
  });
}

function renderAuditAndPrivacyModal(bodyEl) {
  const rep = store.verificationReport;
  const s = rep?.summary || {};
  const passRate = s.passRatePct != null ? `${s.passRatePct}%` : "Verified";

  bodyEl.innerHTML = `
    <div class="space-y-5">
      <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-2.5 text-[14px] text-neutral-300">
        <div class="text-[15.5px] font-semibold text-white">Verified Open-Science Ledger</div>
        <p class="leading-relaxed">All institutions, milestones, and space missions link directly to official primary registries (OpenAlex, ROR v2, INSPIRE-HEP, NASA/ESA, Wikimedia).</p>
        <div class="text-[13px] text-neutral-400">Schema errors: <strong class="text-white">${s.schemaErrorsCount ?? 0}</strong> · Live link pass: <strong class="text-white">${esc(passRate)}</strong></div>
        <div class="flex flex-wrap gap-3 pt-1 text-[13.5px]">
          <a href="./data/provenance_ledger.json" target="_blank" rel="noopener noreferrer" class="accent-link">Provenance Ledger ↗</a>
          <a href="./data/physalts_schema.json" target="_blank" rel="noopener noreferrer" class="accent-link">JSON Schema ↗</a>
          <a href="./data/verification_report.json" target="_blank" rel="noopener noreferrer" class="accent-link">Audit Report ↗</a>
          <a href="./about.html" class="accent-link">Methodology ↗</a>
        </div>
      </div>

      <div class="space-y-2.5">
        <div class="section-label">Export Open Dataset</div>
        <div class="flex flex-wrap gap-2.5">
          <button type="button" id="btn-exp-json" class="glass-btn rounded-full px-4 py-2 text-[13.5px]">Dataset .JSON</button>
          <button type="button" id="btn-exp-kml" class="glass-btn rounded-full px-4 py-2 text-[13.5px]">Google Earth .KML</button>
          <button type="button" id="btn-exp-csv" class="glass-btn rounded-full px-4 py-2 text-[13.5px]">Spreadsheet .CSV</button>
        </div>
      </div>

      <div class="border-t border-white/10 pt-4 space-y-3">
        <div class="text-[15px] font-semibold text-white">Privacy &amp; GDPR Controls</div>
        <div class="flex flex-wrap items-center gap-2.5">
          <button type="button" id="btn-gdpr-export" class="glass-btn rounded-full px-4 py-2 text-[13.5px]">Export My Data (Art. 20)</button>
          <button type="button" id="btn-gdpr-erase" class="accent-chip rounded-full px-4 py-2 text-[13.5px]">Erase Local Data (Art. 17)</button>
          <a href="./privacy.html" class="accent-link text-[13.5px] px-2">Privacy Policy ↗</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-exp-json")?.addEventListener("click", () => {
    downloadBlob(JSON.stringify({
      meta: { name: "PhysAlts Global Physics Dataset", exportedAt: new Date().toISOString() },
      hubs: store.hubs,
      timelineEvents: store.timelineEvents,
      spaceMissions: store.spaceMissions
    }, null, 2), "physalts_dataset.json", "application/json");
    showToast("Exported physalts_dataset.json");
  });

  document.getElementById("btn-exp-kml")?.addEventListener("click", () => {
    const nodes = getVisibleGlobeNodes();
    const marks = nodes.map(n => `\n    <Placemark><name>${esc(n.name)}</name><description>${esc(n.summary)}</description><Point><coordinates>${n.lng},${n.lat},0</coordinates></Point></Placemark>`).join("");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>PhysAlts</name>${marks}\n</Document></kml>`;
    downloadBlob(kml, "physalts_physics.kml", "application/vnd.google-earth.kml+xml");
    showToast("Exported physalts_physics.kml");
  });

  document.getElementById("btn-exp-csv")?.addEventListener("click", () => {
    const header = "name,city,country,entityType,branch,lat,lng,url";
    const rows = store.hubs.map(h => [h.name, h.city, h.country, h.entityType, h.branch, h.lat, h.lng, h.url].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
    downloadBlob([header, ...rows].join("\n"), "physalts_hubs.csv", "text/csv");
    showToast("Exported physalts_hubs.csv");
  });

  document.getElementById("btn-gdpr-export")?.addEventListener("click", () => {
    const data = exportUserData(store.state.stage, store.state.shortlist);
    downloadBlob(JSON.stringify(data, null, 2), "physalts_my_data_gdpr.json", "application/json");
    showToast("Exported personal data (GDPR Art. 20)");
  });

  document.getElementById("btn-gdpr-erase")?.addEventListener("click", async () => {
    await eraseAllUserData();
    store.state.shortlist.clear();
    store.state.stage = "undergrad";
    renderStageMenu();
    renderAuditAndPrivacyModal(bodyEl);
    showToast("Local data erased (GDPR Art. 17)");
  });
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =========================================================================
// STAGE MENU, GROUP FILTERS & ACTIVE FILTER PILL
// =========================================================================

export function renderStageMenu() {
  const lbl = document.getElementById("stage-current-label");
  if (lbl) lbl.textContent = STAGE_META[store.state.stage]?.short || "Undergrad";
  const menu = document.getElementById("stage-dropdown-menu");
  if (!menu) return;
  menu.innerHTML = Object.entries(STAGE_META).map(([key, meta]) => {
    const active = store.state.stage === key;
    return `
      <button type="button" data-stage-opt="${key}" class="w-full text-left px-3.5 py-2.5 rounded-[14px] text-[14px] flex items-center justify-between cursor-pointer ${active ? "stage-opt-active" : "stage-opt"}">
        <span>${meta.label}</span>
        ${active ? "<span>✓</span>" : ""}
      </button>
    `;
  }).join("");
  menu.querySelectorAll("[data-stage-opt]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateAccountProfile({ stage: btn.dataset.stageOpt });
      renderStageMenu();
      menu.classList.add("hidden");
      if (store.state.selectedId && !store.state.selectedId.startsWith("sp-")) selectHubNode(store.state.selectedId, false);
      showToast(`Stage: ${STAGE_META[store.state.stage].label}`);
    });
  });
}

function setGroupFilter(group) {
  store.state.groupFilter = group;
  if (store.state.timeMode) setTimeMode(false);
  document.querySelectorAll("[data-group-tab]").forEach(btn => {
    const act = btn.dataset.groupTab === group;
    btn.classList.toggle("glass-btn-active", act);
    if (!act) btn.classList.add("glass-btn");
  });
  syncGlobeMarkers();
}

function updateActiveFiltersPill() {
  const pill = document.getElementById("active-filter-pill");
  const txt = document.getElementById("active-filter-text");
  if (!pill || !txt) return;
  const labels = [];
  if (store.state.branch !== "all") labels.push(PHYSICS_BRANCHES.find(b => b.id === store.state.branch)?.label.split(/[\s,]+/)[0] || store.state.branch);
  if (store.state.countryFilter !== "all") labels.push(store.state.countryFilter);
  if (labels.length) {
    txt.textContent = labels.join(" · ");
    pill.classList.remove("hidden");
    pill.classList.add("inline-flex");
  } else {
    pill.classList.add("hidden");
    pill.classList.remove("inline-flex");
  }
}

// =========================================================================
// SHAREABLE DEEP LINKS (?hub=, ?space=, ?era=, ?domain=, ?country=, ?auth=)
// =========================================================================

export function applyDeepLinkFromUrl() {
  try {
    if (location.protocol === "blob:") return;
    const params = new URLSearchParams(location.search);
    if (params.get("space")) {
      setViewMode("space");
      selectSpaceMission(params.get("space"));
    } else if (params.get("hub")) {
      selectHubNode(params.get("hub"), true);
    } else if (params.get("era")) {
      const targetEra = store.eras.find(e => e.id === params.get("era"));
      setTimeMode(true, targetEra ? targetEra.startYear : -580);
    } else if (params.get("domain")) {
      openModal("domains", params.get("domain"));
    } else if (params.get("country")) {
      store.state.countryFilter = params.get("country");
      updateActiveFiltersPill();
      syncGlobeMarkers();
      const firstHub = store.hubs.find(h => h.country.toLowerCase() === store.state.countryFilter.toLowerCase());
      if (firstHub) flyToHub(firstHub, 5.2);
    } else if (params.get("auth") === "signup" || params.get("auth") === "signin") {
      closeAllSurfaces("auth");
      openAuthModal(params.get("auth"), { showToast });
    }
  } catch {}
}

function copyCurrentShareLink() {
  const id = store.state.selectedId;
  if (!id) return;
  let query = "";
  if (id.startsWith("sp-")) query = `?space=${encodeURIComponent(id.slice(3))}`;
  else query = `?hub=${encodeURIComponent(id)}`;

  const base = location.protocol === "blob:" ? "https://physalts.org/" : `${location.origin}${location.pathname}`;
  const fullUrl = `${base}${query}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(fullUrl).then(() => showToast("Share link copied")).catch(() => showToast(fullUrl));
  } else {
    showToast(fullUrl);
  }
}

const recentRabbitIds = [];

function jumpRabbitHole() {
  if (store.state.viewMode === "space" && store.spaceMissions.length) {
    const pool = store.spaceMissions.filter(m => !recentRabbitIds.includes(`sp-${m.id}`));
    const pick = (pool.length ? pool : store.spaceMissions)[Math.floor(Math.random() * (pool.length || store.spaceMissions.length))];
    if (!pick) return;
    recentRabbitIds.push(`sp-${pick.id}`);
    if (recentRabbitIds.length > 24) recentRabbitIds.shift();
    selectSpaceMission(pick.id);
    showToast(`Rabbit Hole → ${pick.name}`);
    return;
  }

  // Curated curiosity pool: flagships, small-nation labs, deep-tech startups, and rich hubs
  const curatedPool = store.hubs.filter(h => (h.tier === "flagship" || h.tier === "deeptech") && !recentRabbitIds.includes(h.id));
  const fallbackPool = store.hubs.filter(h => !recentRabbitIds.includes(h.id));
  const pool = curatedPool.length ? curatedPool : (fallbackPool.length ? fallbackPool : store.hubs);
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  recentRabbitIds.push(pick.id);
  if (recentRabbitIds.length > 32) recentRabbitIds.shift();

  if (store.state.timeMode) setTimeMode(false);
  selectHubNode(pick.id, true);
  showToast(`Rabbit Hole → ${pick.name}`);
}

// =========================================================================
// INITIALIZE ALL DOM LISTENERS & GLOBAL KEYBOARD SHORTCUTS
// =========================================================================

export function initUI() {
  renderStageMenu();
  refreshDbBadge();
  refreshAccountHeader();
  bindTimelineRuler();

  document.getElementById("btn-rabbit-hole")?.addEventListener("click", jumpRabbitHole);
  document.getElementById("btn-card-rabbit")?.addEventListener("click", jumpRabbitHole);

  const searchInput = document.getElementById("search-input");
  searchInput?.addEventListener("focus", () => renderSearchDropdown(searchInput.value));
  searchInput?.addEventListener("input", () => renderSearchDropdown(searchInput.value));

  document.getElementById("stage-dropdown-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("stage-dropdown-menu")?.classList.toggle("hidden");
  });

  // Account Button: Single-surface mutual exclusion!
  document.getElementById("btn-account")?.addEventListener("click", () => {
    const snap = getAuthSnapshot();
    if (snap.isAuthenticated) {
      openModal("account", "bookmarks");
    } else {
      closeAllSurfaces("auth");
      openAuthModal("signin", {
        showToast,
        onSuccess: () => {
          renderStageMenu();
          refreshDbBadge();
        }
      });
    }
  });

  document.getElementById("btn-close-auth")?.addEventListener("click", closeAuthModal);
  document.getElementById("auth-modal-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "auth-modal-backdrop") closeAuthModal();
  });

  document.getElementById("drawer-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "drawer-backdrop") closeModal();
  });

  // Dynamic Island Menu Toggle (mutually exclusive with Search, Modals, Auth)
  const menuBtn = document.getElementById("btn-site-menu");
  const menuDrop = document.getElementById("site-menu-dropdown");
  menuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menuDrop?.classList.contains("hidden");
    if (willOpen) {
      closeAllSurfaces("dropdown");
      document.getElementById("search-dropdown")?.classList.add("hidden");
      document.getElementById("stage-dropdown-menu")?.classList.add("hidden");
      menuDrop?.classList.remove("hidden");
    } else {
      menuDrop?.classList.add("hidden");
      document.getElementById("stage-dropdown-menu")?.classList.add("hidden");
    }
    menuBtn.setAttribute("aria-expanded", String(Boolean(willOpen)));
    updateIslandExpanded();
  });

  menuDrop?.querySelectorAll("[data-menu-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.menuAction;
      closeDropdown();
      if (act === "bookmarks") openModal("account", "bookmarks");
      if (act === "live") openModal("live");
      if (act === "submit") openModal("submit");
      if (act === "audit") openModal("audit");
      if (act === "shortcuts") openModal("shortcuts");
    });
  });

  document.getElementById("btn-clear-filters")?.addEventListener("click", () => {
    store.state.branch = "all";
    store.state.countryFilter = "all";
    updateActiveFiltersPill();
    syncGlobeMarkers();
  });

  document.getElementById("btn-mode-earth")?.addEventListener("click", () => setViewMode("earth"));
  document.getElementById("btn-mode-space")?.addEventListener("click", () => setViewMode("space"));

  document.getElementById("btn-arcs")?.addEventListener("click", (e) => {
    store.state.arcs = !store.state.arcs;
    e.currentTarget.classList.toggle("glass-btn-active", store.state.arcs);
    syncGlobeMarkers();
  });
  document.getElementById("btn-labels")?.addEventListener("click", (e) => {
    store.state.labels = !store.state.labels;
    e.currentTarget.classList.toggle("glass-btn-active", store.state.labels);
    setGlobeLabels(store.state.labels);
  });
  document.getElementById("btn-tilt")?.addEventListener("click", (e) => {
    store.state.tilted = !store.state.tilted;
    e.currentTarget.classList.toggle("glass-btn-active", store.state.tilted);
    setGlobeTilt(store.state.tilted);
  });
  document.getElementById("btn-reset-space")?.addEventListener("click", () => {
    closeDropdown();
    if (store.state.viewMode === "space") setViewMode("earth");
    resetGlobeToSpace();
  });

  document.getElementById("btn-zoom-in")?.addEventListener("click", zoomInGlobe);
  document.getElementById("btn-zoom-out")?.addEventListener("click", zoomOutGlobe);

  document.querySelectorAll("[data-group-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeAllSurfaces();
      if (store.state.viewMode === "space") setViewMode("earth");
      setGroupFilter(btn.dataset.groupTab);
    });
  });

  document.getElementById("btn-toggle-time")?.addEventListener("click", () => {
    setTimeMode(!store.state.timeMode, store.state.timeMode ? null : -580);
  });
  document.getElementById("btn-open-domains")?.addEventListener("click", () => openModal("domains"));
  document.getElementById("btn-open-countries")?.addEventListener("click", () => openModal("countries"));
  document.getElementById("btn-open-pathways")?.addEventListener("click", () => openModal("account", "bookmarks"));

  document.getElementById("btn-time-prev")?.addEventListener("click", () => {
    stopTimeTour();
    jumpToTimelineIndex(activeTimelineIdx - 1, true);
  });
  document.getElementById("btn-time-next")?.addEventListener("click", () => {
    stopTimeTour();
    jumpToTimelineIndex(activeTimelineIdx + 1, true);
  });
  document.getElementById("btn-time-play")?.addEventListener("click", (e) => {
    if (store.state.timePlaying) {
      stopTimeTour();
    } else {
      store.state.timePlaying = true;
      e.currentTarget.textContent = "Pause Tour";
      if (activeTimelineIdx >= store.timelineEvents.length - 1) activeTimelineIdx = -1;
      jumpToTimelineIndex(activeTimelineIdx + 1, false);
      timeTourTimer = setInterval(() => {
        if (activeTimelineIdx >= store.timelineEvents.length - 1) {
          stopTimeTour();
          return;
        }
        jumpToTimelineIndex(activeTimelineIdx + 1, false);
      }, 2400);
    }
  });
  document.getElementById("btn-time-close")?.addEventListener("click", () => setTimeMode(false));

  document.getElementById("btn-close-card")?.addEventListener("click", closePlaceCard);
  document.getElementById("btn-close-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-deeper-toggle")?.addEventListener("click", () => {
    document.getElementById("card-deeper-wrap")?.classList.toggle("hidden");
  });
  document.getElementById("btn-copy-link")?.addEventListener("click", copyCurrentShareLink);

  // Unified Bookmarking for Hubs, Timeline Milestones, AND Space Missions
  document.getElementById("btn-save-shortlist")?.addEventListener("click", async () => {
    const id = store.state.selectedId;
    if (!id) return;
    let payload = null;
    if (id.startsWith("sp-")) {
      const m = store.spaceMissions.find(x => `sp-${x.id}` === id);
      if (!m) return;
      payload = { id, kind: "space", title: m.name, subtitle: `${m.body} · ${m.lightTimeLabel}`, url: m.officialUrl || m.wikiUrl || "" };
    } else {
      const node = getNodeById(id);
      if (!node) return;
      payload = {
        id,
        kind: node.tier === "timeline" ? "timeline" : "hub",
        title: node.name,
        subtitle: node.city || "",
        url: node.url || node.wiki || ""
      };
    }
    const saved = await toggleBookmark(payload);
    updateBookmarkButtonUI(id);
    refreshAccountHeader();
    showToast(saved ? "Saved to Bookmarks" : "Removed from Bookmarks");
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const tag = (e.target?.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
      return;
    }
    if (e.key === "Escape") {
      closeAllSurfaces();
      return;
    }
    if (typing) return;

    if (e.key === "/") {
      e.preventDefault();
      searchInput?.focus();
    } else if (e.key.toLowerCase() === "r") {
      jumpRabbitHole();
    } else if (e.key === "1") {
      setViewMode("earth");
    } else if (e.key === "2") {
      setViewMode("space");
    } else if (e.key.toLowerCase() === "t") {
      setTimeMode(!store.state.timeMode, store.state.timeMode ? null : -580);
    } else if (e.key.toLowerCase() === "b") {
      openModal("account", "bookmarks");
    } else if (e.key === "?") {
      openModal("shortcuts");
    }
  });

  // Collapse Dynamic Island cleanly when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#dynamic-island")) {
      closeDropdown();
    }
  });

  if (typeof window.lucide?.createIcons === "function") {
    window.lucide.createIcons();
  }
}
