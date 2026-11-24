/**
 * PhysAlts — Main Application Bootstrap (Atlas Engine v2.1)
 * Progressive instant boot, Auth & Bookmarks hydration, Deep-Link URL routing, and PWA Service Worker.
 */

import { store, loadAllDatasets, mergeHubs } from "./data_store.js";
import { initGlobe, syncGlobeMarkers } from "./globe_engine.js";
import { initSpaceFrontierView } from "./space_view.js";
import { initAuth, onAuthChange } from "./auth_service.js";
import { initCloudSync, loadLocalPrefs } from "./cloud_sync.js";
import { refreshAccountHeader } from "./account_ui.js";
import {
  initUI, refreshDbBadge, renderStageMenu,
  selectHubNode, openClusterSheet, selectSpaceMission, closeDropdown, applyDeepLinkFromUrl
} from "./ui_controller.js";

async function boot() {
  const prefs = loadLocalPrefs();
  store.state.stage = prefs.stage;
  store.state.shortlist = new Set(prefs.shortlist);

  // Bind UI & Dynamic Island controls immediately so interface responds on frame 1
  initUI();

  // Keep header account pill & stage synchronized with auth/bookmark changes
  onAuthChange(() => {
    refreshAccountHeader();
    refreshDbBadge();
    renderStageMenu();
  });

  // Initialize Space Frontier (Earth → ~1 Light-Day) canvas engine
  initSpaceFrontierView({
    onSelectMission: (missionId) => selectSpaceMission(missionId)
  });

  // Progressive instant boot: Auth + Core Datasets + 3D Globe all initialize concurrently
  const [, stats] = await Promise.all([
    initAuth(),
    loadAllDatasets({
      onCoreReady: () => {
        refreshDbBadge();
        syncGlobeMarkers();
      }
    }),
    initGlobe({
      onSelectNode: (id, fly) => selectHubNode(id, fly),
      onSelectStack: (stack) => openClusterSheet(stack),
      onBackgroundClick: () => closeDropdown()
    }).catch((err) => {
      console.error("Globe init error:", err);
      if (window.__PHYSALTS_DEV_PROXY__) {
        fetch("./_diag?tag=map_init_err&d=" + encodeURIComponent(String(err?.stack || err))).catch(() => {});
      }
    })
  ]);

  refreshDbBadge();
  refreshAccountHeader();
  syncGlobeMarkers();
  applyDeepLinkFromUrl();

  // Optional lazy Cloud Sync (activates automatically if PROD_FIREBASE_CONFIG is set)
  initCloudSync({
    onStatusChange: (ready) => {
      store.state.cloudReady = ready;
      refreshDbBadge();
    },
    onCustomNodes: (items) => {
      mergeHubs(items, "custom");
      refreshDbBadge();
      syncGlobeMarkers();
    },
    onPrefsUpdate: (data) => {
      if (data.stage) store.state.stage = data.stage;
      if (Array.isArray(data.shortlist)) store.state.shortlist = new Set(data.shortlist);
      renderStageMenu();
    }
  });

  // Register production PWA Service Worker (skip on blob: preview URLs and native Capacitor apps)
  const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
  if ("serviceWorker" in navigator && !isNative && (location.protocol === "https:" || location.protocol === "http:")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  if (window.__PHYSALTS_DEV_PROXY__) {
    fetch("./_diag?tag=boot_ok&d=" + encodeURIComponent(JSON.stringify(stats))).catch(() => {});
  }
}

boot();
