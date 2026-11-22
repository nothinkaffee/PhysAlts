/**
 * PhysAlts — Museum-Grade Space Frontier Visualizer (Earth → Moon → Planets → ~1 Light-Day)
 * Restrained monochrome + cool ice-blue/platinum astronomy aesthetic (zero yellow, zero label clutter).
 * Displays clean logarithmic distance landmarks and orbital mission beacons; full untruncated labels
 * appear on hover/selection and in the paired Space Mission Navigator rail.
 */

import { store } from "./data_store.js";

let canvas = null;
let ctx = null;
let rafId = null;
let activeZone = "all";
let selectedMissionId = null;
let hoveredMissionId = null;
let missionHitboxes = [];
let stars = [];
let onSelectMissionCb = () => {};

function initStars() {
  stars = [];
  for (let i = 0; i < 200; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.2 + 0.25,
      a: Math.random() * 0.45 + 0.12,
      twinkle: Math.random() * Math.PI * 2
    });
  }
}

// Restrained astronomical silver / pearl / cool ice-blue palette (zero yellow)
const LANDMARKS = [
  { label: "Earth / LEO", sub: "0 ls",      sec: 0.002, normX: 0.06, r: 13, color: "#60a5fa" },
  { label: "Moon",        sub: "1.28 ls",   sec: 1.28,  normX: 0.14, r: 8,  color: "#cbd5e1" },
  { label: "L1 / L2",     sub: "5 ls",      sec: 5,     normX: 0.22, r: 5,  color: "#93c5fd" },
  { label: "Inner Solar", sub: "8.3 lm",    sec: 499,   normX: 0.31, r: 12, color: "#f8fafc" },
  { label: "Mars",        sub: "12.5 lm",   sec: 750,   normX: 0.40, r: 8,  color: "#e2e8f0" },
  { label: "Jupiter",     sub: "43 lm",     sec: 2600,  normX: 0.49, r: 13, color: "#cbd5e1" },
  { label: "Saturn",      sub: "79 lm",     sec: 4750,  normX: 0.58, r: 11, color: "#e2e8f0", ring: true },
  { label: "Kuiper Belt", sub: "5.5 lh",    sec: 19800, normX: 0.66, r: 7,  color: "#94a3b8" },
  { label: "1 Light-Day", sub: "~173 AU",   sec: 86400, normX: 0.73, r: 10, color: "#bae6fd", frontier: true }
];

function lightTimeToNorm(sec) {
  const s = Math.max(0.001, Number(sec) || 0.001);
  if (s <= LANDMARKS[0].sec) return LANDMARKS[0].normX;
  for (let i = 1; i < LANDMARKS.length; i++) {
    if (s <= LANDMARKS[i].sec) {
      const a = LANDMARKS[i - 1];
      const b = LANDMARKS[i];
      const t = (Math.log10(s) - Math.log10(a.sec)) / Math.max(1e-6, Math.log10(b.sec) - Math.log10(a.sec));
      return a.normX + t * (b.normX - a.normX);
    }
  }
  return LANDMARKS[LANDMARKS.length - 1].normX;
}

function drawFrame(now) {
  if (!canvas || !ctx || store.state.viewMode !== "space") return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Use full width on mobile, leave right 26% open on desktop for the sleek Mission Navigator rail
  const isWide = w >= 900;
  const scaleX = (norm) => isWide ? norm * w : (0.06 + (norm - 0.06) / 0.67 * 0.88) * w;

  // Starfield
  const t = now * 0.001;
  for (const st of stars) {
    const alpha = st.a * (0.8 + 0.2 * Math.sin(t * 0.8 + st.twinkle));
    ctx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const axisY = h * 0.54;
  const leftX = scaleX(0.04);
  const rightX = scaleX(0.75);

  // Subtle calibrated horizontal spine
  const grad = ctx.createLinearGradient(leftX, axisY, rightX, axisY);
  grad.addColorStop(0, "rgba(147, 197, 253, 0.55)");
  grad.addColorStop(0.5, "rgba(226, 232, 240, 0.22)");
  grad.addColorStop(1, "rgba(186, 230, 253, 0.65)");
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(leftX, axisY);
  ctx.lineTo(rightX, axisY);
  ctx.stroke();

  // Landmarks
  for (const lm of LANDMARKS) {
    const x = scaleX(lm.normX);

    // Hairline distance tick
    ctx.strokeStyle = lm.frontier ? "rgba(186, 230, 253, 0.30)" : "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.setLineDash(lm.frontier ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x, axisY - h * 0.24);
    ctx.lineTo(x, axisY + h * 0.24);
    ctx.stroke();
    ctx.setLineDash([]);

    // Soft halo
    const glow = ctx.createRadialGradient(x, axisY, 0, x, axisY, lm.r * 2.6);
    glow.addColorStop(0, "rgba(226, 232, 240, 0.22)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, axisY, lm.r * 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Orb
    ctx.fillStyle = lm.color;
    ctx.beginPath();
    ctx.arc(x, axisY, lm.r, 0, Math.PI * 2);
    ctx.fill();

    if (lm.ring) {
      ctx.strokeStyle = "rgba(226, 232, 240, 0.72)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(x, axisY, lm.r * 1.85, lm.r * 0.48, -0.32, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(241, 245, 249, 0.90)";
    ctx.font = "500 11px Inter, -apple-system, sans-serif";
    ctx.fillText(lm.label, x, axisY + lm.r + 18);
    ctx.fillStyle = "rgba(148, 163, 184, 0.72)";
    ctx.font = "400 10px Inter, -apple-system, sans-serif";
    ctx.fillText(lm.sub, x, axisY + lm.r + 32);
  }

  // Mission beacons — minimalist, zero overlapping text clutter!
  const missions = store.spaceMissions.filter(m => activeZone === "all" || m.zoneId === activeZone);
  const hits = [];
  const placed = [];
  let tooltipMission = null;

  missions.forEach((m, idx) => {
    const x = scaleX(lightTimeToNorm(m.lightTimeSec));
    const dir = idx % 2 === 0 ? -1 : 1;
    let y = axisY + dir * 56;
    for (let step = 0; step < 6; step++) {
      const cand = axisY + dir * (56 + step * 30);
      const clash = placed.some(p => Math.abs(p.x - x) < 28 && Math.abs(p.y - cand) < 24);
      if (!clash) { y = cand; break; }
      y = cand;
    }
    y = Math.max(152, Math.min(h - 102, y));
    placed.push({ x, y });

    const isSelected = selectedMissionId === m.id;
    const isHovered = hoveredMissionId === m.id;
    const dotColor = isSelected ? "#ffffff" : m.status === "active" ? "#93c5fd" : m.status === "upcoming" ? "#e2e8f0" : "#94a3b8";

    ctx.strokeStyle = isSelected || isHovered ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.14)";
    ctx.lineWidth = isSelected || isHovered ? 1.5 : 0.9;
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, y);
    ctx.stroke();

    const r = isSelected ? 6.5 : isHovered ? 5.5 : 4.2;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "rgba(255,255,255,0.26)" : "rgba(147,197,253,0.15)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = "#f8fafc";
    ctx.stroke();

    if (isSelected || isHovered) {
      tooltipMission = { m, x, y, dir };
    }

    hits.push({ id: m.id, x, y, r: 16 });
  });

  // Crisp floating pill for active/hovered mission, safely clamped away from Space Frontier Directory rail
  if (tooltipMission) {
    const { m, x, y, dir } = tooltipMission;
    const text = `${m.name} · ${m.lightTimeLabel.split(" (")[0]}`;
    ctx.font = "500 11.5px Inter, -apple-system, sans-serif";
    const tw = ctx.measureText(text).width + 20;
    const th = 26;
    const maxRight = isWide ? (w - 318) : (w - 12);
    const bx = Math.max(12, Math.min(maxRight - tw, x - tw / 2));
    const by = dir < 0 ? y - 38 : y + 14;

    ctx.fillStyle = "rgba(12, 16, 24, 0.96)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, th, 999);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(text, bx + 10, by + th / 2 + 0.5);
  }

  missionHitboxes = hits;
  rafId = requestAnimationFrame(drawFrame);
}

export function initSpaceFrontierView({ onSelectMission }) {
  onSelectMissionCb = onSelectMission || (() => {});
  canvas = document.getElementById("space-canvas");
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  initStars();

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = missionHitboxes.find(h => ((x - h.x) ** 2 + (y - h.y) ** 2) <= h.r * h.r);
    hoveredMissionId = hit ? hit.id : null;
    canvas.style.cursor = hit ? "pointer" : "default";
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = missionHitboxes.find(h => ((x - h.x) ** 2 + (y - h.y) ** 2) <= h.r * h.r);
    if (hit) {
      selectedMissionId = hit.id;
      onSelectMissionCb(hit.id);
    }
  });
}

export function setSpaceZone(zoneId) {
  activeZone = zoneId || "all";
}

export function getSpaceZone() {
  return activeZone;
}

export function setSelectedSpaceMission(id) {
  selectedMissionId = id;
}

export function startSpaceLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(drawFrame);
}

export function stopSpaceLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
