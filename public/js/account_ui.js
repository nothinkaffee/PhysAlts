/**
 * PhysAlts — Production Account, Auth Modal, Rich Bookmarks Workspace,
 * Community Institution Submission, and Keyboard Shortcuts UI.
 * Pure neutral grey palette + rgb(160, 70, 70) editorial link accents (zero blue, zero yellow, zero all-caps).
 */

import { STAGE_META, STAGE_PORTALS } from "./config.js";
import { store, mergeHubs, getNodeById } from "./data_store.js";
import {
  getShanghaiRecord, getHubGrasSubjectsSorted, getHubCollaborations
} from "./shanghai_engine.js";
import {
  getAuthSnapshot, getUserInitials, registerAccount, loginAccount,
  signInWithGoogle, requestPasswordReset, logoutAccount, changeAccountPassword,
  updateAccountProfile, toggleBookmark, updateBookmarkMeta, addBookmarkFolder,
  exportAccountPackage, deleteAccountPermanently
} from "./auth_service.js";
import { submitCommunityHub } from "./cloud_sync.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function scorePassword(pw) {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 1, label: "Weak — use 8+ characters with numbers or symbols" };
  if (s === 2) return { score: 2, label: "Fair — add length or mixed case" };
  if (s === 3) return { score: 3, label: "Good password" };
  return { score: 4, label: "Strong password" };
}

export function refreshAccountHeader() {
  const snap = getAuthSnapshot();
  const avatar = document.getElementById("account-avatar");
  const guestIcon = document.getElementById("account-guest-icon");
  const label = document.getElementById("account-btn-label");
  const badge = document.getElementById("account-bm-badge");

  if (snap.isAuthenticated && snap.user) {
    if (avatar) {
      avatar.textContent = getUserInitials(snap.user);
      avatar.classList.remove("hidden");
      avatar.classList.add("inline-flex");
    }
    guestIcon?.classList.add("hidden");
    if (label) {
      const first = (snap.user.displayName || snap.user.email || "Account").split(" ")[0];
      label.textContent = first.length > 14 ? first.slice(0, 14) + "…" : first;
    }
    if (badge) {
      badge.textContent = String(snap.bookmarks.length);
      badge.classList.remove("hidden");
    }
  } else {
    avatar?.classList.add("hidden");
    avatar?.classList.remove("inline-flex");
    guestIcon?.classList.remove("hidden");
    if (label) label.textContent = "Sign in";
    if (badge) {
      if (snap.bookmarks.length > 0) {
        badge.textContent = String(snap.bookmarks.length);
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }
  }
}

export function closeAuthModal() {
  document.getElementById("auth-modal-backdrop")?.classList.add("hidden");
}

export function openAuthModal(initialTab = "signin", { onSuccess, showToast } = {}) {
  const backdrop = document.getElementById("auth-modal-backdrop");
  const body = document.getElementById("auth-modal-body");
  const heading = document.getElementById("auth-modal-heading");
  const sub = document.getElementById("auth-modal-sub");
  if (!backdrop || !body) return;

  backdrop.classList.remove("hidden");
  let tab = initialTab;

  const render = () => {
    const snap = getAuthSnapshot();
    const guestCount = !snap.isAuthenticated ? snap.bookmarks.length : 0;

    if (heading) {
      heading.textContent = tab === "signup"
        ? "Create your account"
        : tab === "reset"
          ? "Reset your password"
          : "Sign in";
    }
    if (sub) {
      sub.textContent = tab === "signup"
        ? "Save bookmarks, study notes, and custom folders across sessions."
        : tab === "reset"
          ? "Enter your account email for password recovery instructions."
          : "Access your saved science & STEM hubs, timelines, and space missions.";
    }

    const tabsHtml = `
      <div class="grid grid-cols-3 gap-1 p-1 rounded-full bg-white/[0.05] border border-white/10">
        <button type="button" data-auth-tab="signin" class="rounded-full py-2 text-[13.5px] whitespace-nowrap transition ${tab === "signin" ? "glass-btn-active" : "text-neutral-300 hover:text-white"}">Sign in</button>
        <button type="button" data-auth-tab="signup" class="rounded-full py-2 text-[13.5px] whitespace-nowrap transition ${tab === "signup" ? "glass-btn-active" : "text-neutral-300 hover:text-white"}">Sign up</button>
        <button type="button" data-auth-tab="reset" class="rounded-full py-2 text-[13.5px] whitespace-nowrap transition ${tab === "reset" ? "glass-btn-active" : "text-neutral-300 hover:text-white"}">Reset</button>
      </div>
    `;

    const guestNotice = guestCount > 0 && tab === "signup"
      ? `<div class="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 text-[14px] text-neutral-300">Your <strong class="text-white">${guestCount} saved guest bookmark${guestCount === 1 ? "" : "s"}</strong> will transfer automatically into your new account.</div>`
      : "";

    let formHtml = "";
    if (tab === "signin") {
      formHtml = `
        <form id="auth-signin-form" class="space-y-4">
          <div class="space-y-1.5">
            <label for="auth-email" class="block text-[14px] text-neutral-300">Email address</label>
            <input id="auth-email" type="email" required autocomplete="email" placeholder="you@university.edu" class="glass-input" />
          </div>
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label for="auth-password" class="block text-[14px] text-neutral-300">Password</label>
              <button type="button" data-auth-tab="reset" class="text-[14px] accent-link cursor-pointer bg-transparent border-0 p-0">Forgot password?</button>
            </div>
            <div class="relative">
              <input id="auth-password" type="password" required autocomplete="current-password" placeholder="Enter your password" class="glass-input pr-16" />
              <button type="button" id="btn-toggle-pw" class="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-neutral-400 hover:text-white cursor-pointer bg-transparent border-0">Show</button>
            </div>
          </div>
          <div id="auth-msg" class="hidden rounded-xl px-4 py-2.5 text-[14px]"></div>
          <button type="submit" id="auth-submit-btn" class="glass-btn-active w-full rounded-full py-3 text-[14px] font-medium cursor-pointer">Sign in</button>
        </form>
      `;
    } else if (tab === "signup") {
      formHtml = `
        <form id="auth-signup-form" class="space-y-4">
          <div class="space-y-1.5">
            <label for="auth-name" class="block text-[14px] text-neutral-300">Full name or handle</label>
            <input id="auth-name" type="text" required minlength="2" maxlength="80" autocomplete="name" placeholder="Ada Lovelace" class="glass-input" />
          </div>
          <div class="space-y-1.5">
            <label for="auth-email" class="block text-[14px] text-neutral-300">Email address</label>
            <input id="auth-email" type="email" required autocomplete="email" placeholder="you@university.edu" class="glass-input" />
          </div>
          <div class="space-y-1.5">
            <label for="auth-password" class="block text-[14px] text-neutral-300">Password (8+ characters)</label>
            <div class="relative">
              <input id="auth-password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" placeholder="Create a strong password" class="glass-input pr-16" />
              <button type="button" id="btn-toggle-pw" class="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-neutral-400 hover:text-white cursor-pointer bg-transparent border-0">Show</button>
            </div>
            <div class="grid grid-cols-4 gap-1.5 pt-1" id="pw-strength-bars">
              <div class="strength-seg"></div>
              <div class="strength-seg"></div>
              <div class="strength-seg"></div>
              <div class="strength-seg"></div>
            </div>
            <div id="pw-strength-label" class="text-[14px] text-neutral-400"></div>
          </div>
          <label class="flex items-start gap-3 text-[14px] text-neutral-300 cursor-pointer leading-snug">
            <input id="auth-consent" type="checkbox" required class="mt-1 accent-neutral-200" />
            <span>I agree to the <a href="./terms.html" target="_blank" class="accent-link">Terms of Service</a> and <a href="./privacy.html" target="_blank" class="accent-link">Privacy Policy</a> (GDPR Art. 17 &amp; 20 data rights included).</span>
          </label>
          <div id="auth-msg" class="hidden rounded-xl px-4 py-2.5 text-[14px]"></div>
          <button type="submit" id="auth-submit-btn" class="glass-btn-active w-full rounded-full py-3 text-[14px] font-medium cursor-pointer">Create account</button>
        </form>
      `;
    } else {
      formHtml = `
        <form id="auth-reset-form" class="space-y-4">
          <div class="space-y-1.5">
            <label for="auth-reset-email" class="block text-[14px] text-neutral-300">Account email</label>
            <input id="auth-reset-email" type="email" required autocomplete="email" placeholder="you@university.edu" class="glass-input" />
          </div>
          <div id="auth-msg" class="hidden rounded-xl px-4 py-2.5 text-[14px]"></div>
          <button type="submit" id="auth-submit-btn" class="glass-btn-active w-full rounded-full py-3 text-[14px] font-medium cursor-pointer">Send recovery instructions</button>
        </form>
      `;
    }

    const googleRow = tab !== "reset" ? `
      <div class="space-y-3 pt-1">
        <div class="flex items-center gap-3 text-[14px] text-neutral-500">
          <div class="h-px bg-white/10 flex-1"></div>
          <span>or</span>
          <div class="h-px bg-white/10 flex-1"></div>
        </div>
        <button type="button" id="btn-google-signin" class="glass-btn w-full rounded-full py-2.5 text-[14px] flex items-center justify-center gap-2.5">
          <span>Continue with Google</span>
          
        </button>
      </div>
    ` : "";

    const backendLabel = snap.backend === "firebase"
      ? "Secured with Firebase Auth & Cloud Firestore"
      : snap.backend === "server"
        ? "Secured with scrypt password hashing & signed sessions"
        : "Secured with browser WebCrypto PBKDF2 local vault";

    body.innerHTML = `
      ${tabsHtml}
      ${guestNotice}
      ${formHtml}
      ${googleRow}
      <div class="text-[14px] text-neutral-500 text-center pt-1">${backendLabel}</div>
    `;

    body.querySelectorAll("[data-auth-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        tab = btn.dataset.authTab;
        render();
      });
    });

    const showMsg = (text, isError = true) => {
      const box = body.querySelector("#auth-msg");
      if (!box) return;
      box.textContent = text;
      box.classList.remove("hidden");
      box.className = isError
        ? "rounded-xl px-4 py-2.5 text-[14px] bg-[rgba(160,70,70,0.18)] border border-[rgba(160,70,70,0.45)] text-[#f0c4c4]"
        : "rounded-xl px-4 py-2.5 text-[14px] bg-white/[0.08] border border-white/20 text-neutral-100";
    };

    const togglePwBtn = body.querySelector("#btn-toggle-pw");
    const pwInput = body.querySelector("#auth-password");
    togglePwBtn?.addEventListener("click", () => {
      if (!pwInput) return;
      const isHidden = pwInput.type === "password";
      pwInput.type = isHidden ? "text" : "password";
      togglePwBtn.textContent = isHidden ? "Hide" : "Show";
    });

    if (tab === "signup" && pwInput) {
      pwInput.addEventListener("input", () => {
        const res = scorePassword(pwInput.value);
        const segs = body.querySelectorAll("#pw-strength-bars .strength-seg");
        segs.forEach((seg, idx) => {
          seg.className = "strength-seg";
          if (idx < res.score) {
            seg.classList.add(res.score <= 1 ? "strength-weak" : res.score <= 2 ? "strength-mid" : "strength-strong");
          }
        });
        const lbl = body.querySelector("#pw-strength-label");
        if (lbl) lbl.textContent = res.label;
      });
    }

    body.querySelector("#btn-google-signin")?.addEventListener("click", async () => {
      const res = await signInWithGoogle();
      if (!res.ok) return showMsg(res.error, true);
      closeAuthModal();
      refreshAccountHeader();
      showToast?.(`Signed in as ${res.user?.displayName || "Explorer"}`);
      onSuccess?.(res.user);
    });

    body.querySelector("#auth-signin-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = body.querySelector("#auth-submit-btn");
      if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
      const res = await loginAccount({
        email: body.querySelector("#auth-email")?.value,
        password: body.querySelector("#auth-password")?.value
      });
      if (!res.ok) {
        if (btn) { btn.disabled = false; btn.textContent = "Sign in"; }
        return showMsg(res.error, true);
      }
      closeAuthModal();
      refreshAccountHeader();
      showToast?.(`Welcome back, ${res.user?.displayName || "Explorer"}`);
      onSuccess?.(res.user);
    });

    body.querySelector("#auth-signup-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = body.querySelector("#auth-submit-btn");
      if (btn) { btn.disabled = true; btn.textContent = "Creating account…"; }
      const res = await registerAccount({
        displayName: body.querySelector("#auth-name")?.value,
        email: body.querySelector("#auth-email")?.value,
        password: body.querySelector("#auth-password")?.value
      });
      if (!res.ok) {
        if (btn) { btn.disabled = false; btn.textContent = "Create account"; }
        return showMsg(res.error, true);
      }
      closeAuthModal();
      refreshAccountHeader();
      showToast?.(`Account created — welcome, ${res.user?.displayName}`);
      onSuccess?.(res.user);
    });

    body.querySelector("#auth-reset-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await requestPasswordReset(body.querySelector("#auth-reset-email")?.value);
      if (!res.ok) return showMsg(res.error, true);
      showMsg(res.message, false);
    });
  };

  render();
}

// =========================================================================
// MY BOOKMARKS, PATHWAYS & ACCOUNT WORKSPACE MODAL
// =========================================================================

export function renderAccountWorkspaceModal(bodyEl, {
  initialTab = "bookmarks",
  onNavigateToBookmark,
  onOpenAuth,
  onStageUpdated,
  onOpenOffline,
  onOpenSubmit,
  onOpenAudit,
  onOpenShortcuts,
  onCloseModal,
  showToast
} = {}) {
  let activeTab = initialTab;
  let activeFolder = "All";
  let searchQuery = "";
  let compareQuery = "";
  let editingNoteId = null;

  const COMPARE_PRESETS = [
    { label: "MIT · Stanford · ETH Zurich", names: ["MIT Physics", "Stanford University", "ETH Zurich"] },
    { label: "CERN · Fermilab · KEK", names: ["CERN", "Fermilab", "KEK"] },
    { label: "DeepMind · OpenAI · Mila", names: ["Google DeepMind", "OpenAI", "Mila"] }
  ];

  const findHubByQueryName = (name) => {
    const low = name.toLowerCase();
    const matches = store.hubs.filter(h => (h.name || "").toLowerCase().includes(low));
    if (!matches.length) return null;
    matches.sort((a, b) => {
      const aSr = getShanghaiRecord(a.id) ? 1 : 0;
      const bSr = getShanghaiRecord(b.id) ? 1 : 0;
      const aTier = a.tier === "flagship" ? 2 : a.tier === "stem" ? 1 : 0;
      const bTier = b.tier === "flagship" ? 2 : b.tier === "stem" ? 1 : 0;
      return (bSr - aSr) || (bTier - aTier) || ((b.impactScore || 0) - (a.impactScore || 0));
    });
    return matches[0];
  };

  const formatCompareType = (h) => h.sector || ({
    uni: "University",
    lab: "National Lab",
    institute: "Research Institute",
    startup: "Deep-Tech Startup",
    company: "Tech Lab",
    project: "Mega-Project"
  }[h.entityType] || "STEM Hub");

  const render = () => {
    const snap = getAuthSnapshot();
    const st = store.state.stage;
    const stageInfo = STAGE_META[st] || STAGE_META.undergrad;
    const portals = STAGE_PORTALS[st] || STAGE_PORTALS.all;
    const cmpIds = Array.isArray(store.state.compareIds) ? store.state.compareIds : (store.state.compareIds = []);

    const navHtml = `
      <div class="flex flex-wrap items-center gap-1.5 pb-4 border-b border-white/10">
        <button type="button" data-ws-tab="bookmarks" class="px-3.5 py-1.5 rounded-full text-[13.5px] whitespace-nowrap transition ${activeTab === "bookmarks" ? "glass-btn-active" : "glass-btn"}">
          Saved (${snap.bookmarks.length})
        </button>
        <button type="button" data-ws-tab="compare" class="px-3.5 py-1.5 rounded-full text-[13.5px] whitespace-nowrap transition ${activeTab === "compare" ? "glass-btn-active" : "glass-btn"}">
          Compare${cmpIds.length ? ` (${cmpIds.length})` : ""}
        </button>
        <button type="button" id="ws-btn-offline" class="px-3.5 py-1.5 rounded-full text-[13.5px] whitespace-nowrap transition glass-btn">
          Offline
        </button>
        <button type="button" data-ws-tab="profile" class="px-3.5 py-1.5 rounded-full text-[13.5px] whitespace-nowrap transition ${activeTab === "profile" ? "glass-btn-active" : "glass-btn"}">
          Profile
        </button>
        <button type="button" data-ws-tab="security" class="px-3.5 py-1.5 rounded-full text-[13.5px] whitespace-nowrap transition ${activeTab === "security" ? "glass-btn-active" : "glass-btn"}">
          Tools
        </button>
      </div>
    `;

    let panelHtml = "";

    if (activeTab === "bookmarks") {
      const authBanner = !snap.isAuthenticated ? `
        <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-0.5">
            <div class="text-[15px] font-medium text-white">Save bookmarks permanently</div>
            <div class="text-[14px] text-neutral-400">Create a free account to keep your bookmarks, folders, and notes across sessions.</div>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" id="ws-btn-signin" class="glass-btn rounded-full px-4 py-2 text-[14px]">Sign in</button>
            <button type="button" id="ws-btn-signup" class="glass-btn-active rounded-full px-4 py-2 text-[14px]">Create account</button>
          </div>
        </div>
      ` : "";

      const folders = ["All", ...snap.folders];
      const filtered = snap.bookmarks.filter(b => {
        if (activeFolder !== "All" && (b.folder || "Shortlist") !== activeFolder) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (b.title || "").toLowerCase().includes(q)
            || (b.subtitle || "").toLowerCase().includes(q)
            || (b.note || "").toLowerCase().includes(q);
        }
        return true;
      });

      const listHtml = filtered.length ? filtered.map(b => {
        const isEditing = editingNoteId === b.id;
        const kindLabel = b.kind === "space" ? "Space Mission" : b.kind === "timeline" ? "Historical Milestone" : b.kind === "material" ? "Open Material" : "STEM Hub";
        const isHub = b.kind === "hub" || (!b.kind && !String(b.id).startsWith("sp-") && !String(b.id).startsWith("tl-"));
        const inCmp = isHub && cmpIds.includes(b.id);
        return `
          <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-[14px] accent-text font-medium">${esc(kindLabel)} · ${esc(b.folder || "Shortlist")}</div>
                <div class="text-[17px] font-semibold text-white mt-0.5">${esc(b.title)}</div>
                ${b.subtitle ? `<div class="text-[14px] text-neutral-400 mt-0.5">${esc(b.subtitle)}</div>` : ""}
              </div>
              <button type="button" data-bm-remove="${esc(b.id)}" aria-label="Remove bookmark" class="glass-btn rounded-full w-8 h-8 flex items-center justify-center text-[14px] shrink-0">✕</button>
            </div>
            ${b.note && !isEditing ? `<div class="rounded-xl bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-neutral-300 leading-relaxed">${esc(b.note)}</div>` : ""}
            ${isEditing ? `
              <div class="space-y-2.5">
                <div class="flex items-center gap-2">
                  <label class="text-[14px] text-neutral-400 shrink-0">Folder:</label>
                  <select data-bm-folder-sel="${esc(b.id)}" class="glass-input py-1.5 text-[14px]">
                    ${snap.folders.map(f => `<option value="${esc(f)}" ${(b.folder || "Shortlist") === f ? "selected" : ""} class="bg-[#111113] text-white">${esc(f)}</option>`).join("")}
                  </select>
                </div>
                <textarea data-bm-note-input="${esc(b.id)}" rows="2" placeholder="Add study notes, application deadlines, or advisor names…" class="glass-input text-[14px]">${esc(b.note || "")}</textarea>
                <div class="flex items-center gap-2">
                  <button type="button" data-bm-save-meta="${esc(b.id)}" class="glass-btn-active rounded-full px-4 py-1.5 text-[14px]">Save note</button>
                  <button type="button" data-bm-cancel-meta class="glass-btn rounded-full px-4 py-1.5 text-[14px]">Cancel</button>
                </div>
              </div>
            ` : `
              <div class="flex flex-wrap items-center gap-2">
                ${b.kind !== "material" ? `<button type="button" data-bm-open="${esc(b.id)}" data-bm-kind="${esc(b.kind)}" class="glass-btn rounded-full px-4 py-1.5 text-[14px]">Open on Globe</button>` : ""}
                ${isHub ? `<button type="button" data-bm-compare="${esc(b.id)}" class="${inCmp ? "glass-btn-active" : "glass-btn"} rounded-full px-3.5 py-1.5 text-[13.5px]">${inCmp ? "Comparing ✓" : "+ Compare"}</button>` : ""}
                ${b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" class="accent-link text-[14px] px-2 py-1">Official Site ↗</a>` : ""}
                <button type="button" data-bm-edit-meta="${esc(b.id)}" class="glass-btn rounded-full px-4 py-1.5 text-[14px] ml-auto">${b.note ? "Edit note" : "+ Note / folder"}</button>
              </div>
            `}
          </div>
        `;
      }).join("") : `
        <div class="rounded-2xl bg-white/[0.03] border border-white/10 p-6 text-center space-y-2">
          <div class="text-[17px] font-medium text-white">${snap.bookmarks.length ? "No bookmarks match this filter" : "No bookmarks yet"}</div>
          <p class="text-[14px] text-neutral-400">Tap <strong class="text-white">Save</strong> on any lab, university, startup, milestone, or space mission to keep it here.</p>
        </div>
      `;

      panelHtml = `
        <div class="space-y-4 pt-4">
          ${authBanner}
          <div class="flex flex-wrap items-center gap-2">
            ${folders.map(f => `
              <button type="button" data-bm-folder="${esc(f)}" class="px-3.5 py-1.5 rounded-full text-[14px] transition ${activeFolder === f ? "glass-btn-active" : "glass-btn"}">${esc(f)}</button>
            `).join("")}
            <button type="button" id="btn-new-folder" class="glass-btn rounded-full px-3.5 py-1.5 text-[14px] text-neutral-300">+ Folder</button>
          </div>
          <div class="flex items-center gap-2.5">
            <input id="bm-search-input" type="text" value="${esc(searchQuery)}" placeholder="Filter saved bookmarks &amp; notes…" class="glass-input py-2 text-[14px]" />
            ${snap.bookmarks.length ? `<button type="button" id="btn-export-bm-csv" class="glass-btn rounded-full px-4 py-2 text-[14px] whitespace-nowrap shrink-0">Export .CSV</button>` : ""}
          </div>
          <div class="space-y-3">${listHtml}</div>
        </div>
      `;
    } else if (activeTab === "compare") {
      const hubs = cmpIds.map(id => getNodeById(id)).filter(Boolean);
      const q = compareQuery.trim().toLowerCase();
      const matches = q.length >= 2
        ? store.hubs
          .filter(h => !cmpIds.includes(h.id) && (
            (h.name || "").toLowerCase().includes(q)
            || (h.city || "").toLowerCase().includes(q)
            || (h.country || "").toLowerCase().includes(q)
          ))
          .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0))
          .slice(0, 6)
        : [];

      const searchResultsHtml = matches.length ? `
        <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-2 space-y-1">
          ${matches.map(h => `
            <button type="button" data-cmp-add="${esc(h.id)}" class="glass-row w-full text-left rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[13.5px]">
              <div class="min-w-0">
                <div class="text-white font-medium truncate">${esc(h.name)}</div>
                <div class="text-[12px] text-neutral-400 truncate">${esc(h.city || h.country || "")}</div>
              </div>
              <span class="accent-text text-[12.5px] font-medium shrink-0">+ Add</span>
            </button>
          `).join("")}
        </div>
      ` : "";

      const presetsHtml = `
        <div class="space-y-2">
          <div class="section-label">Quick Presets</div>
          <div class="flex flex-wrap gap-1.5">
            ${COMPARE_PRESETS.map((p, idx) => `
              <button type="button" data-cmp-preset="${idx}" class="glass-btn rounded-full px-3.5 py-1.5 text-[13px]">${esc(p.label)}</button>
            `).join("")}
          </div>
        </div>
      `;

      const colsHtml = hubs.length ? `
        <div class="grid grid-cols-1 ${hubs.length === 2 ? "sm:grid-cols-2" : hubs.length >= 3 ? "sm:grid-cols-3" : ""} gap-3">
          ${hubs.map(h => {
            const sr = getShanghaiRecord(h.id);
            const grasTop = getHubGrasSubjectsSorted(h.id).slice(0, 3);
            const collabs = getHubCollaborations(h.id, store.hubsById) || [];
            const impact = Math.round(h.impactScore || h._impact?.total || 0);
            const cites = h.citedByCount || h.citations || 0;
            const works = h.worksCount || 0;
            const arxivHref = `https://arxiv.org/search/?query=${encodeURIComponent(h.name)}&searchtype=all`;
            return `
              <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-col justify-between gap-3.5 min-w-0">
                <div class="space-y-3 min-w-0">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-[12px] accent-text font-medium truncate">${esc(formatCompareType(h))}${h.foundedYear ? ` · ${h.foundedYear}` : ""}</div>
                      <div class="text-[15.5px] font-semibold text-white leading-snug mt-0.5 break-words">${esc(h.name)}</div>
                      <div class="text-[12.5px] text-neutral-400 truncate mt-0.5">${esc(h.city || h.country || "")}</div>
                    </div>
                    <button type="button" data-cmp-remove="${esc(h.id)}" aria-label="Remove from compare" class="glass-btn rounded-full w-7 h-7 flex items-center justify-center text-[12px] shrink-0">✕</button>
                  </div>

                  <div class="space-y-2 border-t border-white/10 pt-2.5 text-[12.5px]">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-neutral-400">Impact Score</span>
                      <span class="text-white font-semibold tabular-nums">${impact || "—"}</span>
                    </div>
                    <div class="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                      <div class="h-full rounded-full" style="width:${Math.min(100, Math.max(8, impact))}%;background:rgb(185,90,90);"></div>
                    </div>

                    <div class="flex items-center justify-between gap-2 pt-1">
                      <span class="text-neutral-400">ARWU 2026</span>
                      <span class="text-white font-medium tabular-nums">${sr?.arwu?.r ? `#${esc(sr.arwu.r)}` : "—"}</span>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-neutral-400">Citations</span>
                      <span class="text-white font-medium tabular-nums">${cites ? cites.toLocaleString() : "—"}</span>
                    </div>
                    ${works ? `
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-neutral-400">Indexed Works</span>
                        <span class="text-neutral-200 tabular-nums">${works.toLocaleString()}</span>
                      </div>
                    ` : ""}
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-neutral-400">Collaborators</span>
                      <span class="text-neutral-200 tabular-nums">${collabs.length}</span>
                    </div>
                  </div>

                  ${grasTop.length ? `
                    <div class="space-y-1.5 border-t border-white/10 pt-2.5">
                      <div class="text-[11.5px] text-neutral-400">Top GRAS 2026 Subjects</div>
                      <div class="flex flex-wrap gap-1">
                        ${grasTop.map(g => `
                          <span class="text-[11.5px] px-2 py-0.5 rounded-full bg-white/[0.07] text-neutral-200 truncate max-w-full">${esc(g.name)} #${esc(g.rankLabel)}</span>
                        `).join("")}
                      </div>
                    </div>
                  ` : ""}
                </div>

                <div class="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2.5">
                  <button type="button" data-bm-open="${esc(h.id)}" data-bm-kind="hub" class="glass-btn rounded-full px-3 py-1 text-[12px]">Fly →</button>
                  <a href="${esc(arxivHref)}" target="_blank" rel="noopener noreferrer" class="accent-link text-[12px] px-1.5">arXiv ↗</a>
                  ${h.url ? `<a href="${esc(h.url)}" target="_blank" rel="noopener noreferrer" class="accent-link text-[12px] px-1.5">Site ↗</a>` : ""}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      ` : `
        <div class="rounded-2xl bg-white/[0.03] border border-white/10 p-6 text-center space-y-2">
          <div class="text-[16px] font-medium text-white">Compare up to 3 institutions side by side</div>
          <p class="text-[13.5px] text-neutral-400">Search above, pick a preset below, or tap <strong class="text-white">+ Compare</strong> on any institution card on the globe.</p>
        </div>
      `;

      panelHtml = `
        <div class="space-y-4 pt-4">
          <div class="flex items-center gap-2">
            <input id="cmp-search-input" type="text" value="${esc(compareQuery)}" placeholder="Add institution to compare (max 3)…" class="glass-input py-2 text-[14px]" />
            ${hubs.length ? `<button type="button" id="btn-cmp-clear" class="glass-btn rounded-full px-3.5 py-2 text-[13px] shrink-0">Clear</button>` : ""}
          </div>
          ${searchResultsHtml}
          ${colsHtml}
          ${hubs.length < 2 ? presetsHtml : ""}
        </div>
      `;
    } else if (activeTab === "pathways") {
      panelHtml = `
        <div class="space-y-5 pt-4">
          <div class="space-y-2.5">
            <div class="section-label">Active Career Stage: ${esc(stageInfo.label)}</div>
            <div class="flex flex-wrap gap-2">
              ${Object.entries(STAGE_META).map(([k, v]) => `
                <button type="button" data-pick-stage="${esc(k)}" class="px-3.5 py-1.5 rounded-full text-[14px] transition ${k === st ? "glass-btn-active" : "glass-btn"}">${esc(v.short)}</button>
              `).join("")}
            </div>
          </div>
          <div class="space-y-2.5">
            <div class="section-label">Official Portals &amp; Fellowships</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              ${portals.map(p => `
                <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="glass-row rounded-2xl px-4 py-3 flex items-center justify-between gap-2 text-[14px]">
                  <span class="truncate">${esc(p.name)}</span>
                  <span class="accent-text shrink-0">↗</span>
                </a>
              `).join("")}
            </div>
          </div>
        </div>
      `;
    } else if (activeTab === "profile") {
      if (!snap.isAuthenticated) {
        panelHtml = `
          <div class="pt-6 text-center space-y-4">
            <div class="text-[17px] font-semibold text-white">Sign in to manage your profile</div>
            <p class="text-[14px] text-neutral-400 max-w-sm mx-auto">Set your display name and research interest to personalize your saved collections.</p>
            <div class="flex items-center justify-center gap-3">
              <button type="button" id="ws-btn-signin" class="glass-btn rounded-full px-5 py-2.5 text-[14px]">Sign in</button>
              <button type="button" id="ws-btn-signup" class="glass-btn-active rounded-full px-5 py-2.5 text-[14px]">Create account</button>
            </div>
          </div>
        `;
      } else {
        const u = snap.user;
        panelHtml = `
          <form id="ws-profile-form" class="space-y-4 pt-4">
            <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex items-center gap-4">
              <div class="w-12 h-12 rounded-full bg-white text-black text-[17px] font-semibold flex items-center justify-center shrink-0">${esc(getUserInitials(u))}</div>
              <div class="min-w-0">
                <div class="text-[17px] font-semibold text-white truncate">${esc(u.displayName)}</div>
                <div class="text-[14px] text-neutral-400 truncate">${esc(u.email)}</div>
              </div>
            </div>
            <div class="space-y-1.5">
              <label for="prof-name" class="block text-[14px] text-neutral-300">Display name</label>
              <input id="prof-name" type="text" required minlength="2" maxlength="80" value="${esc(u.displayName)}" class="glass-input" />
            </div>
            <div class="space-y-1.5">
              <label for="prof-focus" class="block text-[14px] text-neutral-300">Primary research interest</label>
              <input id="prof-focus" type="text" maxlength="120" value="${esc(u.researchFocus || "")}" placeholder="e.g., Quantum Optics, AI Alignment, Cosmology" class="glass-input" />
            </div>
            <div class="space-y-1.5">
              <label for="prof-bio" class="block text-[14px] text-neutral-300">Short bio / affiliation (optional)</label>
              <textarea id="prof-bio" rows="2" maxlength="320" placeholder="Optional note about your studies or research goals" class="glass-input">${esc(u.bio || "")}</textarea>
            </div>
            <div class="flex items-center justify-between pt-2">
              <span class="text-[14px] text-neutral-400">Sync: ${snap.backend === "firebase" ? "Cloud Sync" : snap.backend === "server" ? "Server Sync" : "Local Vault"}</span>
              <button type="submit" class="glass-btn-active rounded-full px-5 py-2 text-[14px]">Save profile</button>
            </div>
          </form>
        `;
      }
    } else if (activeTab === "security") {
      panelHtml = `
        <div class="space-y-5 pt-4">
          ${snap.isAuthenticated ? `
            <form id="ws-pw-form" class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
              <div class="text-[15px] font-semibold text-white">Change password</div>
              <input id="sec-cur-pw" type="password" required placeholder="Current password" class="glass-input" />
              <input id="sec-new-pw" type="password" required minlength="8" placeholder="New password (8+ characters)" class="glass-input" />
              <div id="sec-pw-msg" class="hidden text-[14px]"></div>
              <button type="submit" class="glass-btn rounded-full px-4 py-2 text-[14px]">Update password</button>
            </form>
          ` : ""}

          <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
            <div class="text-[15px] font-semibold text-white">Atlas Tools &amp; Open Data</div>
            <div class="flex flex-wrap items-center gap-2.5">
              <button type="button" id="sec-btn-submit" class="glass-btn rounded-full px-4 py-2 text-[14px]">+ Submit Missing Lab</button>
              <button type="button" id="sec-btn-audit" class="glass-btn rounded-full px-4 py-2 text-[14px]">Open Data &amp; Exports</button>
              <button type="button" id="sec-btn-shortcuts" class="glass-btn rounded-full px-4 py-2 text-[14px]">Shortcuts (?)</button>
            </div>
          </div>

          <div class="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
            <div class="text-[15px] font-semibold text-white">Privacy &amp; Data Rights (GDPR)</div>
            <p class="text-[14px] text-neutral-400 leading-relaxed">
              Zero ad trackers and zero GPS location tracking. Export your JSON archive anytime (Article 20) or permanently erase your account and saved bookmarks (Article 17).
            </p>
            <div class="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" id="sec-export-btn" class="glass-btn rounded-full px-4 py-2 text-[14px]">Export My Data (Art. 20)</button>
              <a href="./about.html" target="_blank" class="accent-link text-[14px]">About ↗</a>
              <a href="./privacy.html" target="_blank" class="accent-link text-[14px]">Privacy ↗</a>
              <a href="./terms.html" target="_blank" class="accent-link text-[14px]">Terms ↗</a>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
            ${snap.isAuthenticated ? `<button type="button" id="sec-signout-btn" class="glass-btn rounded-full px-5 py-2 text-[14px]">Sign out</button>` : `<div></div>`}
            <button type="button" id="sec-delete-btn" class="accent-chip rounded-full px-4 py-2 text-[14px]">${snap.isAuthenticated ? "Delete account &amp; data (Art. 17)" : "Erase local data (Art. 17)"}</button>
          </div>
        </div>
      `;
    }

    bodyEl.innerHTML = `${navHtml}${panelHtml}`;

    // Wire tab switching
    bodyEl.querySelectorAll("[data-ws-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.wsTab;
        render();
      });
    });

    // Wire sign-in/up & offline triggers
    bodyEl.querySelector("#ws-btn-signin")?.addEventListener("click", () => onOpenAuth?.("signin"));
    bodyEl.querySelector("#ws-btn-signup")?.addEventListener("click", () => onOpenAuth?.("signup"));
    bodyEl.querySelector("#ws-btn-offline")?.addEventListener("click", () => onOpenOffline?.());

    // Wire tools triggers inside Privacy & Tools tab
    bodyEl.querySelector("#sec-btn-submit")?.addEventListener("click", () => onOpenSubmit?.());
    bodyEl.querySelector("#sec-btn-audit")?.addEventListener("click", () => onOpenAudit?.());
    bodyEl.querySelector("#sec-btn-shortcuts")?.addEventListener("click", () => onOpenShortcuts?.());

    // Wire bookmarks interactions
    bodyEl.querySelectorAll("[data-bm-folder]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeFolder = btn.dataset.bmFolder;
        render();
      });
    });

    bodyEl.querySelector("#btn-new-folder")?.addEventListener("click", async () => {
      const name = window.prompt("New bookmark folder name (e.g., PhD Applications, Quantum Reading):");
      if (name && name.trim()) {
        await addBookmarkFolder(name.trim());
        activeFolder = name.trim();
        render();
        showToast?.(`Created folder "${name.trim()}"`);
      }
    });

    const searchInput = bodyEl.querySelector("#bm-search-input");
    searchInput?.addEventListener("input", () => {
      searchQuery = searchInput.value;
      const pos = searchInput.selectionStart;
      render();
      const el = bodyEl.querySelector("#bm-search-input");
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    });

    bodyEl.querySelector("#btn-export-bm-csv")?.addEventListener("click", () => {
      const rows = [
        ["Title", "Type", "Folder", "Subtitle", "Note", "Official URL", "Saved At"],
        ...snap.bookmarks.map(b => [
          b.title, b.kind, b.folder || "Shortlist", b.subtitle || "", b.note || "", b.url || "",
          new Date(b.savedAt || Date.now()).toISOString()
        ])
      ];
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      downloadBlob(csv, "physics-bookmarks.csv", "text/csv;charset=utf-8");
      showToast?.("Exported physics-bookmarks.csv");
    });

    bodyEl.querySelectorAll("[data-bm-remove]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await toggleBookmark({ id: btn.dataset.bmRemove });
        refreshAccountHeader();
        render();
        showToast?.("Removed bookmark");
      });
    });

    bodyEl.querySelectorAll("[data-bm-edit-meta]").forEach(btn => {
      btn.addEventListener("click", () => {
        editingNoteId = btn.dataset.bmEditMeta;
        render();
      });
    });

    bodyEl.querySelector("[data-bm-cancel-meta]")?.addEventListener("click", () => {
      editingNoteId = null;
      render();
    });

    bodyEl.querySelectorAll("[data-bm-save-meta]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.bmSaveMeta;
        const folder = bodyEl.querySelector(`[data-bm-folder-sel="${id}"]`)?.value;
        const note = bodyEl.querySelector(`[data-bm-note-input="${id}"]`)?.value ?? "";
        await updateBookmarkMeta(id, { folder, note });
        editingNoteId = null;
        render();
        showToast?.("Bookmark note saved");
      });
    });

    bodyEl.querySelectorAll("[data-bm-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        onNavigateToBookmark?.(btn.dataset.bmOpen, btn.dataset.bmKind);
      });
    });

    bodyEl.querySelectorAll("[data-bm-compare]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.bmCompare;
        const list = Array.isArray(store.state.compareIds) ? store.state.compareIds : (store.state.compareIds = []);
        const idx = list.indexOf(id);
        if (idx >= 0) {
          list.splice(idx, 1);
          showToast?.("Removed from Compare");
        } else {
          if (list.length >= 3) list.shift();
          list.push(id);
          showToast?.(`Added to Compare (${list.length}/3)`);
        }
        render();
      });
    });

    const cmpSearch = bodyEl.querySelector("#cmp-search-input");
    cmpSearch?.addEventListener("input", () => {
      compareQuery = cmpSearch.value;
      const pos = cmpSearch.selectionStart;
      render();
      const el = bodyEl.querySelector("#cmp-search-input");
      if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    });

    bodyEl.querySelectorAll("[data-cmp-add]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cmpAdd;
        const list = Array.isArray(store.state.compareIds) ? store.state.compareIds : (store.state.compareIds = []);
        if (!list.includes(id)) {
          if (list.length >= 3) list.shift();
          list.push(id);
        }
        compareQuery = "";
        render();
      });
    });

    bodyEl.querySelectorAll("[data-cmp-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cmpRemove;
        const list = Array.isArray(store.state.compareIds) ? store.state.compareIds : [];
        const idx = list.indexOf(id);
        if (idx >= 0) list.splice(idx, 1);
        render();
      });
    });

    bodyEl.querySelector("#btn-cmp-clear")?.addEventListener("click", () => {
      store.state.compareIds = [];
      compareQuery = "";
      render();
    });

    bodyEl.querySelectorAll("[data-cmp-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        const preset = COMPARE_PRESETS[Number(btn.dataset.cmpPreset)];
        if (!preset) return;
        const ids = preset.names.map(findHubByQueryName).filter(Boolean).map(h => h.id);
        if (ids.length) {
          store.state.compareIds = ids.slice(0, 3);
          compareQuery = "";
          render();
        }
      });
    });

    // Wire profile save
    bodyEl.querySelector("#ws-profile-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await updateAccountProfile({
        displayName: bodyEl.querySelector("#prof-name")?.value,
        researchFocus: bodyEl.querySelector("#prof-focus")?.value,
        bio: bodyEl.querySelector("#prof-bio")?.value
      });
      if (!res.ok) return showToast?.(res.error || "Could not update profile");
      refreshAccountHeader();
      onStageUpdated?.();
      render();
      showToast?.("Profile updated");
    });

    // Wire security actions
    bodyEl.querySelector("#ws-pw-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = bodyEl.querySelector("#sec-pw-msg");
      const res = await changeAccountPassword(
        bodyEl.querySelector("#sec-cur-pw")?.value,
        bodyEl.querySelector("#sec-new-pw")?.value
      );
      if (msg) {
        msg.classList.remove("hidden");
        msg.textContent = res.ok ? "Password updated successfully." : (res.error || "Failed to update password.");
        msg.className = res.ok ? "text-[14px] text-neutral-200" : "text-[14px] accent-text";
      }
      if (res.ok) e.target.reset();
    });

    bodyEl.querySelector("#sec-export-btn")?.addEventListener("click", async () => {
      const pkg = await exportAccountPackage();
      downloadBlob(JSON.stringify(pkg, null, 2), "account-gdpr-export.json", "application/json");
      showToast?.("Downloaded GDPR data export (.json)");
    });

    bodyEl.querySelector("#sec-signout-btn")?.addEventListener("click", async () => {
      await logoutAccount();
      refreshAccountHeader();
      onCloseModal?.();
      showToast?.("Signed out");
    });

    bodyEl.querySelector("#sec-delete-btn")?.addEventListener("click", async () => {
      const ok = window.confirm("Permanently erase your account and all saved bookmarks & notes? This cannot be undone.");
      if (!ok) return;
      await deleteAccountPermanently();
      refreshAccountHeader();
      onStageUpdated?.();
      onCloseModal?.();
      showToast?.("All account data permanently erased");
    });
  };

  render();
}

// =========================================================================
// SUBMIT MISSING INSTITUTION MODAL
// =========================================================================

export function renderSubmitInstitutionModal(bodyEl, { onSubmitted, showToast } = {}) {
  bodyEl.innerHTML = `
    <form id="submit-hub-form" class="space-y-4">
      <p class="text-[14px] text-neutral-400 leading-relaxed">
        Help keep this physics directory complete across every nation. Submit a verified university physics department, national laboratory, private institute, or deep-tech startup.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div class="space-y-1.5 sm:col-span-2">
          <label class="block text-[14px] text-neutral-300">Institution name</label>
          <input id="sub-name" type="text" required minlength="2" maxlength="160" placeholder="e.g., Institute for Quantum Computing" class="glass-input" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-[14px] text-neutral-300">City</label>
          <input id="sub-city" type="text" required maxlength="100" placeholder="Waterloo" class="glass-input" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-[14px] text-neutral-300">Country</label>
          <input id="sub-country" type="text" required maxlength="80" placeholder="Canada" class="glass-input" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-[14px] text-neutral-300">Category</label>
          <select id="sub-type" class="glass-input">
            <option value="uni" class="bg-[#111113]">University Physics Department</option>
            <option value="lab" class="bg-[#111113]">National Lab / Research Facility</option>
            <option value="institute" class="bg-[#111113]">Private Research Institute</option>
            <option value="startup" class="bg-[#111113]">Deep-Tech Company / Startup</option>
          </select>
        </div>
        <div class="space-y-1.5">
          <label class="block text-[14px] text-neutral-300">Official HTTPS website</label>
          <input id="sub-url" type="url" required pattern="https://.*" placeholder="https://example.edu/physics" class="glass-input" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-[14px] text-neutral-300">Latitude (−90 to 90)</label>
          <input id="sub-lat" type="number" step="any" required min="-90" max="90" placeholder="43.4723" class="glass-input" />
        </div>
        <div class="space-y-1.5">
          <label class="block text-[14px] text-neutral-300">Longitude (−180 to 180)</label>
          <input id="sub-lng" type="number" step="any" required min="-180" max="180" placeholder="-80.5449" class="glass-input" />
        </div>
        <div class="space-y-1.5 sm:col-span-2">
          <label class="block text-[14px] text-neutral-300">Physics focus &amp; summary</label>
          <textarea id="sub-summary" rows="3" required maxlength="800" placeholder="Key physics experiments, programs, or research domains at this institution…" class="glass-input"></textarea>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2.5 pt-2">
        <button type="submit" class="glass-btn-active rounded-full px-5 py-2.5 text-[14px]">Add to Atlas</button>
      </div>
    </form>
  `;

  bodyEl.querySelector("#submit-hub-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = bodyEl.querySelector("#sub-name").value.trim();
    const city = bodyEl.querySelector("#sub-city").value.trim();
    const country = bodyEl.querySelector("#sub-country").value.trim();
    const entityType = bodyEl.querySelector("#sub-type").value;
    const url = bodyEl.querySelector("#sub-url").value.trim();
    const lat = Number(bodyEl.querySelector("#sub-lat").value);
    const lng = Number(bodyEl.querySelector("#sub-lng").value);
    const summary = bodyEl.querySelector("#sub-summary").value.trim();

    const node = {
      id: `community-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36)}-${Date.now().toString(36)}`,
      name,
      city: `${city}, ${country}`,
      country,
      lat,
      lng,
      entityType,
      group: entityType === "startup" ? "company" : entityType === "institute" ? "lab" : entityType,
      url,
      summary,
      sourceApi: "Community Submission",
      createdAt: Date.now()
    };

    await submitCommunityHub(node);
    mergeHubs([node], "custom");
    showToast?.(`Added ${name}`);
    onSubmitted?.(node);
  });
}

// =========================================================================
// KEYBOARD SHORTCUTS GUIDE MODAL
// =========================================================================

export function renderKeyboardShortcutsModal(bodyEl) {
  const rows = [
    ["⌘K  or  /", "Open Spotlight Search"],
    ["↑ / ↓  +  Enter", "Navigate & jump inside Spotlight"],
    ["R", "Rabbit Hole — jump to a new discovery"],
    ["1", "Switch to 3D Earth Globe"],
    ["2", "Switch to Space Frontier (0 → 1 Light-Day)"],
    ["T", "Toggle Timeline (1800 BCE → 2045)"],
    ["B", "Open Bookmarks & Account"],
    ["?", "Keyboard Shortcuts"],
    ["Esc", "Close active window"]
  ];

  bodyEl.innerHTML = `
    <div class="space-y-4">
      <p class="text-[14px] text-neutral-400">Navigate quickly from your keyboard.</p>
      <div class="space-y-2">
        ${rows.map(([key, desc]) => `
          <div class="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3 flex items-center justify-between gap-4">
            <span class="text-[14px] text-neutral-200">${esc(desc)}</span>
            <kbd class="px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/15 text-[14px] font-medium text-white shrink-0">${esc(key)}</kbd>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}
