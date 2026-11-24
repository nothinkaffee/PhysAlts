/**
 * PhysALT — ShanghaiRanking 2026 & University–Lab–Company Ecosystem UI Views
 * Pure obsidian monochrome + muted crimson (rgb(160,70,70) / rgb(208,110,110)) aesthetic.
 */

import { store, getNodeById } from "./data_store.js";
import {
  getShanghaiState,
  getShanghaiRecord,
  getHubContextualRank,
  getHubGrasSubjectsSorted,
  getHubCollaborations,
  getNearbyEcosystem
} from "./shanghai_engine.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtInd(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(1).replace(/\.0$/, "");
}

/**
 * Renders the compact official ShanghaiRanking 2026 profile block inside #card-shanghai-wrap.
 * Shows ARWU 2026 placement, active/top GRAS 2026 subject pills, interactive 5-indicator drawer,
 * and official ShanghaiRanking institution profile link.
 */
export function renderShanghaiCardSection(node, { onOpenSubjectTable } = {}) {
  const wrap = document.getElementById("card-shanghai-wrap");
  if (!wrap) return null;

  const sr = getShanghaiRecord(node.id);
  if (!sr || node.tier === "timeline") {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return null;
  }

  const shState = getShanghaiState();
  const ctxRank = getHubContextualRank(node, {
    shanghaiSubject: store.state.shanghaiSubject,
    discipline: store.state.discipline,
    branch: store.state.branch
  });
  const activeCode = ctxRank && !ctxRank.isArwu ? ctxRank.subjectCode : null;
  const allSubjects = getHubGrasSubjectsSorted(node.id, activeCode);
  const grasMeta = shState.meta?.grasIndicators || [
    { short: "Faculty" }, { short: "Output" }, { short: "Q1 Papers" }, { short: "CNCI" }, { short: "Intl Collab" }
  ];

  let showAll = false;
  let inspectedCode = activeCode || (allSubjects[0]?.code || null);

  const render = () => {
    const visibleSubjects = showAll ? allSubjects : allSubjects.slice(0, 6);
    const inspected = allSubjects.find(s => s.code === inspectedCode) || null;
    const profUrl = `https://www.shanghairanking.com/institution/${encodeURIComponent(sr.slug)}`;

    wrap.innerHTML = `
      <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[12.5px] font-semibold text-white whitespace-nowrap">ShanghaiRanking 2026</span>
            ${sr.arwu ? `<span class="text-[11.5px] px-2 py-0.5 rounded-full bg-white/[0.09] text-neutral-100 font-medium tabular-nums shrink-0">ARWU #${esc(sr.arwu.r)}</span>` : ""}
          </div>
          <a href="${profUrl}" target="_blank" rel="noopener noreferrer" class="accent-link text-[12px] whitespace-nowrap shrink-0">Profile ↗</a>
        </div>

        ${allSubjects.length ? `
          <div class="flex flex-wrap gap-1.5">
            ${visibleSubjects.map(s => {
              const isSel = s.code === inspectedCode;
              return `
                <button type="button" data-sr-subj="${esc(s.code)}" class="${isSel ? "accent-chip" : "glass-btn"} rounded-full px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5 max-w-full cursor-pointer">
                  <span class="font-semibold tabular-nums shrink-0">#${esc(s.rankLabel)}</span>
                  <span class="truncate">${esc(s.name)}</span>
                </button>
              `;
            }).join("")}
            ${allSubjects.length > 6 ? `
              <button type="button" id="btn-sr-toggle-all" class="glass-btn rounded-full px-2.5 py-1 text-[12px] text-neutral-300 cursor-pointer">
                ${showAll ? "Show less" : `+${allSubjects.length - 6} subjects`}
              </button>
            ` : ""}
          </div>
        ` : ""}

        ${inspected ? `
          <div class="rounded-xl bg-black/30 border border-white/[0.08] p-2.5 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="text-[12px] font-medium text-neutral-200 truncate">
                ${esc(inspected.name)} · <span class="accent-text font-semibold tabular-nums">#${esc(inspected.rankLabel)}</span>${inspected.score != null ? ` <span class="text-neutral-400 tabular-nums">(${inspected.score})</span>` : ""}
              </div>
              <button type="button" data-sr-open-table="${esc(inspected.code)}" class="accent-link text-[11.5px] bg-transparent border-0 p-0 cursor-pointer shrink-0 whitespace-nowrap">Rank List →</button>
            </div>
            <div class="grid grid-cols-5 gap-1.5">
              ${["Faculty", "Output", "Q1", "Impact", "Collab"].map((shortLbl, idx) => `
                <div class="rounded-lg bg-white/[0.04] px-1 py-1 text-center min-w-0">
                  <div class="text-[10px] text-neutral-400 truncate" title="${esc(grasMeta[idx]?.label || shortLbl)}">${shortLbl}</div>
                  <div class="text-[12px] font-semibold text-white tabular-nums mt-0.5">${fmtInd(inspected.ind?.[idx])}</div>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    `;

    wrap.querySelectorAll("[data-sr-subj]").forEach(btn => {
      btn.addEventListener("click", () => {
        inspectedCode = btn.dataset.srSubj;
        render();
      });
    });
    wrap.querySelector("#btn-sr-toggle-all")?.addEventListener("click", () => {
      showAll = !showAll;
      render();
    });
    wrap.querySelector("[data-sr-open-table]")?.addEventListener("click", (e) => {
      onOpenSubjectTable?.(e.currentTarget.dataset.srOpenTable);
    });
  };

  wrap.classList.remove("hidden");
  render();
  return ctxRank;
}

/**
 * Renders Verified Research Collaborations & Nearby Labs/Companies Ecosystem inside #card-ecosystem-wrap.
 */
export function renderEcosystemCardSection(node, { onSelectHub } = {}) {
  const wrap = document.getElementById("card-ecosystem-wrap");
  if (!wrap) return;
  if (!node || node.tier === "timeline") {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }

  const collabs = getHubCollaborations(node.id, store.hubsById);
  const collabIds = new Set(collabs.map(c => c.hub.id));
  const nearby = getNearbyEcosystem(node, store.hubs, { maxKm: 80, limit: 6, excludeIds: collabIds });

  if (!collabs.length && !nearby.length) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }

  const typeTag = (h) => {
    if (h.entityType === "startup") return "Startup";
    if (h.group === "company" || h.entityType === "company") return "Company";
    if (h.entityType === "institute") return "Institute";
    if (h.group === "lab" || h.entityType === "lab") return "Lab";
    return "University";
  };

  let html = "";

  if (collabs.length) {
    html += `
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <div class="section-label text-[12.5px]">Research Collaborations (${collabs.length})</div>
          <span class="text-[11px] text-neutral-500">Crimson arcs</span>
        </div>
        <div class="space-y-1.5">
          ${collabs.slice(0, 5).map(c => `
            <button type="button" data-eco-hub="${esc(c.hub.id)}" class="glass-row w-full text-left rounded-xl px-3 py-2 flex items-start justify-between gap-2 cursor-pointer">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-[13px] font-medium text-white truncate">${esc(c.hub.name)}</span>
                  <span class="text-[10.5px] px-1.5 py-0.5 rounded-full bg-white/[0.08] text-neutral-300 shrink-0">${esc(typeTag(c.hub))}</span>
                </div>
                <div class="text-[11.5px] text-neutral-400 truncate mt-0.5">${esc(c.role)}${c.detail ? " · " + esc(c.detail) : ""}</div>
              </div>
              <span class="accent-text text-[12.5px] shrink-0 pt-0.5">→</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  if (nearby.length) {
    html += `
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <div class="section-label text-[12.5px]">Nearby Labs &amp; Companies (&lt;80 km)</div>
          <span class="text-[11px] text-neutral-500">Silver spokes</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${nearby.map(nb => `
            <button type="button" data-eco-hub="${esc(nb.hub.id)}" title="${esc(nb.hub.name)} · ${esc(nb.kind)} · ${esc(nb.distLabel)}" class="glass-btn rounded-full px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5 max-w-full cursor-pointer">
              <span class="truncate max-w-[175px]">${esc(nb.hub.name.split(" (")[0])}</span>
              <span class="text-[11px] text-neutral-400 shrink-0">${esc(nb.kind)} · ${esc(nb.distLabel)}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  wrap.innerHTML = html;
  wrap.classList.remove("hidden");
  wrap.querySelectorAll("[data-eco-hub]").forEach(btn => {
    btn.addEventListener("click", () => {
      onSelectHub?.(btn.dataset.ecoHub);
    });
  });
}

/**
 * Renders Official ARWU 2026 6-pillar indicator bars + PhysALT Research Impact breakdown inside #deeper-impact.
 */
export function renderShanghaiDeeperBreakdown(node, imp, eraScore) {
  const sr = getShanghaiRecord(node.id);
  const shState = getShanghaiState();
  const arwuInds = shState.meta?.arwuIndicators || [
    { label: "Alumni", weight: "10%" },
    { label: "Award", weight: "20%" },
    { label: "HiCi", weight: "20%" },
    { label: "N&S", weight: "20%" },
    { label: "PUB", weight: "20%" },
    { label: "PCP", weight: "10%" }
  ];

  let arwuHtml = "";
  if (sr?.arwu) {
    arwuHtml = `
      <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2">
        <div class="flex items-center justify-between text-[13px]">
          <span class="font-medium text-white">ARWU 2026 World #${esc(sr.arwu.r)}${sr.arwu.nr ? ` · Nat #${esc(sr.arwu.nr)}` : ""}</span>
          ${sr.arwu.s != null ? `<span class="accent-text font-semibold tabular-nums">${sr.arwu.s} / 100</span>` : `<span class="text-neutral-400 text-[12px]">Top 1,000</span>`}
        </div>
        ${arwuInds.map((meta, idx) => {
          const val = sr.arwu.i?.[idx];
          const pct = val != null ? Math.min(100, Math.max(0, Math.round(Number(val)))) : 0;
          return `
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[12px] text-neutral-400">
                <span>${esc(meta.label)} <span class="text-neutral-500">(${esc(meta.weight)})</span></span>
                <span class="tabular-nums text-neutral-300">${fmtInd(val)}</span>
              </div>
              <div class="impact-bar-track"><div class="impact-bar-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  const b = imp.breakdown || {};
  const pillars = [
    { label: "Laureates & Awards", val: b.awards || 0, max: 30 },
    { label: "Citation Volume", val: b.output || 0, max: 25 },
    { label: "Impact per Work", val: b.cnci || 0, max: 20 },
    { label: "Infrastructure", val: b.infra || 0, max: 15 },
    { label: "Collaboration", val: b.collab || 0, max: 10 }
  ];

  return `
    ${arwuHtml}
    <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 space-y-2">
      <div class="flex items-center justify-between text-[13px]">
        <span class="font-medium text-white">PhysALT Index · ${esc(imp.tierLabel)}</span>
        <span class="accent-text font-semibold tabular-nums">${eraScore} / 100</span>
      </div>
      ${pillars.map(p => `
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[12px] text-neutral-400">
            <span>${p.label}</span>
            <span class="tabular-nums text-neutral-300">${p.val}/${p.max}</span>
          </div>
          <div class="impact-bar-track"><div class="impact-bar-fill" style="width:${Math.round((p.val / p.max) * 100)}%"></div></div>
        </div>
      `).join("")}
      ${node.nobel ? `<div class="text-[12px] text-neutral-300 pt-1 border-t border-white/10">${esc(node.nobel)}</div>` : ""}
    </div>
  `;
}

/**
 * Renders the full interactive ShanghaiRanking 2026 Subject Leaderboard Modal
 * covering ARWU 2026 Top 1,000 + ALL 57 GRAS 2026 subjects across all 5 categories.
 */
export function renderRankingsModal(bodyEl, initialSubject = null, { onSelectHub, onMapSubjectOnGlobe } = {}) {
  const sh = getShanghaiState();
  if (!sh.loaded) {
    bodyEl.innerHTML = `<div class="py-10 text-center text-[14px] text-neutral-400">Loading ShanghaiRanking 2026 dataset…</div>`;
    return;
  }

  // Determine initial category & subject (default to Electrical & Electronic Engineering if user is in semiconductors, else ARWU or specified subject)
  let activeSubject = initialSubject || (store.state.shanghaiSubject !== "all" ? store.state.shanghaiSubject : null);
  if (!activeSubject) {
    if (store.state.branch === "semiconductors") activeSubject = "AS0202";
    else if (store.state.branch === "aerospace") activeSubject = "AS0221";
    else if (store.state.branch === "robotics") activeSubject = "AS0230";
    else if (store.state.branch === "ai_frontier") activeSubject = "AS0229";
    else if (store.state.discipline === "engineering") activeSubject = "AS0202";
    else activeSubject = "ARWU";
  }

  let activeCategory = "ARWU";
  if (activeSubject !== "ARWU") {
    const sm = sh.subjectsByCode.get(activeSubject);
    activeCategory = sm?.category || "Engineering";
  }
  let countryFilter = "all";
  let searchQuery = "";
  let pageSize = 50;

  const grasInds = sh.meta?.grasIndicators || [
    { short: "Faculty" }, { short: "Output" }, { short: "Q1" }, { short: "CNCI" }, { short: "IC" }
  ];
  const arwuInds = sh.meta?.arwuIndicators || [
    { label: "Alumni" }, { label: "Award" }, { label: "HiCi" }, { label: "N&S" }, { label: "PUB" }, { label: "PCP" }
  ];

  const render = () => {
    const isArwu = activeSubject === "ARWU";
    const subjectMeta = isArwu ? null : sh.subjectsByCode.get(activeSubject);
    const orderedIds = isArwu ? sh.arwuOrder : (sh.subjectRankings[activeSubject] || []);

    // Build rows with live ecosystem info
    const allRows = orderedIds.map((hubId, idx) => {
      const sr = sh.universities[hubId];
      if (!sr) return null;
      const metric = isArwu ? sr.arwu : sr.gras?.[activeSubject];
      if (!metric) return null;
      return {
        hubId,
        orderIdx: idx,
        name: sr.name,
        country: sr.country,
        slug: sr.slug,
        rankLabel: metric.r,
        rankNum: metric.rn || idx + 1,
        score: metric.s ?? null,
        ind: metric.i || []
      };
    }).filter(Boolean);

    // Non-zero country list for this subject
    const countryCounts = new Map();
    for (const r of allRows) {
      if (r.country) countryCounts.set(r.country, (countryCounts.get(r.country) || 0) + 1);
    }
    const sortedCountries = [...countryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    const q = searchQuery.trim().toLowerCase();
    const filtered = allRows.filter(r => {
      if (countryFilter !== "all" && r.country !== countryFilter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.country.toLowerCase().includes(q)) return false;
      return true;
    });
    const visible = filtered.slice(0, pageSize);

    const catSubjects = activeCategory === "ARWU"
      ? []
      : (sh.categories.find(c => c.name === activeCategory)?.subjects || []).map(code => sh.subjectsByCode.get(code)).filter(Boolean);

    bodyEl.innerHTML = `
      <div class="space-y-3">
        <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div class="space-y-0.5 min-w-0 flex-1">
            <div class="text-[14.5px] font-semibold text-white">
              ${isArwu ? "ARWU 2026 — Academic Ranking of World Universities" : `GRAS 2026 — ${esc(subjectMeta?.name || activeSubject)}`}
            </div>
            <div class="text-[12.5px] text-neutral-400">
              Official ShanghaiRanking 2026 · <strong class="text-white">${allRows.length.toLocaleString()}</strong> universities · ${sh.meta.subjectCount} subjects · ${sh.meta.totalUniversities.toLocaleString()} mapped
            </div>
          </div>
          <button type="button" id="btn-sr-map-globe" class="glass-btn-active rounded-full px-3.5 py-1.5 text-[12.5px] shrink-0 self-start sm:self-auto cursor-pointer">
            Map ${filtered.length.toLocaleString()} on 3D Globe →
          </button>
        </div>

        <!-- Category Tabs -->
        <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button type="button" data-sr-cat="ARWU" class="px-3 py-1.5 rounded-full text-[12.5px] whitespace-nowrap transition cursor-pointer shrink-0 ${activeCategory === "ARWU" ? "glass-btn-active" : "glass-btn"}">
            ARWU Top 1,000
          </button>
          ${sh.categories.map(c => `
            <button type="button" data-sr-cat="${esc(c.name)}" class="px-3 py-1.5 rounded-full text-[12.5px] whitespace-nowrap transition cursor-pointer shrink-0 ${activeCategory === c.name ? "glass-btn-active" : "glass-btn"}">
              ${esc(c.name)} <span class="opacity-65 tabular-nums">${c.subjects.length}</span>
            </button>
          `).join("")}
        </div>

        <!-- Compact Single-Row Subject Rail (for GRAS categories) -->
        ${catSubjects.length ? `
          <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            ${catSubjects.map(s => `
              <button type="button" data-sr-pick-subj="${esc(s.code)}" class="px-3 py-1 rounded-full text-[12px] whitespace-nowrap transition cursor-pointer shrink-0 ${activeSubject === s.code ? "accent-chip font-medium" : "glass-btn"}">
                ${esc(s.name)} <span class="opacity-65 tabular-nums">${s.count}</span>
              </button>
            `).join("")}
          </div>
        ` : ""}

        <!-- Subject Selector + Search + Country Filter -->
        <div class="grid grid-cols-1 ${catSubjects.length ? "sm:grid-cols-3" : "sm:grid-cols-[1fr_220px]"} gap-2">
          ${catSubjects.length ? `
            <select id="sr-modal-subject" class="filter-select">
              ${catSubjects.map(s => `<option value="${esc(s.code)}" ${activeSubject === s.code ? "selected" : ""}>${esc(s.name)} (${s.count})</option>`).join("")}
            </select>
          ` : ""}
          <input id="sr-modal-search" type="text" value="${esc(searchQuery)}" placeholder="Search university or country…" class="glass-input text-[13.5px] py-2" />
          <select id="sr-modal-country" class="filter-select">
            <option value="all">All Countries (${allRows.length})</option>
            ${sortedCountries.map(([c, cnt]) => `<option value="${esc(c)}" ${countryFilter === c ? "selected" : ""}>${esc(c)} (${cnt})</option>`).join("")}
          </select>
        </div>

        <!-- Ranked Rows -->
        <div class="space-y-2">
          ${visible.length ? visible.map(r => {
            const collabCount = getHubCollaborations(r.hubId, store.hubsById).length;
            const hubObj = getNodeById(r.hubId);
            const nearbyCount = hubObj ? getNearbyEcosystem(hubObj, store.hubs, { maxKm: 60, limit: 6 }).length : 0;
            const indLabels = isArwu ? arwuInds.map(x => x.label) : ["Faculty", "Output", "Q1", "Impact", "Collab"];
            return `
              <button type="button" data-sr-row-hub="${esc(r.hubId)}" class="glass-row w-full text-left rounded-2xl p-3.5 transition cursor-pointer space-y-2">
                <div class="flex items-center justify-between gap-2.5">
                  <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <span class="min-w-[46px] text-center px-2 py-0.5 rounded-full ${r.rankNum <= 10 ? "accent-chip font-semibold" : "bg-white/[0.08] text-neutral-200 font-medium"} text-[12px] tabular-nums shrink-0">
                      #${esc(r.rankLabel)}
                    </span>
                    <div class="text-[14.5px] font-semibold text-white truncate min-w-0 flex-1">${esc(r.name)}</div>
                  </div>
                  <div class="text-right shrink-0">
                    ${r.score != null ? `<div class="text-[14px] font-semibold text-white tabular-nums leading-none">${r.score}</div><div class="text-[10px] text-neutral-500 mt-0.5">Score</div>` : `<span class="accent-text text-[12.5px]">Inspect →</span>`}
                  </div>
                </div>
                <div class="flex items-center justify-between gap-2 min-w-0">
                  <span class="text-[12px] text-neutral-400 truncate">${esc(r.country)}</span>
                  <div class="flex items-center gap-1.5 shrink-0">
                    ${collabCount ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-[rgba(160,70,70,0.18)] border border-[rgba(208,110,110,0.34)] accent-text font-medium whitespace-nowrap tabular-nums">${collabCount} collab${collabCount > 1 ? "s" : ""}</span>` : ""}
                    ${nearbyCount ? `<span class="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-neutral-300 whitespace-nowrap tabular-nums" title="${nearbyCount} nearby labs &amp; companies (&lt;60 km)">${nearbyCount} nearby</span>` : ""}
                  </div>
                </div>
                <div class="grid ${isArwu ? "grid-cols-6" : "grid-cols-5"} gap-1.5 pt-1.5 border-t border-white/[0.06]">
                  ${indLabels.map((lbl, i) => `
                    <div class="text-center min-w-0">
                      <div class="text-[10px] text-neutral-500 truncate">${esc(lbl)}</div>
                      <div class="text-[11.5px] text-neutral-200 font-medium tabular-nums">${fmtInd(r.ind?.[i])}</div>
                    </div>
                  `).join("")}
                </div>
              </button>
            `;
          }).join("") : `<div class="py-8 text-center text-[14px] text-neutral-400">No ranked universities match that filter.</div>`}
        </div>

        ${filtered.length > visible.length ? `
          <div class="pt-1 flex justify-center">
            <button type="button" id="btn-sr-load-more" class="glass-btn rounded-full px-5 py-2 text-[13.5px] cursor-pointer">
              Show more (${visible.length} of ${filtered.length.toLocaleString()})
            </button>
          </div>
        ` : ""}
      </div>
    `;

    // Bind interactive controls
    bodyEl.querySelectorAll("[data-sr-cat]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeCategory = btn.dataset.srCat;
        countryFilter = "all";
        pageSize = 50;
        if (activeCategory === "ARWU") {
          activeSubject = "ARWU";
        } else {
          const firstSubj = sh.categories.find(c => c.name === activeCategory)?.subjects?.[0];
          if (firstSubj) activeSubject = firstSubj;
        }
        render();
      });
    });

    bodyEl.querySelectorAll("[data-sr-pick-subj]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeSubject = btn.dataset.srPickSubj;
        countryFilter = "all";
        pageSize = 50;
        render();
      });
    });

    const srInput = bodyEl.querySelector("#sr-modal-search");
    if (srInput) {
      srInput.addEventListener("input", () => {
        const pos = srInput.selectionStart;
        searchQuery = srInput.value;
        pageSize = 50;
        render();
        const nextInp = bodyEl.querySelector("#sr-modal-search");
        if (nextInp) {
          nextInp.focus();
          try { nextInp.setSelectionRange(pos, pos); } catch {}
        }
      });
    }

    bodyEl.querySelector("#sr-modal-subject")?.addEventListener("change", (e) => {
      activeSubject = e.target.value;
      countryFilter = "all";
      pageSize = 50;
      render();
    });

    bodyEl.querySelector("#sr-modal-country")?.addEventListener("change", (e) => {
      countryFilter = e.target.value || "all";
      pageSize = 50;
      render();
    });

    bodyEl.querySelector("#btn-sr-load-more")?.addEventListener("click", () => {
      pageSize += 50;
      render();
    });

    bodyEl.querySelector("#btn-sr-map-globe")?.addEventListener("click", () => {
      onMapSubjectOnGlobe?.(activeSubject, countryFilter);
    });

    bodyEl.querySelectorAll("[data-sr-row-hub]").forEach(btn => {
      btn.addEventListener("click", () => {
        onSelectHub?.(btn.dataset.srRowHub, activeSubject);
      });
    });
  };

  render();
}
