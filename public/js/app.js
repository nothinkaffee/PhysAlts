/**
 * PhysAlts — Main Application Bootstrap (Atlas Engine v2)
 */

import { store, loadAllDatasets, mergeHubs } from "./data_store.js";
import { initGlobe, syncGlobeMarkers } from "./globe_engine.js";
import { initSpaceFrontierView } from "./space_view.js";
import { initCloudSync, loadLocalPrefs } from "./cloud_sync.js";
import {
  initUI, refreshDbBadge, renderStageMenu,
  selectHubNode, selectSpaceMission, closeDropdown
} from "./ui_controller.js";

async function boot() {
  // Restore local preferences immediately (GDPR-minimal local state)
  const prefs = loadLocalPrefs();
  store.state.stage = prefs.stage;
  store.state.shortlist = new Set(prefs.shortlist);

  // Bind UI controls first so interface is immediately responsive
  initUI();

  // Initialize Space Frontier (Earth → ~1 Light-Day) canvas engine
  initSpaceFrontierView({
    onSelectMission: (missionId) => selectSpaceMission(missionId)
  });

  // Load all verified local datasets + boot 3D globe in parallel
  const [stats] = await Promise.all([
    loadAllDatasets(),
    initGlobe({
      onSelectNode: (id, fly) => selectHubNode(id, fly),
      onBackgroundClick: () => closeDropdown()
    }).catch((err) => {
      console.error("Globe init error:", err);
      if (window.__PHYSALTS_DEV_PROXY__) {
        fetch("./_diag?tag=map_init_err&d=" + encodeURIComponent(String(err?.stack || err))).catch(() => {});
      }
    })
  ]);

  refreshDbBadge();
  syncGlobeMarkers();

  // Optional lazy Cloud Sync (only loads Firebase if PROD_FIREBASE_CONFIG is set)
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

  if (window.__PHYSALTS_DEV_PROXY__) {
    fetch("./_diag?tag=boot_ok&d=" + encodeURIComponent(JSON.stringify(stats))).catch(() => {});
  }
}

boot();
