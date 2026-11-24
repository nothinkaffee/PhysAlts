/**
 * PhysAlts — Interactive Production UI Controller (Atlas Engine v2.1)
 * Pure neutral grey palette + rgb(160, 70, 70) editorial link accent (zero blue, zero yellow, zero all-caps).
 * Generous 8pt spacing, 14–16px Helvetica/Inter typography, sleek Continent + Country selector,
 * full Account/Login/Bookmarks workspace, Deep-Link sharing, Keyboard Shortcuts, and GDPR controls.
 */

import {
  STEM_DISCIPLINES, PHYSICS_BRANCHES, STAGE_META, STAGE_PORTALS, BRANCH_SHORT_LABELS,
  proxyUrl, formatYear, buildDefaultStages, classifyPhysicsBranch
} from "./config.js";
import {
  store, getNodeById, getVisibleGlobeNodes, getFilteredHubs, universalSearch,
  mergeHubs, mergeOfflinePackPayload
} from "./data_store.js";
import {
  syncGlobeMarkers, flyToHub, resetGlobeToSpace,
  setGlobeLabels, setGlobeTilt, zoomInGlobe, zoomOutGlobe
} from "./globe_engine.js";
import * as spaceView from "./space_view.js";
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
import { computeImpactScore, scoreHubForYear } from "./impact_ranking.js";
import { curateRabbitHoleNodes } from "./rabbit_agent.js";
import {
  pickNextRabbitHop, pickNextSpaceHop, getCardRabbitBranches,
  recordRabbitVisit, getFreeRoamState, stepFreeRoamBack, clearFreeRoamWalk
} from "./rabbit_engine.js";
import {
  fetchPackManifest, getDownloadedPackIds, getDownloadedPackMeta,
  downloadPack, deletePack, exportPackToFile, getOfflineStorageStats, formatBytes
} from "./offline_packs.js";
import {
  getShanghaiState, getSubjectMeta, getHubContextualRank
} from "./shanghai_engine.js";
import {
  renderShanghaiCardSection, renderEcosystemCardSection,
  renderShanghaiDeeperBreakdown, renderRankingsModal
} from "./shanghai_ui.js";
import { initCustomSelects, closeCustomSelect } from "./custom_select.js";

let activeWikiReq = 0;
let activeAgentReq = 0;
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
  if (isFilterPopoverOpen()) renderFilterPopover();
  updateActiveFiltersPill();
}

function isRabbitPopoverOpen() {
  const el = document.getElementById("rabbit-popover");
  return Boolean(el && !el.classList.contains("hidden"));
}

function isFilterPopoverOpen() {
  const el = document.getElementById("filter-popover");
  return Boolean(el && !el.classList.contains("hidden"));
}

function renderRabbitPopover() {
  const box = document.getElementById("rabbit-popover-trails");
  if (!box) return;
  const trails = store.rabbitTrails || [];
  if (!trails.length) {
    box.innerHTML = `<div class="text-[13px] text-neutral-400 py-2">Loading curated journeys…</div>`;
    return;
  }
  box.innerHTML = trails.map(tr => `
    <button type="button" data-pop-trail="${esc(tr.id)}" class="glass-row w-full text-left rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="text-[13.5px] font-medium text-white truncate">${esc(tr.title)}</div>
        <div class="text-[12px] text-neutral-400 truncate mt-0.5">${esc(tr.tagline)}</div>
      </div>
      <span class="text-[12.5px] accent-text shrink-0">${(tr.stops || []).length} stops →</span>
    </button>
  `).join("");
  box.querySelectorAll("[data-pop-trail]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tr = store.rabbitTrails.find(t => t.id === btn.dataset.popTrail);
      if (tr) {
        closeRabbitPopover();
        startRabbitTrail(tr, 0);
      }
    });
  });
}

function closeRabbitPopover() {
  const pop = document.getElementById("rabbit-popover");
  const btn = document.getElementById("btn-rabbit-hole");
  if (!pop || pop.classList.contains("hidden")) return;
  pop.classList.add("hidden");
  btn?.classList.remove("island-btn-open");
  btn?.setAttribute("aria-expanded", "false");
  updateActiveFiltersPill();
}

function openRabbitPopover() {
  closeAllSurfaces(["rabbit", "card"]);
  renderRabbitPopover();
  const pop = document.getElementById("rabbit-popover");
  const btn = document.getElementById("btn-rabbit-hole");
  if (!pop) return;
  pop.classList.remove("hidden");
  btn?.classList.add("island-btn-open");
  btn?.setAttribute("aria-expanded", "true");
  updateActiveFiltersPill();
}

function toggleRabbitPopover() {
  if (isRabbitPopoverOpen()) closeRabbitPopover();
  else openRabbitPopover();
}

function closeFilterPopover() {
  closeCustomSelect();
  const pop = document.getElementById("filter-popover");
  const btn = document.getElementById("btn-open-filters");
  const mobBtn = document.getElementById("btn-mobile-filters");
  if (!pop || pop.classList.contains("hidden")) return;
  pop.classList.add("hidden");
  btn?.classList.remove("island-btn-open");
  btn?.setAttribute("aria-expanded", "false");
  mobBtn?.classList.remove("glass-btn-active");
  updateActiveFiltersPill();
}

function openFilterPopover() {
  closeAllSurfaces(["filter", "card"]);
  renderFilterPopover();
  const pop = document.getElementById("filter-popover");
  const btn = document.getElementById("btn-open-filters");
  const mobBtn = document.getElementById("btn-mobile-filters");
  if (!pop) return;
  pop.classList.remove("hidden");
  btn?.classList.add("island-btn-open");
  btn?.setAttribute("aria-expanded", "true");
  mobBtn?.classList.add("glass-btn-active");
  updateActiveFiltersPill();
}

function toggleFilterPopover() {
  if (isFilterPopoverOpen()) closeFilterPopover();
  else openFilterPopover();
}

function closeSpotlight() {
  document.getElementById("spotlight-backdrop")?.classList.add("hidden");
}

export function openSpotlight() {
  closeAllSurfaces("spotlight");
  const bd = document.getElementById("spotlight-backdrop");
  const inp = document.getElementById("search-input");
  if (!bd) return;
  if (inp) inp.value = "";
  bd.classList.remove("hidden");
  renderSearchDropdown("");
  setTimeout(() => {
    inp?.focus();
  }, 20);
}

export function closeDropdown() {
  closeSpotlight();
  closeRabbitPopover();
  closeFilterPopover();
}

function closePlaceCard() {
  store.state.selectedId = null;
  setSelectedSpaceMission(null);
  document.getElementById("place-card")?.classList.add("hidden");
  document.body.classList.remove("card-open");
  syncGlobeMarkers();
}

function clearExploreDockActive() {
  ["btn-open-domains", "btn-open-countries", "btn-open-pathways"].forEach(id => {
    document.getElementById(id)?.classList.remove("glass-btn-active");
  });
}

function closeModal() {
  closeCustomSelect();
  document.getElementById("drawer-backdrop")?.classList.add("hidden");
  clearExploreDockActive();
}

let activeStackContext = null;

export function closeClusterSheet() {
  const sheet = document.getElementById("cluster-sheet");
  if (!sheet || sheet.classList.contains("hidden")) return;
  sheet.classList.add("hidden");
  if (document.getElementById("place-card")?.classList.contains("hidden")) {
    document.body.classList.remove("card-open");
  }
}

export function openClusterSheet(stack) {
  if (!stack || !Array.isArray(stack.nodes) || !stack.nodes.length) return;
  activeStackContext = stack;
  closeAllSurfaces("stack");

  const sheet = document.getElementById("cluster-sheet");
  const titleEl = document.getElementById("cluster-sheet-title");
  const subEl = document.getElementById("cluster-sheet-sub");
  const filterInp = document.getElementById("cluster-sheet-filter");
  const listEl = document.getElementById("cluster-sheet-list");
  if (!sheet || !listEl) return;

  if (titleEl) titleEl.textContent = stack.title || "Nearby Institutions";
  if (subEl) subEl.textContent = `${stack.nodes.length.toLocaleString()} institutions here · Ranked by Impact`;

  if (filterInp) {
    filterInp.value = "";
    filterInp.placeholder = `Filter ${stack.nodes.length} here…`;
    filterInp.classList.toggle("hidden", stack.nodes.length <= 8);
  }

  const renderRows = (q = "") => {
    const query = q.trim().toLowerCase();
    const matched = query
      ? stack.nodes.filter(n =>
          `${n.name} ${BRANCH_SHORT_LABELS[n.branch] || ""} ${n.sector || ""} ${n.entityType || ""}`
            .toLowerCase()
            .includes(query)
        )
      : stack.nodes;

    if (!matched.length) {
      listEl.innerHTML = `<div class="text-center text-[13.5px] text-neutral-400 py-6">No matching institutions here</div>`;
      return;
    }

    listEl.innerHTML = matched.slice(0, 120).map(n => {
      const br = BRANCH_SHORT_LABELS[n.branch] || n.sector || "STEM";
      const kind = n.entityType === "startup" || n.entityType === "company" ? "Company"
        : n.entityType === "lab" ? "Lab"
        : n.entityType === "institute" ? "Institute"
        : "University";
      const imp = n.impactScore ? `<span class="text-[12px] text-neutral-400 tabular-nums shrink-0">${n.impactScore}</span>` : "";
      const isCur = n.tier === "flagship" || n.tier === "stem";
      return `
        <button type="button" data-stack-hub="${esc(n.id)}" class="glass-row w-full text-left rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[14px] ${isCur ? "font-semibold text-white" : "font-medium text-neutral-200"} truncate">${esc(n.name)}</div>
            <div class="text-[12px] text-neutral-400 truncate mt-0.5">${esc(br)} · ${esc(kind)}</div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${imp}
            <span class="accent-text text-[13px]">→</span>
          </div>
        </button>
      `;
    }).join("");

    listEl.querySelectorAll("[data-stack-hub]").forEach(btn => {
      btn.addEventListener("click", () => {
        selectHubNode(btn.dataset.stackHub, false, { fromStack: stack });
      });
    });
  };

  renderRows("");
  if (filterInp) {
    filterInp.oninput = () => renderRows(filterInp.value);
  }
  const closeBtn = document.getElementById("btn-close-cluster-sheet");
  if (closeBtn) closeBtn.onclick = () => closeClusterSheet();

  sheet.classList.remove("hidden");
  document.body.classList.add("card-open");
  listEl.scrollTop = 0;
}

/**
 * Single-Surface Mutual Exclusion State Machine:
 * Guarantees overlay surfaces never stack awkwardly — accepts a single key or array of keys to keep open.
 */
function closeAllSurfaces(except = null) {
  const keep = new Set(Array.isArray(except) ? except : (except ? [except] : []));
  if (!keep.has("spotlight")) closeSpotlight();
  if (!keep.has("modal")) closeModal();
  if (!keep.has("auth")) closeAuthModal();
  if (!keep.has("card")) closePlaceCard();
  if (!keep.has("stack")) closeClusterSheet();
  if (!keep.has("rabbit")) closeRabbitPopover();
  if (!keep.has("filter")) closeFilterPopover();
}

export function resetCurrentView() {
  closeAllSurfaces();
  if (store.state.viewMode === "space") {
    if (typeof spaceView.resetSpaceView === "function") {
      spaceView.resetSpaceView();
    } else {
      setSpaceZone("all");
    }
    renderSpaceZoneBar();
  } else {
    resetGlobeToSpace();
  }
  showToast("View reset");
}

function updateBookmarkButtonUI(id) {
  const saveBtn = document.getElementById("btn-save-shortlist");
  if (!saveBtn) return;
  const saved = isBookmarked(id);
  saveBtn.className = `card-action transition ${saved ? "glass-btn-active" : "glass-btn"}`;
  const span = saveBtn.querySelector("span");
  if (span) {
    span.textContent = saved ? "Saved" : "Save";
  } else {
    saveBtn.textContent = saved ? "Saved" : "Save";
  }
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
  const timeBar = document.getElementById("time-bar");

  closeAllSurfaces();

  if (mode === "space") {
    spaceOverlay?.classList.remove("space-hidden");
    document.body.classList.add("space-mode");
    btnSpace?.classList.add("glass-btn-active");
    btnSpace?.classList.remove("glass-btn");
    btnSpace?.setAttribute("aria-selected", "true");
    btnEarth?.classList.remove("glass-btn-active");
    btnEarth?.classList.add("glass-btn");
    btnEarth?.setAttribute("aria-selected", "false");
    if (earthControls) earthControls.style.display = "none";
    timeBar?.classList.add("hidden");
    document.body.classList.remove("time-open");
    stopTimeTour();
    renderRabbitTrailBar();
    renderSpaceZoneBar();
    startSpaceLoop();
  } else {
    spaceOverlay?.classList.add("space-hidden");
    document.body.classList.remove("space-mode");
    btnEarth?.classList.add("glass-btn-active");
    btnEarth?.classList.remove("glass-btn");
    btnEarth?.setAttribute("aria-selected", "true");
    btnSpace?.classList.remove("glass-btn-active");
    btnSpace?.classList.add("glass-btn");
    btnSpace?.setAttribute("aria-selected", "false");
    if (earthControls) earthControls.style.display = "";
    if (store.state.timeMode) {
      timeBar?.classList.remove("hidden");
      document.body.classList.add("time-open");
    }
    stopSpaceLoop();
    renderRabbitTrailBar();
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
    <button type="button" data-szone="${esc(z.id)}" class="szone-btn px-3.5 py-2 rounded-full text-[14px] whitespace-nowrap transition ${z.id === current ? "glass-btn-active" : "glass-btn"}">
      ${esc(COMPACT_ZONE_LABELS[z.id] || z.label)}
    </button>
  `).join("");
  bar.querySelectorAll(".szone-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setSpaceZone(btn.dataset.szone);
      renderSpaceZoneBar();
    });
  });
}

export function selectSpaceMission(missionId) {
  const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const m = store.spaceMissions.find(x => x.id === missionId)
    || store.spaceMissions.find(x => norm(x.id) === norm(missionId) || norm(x.name) === norm(missionId));
  if (!m) return;
  closeAllSurfaces("card");
  const fullId = `sp-${m.id}`;
  store.state.selectedId = fullId;
  setSelectedSpaceMission(m.id);

  const card = document.getElementById("place-card");
  if (!card) return;
  document.getElementById("btn-card-stack-back")?.classList.add("hidden");
  card.classList.remove("hidden");
  document.body.classList.add("card-open");
  const scrollBody = document.getElementById("card-scroll-body");
  if (scrollBody) scrollBody.scrollTop = 0;

  document.getElementById("card-badge").textContent = `${m.body} · ${m.lightTimeLabel}`;
  document.getElementById("card-impact-pill")?.classList.add("hidden");
  document.getElementById("card-title").textContent = m.name;
  document.getElementById("card-sub").textContent = `${m.agency} (${m.country}) · Launched ${m.launchYear} · ${m.distanceAU} AU`;
  document.getElementById("card-summary").textContent = m.summary || m.physicsDiscoveries || "";
  document.getElementById("card-stage-box")?.classList.add("hidden");
  document.getElementById("card-shanghai-wrap")?.classList.add("hidden");
  document.getElementById("card-ecosystem-wrap")?.classList.add("hidden");

  const extra = document.getElementById("card-extra-chips");
  if (extra) {
    extra.innerHTML = (m.instruments || []).slice(0, 2).map(inst =>
      `<span class="px-3 py-1 rounded-full text-[13px] bg-white/[0.07] border border-white/12 text-neutral-200 truncate max-w-full inline-block">${esc(inst)}</span>`
    ).join("");
  }

  const linksEl = document.getElementById("card-links");
  const links = [];
  if (m.officialUrl) links.push(`<a href="${esc(m.officialUrl)}" target="_blank" rel="noopener noreferrer" class="glass-btn-active rounded-full px-3 py-1.5 text-[13px] inline-flex items-center gap-1 whitespace-nowrap">Official Mission Site ↗</a>`);
  if (m.wikiUrl) links.push(`<a href="${esc(m.wikiUrl)}" target="_blank" rel="noopener noreferrer" class="accent-link px-0.5 py-1 text-[13px] whitespace-nowrap">Wikipedia ↗</a>`);
  if (linksEl) linksEl.innerHTML = links.join("");

  document.getElementById("card-deeper-wrap")?.classList.add("hidden");
  document.getElementById("btn-deeper-toggle")?.classList.add("hidden");
  document.getElementById("btn-save-shortlist")?.classList.remove("hidden");
  updateBookmarkButtonUI(fullId);

  // Load IceCube-style hero image + Wikipedia brief excerpt for this space mission (zero 404s)
  loadWikipediaCardBrief({
    name: m.name,
    wiki: m.wikiUrl || "",
    wikiSlug: "",
    summary: m.summary
  });

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
        <button type="button" data-jump-space="${esc(nb.id)}" title="${esc(nb.body)} · ${esc(nb.lightTimeLabel)}" class="glass-btn rounded-full px-3 py-1 text-[13px] truncate max-w-full">
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
        <button type="button" data-era-id="${esc(e.id)}" class="era-tab px-3.5 py-1.5 rounded-full text-[14px] whitespace-nowrap transition ${act ? "glass-btn-active" : "glass-btn"}">
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
      return `<span class="timeline-dot ${isAct ? "active" : ""}" style="left:${ep.toFixed(2)}%" title="${esc(formatYear(ev.year))}"></span>`;
    }).join("");
  }

  // Pure Date-Only Timeline Ticks (zero duplicated card text!)
  const stripEl = document.getElementById("timeline-event-strip");
  if (stripEl && store.timelineEvents.length) {
    const eraEvents = era
      ? store.timelineEvents.filter(ev => ev.eraId === era.id)
      : store.timelineEvents.slice(Math.max(0, activeTimelineIdx - 3), activeTimelineIdx + 5);
    const activeEv = store.timelineEvents[activeTimelineIdx];

    stripEl.innerHTML = eraEvents.map(ev => {
      const isSel = activeEv && ev.id === activeEv.id;
      return `
        <button type="button" data-tl-card="${esc(ev.id)}" class="tl-card shrink-0 rounded-full px-4 py-2 text-[14px] font-medium tabular-nums whitespace-nowrap transition ${isSel ? "glass-btn-active" : "glass-btn"}">
          ${formatYear(ev.year)}
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

    const activePill = stripEl.querySelector(".glass-btn-active");
    activePill?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
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
    if (!store.state.selectedId || !String(store.state.selectedId).startsWith("tl-")) {
      closeAllSurfaces();
    } else {
      closeAllSurfaces("card");
    }
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
// FLOATING RABBIT HOLE TRAIL BREADCRUMB BAR & WIKIPEDIA BRIEF HELPER
// =========================================================================

function renderRabbitTrailBar() {
  const bar = document.getElementById("rabbit-trail-bar");
  const trail = store.state.activeTrail;
  if (!bar) return;

  const stepEl = document.getElementById("trail-bar-step");
  const titleEl = document.getElementById("trail-bar-title");
  const bridgeEl = document.getElementById("trail-bar-bridge");
  const prevBtn = document.getElementById("btn-trail-prev");
  const nextBtn = document.getElementById("btn-trail-next");

  if (store.state.viewMode === "earth" && !store.state.timeMode && trail && Array.isArray(trail.stops) && trail.stops.length) {
    const idx = Math.max(0, Math.min(trail.stops.length - 1, trail.index || 0));
    const stop = trail.stops[idx];
    if (stepEl) stepEl.textContent = `${idx + 1} / ${trail.stops.length}`;
    if (titleEl) titleEl.textContent = `${trail.title} · ${stop.title || ""}`;
    if (bridgeEl) bridgeEl.textContent = stop.bridge || trail.tagline || "";
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.textContent = idx >= trail.stops.length - 1 ? "Finish" : "Next →";
    bar.classList.remove("hidden");
    document.body.classList.add("trail-open");
    return;
  }

  // Free-roam curiosity walk bar (appears only after 2+ hops, whisper-clean 1-line bridge)
  const free = getFreeRoamState();
  if (store.state.viewMode === "earth" && !store.state.timeMode && free.history.length >= 2 && free.current) {
    if (stepEl) stepEl.textContent = `Hop ${free.cursor + 1}`;
    if (titleEl) titleEl.textContent = free.current.title || "";
    if (bridgeEl) bridgeEl.textContent = free.current.reason || free.current.city || "";
    if (prevBtn) prevBtn.disabled = !free.canGoBack;
    if (nextBtn) nextBtn.textContent = "Next →";
    bar.classList.remove("hidden");
    document.body.classList.add("trail-open");
    return;
  }

  bar.classList.add("hidden");
  document.body.classList.remove("trail-open");
}

export function startRabbitTrail(trail, startIdx = 0) {
  if (!trail || !Array.isArray(trail.stops) || !trail.stops.length) return;
  clearFreeRoamWalk();
  store.state.activeTrail = {
    id: trail.id || `trail-${Date.now()}`,
    title: trail.title || "Rabbit Hole Trail",
    tagline: trail.tagline || "",
    stops: trail.stops,
    index: Math.max(0, Math.min(trail.stops.length - 1, startIdx))
  };
  if (store.state.timeMode) setTimeMode(false);
  if (store.state.viewMode === "space") setViewMode("earth");
  const stop = store.state.activeTrail.stops[store.state.activeTrail.index];
  renderRabbitTrailBar();
  if (stop?.hubId) {
    selectHubNode(stop.hubId, true);
  }
  showToast(`Trail · ${trail.title}`);
}

function stepRabbitTrail(delta) {
  const trail = store.state.activeTrail;
  if (trail && trail.stops?.length) {
    const nextIdx = trail.index + delta;
    if (nextIdx < 0) return;
    if (nextIdx >= trail.stops.length) {
      exitRabbitTrail();
      showToast(`Completed · ${trail.title}`);
      return;
    }
    trail.index = nextIdx;
    const stop = trail.stops[nextIdx];
    renderRabbitTrailBar();
    if (stop?.hubId) {
      selectHubNode(stop.hubId, true);
    }
    return;
  }

  // Free-roam Back / Next
  if (delta < 0) {
    const prev = stepFreeRoamBack();
    if (prev?.id) {
      selectHubNode(prev.id, true, { skipRecordWalk: true });
      renderRabbitTrailBar();
    }
  } else if (delta > 0) {
    jumpRabbitHole("walk");
  }
}

function exitRabbitTrail() {
  store.state.activeTrail = null;
  clearFreeRoamWalk();
  renderRabbitTrailBar();
  syncGlobeMarkers();
}

/**
 * Loads fair-use Wikimedia hero photo AND a crisp 2–3 line Wikipedia brief excerpt (IceCube-style card).
 * Uses direct REST summary when wikiSlug/wiki URL is known, or a safe HTTP-200-only MediaWiki
 * search fallback when absent (guaranteed ZERO 404s).
 */
function loadWikipediaCardBrief(node) {
  const photoWrap = document.getElementById("card-photo-wrap");
  const imgEl = document.getElementById("card-photo");
  const fallbackEl = document.getElementById("card-photo-fallback");
  const summaryEl = document.getElementById("card-summary");

  photoWrap?.classList.add("hidden");
  imgEl?.classList.add("opacity-0");
  fallbackEl?.classList.remove("hidden");

  const reqId = ++activeWikiReq;
  let slug = node.wikiSlug || "";
  if (!slug && node.wiki && node.wiki.includes("/wiki/")) {
    try {
      slug = decodeURIComponent(node.wiki.split("/wiki/")[1].split(/[?#]/)[0]);
    } catch {
      slug = node.wiki.split("/wiki/")[1].split(/[?#]/)[0];
    }
  }

  const curSummary = String(node.summary || "").trim();
  const isStubSummary = !curSummary
    || curSummary.length < 48
    || /^(research institution|university|organization|institution|facility|laboratory|higher education|nonprofit)\s+(in|located in)\b/i.test(curSummary)
    || /indexed via (openalex|ror)\b/i.test(curSummary);

  const applyWikiData = (data) => {
    if (reqId !== activeWikiReq || !data || data.type === "disambiguation") return;
    const pic = data.originalimage?.source || data.thumbnail?.source;
    if (pic && imgEl && !/\.svg(\.png)?(\?|$)/i.test(pic)) {
      imgEl.onload = () => {
        if (reqId !== activeWikiReq) return;
        photoWrap?.classList.remove("hidden");
        imgEl.classList.remove("opacity-0");
        fallbackEl?.classList.add("hidden");
      };
      imgEl.onerror = () => {
        if (reqId !== activeWikiReq) return;
        photoWrap?.classList.add("hidden");
      };
      imgEl.src = proxyUrl(pic);
      imgEl.alt = node.name || "";
    }

    // Never double-display a second summary paragraph; only enrich bare auto-scraped stubs in-place
    if (isStubSummary && summaryEl) {
      const extract = String(data.extract || "").replace(/\s+/g, " ").trim();
      if (extract) {
        const clipped = extract.length > 210 ? extract.slice(0, 205).replace(/\s+\S*$/, "") + "…" : extract;
        summaryEl.textContent = clipped;
      }
    }
  };

  if (slug) {
    fetch(proxyUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`))
      .then(r => r.ok ? r.json() : null)
      .then(applyWikiData)
      .catch(() => {});
  } else if (node.name) {
    const cleanName = String(node.name).replace(/\s*\([^)]*\)\s*/g, " ").trim();
    fetch(proxyUrl(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanName)}&srlimit=1&format=json&origin=*`))
      .then(r => r.ok ? r.json() : null)
      .then(sData => {
        if (reqId !== activeWikiReq) return null;
        const hit = sData?.query?.search?.[0];
        if (!hit?.title) return null;
        const words = cleanName.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4);
        const titleLow = hit.title.toLowerCase();
        if (words.length && !words.some(w => titleLow.includes(w))) return null;
        return fetch(proxyUrl(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`))
          .then(r => r.ok ? r.json() : null);
      })
      .then(applyWikiData)
      .catch(() => {});
  }
  return reqId;
}

// =========================================================================
// PLACE / MILESTONE DETAIL CARD
// =========================================================================

export function selectHubNode(id, fly = true, opts = {}) {
  const node = getNodeById(id);
  if (!node) return;
  if (store.state.viewMode === "space") setViewMode("earth");

  closeAllSurfaces("card");
  store.state.selectedId = node.id;

  if (store.state.trailHistory[store.state.trailHistory.length - 1] !== node.id) {
    store.state.trailHistory.push(node.id);
    if (store.state.trailHistory.length > 24) store.state.trailHistory.shift();
  }
  if (!opts.skipRecordWalk) {
    recordRabbitVisit(node, {
      pushWalk: Boolean(opts.pushWalk),
      reason: opts.reason || ""
    });
  }

  const card = document.getElementById("place-card");
  if (!card) return;
  const backStackBtn = document.getElementById("btn-card-stack-back");
  if (backStackBtn) {
    if (opts.fromStack?.nodes?.length) {
      backStackBtn.textContent = `← ${opts.fromStack.title || "Nearby"} (${opts.fromStack.nodes.length})`;
      backStackBtn.classList.remove("hidden");
      backStackBtn.onclick = () => openClusterSheet(opts.fromStack);
    } else {
      backStackBtn.classList.add("hidden");
      backStackBtn.onclick = null;
    }
  }
  card.classList.remove("hidden");
  document.body.classList.add("card-open");
  const scrollBody = document.getElementById("card-scroll-body");
  if (scrollBody) scrollBody.scrollTop = 0;
  if (fly) flyToHub(node, node.tier === "timeline" ? 4.8 : null);
  syncGlobeMarkers();
  renderRabbitTrailBar();
  const deeperWrap = document.getElementById("card-deeper-wrap");
  deeperWrap?.classList.add("hidden");
  const deeperBtn = document.getElementById("btn-deeper-toggle");
  if (deeperBtn) {
    deeperBtn.classList.remove("hidden");
    const sp = deeperBtn.querySelector("span");
    if (sp) sp.textContent = "More";
  }
  document.getElementById("btn-save-shortlist")?.classList.remove("hidden");

  const discLabel = STEM_DISCIPLINES.find(d => d.id === node.discipline)?.short;
  const typeLabel = node.sector || (
    node.entityType === "startup" ? "Deep-Tech Startup"
    : node.entityType === "company" ? "Frontier Tech Lab"
    : node.entityType === "institute" ? "Research Institute"
    : node.entityType === "lab" ? "National Lab & Facility"
    : node.entityType === "history" ? "Historical Milestone"
    : node.entityType === "project" ? "Mega-Project"
    : discLabel && node.discipline !== "physics" ? `${discLabel} University` : "Research University"
  );
  const yearPart = node.foundedYear != null ? ` · ${formatYear(node.foundedYear)}` : "";
  const deeperImpactWrap = document.getElementById("deeper-impact-wrap");
  const deeperImpactEl = document.getElementById("deeper-impact");
  let impactSuffix = "";

  if (node.tier !== "timeline") {
    const imp = node._impact || computeImpactScore(node);
    const eraScore = store.state.timeMode ? scoreHubForYear(node, store.state.timeYear) : imp.total;
    const ctxRank = !store.state.timeMode ? getHubContextualRank(node, {
      shanghaiSubject: store.state.shanghaiSubject,
      discipline: store.state.discipline,
      branch: store.state.branch
    }) : null;
    if (ctxRank) {
      impactSuffix = ctxRank.isArwu
        ? ` · ARWU #${ctxRank.rankLabel}`
        : ` · GRAS #${ctxRank.rankLabel}`;
    } else {
      impactSuffix = ` · Impact ${eraScore}`;
    }
    if (deeperImpactWrap && deeperImpactEl) {
      deeperImpactEl.innerHTML = renderShanghaiDeeperBreakdown(node, imp, eraScore);
      deeperImpactWrap.classList.remove("hidden");
    }
  } else {
    deeperImpactWrap?.classList.add("hidden");
  }

  document.getElementById("card-badge").textContent = `${typeLabel}${yearPart}${impactSuffix}`;
  document.getElementById("card-title").textContent = node.name;
  document.getElementById("card-sub").textContent = node.city;
  document.getElementById("card-summary").textContent = node.summary;

  updateBookmarkButtonUI(node.id);

  // Official ShanghaiRanking 2026 Profile (ARWU + GRAS 57 subjects + 5-indicator breakdown)
  renderShanghaiCardSection(node, {
    onOpenSubjectTable: (subjCode) => openModal("rankings", subjCode)
  });

  // Verified Research Collaborations & Nearby Labs/Companies Ecosystem
  renderEcosystemCardSection(node, {
    onSelectHub: (targetId) => selectHubNode(targetId, true)
  });

  // 3 Typed Semantic Keep Exploring chips (Deeper · Cross-STEM/Spinout · Space/Wildcard — zero text bloat)
  const rWrap = document.getElementById("card-rabbit-wrap");
  const rLinks = document.getElementById("card-rabbit-links");
  if (rWrap && rLinks) {
    const branches = getCardRabbitBranches(node);
    if (branches.length) {
      rWrap.classList.remove("hidden");
      rLinks.innerHTML = branches.map(b => `
        <button type="button" data-jump-kind="${esc(b.kind)}" data-jump-id="${esc(b.id)}" data-jump-reason="${esc(b.tooltip || "")}" title="${esc(b.tooltip || "")}" class="glass-btn rounded-full px-3 py-1 text-[13px] truncate max-w-full">
          ${esc(b.label)} ${b.kind === "space" ? "↗" : "→"}
        </button>
      `).join("");
      rLinks.querySelectorAll("[data-jump-id]").forEach(btn => {
        btn.addEventListener("click", () => {
          const kind = btn.dataset.jumpKind;
          const targetId = btn.dataset.jumpId;
          const reason = btn.dataset.jumpReason || "";
          if (kind === "space") {
            setViewMode("space");
            selectSpaceMission(targetId);
            showToast(reason ? `${btn.textContent.replace(/[→↗]\s*$/, "").trim()} · ${reason}` : "1 Light-Day");
          } else {
            store.state.activeTrail = null;
            // Seed current node as walk start if this is the first hop
            const free = getFreeRoamState();
            if (!free.history.length) recordRabbitVisit(node, { pushWalk: true, reason: "" });
            selectHubNode(targetId, true, { pushWalk: true, reason });
          }
        });
      });
    } else {
      rWrap.classList.add("hidden");
    }
  }

  // Concise project links (max 2)
  const extra = document.getElementById("card-extra-chips");
  if (extra) {
    const chips = [];
    for (const p of (node.projects || []).slice(0, 2)) {
      chips.push(`<a href="${esc(p.url || node.url)}" target="_blank" rel="noopener noreferrer" class="accent-chip px-3 py-1 rounded-full text-[13px] transition truncate max-w-full inline-block">${esc(p.name)} ↗</a>`);
    }
    extra.innerHTML = chips.join("");
  }

  // Official verified links
  const linksEl = document.getElementById("card-links");
  const links = [];
  if (node.url) links.push(`<a href="${esc(node.url)}" target="_blank" rel="noopener noreferrer" class="glass-btn-active rounded-full px-3 py-1.5 text-[13px] inline-flex items-center gap-1 whitespace-nowrap">Official Site ↗</a>`);
  if (node.wiki) links.push(`<a href="${esc(node.wiki)}" target="_blank" rel="noopener noreferrer" class="accent-link px-0.5 py-1 text-[13px] whitespace-nowrap">Wikipedia ↗</a>`);
  if (node.id?.startsWith("ror-") && !String(node.url || "").includes("ror.org")) {
    links.push(`<a href="https://ror.org/${esc(node.id.slice(4))}" target="_blank" rel="noopener noreferrer" class="accent-link px-0.5 py-1 text-[13px] whitespace-nowrap">ROR ↗</a>`);
  } else if (node.id?.startsWith("oa-") && !String(node.url || "").includes("openalex.org")) {
    links.push(`<a href="https://openalex.org/${esc(node.id.slice(3))}" target="_blank" rel="noopener noreferrer" class="accent-link px-0.5 py-1 text-[13px] whitespace-nowrap">OpenAlex ↗</a>`);
  }
  const gEarth = `https://earth.google.com/web/@${node.lat},${node.lng},500a,2500d,35y,0h,45t,0r`;
  links.push(`<a href="${gEarth}" target="_blank" rel="noopener noreferrer" class="accent-link px-0.5 py-1 text-[13px] whitespace-nowrap">Google Earth ↗</a>`);
  if (linksEl) linksEl.innerHTML = links.join("");

  // Load IceCube-style Wikimedia Hero Photo + Wikipedia Brief Excerpt (200-only fallback, zero 404s)
  const reqId = loadWikipediaCardBrief(node);

  // Discipline-aware live OpenAlex papers & researchers
  const topicTerm = node.discipline === "ai_cs" ? "artificial intelligence"
    : node.discipline === "math" ? "mathematics"
    : node.discipline === "bio_med" ? "biology"
    : node.discipline === "chem_materials" ? "chemistry"
    : node.discipline === "earth_climate" ? "climate"
    : node.discipline === "engineering" ? "engineering"
    : "physics";

  const papersEl = document.getElementById("deeper-papers");
  if (papersEl) {
    papersEl.innerHTML = `<div class="text-neutral-400 text-[14px]">Loading recent papers…</div>`;
    fetch(proxyUrl(`https://api.openalex.org/works?search=${encodeURIComponent(node.name + " " + topicTerm)}&sort=publication_date:desc&per-page=3`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (reqId !== activeWikiReq) return;
        if (!data?.results?.length) {
          papersEl.innerHTML = `<div class="text-neutral-400 text-[14px]">No recent papers returned.</div>`;
          return;
        }
        papersEl.innerHTML = data.results.map(w => `
          <a href="${esc(w.doi || w.id || "https://openalex.org/")}" target="_blank" rel="noopener noreferrer" class="block rounded-2xl bg-white/[0.05] hover:bg-white/10 border border-white/10 p-3.5 transition">
            <div class="text-[14px] text-white leading-snug line-clamp-2">${esc(w.title || "Research Publication")}</div>
            <div class="text-[14px] accent-text mt-1">${esc(w.publication_year || "")} · ${(w.cited_by_count ?? 0).toLocaleString()} citations ↗</div>
          </a>
        `).join("");
      }).catch(() => {
        if (reqId === activeWikiReq) papersEl.innerHTML = `<div class="text-neutral-400 text-[14px]">Papers unavailable right now.</div>`;
      });
  }

  const authorsEl = document.getElementById("deeper-authors");
  if (authorsEl) {
    authorsEl.innerHTML = `<div class="text-neutral-400 text-[14px]">Loading researchers…</div>`;
    fetch(proxyUrl(`https://api.openalex.org/authors?search=${encodeURIComponent(node.name + " " + topicTerm)}&sort=cited_by_count:desc&per-page=3`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (reqId !== activeWikiReq) return;
        const list = data?.results || [];
        if (!list.length) {
          authorsEl.innerHTML = `<div class="text-neutral-400 text-[14px]">No indexed researchers returned.</div>`;
          return;
        }
        authorsEl.innerHTML = list.map(a => `
          <a href="${esc(a.orcid || a.id || "https://openalex.org/")}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] hover:bg-white/10 border border-white/10 px-3.5 py-2.5 transition">
            <div class="min-w-0">
              <div class="text-[14px] font-medium text-white truncate">${esc(a.display_name || "Researcher")}</div>
              <div class="text-[14px] text-neutral-400 truncate">${esc(a.last_known_institutions?.[0]?.display_name || node.name)}</div>
            </div>
            <span class="text-[14px] accent-text shrink-0">${(a.cited_by_count || 0).toLocaleString()} cites ↗</span>
          </a>
        `).join("");
      }).catch(() => {
        if (reqId === activeWikiReq) authorsEl.innerHTML = `<div class="text-neutral-400 text-[14px]">Researcher index unavailable right now.</div>`;
      });
  }
}

// =========================================================================
// SPOTLIGHT COMMAND SEARCH
// =========================================================================

let spotlightIdx = -1;

function updateSpotlightSelection() {
  const box = document.getElementById("search-dropdown");
  if (!box) return;
  const items = Array.from(box.querySelectorAll(".spot-row"));
  items.forEach((el, idx) => {
    el.classList.toggle("spotlight-item-active", idx === spotlightIdx);
    if (idx === spotlightIdx) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

async function runAgentRabbitHole(rawQuery) {
  const box = document.getElementById("search-dropdown");
  const inp = document.getElementById("search-input");
  const q = String(rawQuery || inp?.value || "").trim() || "AlphaFold";
  if (inp && !inp.value.trim()) inp.value = q;
  if (!box) return;

  const reqId = ++activeAgentReq;
  box.innerHTML = `
    <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-5 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-[14px] font-semibold text-white">Curating Official Rabbit Hole…</span>
        <span class="text-[12.5px] accent-text">Official sources only</span>
      </div>
      <p class="text-[13.5px] text-neutral-400">Gathering verified STEM labs, origin milestones, open textbooks, Wikipedia primary facts, and top-cited OpenAlex papers for <strong class="text-white">${esc(q)}</strong>…</p>
    </div>
  `;

  try {
    const result = await curateRabbitHoleNodes(q);
    if (reqId !== activeAgentReq) return;

    const nodes = result.nodes || [];
    const stops = result.trailStops || [];
    const matchedTrails = result.matchedTrails || [];

    const headerHtml = `
      <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[12.5px] accent-text font-medium">Deep Rabbit Hole · Official Reference Nodes</div>
          <div class="text-[16px] font-semibold text-white truncate mt-0.5">${esc(q)} (${nodes.length} verified nodes)</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${stops.length ? `<button type="button" id="btn-agent-start-trail" class="glass-btn-active rounded-full px-3.5 py-1.5 text-[13px] cursor-pointer">Start Trail on Globe →</button>` : ""}
          <button type="button" id="btn-agent-back" class="glass-btn rounded-full px-3 py-1.5 text-[13px] cursor-pointer">Back</button>
        </div>
      </div>
    `;

    const nodesHtml = nodes.length ? nodes.map((n, i) => `
      <article class="agent-node-card space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[12px] font-medium accent-text">${i + 1}. ${esc(n.badge)}</div>
            <div class="text-[15px] font-semibold text-white leading-snug mt-0.5">${esc(n.title)}</div>
            ${n.subtitle ? `<div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(n.subtitle)}</div>` : ""}
          </div>
          ${n.image ? `<img src="${esc(proxyUrl(n.image))}" alt="" class="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10" />` : ""}
        </div>
        ${n.funFact ? `<p class="text-[13.5px] text-neutral-300 leading-relaxed">${esc(n.funFact)}</p>` : ""}
        <div class="flex flex-wrap items-center gap-2.5 pt-0.5">
          ${n.kind === "hub" ? `<button type="button" data-agent-hub="${esc(n.hubId)}" class="glass-btn rounded-full px-3 py-1 text-[12.5px]">Fly on Globe →</button>` : ""}
          ${n.kind === "timeline" ? `<button type="button" data-agent-ev="${esc(n.eventId)}" data-agent-year="${esc(n.year)}" class="glass-btn rounded-full px-3 py-1 text-[12.5px]">Open on Timeline →</button>` : ""}
          ${n.kind === "space" ? `<button type="button" data-agent-space="${esc(n.missionId)}" class="glass-btn rounded-full px-3 py-1 text-[12.5px]">Open in 1 Light-Day →</button>` : ""}
          ${n.officialUrl ? `<a href="${esc(n.officialUrl)}" target="_blank" rel="noopener noreferrer" class="accent-link text-[13px]">Official Source ↗</a>` : ""}
          ${n.wikiUrl && n.wikiUrl !== n.officialUrl ? `<a href="${esc(n.wikiUrl)}" target="_blank" rel="noopener noreferrer" class="accent-link text-[13px]">Wikipedia ↗</a>` : ""}
        </div>
      </article>
    `).join("") : `
      <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-5 text-center text-[14px] text-neutral-400">
        No official nodes found for "${esc(q)}". Try a broader topic such as <strong class="text-white">CRISPR</strong>, <strong class="text-white">Quantum Error Correction</strong>, or <strong class="text-white">Langlands</strong>.
      </div>
    `;

    const trailsHtml = matchedTrails.length ? `
      <div class="pt-2 space-y-2">
        <div class="section-label px-1">Matching Curated Journeys</div>
        ${matchedTrails.map(tr => `
          <button type="button" data-agent-curated-trail="${esc(tr.id)}" class="glass-row w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[14px] font-semibold text-white truncate">${esc(tr.title)}</div>
              <div class="text-[12.5px] text-neutral-400 truncate mt-0.5">${esc(tr.tagline)} · ${(tr.stops || []).length} stops</div>
            </div>
            <span class="accent-text text-[13px] shrink-0">Start Trail →</span>
          </button>
        `).join("")}
      </div>
    ` : "";

    box.innerHTML = `<div class="space-y-2.5">${headerHtml}${nodesHtml}${trailsHtml}</div>`;

    box.querySelector("#btn-agent-back")?.addEventListener("click", () => renderSearchDropdown(q));
    box.querySelector("#btn-agent-start-trail")?.addEventListener("click", () => {
      closeSpotlight();
      startRabbitTrail({
        id: `agent-${Date.now()}`,
        title: `Rabbit Hole: ${q}`,
        tagline: `Curated official STEM trail for ${q}`,
        stops
      }, 0);
    });
    box.querySelectorAll("[data-agent-hub]").forEach(btn => {
      btn.addEventListener("click", () => {
        closeSpotlight();
        selectHubNode(btn.dataset.agentHub, true);
      });
    });
    box.querySelectorAll("[data-agent-ev]").forEach(btn => {
      btn.addEventListener("click", () => {
        closeSpotlight();
        setTimeMode(true, Number(btn.dataset.agentYear));
        selectHubNode(`tl-${btn.dataset.agentEv}`, true);
      });
    });
    box.querySelectorAll("[data-agent-space]").forEach(btn => {
      btn.addEventListener("click", () => {
        closeSpotlight();
        setViewMode("space");
        selectSpaceMission(btn.dataset.agentSpace);
      });
    });
    box.querySelectorAll("[data-agent-curated-trail]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tr = store.rabbitTrails.find(t => t.id === btn.dataset.agentCuratedTrail);
        if (tr) {
          closeSpotlight();
          startRabbitTrail(tr, 0);
        }
      });
    });
  } catch {
    if (reqId === activeAgentReq) {
      box.innerHTML = `<div class="px-4 py-6 text-center text-[14px] accent-text">Could not complete deep rabbit-hole curation right now.</div>`;
    }
  }
}

function renderSearchDropdown(query) {
  const box = document.getElementById("search-dropdown");
  if (!box) return;
  const q = (query || "").trim();
  const parts = [];
  spotlightIdx = -1;

  if (!q) {
    parts.push(`
      <div class="px-2 pb-2 space-y-2.5">
        <div class="section-label">Jump straight to</div>
        <div class="flex flex-wrap gap-1.5">
          <button type="button" data-pick-sr="AS0202" class="accent-chip rounded-full px-3 py-1.5 text-[13.5px] cursor-pointer">ShanghaiRanking 2026 · Semiconductors / EEE</button>
          <button type="button" data-pick-sr="ARWU" class="glass-btn rounded-full px-3 py-1.5 text-[13.5px] cursor-pointer">ARWU 2026 Top 1,000</button>
          ${["CERN", "ASML", "imec", "DeepMind", "Broad Institute", "Voyager 1", "ITER"].map(tag => `
            <button type="button" data-spot-chip="${esc(tag)}" class="glass-btn rounded-full px-3 py-1.5 text-[13.5px]">${esc(tag)}</button>
          `).join("")}
        </div>
      </div>
    `);
  } else {
    parts.push(`
      <button type="button" id="btn-spot-curate-inline" class="w-full text-left rounded-2xl px-4 py-3 bg-[rgba(160,70,70,0.14)] hover:bg-[rgba(160,70,70,0.22)] border border-[rgba(160,70,70,0.42)] transition flex items-center justify-between gap-3 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[14px] font-semibold text-white truncate">Curate Rabbit Hole for “${esc(q)}”</div>
          <div class="text-[12.5px] text-neutral-300 truncate mt-0.5">Official STEM nodes, landmark papers, Wikipedia facts &amp; trail hops — no filler report</div>
        </div>
        <span class="accent-text text-[13px] font-semibold shrink-0">Curate →</span>
      </button>
    `);

    // Match official ShanghaiRanking 2026 subjects (including semiconductor/chip aliases!)
    const sh = getShanghaiState();
    if (sh.loaded) {
      const ql = q.toLowerCase();
      const isSemiQuery = /semiconductor|chip|lithograph|euv|vlsi|photonic|fab|microelectron/i.test(ql);
      const isShanghaiQuery = /shanghai|arwu|gras|rank/i.test(ql);
      const matchedSubjs = sh.subjects.filter(s => {
        if (s.name.toLowerCase().includes(ql) || s.category.toLowerCase().includes(ql)) return true;
        if (isSemiQuery && ["AS0202", "AS0214", "AS0206", "AS0207"].includes(s.code)) return true;
        return false;
      }).slice(0, 4);

      if (isShanghaiQuery || matchedSubjs.length) {
        parts.push(`<div class="section-label px-2 pt-2 pb-1">ShanghaiRanking 2026 Subject Rankings</div>`);
        if (isShanghaiQuery) {
          parts.push(`
            <button type="button" data-pick-sr="ARWU" class="spot-row pick-sr w-full text-left px-4 py-3 rounded-2xl border border-transparent hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
              <div class="min-w-0">
                <div class="text-[14.5px] font-medium text-white truncate">ARWU 2026 — Academic Ranking of World Universities</div>
                <div class="text-[13px] text-neutral-400 truncate mt-0.5">All 1,000 ranked universities · 6 official indicators</div>
              </div>
              <span class="text-[13px] accent-text font-medium shrink-0">Open Table →</span>
            </button>
          `);
        }
        parts.push(matchedSubjs.map(s => `
          <button type="button" data-pick-sr="${esc(s.code)}" class="spot-row pick-sr w-full text-left px-4 py-3 rounded-2xl border border-transparent hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
            <div class="min-w-0">
              <div class="text-[14.5px] font-medium text-white truncate">GRAS 2026 · ${esc(s.name)}</div>
              <div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(s.category)} · ${s.count} ranked universities</div>
            </div>
            <span class="text-[13px] accent-text font-medium shrink-0">Rankings →</span>
          </button>
        `).join(""));
      }
    }
  }

  const { hubs, events, missions, subdomains, trails } = universalSearch(q, 8);

  if (trails?.length) {
    parts.push(`<div class="section-label px-2 pt-2 pb-1">Curated STEM Rabbit Hole Journeys</div>`);
    parts.push(trails.map(t => `
      <button type="button" data-pick-trail="${esc(t.id)}" class="spot-row pick-trail w-full text-left px-4 py-3 rounded-2xl border border-transparent hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[14.5px] font-medium text-white truncate">${esc(t.title)}</div>
          <div class="text-[13px] text-neutral-400 truncate mt-0.5">${esc(t.tagline)} · ${(t.stops || []).length} stops</div>
        </div>
        <span class="text-[13px] accent-text font-medium shrink-0">Start Trail →</span>
      </button>
    `).join(""));
  }

  const formatEntityBadge = (h) => {
    const disc = STEM_DISCIPLINES.find(d => d.id === h.discipline)?.short;
    if (disc && h.discipline !== "physics") return disc;
    return ({
      lab: "Lab",
      uni: "University",
      startup: "Startup",
      company: "Company",
      institute: "Institute",
      project: "Project",
      history: "History"
    }[h.entityType] || "Hub");
  };

  if (hubs.length) {
    parts.push(`<div class="section-label px-2 pt-2 pb-1">Institutions &amp; Labs (Ranked by Impact)</div>`);
    parts.push(hubs.map(h => `
      <button type="button" data-pick-hub="${esc(h.id)}" class="spot-row pick-hub w-full text-left px-4 py-3 rounded-2xl border border-transparent hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[15px] font-medium text-white truncate">${esc(h.name)}</div>
          <div class="text-[13.5px] text-neutral-400 truncate mt-0.5">${esc(h.city)}${h.sector ? " · " + esc(h.sector) : ""}</div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${h.impactScore ? `<span class="text-[12px] px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-300 tabular-nums">${h.impactScore}</span>` : ""}
          <span class="text-[13px] px-2.5 py-0.5 rounded-full bg-white/[0.08] text-neutral-300">${esc(formatEntityBadge(h))}</span>
        </div>
      </button>
    `).join(""));
  }

  if (events.length) {
    parts.push(`<div class="section-label px-2 pt-3 pb-1">Timeline</div>`);
    parts.push(events.map(ev => `
      <button type="button" data-pick-ev="${esc(ev.id)}" data-ev-year="${ev.year}" class="spot-row pick-ev w-full text-left px-4 py-3 rounded-2xl border border-transparent hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[15px] font-medium text-white truncate">${esc(ev.title)}</div>
          <div class="text-[13.5px] text-neutral-400 truncate mt-0.5">${esc(ev.figure)} · ${esc(ev.location)}</div>
        </div>
        <span class="text-[13.5px] accent-text font-medium shrink-0">${formatYear(ev.year)}</span>
      </button>
    `).join(""));
  }

  if (missions.length) {
    parts.push(`<div class="section-label px-2 pt-3 pb-1">Space Frontier</div>`);
    parts.push(missions.map(m => `
      <button type="button" data-pick-mission="${esc(m.id)}" class="spot-row pick-mission w-full text-left px-4 py-3 rounded-2xl border border-transparent hover:bg-white/10 transition flex items-center justify-between gap-3 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[15px] font-medium text-white truncate">${esc(m.name)}</div>
          <div class="text-[13.5px] text-neutral-400 truncate mt-0.5">${esc(m.body)} · ${esc(m.agency)}</div>
        </div>
        <span class="text-[13.5px] accent-text shrink-0">${esc(m.lightTimeLabel.split(" (")[0])}</span>
      </button>
    `).join(""));
  }

  if (subdomains.length) {
    parts.push(`<div class="section-label px-2 pt-3 pb-1">Domains &amp; Open Materials</div>`);
    parts.push(subdomains.map(s => `
      <button type="button" data-pick-sub="${esc(s.domainId)}" class="spot-row pick-sub w-full text-left px-4 py-3 rounded-2xl border border-transparent hover:bg-white/10 transition cursor-pointer">
        <div class="text-[15px] font-medium text-white truncate">${esc(s.name)}</div>
        <div class="text-[13.5px] text-neutral-400 truncate mt-0.5">${esc(s.domainName)}</div>
      </button>
    `).join(""));
  }

  if (q && !hubs.length && !events.length && !missions.length && !subdomains.length && !trails?.length) {
    parts.push(`<div class="px-4 py-5 text-center text-[14.5px] text-neutral-400">No local matches. Click <strong class="text-white">Curate Trail</strong> or <strong class="text-white">Live Registry</strong> above to search official global sources.</div>`);
  }

  box.innerHTML = parts.join("");

  if (q) {
    const firstRow = box.querySelector(".spot-row");
    if (firstRow) {
      spotlightIdx = 0;
      updateSpotlightSelection();
    }
  }

  box.querySelector("#btn-spot-curate-inline")?.addEventListener("click", () => runAgentRabbitHole(q));

  box.querySelectorAll("[data-spot-chip]").forEach(btn => {
    btn.addEventListener("click", () => {
      const inp = document.getElementById("search-input");
      if (inp) { inp.value = btn.dataset.spotChip; inp.focus(); }
      renderSearchDropdown(btn.dataset.spotChip);
    });
  });
  box.querySelectorAll(".pick-trail").forEach(btn => {
    btn.addEventListener("click", () => {
      const tr = store.rabbitTrails.find(t => t.id === btn.dataset.pickTrail);
      if (tr) {
        closeSpotlight();
        startRabbitTrail(tr, 0);
      }
    });
  });
  box.querySelectorAll(".pick-hub").forEach(btn => {
    btn.addEventListener("click", () => {
      closeSpotlight();
      selectHubNode(btn.dataset.pickHub, true);
    });
  });
  box.querySelectorAll(".pick-ev").forEach(btn => {
    btn.addEventListener("click", () => {
      closeSpotlight();
      setTimeMode(true, Number(btn.dataset.evYear));
      selectHubNode(`tl-${btn.dataset.pickEv}`, true);
    });
  });
  box.querySelectorAll(".pick-mission").forEach(btn => {
    btn.addEventListener("click", () => {
      closeSpotlight();
      setViewMode("space");
      selectSpaceMission(btn.dataset.pickMission);
    });
  });
  box.querySelectorAll(".pick-sub").forEach(btn => {
    btn.addEventListener("click", () => {
      closeSpotlight();
      openModal("domains", btn.dataset.pickSub);
    });
  });
  box.querySelectorAll("[data-pick-sr]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeSpotlight();
      openModal("rankings", btn.dataset.pickSr);
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
  clearExploreDockActive();
  if (mode === "domains" || mode === "rankings") document.getElementById("btn-open-domains")?.classList.add("glass-btn-active");
  if (mode === "countries") document.getElementById("btn-open-countries")?.classList.add("glass-btn-active");
  if (mode === "pathways" || mode === "account" || mode === "offline") {
    document.getElementById("btn-open-pathways")?.classList.add("glass-btn-active");
  }
  const titles = {
    domains: "STEM Domains, Trails & Open Materials",
    rankings: "ShanghaiRanking 2026 (ARWU & 57 GRAS Subjects)",
    countries: "Countries & Continents",
    live: "Live Open-Science Registry Search",
    offline: "Offline Packages (Organic Maps Style)",
    pathways: "Bookmarks & Account",
    account: "Bookmarks & Account",
    submit: "Submit Missing Institution",
    shortcuts: "Keyboard Shortcuts",
    audit: "Verification & Open Data"
  };
  titleEl.textContent = titles[mode] || "Explore";

  if (mode === "domains") renderDomainsModal(bodyEl, focusId);
  if (mode === "rankings") {
    renderRankingsModal(bodyEl, focusId, {
      onSelectHub: (hubId, subjectCode) => {
        closeModal();
        if (subjectCode && subjectCode !== "all") {
          store.state.shanghaiSubject = subjectCode;
          store.state.sortBy = "shanghai";
          syncGlobeMarkers();
          updateActiveFiltersPill();
        }
        selectHubNode(hubId, true);
      },
      onMapSubjectOnGlobe: (subjectCode, country) => {
        closeModal();
        if (store.state.viewMode === "space") setViewMode("earth");
        store.state.discipline = "all";
        store.state.branch = "all";
        store.state.shanghaiSubject = subjectCode || "ARWU";
        store.state.countryFilter = country || "all";
        store.state.sortBy = "shanghai";
        syncGlobeMarkers();
        updateActiveFiltersPill();
        const topHub = getFilteredHubs()[0];
        if (topHub) flyToHub(topHub, country && country !== "all" ? 4.8 : 2.5);
        const sMeta = subjectCode === "ARWU" ? "ARWU 2026 Top 1,000" : (getSubjectMeta(subjectCode)?.name || subjectCode);
        showToast(`Mapped ShanghaiRanking 2026: ${sMeta}`);
      }
    });
  }
  if (mode === "countries") renderCountriesModal(bodyEl);
  if (mode === "live") renderLiveSearchModal(bodyEl);
  if (mode === "offline") renderOfflinePacksModal(bodyEl);
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
      onOpenOffline: () => openModal("offline"),
      onOpenSubmit: () => openModal("submit"),
      onOpenAudit: () => openModal("audit"),
      onOpenShortcuts: () => openModal("shortcuts"),
      onCloseModal: closeModal,
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

// =========================================================================
// ORGANIC-MAPS-STYLE OFFLINE PACKS MANAGER (IndexedDB + Cache Storage)
// =========================================================================

function refreshOfflinePackBadge() {
  const badge = document.getElementById("offline-pack-count");
  if (!badge) return;
  const stats = getOfflineStorageStats();
  if (stats.packCount > 0) {
    badge.textContent = String(stats.packCount);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

async function renderOfflinePacksModal(bodyEl) {
  bodyEl.innerHTML = `<div class="py-8 text-center text-[14px] text-neutral-400">Loading offline package catalog…</div>`;
  const manifest = await fetchPackManifest();
  const packs = manifest?.packs || [];
  const activeDownloads = new Map(); // packId -> pct

  const render = () => {
    const installedIds = getDownloadedPackIds();
    const installedMeta = getDownloadedPackMeta();
    const stats = getOfflineStorageStats();
    refreshOfflinePackBadge();

    const groups = [
      { key: "tiles", title: "Base Offline Earth Map", desc: "Bundled NASA Blue Marble globe tiles (z0–z2) cached for 100% airplane-mode globe rendering." },
      { key: "discipline", title: "STEM Discipline Packages", desc: "Download individual sciences with curated hubs, timelines, domains, and rabbit-hole trails." },
      { key: "region", title: "Continent & Region Packages", desc: "Download regional hub indexes by continent for fast offline travel and research." }
    ];

    const renderPackRow = (p) => {
      const installed = installedIds.has(p.id);
      const meta = installedMeta[p.id];
      const pct = activeDownloads.get(p.id);
      const isDownloading = pct !== undefined;
      const counts = p.counts || {};
      const statParts = [];
      if (counts.hubs) statParts.push(`${counts.hubs.toLocaleString()} hubs`);
      if (counts.events) statParts.push(`${counts.events} milestones`);
      if (counts.missions) statParts.push(`${counts.missions} space missions`);
      if (counts.trails) statParts.push(`${counts.trails} trails`);
      if (counts.tiles) statParts.push(`${counts.tiles} Earth tiles`);

      return `
        <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-2">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center flex-wrap gap-2">
                <span class="text-[15px] font-semibold text-white">${esc(p.name)}</span>
                <span class="text-[12px] px-2 py-0.5 rounded-full bg-white/[0.07] text-neutral-300 tabular-nums">${esc(p.sizeLabel || formatBytes(p.sizeBytes))}</span>
                ${installed ? `<span class="text-[12px] accent-text font-medium">✓ Installed</span>` : ""}
              </div>
              <div class="text-[13px] text-neutral-400 mt-0.5">${esc(p.description || "")}</div>
              ${statParts.length ? `<div class="text-[12px] text-neutral-500 mt-1">${esc(statParts.join(" · "))}${meta?.downloadedAt ? ` · Saved ${new Date(meta.downloadedAt).toLocaleDateString()}` : ""}</div>` : ""}
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              ${isDownloading ? `
                <span class="text-[13px] accent-text font-medium tabular-nums px-2">${pct}%</span>
              ` : installed ? `
                <button type="button" data-pack-export="${esc(p.id)}" class="glass-btn rounded-full px-3 py-1.5 text-[12.5px]" title="Export portable .json bundle">Export</button>
                <button type="button" data-pack-delete="${esc(p.id)}" class="accent-chip rounded-full px-3 py-1.5 text-[12.5px]">Delete</button>
              ` : `
                <button type="button" data-pack-download="${esc(p.id)}" class="glass-btn-active rounded-full px-3.5 py-1.5 text-[13px]">Download</button>
              `}
            </div>
          </div>
          ${isDownloading ? `
            <div class="offline-progress-track"><div class="offline-progress-fill" style="width:${Math.max(4, pct)}%"></div></div>
          ` : ""}
        </div>
      `;
    };

    bodyEl.innerHTML = `
      <div class="space-y-5">
        <div class="rounded-2xl bg-white/[0.045] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-0.5">
            <div class="text-[15px] font-semibold text-white">Local Offline Storage</div>
            <div class="text-[13.5px] text-neutral-400">
              <strong class="text-white">${stats.packCount}</strong> of ${packs.length} packages installed · <strong class="text-white">${esc(stats.totalLabel)}</strong> on device · SHA-256 verified
            </div>
          </div>
          <span class="text-[12.5px] px-3 py-1 rounded-full bg-white/[0.07] text-neutral-200">${navigator.onLine ? "Online · Ready to sync" : "Offline Mode Active"}</span>
        </div>
        ${groups.map(g => {
          const items = packs.filter(p => p.category === g.key);
          if (!items.length) return "";
          return `
            <div class="space-y-2.5">
              <div>
                <div class="section-label">${esc(g.title)}</div>
                <div class="text-[12.5px] text-neutral-500 mt-0.5">${esc(g.desc)}</div>
              </div>
              <div class="space-y-2">${items.map(renderPackRow).join("")}</div>
            </div>
          `;
        }).join("") || `<div class="text-center py-6 text-[14px] text-neutral-400">No offline package manifest available.</div>`}
      </div>
    `;

    bodyEl.querySelectorAll("[data-pack-download]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const packId = btn.dataset.packDownload;
        const packMeta = packs.find(x => x.id === packId);
        if (!packMeta) return;
        activeDownloads.set(packId, 5);
        render();
        try {
          const payload = await downloadPack(packMeta, (pct) => {
            activeDownloads.set(packId, pct);
            render();
          });
          activeDownloads.delete(packId);
          if (payload && packMeta.category !== "tiles") {
            mergeOfflinePackPayload(payload);
            syncGlobeMarkers();
            if (isFilterPopoverOpen()) renderFilterPopover();
          }
          render();
          showToast(`Installed offline: ${packMeta.name}`);
        } catch (err) {
          activeDownloads.delete(packId);
          render();
          showToast(err?.message || `Download failed for ${packMeta.name}`);
        }
      });
    });

    bodyEl.querySelectorAll("[data-pack-delete]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const packId = btn.dataset.packDelete;
        await deletePack(packId);
        render();
        showToast("Removed offline package");
      });
    });

    bodyEl.querySelectorAll("[data-pack-export]").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await exportPackToFile(btn.dataset.packExport);
          showToast(`Exported world-stem-${btn.dataset.packExport}.json`);
        } catch (err) {
          showToast(err?.message || "Export failed");
        }
      });
    });
  };

  render();
}

function renderDomainsModal(bodyEl, focusDomainId = null, focusDiscipline = null) {
  const curDisc = focusDiscipline || (store.state.discipline !== "all" ? store.state.discipline : "all");
  const activeDomain = focusDomainId || (
    store.domains.some(d => d.id === curDisc) ? curDisc
    : store.state.branch !== "all" && store.domains.some(d => d.id === store.state.branch) ? store.state.branch
    : (store.domains[0]?.id || "particle")
  );

  const discPills = STEM_DISCIPLINES.map(d => {
    const isAct = curDisc === d.id;
    return `
      <button type="button" data-dom-disc="${esc(d.id)}" class="px-3.5 py-1.5 rounded-full text-[13.5px] whitespace-nowrap transition ${isAct ? "glass-btn-active" : "glass-btn"}">
        ${esc(d.short)}
      </button>
    `;
  }).join("");

  const visibleBranches = curDisc === "all"
    ? PHYSICS_BRANCHES.filter(b => ALL_STEM_FEATURED_BRANCHES.includes(b.id) || store.state.branch === b.id)
    : PHYSICS_BRANCHES.filter(b => b.id === "all" || b.disc === curDisc);

  const branchPills = visibleBranches.map(b => {
    const isAct = store.state.branch === b.id && (b.id !== "all" || store.state.discipline === curDisc);
    return `
      <button type="button" data-filter-branch="${esc(b.id)}" data-filter-disc="${esc(b.disc || "all")}" class="branch-pill px-3 py-1 rounded-full text-[13px] whitespace-nowrap transition ${isAct ? "glass-btn-active" : "glass-btn"}">
        ${esc(BRANCH_SHORT_LABELS[b.id] || b.label)}
      </button>
    `;
  }).join("");

  const domainTabs = store.domains.map(d => `
    <button type="button" data-dom-tab="${esc(d.id)}" class="dom-tab px-3.5 py-1.5 rounded-xl text-[13.5px] whitespace-nowrap transition ${d.id === activeDomain ? "glass-row-active font-medium" : "glass-row"}">
      ${esc(d.name.split(",")[0].split(" &")[0])}
    </button>
  `).join("");

  const selectedDom = store.domains.find(d => d.id === activeDomain) || store.domains[0];
  const subCards = (selectedDom?.subdomains || []).map(sub => `
    <details class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 group" open>
      <summary class="cursor-pointer list-none flex items-center justify-between gap-3">
        <div>
          <div class="text-[15px] font-semibold text-white">${esc(sub.name)}</div>
          <p class="text-[14px] text-neutral-400 mt-0.5 leading-relaxed">${esc(sub.summary)}</p>
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
                      <div class="text-[14px] accent-text truncate">${esc(m.provider)} · ${esc(m.type)} ↗</div>
                    </a>
                    <button type="button" data-save-mat="${esc(matId)}" data-mat-title="${esc(m.title)}" data-mat-sub="${esc(m.provider + " · " + sub.name)}" data-mat-url="${esc(m.url)}" class="px-3 py-1 rounded-full text-[13.5px] shrink-0 transition ${saved ? "glass-btn-active" : "glass-btn"}">
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
                <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="accent-chip px-3 py-1.5 rounded-full text-[13.5px]">
                  ${esc(p.name)} ↗
                </a>
              `).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    </details>
  `).join("");

  const trailsHtml = store.rabbitTrails?.length ? `
    <div class="space-y-2.5">
      <div class="section-label">Curated Cross-STEM Journeys (${store.rabbitTrails.length})</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${store.rabbitTrails.map(tr => `
          <button type="button" data-dom-trail="${esc(tr.id)}" class="glass-row text-left rounded-2xl p-3.5 space-y-1 transition">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[14px] font-semibold text-white truncate">${esc(tr.title)}</span>
              <span class="text-[12px] accent-text shrink-0">${(tr.stops || []).length} stops →</span>
            </div>
            <div class="text-[12.5px] text-neutral-400 line-clamp-2">${esc(tr.tagline)}</div>
          </button>
        `).join("")}
      </div>
    </div>
  ` : "";

  bodyEl.innerHTML = `
    <div class="space-y-5">
      <button type="button" id="btn-dom-open-rankings" class="glass-row w-full text-left rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer border border-[rgba(160,70,70,0.38)] bg-[rgba(160,70,70,0.10)]">
        <div class="min-w-0">
          <div class="text-[14.5px] font-semibold text-white">ShanghaiRanking 2026 — ARWU &amp; 57 Subject Rankings</div>
          <div class="text-[12.5px] text-neutral-300 mt-0.5">Explore all 1,972 ranked universities by subject (Semiconductors/EEE, AI, Robotics, Aerospace, Physics &amp; more) + nearby labs &amp; collabs</div>
        </div>
        <span class="accent-chip rounded-full px-3 py-1.5 text-[12.5px] font-medium shrink-0">Open Rankings →</span>
      </button>
      <div class="space-y-2.5">
        <div class="section-label">Filter Globe by Discipline &amp; Branch</div>
        <div class="flex flex-wrap gap-1.5">${discPills}</div>
        <div class="flex flex-wrap gap-1.5 pt-1">${branchPills}</div>
      </div>
      <div class="border-t border-white/10 pt-4 space-y-3.5">
        <div class="section-label">Open Courses, Books &amp; Frontier Projects</div>
        <div class="flex flex-wrap gap-1.5">${domainTabs}</div>
        <div class="space-y-3">${subCards || '<div class="text-neutral-400 text-[14px]">Loading domains…</div>'}</div>
      </div>
      ${trailsHtml ? `<div class="border-t border-white/10 pt-4">${trailsHtml}</div>` : ""}
    </div>
  `;

  bodyEl.querySelector("#btn-dom-open-rankings")?.addEventListener("click", () => {
    openModal("rankings");
  });

  bodyEl.querySelectorAll("[data-dom-trail]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tr = store.rabbitTrails.find(t => t.id === btn.dataset.domTrail);
      if (tr) {
        closeModal();
        startRabbitTrail(tr, 0);
      }
    });
  });

  bodyEl.querySelectorAll("[data-dom-disc]").forEach(btn => {
    btn.addEventListener("click", () => {
      const disc = btn.dataset.domDisc;
      store.state.discipline = disc;
      store.state.branch = "all";
      updateActiveFiltersPill();
      syncGlobeMarkers();
      const matchDom = store.domains.find(d => d.id === disc)?.id || activeDomain;
      renderDomainsModal(bodyEl, matchDom, disc);
    });
  });

  bodyEl.querySelectorAll(".branch-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const br = btn.dataset.filterBranch;
      const bDisc = btn.dataset.filterDisc;
      store.state.branch = br;
      if (br !== "all" && bDisc && bDisc !== "all") store.state.discipline = bDisc;
      updateActiveFiltersPill();
      syncGlobeMarkers();
      const nextDom = store.domains.find(d => d.id === br || d.id === bDisc)?.id || activeDomain;
      renderDomainsModal(bodyEl, nextDom, store.state.discipline);
      showToast(BRANCH_SHORT_LABELS[br] || br);
    });
  });
  bodyEl.querySelectorAll(".dom-tab").forEach(btn => {
    btn.addEventListener("click", () => renderDomainsModal(bodyEl, btn.dataset.domTab, curDisc));
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
      btn.className = `px-3 py-1 rounded-full text-[14px] shrink-0 transition ${saved ? "glass-btn-active" : "glass-btn"}`;
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

  const companies = store.hubs.filter(h => h.group === "company" || h.entityType === "company" || h.entityType === "startup");

  const render = () => {
    const headerTabs = `
      <div class="flex items-center justify-between gap-2 pb-4 border-b border-white/10">
        <div class="flex items-center gap-2">
          <button type="button" data-ctab="regions" class="px-4 py-1.5 rounded-full text-[13.5px] whitespace-nowrap transition ${tab === "regions" ? "glass-btn-active" : "glass-btn"}">Countries</button>
          <button type="button" data-ctab="private" class="px-4 py-1.5 rounded-full text-[13.5px] whitespace-nowrap transition ${tab === "private" ? "glass-btn-active" : "glass-btn"}">Startups</button>
        </div>
        ${store.state.countryFilter !== "all" ? `<button type="button" id="btn-clear-country" class="accent-link text-[13.5px] bg-transparent border-0 cursor-pointer shrink-0">Reset</button>` : ""}
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
              <button type="button" data-cont="${esc(ct.id)}" class="px-3.5 py-1.5 rounded-full text-[14px] transition ${selectedContinent === ct.id ? "glass-btn-active" : "glass-btn"}">
                ${esc(ct.label)}
              </button>
            `).join("")}
          </div>
          ${selectedContinent !== "all" && activeContObj ? `
            <div class="flex items-center justify-between rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-2.5">
              <span class="text-[14px] text-neutral-200">${esc(activeContObj.label)}</span>
              <button type="button" id="btn-fly-continent" class="accent-link text-[14px] font-medium bg-transparent border-0 cursor-pointer">Center globe on ${esc(activeContObj.label)} →</button>
            </div>
          ` : ""}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[310px] scroll-clean pr-1">
            ${filtered.map(c => {
              const act = store.state.countryFilter === c.name;
              return `
                <button type="button" data-country="${esc(c.name)}" class="country-btn rounded-xl px-4 py-2.5 text-left text-[14px] flex items-center justify-between gap-2 transition ${act ? "glass-row-active font-medium" : "glass-row"}">
                  <span class="truncate">${esc(c.name)}</span>
                  <span class="text-[14px] ${act ? "text-black/60" : "text-neutral-500"} shrink-0">${c.count}</span>
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
            <input id="comp-search-input" type="text" value="${esc(query)}" placeholder="Search companies, startups, or sectors…" class="glass-input" />
            <button type="button" id="btn-filter-companies" class="glass-btn rounded-full px-4 py-2.5 text-[14px] whitespace-nowrap shrink-0">Show on Globe</button>
          </div>
          <div class="space-y-2 max-h-[340px] scroll-clean pr-1">
            ${filteredComp.slice(0, 60).map(c => `
              <button type="button" data-pick-comp="${esc(c.id)}" class="comp-row glass-row w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[14px] font-medium text-white truncate">${esc(c.name)}</div>
                  <div class="text-[14px] text-neutral-400 truncate mt-0.5">${esc(c.city)}${c.sector ? " · " + esc(c.sector) : ""}</div>
                </div>
                <span class="text-[14px] accent-text shrink-0">${esc(c.entityType)}</span>
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
          <button type="button" data-quick="${esc(tag)}" class="live-quick glass-btn rounded-full px-3.5 py-1.5 text-[14px]">${esc(tag)}</button>
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
            <div class="text-[14px] font-medium text-white truncate">${esc(it.name)}</div>
            <div class="text-[14px] text-neutral-400 truncate mt-0.5">${esc(it.city)} · ${esc(it.sourceApi)}</div>
          </div>
          <span class="text-[14px] accent-text shrink-0">Locate →</span>
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
        <div class="text-[15px] font-semibold text-white">Verified Open-Science Ledger</div>
        <p class="leading-relaxed">All institutions, milestones, and space missions link directly to official primary registries (OpenAlex, ROR v2, INSPIRE-HEP, NASA/ESA, Wikimedia).</p>
        <div class="text-[14px] text-neutral-400">Schema errors: <strong class="text-white">${s.schemaErrorsCount ?? 0}</strong> · Live link pass: <strong class="text-white">${esc(passRate)}</strong></div>
        <div class="flex flex-wrap gap-3 pt-1 text-[14px]">
          <a href="./data/provenance_ledger.json" target="_blank" rel="noopener noreferrer" class="accent-link">Provenance Ledger ↗</a>
          <a href="./data/physalts_schema.json" target="_blank" rel="noopener noreferrer" class="accent-link">JSON Schema ↗</a>
          <a href="./data/verification_report.json" target="_blank" rel="noopener noreferrer" class="accent-link">Audit Report ↗</a>
          <a href="./about.html" class="accent-link">Methodology ↗</a>
        </div>
      </div>

      <div class="space-y-2.5">
        <div class="section-label">Export Open Dataset</div>
        <div class="flex flex-wrap gap-2.5">
          <button type="button" id="btn-exp-json" class="glass-btn rounded-full px-4 py-2 text-[14px]">Dataset .JSON</button>
          <button type="button" id="btn-exp-kml" class="glass-btn rounded-full px-4 py-2 text-[14px]">Google Earth .KML</button>
          <button type="button" id="btn-exp-csv" class="glass-btn rounded-full px-4 py-2 text-[14px]">Spreadsheet .CSV</button>
        </div>
      </div>

      <div class="border-t border-white/10 pt-4 space-y-3">
        <div class="text-[15px] font-semibold text-white">Privacy &amp; GDPR Controls</div>
        <div class="flex flex-wrap items-center gap-2.5">
          <button type="button" id="btn-gdpr-export" class="glass-btn rounded-full px-4 py-2 text-[14px]">Export My Data (Art. 20)</button>
          <button type="button" id="btn-gdpr-erase" class="accent-chip rounded-full px-4 py-2 text-[14px]">Erase Local Data (Art. 17)</button>
          <a href="./privacy.html" class="accent-link text-[14px] px-2">Privacy Policy ↗</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-exp-json")?.addEventListener("click", () => {
    downloadBlob(JSON.stringify({
      meta: { name: "PhysALT Dataset", exportedAt: new Date().toISOString() },
      hubs: store.hubs,
      timelineEvents: store.timelineEvents,
      spaceMissions: store.spaceMissions
    }, null, 2), "physalt_dataset.json", "application/json");
    showToast("Exported physalt_dataset.json");
  });

  document.getElementById("btn-exp-kml")?.addEventListener("click", () => {
    const nodes = getVisibleGlobeNodes();
    const marks = nodes.map(n => `\n    <Placemark><name>${esc(n.name)}</name><description>${esc(n.summary)}</description><Point><coordinates>${n.lng},${n.lat},0</coordinates></Point></Placemark>`).join("");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>PhysALT</name>${marks}\n</Document></kml>`;
    downloadBlob(kml, "physalt.kml", "application/vnd.google-earth.kml+xml");
    showToast("Exported physalt.kml");
  });

  document.getElementById("btn-exp-csv")?.addEventListener("click", () => {
    const header = "name,city,country,entityType,branch,lat,lng,url";
    const rows = store.hubs.map(h => [h.name, h.city, h.country, h.entityType, h.branch, h.lat, h.lng, h.url].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
    downloadBlob([header, ...rows].join("\n"), "physalt_hubs.csv", "text/csv");
    showToast("Exported physalt_hubs.csv");
  });

  document.getElementById("btn-gdpr-export")?.addEventListener("click", () => {
    const data = exportUserData(store.state.stage, store.state.shortlist);
    downloadBlob(JSON.stringify(data, null, 2), "my_physics_bookmarks_gdpr.json", "application/json");
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
// STAGE SELECTOR POPOVER, PRECISION FILTER POPOVER & ACTIVE FILTER PILL
// =========================================================================

const ALL_STEM_FEATURED_BRANCHES = [
  "all",
  "particle", "quantum", "astro", "fusion", "condensed",
  "aerospace", "semiconductors", "robotics", "energy_civil", "biomedical_eng", "materials_mfg",
  "ai_frontier", "systems_arch", "quantum_cs",
  "pure_math", "applied_stat",
  "genomics_synbio", "neuroscience",
  "catalysis_synth", "nanomaterials",
  "climate_atmo", "ocean_geo"
];

const FILTER_BRANCHES = [
  ...PHYSICS_BRANCHES.map(b => ({
    id: b.id,
    label: BRANCH_SHORT_LABELS[b.id] || b.label,
    disc: b.disc || "all"
  })),
  { id: "multi", label: "Multi-Branch", disc: "physics" }
];

const FILTER_TYPES = [
  { id: "all",       label: "All" },
  { id: "lab",       label: "Labs & Facilities" },
  { id: "institute", label: "Research Institutes" },
  { id: "uni",       label: "Universities" },
  { id: "company",   label: "Companies & Startups" },
  { id: "history",   label: "Historical" }
];

const GROUP_SHORT_LABELS = {
  lab: "Labs",
  institute: "Institutes",
  uni: "Universities",
  company: "Startups",
  history: "Historical"
};

export function renderStageMenu() {
  // Levels removed for a cleaner, universal exploration interface.
}

export function renderFilterPopover() {
  const matchedCount = getFilteredHubs({ skipSort: true }).length;
  const totalCount = store.hubs.length;

  const liveEl = document.getElementById("filter-live-count");
  if (liveEl) {
    const compact = window.innerWidth < 430;
    liveEl.textContent = matchedCount === totalCount
      ? (compact ? totalCount.toLocaleString() : `${totalCount.toLocaleString()} institutions`)
      : `${matchedCount.toLocaleString()} / ${totalCount.toLocaleString()}`;
  }

  refreshOfflinePackBadge();

  const discBox = document.getElementById("filter-discipline-chips");
  if (discBox) {
    discBox.innerHTML = STEM_DISCIPLINES.map(d => {
      const count = getFilteredHubs({ discipline: d.id, branch: "all", skipSort: true }).length;
      const active = store.state.discipline === d.id;
      return `
        <button type="button" data-fdisc="${esc(d.id)}" class="filter-chip ${active ? "filter-chip-active" : ""}" title="${esc(d.desc)}">
          <span>${esc(d.short)}</span>
          <span class="filter-chip-count">${count.toLocaleString()}</span>
        </button>
      `;
    }).join("");
    discBox.querySelectorAll("[data-fdisc]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.state.discipline = btn.dataset.fdisc;
        store.state.branch = "all";
        store.state.shanghaiSubject = "all";
        if (store.state.viewMode === "space") setViewMode("earth");
        syncGlobeMarkers();
        renderFilterPopover();
        updateActiveFiltersPill();
      });
    });
  }

  const branchBox = document.getElementById("filter-branch-chips");
  if (branchBox) {
    const curDisc = store.state.discipline || "all";
    branchBox.classList.toggle("filter-branch-rail", curDisc === "all");
    branchBox.classList.toggle("no-scrollbar", curDisc === "all");
    const visibleBranches = curDisc === "all"
      ? FILTER_BRANCHES.filter(b => ALL_STEM_FEATURED_BRANCHES.includes(b.id) || store.state.branch === b.id)
      : FILTER_BRANCHES.filter(b => b.id === "all" || b.disc === curDisc);
    branchBox.innerHTML = visibleBranches.map(b => {
      const count = getFilteredHubs({ branch: b.id, shanghaiSubject: "all", skipSort: true }).length;
      if (b.id !== "all" && count === 0 && store.state.branch !== b.id) return "";
      const active = store.state.branch === b.id;
      return `
        <button type="button" data-fbranch="${esc(b.id)}" class="filter-chip ${active ? "filter-chip-active" : ""}">
          <span>${esc(b.label)}</span>
          <span class="filter-chip-count">${count.toLocaleString()}</span>
        </button>
      `;
    }).join("");
    branchBox.querySelectorAll("[data-fbranch]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.state.branch = btn.dataset.fbranch;
        store.state.shanghaiSubject = "all";
        if (store.state.viewMode === "space") setViewMode("earth");
        syncGlobeMarkers();
        renderFilterPopover();
        updateActiveFiltersPill();
      });
    });
  }

  const typeBox = document.getElementById("filter-type-chips");
  if (typeBox) {
    typeBox.innerHTML = FILTER_TYPES.map(t => {
      const count = getFilteredHubs({ groupFilter: t.id, skipSort: true }).length;
      const active = store.state.groupFilter === t.id;
      return `
        <button type="button" data-ftype="${esc(t.id)}" class="filter-chip ${active ? "filter-chip-active" : ""}">
          <span>${esc(t.label)}</span>
          <span class="filter-chip-count">${count.toLocaleString()}</span>
        </button>
      `;
    }).join("");
    typeBox.querySelectorAll("[data-ftype]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (store.state.viewMode === "space") setViewMode("earth");
        setGroupFilter(btn.dataset.ftype);
        renderFilterPopover();
      });
    });
  }

  const srSel = document.getElementById("filter-shanghai-select");
  if (srSel) {
    const sh = getShanghaiState();
    const opts = [`<option value="all">All Subjects (Auto-match subfield)</option>`];
    if (sh.loaded) {
      opts.push(`<option value="ARWU">ARWU 2026 — World Top 1,000 (${sh.arwuOrder.length})</option>`);
      for (const cat of sh.categories) {
        const subjs = cat.subjects.map(c => sh.subjectsByCode.get(c)).filter(Boolean);
        if (!subjs.length) continue;
        opts.push(
          `<optgroup label="${esc(cat.name)} (${subjs.length})">` +
          subjs.map(s => `<option value="${esc(s.code)}">${esc(s.name)} (${s.count})</option>`).join("") +
          `</optgroup>`
        );
      }
    }
    srSel.innerHTML = opts.join("");
    srSel.value = store.state.shanghaiSubject || "all";
  }

  const countrySel = document.getElementById("filter-country-select");
  if (countrySel) {
    const allCountryCount = getFilteredHubs({ countryFilter: "all", skipSort: true }).length;
    const sortedCountries = [...store.countries.keys()].sort((a, b) => a.localeCompare(b));
    const opts = [
      `<option value="all">All Countries (${allCountryCount.toLocaleString()})</option>`,
      ...sortedCountries.map(c => {
        const cnt = getFilteredHubs({ countryFilter: c, skipSort: true }).length;
        if (cnt === 0 && store.state.countryFilter !== c) return "";
        return `<option value="${esc(c)}">${esc(c)} (${cnt.toLocaleString()})</option>`;
      }).filter(Boolean)
    ];
    countrySel.innerHTML = opts.join("");
    countrySel.value = store.state.countryFilter || "all";
  }

  const sortSel = document.getElementById("filter-sort-select");
  if (sortSel) sortSel.value = store.state.sortBy || "shanghai";

  const curatedToggle = document.getElementById("toggle-curated-only");
  if (curatedToggle) curatedToggle.checked = Boolean(store.state.curatedOnly);
}

function resetAllFilters() {
  store.state.discipline = "all";
  store.state.branch = "all";
  store.state.shanghaiSubject = "all";
  store.state.groupFilter = "all";
  store.state.countryFilter = "all";
  store.state.sortBy = "shanghai";
  store.state.curatedOnly = false;
  store.state.stageOnly = false;

  document.querySelectorAll("[data-group-tab]").forEach(btn => {
    const act = btn.dataset.groupTab === "all";
    btn.classList.toggle("glass-btn-active", act);
    if (!act) btn.classList.add("glass-btn");
  });
  const stageToggle = document.getElementById("toggle-stage-only");
  if (stageToggle) stageToggle.checked = false;
  const curatedToggle = document.getElementById("toggle-curated-only");
  if (curatedToggle) curatedToggle.checked = false;
  const sortSel = document.getElementById("filter-sort-select");
  if (sortSel) sortSel.value = "shanghai";

  syncGlobeMarkers();
  if (isFilterPopoverOpen()) renderFilterPopover();
  updateActiveFiltersPill();
  showToast("All filters cleared");
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
  updateActiveFiltersPill();
}

function getActiveFilterCount() {
  let n = 0;
  if (store.state.discipline !== "all") n++;
  if (store.state.branch !== "all") n++;
  if (store.state.shanghaiSubject !== "all") n++;
  if (store.state.groupFilter !== "all") n++;
  if (store.state.countryFilter !== "all") n++;
  if (store.state.curatedOnly) n++;
  if (store.state.stageOnly) n++;
  return n;
}

function updateActiveFiltersPill() {
  const count = getActiveFilterCount();
  const badge = document.getElementById("filter-count-badge");
  if (badge) {
    if (count > 0) {
      badge.textContent = String(count);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
  const mobDot = document.getElementById("mobile-filter-dot");
  if (mobDot) {
    mobDot.classList.toggle("hidden", count === 0);
  }

  const pill = document.getElementById("active-filter-pill");
  const txt = document.getElementById("active-filter-text");
  if (!pill || !txt) return;

  // Never overlap open Rabbit Hole or Filter popovers
  if (count === 0 || isRabbitPopoverOpen() || isFilterPopoverOpen()) {
    pill.classList.add("hidden");
    pill.classList.remove("inline-flex");
    return;
  }

  const labels = [];
  if (store.state.shanghaiSubject !== "all") {
    const sLbl = store.state.shanghaiSubject === "ARWU"
      ? "ARWU 2026"
      : `GRAS: ${getSubjectMeta(store.state.shanghaiSubject)?.name || store.state.shanghaiSubject}`;
    labels.push(sLbl);
  }
  if (store.state.discipline !== "all") {
    labels.push(STEM_DISCIPLINES.find(d => d.id === store.state.discipline)?.short || store.state.discipline);
  }
  if (store.state.branch !== "all") {
    labels.push(BRANCH_SHORT_LABELS[store.state.branch] || store.state.branch);
  }
  if (store.state.groupFilter !== "all") {
    labels.push(GROUP_SHORT_LABELS[store.state.groupFilter] || store.state.groupFilter);
  }
  if (store.state.countryFilter !== "all") {
    labels.push(store.state.countryFilter);
  }
  if (store.state.curatedOnly) {
    labels.push("Curated");
  }

  txt.textContent = labels.join(" · ");
  pill.classList.remove("hidden");
  pill.classList.add("inline-flex");
}

// =========================================================================
// SHAREABLE DEEP LINKS (?hub=, ?space=, ?era=, ?domain=, ?shanghai=, ?country=, ?auth=)
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
    } else if (params.get("shanghai")) {
      openModal("rankings", params.get("shanghai"));
    } else if (params.get("trail")) {
      const tr = store.rabbitTrails.find(t => t.id === params.get("trail"));
      if (tr) startRabbitTrail(tr, 0);
    } else if (params.get("year")) {
      const y = Number(params.get("year"));
      if (Number.isFinite(y)) setTimeMode(true, y);
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

  const base = location.protocol === "blob:" ? "https://nothinkaffee.github.io/PhysAlts/" : `${location.origin}${location.pathname}`;
  const fullUrl = `${base}${query}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(fullUrl).then(() => showToast("Share link copied")).catch(() => showToast(fullUrl));
  } else {
    showToast(fullUrl);
  }
}

function jumpRabbitHole(mode = "walk") {
  closeRabbitPopover();
  if (store.state.viewMode === "space" && store.spaceMissions.length) {
    const curId = store.state.selectedId?.startsWith("sp-") ? store.state.selectedId.slice(3) : null;
    const curMission = curId ? store.spaceMissions.find(m => m.id === curId) : null;
    const next = pickNextSpaceHop(mode === "surprise" ? null : curMission);
    if (!next?.mission) return;
    recordRabbitVisit({ id: `sp-${next.mission.id}` });
    selectSpaceMission(next.mission.id);
    showToast(`${next.mission.name} · ${next.reason}`);
    return;
  }

  // If following an active preset trail and user clicks Next (not Surprise Me), step the trail
  if (mode === "walk" && store.state.activeTrail?.stops?.length) {
    stepRabbitTrail(1);
    return;
  }

  if (mode === "surprise") {
    store.state.activeTrail = null;
    clearFreeRoamWalk();
  }

  const currentNode = (mode === "walk" && store.state.selectedId && !store.state.selectedId.startsWith("sp-"))
    ? getNodeById(store.state.selectedId)
    : null;

  const hop = pickNextRabbitHop(currentNode, { mode });
  if (!hop?.node) return;

  if (store.state.timeMode) setTimeMode(false);
  selectHubNode(hop.node.id, true, { pushWalk: true, reason: hop.reason });
  const trailBarVisible = !document.getElementById("rabbit-trail-bar")?.classList.contains("hidden");
  if (!trailBarVisible) {
    showToast(hop.reason ? `${hop.node.name.split(" (")[0]} · ${hop.reason}` : hop.node.name);
  }
}

// =========================================================================
// INITIALIZE ALL DOM LISTENERS & GLOBAL KEYBOARD SHORTCUTS
// =========================================================================

export function initUI() {
  refreshDbBadge();
  refreshAccountHeader();
  refreshOfflinePackBadge();
  bindTimelineRuler();

  // Prominent Top-Bar Rabbit Hole Button (click opens Rabbit Hole hub; Shift+Click jumps straight in)
  document.getElementById("btn-rabbit-hole")?.addEventListener("click", (e) => {
    if (e.shiftKey) jumpRabbitHole("walk");
    else toggleRabbitPopover();
  });
  document.getElementById("btn-close-rabbit-popover")?.addEventListener("click", closeRabbitPopover);
  document.getElementById("btn-rabbit-surprise")?.addEventListener("click", () => jumpRabbitHole("surprise"));
  document.getElementById("rabbit-agent-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("rabbit-agent-input")?.value?.trim() || "";
    closeRabbitPopover();
    openSpotlight();
    runAgentRabbitHole(q || "AlphaFold");
  });
  document.getElementById("btn-card-rabbit")?.addEventListener("click", () => jumpRabbitHole("walk"));

  // Floating Rabbit Hole Trail Breadcrumb Bar controls
  document.getElementById("btn-trail-prev")?.addEventListener("click", () => stepRabbitTrail(-1));
  document.getElementById("btn-trail-next")?.addEventListener("click", () => stepRabbitTrail(1));
  document.getElementById("btn-trail-exit")?.addEventListener("click", exitRabbitTrail);

  // Centered Spotlight Command Palette + Deep Rabbit-Hole Research Agent
  document.getElementById("btn-open-spotlight")?.addEventListener("click", openSpotlight);
  document.getElementById("btn-close-spotlight")?.addEventListener("click", closeSpotlight);
  document.getElementById("spotlight-backdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "spotlight-backdrop") closeSpotlight();
  });
  document.getElementById("btn-spotlight-agent")?.addEventListener("click", () => {
    const q = document.getElementById("search-input")?.value || "";
    runAgentRabbitHole(q);
  });
  document.getElementById("btn-spotlight-live")?.addEventListener("click", () => {
    closeSpotlight();
    openModal("live");
  });

  const searchInput = document.getElementById("search-input");
  searchInput?.addEventListener("input", () => renderSearchDropdown(searchInput.value));
  searchInput?.addEventListener("keydown", (e) => {
    const box = document.getElementById("search-dropdown");
    const items = box ? Array.from(box.querySelectorAll(".spot-row")) : [];
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      spotlightIdx = (spotlightIdx + 1) % items.length;
      updateSpotlightSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      spotlightIdx = spotlightIdx <= 0 ? items.length - 1 : spotlightIdx - 1;
      updateSpotlightSelection();
    } else if (e.key === "Enter" && spotlightIdx >= 0 && items[spotlightIdx]) {
      e.preventDefault();
      items[spotlightIdx].click();
    }
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

  // Precision Filter Popover (#filter-popover)
  document.getElementById("btn-open-filters")?.addEventListener("click", toggleFilterPopover);
  document.getElementById("btn-mobile-filters")?.addEventListener("click", toggleFilterPopover);
  document.getElementById("btn-close-filter-popover")?.addEventListener("click", closeFilterPopover);
  document.getElementById("btn-filter-rankings")?.addEventListener("click", () => {
    openModal("rankings", store.state.shanghaiSubject !== "all" ? store.state.shanghaiSubject : null);
  });
  document.getElementById("btn-open-shanghai-table")?.addEventListener("click", () => {
    openModal("rankings", store.state.shanghaiSubject !== "all" ? store.state.shanghaiSubject : null);
  });
  document.getElementById("btn-filter-offline")?.addEventListener("click", () => openModal("offline"));
  document.getElementById("btn-filter-reset")?.addEventListener("click", resetAllFilters);
  document.getElementById("filter-shanghai-select")?.addEventListener("change", (e) => {
    const val = e.target.value || "all";
    store.state.shanghaiSubject = val;
    if (val !== "all") {
      store.state.discipline = "all";
      store.state.branch = "all";
      store.state.sortBy = "shanghai";
    }
    if (store.state.viewMode === "space") setViewMode("earth");
    syncGlobeMarkers();
    renderFilterPopover();
    updateActiveFiltersPill();
    if (val !== "all") {
      const topHub = getFilteredHubs()[0];
      if (topHub) flyToHub(topHub, 2.8);
      const sName = val === "ARWU" ? "ARWU 2026 World Top 1,000" : (getSubjectMeta(val)?.name || val);
      showToast(`ShanghaiRanking 2026: ${sName}`);
    }
  });
  document.getElementById("filter-country-select")?.addEventListener("change", (e) => {
    const val = e.target.value || "all";
    store.state.countryFilter = val;
    if (store.state.viewMode === "space") setViewMode("earth");
    syncGlobeMarkers();
    renderFilterPopover();
    updateActiveFiltersPill();
    if (val !== "all") {
      const target = getFilteredHubs()[0] || store.hubs.find(h => h.country === val);
      if (target) flyToHub(target, 5.0);
    }
  });
  document.getElementById("filter-sort-select")?.addEventListener("change", (e) => {
    store.state.sortBy = e.target.value || "impact";
    syncGlobeMarkers();
    showToast(`Ranked by: ${e.target.options[e.target.selectedIndex]?.text || store.state.sortBy}`);
  });
  document.getElementById("toggle-curated-only")?.addEventListener("change", (e) => {
    store.state.curatedOnly = Boolean(e.target.checked);
    syncGlobeMarkers();
    renderFilterPopover();
    updateActiveFiltersPill();
  });

  // Upgrade all native <select> dropdowns to sculpted liquid-glass pickers (Desktop popover + Mobile bottom sheet)
  initCustomSelects();

  // Dismiss Rabbit Hole / Filter popovers on outside click
  document.addEventListener("pointerdown", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#physalt-select-portal")) return;
    if (isRabbitPopoverOpen()) {
      const pop = document.getElementById("rabbit-popover");
      if (pop && !pop.contains(target) && !target.closest("#btn-rabbit-hole")) {
        closeRabbitPopover();
      }
    }
    if (isFilterPopoverOpen()) {
      const pop = document.getElementById("filter-popover");
      if (pop && !pop.contains(target) && !target.closest("#btn-open-filters") && !target.closest("#btn-mobile-filters")) {
        closeFilterPopover();
      }
    }
  });

  document.getElementById("btn-clear-filters")?.addEventListener("click", resetAllFilters);

  document.getElementById("btn-mode-earth")?.addEventListener("click", () => {
    if (store.state.viewMode === "earth") {
      resetCurrentView();
    } else {
      setViewMode("earth");
    }
  });
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

  document.getElementById("btn-zoom-in")?.addEventListener("click", zoomInGlobe);
  document.getElementById("btn-zoom-out")?.addEventListener("click", zoomOutGlobe);
  document.getElementById("btn-reset-view")?.addEventListener("click", resetCurrentView);

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
  document.getElementById("btn-deeper-toggle")?.addEventListener("click", (e) => {
    const wrap = document.getElementById("card-deeper-wrap");
    if (!wrap) return;
    const isNowHidden = wrap.classList.toggle("hidden");
    const sp = e.currentTarget.querySelector("span");
    if (sp) sp.textContent = isNowHidden ? "More" : "Less";
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
      openSpotlight();
      return;
    }
    if (e.key === "Escape") {
      closeAllSurfaces();
      return;
    }
    if (typing) return;

    if (e.key === "/") {
      e.preventDefault();
      openSpotlight();
    } else if (e.key === "0") {
      e.preventDefault();
      resetCurrentView();
    } else if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      toggleFilterPopover();
    } else if (e.key.toLowerCase() === "o") {
      e.preventDefault();
      openModal("offline");
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

  if (typeof window.lucide?.createIcons === "function") {
    window.lucide.createIcons();
  }
}
