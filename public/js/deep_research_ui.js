/**
 * physY — Deep Research & Agentic Discovery UI (Obsidian Liquid Glass)
 *
 * Renders the unified 3-engine Research Studio inside physY's centered workspace modal:
 *   1. Open Discovery (Free · arXiv + alphaXiv + ROR v2 + OpenAlex + Wikipedia)
 *   2. Gemini Search (Fast · gemini-2.5-flash + Google Search Grounding + Globe Pin Plotting)
 *   3. Gemini Deep Research (Autonomous · Interactions API deep-research-preview-04-2026 / Max)
 *   + 1-Tap "Open in Gemini App ↗" consumer handoff for Google AI Pro / Ultra users (zero API key)
 */

import {
  getGeminiKey,
  setGeminiKey,
  clearGeminiKey,
  hasGeminiKey,
  maskGeminiKey,
  isHubSavedLocally,
  saveDiscoveredHub,
  loadResearchHistory,
  saveResearchHistoryEntry,
  clearResearchHistory,
  buildGeminiAppHandoffPrompt,
  getSuggestedPrompts,
  runOpenAgenticDiscovery,
  runGeminiFastDiscovery,
  runGeminiDeepResearch
} from "./deep_research.js";

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url) {
  const s = String(url || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

/**
 * Lightweight, XSS-safe Markdown renderer tailored for obsidian research dossiers.
 */
function renderSafeMarkdown(md) {
  const raw = String(md || "").trim();
  if (!raw) return "";

  const formatInline = (line) => {
    let s = escHtml(line);
    // Inline markdown links [label](https://...)
    s = s.replace(/\[([^\]]{1,160})\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="accent-link underline decoration-white/20 underline-offset-2">${label} ↗</a>`;
    });
    // Inline code
    s = s.replace(/`([^`]+)`/g, `<code class="px-1.5 py-0.5 rounded bg-white/10 text-neutral-100 text-[12px]">$1</code>`);
    // Bold & italic
    s = s.replace(/\*\*([^*]+)\*\*/g, `<strong class="text-white font-semibold">$1</strong>`);
    s = s.replace(/\*([^*]+)\*/g, `<em class="text-neutral-300 italic">$1</em>`);
    return s;
  };

  const lines = raw.split(/\r?\n/);
  const out = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push(`</ul>`);
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      closeList();
      out.push(`<h4 class="text-[13.5px] font-semibold text-white mt-3.5 mb-1 tracking-tight">${formatInline(trimmed.replace(/^###\s+/, ""))}</h4>`);
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      closeList();
      out.push(`<h3 class="text-[15px] font-semibold text-white mt-4 mb-1.5 tracking-tight">${formatInline(trimmed.replace(/^##\s+/, ""))}</h3>`);
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      closeList();
      out.push(`<h3 class="text-[16px] font-semibold text-white mt-3 mb-1.5 tracking-tight">${formatInline(trimmed.replace(/^#\s+/, ""))}</h3>`);
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      if (!inList) {
        out.push(`<ul class="space-y-1.5 pl-4 list-disc marker:text-neutral-500 text-[13.5px] text-neutral-200 leading-relaxed">`);
        inList = true;
      }
      const item = trimmed.replace(/^([-*•]|\d+\.)\s+/, "");
      out.push(`<li>${formatInline(item)}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="text-[13.5px] text-neutral-200 leading-relaxed">${formatInline(trimmed)}</p>`);
  }
  closeList();
  return out.join("\n");
}

function formatModeLabel(mode) {
  if (mode === "gemini_fast") return "Gemini Search";
  if (mode === "gemini_deep") return "Gemini Deep Research";
  if (mode === "gemini_deep_max") return "Gemini Deep Research Max";
  return "Open Discovery";
}

let activeAbortController = null;

export function cancelActiveDeepResearch() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

/**
 * Render the unified Deep Research Studio inside the centered workspace modal.
 */
export function renderDeepResearchModal(container, initialPayload = null, callbacks = {}) {
  if (!container) return;

  const initObj =
    initialPayload && typeof initialPayload === "object"
      ? initialPayload
      : { query: typeof initialPayload === "string" ? initialPayload : "", hubContext: null };

  let hubContext = initObj.hubContext || null;
  let currentMode = initObj.mode || (hasGeminiKey() ? "gemini_fast" : "open");
  let maxMode = false;
  let currentResult = null;
  let showKeyEditor = false;
  let isRunning = false;
  let elapsedTimer = null;

  const { onPlotHub, onPlotAllHubs, onToast } = callbacks;

  const toast = (msg) => onToast?.(msg);

  container.innerHTML = `
    <div id="dr-root" class="space-y-4">
      <!-- Engine Mode Switcher -->
      <div class="dr-mode-bar" role="tablist" aria-label="Research engine">
        <button type="button" data-dr-mode="open" class="dr-mode-btn">
          <span class="dr-mode-title">Open Discovery</span>
          <span class="dr-mode-sub">Free · arXiv · alphaXiv · ROR</span>
        </button>
        <button type="button" data-dr-mode="gemini_fast" class="dr-mode-btn">
          <span class="dr-mode-title">Gemini Search</span>
          <span class="dr-mode-sub">Fast · Google Grounding</span>
        </button>
        <button type="button" data-dr-mode="gemini_deep" class="dr-mode-btn">
          <span class="dr-mode-title">Deep Research</span>
          <span class="dr-mode-sub">Autonomous Agent · Cited</span>
        </button>
      </div>

      <!-- Compact BYOK Key Strip (shown for Gemini modes or when editing key) -->
      <div id="dr-key-panel" class="hidden dr-card space-y-2.5"></div>

      <!-- Focused Atlas Hub Context Banner -->
      <div id="dr-context-banner" class="hidden dr-context-pill"></div>

      <!-- Prompt Bar + Actions -->
      <form id="dr-form" class="space-y-2.5">
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            id="dr-input"
            type="text"
            autocomplete="off"
            value="${escHtml(initObj.query || "")}"
            placeholder="Ask anything — e.g. emerging EUV labs, latest quantum arXiv papers, polar bases…"
            class="glass-input py-2.5 text-[14px] flex-1 min-w-0"
          />
          <div class="flex items-center gap-1.5 shrink-0">
            <button id="dr-run-btn" type="submit" class="accent-chip rounded-full px-4 py-2.5 text-[13.5px] font-medium cursor-pointer whitespace-nowrap">
              Run Research →
            </button>
            <button id="dr-handoff-btn" type="button" title="Copy an atlas-grounded Deep Research prompt & open Gemini App using your Google AI Pro / Ultra plan (no API key needed)" class="glass-btn rounded-full px-3.5 py-2.5 text-[13px] whitespace-nowrap">
              Gemini App ↗
            </button>
          </div>
        </div>

        <!-- Deep Research Max Toggle (only visible in Deep Research mode) -->
        <div id="dr-deep-opts" class="hidden flex flex-wrap items-center justify-between gap-2 text-[12px] text-neutral-400">
          <label class="inline-flex items-center gap-2 cursor-pointer select-none">
            <input id="dr-max-toggle" type="checkbox" class="popover-checkbox" />
            <span><strong class="text-neutral-200">Deep Research Max</strong> (deep-research-max-preview-04-2026 · extended synthesis)</span>
          </label>
          <span class="text-neutral-500">Runs asynchronously via Interactions API (1–4 min)</span>
        </div>

        <!-- Suggested Prompts -->
        <div id="dr-suggestions" class="flex flex-wrap gap-1.5 pt-0.5"></div>
      </form>

      <!-- Live Progress Panel -->
      <div id="dr-progress" class="hidden dr-card space-y-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="dr-pulse-dot" aria-hidden="true"></span>
            <span id="dr-progress-label" class="text-[13.5px] font-medium text-white truncate">Initializing…</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span id="dr-elapsed" class="text-[12px] text-neutral-400 tabular-nums">00:00</span>
            <button id="dr-cancel-btn" type="button" class="glass-btn rounded-full px-2.5 py-1 text-[12px]">Cancel</button>
          </div>
        </div>
        <div id="dr-thought" class="hidden text-[12.5px] text-neutral-400 leading-relaxed border-t border-white/10 pt-2"></div>
      </div>

      <!-- Error Banner -->
      <div id="dr-error" class="hidden rounded-[16px] border border-[rgba(190,82,82,0.45)] bg-[rgba(160,70,70,0.12)] px-4 py-3 text-[13px] text-neutral-100 leading-relaxed"></div>

      <!-- Results Container -->
      <div id="dr-results" class="space-y-4"></div>

      <!-- Saved Reports History -->
      <div id="dr-history-wrap" class="hidden space-y-2 border-t border-white/10 pt-3.5"></div>
    </div>
  `;

  const elModeBtns = container.querySelectorAll("[data-dr-mode]");
  const elKeyPanel = container.querySelector("#dr-key-panel");
  const elCtxBanner = container.querySelector("#dr-context-banner");
  const elForm = container.querySelector("#dr-form");
  const elInput = container.querySelector("#dr-input");
  const elRunBtn = container.querySelector("#dr-run-btn");
  const elHandoffBtn = container.querySelector("#dr-handoff-btn");
  const elDeepOpts = container.querySelector("#dr-deep-opts");
  const elMaxToggle = container.querySelector("#dr-max-toggle");
  const elSuggestions = container.querySelector("#dr-suggestions");
  const elProgress = container.querySelector("#dr-progress");
  const elProgressLabel = container.querySelector("#dr-progress-label");
  const elElapsed = container.querySelector("#dr-elapsed");
  const elThought = container.querySelector("#dr-thought");
  const elCancelBtn = container.querySelector("#dr-cancel-btn");
  const elError = container.querySelector("#dr-error");
  const elResults = container.querySelector("#dr-results");
  const elHistoryWrap = container.querySelector("#dr-history-wrap");

  function syncModeUi() {
    elModeBtns.forEach((btn) => {
      const active = btn.dataset.drMode === currentMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    const needsKey = currentMode === "gemini_fast" || currentMode === "gemini_deep";
    elDeepOpts.classList.toggle("hidden", currentMode !== "gemini_deep");
    renderKeyPanel(needsKey);

    if (currentMode === "open") elRunBtn.textContent = "Search Free →";
    else if (currentMode === "gemini_fast") elRunBtn.textContent = "Run Gemini →";
    else elRunBtn.textContent = maxMode ? "Run Deep Max →" : "Run Deep Research →";
  }

  function renderKeyPanel(forceShow) {
    const saved = hasGeminiKey();
    if (!forceShow && !showKeyEditor) {
      elKeyPanel.classList.add("hidden");
      return;
    }
    elKeyPanel.classList.remove("hidden");

    if (saved && !showKeyEditor) {
      elKeyPanel.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-[12.5px] text-neutral-300">
            <span class="accent-text font-medium">Gemini API Key</span> · Stored locally on this device (<code class="text-neutral-200">${escHtml(maskGeminiKey())}</code>)
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" id="dr-key-edit" class="glass-btn rounded-full px-2.5 py-1 text-[12px]">Change</button>
            <button type="button" id="dr-key-clear" class="glass-btn rounded-full px-2.5 py-1 text-[12px]">Remove</button>
          </div>
        </div>
      `;
      elKeyPanel.querySelector("#dr-key-edit")?.addEventListener("click", () => {
        showKeyEditor = true;
        renderKeyPanel(true);
      });
      elKeyPanel.querySelector("#dr-key-clear")?.addEventListener("click", () => {
        clearGeminiKey();
        showKeyEditor = false;
        toast("Gemini API key removed from device");
        renderKeyPanel(true);
      });
      return;
    }

    elKeyPanel.innerHTML = `
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-[13px] font-medium text-white">Bring Your Own Google AI Studio Key</div>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" class="text-[12px] accent-link">Get Free / Paid Key ↗</a>
        </div>
        <div class="flex gap-2">
          <input id="dr-key-input" type="password" autocomplete="off" placeholder="Paste Gemini API key (stored strictly in local browser storage)…" value="${escHtml(getGeminiKey())}" class="glass-input py-2 text-[13px] flex-1 min-w-0" />
          <button type="button" id="dr-key-save" class="accent-chip rounded-full px-3.5 py-2 text-[12.5px] font-medium cursor-pointer shrink-0">Save Key</button>
        </div>
        <p class="text-[12px] text-neutral-400 leading-relaxed">
          Google does not allow third-party OAuth to bill consumer Gemini subscriptions directly, but <strong class="text-neutral-200">Google AI Pro/Ultra plans include monthly Cloud API credits</strong> you can apply to your key — or click <strong class="text-neutral-200">Gemini App ↗</strong> to run with your consumer plan at zero API cost.
        </p>
      </div>
    `;
    elKeyPanel.querySelector("#dr-key-save")?.addEventListener("click", () => {
      const val = elKeyPanel.querySelector("#dr-key-input")?.value?.trim() || "";
      if (!val || val.length < 16) {
        toast("Please paste a valid Google AI Studio API key");
        return;
      }
      setGeminiKey(val);
      showKeyEditor = false;
      toast("Gemini API key saved locally on this device");
      renderKeyPanel(true);
    });
  }

  function renderContextBanner() {
    if (!hubContext) {
      elCtxBanner.classList.add("hidden");
      return;
    }
    elCtxBanner.classList.remove("hidden");
    elCtxBanner.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <span class="text-[11.5px] uppercase tracking-wider accent-text font-semibold">Grounded Context</span>
          <div class="text-[13px] text-white font-medium truncate">${escHtml(hubContext.name)} <span class="text-neutral-400 font-normal">· ${escHtml(hubContext.city || hubContext.country || "")}</span></div>
        </div>
        <button type="button" id="dr-clear-ctx" class="glass-btn rounded-full px-2.5 py-1 text-[11.5px] shrink-0">Clear</button>
      </div>
    `;
    elCtxBanner.querySelector("#dr-clear-ctx")?.addEventListener("click", () => {
      hubContext = null;
      renderContextBanner();
      renderSuggestions();
    });
  }

  function renderSuggestions() {
    const prompts = getSuggestedPrompts(hubContext);
    elSuggestions.innerHTML = prompts
      .map(
        (p) =>
          `<button type="button" class="dr-suggest-chip" data-suggest="${escHtml(p)}">${escHtml(p)}</button>`
      )
      .join("");
    elSuggestions.querySelectorAll("[data-suggest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        elInput.value = btn.dataset.suggest || "";
        executeResearch();
      });
    });
  }

  function renderResults(res) {
    currentResult = res;
    if (!res) {
      elResults.innerHTML = "";
      return;
    }

    const parts = [];

    // 1. Main Synthesized Report (always lead with actual research synthesis & overview)
    parts.push(`
      <section class="dr-card space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="dr-badge dr-badge-accent">${escHtml(formatModeLabel(res.mode))}</span>
            <span class="text-[12px] text-neutral-400 truncate">${escHtml(res.query)}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" id="dr-copy-md" class="glass-btn rounded-full px-2.5 py-1 text-[12px]">Copy MD</button>
            <button type="button" id="dr-download-md" class="glass-btn rounded-full px-2.5 py-1 text-[12px]">Export .md</button>
          </div>
        </div>
        <div class="dr-markdown space-y-2">${renderSafeMarkdown(res.markdown)}</div>
      </section>
    `);

    // 2. Live arXiv + alphaXiv Preprint Papers (strictly relevance-filtered!)
    const arxivPapers = res.arxivPapers || [];
    if (arxivPapers.length) {
      parts.push(`
        <section class="dr-card space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="section-label">arXiv &amp; alphaXiv Preprints (${arxivPapers.length})</div>
              <div class="text-[12px] text-neutral-400">Title &amp; abstract matched preprints — 1-tap alphaXiv, arXiv &amp; PDF</div>
            </div>
          </div>
          <div class="space-y-2">
            ${arxivPapers
              .map(
                (p) => `
                  <article class="dr-paper-item">
                    <div class="flex flex-wrap items-center gap-1.5 text-[11.5px] text-neutral-400">
                      <span class="dr-badge dr-badge-accent">arXiv:${escHtml(p.arxivId)}</span>
                      ${p.year ? `<span>${escHtml(p.year)}</span>` : ""}
                      ${p.category ? `<span class="truncate">· ${escHtml(p.category)}</span>` : ""}
                      ${p.citations ? `<span>· ${p.citations.toLocaleString()} cites</span>` : ""}
                    </div>
                    <div class="text-[13.5px] font-semibold text-white leading-snug mt-1">${escHtml(p.title)}</div>
                    <div class="text-[12px] text-neutral-400 mt-0.5 truncate">${escHtml(p.authors)}</div>
                    ${p.abstract ? `<p class="text-[12.5px] text-neutral-300 leading-relaxed line-clamp-2 mt-1">${escHtml(p.abstract)}</p>` : ""}
                    <div class="flex flex-wrap items-center gap-2 pt-2">
                      <a href="${escHtml(p.alphaXivUrl)}" target="_blank" rel="noopener noreferrer" class="accent-chip rounded-full px-2.5 py-1 text-[11.5px] font-medium inline-flex items-center gap-1">alphaXiv ↗</a>
                      <a href="${escHtml(p.arxivUrl)}" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-2.5 py-1 text-[11.5px] inline-flex items-center gap-1">arXiv ↗</a>
                      <a href="${escHtml(p.pdfUrl)}" target="_blank" rel="noopener noreferrer" class="glass-btn rounded-full px-2.5 py-1 text-[11.5px] inline-flex items-center gap-1">PDF ↗</a>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `);
    }

    // 3. Verified Related & Discovered Institutions Ready to Fly / Plot on the 3D Globe
    const hubs = res.discoveredHubs || [];
    if (hubs.length) {
      const newCount = hubs.filter((h) => !h.alreadyInAtlas).length;
      parts.push(`
        <section class="dr-card space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="section-label">${newCount > 0 ? "Discovered &amp; Related Institutions" : "Related Institutions"} (${hubs.length})</div>
              <div class="text-[12px] text-neutral-400">${newCount > 0 ? `${newCount} new verified pin${newCount === 1 ? "" : "s"} ready to plot on the 3D globe` : "Verified collaborators &amp; nearby labs on the 3D globe"}</div>
            </div>
            ${newCount > 0 ? `
              <button type="button" id="dr-plot-all" class="accent-chip rounded-full px-3 py-1.5 text-[12px] font-medium cursor-pointer shrink-0">
                Plot New (${newCount})
              </button>
            ` : ""}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${hubs
              .map((h, idx) => {
                const saved = isHubSavedLocally(h.id);
                return `
                  <div class="dr-hub-item">
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-[13px] font-semibold text-white truncate">${escHtml(h.name)}</span>
                        ${h.alreadyInAtlas ? `<span class="dr-badge shrink-0">In Atlas</span>` : `<span class="dr-badge dr-badge-accent shrink-0">New</span>`}
                      </div>
                      <div class="text-[12px] text-neutral-400 truncate mt-0.5">${escHtml(h.city || h.country)}${h.branch ? ` · ${escHtml(h.branch)}` : ""}</div>
                      <div class="text-[12px] text-neutral-300 line-clamp-2 mt-1 leading-snug">${escHtml(h.summary)}</div>
                    </div>
                    <div class="flex items-center gap-1.5 pt-2">
                      <button type="button" data-plot-idx="${idx}" class="glass-btn rounded-full px-2.5 py-1 text-[11.5px] font-medium text-white">${h.alreadyInAtlas ? "Fly →" : "Plot & Fly →"}</button>
                      ${
                        !h.alreadyInAtlas
                          ? `<button type="button" data-save-idx="${idx}" class="glass-btn rounded-full px-2.5 py-1 text-[11.5px] ${saved ? "accent-text" : "text-neutral-300"}">${saved ? "✓ Saved" : "+ Save"}</button>`
                          : ""
                      }
                      ${safeHref(h.url) ? `<a href="${escHtml(safeHref(h.url))}" target="_blank" rel="noopener noreferrer" class="text-[11.5px] accent-link ml-auto">Site ↗</a>` : ""}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </section>
      `);
    }

    // 4. Verified Grounding / Academic Sources
    const sources = res.sources || [];
    if (sources.length) {
      parts.push(`
        <section class="dr-card space-y-2">
          <div class="section-label">Verified Citations &amp; Grounding Sources (${sources.length})</div>
          <div class="flex flex-wrap gap-1.5">
            ${sources
              .map((s) => {
                const href = safeHref(s.url);
                if (!href) return "";
                return `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" class="dr-source-chip" title="${escHtml(s.meta || "")}">
                  <span class="truncate max-w-[260px]">${escHtml(s.title)}</span>
                  <span class="accent-text shrink-0">↗</span>
                </a>`;
              })
              .join("")}
          </div>
        </section>
      `);
    }

    elResults.innerHTML = parts.join("");

    // Bind plot / save / export buttons
    elResults.querySelector("#dr-plot-all")?.addEventListener("click", () => {
      hubs.forEach((h) => saveDiscoveredHub(h));
      onPlotAllHubs?.(hubs);
      renderResults(res);
    });
    elResults.querySelectorAll("[data-plot-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const h = hubs[Number(btn.dataset.plotIdx)];
        if (!h) return;
        saveDiscoveredHub(h);
        onPlotHub?.(h);
      });
    });
    elResults.querySelectorAll("[data-save-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const h = hubs[Number(btn.dataset.saveIdx)];
        if (!h) return;
        saveDiscoveredHub(h);
        toast(`Saved "${h.name}" to your 3D Atlas`);
        renderResults(res);
      });
    });
    elResults.querySelector("#dr-copy-md")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(res.markdown || "");
        toast("Research report copied as Markdown");
      } catch {
        toast("Copy failed — use Export .md instead");
      }
    });
    elResults.querySelector("#dr-download-md")?.addEventListener("click", () => {
      const slug = (res.query || "physalt-research").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
      const blob = new Blob([`# ${res.query}\n\n${res.markdown || ""}\n`], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `physalt-${slug}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Downloaded Markdown report");
    });
  }

  function renderHistory() {
    const history = loadResearchHistory();
    if (!history.length) {
      elHistoryWrap.classList.add("hidden");
      return;
    }
    elHistoryWrap.classList.remove("hidden");
    elHistoryWrap.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="section-label">Saved Research Dossiers (${history.length})</div>
        <button type="button" id="dr-clear-hist" class="text-[12px] text-neutral-400 hover:text-white bg-transparent border-0 cursor-pointer">Clear</button>
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${history
          .map(
            (item, idx) => `
              <button type="button" data-hist-idx="${idx}" class="dr-suggest-chip">
                <span class="accent-text font-medium">${escHtml(formatModeLabel(item.mode))}</span> · ${escHtml(item.query.slice(0, 56))}
              </button>
            `
          )
          .join("")}
      </div>
    `;
    elHistoryWrap.querySelector("#dr-clear-hist")?.addEventListener("click", () => {
      clearResearchHistory();
      renderHistory();
    });
    elHistoryWrap.querySelectorAll("[data-hist-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entry = history[Number(btn.dataset.histIdx)];
        if (!entry) return;
        elInput.value = entry.query || "";
        renderResults(entry);
      });
    });
  }

  function setRunningState(running, label = "") {
    isRunning = running;
    elRunBtn.disabled = running;
    elProgress.classList.toggle("hidden", !running);
    elError.classList.add("hidden");
    if (running) {
      elProgressLabel.textContent = label || "Running research agent…";
      elThought.classList.add("hidden");
      elThought.textContent = "";
      const start = Date.now();
      elElapsed.textContent = "00:00";
      clearInterval(elapsedTimer);
      elapsedTimer = setInterval(() => {
        const s = Math.floor((Date.now() - start) / 1000);
        const mm = String(Math.floor(s / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        elElapsed.textContent = `${mm}:${ss}`;
      }, 1000);
    } else {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  async function executeResearch() {
    const query = elInput.value.trim();
    if (!query) {
      toast("Enter a research question or topic first");
      elInput.focus();
      return;
    }

    if ((currentMode === "gemini_fast" || currentMode === "gemini_deep") && !hasGeminiKey()) {
      showKeyEditor = true;
      renderKeyPanel(true);
      elError.textContent =
        "Paste a Google AI Studio API key above to run Gemini directly in physY — or switch to Open Discovery (free, includes arXiv & alphaXiv) or tap Gemini App ↗.";
      elError.classList.remove("hidden");
      return;
    }

    cancelActiveDeepResearch();
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    setRunningState(true, currentMode === "open" ? "Querying arXiv, alphaXiv, ROR & OpenAlex…" : "Launching Gemini agent…");

    try {
      let result;
      if (currentMode === "open") {
        result = await runOpenAgenticDiscovery(query, {
          hubContext,
          signal,
          onProgress: (msg) => {
            elProgressLabel.textContent = msg;
          }
        });
      } else if (currentMode === "gemini_fast") {
        result = await runGeminiFastDiscovery(query, {
          hubContext,
          signal,
          onProgress: (msg) => {
            elProgressLabel.textContent = msg;
          }
        });
      } else {
        result = await runGeminiDeepResearch(query, {
          hubContext,
          maxMode,
          signal,
          onProgress: (msg, thought) => {
            elProgressLabel.textContent = msg;
            if (thought) {
              elThought.textContent = thought;
              elThought.classList.remove("hidden");
            }
          }
        });
      }

      saveResearchHistoryEntry(result);
      renderResults(result);
      renderHistory();
      toast(
        result.discoveredHubs?.length
          ? `Found ${result.discoveredHubs.length} institutions & ${result.arxivPapers?.length || 0} arXiv/alphaXiv papers`
          : "Research synthesis ready"
      );
    } catch (err) {
      if (err?.name === "AbortError") {
        toast("Research cancelled");
      } else {
        elError.textContent = err?.message || "Research request failed. Please try again.";
        elError.classList.remove("hidden");
      }
    } finally {
      setRunningState(false);
      activeAbortController = null;
    }
  }

  // Event bindings
  elModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isRunning) return;
      currentMode = btn.dataset.drMode;
      syncModeUi();
    });
  });

  elMaxToggle?.addEventListener("change", () => {
    maxMode = Boolean(elMaxToggle.checked);
    syncModeUi();
  });

  elForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    executeResearch();
  });

  elCancelBtn?.addEventListener("click", () => {
    cancelActiveDeepResearch();
    setRunningState(false);
  });

  elHandoffBtn?.addEventListener("click", async () => {
    const q = elInput.value.trim() || (hubContext ? `Deep research dossier on ${hubContext.name}` : "Frontier physics and engineering labs");
    const brief = buildGeminiAppHandoffPrompt(q, hubContext);
    try {
      await navigator.clipboard.writeText(brief);
      toast("Prompt copied! Paste into Gemini App (Deep Research) to use your Google AI plan");
    } catch {
      toast("Opening Gemini App…");
    }
    window.open("https://gemini.google.com/app", "_blank", "noopener,noreferrer");
  });

  // Initial render
  renderContextBanner();
  renderSuggestions();
  syncModeUi();
  renderHistory();

  if (initObj.autoRun && initObj.query) {
    executeResearch();
  } else if (!initObj.query) {
    const recent = loadResearchHistory()[0];
    if (recent) renderResults(recent);
  }
}
