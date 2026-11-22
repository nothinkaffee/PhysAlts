/**
 * PhysAlts — Interactive UI Controller (Atlas Engine v2)
 * Zero all-caps transforms, zero yellow/amber palette, museum-grade chronological
 * timeline with calibrated ruler & story cards, Space Frontier Mission Directory rail,
 * Domains/Materials, Global Countries & Private Deep-Tech, Live Search, and GDPR controls.
 */

import {
  PHYSICS_BRANCHES, STAGE_META, STAGE_PORTALS,
  proxyUrl, formatYear, buildDefaultStages, classifyPhysicsBranch
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
  syncPrefs, submitCommunityHub, exportUserData, eraseAllUserData, isCloudReady
} from "./cloud_sync.js";

let activeWikiReq = 0;
let activeJobsReq = 0;
let toastTimer = null;
let timeTourTimer = null;
let activeTimelineIdx = 0;

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
  toastTimer = setTimeout(() => el.classList.remove("visible"), 2500);
}

export function refreshDbBadge() {
  const dot = document.getElementById("db-dot");
  const lbl = document.getElementById("db-status-text");
  const prefix = isCloudReady() ? "Cloud DB" : "Verified Index";
  const count = store.hubs.length;
  const countries = store.countries.size;
  if (dot) {
    dot.className = "w-2 h-2 rounded-full " + (isCloudReady() ? "bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.9)]" : "bg-sky-200/90 shadow-[0_0_6px_rgba(186,230,253,0.7)]");
  }
  if (lbl) {
    lbl.textContent = `${prefix} · ${count.toLocaleString()} hubs · ${countries} countries`;
  }
}

export function closeDropdown() {
  document.getElementById("search-dropdown")?.classList.add("hidden");
  document.getElementById("stage-dropdown-menu")?.classList.add("hidden");
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
  document.getElementById("drawer-modal")?.classList.add("hidden");
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

  closePlaceCard();
  closeDropdown();
  closeModal();

  if (mode === "space") {
    spaceOverlay?.classList.remove("space-hidden");
    btnSpace?.classList.add("glass-btn-active");
    btnEarth?.classList.remove("glass-btn-active");
    if (earthControls) earthControls.style.display = "none";
    if (zoomControls) zoomControls.style.display = "none";
    timeBar?.classList.add("hidden");
    stopTimeTour();
    renderSpaceZoneBar();
    renderSpaceMissionRail();
    startSpaceLoop();
  } else {
    spaceOverlay?.classList.add("space-hidden");
    btnEarth?.classList.add("glass-btn-active");
    btnSpace?.classList.remove("glass-btn-active");
    if (earthControls) earthControls.style.display = "";
    if (zoomControls) zoomControls.style.display = "";
    if (store.state.timeMode) timeBar?.classList.remove("hidden");
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
    <button type="button" data-szone="${esc(z.id)}" class="szone-btn px-2.5 py-1.5 rounded-full text-[11.5px] whitespace-nowrap transition ${z.id === current ? "glass-btn-active" : "glass-btn"}">
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
      <button type="button" data-rail-mission="${esc(m.id)}" class="rail-mission w-full text-left rounded-2xl px-3 py-2.5 transition ${active ? "glass-row-active" : "glass-row"}">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[12.5px] font-medium truncate">${esc(m.name)}</span>
          <span class="text-[10.5px] shrink-0 ${active ? "text-black/65" : "text-sky-200/80"}">${esc(m.lightTimeLabel.split(" (")[0])}</span>
        </div>
        <div class="text-[11px] mt-0.5 truncate ${active ? "text-black/65" : "text-white/55"}">${esc(m.body)} · ${esc(m.agency)} · ${m.launchYear}</div>
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
  store.state.selectedId = `sp-${m.id}`;
  setSelectedSpaceMission(m.id);
  renderSpaceMissionRail();
  closeModal();

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
      `<span class="px-2.5 py-1 rounded-full text-[11.5px] bg-white/10 border border-white/15 text-white/90">${esc(inst)}</span>`
    ).join("");
  }

  const linksEl = document.getElementById("card-links");
  const links = [];
  if (m.officialUrl) links.push(`<a href="${esc(m.officialUrl)}" target="_blank" rel="noopener noreferrer" class="glass-btn-active rounded-full px-3.5 py-1.5 text-[12.5px] inline-flex items-center gap-1">Official Mission Site ↗</a>`);
  if (m.wikiUrl) links.push(`<a href="${esc(m.wikiUrl)}" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-3 py-1.5 text-[12.5px]">Wikipedia ↗</a>`);
  if (linksEl) linksEl.innerHTML = links.join("");

  document.getElementById("card-deeper-wrap")?.classList.add("hidden");
  document.getElementById("btn-deeper-toggle")?.classList.add("hidden");
  document.getElementById("btn-save-shortlist")?.classList.add("hidden");
  document.getElementById("card-photo-wrap")?.classList.add("hidden");
}

// =========================================================================
// MUSEUM-GRADE CHRONOLOGICAL PHYSICS TIMELINE (1800 BCE -> 2045 CE)
// =========================================================================

// Piecewise non-linear [0..1] scale so every era gets comfortable precision along the calibrated ruler
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

  // Era tabs
  const tabsEl = document.getElementById("time-era-tabs");
  if (tabsEl && store.eras.length) {
    tabsEl.innerHTML = store.eras.map(e => {
      const act = era && era.id === e.id;
      const shortLabel = e.label.split(" (")[0];
      return `
        <button type="button" data-era-id="${esc(e.id)}" class="era-tab px-3 py-1 rounded-full text-[11.5px] whitespace-nowrap transition ${act ? "glass-btn-active" : "glass-btn"}">
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

  // Ruler milestone dots
  const dotsEl = document.getElementById("timeline-dots");
  if (dotsEl && store.timelineEvents.length) {
    activeTimelineIdx = findNearestTimelineIndex(y);
    dotsEl.innerHTML = store.timelineEvents.map((ev, idx) => {
      const ep = yearToPercent(ev.year);
      const isAct = idx === activeTimelineIdx;
      return `<span class="timeline-dot ${isAct ? "active" : ""}" style="left:${ep.toFixed(2)}%" title="${esc(formatYear(ev.year) + " — " + ev.title)}"></span>`;
    }).join("");
  }

  // Synchronized horizontal Milestone Story Cards for the active era
  const stripEl = document.getElementById("timeline-event-strip");
  if (stripEl && store.timelineEvents.length) {
    const eraEvents = era
      ? store.timelineEvents.filter(ev => ev.eraId === era.id)
      : store.timelineEvents.slice(Math.max(0, activeTimelineIdx - 2), activeTimelineIdx + 4);
    const activeEv = store.timelineEvents[activeTimelineIdx];

    stripEl.innerHTML = eraEvents.map(ev => {
      const isSel = activeEv && ev.id === activeEv.id;
      return `
        <button type="button" data-tl-card="${esc(ev.id)}" class="tl-card shrink-0 w-[228px] text-left rounded-2xl px-3 py-2 transition ${isSel ? "glass-row-active" : "glass-row"}">
          <div class="flex items-center justify-between gap-2 text-[11px] ${isSel ? "text-black/65" : "text-sky-200/85"}">
            <span class="font-semibold">${formatYear(ev.year)}</span>
            <span class="truncate">${esc(ev.location)}</span>
          </div>
          <div class="text-[12.5px] font-medium mt-0.5 line-clamp-1 ${isSel ? "text-black" : "text-white"}">${esc(ev.title)}</div>
          <div class="text-[11px] mt-0.5 line-clamp-1 ${isSel ? "text-black/70" : "text-white/55"}">${esc(ev.figure)}</div>
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
  if (countEl) countEl.textContent = `${visible.length.toLocaleString()} sites in view`;
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
  renderTimelineUI(!openCard);
  if (openCard) {
    selectHubNode(`tl-${ev.id}`, true);
  }
}

export function setTimeMode(enabled, targetYear = null) {
  if (store.state.viewMode === "space" && enabled) setViewMode("earth");
  store.state.timeMode = enabled;
  if (targetYear != null) store.state.timeYear = targetYear;
  const bar = document.getElementById("time-bar");
  const btn = document.getElementById("btn-toggle-time");

  if (enabled) {
    closeModal();
    bar?.classList.remove("hidden");
    btn?.classList.add("glass-btn-active");
    resetGlobeToSpace([32, 32], 2.1);
    renderTimelineUI(false);
  } else {
    stopTimeTour();
    bar?.classList.add("hidden");
    btn?.classList.remove("glass-btn-active");
    syncGlobeMarkers();
  }
}

function bindTimelineRuler() {
  const ruler = document.getElementById("timeline-ruler");
  if (!ruler) return;
  let dragging = false;

  const updateFromClientX = (clientX) => {
    const rect = ruler.getBoundingClientRect();
    const pct = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    store.state.timeYear = percentToYear(pct);
    renderTimelineUI(false);
  };

  ruler.addEventListener("pointerdown", (e) => {
    stopTimeTour();
    dragging = true;
    ruler.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  });
  ruler.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  });
  ruler.addEventListener("pointerup", () => { dragging = false; });
  ruler.addEventListener("pointercancel", () => { dragging = false; });
}

// =========================================================================
// HUB / TIMELINE DETAIL CARD
// =========================================================================

export function selectHubNode(id, fly = true) {
  const node = getNodeById(id);
  if (!node) return;
  if (store.state.viewMode === "space") setViewMode("earth");

  store.state.selectedId = node.id;
  closeDropdown();
  if (fly) flyToHub(node, node.tier === "timeline" ? 5.2 : null);
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
  document.getElementById("card-badge").textContent = `${typeLabel}${yearPart} · ${node.sourceApi}`;
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

  const saveBtn = document.getElementById("btn-save-shortlist");
  if (saveBtn) {
    const saved = store.state.shortlist.has(node.id);
    saveBtn.textContent = saved ? "✓ Saved in Shortlist" : "+ Save to Shortlist";
    saveBtn.className = `rounded-full px-3.5 py-1.5 text-[12px] transition ${saved ? "glass-btn-active" : "glass-btn"}`;
  }

  // Projects / Nobel highlights (restrained monochrome/ice-blue — zero yellow)
  const extra = document.getElementById("card-extra-chips");
  if (extra) {
    const chips = [];
    if (node.nobel && node.tier !== "timeline") {
      chips.push(`<div class="w-full rounded-2xl bg-white/[0.06] border border-white/15 px-3 py-2 text-[12px] text-white/90">${esc(node.nobel)}</div>`);
    }
    for (const p of node.projects || []) {
      chips.push(`<a href="${esc(p.url || node.url)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-full text-[11.5px] bg-sky-300/12 border border-sky-200/25 text-sky-100 hover:bg-sky-300/25 transition">${esc(p.name)} (${esc(p.status || "active")}) ↗</a>`);
    }
    extra.innerHTML = chips.join("");
  }

  // Official verified links
  const linksEl = document.getElementById("card-links");
  const links = [];
  if (node.url) links.push(`<a href="${esc(node.url)}" target="_blank" rel="noopener noreferrer" class="glass-btn-active rounded-full px-3.5 py-1.5 text-[12.5px] inline-flex items-center gap-1">Official Site ↗</a>`);
  if (node.wiki) links.push(`<a href="${esc(node.wiki)}" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-3 py-1.5 text-[12.5px]">Wikipedia ↗</a>`);
  const gEarth = `https://earth.google.com/web/@${node.lat},${node.lng},500a,2500d,35y,0h,45t,0r`;
  links.push(`<a href="${gEarth}" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-3 py-1.5 text-[12.5px]">Google Earth ↗</a>`);
  if (linksEl) linksEl.innerHTML = links.join("");

  const stagesEl = document.getElementById("deeper-stages");
  if (stagesEl) {
    stagesEl.innerHTML = Object.keys(STAGE_META).filter(k => k !== "all").map(k => `
      <div class="rounded-xl px-2.5 py-2 ${k === st ? "bg-white/15 border border-white/25" : "bg-white/5 border border-white/10"}">
        <div class="text-[11.5px] font-semibold text-white/80">${STAGE_META[k].label}</div>
        <div class="text-[12px] text-white/85 mt-0.5 leading-snug">${esc(stages[k] || "—")}</div>
      </div>
    `).join("");
  }

  // Live Wikimedia photo (skip .svg trademarked logo badges per Phase 3 rights policy!)
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
    papersEl.innerHTML = `<div class="text-white/50 text-[12px]">Loading recent physics papers…</div>`;
    fetch(proxyUrl(`https://api.openalex.org/works?search=${encodeURIComponent(node.name + " physics")}&sort=publication_date:desc&per-page=3`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (reqId !== activeWikiReq) return;
        if (!data?.results?.length) {
          papersEl.innerHTML = `<div class="text-white/50 text-[12px]">No recent OpenAlex papers returned.</div>`;
          return;
        }
        papersEl.innerHTML = data.results.map(w => `
          <a href="${esc(w.doi || w.id || "https://openalex.org/")}" target="_blank" rel="noopener noreferrer" class="block rounded-2xl bg-white/[0.07] hover:bg-white/14 border border-white/10 p-2.5 transition">
            <div class="text-[12.5px] text-white/95 leading-snug line-clamp-2">${esc(w.title || "Physics Publication")}</div>
            <div class="text-[11.5px] text-white/55 mt-1">${esc(w.publication_year || "")} · ${(w.cited_by_count ?? 0).toLocaleString()} citations ↗</div>
          </a>
        `).join("");
      }).catch(() => {
        if (reqId === activeWikiReq) papersEl.innerHTML = `<div class="text-white/50 text-[12px]">OpenAlex papers unavailable right now.</div>`;
      });
  }

  const authorsEl = document.getElementById("deeper-authors");
  if (authorsEl) {
    authorsEl.innerHTML = `<div class="text-white/50 text-[12px]">Loading top cited physicists…</div>`;
    fetch(proxyUrl(`https://api.openalex.org/authors?search=${encodeURIComponent(node.name + " physics")}&sort=cited_by_count:desc&per-page=3`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (reqId !== activeWikiReq) return;
        const list = data?.results || [];
        if (!list.length) {
          authorsEl.innerHTML = `<div class="text-white/50 text-[12px]">No indexed PIs returned.</div>`;
          return;
        }
        authorsEl.innerHTML = list.map(a => `
          <a href="${esc(a.orcid || a.id || "https://openalex.org/")}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.07] hover:bg-white/14 border border-white/10 px-3 py-2 transition">
            <div class="min-w-0">
              <div class="text-[12.5px] font-medium text-white/95 truncate">${esc(a.display_name || "Researcher")}</div>
              <div class="text-[11px] text-white/55 truncate">${esc(a.last_known_institutions?.[0]?.display_name || node.name)}</div>
            </div>
            <span class="text-[11px] text-white/75 shrink-0">${(a.cited_by_count || 0).toLocaleString()} cites ↗</span>
          </a>
        `).join("");
      }).catch(() => {
        if (reqId === activeWikiReq) authorsEl.innerHTML = `<div class="text-white/50 text-[12px]">OpenAlex researcher index unavailable right now.</div>`;
      });
  }
}

// =========================================================================
// UNIVERSAL SEARCH DROPDOWN
// =========================================================================

function renderSearchDropdown(query) {
  const box = document.getElementById("search-dropdown");
  if (!box) return;
  const { hubs, events, missions, subdomains } = universalSearch(query, 10);
  const parts = [];

  if (hubs.length) {
    parts.push(`<div class="section-label px-3 pt-1.5 pb-1">Institutions, Labs &amp; Companies</div>`);
    parts.push(hubs.map(h => `
      <button type="button" data-pick-hub="${esc(h.id)}" class="pick-hub w-full text-left px-3 py-2 rounded-2xl hover:bg-white/12 transition flex items-center justify-between gap-2 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[13.5px] font-medium text-white truncate">${esc(h.name)}</div>
          <div class="text-[11.5px] text-white/55 truncate">${esc(h.city)}${h.sector ? " · " + esc(h.sector) : ""}</div>
        </div>
        <span class="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/75 shrink-0">${esc(h.entityType)}</span>
      </button>
    `).join(""));
  }

  if (events.length) {
    parts.push(`<div class="section-label px-3 pt-2 pb-1">History &amp; Timeline</div>`);
    parts.push(events.map(ev => `
      <button type="button" data-pick-ev="${esc(ev.id)}" data-ev-year="${ev.year}" class="pick-ev w-full text-left px-3 py-2 rounded-2xl hover:bg-white/12 transition flex items-center justify-between gap-2 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[13px] font-medium text-white truncate">${esc(ev.title)}</div>
          <div class="text-[11.5px] text-white/55 truncate">${esc(ev.figure)} · ${esc(ev.location)}</div>
        </div>
        <span class="text-[11px] text-sky-200/90 shrink-0">${formatYear(ev.year)}</span>
      </button>
    `).join(""));
  }

  if (missions.length) {
    parts.push(`<div class="section-label px-3 pt-2 pb-1">Space Frontier (0 → 1 Light-Day)</div>`);
    parts.push(missions.map(m => `
      <button type="button" data-pick-mission="${esc(m.id)}" class="pick-mission w-full text-left px-3 py-2 rounded-2xl hover:bg-white/12 transition flex items-center justify-between gap-2 cursor-pointer">
        <div class="min-w-0">
          <div class="text-[13px] font-medium text-sky-100 truncate">${esc(m.name)}</div>
          <div class="text-[11.5px] text-white/55 truncate">${esc(m.body)} · ${esc(m.agency)}</div>
        </div>
        <span class="text-[11px] text-sky-200/85 shrink-0">${esc(m.lightTimeLabel.split(" (")[0])}</span>
      </button>
    `).join(""));
  }

  if (subdomains.length) {
    parts.push(`<div class="section-label px-3 pt-2 pb-1">Domains &amp; Vetted Materials</div>`);
    parts.push(subdomains.map(s => `
      <button type="button" data-pick-sub="${esc(s.domainId)}" class="pick-sub w-full text-left px-3 py-2 rounded-2xl hover:bg-white/12 transition cursor-pointer">
        <div class="text-[13px] font-medium text-white truncate">${esc(s.name)}</div>
        <div class="text-[11.5px] text-white/55 truncate">${esc(s.domainName)} · ${(s.materials || []).length} vetted sources</div>
      </button>
    `).join(""));
  }

  if (!parts.length) {
    parts.push(`<div class="px-3 py-4 text-center text-[12.5px] text-white/55">No local matches. Try <strong>Live Search</strong> below to query OpenAlex &amp; ROR globally.</div>`);
  }

  box.innerHTML = parts.join("");
  box.classList.remove("hidden");

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
// DRAWER MODALS
// =========================================================================

export function openModal(mode, focusId = null) {
  closeDropdown();
  const modal = document.getElementById("drawer-modal");
  const titleEl = document.getElementById("modal-title");
  const bodyEl = document.getElementById("modal-body");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  const titles = {
    domains: "Domains, Subdomains & Vetted Materials",
    countries: "Global Countries & Private Deep-Tech",
    live: "Live Open-Science Global Search",
    pathways: `${STAGE_META[store.state.stage]?.label || "Academic"} Pathways & Jobs`,
    audit: "Data Engine, Verification Audit & GDPR Privacy"
  };
  titleEl.textContent = titles[mode] || "PhysAlts";

  if (mode === "domains") renderDomainsModal(bodyEl, focusId);
  if (mode === "countries") renderCountriesAndDeepTechModal(bodyEl);
  if (mode === "live") renderLiveSearchModal(bodyEl);
  if (mode === "pathways") renderPathwaysModal(bodyEl);
  if (mode === "audit") renderAuditAndPrivacyModal(bodyEl);
}

function renderDomainsModal(bodyEl, focusDomainId = null) {
  const activeDomain = focusDomainId || (store.state.branch !== "all" ? store.state.branch : (store.domains[0]?.id || "particle"));
  const branchPills = PHYSICS_BRANCHES.map(b => {
    const count = b.id === "all" ? store.hubs.length : store.hubs.filter(h => h.branch === b.id).length;
    const isAct = store.state.branch === b.id;
    return `
      <button type="button" data-filter-branch="${esc(b.id)}" class="branch-pill px-3 py-1.5 rounded-full text-[12px] transition ${isAct ? "glass-btn-active" : "glass-btn"}">
        ${esc(b.label.split(/[\s,]+/)[0])} (${count.toLocaleString()})
      </button>
    `;
  }).join("");

  const domainTabs = store.domains.map(d => `
    <button type="button" data-dom-tab="${esc(d.id)}" class="dom-tab px-3 py-1.5 rounded-xl text-[12px] transition ${d.id === activeDomain ? "glass-row-active font-medium" : "glass-row"}">
      ${esc(d.name)}
    </button>
  `).join("");

  const selectedDom = store.domains.find(d => d.id === activeDomain) || store.domains[0];
  const subCards = (selectedDom?.subdomains || []).map(sub => `
    <div class="rounded-2xl bg-white/[0.05] border border-white/10 p-3.5 space-y-2.5">
      <div>
        <div class="text-[14px] font-semibold text-white">${esc(sub.name)}</div>
        <p class="text-[12px] text-white/70 mt-0.5 leading-relaxed">${esc(sub.summary)}</p>
      </div>
      ${sub.keyQuestions?.length ? `
        <div class="flex flex-wrap gap-1.5">
          ${sub.keyQuestions.map(q => `<span class="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.07] text-white/75">${esc(q)}</span>`).join("")}
        </div>
      ` : ""}
      ${sub.materials?.length ? `
        <div class="space-y-1">
          <div class="section-label">Vetted Open Materials &amp; References</div>
          <div class="grid grid-cols-1 gap-1.5">
            ${sub.materials.map(m => `
              <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer" class="glass-row rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[12px]">
                <span class="truncate"><strong class="text-white">${esc(m.title)}</strong> <span class="text-white/55">· ${esc(m.provider)}</span></span>
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/80 shrink-0">${esc(m.type)} ↗</span>
              </a>
            `).join("")}
          </div>
        </div>
      ` : ""}
      ${sub.projects?.length ? `
        <div class="space-y-1">
          <div class="section-label">Active &amp; Upcoming Projects</div>
          <div class="flex flex-wrap gap-1.5">
            ${sub.projects.map(p => `
              <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-full text-[11.5px] bg-sky-300/12 border border-sky-200/25 text-sky-100 hover:bg-sky-300/25 transition">
                ${esc(p.name)} · ${esc(p.status)} ↗
              </a>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `).join("");

  bodyEl.innerHTML = `
    <div class="space-y-3">
      <div>
        <div class="section-label mb-1.5">Filter 3D Globe by Physics Branch</div>
        <div class="flex flex-wrap gap-1.5">${branchPills}</div>
      </div>
      <div class="border-t border-white/10 pt-3">
        <div class="section-label mb-1.5">Explore Subdomains, Materials &amp; Projects</div>
        <div class="flex flex-wrap gap-1.5 mb-3">${domainTabs}</div>
        <div class="space-y-2.5">${subCards || '<div class="text-white/55 text-[12.5px]">Loading domains catalog…</div>'}</div>
      </div>
    </div>
  `;

  bodyEl.querySelectorAll(".branch-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      store.state.branch = btn.dataset.filterBranch;
      updateActiveFiltersPill();
      syncGlobeMarkers();
      renderDomainsModal(bodyEl, btn.dataset.filterBranch === "all" ? activeDomain : btn.dataset.filterBranch);
      showToast(`Branch filter: ${PHYSICS_BRANCHES.find(b => b.id === store.state.branch)?.label || store.state.branch}`);
    });
  });
  bodyEl.querySelectorAll(".dom-tab").forEach(btn => {
    btn.addEventListener("click", () => renderDomainsModal(bodyEl, btn.dataset.domTab));
  });
}

function renderCountriesAndDeepTechModal(bodyEl) {
  const sortedCountries = [...store.countries.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const smallCountries = sortedCountries.filter(([, count]) => count <= 10);
  const companies = store.hubs.filter(h => h.group === "company" || h.entityType === "startup" || h.entityType === "institute");

  bodyEl.innerHTML = `
    <div class="space-y-4">
      <div class="grid grid-cols-3 gap-2">
        <div class="rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-center">
          <div class="text-[19px] font-semibold text-white">${store.countries.size}</div>
          <div class="text-[11.5px] text-white/55">Countries Indexed</div>
        </div>
        <div class="rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-center">
          <div class="text-[19px] font-semibold text-sky-200">${smallCountries.length}</div>
          <div class="text-[11.5px] text-white/55">Small &amp; Emerging Nations</div>
        </div>
        <div class="rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-center">
          <div class="text-[19px] font-semibold text-sky-300">${companies.length}</div>
          <div class="text-[11.5px] text-white/55">Private &amp; Startups</div>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="section-label">Filter Globe by Country (All ${store.countries.size} Nations)</div>
          ${store.state.countryFilter !== "all" ? `<button type="button" id="btn-clear-country" class="text-[11.5px] text-sky-300 hover:underline cursor-pointer">Show All Countries</button>` : ""}
        </div>
        <input id="country-search-input" type="text" placeholder="Search any country (e.g. Iceland, Jordan, Rwanda, Estonia, Uruguay)..." class="w-full rounded-2xl bg-white/[0.07] border border-white/12 px-3 py-2 text-[13px] text-white placeholder-white/40 outline-none focus:border-white/30" />
        <div id="country-chip-list" class="flex flex-wrap gap-1.5 max-h-[160px] scroll-clean pr-1"></div>
      </div>

      <div class="border-t border-white/10 pt-3 space-y-2">
        <div class="flex items-center justify-between">
          <div class="section-label">Private Research Institutes, Companies &amp; Startups</div>
          <button type="button" id="btn-filter-companies" class="glass-btn rounded-full px-3 py-1 text-[11.5px]">Focus on Globe</button>
        </div>
        <div class="space-y-1.5 max-h-[240px] scroll-clean pr-1">
          ${companies.slice(0, 80).map(c => `
            <button type="button" data-pick-comp="${esc(c.id)}" class="comp-row glass-row w-full text-left rounded-2xl px-3 py-2 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-[13px] font-medium text-white truncate">${esc(c.name)}</div>
                <div class="text-[11.5px] text-white/55 truncate">${esc(c.city)}${c.sector ? " · " + esc(c.sector) : ""}</div>
              </div>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-sky-300/15 text-sky-200 shrink-0">${esc(c.entityType)}</span>
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  const renderCountryChips = (filter = "") => {
    const f = filter.trim().toLowerCase();
    const list = sortedCountries.filter(([name]) => !f || name.toLowerCase().includes(f));
    const el = document.getElementById("country-chip-list");
    if (!el) return;
    el.innerHTML = list.map(([name, cnt]) => {
      const act = store.state.countryFilter === name;
      return `<button type="button" data-country="${esc(name)}" class="country-btn px-2.5 py-1 rounded-full text-[11.5px] transition ${act ? "glass-btn-active" : "glass-btn"}">${esc(name)} <span class="opacity-65">(${cnt})</span></button>`;
    }).join("");
    el.querySelectorAll(".country-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const chosen = btn.dataset.country;
        store.state.countryFilter = store.state.countryFilter === chosen ? "all" : chosen;
        updateActiveFiltersPill();
        syncGlobeMarkers();
        const firstHub = store.hubs.find(h => h.country === store.state.countryFilter);
        if (firstHub) flyToHub(firstHub, 5.5);
        renderCountriesAndDeepTechModal(bodyEl);
        showToast(store.state.countryFilter === "all" ? "Showing all countries" : `Filtered to ${store.state.countryFilter}`);
      });
    });
  };

  renderCountryChips();
  document.getElementById("country-search-input")?.addEventListener("input", (e) => renderCountryChips(e.target.value));
  document.getElementById("btn-clear-country")?.addEventListener("click", () => {
    store.state.countryFilter = "all";
    updateActiveFiltersPill();
    syncGlobeMarkers();
    renderCountriesAndDeepTechModal(bodyEl);
  });
  document.getElementById("btn-filter-companies")?.addEventListener("click", () => {
    setGroupFilter("company");
    closeModal();
    showToast(`Showing ${companies.length} private institutes & deep-tech companies`);
  });
  bodyEl.querySelectorAll(".comp-row").forEach(btn => {
    btn.addEventListener("click", () => {
      closeModal();
      selectHubNode(btn.dataset.pickComp, true);
    });
  });
}

function renderLiveSearchModal(bodyEl) {
  bodyEl.innerHTML = `
    <div class="space-y-3">
      <p class="text-[12.5px] text-white/65 leading-relaxed">
        Query live CC0 open-science registries (<strong>OpenAlex</strong> &amp; <strong>ROR v2</strong>) for any physics lab, university, observatory, or startup worldwide and add it directly to your atlas.
      </p>
      <form id="live-search-form" class="flex gap-2">
        <input id="live-search-input" type="text" placeholder="e.g. synchrotron, neutrino, Leiden, quantum, Ghana..." class="flex-1 rounded-2xl bg-white/[0.08] border border-white/15 px-3.5 py-2 text-[13px] text-white placeholder-white/40 outline-none focus:border-white/35" />
        <button type="submit" class="glass-btn-active rounded-2xl px-4 py-2 text-[13px]">Search</button>
      </form>
      <div class="flex flex-wrap gap-1.5">
        ${["Quantum", "Fusion", "Observatory", "Synchrotron", "Photonics", "Africa Physics"].map(tag => `
          <button type="button" data-quick="${esc(tag)}" class="live-quick glass-btn rounded-full px-3 py-1 text-[11.5px]">${esc(tag)}</button>
        `).join("")}
      </div>
      <div id="live-results" class="space-y-2 pt-1"></div>
    </div>
  `;

  const runLive = async (q) => {
    const out = document.getElementById("live-results");
    if (!out || !q.trim()) return;
    out.innerHTML = `<div class="text-[12.5px] text-white/55 py-2">Querying OpenAlex &amp; ROR v2 live…</div>`;
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
            summary: `Verified ROR v2 organization (${(org.types || []).join(", ") || "research"}).`
          });
        }
      }

      if (!items.length) {
        out.innerHTML = `<div class="text-[12.5px] text-white/55">No geocoded physics results found for "${esc(q)}".</div>`;
        return;
      }

      mergeHubs(items, "scraped");
      refreshDbBadge();
      syncGlobeMarkers();

      out.innerHTML = items.map(it => `
        <button type="button" data-live-id="${esc(it.id)}" class="live-pick glass-row w-full text-left rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[13px] font-medium text-white truncate">${esc(it.name)}</div>
            <div class="text-[11.5px] text-white/55 truncate">${esc(it.city)} · ${esc(it.sourceApi)}</div>
          </div>
          <span class="text-[11px] text-sky-200 shrink-0">Locate →</span>
        </button>
      `).join("");

      out.querySelectorAll(".live-pick").forEach(btn => {
        btn.addEventListener("click", () => {
          closeModal();
          selectHubNode(btn.dataset.liveId, true);
        });
      });
    } catch {
      out.innerHTML = `<div class="text-[12.5px] text-rose-200/80">Live registry query failed. Please try again.</div>`;
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

function renderPathwaysModal(bodyEl) {
  const st = store.state.stage;
  const portals = STAGE_PORTALS[st] || STAGE_PORTALS.all;
  const savedNodes = [...store.state.shortlist].map(id => getNodeById(id)).filter(Boolean);

  bodyEl.innerHTML = `
    <div class="space-y-4">
      <div>
        <div class="section-label mb-2">Official ${esc(STAGE_META[st]?.label)} Portals</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          ${portals.map(p => `
            <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="glass-row rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-[12.5px]">
              <span class="font-medium text-white truncate">${esc(p.name)}</span>
              <span class="text-white/55">↗</span>
            </a>
          `).join("")}
        </div>
      </div>

      <div class="border-t border-white/10 pt-3">
        <div class="section-label mb-2">Your Saved Shortlist (${savedNodes.length})</div>
        ${savedNodes.length ? `
          <div class="space-y-1.5">
            ${savedNodes.map(n => `
              <button type="button" data-sl-id="${esc(n.id)}" class="sl-pick glass-row w-full text-left rounded-2xl px-3.5 py-2 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-[13px] font-medium text-white truncate">${esc(n.name)}</div>
                  <div class="text-[11.5px] text-white/55 truncate">${esc(n.city)}</div>
                </div>
                <span class="text-[11px] text-white/60">Open →</span>
              </button>
            `).join("")}
          </div>
        ` : `<div class="text-[12.5px] text-white/50">Click any institution on the globe and press <strong>+ Save to Shortlist</strong> to build your list.</div>`}
      </div>

      <div class="border-t border-white/10 pt-3">
        <div class="section-label mb-2">Live Open Physics Positions (INSPIRE-HEP)</div>
        <div id="inspire-jobs-list" class="space-y-1.5 text-[12px] text-white/55">Fetching live openings…</div>
      </div>

      <div class="border-t border-white/10 pt-3">
        <details class="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
          <summary class="text-[12.5px] font-medium text-white cursor-pointer">+ Submit a Missing Lab, University, or Startup</summary>
          <form id="add-hub-form" class="mt-3 space-y-2">
            <div class="grid grid-cols-2 gap-2">
              <input id="add-name" required placeholder="Institution / Startup Name" class="rounded-xl bg-white/[0.08] border border-white/12 px-3 py-1.5 text-[12.5px] text-white outline-none" />
              <input id="add-city" required placeholder="City, Country" class="rounded-xl bg-white/[0.08] border border-white/12 px-3 py-1.5 text-[12.5px] text-white outline-none" />
            </div>
            <div class="grid grid-cols-3 gap-2">
              <input id="add-lat" required type="number" step="any" placeholder="Latitude" class="rounded-xl bg-white/[0.08] border border-white/12 px-3 py-1.5 text-[12.5px] text-white outline-none" />
              <input id="add-lng" required type="number" step="any" placeholder="Longitude" class="rounded-xl bg-white/[0.08] border border-white/12 px-3 py-1.5 text-[12.5px] text-white outline-none" />
              <select id="add-type" class="rounded-xl bg-[#0e131e] border border-white/12 px-2.5 py-1.5 text-[12.5px] text-white outline-none">
                <option value="lab">Lab / Facility</option>
                <option value="uni">University</option>
                <option value="company">Company / Startup</option>
                <option value="institute">Private Institute</option>
              </select>
            </div>
            <input id="add-url" type="url" placeholder="Official Website (https://...)" class="w-full rounded-xl bg-white/[0.08] border border-white/12 px-3 py-1.5 text-[12.5px] text-white outline-none" />
            <textarea id="add-summary" rows="2" placeholder="Short factual summary of physics work..." class="w-full rounded-xl bg-white/[0.08] border border-white/12 px-3 py-1.5 text-[12.5px] text-white outline-none"></textarea>
            <button type="submit" class="glass-btn-active rounded-full px-4 py-1.5 text-[12px]">Add to Atlas</button>
          </form>
        </details>
      </div>
    </div>
  `;

  bodyEl.querySelectorAll(".sl-pick").forEach(btn => {
    btn.addEventListener("click", () => {
      closeModal();
      selectHubNode(btn.dataset.slId, true);
    });
  });

  const rankMap = { phd: "PHD", postdoc: "POSTDOC", assoc_prof: "JUNIOR", prof: "SENIOR" };
  const rank = rankMap[st] || "";
  const reqId = ++activeJobsReq;
  const q = rank ? `status:open and rank:${rank}` : "status:open";
  fetch(proxyUrl(`https://inspirehep.net/api/jobs?q=${encodeURIComponent(q)}&size=5&sort=mostrecent`))
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (reqId !== activeJobsReq) return;
      const el = document.getElementById("inspire-jobs-list");
      if (!el) return;
      const hits = data?.hits?.hits || [];
      if (!hits.length) {
        el.innerHTML = `<div>No open positions returned for this stage right now.</div>`;
        return;
      }
      el.innerHTML = hits.map(h => {
        const md = h.metadata || {};
        const pos = md.position || "Physics Position";
        const inst = md.institutions?.[0]?.value || "Research Institution";
        const url = `https://inspirehep.net/jobs/${h.id}`;
        return `
          <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="glass-row rounded-2xl px-3.5 py-2 block">
            <div class="text-[12.5px] font-medium text-white line-clamp-1">${esc(pos)}</div>
            <div class="text-[11.5px] text-white/55 flex justify-between gap-2 mt-0.5">
              <span class="truncate">${esc(inst)}</span>
              <span class="shrink-0">${esc(md.deadline_date || "Open")} ↗</span>
            </div>
          </a>
        `;
      }).join("");
    }).catch(() => {
      const el = document.getElementById("inspire-jobs-list");
      if (el) el.textContent = "INSPIRE-HEP live jobs unavailable right now.";
    });

  document.getElementById("add-hub-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("add-name").value.trim();
    const city = document.getElementById("add-city").value.trim();
    const lat = Number(document.getElementById("add-lat").value);
    const lng = Number(document.getElementById("add-lng").value);
    const entityType = document.getElementById("add-type").value;
    const url = document.getElementById("add-url").value.trim();
    const summary = document.getElementById("add-summary").value.trim() || "Community-submitted physics hub.";
    if (!name || Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showToast("Enter valid name and coordinates.");
      return;
    }
    const node = {
      id: `custom-${Date.now()}`,
      name,
      city,
      country: city.includes(",") ? city.split(",").pop().trim() : "",
      lat,
      lng,
      group: entityType === "company" || entityType === "institute" ? "company" : entityType,
      entityType,
      branch: classifyPhysicsBranch(`${name} ${summary}`),
      url,
      summary,
      sourceApi: "Community"
    };
    mergeHubs([node], "custom");
    await submitCommunityHub(node);
    refreshDbBadge();
    syncGlobeMarkers();
    closeModal();
    selectHubNode(node.id, true);
    showToast(`Added "${name}" to PhysAlts`);
  });
}

function renderAuditAndPrivacyModal(bodyEl) {
  const rep = store.verificationReport;
  const s = rep?.summary || {};
  const passRate = s.passRatePct != null ? `${s.passRatePct}%` : "Verified";
  const checkedAt = rep?.generatedAt ? new Date(rep.generatedAt).toLocaleString() : "Latest build";

  bodyEl.innerHTML = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-center">
          <div class="text-[18px] font-semibold text-white">${store.hubs.length.toLocaleString()}</div>
          <div class="text-[11px] text-white/55">Total Hubs</div>
        </div>
        <div class="rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-center">
          <div class="text-[18px] font-semibold text-white">${store.countries.size}</div>
          <div class="text-[11px] text-white/55">Countries</div>
        </div>
        <div class="rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-center">
          <div class="text-[18px] font-semibold text-sky-200">${esc(passRate)}</div>
          <div class="text-[11px] text-white/55">Live Link Pass</div>
        </div>
        <div class="rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-center">
          <div class="text-[18px] font-semibold text-sky-300">${store.timelineEvents.length + store.spaceMissions.length}</div>
          <div class="text-[11px] text-white/55">Time + Space Nodes</div>
        </div>
      </div>

      <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2 text-[12px] text-white/75">
        <div class="text-[12.5px] font-semibold text-white">Automated Fact-Check, Link Verification &amp; Provenance Ledger</div>
        <p>Last audited: <strong class="text-white">${esc(checkedAt)}</strong> · Links checked: <strong class="text-white">${(s.linksChecked || 0).toLocaleString()}</strong> · Schema errors: <strong class="text-sky-200">${s.schemaErrorsCount ?? 0}</strong></p>
        ${store.provenanceLedger?.merkleRootSha256 ? `<p class="font-mono text-[11px] text-sky-200/85 truncate">SHA-256 Merkle Root: ${esc(store.provenanceLedger.merkleRootSha256)}</p>` : ""}
        <p class="text-white/55">Open registries: OpenAlex (CC0) · ROR v2 (CC0) · INSPIRE-HEP (CC0) · Wikimedia (CC-BY-SA) · Esri World Imagery.</p>
        <div class="flex flex-wrap gap-1.5 pt-1">
          <a href="./data/provenance_ledger.json" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-3 py-1 text-[11px]">Provenance Ledger JSON ↗</a>
          <a href="./data/physalts_schema.json" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-3 py-1 text-[11px]">JSON Schema 2020-12 ↗</a>
          <a href="./data/verification_report.json" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-3 py-1 text-[11px]">Full Audit Report ↗</a>
        </div>
      </div>

      <div class="space-y-2">
        <div class="section-label">Export Full Open Dataset</div>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="btn-exp-json" class="glass-btn rounded-full px-3.5 py-1.5 text-[12px]">Dataset .JSON</button>
          <button type="button" id="btn-exp-kml" class="glass-btn rounded-full px-3.5 py-1.5 text-[12px]">Google Earth .KML</button>
          <button type="button" id="btn-exp-csv" class="glass-btn rounded-full px-3.5 py-1.5 text-[12px]">Spreadsheet .CSV</button>
        </div>
      </div>

      <div class="border-t border-white/10 pt-3 space-y-2.5">
        <div class="text-[12.5px] font-semibold text-white">GDPR Privacy &amp; Your Data Controls</div>
        <p class="text-[12px] text-white/65 leading-relaxed">
          PhysAlts collects zero PII, zero GPS location, and zero ad tracking cookies. Only your career stage and shortlist are stored (locally or via anonymous Firebase UID when configured).
        </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="btn-gdpr-export" class="glass-btn rounded-full px-3.5 py-1.5 text-[12px]">Export My Data (Art. 20)</button>
          <button type="button" id="btn-gdpr-erase" class="rounded-full px-3.5 py-1.5 text-[12px] bg-rose-500/20 border border-rose-400/35 text-rose-100 hover:bg-rose-500/35 transition cursor-pointer">Erase All My Data (Art. 17)</button>
          <a href="./privacy.html" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-3.5 py-1.5 text-[12px]">Full Privacy Policy ↗</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-exp-json")?.addEventListener("click", () => {
    downloadBlob(JSON.stringify({
      meta: { name: "PhysAlts Global Physics Dataset", exportedAt: new Date().toISOString(), totalHubs: store.hubs.length, totalCountries: store.countries.size },
      hubs: store.hubs,
      timelineEvents: store.timelineEvents,
      spaceMissions: store.spaceMissions
    }, null, 2), "physalts_dataset.json", "application/json");
    showToast(`Exported ${store.hubs.length.toLocaleString()} hubs to JSON`);
  });

  document.getElementById("btn-exp-kml")?.addEventListener("click", () => {
    const nodes = getVisibleGlobeNodes();
    const marks = nodes.map(n => `\n    <Placemark><name>${esc(n.name)}</name><description>${esc(n.summary)}</description><Point><coordinates>${n.lng},${n.lat},0</coordinates></Point></Placemark>`).join("");
    const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>PhysAlts</name>${marks}\n</Document></kml>`;
    downloadBlob(kml, "physalts_physics.kml", "application/vnd.google-earth.kml+xml");
    showToast(`Exported ${nodes.length.toLocaleString()} places to KML`);
  });

  document.getElementById("btn-exp-csv")?.addEventListener("click", () => {
    const header = "name,city,country,entityType,branch,lat,lng,url";
    const rows = store.hubs.map(h => [h.name, h.city, h.country, h.entityType, h.branch, h.lat, h.lng, h.url].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
    downloadBlob([header, ...rows].join("\n"), "physalts_hubs.csv", "text/csv");
    showToast(`Exported ${store.hubs.length.toLocaleString()} hubs to CSV`);
  });

  document.getElementById("btn-gdpr-export")?.addEventListener("click", () => {
    const data = exportUserData(store.state.stage, store.state.shortlist);
    downloadBlob(JSON.stringify(data, null, 2), "physalts_my_data_gdpr.json", "application/json");
    showToast("Exported your personal preferences (GDPR Art. 20)");
  });

  document.getElementById("btn-gdpr-erase")?.addEventListener("click", async () => {
    await eraseAllUserData();
    store.state.shortlist.clear();
    store.state.stage = "undergrad";
    renderStageMenu();
    renderAuditAndPrivacyModal(bodyEl);
    showToast("All your saved data has been permanently erased (GDPR Art. 17)");
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
      <button type="button" data-stage-opt="${key}" class="w-full text-left px-3 py-2 rounded-[14px] text-[13px] flex items-center justify-between cursor-pointer ${active ? "stage-opt-active" : "stage-opt"}">
        <span>${meta.label}</span>
        ${active ? "<span>✓</span>" : ""}
      </button>
    `;
  }).join("");
  menu.querySelectorAll("[data-stage-opt]").forEach(btn => {
    btn.addEventListener("click", () => {
      store.state.stage = btn.dataset.stageOpt;
      syncPrefs(store.state.stage, store.state.shortlist);
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
  if (store.state.branch !== "all") labels.push(PHYSICS_BRANCHES.find(b => b.id === store.state.branch)?.label || store.state.branch);
  if (store.state.countryFilter !== "all") labels.push(store.state.countryFilter);
  if (labels.length) {
    txt.textContent = labels.join(" · ");
    pill.classList.remove("hidden");
  } else {
    pill.classList.add("hidden");
  }
}

// =========================================================================
// INITIALIZE ALL DOM LISTENERS
// =========================================================================

export function initUI() {
  renderStageMenu();
  refreshDbBadge();
  bindTimelineRuler();

  const searchInput = document.getElementById("search-input");
  searchInput?.addEventListener("focus", () => renderSearchDropdown(searchInput.value));
  searchInput?.addEventListener("input", () => renderSearchDropdown(searchInput.value));
  document.getElementById("btn-explore")?.addEventListener("click", () => renderSearchDropdown(searchInput?.value || ""));

  document.getElementById("stage-dropdown-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("search-dropdown")?.classList.add("hidden");
    document.getElementById("stage-dropdown-menu")?.classList.toggle("hidden");
  });

  document.getElementById("db-status-pill")?.addEventListener("click", () => openModal("audit"));

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
  document.getElementById("btn-reset-space")?.addEventListener("click", () => resetGlobeToSpace());

  document.getElementById("btn-zoom-in")?.addEventListener("click", zoomInGlobe);
  document.getElementById("btn-zoom-out")?.addEventListener("click", zoomOutGlobe);

  document.querySelectorAll("[data-group-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (store.state.viewMode === "space") setViewMode("earth");
      setGroupFilter(btn.dataset.groupTab);
    });
  });

  document.getElementById("btn-toggle-time")?.addEventListener("click", () => {
    setTimeMode(!store.state.timeMode, store.state.timeMode ? null : -580);
  });
  document.getElementById("btn-open-domains")?.addEventListener("click", () => openModal("domains"));
  document.getElementById("btn-open-countries")?.addEventListener("click", () => openModal("countries"));
  document.getElementById("btn-open-live")?.addEventListener("click", () => openModal("live"));
  document.getElementById("btn-open-pathways")?.addEventListener("click", () => openModal("pathways"));

  // Museum-grade Timeline step & tour controls
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
  document.getElementById("btn-deeper-toggle")?.addEventListener("click", () => {
    document.getElementById("card-deeper-wrap")?.classList.toggle("hidden");
  });
  document.getElementById("btn-save-shortlist")?.addEventListener("click", () => {
    const id = store.state.selectedId;
    if (!id || id.startsWith("sp-")) return;
    if (store.state.shortlist.has(id)) {
      store.state.shortlist.delete(id);
      showToast("Removed from shortlist");
    } else {
      store.state.shortlist.add(id);
      showToast("Saved to shortlist");
    }
    syncPrefs(store.state.stage, store.state.shortlist);
    selectHubNode(id, false);
  });

  document.getElementById("btn-close-modal")?.addEventListener("click", closeModal);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDropdown();
      closeModal();
    }
  });

  if (window.lucide?.createIcons) window.lucide.createIcons();
}
