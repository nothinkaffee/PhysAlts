/**
 * PhysAlts — Cloud Sync & GDPR Data Controls
 * Lazy-loads Firebase SDK only when a real config is provided; defaults cleanly to localStorage.
 */

import { SUBJECT_CONFIG } from "./config.js";

const PREFS_KEY = `${SUBJECT_CONFIG.storagePrefix}prefs`;
const CUSTOM_NODES_KEY = `${SUBJECT_CONFIG.storagePrefix}custom_nodes`;

// Paste your real Firebase Console web config here when going live:
const PROD_FIREBASE_CONFIG = null;
/*
const PROD_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
*/

if (PROD_FIREBASE_CONFIG && typeof window.__firebase_config === "undefined") {
  window.__firebase_config = JSON.stringify(PROD_FIREBASE_CONFIG);
}

let db = null;
let auth = null;
let userId = null;
let cloudReady = false;
let fbFns = null;

const appId = typeof window.__app_id !== "undefined" ? window.__app_id : "physalts-default";

export function loadLocalPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { stage: "undergrad", shortlist: [] };
    const parsed = JSON.parse(raw);
    return {
      stage: typeof parsed.stage === "string" ? parsed.stage : "undergrad",
      shortlist: Array.isArray(parsed.shortlist) ? parsed.shortlist : []
    };
  } catch {
    return { stage: "undergrad", shortlist: [] };
  }
}

export function saveLocalPrefs(stage, shortlist) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      stage,
      shortlist: [...shortlist],
      updatedAt: Date.now()
    }));
  } catch {}
}

export function loadLocalCustomNodes() {
  try {
    const raw = localStorage.getItem(CUSTOM_NODES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalCustomNode(node) {
  try {
    const list = loadLocalCustomNodes().filter(n => n.id !== node.id);
    list.push(node);
    localStorage.setItem(CUSTOM_NODES_KEY, JSON.stringify(list));
  } catch {}
}

export function isCloudReady() {
  return cloudReady;
}

export async function initCloudSync({ onPrefsUpdate, onCustomNodes, onStatusChange }) {
  try {
    const cfgRaw = typeof window.__firebase_config !== "undefined" ? window.__firebase_config : null;
    if (!cfgRaw) {
      cloudReady = false;
      onStatusChange?.(false);
      return;
    }

    const firebaseConfig = typeof cfgRaw === "string" ? JSON.parse(cfgRaw) : cfgRaw;
    const [fbApp, fbAuth, fbStore] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js")
    ]);
    fbFns = { ...fbApp, ...fbAuth, ...fbStore };

    const app = fbFns.initializeApp(firebaseConfig);
    auth = fbFns.getAuth(app);
    db = fbFns.getFirestore(app);

    if (typeof window.__initial_auth_token !== "undefined" && window.__initial_auth_token) {
      await fbFns.signInWithCustomToken(auth, window.__initial_auth_token);
    } else {
      await fbFns.signInAnonymously(auth);
    }

    const user = auth.currentUser;
    if (!user) {
      onStatusChange?.(false);
      return;
    }

    userId = user.uid;
    cloudReady = true;
    onStatusChange?.(true);

    const nodesCol = fbFns.collection(db, "artifacts", appId, "public", "data", "physics_nodes");
    fbFns.onSnapshot(nodesCol, (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      if (items.length) onCustomNodes?.(items);
    }, () => {});

    const profileDoc = fbFns.doc(db, "artifacts", appId, "users", userId, "profile", "prefs");
    fbFns.onSnapshot(profileDoc, (snap) => {
      if (snap.exists()) onPrefsUpdate?.(snap.data());
    }, () => {});
  } catch (err) {
    console.warn("Cloud sync unavailable, running in local mode:", err?.message || err);
    cloudReady = false;
    onStatusChange?.(false);
  }
}

export async function syncPrefs(stage, shortlist) {
  saveLocalPrefs(stage, shortlist);
  if (!db || !userId || !fbFns) return;
  try {
    const profileDoc = fbFns.doc(db, "artifacts", appId, "users", userId, "profile", "prefs");
    await fbFns.setDoc(profileDoc, {
      stage,
      shortlist: [...shortlist],
      updatedAt: Date.now()
    }, { merge: true });
  } catch {}
}

export async function submitCommunityHub(node) {
  saveLocalCustomNode(node);
  if (!db || !userId || !fbFns) return false;
  try {
    const nodeRef = fbFns.doc(db, "artifacts", appId, "public", "data", "physics_nodes", node.id);
    await fbFns.setDoc(nodeRef, node);
    return true;
  } catch {
    return false;
  }
}

/**
 * GDPR Article 20 — Right to Data Portability
 */
export function exportUserData(stage, shortlist) {
  return {
    meta: {
      app: SUBJECT_CONFIG.appName,
      exportedAt: new Date().toISOString(),
      gdprBasis: "Article 20 — Right to Data Portability",
      anonymousUserId: userId || "local-only"
    },
    preferences: {
      careerStage: stage,
      savedShortlistIds: [...shortlist]
    },
    customSubmissionsLocal: loadLocalCustomNodes()
  };
}

/**
 * GDPR Article 17 — Right to Erasure
 */
export async function eraseAllUserData() {
  try {
    localStorage.removeItem(PREFS_KEY);
    localStorage.removeItem(CUSTOM_NODES_KEY);
  } catch {}
  if (db && userId && fbFns?.deleteDoc) {
    try {
      const profileDoc = fbFns.doc(db, "artifacts", appId, "users", userId, "profile", "prefs");
      await fbFns.deleteDoc(profileDoc);
    } catch {}
  }
  return true;
}
