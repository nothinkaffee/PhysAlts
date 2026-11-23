/**
 * PhysAlts — Smooth 3D Globe Engine (MapLibre GL JS v5)
 * - Native GPU WebGL clustered GeoJSON layers on standard HTTP/HTTPS & mobile apps.
 * - Geographically anchored (fixed lat/lng centroid) cluster engine for worker-restricted
 *   blob: preview documents so clusters stay rock-solid anchored while dragging the globe
 *   and cleanly split when clicked or zoomed.
 * - Restrained monochrome + cool ice-silver palette (zero yellow).
 */

import { USE_DEV_PROXY, COLLABORATION_ARCS } from "./config.js";
import { store, getVisibleGlobeNodes, getNodeById } from "./data_store.js";

let map = null;
let useMainThreadOverlay = false;
let overlayCanvas = null;
let overlayHits = [];
let drawOverlayFn = () => {};
let onSelectNodeCb = () => {};
let onBackgroundClickCb = () => {};

// Geographic cluster cache keyed by integer zoom + dataset version (zero mid-drag swimming!)
let geoClusterVersion = 0;
const geoClusterCache = new Map();

function invalidateGeoClusterCache() {
  geoClusterVersion++;
  geoClusterCache.clear();
}

/**
 * Deterministic fixed geographic clustering per integer zoom level.
 * Clusters are computed strictly in (lat, lng) coordinates, NOT screen pixels,
 * so every cluster stays rock-solid anchored to its exact spot on Earth as you rotate/pan,
 * and splits cleanly when you click it or zoom in.
 */
function getAnchoredClusters(zoomInt) {
  const z = Math.max(1, Math.min(9, zoomInt));
  const key = `${geoClusterVersion}:${z}`;
  if (geoClusterCache.has(key)) return geoClusterCache.get(key);

  const nodes = getVisibleGlobeNodes();
  // At high zoom (>= 9) or during Time Counter mode, show individual anchored pins
  if (z >= 9 || store.state.timeMode) {
    const singles = nodes.map(n => ({
      isCluster: false,
      lat: n.lat,
      lng: n.lng,
      count: 1,
      node: n
    }));
    geoClusterCache.set(key, singles);
    return singles;
  }

  // Fixed geographic cell size in degrees per zoom tier
  const cellDeg = 42 / Math.pow(1.92, z - 1);
  const buckets = new Map();

  for (const n of nodes) {
    if (store.state.selectedId === n.id) {
      buckets.set(`sel:${n.id}`, { items: [n], sumLat: n.lat, sumLng: n.lng, minLat: n.lat, maxLat: n.lat, minLng: n.lng, maxLng: n.lng });
      continue;
    }
    const latBucket = Math.floor((n.lat + 90) / cellDeg);
    // Adjust longitude cell width by cos(lat) so polar regions don't over-fragment
    const cosLat = Math.max(0.25, Math.cos((n.lat * Math.PI) / 180));
    const lngCell = cellDeg / cosLat;
    const lngBucket = Math.floor((n.lng + 180) / lngCell);
    const bKey = `${latBucket}:${lngBucket}`;
    let b = buckets.get(bKey);
    if (!b) {
      b = { items: [], sumLat: 0, sumLng: 0, minLat: n.lat, maxLat: n.lat, minLng: n.lng, maxLng: n.lng };
      buckets.set(bKey, b);
    }
    b.items.push(n);
    b.sumLat += n.lat;
    b.sumLng += n.lng;
    if (n.lat < b.minLat) b.minLat = n.lat;
    if (n.lat > b.maxLat) b.maxLat = n.lat;
    if (n.lng < b.minLng) b.minLng = n.lng;
    if (n.lng > b.maxLng) b.maxLng = n.lng;
  }

  const result = [];
  for (const b of buckets.values()) {
    const count = b.items.length;
    if (count === 1) {
      const n = b.items[0];
      result.push({ isCluster: false, lat: n.lat, lng: n.lng, count: 1, node: n });
    } else {
      result.push({
        isCluster: true,
        lat: b.sumLat / count,
        lng: b.sumLng / count,
        count,
        spanLat: b.maxLat - b.minLat,
        spanLng: b.maxLng - b.minLng
      });
    }
  }

  geoClusterCache.set(key, result);
  return result;
}

function greatCircleCoords(lng1, lat1, lng2, lat2, steps = 40) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const p1 = toRad(lat1), l1 = toRad(lng1);
  const p2 = toRad(lat2), l2 = toRad(lng2);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2
  ));
  if (d < 1e-5) return [[lng1, lat1], [lng2, lat2]];
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    coords.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return coords;
}

function buildGeoJSON(nodes) {
  return {
    type: "FeatureCollection",
    features: nodes
      .filter(n => typeof n.lat === "number" && typeof n.lng === "number" && !Number.isNaN(n.lat) && !Number.isNaN(n.lng))
      .map(n => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [n.lng, n.lat] },
        properties: {
          id: n.id,
          name: n.name,
          pinned: n.pinned ? 1 : 0,
          selected: store.state.selectedId === n.id ? 1 : 0,
          curated: n.tier === "flagship" || n.tier === "timeline" ? 1 : 0,
          kind: n.group === "company" || n.entityType === "startup" ? "company" : (n.group === "history" || n.tier === "timeline" ? "history" : "academic")
        }
      }))
  };
}

function buildArcsGeoJSON() {
  if (!store.state.arcs || store.state.timeMode) {
    return { type: "FeatureCollection", features: [] };
  }
  const visible = new Map(getVisibleGlobeNodes().map(n => [n.id, n]));
  const features = [];
  for (const [idA, idB] of COLLABORATION_ARCS) {
    const a = visible.get(idA) || getNodeById(idA);
    const b = visible.get(idB) || getNodeById(idB);
    if (!a || !b) continue;
    if (store.state.branch !== "all" && a.branch !== store.state.branch && b.branch !== store.state.branch) continue;
    const focused = (store.state.selectedId === idA || store.state.selectedId === idB) ? 1 : 0;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: greatCircleCoords(a.lng, a.lat, b.lng, b.lat) },
      properties: { focused }
    });
  }
  return { type: "FeatureCollection", features };
}

function probeWorkerSupport(workerUrl) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    try {
      const testBlob = URL.createObjectURL(new Blob(["self.postMessage('ok');"], { type: "application/javascript" }));
      const w = new Worker(workerUrl && !workerUrl.startsWith("blob:") ? workerUrl : testBlob);
      const timer = setTimeout(() => { try { w.terminate(); } catch (_) {} finish(false); }, 600);
      w.onmessage = () => { clearTimeout(timer); try { w.terminate(); } catch (_) {} finish(true); };
      w.onerror = () => { clearTimeout(timer); try { w.terminate(); } catch (_) {} finish(false); };
      if (workerUrl && !workerUrl.startsWith("blob:")) {
        setTimeout(() => { clearTimeout(timer); try { w.terminate(); } catch (_) {} finish(true); }, 220);
      }
    } catch {
      finish(false);
    }
  });
}

function setupClusteredLayers() {
  if (!map || map.getSource("physics-hubs")) return;

  map.addSource("physics-arcs", { type: "geojson", data: buildArcsGeoJSON() });
  map.addLayer({
    id: "physics-arcs-glow",
    type: "line",
    source: "physics-arcs",
    paint: {
      "line-color": "rgba(226, 232, 240, 0.16)",
      "line-width": ["case", ["==", ["get", "focused"], 1], 4.2, 2.2],
      "line-blur": 3
    }
  });
  map.addLayer({
    id: "physics-arcs-line",
    type: "line",
    source: "physics-arcs",
    paint: {
      "line-color": ["case", ["==", ["get", "focused"], 1], "rgba(255, 255, 255, 0.88)", "rgba(203, 213, 225, 0.40)"],
      "line-width": ["case", ["==", ["get", "focused"], 1], 1.5, 1.0],
      "line-dasharray": [2, 2]
    }
  });

  map.addSource("physics-hubs", {
    type: "geojson",
    data: buildGeoJSON(getVisibleGlobeNodes()),
    cluster: true,
    clusterMaxZoom: 9,
    clusterRadius: 46
  });

  map.addLayer({
    id: "clusters-glow",
    type: "circle",
    source: "physics-hubs",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(203, 213, 225, 0.15)",
      "circle-radius": ["step", ["get", "point_count"], 21, 15, 27, 60, 34, 150, 40],
      "circle-blur": 0.45
    }
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "physics-hubs",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(14, 18, 27, 0.86)",
      "circle-radius": ["step", ["get", "point_count"], 15, 15, 19, 60, 24, 150, 28],
      "circle-stroke-width": 1.4,
      "circle-stroke-color": "rgba(241, 245, 249, 0.82)"
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "physics-hubs",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Semibold"],
      "text-size": 12,
      "text-allow-overlap": true
    },
    paint: { "text-color": "#f8fafc" }
  });

  map.addLayer({
    id: "unclustered-halo",
    type: "circle",
    source: "physics-hubs",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "selected"], 1], "rgba(160, 70, 70, 0.42)",
        ["==", ["get", "kind"], "company"], "rgba(228, 228, 231, 0.28)",
        ["==", ["get", "kind"], "history"], "rgba(212, 212, 216, 0.30)",
        "rgba(212, 212, 216, 0.20)"
      ],
      "circle-radius": ["case", ["==", ["get", "selected"], 1], 14, ["==", ["get", "curated"], 1], 10, 7]
    }
  });

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "physics-hubs",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "selected"], 1], "#ffffff",
        ["==", ["get", "kind"], "company"], "#e4e4e7",
        ["==", ["get", "kind"], "history"], "#d4d4d8",
        ["==", ["get", "curated"], 1], "#f4f4f5",
        "#a1a1aa"
      ],
      "circle-radius": ["case", ["==", ["get", "selected"], 1], 7.5, ["==", ["get", "curated"], 1], 5.5, 4.2],
      "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 2.4, 1.5],
      "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], "rgb(160, 70, 70)", "rgba(255, 255, 255, 0.90)"]
    }
  });

  map.addLayer({
    id: "unclustered-label",
    type: "symbol",
    source: "physics-hubs",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Semibold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 8, 12.5],
      "text-offset": [0.95, 0],
      "text-anchor": "left",
      "text-optional": true,
      "text-max-width": 16
    },
    paint: {
      "text-color": "rgba(248, 250, 252, 0.96)",
      "text-halo-color": "rgba(6, 9, 15, 0.90)",
      "text-halo-width": 1.7,
      "text-opacity": [
        "step",
        ["zoom"],
        ["case", ["==", ["get", "selected"], 1], 1, ["==", ["get", "pinned"], 1], 0.95, 0],
        5.2,
        ["case", ["==", ["get", "selected"], 1], 1, ["==", ["get", "pinned"], 1], 0.95, 0.90]
      ]
    }
  });

  map.on("click", "clusters", async (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    const source = map.getSource("physics-hubs");
    try {
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: Math.min(zoom + 0.8, 15),
        duration: 750,
        easing: t => 1 - Math.pow(1 - t, 3)
      });
    } catch {}
  });

  map.on("click", "unclustered-point", (e) => {
    const f = e.features?.[0];
    if (f?.properties?.id) onSelectNodeCb(f.properties.id, true);
  });
  map.on("click", "unclustered-label", (e) => {
    const f = e.features?.[0];
    if (f?.properties?.id) onSelectNodeCb(f.properties.id, true);
  });

  for (const lyr of ["clusters", "unclustered-point", "unclustered-label"]) {
    map.on("mouseenter", lyr, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", lyr, () => { map.getCanvas().style.cursor = ""; });
  }

  store.state.globeReady = true;
}

function initMainThreadOverlay() {
  const container = document.getElementById("map");
  if (!container || overlayCanvas) return;
  overlayCanvas = document.createElement("canvas");
  overlayCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;";
  container.appendChild(overlayCanvas);

  const fmtCount = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
  let rafPending = false;

  const renderOverlayNow = () => {
    rafPending = false;
    if (!overlayCanvas || !map || typeof map.project !== "function") return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (overlayCanvas.width !== Math.round(w * dpr) || overlayCanvas.height !== Math.round(h * dpr)) {
      overlayCanvas.width = Math.round(w * dpr);
      overlayCanvas.height = Math.round(h * dpr);
    }
    const ctx = overlayCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const zoom = map.getZoom();
    const center = map.getCenter();
    const rad = Math.PI / 180;
    const cx = Math.cos(center.lat * rad) * Math.cos(center.lng * rad);
    const cy = Math.cos(center.lat * rad) * Math.sin(center.lng * rad);
    const cz = Math.sin(center.lat * rad);
    const minDot = zoom >= 7 ? 0.86 : zoom >= 4.5 ? 0.48 : 0.12;
    const isVisibleOnGlobe = (lng, lat) => {
      const x = Math.cos(lat * rad) * Math.cos(lng * rad);
      const y = Math.cos(lat * rad) * Math.sin(lng * rad);
      const z = Math.sin(lat * rad);
      return (x * cx + y * cy + z * cz) > minDot;
    };

    // Collaboration arcs
    if (store.state.arcs && !store.state.timeMode) {
      const arcs = buildArcsGeoJSON().features || [];
      ctx.save();
      ctx.setLineDash([4, 4]);
      for (const f of arcs) {
        const coords = f.geometry?.coordinates || [];
        const focused = f.properties?.focused === 1;
        ctx.beginPath();
        let started = false;
        for (const [lng, lat] of coords) {
          if (!isVisibleOnGlobe(lng, lat)) { started = false; continue; }
          const pt = map.project([lng, lat]);
          if (pt.x < -160 || pt.x > w + 160 || pt.y < -160 || pt.y > h + 160) { started = false; continue; }
          if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = focused ? "rgba(255,255,255,0.86)" : "rgba(203,213,225,0.34)";
        ctx.lineWidth = focused ? 1.5 : 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Geographically anchored clusters — rock-solid pinned to Earth!
    const anchored = getAnchoredClusters(Math.floor(zoom));
    const hits = [];

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const item of anchored) {
      if (!isVisibleOnGlobe(item.lng, item.lat)) continue;
      const pt = map.project([item.lng, item.lat]);
      if (pt.x < -36 || pt.x > w + 36 || pt.y < -36 || pt.y > h + 36) continue;

      const x = pt.x;
      const y = pt.y;

      if (item.isCluster) {
        const count = item.count;
        const radius = count >= 200 ? 25 : count >= 60 ? 21 : count >= 15 ? 17 : 14;

        ctx.beginPath();
        ctx.arc(x, y, radius + 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(203, 213, 225, 0.13)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(14, 18, 27, 0.88)";
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = "rgba(241, 245, 249, 0.82)";
        ctx.stroke();

        ctx.fillStyle = "#f4f4f5";
        ctx.font = "600 13px 'Inter', 'Helvetica Neue', Helvetica, sans-serif";
        ctx.fillText(fmtCount(count), x, y + 0.5);
        hits.push({ type: "cluster", x, y, r: radius + 4, lng: item.lng, lat: item.lat, span: Math.max(item.spanLat || 0, item.spanLng || 0) });
      } else {
        const n = item.node;
        const selected = store.state.selectedId === n.id;
        const isCompany = n.group === "company" || n.entityType === "startup";
        const isHistory = n.group === "history" || n.tier === "timeline";
        const curated = n.tier === "flagship" || n.tier === "timeline";
        const radius = selected ? 7.5 : curated ? 5.5 : 4.2;

        ctx.beginPath();
        ctx.arc(x, y, selected ? 14 : curated ? 10 : 7, 0, Math.PI * 2);
        ctx.fillStyle = selected ? "rgba(160, 70, 70, 0.42)" : isCompany ? "rgba(228, 228, 231, 0.28)" : "rgba(212, 212, 216, 0.22)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = selected ? "#ffffff" : isCompany ? "#e4e4e7" : isHistory ? "#d4d4d8" : curated ? "#f4f4f5" : "#a1a1aa";
        ctx.fill();
        ctx.lineWidth = selected ? 2.4 : 1.5;
        ctx.strokeStyle = selected ? "rgb(160, 70, 70)" : "rgba(255, 255, 255, 0.90)";
        ctx.stroke();

        if (selected || store.state.timeMode || (zoom >= 5.2 && curated)) {
          ctx.save();
          ctx.textAlign = "left";
          ctx.font = "600 13px 'Inter', 'Helvetica Neue', Helvetica, sans-serif";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(9, 9, 10, 0.92)";
          ctx.strokeText(n.name, x + radius + 7, y);
          ctx.fillStyle = "rgba(244, 244, 245, 0.96)";
          ctx.fillText(n.name, x + radius + 7, y);
          ctx.restore();
        }
        hits.push({ type: "node", x, y, r: Math.max(radius + 8, 13), id: n.id });
      }
    }
    overlayHits = hits;
  };

  drawOverlayFn = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(renderOverlayNow);
  };

  map.on("render", drawOverlayFn);
  map.on("resize", drawOverlayFn);
  map.on("mousemove", (e) => {
    if (!e?.point) return;
    const { x, y } = e.point;
    const hovered = overlayHits.some(hit => ((x - hit.x) ** 2 + (y - hit.y) ** 2) <= hit.r * hit.r);
    map.getCanvas().style.cursor = hovered ? "pointer" : "";
  });
  map.on("click", (e) => {
    if (!e?.point) return;
    const { x, y } = e.point;
    for (let i = overlayHits.length - 1; i >= 0; i--) {
      const hit = overlayHits[i];
      if ((x - hit.x) ** 2 + (y - hit.y) ** 2 <= hit.r * hit.r) {
        if (hit.type === "cluster") {
          const nextZoom = Math.min(Math.floor(map.getZoom()) + 2.2, 13);
          map.easeTo({
            center: [hit.lng, hit.lat],
            zoom: nextZoom,
            duration: 750,
            easing: t => 1 - Math.pow(1 - t, 3)
          });
        } else {
          onSelectNodeCb(hit.id, true);
        }
        return;
      }
    }
    onBackgroundClickCb();
  });
  drawOverlayFn();
}

export async function initGlobe({ onSelectNode, onBackgroundClick }) {
  onSelectNodeCb = onSelectNode || (() => {});
  onBackgroundClickCb = onBackgroundClick || (() => {});

  if (typeof window.maplibregl === "undefined") {
    throw new Error("MapLibre GL JS failed to load");
  }

  const isBlobPage = location.protocol === "blob:";
  let resolvedWorkerUrl = "";
  if (typeof window.maplibregl.setWorkerUrl === "function") {
    if (isBlobPage) {
      const wCode = await fetch("./vendor/maplibre-gl-csp-worker.js").then(r => r.text());
      resolvedWorkerUrl = URL.createObjectURL(new Blob([wCode], { type: "application/javascript" }));
      window.maplibregl.setWorkerUrl(resolvedWorkerUrl);
    } else {
      const directWorker = new URL("./vendor/maplibre-gl-csp-worker.js", location.href).href;
      try {
        const probe = new Worker(directWorker);
        probe.terminate();
        resolvedWorkerUrl = directWorker;
        window.maplibregl.setWorkerUrl(directWorker);
      } catch {
        const wCode = await fetch("./vendor/maplibre-gl-csp-worker.js").then(r => r.text());
        resolvedWorkerUrl = URL.createObjectURL(new Blob([wCode], { type: "application/javascript" }));
        window.maplibregl.setWorkerUrl(resolvedWorkerUrl);
      }
    }
  }

  const workerOk = isBlobPage ? false : await probeWorkerSupport(resolvedWorkerUrl);
  useMainThreadOverlay = isBlobPage || !workerOk;

  if (USE_DEV_PROXY && typeof window.maplibregl.addProtocol === "function") {
    window.maplibregl.addProtocol("physalts", async (params) => {
      const raw = params.url.slice("physalts://".length);
      const target = raw.startsWith("https://")
        ? `./_proxy?url=${encodeURIComponent(raw)}`
        : raw;
      const res = await fetch(target);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { data: await res.arrayBuffer() };
    });
  }

  const glyphsUrl = USE_DEV_PROXY
    ? "physalts://./vendor/fonts/{fontstack}/{range}.pbf"
    : `${new URL("./vendor/fonts/", location.href).href}{fontstack}/{range}.pbf`;
  const satTileUrl = USE_DEV_PROXY
    ? "physalts://https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    : "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const lblTileUrl = USE_DEV_PROXY
    ? "physalts://https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
    : "https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

  map = new window.maplibregl.Map({
    container: "map",
    center: [12, 34],
    zoom: 1.9,
    minZoom: 1.2,
    maxZoom: 18.2,
    pitch: 0,
    bearing: 0,
    antialias: true,
    attributionControl: true,
    fadeDuration: 220,
    style: {
      version: 8,
      glyphs: glyphsUrl,
      projection: { type: "globe" },
      sky: {
        "sky-color": "#0b0b0c",
        "horizon-color": "#1c1c1f",
        "fog-color": "#0c0c0e",
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 5, 0.7, 7, 0]
      },
      sources: {
        "esri-satellite": {
          type: "raster",
          tiles: [satTileUrl],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Imagery © Esri"
        },
        "esri-labels": {
          type: "raster",
          tiles: [lblTileUrl],
          tileSize: 256,
          maxzoom: 19
        }
      },
      layers: [
        {
          id: "ocean-base",
          type: "background",
          paint: { "background-color": "#0a0a0b" }
        },
        {
          id: "satellite-layer",
          type: "raster",
          source: "esri-satellite",
          paint: {
            "raster-fade-duration": 150,
            "raster-saturation": -0.08,
            "raster-contrast": 0.06
          }
        },
        {
          id: "labels-layer",
          type: "raster",
          source: "esri-labels",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.85 }
        }
      ]
    }
  });

  if (typeof ResizeObserver !== "undefined") {
    const mapEl = document.getElementById("map");
    if (mapEl) {
      const ro = new ResizeObserver(() => {
        if (map) map.resize();
      });
      ro.observe(mapEl);
    }
  }

  map.on("style.load", () => {
    try { map.setProjection({ type: "globe" }); } catch {}
    if (useMainThreadOverlay) {
      store.state.globeReady = true;
      initMainThreadOverlay();
    } else {
      setupClusteredLayers();
    }
    syncGlobeMarkers();
  });

  if (!useMainThreadOverlay) {
    map.on("click", (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ["clusters", "unclustered-point", "unclustered-label"] });
      if (!hits.length) onBackgroundClickCb();
    });
  }
}

export function syncGlobeMarkers() {
  invalidateGeoClusterCache();
  if (!store.state.globeReady || !map) return;
  if (useMainThreadOverlay) {
    drawOverlayFn();
    return;
  }
  const src = map.getSource("physics-hubs");
  if (src?.setData) src.setData(buildGeoJSON(getVisibleGlobeNodes()));
  const arcSrc = map.getSource("physics-arcs");
  if (arcSrc?.setData) arcSrc.setData(buildArcsGeoJSON());
}

export function flyToHub(node, zoomOverride = null) {
  if (!map || !node) return;
  const targetZoom = zoomOverride != null ? zoomOverride : Math.min(node.zoom || 6.4, 7.2);
  map.easeTo({
    center: [node.lng, node.lat],
    zoom: targetZoom,
    pitch: store.state.tilted ? 48 : 0,
    duration: 850,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });
}

export function resetGlobeToSpace(center = [15, 26], zoom = 1.95) {
  if (!map) return;
  map.easeTo({
    center,
    zoom,
    pitch: 0,
    bearing: 0,
    duration: 800,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true
  });
}

export function setGlobeLabels(visible) {
  if (!map || !map.getLayer("labels-layer")) return;
  map.setLayoutProperty("labels-layer", "visibility", visible ? "visible" : "none");
}

export function setGlobeTilt(tilted) {
  if (!map) return;
  map.easeTo({ pitch: tilted ? 54 : 0, duration: 650, easing: t => 1 - Math.pow(1 - t, 3) });
}

export function zoomInGlobe() {
  if (map) map.zoomIn({ duration: 360 });
}

export function zoomOutGlobe() {
  if (map) map.zoomOut({ duration: 360 });
}
