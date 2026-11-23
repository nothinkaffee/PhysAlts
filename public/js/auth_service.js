/**
 * PhysAlts — Production Account, Authentication & Rich Bookmarks Service
 * Supports 3 seamless backends in priority order:
 *   1) Firebase Auth + Cloud Firestore (when PROD_FIREBASE_CONFIG is configured)
 *   2) Live PhysAlts Server API (./api/auth/* & ./api/account/* — scrypt + HMAC-SHA256)
 *   3) Static WebCrypto PBKDF2 Local Vault (for static CDN hosting before Firebase setup)
 *
 * Works identically on normal HTTPS origins AND inside blob: preview frames (relative ./api/*).
 */

import { SUBJECT_CONFIG } from "./config.js";
import { store } from "./data_store.js";
import { loadLocalPrefs, saveLocalPrefs } from "./cloud_sync.js";

const DEFAULT_FOLDERS = ["Shortlist", "Study List", "Apply & Jobs", "Research"];
const TOKEN_KEY = `${SUBJECT_CONFIG.storagePrefix}session_token`;
const GUEST_BOOKMARKS_KEY = `${SUBJECT_CONFIG.storagePrefix}guest_bookmarks`;
const GUEST_FOLDERS_KEY = `${SUBJECT_CONFIG.storagePrefix}guest_folders`;
const VAULT_USERS_KEY = `${SUBJECT_CONFIG.storagePrefix}local_vault_users`;
const VAULT_ACTIVE_KEY = `${SUBJECT_CONFIG.storagePrefix}local_vault_uid`;

const listeners = new Set();

const authState = {
  backend: "detecting", // "firebase" | "server" | "vault"
  user: null,
  token: null,
  bookmarks: [],
  folders: [...DEFAULT_FOLDERS],
  ready: false,
  firebaseCtx: null // { auth, db, fns, appId } when Firebase Auth is live
};

function emit() {
  // Keep legacy store.state.shortlist Set synchronized for globe markers & pathways
  const ids = new Set(authState.bookmarks.map(b => b.id));
  store.state.shortlist = ids;
  store.state.bookmarks = authState.bookmarks;
  store.state.folders = authState.folders;
  store.state.user = authState.user;
  store.state.authBackend = authState.backend;

  for (const fn of listeners) {
    try { fn(getAuthSnapshot()); } catch {}
  }
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAuthSnapshot() {
  return {
    backend: authState.backend,
    user: authState.user,
    isAuthenticated: Boolean(authState.user),
    bookmarks: authState.bookmarks,
    folders: authState.folders,
    ready: authState.ready,
    hasGoogleAuth: authState.backend === "firebase"
  };
}

export function getUserInitials(user = authState.user) {
  if (!user) return "";
  const name = (user.displayName || user.email || "U").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function loadGuestBookmarks() {
  try {
    const raw = localStorage.getItem(GUEST_BOOKMARKS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
    // Migrate legacy shortlist IDs into rich bookmark objects
    const prefs = loadLocalPrefs();
    if (Array.isArray(prefs.shortlist) && prefs.shortlist.length) {
      return prefs.shortlist.map(id => ({
        id,
        kind: id.startsWith("sp-") ? "space" : id.startsWith("tl-") ? "timeline" : "hub",
        title: id,
        subtitle: "",
        url: "",
        folder: "Shortlist",
        note: "",
        savedAt: Date.now()
      }));
    }
  } catch {}
  return [];
}

function loadGuestFolders() {
  try {
    const raw = localStorage.getItem(GUEST_FOLDERS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch {}
  return [...DEFAULT_FOLDERS];
}

function saveGuestBookmarks() {
  try {
    localStorage.setItem(GUEST_BOOKMARKS_KEY, JSON.stringify(authState.bookmarks));
    localStorage.setItem(GUEST_FOLDERS_KEY, JSON.stringify(authState.folders));
    saveLocalPrefs(store.state.stage, authState.bookmarks.map(b => b.id));
  } catch {}
}

function getStoredToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

function setStoredToken(tok) {
  authState.token = tok || null;
  try {
    if (tok) localStorage.setItem(TOKEN_KEY, tok);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function apiFetch(relPath, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const tok = authState.token || getStoredToken();
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  const res = await fetch(relPath, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// =========================================================================
// STATIC WEBCRYPTO PBKDF2 VAULT (Fallback for static CDN hosting)
// =========================================================================

async function pbkdf2Hex(password, saltHex) {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" }, keyMat, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

function readVaultUsers() {
  try {
    return JSON.parse(localStorage.getItem(VAULT_USERS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeVaultUsers(map) {
  try { localStorage.setItem(VAULT_USERS_KEY, JSON.stringify(map)); } catch {}
}

function hydrateFromUser(user) {
  authState.user = user;
  authState.bookmarks = Array.isArray(user.bookmarks) ? user.bookmarks : [];
  authState.folders = Array.isArray(user.folders) && user.folders.length ? user.folders : [...DEFAULT_FOLDERS];
  if (user.stage) store.state.stage = user.stage;
  saveLocalPrefs(store.state.stage, authState.bookmarks.map(b => b.id));
  emit();
}

// =========================================================================
// INITIALIZATION
// =========================================================================

export async function initAuth() {
  // Load guest bookmarks immediately so UI is responsive on frame 1
  authState.bookmarks = loadGuestBookmarks();
  authState.folders = loadGuestFolders();
  authState.token = getStoredToken();
  emit();

  // 1. Check Firebase config first
  const cfgRaw = typeof window.__firebase_config !== "undefined" ? window.__firebase_config : null;
  if (cfgRaw) {
    try {
      const firebaseConfig = typeof cfgRaw === "string" ? JSON.parse(cfgRaw) : cfgRaw;
      const [fbApp, fbAuth, fbStore] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js")
      ]);
      const fns = { ...fbApp, ...fbAuth, ...fbStore };
      const existing = fns.getApps?.() || [];
      const app = existing.length ? existing[0] : fns.initializeApp(firebaseConfig);
      const auth = fns.getAuth(app);
      const db = fns.getFirestore(app);
      const appId = typeof window.__app_id !== "undefined" ? window.__app_id : "physalts-default";
      authState.firebaseCtx = { auth, db, fns, appId };
      authState.backend = "firebase";

      await new Promise((resolve) => {
        let settled = false;
        fns.onAuthStateChanged(auth, async (fbUser) => {
          if (fbUser && !fbUser.isAnonymous) {
            try {
              const ref = fns.doc(db, "artifacts", appId, "users", fbUser.uid, "profile", "prefs");
              const snap = await fns.getDoc(ref);
              const d = snap.exists() ? snap.data() : {};
              hydrateFromUser({
                id: fbUser.uid,
                email: fbUser.email || "",
                displayName: d.displayName || fbUser.displayName || (fbUser.email || "").split("@")[0] || "Explorer",
                bio: d.bio || "",
                researchFocus: d.researchFocus || "",
                stage: d.stage || store.state.stage || "undergrad",
                folders: Array.isArray(d.folders) && d.folders.length ? d.folders : [...DEFAULT_FOLDERS],
                bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks : [],
                shortlist: Array.isArray(d.shortlist) ? d.shortlist : [],
                createdAt: d.createdAt || Date.now(),
                updatedAt: d.updatedAt || Date.now()
              });
            } catch {
              hydrateFromUser({
                id: fbUser.uid,
                email: fbUser.email || "",
                displayName: fbUser.displayName || (fbUser.email || "").split("@")[0] || "Explorer",
                bio: "",
                researchFocus: "",
                stage: store.state.stage || "undergrad",
                folders: [...DEFAULT_FOLDERS],
                bookmarks: loadGuestBookmarks(),
                shortlist: []
              });
            }
          } else {
            authState.user = null;
            authState.bookmarks = loadGuestBookmarks();
            authState.folders = loadGuestFolders();
            emit();
          }
          if (!settled) {
            settled = true;
            authState.ready = true;
            emit();
            resolve();
          }
        });
      });
      return getAuthSnapshot();
    } catch (err) {
      console.warn("Firebase Auth init failed, falling back to server/vault:", err?.message || err);
    }
  }

  // 2. Probe live PhysAlts server API (./api/auth/me)
  try {
    const res = await apiFetch("./api/auth/me", { method: "GET" });
    if (res.ok && res.data && typeof res.data.authenticated === "boolean") {
      authState.backend = "server";
      if (res.data.authenticated && res.data.user) {
        hydrateFromUser(res.data.user);
      } else {
        if (authState.token) setStoredToken(null);
        authState.user = null;
      }
      authState.ready = true;
      emit();
      return getAuthSnapshot();
    }
  } catch {}

  // 3. Static WebCrypto PBKDF2 local vault fallback
  authState.backend = "vault";
  try {
    const activeUid = localStorage.getItem(VAULT_ACTIVE_KEY);
    if (activeUid) {
      const users = readVaultUsers();
      if (users[activeUid]) hydrateFromUser(users[activeUid]);
    }
  } catch {}
  authState.ready = true;
  emit();
  return getAuthSnapshot();
}

// =========================================================================
// AUTH ACTIONS: REGISTER / LOGIN / GOOGLE / RESET / LOGOUT / PASSWORD
// =========================================================================

export async function registerAccount({ email, password, displayName }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(displayName || cleanEmail.split("@")[0]).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (cleanName.length < 2) {
    return { ok: false, error: "Display name must be at least 2 characters." };
  }

  const guestBookmarks = [...authState.bookmarks];
  const guestShortlist = guestBookmarks.map(b => b.id);

  if (authState.backend === "firebase" && authState.firebaseCtx) {
    try {
      const { auth, db, fns, appId } = authState.firebaseCtx;
      const cred = await fns.createUserWithEmailAndPassword(auth, cleanEmail, password);
      if (fns.updateProfile) await fns.updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
      const profile = {
        displayName: cleanName,
        bio: "",
        researchFocus: "",
        stage: store.state.stage || "undergrad",
        folders: [...authState.folders],
        bookmarks: guestBookmarks,
        shortlist: guestShortlist,
        gdprConsentAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const ref = fns.doc(db, "artifacts", appId, "users", cred.user.uid, "profile", "prefs");
      await fns.setDoc(ref, profile, { merge: true });
      hydrateFromUser({ id: cred.user.uid, email: cleanEmail, ...profile });
      return { ok: true, user: authState.user };
    } catch (err) {
      return { ok: false, error: formatFirebaseError(err) };
    }
  }

  if (authState.backend === "server") {
    const res = await apiFetch("./api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: cleanEmail,
        password,
        displayName: cleanName,
        stage: store.state.stage || "undergrad",
        initialBookmarks: guestBookmarks,
        initialShortlist: guestShortlist
      })
    });
    if (!res.ok || !res.data?.ok) {
      return { ok: false, error: res.data?.error || "Could not create account." };
    }
    setStoredToken(res.data.token);
    hydrateFromUser(res.data.user);
    return { ok: true, user: authState.user };
  }

  // Vault fallback
  const users = readVaultUsers();
  if (Object.values(users).some(u => u.email === cleanEmail)) {
    return { ok: false, error: "An account with this email already exists." };
  }
  const id = `vault_${randomHex(8)}`;
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(password, salt);
  const now = Date.now();
  const user = {
    id,
    email: cleanEmail,
    displayName: cleanName,
    bio: "",
    researchFocus: "",
    stage: store.state.stage || "undergrad",
    folders: [...authState.folders],
    bookmarks: guestBookmarks,
    shortlist: guestShortlist,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    updatedAt: now
  };
  users[id] = user;
  writeVaultUsers(users);
  localStorage.setItem(VAULT_ACTIVE_KEY, id);
  hydrateFromUser(user);
  return { ok: true, user: authState.user };
}

export async function loginAccount({ email, password }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { ok: false, error: "Please enter both your email and password." };
  }

  if (authState.backend === "firebase" && authState.firebaseCtx) {
    try {
      const { auth, fns } = authState.firebaseCtx;
      await fns.signInWithEmailAndPassword(auth, cleanEmail, password);
      return { ok: true, user: authState.user };
    } catch (err) {
      return { ok: false, error: formatFirebaseError(err) };
    }
  }

  if (authState.backend === "server") {
    const res = await apiFetch("./api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: cleanEmail, password })
    });
    if (!res.ok || !res.data?.ok) {
      return { ok: false, error: res.data?.error || "Incorrect email or password." };
    }
    setStoredToken(res.data.token);
    hydrateFromUser(res.data.user);
    return { ok: true, user: authState.user };
  }

  // Vault fallback
  const users = readVaultUsers();
  const found = Object.values(users).find(u => u.email === cleanEmail);
  if (!found) return { ok: false, error: "Incorrect email or password." };
  const hash = await pbkdf2Hex(password, found.passwordSalt);
  if (hash !== found.passwordHash) return { ok: false, error: "Incorrect email or password." };
  localStorage.setItem(VAULT_ACTIVE_KEY, found.id);
  hydrateFromUser(found);
  return { ok: true, user: authState.user };
}

export async function signInWithGoogle() {
  if (authState.backend !== "firebase" || !authState.firebaseCtx) {
    return {
      ok: false,
      error: "Google Sign-In activates automatically once Firebase Auth is connected in production. Use Email & Password right now."
    };
  }
  try {
    const { auth, fns } = authState.firebaseCtx;
    const provider = new fns.GoogleAuthProvider();
    await fns.signInWithPopup(auth, provider);
    return { ok: true, user: authState.user };
  } catch (err) {
    return { ok: false, error: formatFirebaseError(err) };
  }
}

export async function requestPasswordReset(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (authState.backend === "firebase" && authState.firebaseCtx) {
    try {
      const { auth, fns } = authState.firebaseCtx;
      await fns.sendPasswordResetEmail(auth, cleanEmail);
      return { ok: true, message: `Password reset email sent to ${cleanEmail}.` };
    } catch (err) {
      return { ok: false, error: formatFirebaseError(err) };
    }
  }
  return {
    ok: true,
    message: "In self-hosted/local mode, sign in and use Security → Change Password, or connect Firebase Auth to send reset emails."
  };
}

export async function logoutAccount() {
  if (authState.backend === "firebase" && authState.firebaseCtx) {
    await authState.firebaseCtx.fns.signOut(authState.firebaseCtx.auth).catch(() => {});
  } else if (authState.backend === "server") {
    await apiFetch("./api/auth/logout", { method: "POST" }).catch(() => {});
    setStoredToken(null);
  } else {
    try { localStorage.removeItem(VAULT_ACTIVE_KEY); } catch {}
  }
  authState.user = null;
  authState.bookmarks = loadGuestBookmarks();
  authState.folders = loadGuestFolders();
  emit();
  return { ok: true };
}

export async function changeAccountPassword(currentPassword, newPassword) {
  if (!authState.user) return { ok: false, error: "Sign in required." };
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }

  if (authState.backend === "firebase" && authState.firebaseCtx) {
    try {
      const { auth, fns } = authState.firebaseCtx;
      const cred = fns.EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await fns.reauthenticateWithCredential(auth.currentUser, cred);
      await fns.updatePassword(auth.currentUser, newPassword);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: formatFirebaseError(err) };
    }
  }

  if (authState.backend === "server") {
    const res = await apiFetch("./api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!res.ok || !res.data?.ok) return { ok: false, error: res.data?.error || "Password update failed." };
    setStoredToken(res.data.token);
    return { ok: true };
  }

  const users = readVaultUsers();
  const u = users[authState.user.id];
  if (!u) return { ok: false, error: "Account not found." };
  const check = await pbkdf2Hex(currentPassword, u.passwordSalt);
  if (check !== u.passwordHash) return { ok: false, error: "Current password is incorrect." };
  u.passwordSalt = randomHex(16);
  u.passwordHash = await pbkdf2Hex(newPassword, u.passwordSalt);
  u.updatedAt = Date.now();
  writeVaultUsers(users);
  return { ok: true };
}

// =========================================================================
// PROFILE & RICH BOOKMARKS PERSISTENCE
// =========================================================================

async function persistAccountBookmarks() {
  const shortlist = authState.bookmarks.map(b => b.id);
  if (!authState.user) {
    saveGuestBookmarks();
    return;
  }

  authState.user.bookmarks = authState.bookmarks;
  authState.user.folders = authState.folders;
  authState.user.shortlist = shortlist;
  authState.user.updatedAt = Date.now();
  saveLocalPrefs(store.state.stage, shortlist);

  if (authState.backend === "firebase" && authState.firebaseCtx) {
    const { db, fns, appId } = authState.firebaseCtx;
    const ref = fns.doc(db, "artifacts", appId, "users", authState.user.id, "profile", "prefs");
    await fns.setDoc(ref, {
      bookmarks: authState.bookmarks,
      folders: authState.folders,
      shortlist,
      stage: store.state.stage,
      updatedAt: Date.now()
    }, { merge: true }).catch(() => {});
    return;
  }

  if (authState.backend === "server") {
    await apiFetch("./api/account/bookmarks", {
      method: "PUT",
      body: JSON.stringify({
        bookmarks: authState.bookmarks,
        folders: authState.folders,
        shortlist
      })
    }).catch(() => {});
    return;
  }

  const users = readVaultUsers();
  if (users[authState.user.id]) {
    users[authState.user.id] = { ...users[authState.user.id], ...authState.user };
    writeVaultUsers(users);
  }
}

export async function updateAccountProfile({ displayName, bio, researchFocus, stage }) {
  if (stage) store.state.stage = stage;
  if (!authState.user) {
    saveGuestBookmarks();
    emit();
    return { ok: true };
  }

  if (authState.backend === "firebase" && authState.firebaseCtx) {
    const { db, fns, appId } = authState.firebaseCtx;
    const patch = {
      displayName: displayName ?? authState.user.displayName,
      bio: bio ?? authState.user.bio ?? "",
      researchFocus: researchFocus ?? authState.user.researchFocus ?? "",
      stage: stage ?? store.state.stage,
      updatedAt: Date.now()
    };
    const ref = fns.doc(db, "artifacts", appId, "users", authState.user.id, "profile", "prefs");
    await fns.setDoc(ref, patch, { merge: true });
    hydrateFromUser({ ...authState.user, ...patch });
    return { ok: true, user: authState.user };
  }

  if (authState.backend === "server") {
    const res = await apiFetch("./api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName, bio, researchFocus, stage })
    });
    if (!res.ok || !res.data?.ok) return { ok: false, error: res.data?.error || "Could not update profile." };
    hydrateFromUser(res.data.user);
    return { ok: true, user: authState.user };
  }

  const users = readVaultUsers();
  const u = users[authState.user.id];
  if (u) {
    if (displayName) u.displayName = displayName.trim().slice(0, 80);
    if (typeof bio === "string") u.bio = bio.trim().slice(0, 320);
    if (typeof researchFocus === "string") u.researchFocus = researchFocus.trim().slice(0, 120);
    if (stage) u.stage = stage;
    u.updatedAt = Date.now();
    writeVaultUsers(users);
    hydrateFromUser(u);
  }
  return { ok: true, user: authState.user };
}

export function isBookmarked(id) {
  return authState.bookmarks.some(b => b.id === id);
}

export function getBookmark(id) {
  return authState.bookmarks.find(b => b.id === id) || null;
}

export async function toggleBookmark(item) {
  if (!item || !item.id) return false;
  const idx = authState.bookmarks.findIndex(b => b.id === item.id);
  let saved = false;
  if (idx >= 0) {
    authState.bookmarks = authState.bookmarks.filter(b => b.id !== item.id);
    saved = false;
  } else {
    const entry = {
      id: item.id,
      kind: item.kind || "hub",
      title: String(item.title || item.name || item.id).slice(0, 180),
      subtitle: String(item.subtitle || item.city || "").slice(0, 180),
      url: String(item.url || "").slice(0, 512),
      folder: item.folder || "Shortlist",
      note: String(item.note || "").slice(0, 600),
      savedAt: Date.now()
    };
    authState.bookmarks = [entry, ...authState.bookmarks];
    saved = true;
  }
  emit();
  await persistAccountBookmarks();
  return saved;
}

export async function updateBookmarkMeta(id, { folder, note }) {
  const target = authState.bookmarks.find(b => b.id === id);
  if (!target) return false;
  if (typeof folder === "string" && folder.trim()) target.folder = folder.trim().slice(0, 48);
  if (typeof note === "string") target.note = note.trim().slice(0, 600);
  emit();
  await persistAccountBookmarks();
  return true;
}

export async function addBookmarkFolder(name) {
  const clean = String(name || "").trim().slice(0, 48);
  if (!clean) return false;
  if (!authState.folders.includes(clean)) {
    authState.folders = [...authState.folders, clean];
    emit();
    await persistAccountBookmarks();
  }
  return true;
}

// =========================================================================
// GDPR ARTICLES 17 & 20 ACCOUNT CONTROLS
// =========================================================================

export async function exportAccountPackage() {
  if (authState.user && authState.backend === "server") {
    const res = await apiFetch("./api/account/export", { method: "GET" }).catch(() => null);
    if (res?.ok && res.data) return res.data;
  }
  return {
    meta: {
      app: SUBJECT_CONFIG.appName,
      exportedAt: new Date().toISOString(),
      gdprBasis: "Article 20 — Right to Data Portability",
      backend: authState.backend
    },
    account: authState.user || { mode: "guest" },
    stage: store.state.stage,
    folders: authState.folders,
    bookmarks: authState.bookmarks
  };
}

export async function deleteAccountPermanently() {
  if (authState.user) {
    if (authState.backend === "firebase" && authState.firebaseCtx) {
      const { auth, db, fns, appId } = authState.firebaseCtx;
      const ref = fns.doc(db, "artifacts", appId, "users", authState.user.id, "profile", "prefs");
      await fns.deleteDoc(ref).catch(() => {});
      await fns.deleteUser(auth.currentUser).catch(() => {});
    } else if (authState.backend === "server") {
      await apiFetch("./api/account", { method: "DELETE" }).catch(() => {});
      setStoredToken(null);
    } else {
      const users = readVaultUsers();
      delete users[authState.user.id];
      writeVaultUsers(users);
      try { localStorage.removeItem(VAULT_ACTIVE_KEY); } catch {}
    }
  }
  try {
    localStorage.removeItem(GUEST_BOOKMARKS_KEY);
    localStorage.removeItem(GUEST_FOLDERS_KEY);
  } catch {}
  authState.user = null;
  authState.bookmarks = [];
  authState.folders = [...DEFAULT_FOLDERS];
  emit();
  return { ok: true };
}

function formatFirebaseError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "An account with this email already exists.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Incorrect email or password.";
  }
  if (code.includes("weak-password")) return "Password must be at least 8 characters.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a moment and try again.";
  return err?.message || "Authentication failed. Please try again.";
}
