/**
 * PhysALT — Bespoke Liquid-Glass Custom Select & Mobile Bottom-Sheet Picker
 *
 * Replaces jarring native OS <select> popups (especially Android Chrome's grey radio-button dialog)
 * with a sculpted obsidian glass picker that stays 100% in sync with PhysALT's monochrome + crimson
 * design language across Mobile Web, Desktop, Android, and iOS.
 *
 * Features:
 *  - Auto-upgrades every `.filter-select` and `select.glass-input` (including dynamic modals)
 *  - Desktop: smart viewport-clamped floating glass popover (auto-flips above when near bottom)
 *  - Mobile (<640px): sculpted obsidian glass bottom sheet with grab handle & safe-area padding
 *  - Built-in instant search bar whenever a dropdown has > 10 options (e.g. 57 GRAS subjects, 167 countries)
 *  - Cleanly splits trailing counts like "Electrical & Electronic Engineering (500)" into label + tabular pill
 *  - Full keyboard support (ArrowUp / ArrowDown / Enter / Escape) & zero native <select> API breakage
 */

const SELECTOR = "select.filter-select, select.glass-input";
const UPGRADED = new WeakMap(); // select -> { wrap, trigger, labelEl, countEl, observer }

let portalEl = null;
let activeCtx = null; // { select, items, filtered, focusIdx, query, isMobile, onKeyDown, onOutside, onResize }

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitLabelAndCount(rawText) {
  const txt = String(rawText || "").trim();
  const m = txt.match(/^(.*?)\s*\(([\d,]+)\)\s*$/);
  if (!m) return { label: txt, count: "" };
  const num = Number(m[2].replace(/,/g, ""));
  return {
    label: m[1].trim(),
    count: Number.isFinite(num) ? num.toLocaleString() : m[2]
  };
}

function resolveTitle(select) {
  if (select.dataset.selectTitle) return select.dataset.selectTitle;
  if (select.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
    if (lbl?.textContent?.trim()) return lbl.textContent.trim();
  }
  if (select.id === "sr-modal-subject") return "ShanghaiRanking 2026 Subject";
  if (select.id === "sr-modal-country") return "Country / Region";
  if (select.id === "sub-type") return "Institution Type";
  if (select.hasAttribute("data-bm-folder-sel")) return "Move to Folder";
  return "Select Option";
}

function extractStructure(select) {
  const groups = [];
  let flatCount = 0;

  for (const child of select.children) {
    if (child.tagName === "OPTGROUP") {
      const opts = [];
      for (const o of child.children) {
        if (o.tagName !== "OPTION") continue;
        const parsed = splitLabelAndCount(o.textContent);
        opts.push({
          value: o.value,
          rawText: o.textContent.trim(),
          label: parsed.label,
          count: parsed.count,
          disabled: o.disabled,
          group: child.label || ""
        });
        flatCount++;
      }
      if (opts.length) {
        const gParsed = splitLabelAndCount(child.label || "");
        groups.push({ label: gParsed.label, count: gParsed.count, options: opts });
      }
    } else if (child.tagName === "OPTION") {
      const parsed = splitLabelAndCount(child.textContent);
      let topGroup = groups[groups.length - 1];
      if (!topGroup || topGroup.label !== "") {
        topGroup = { label: "", count: "", options: [] };
        groups.push(topGroup);
      }
      topGroup.options.push({
        value: child.value,
        rawText: child.textContent.trim(),
        label: parsed.label,
        count: parsed.count,
        disabled: child.disabled,
        group: ""
      });
      flatCount++;
    }
  }
  return { groups, flatCount };
}

export function syncCustomSelect(select) {
  const entry = UPGRADED.get(select);
  if (!entry) return;
  const selOpt = select.options[select.selectedIndex] || select.options[0];
  const parsed = splitLabelAndCount(selOpt ? selOpt.textContent : "");
  entry.labelEl.textContent = parsed.label || "Select…";
  if (parsed.count) {
    entry.countEl.textContent = parsed.count;
    entry.countEl.classList.remove("hidden");
  } else {
    entry.countEl.textContent = "";
    entry.countEl.classList.add("hidden");
  }
  entry.trigger.disabled = Boolean(select.disabled);
}

export function syncAllCustomSelects() {
  document.querySelectorAll(SELECTOR).forEach((sel) => {
    upgradeSelect(sel);
    syncCustomSelect(sel);
  });
}

function ensurePortal() {
  if (portalEl && document.body.contains(portalEl)) return portalEl;
  portalEl = document.createElement("div");
  portalEl.id = "physalt-select-portal";
  portalEl.className = "cselect-portal hidden";
  document.body.appendChild(portalEl);
  return portalEl;
}

export function closeCustomSelect({ restoreFocus = false } = {}) {
  if (!activeCtx) return;
  const { select, onKeyDown, onOutside, onResize } = activeCtx;
  const entry = UPGRADED.get(select);
  entry?.trigger?.setAttribute("aria-expanded", "false");
  entry?.wrap?.classList.remove("is-open");

  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("pointerdown", onOutside, true);
  window.removeEventListener("resize", onResize);

  if (portalEl) {
    portalEl.classList.add("hidden");
    portalEl.innerHTML = "";
  }
  activeCtx = null;
  if (restoreFocus) entry?.trigger?.focus?.();
}

function selectOptionValue(select, value) {
  if (select.value !== value) {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  syncCustomSelect(select);
  closeCustomSelect({ restoreFocus: true });
}

function openCustomSelect(select) {
  const entry = UPGRADED.get(select);
  if (!entry) return;

  if (activeCtx?.select === select) {
    closeCustomSelect({ restoreFocus: true });
    return;
  }
  closeCustomSelect();

  const portal = ensurePortal();
  const isMobile = window.innerWidth < 640;
  const { groups, flatCount } = extractStructure(select);
  const title = resolveTitle(select);
  const showSearch = flatCount > 10;

  entry.trigger.setAttribute("aria-expanded", "true");
  entry.wrap.classList.add("is-open");

  portal.classList.remove("hidden");
  portal.innerHTML = `
    <div class="cselect-backdrop ${isMobile ? "is-mobile" : "is-desktop"}"></div>
    <div class="cselect-panel liquid-glass ${isMobile ? "cselect-sheet" : "cselect-popover"}" role="listbox" aria-label="${esc(title)}">
      ${isMobile ? `<div class="cselect-handle" aria-hidden="true"></div>` : ""}
      ${isMobile || showSearch ? `
        <div class="cselect-head">
          <div class="cselect-head-row">
            <span class="cselect-title">${esc(title)}</span>
            <button type="button" class="cselect-close glass-btn" aria-label="Close">✕</button>
          </div>
          ${showSearch ? `
            <div class="cselect-search-wrap">
              <svg class="cselect-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" class="cselect-search" autocomplete="off" placeholder="Search ${flatCount > 80 ? "countries" : "subjects"}…" aria-label="Filter ${esc(title)}" />
              <button type="button" class="cselect-search-clear hidden" aria-label="Clear search">✕</button>
            </div>
          ` : ""}
        </div>
      ` : ""}
      <div class="cselect-list scroll-clean"></div>
    </div>
  `;

  const backdrop = portal.querySelector(".cselect-backdrop");
  const panel = portal.querySelector(".cselect-panel");
  const listEl = portal.querySelector(".cselect-list");
  const searchInput = portal.querySelector(".cselect-search");
  const clearBtn = portal.querySelector(".cselect-search-clear");
  const closeBtn = portal.querySelector(".cselect-close");

  let query = "";
  let flatRendered = [];
  let focusIdx = -1;

  const positionDesktop = () => {
    if (isMobile) return;
    const rect = entry.trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = Math.min(Math.max(rect.width, 260), Math.min(520, vw - 24));
    const maxH = Math.min(showSearch ? 410 : 320, vh - 32);
    const spaceBelow = vh - rect.bottom - 14;
    const spaceAbove = rect.top - 14;
    const openAbove = spaceBelow < Math.min(260, maxH) && spaceAbove > spaceBelow;
    const availH = Math.max(160, Math.min(maxH, openAbove ? spaceAbove : spaceBelow));

    let left = rect.left;
    if (left + panelW > vw - 12) left = vw - panelW - 12;
    if (left < 12) left = 12;

    panel.style.width = `${Math.round(panelW)}px`;
    panel.style.maxHeight = `${Math.round(availH)}px`;
    panel.style.left = `${Math.round(left)}px`;
    if (openAbove) {
      panel.style.top = "auto";
      panel.style.bottom = `${Math.round(vh - rect.top + 6)}px`;
    } else {
      panel.style.bottom = "auto";
      panel.style.top = `${Math.round(rect.bottom + 6)}px`;
    }
  };

  const renderOptions = () => {
    const q = query.trim().toLowerCase();
    const currentVal = select.value;
    flatRendered = [];
    const parts = [];

    for (const g of groups) {
      const matched = g.options.filter(o => {
        if (!q) return true;
        return o.label.toLowerCase().includes(q) || o.group.toLowerCase().includes(q);
      });
      if (!matched.length) continue;

      if (g.label) {
        parts.push(`
          <div class="cselect-group-hdr">
            <span>${esc(g.label)}</span>
            ${g.count ? `<span class="cselect-group-cnt">${esc(g.count)}</span>` : ""}
          </div>
        `);
      }

      for (const o of matched) {
        const idx = flatRendered.length;
        flatRendered.push(o);
        const isSel = o.value === currentVal;
        if (isSel && focusIdx === -1) focusIdx = idx;
        parts.push(`
          <button
            type="button"
            role="option"
            aria-selected="${isSel ? "true" : "false"}"
            data-copt-idx="${idx}"
            data-copt-val="${esc(o.value)}"
            ${o.disabled ? "disabled" : ""}
            class="cselect-opt ${isSel ? "is-selected" : ""}"
          >
            <span class="cselect-opt-label">${esc(o.label)}</span>
            <span class="cselect-opt-right">
              ${o.count ? `<span class="cselect-opt-cnt">${esc(o.count)}</span>` : ""}
              ${isSel ? `
                <svg class="cselect-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ` : ""}
            </span>
          </button>
        `);
      }
    }

    if (!parts.length) {
      listEl.innerHTML = `<div class="cselect-empty">No matches for “${esc(query)}”</div>`;
      return;
    }

    listEl.innerHTML = parts.join("");
    listEl.querySelectorAll(".cselect-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectOptionValue(select, btn.dataset.coptVal);
      });
    });
  };

  const highlightFocused = () => {
    listEl.querySelectorAll(".cselect-opt.is-focused").forEach(el => el.classList.remove("is-focused"));
    if (focusIdx < 0 || focusIdx >= flatRendered.length) return;
    const el = listEl.querySelector(`[data-copt-idx="${focusIdx}"]`);
    if (el) {
      el.classList.add("is-focused");
      el.scrollIntoView({ block: "nearest" });
    }
  };

  renderOptions();
  positionDesktop();

  // Scroll currently selected option into view smoothly on open
  requestAnimationFrame(() => {
    const selEl = listEl.querySelector(".cselect-opt.is-selected");
    if (selEl) selEl.scrollIntoView({ block: "center" });
    if (searchInput && !isMobile) {
      searchInput.focus({ preventScroll: true });
    }
  });

  backdrop?.addEventListener("click", () => closeCustomSelect({ restoreFocus: true }));
  closeBtn?.addEventListener("click", () => closeCustomSelect({ restoreFocus: true }));

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      query = searchInput.value;
      clearBtn?.classList.toggle("hidden", !query);
      focusIdx = -1;
      renderOptions();
      positionDesktop();
    });
    clearBtn?.addEventListener("click", () => {
      searchInput.value = "";
      query = "";
      clearBtn.classList.add("hidden");
      focusIdx = -1;
      renderOptions();
      searchInput.focus();
    });
  }

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeCustomSelect({ restoreFocus: true });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!flatRendered.length) return;
      focusIdx = (focusIdx + 1) % flatRendered.length;
      highlightFocused();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!flatRendered.length) return;
      focusIdx = focusIdx <= 0 ? flatRendered.length - 1 : focusIdx - 1;
      highlightFocused();
    } else if (e.key === "Enter" && focusIdx >= 0 && flatRendered[focusIdx]) {
      e.preventDefault();
      selectOptionValue(select, flatRendered[focusIdx].value);
    }
  };

  const onOutside = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (panel.contains(t) || entry.trigger.contains(t)) return;
    closeCustomSelect();
  };

  const onResize = () => {
    if (isMobile !== (window.innerWidth < 640)) {
      closeCustomSelect();
    } else {
      positionDesktop();
    }
  };

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("resize", onResize);

  activeCtx = { select, onKeyDown, onOutside, onResize };
}

function upgradeSelect(select) {
  if (!select || select.tagName !== "SELECT" || UPGRADED.has(select)) return;

  const isCompact = !select.classList.contains("filter-select");
  const wrap = document.createElement("div");
  wrap.className = `cselect-wrap ${isCompact ? "cselect-compact" : ""}`;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "cselect-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  if (select.id) trigger.dataset.cselectFor = select.id;

  const labelEl = document.createElement("span");
  labelEl.className = "cselect-trigger-label";

  const rightEl = document.createElement("span");
  rightEl.className = "cselect-trigger-right";

  const countEl = document.createElement("span");
  countEl.className = "cselect-trigger-cnt hidden";

  const chevEl = document.createElement("span");
  chevEl.className = "cselect-chevron";
  chevEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

  rightEl.appendChild(countEl);
  rightEl.appendChild(chevEl);
  trigger.appendChild(labelEl);
  trigger.appendChild(rightEl);

  // Move <select> inside wrapper as visually-hidden native control (preserves Playwright & form compatibility)
  const parent = select.parentNode;
  if (!parent) return;
  parent.insertBefore(wrap, select);
  select.classList.add("cselect-native-hidden");
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");
  wrap.appendChild(select);
  wrap.appendChild(trigger);

  // Intercept programmatic `.value = ...` writes so UI always stays 100% synced!
  const protoDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  if (protoDesc?.get && protoDesc?.set) {
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return protoDesc.get.call(this); },
      set(v) {
        protoDesc.set.call(this, v);
        syncCustomSelect(this);
      }
    });
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCustomSelect(select);
  });

  select.addEventListener("change", () => syncCustomSelect(select));

  // Automatically re-sync whenever options are dynamically repopulated via innerHTML
  const observer = new MutationObserver(() => syncCustomSelect(select));
  observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });

  UPGRADED.set(select, { wrap, trigger, labelEl, countEl, observer });
  syncCustomSelect(select);
}

let initialized = false;
export function initCustomSelects() {
  if (initialized) {
    syncAllCustomSelects();
    return;
  }
  initialized = true;
  syncAllCustomSelects();

  // Auto-upgrade any <select> injected dynamically into modals (Rankings, Account, Submit Institution)
  const bodyObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(SELECTOR)) upgradeSelect(node);
        else if (node.querySelectorAll) {
          node.querySelectorAll(SELECTOR).forEach(upgradeSelect);
        }
      }
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}
