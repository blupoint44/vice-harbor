// Vice Harbor — game entrypoint.
// A small hand-rolled 3D engine on a 2D canvas: the city from world.js is
// projected with a pinhole camera and painted far-to-near every frame.

import { CITY, HIDEOUT, MISSIONS, NEON_SIGNS, buildHarbor, decorateSigns, isRoad, makeRng, pedSpawn, trafficSpawn } from './world.js';

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
function fitCanvas() {
  W = canvas.width = Math.floor(window.innerWidth);
  H = canvas.height = Math.floor(window.innerHeight);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed') || 1) || 1;
const SHOT = params.get('shot') || '';

const harbor = decorateSigns(buildHarbor(SEED), SEED);
const rng = makeRng(SEED * 97 + 5);

const CAR_COLORS = ['#d6455a', '#3f8fbf', '#e0a83c', '#7ac74f', '#b8bcc4', '#805ad5', '#e2e2e2', '#374151'];

const state = {
  mode: SHOT ? 'play' : 'title', // title | play | pause | end
  time: 0,
  cash: 250,
  health: 100,
  wanted: 0,
  heatCooldown: 0,
  missionIdx: 0,
  mission: null, // {def, tLeft, gateIdx}
  message: '',
  messageT: 0,
  finished: false,
};

const player = {
  x: 8, z: CITY.shoreZ + 26, angle: 0, speed: 0,
  inCar: null, walkBob: 0,
};

const cars = [];
for (let i = 0; i < 14; i++) {
  const s = trafficSpawn(rng, i);
  cars.push({ ...s, kind: 'traffic', color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], health: 100, driver: true });
}
// The silver coupe the first mission is about, parked by the boardwalk.
const coupe = { x: 2, z: CITY.shoreZ + 24, angle: 0.2, speed: 0, kind: 'coupe', color: '#cfd6dd', health: 100, driver: false };
cars.push(coupe);

const cops = [];
function spawnCop() {
  const a = rng() * Math.PI * 2;
  cops.push({
    x: player.x + Math.cos(a) * 55, z: player.z + Math.sin(a) * 55,
    angle: 0, speed: 0, kind: 'cop', color: '#20304a', health: 100, driver: true,
  });
}

const peds = [];
for (let i = 0; i < 22; i++) peds.push({ ...pedSpawn(rng), alive: true, scared: 0 });

const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  ensureAudio();
  if ((e.code === 'Escape' || e.code === 'KeyP') && !SHOT) {
    if (state.mode === 'play') state.mode = 'pause';
    else if (state.mode === 'pause') state.mode = 'play';
  }
  if (e.code === 'Enter' && state.mode === 'title') startPlay();
  if ((e.code === 'KeyE' || e.code === 'KeyF') && state.mode === 'play') toggleCar();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
let mouseDX = 0;
window.addEventListener('mousemove', (e) => { mouseDX += e.movementX || 0; });
window.addEventListener('mousedown', () => { ensureAudio(); if (state.mode === 'play') shoot(); });
let camYaw = 0;

// --- tiny WebAudio synth: engine hum, shots, siren, chimes -----------------
let audioCtx = null, engineOsc = null;
function ensureAudio() {
  if (audioCtx || SHOT) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    engineOsc = audioCtx.createOscillator();
    const g = audioCtx.createGain(); g.gain.value = 0;
    engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 60;
    engineOsc.connect(g); g.connect(audioCtx.destination); engineOsc.start();
    engineOsc._gain = g;
  } catch { audioCtx = null; }
}
function blip(freq, dur, type = 'square', vol = 0.12) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}

// --- save ------------------------------------------------------------------
function saveGame() {
  try {
    localStorage.setItem('vice-harbor-save', JSON.stringify({
      cash: state.cash, missionIdx: state.missionIdx, finished: state.finished,
    }));
  } catch { /* private mode: play on without saving */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem('vice-harbor-save');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.cash === 'number') state.cash = s.cash;
    if (typeof s.missionIdx === 'number') state.missionIdx = Math.min(s.missionIdx, MISSIONS.length - 1);
    state.finished = !!s.finished;
  } catch { /* corrupted save: start fresh */ }
}
loadGame();

// --- rendering ---------------------------------------------------------------
// Camera: positioned behind/above the player (or in a fixed spot for the
// title and screenshot scenes), looking along camYaw with a slight pitch.
const cam = { x: 0, y: 9, z: 0 };
let horizon = 0, focal = 0;

function project(wx, wy, wz) {
  const dx = wx - cam.x, dz = wz - cam.z;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  const rx = dx * cos - dz * sin;
  const rz = dx * sin + dz * cos;
  if (rz < 0.6) return null;
  const s = focal / rz;
  return { x: W / 2 + rx * s, y: horizon - (wy - cam.y) * s, s, depth: rz };
}

function quad(points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath(); ctx.fill();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 4);
  sky.addColorStop(0, '#2d1b4e'); sky.addColorStop(0.45, '#93356b');
  sky.addColorStop(0.8, '#e2703a'); sky.addColorStop(1, '#f7b267');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 4);
  // Low sun over the water.
  const sun = project(cam.x + Math.sin(camYaw) * 300, 16, cam.z + Math.cos(camYaw) * 300);
  if (sun) {
    const r = Math.max(18, sun.s * 9);
    const g2 = ctx.createRadialGradient(sun.x, sun.y, 2, sun.x, sun.y, r * 2.4);
    g2.addColorStop(0, 'rgba(255,214,140,0.95)'); g2.addColorStop(0.35, 'rgba(255,166,88,0.55)'); g2.addColorStop(1, 'rgba(255,140,80,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(sun.x, sun.y, r * 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd98c'; ctx.beginPath(); ctx.arc(sun.x, sun.y, r, 0, 7); ctx.fill();
  }
}

function drawGround() {
  // Base: sand south of the shore line, asphalt city elsewhere.
  ctx.fillStyle = '#3c3a44'; ctx.fillRect(0, horizon, W, H - horizon);
  const shoreNear = project(cam.x - 400, 0, CITY.shoreZ);
  const shoreFar = project(cam.x + 400, 0, CITY.shoreZ);
  const seaFar = project(cam.x + 400, 0, CITY.shoreZ - 260);
  const seaNear = project(cam.x - 400, 0, CITY.shoreZ - 260);
  if (shoreNear && shoreFar && seaFar && seaNear) {
    quad([seaNear, seaFar, shoreFar, shoreNear], '#274b73');
    ctx.fillStyle = 'rgba(255,170,90,0.25)';
    ctx.fillRect(0, Math.min(shoreNear.y, shoreFar.y) - 2, W, 3);
  }
  const boardA = project(cam.x - 400, 0, CITY.shoreZ + 12);
  const boardB = project(cam.x + 400, 0, CITY.shoreZ + 12);
  if (boardA && boardB && shoreNear && shoreFar) quad([boardA, boardB, shoreFar, shoreNear], '#8a6a4e');
  // Road strips near the camera, drawn as projected quads.
  const R = CITY.block;
  for (let gx = -5; gx <= 5; gx++) {
    const wx = Math.round((cam.x + gx * R) / R) * R;
    const a = project(wx - CITY.roadHalf, 0.05, cam.z - 150), b = project(wx + CITY.roadHalf, 0.05, cam.z - 150);
    const c = project(wx + CITY.roadHalf, 0.05, cam.z + 150), d = project(wx - CITY.roadHalf, 0.05, cam.z + 150);
    if (a && b && c && d) quad([a, b, c, d], '#2e2c34');
    const wz = Math.round((cam.z + gx * R) / R) * R;
    if (wz > CITY.shoreZ + 4) {
      const e = project(cam.x - 150, 0.05, wz - CITY.roadHalf), f = project(cam.x + 150, 0.05, wz - CITY.roadHalf);
      const g = project(cam.x + 150, 0.05, wz + CITY.roadHalf), h = project(cam.x - 150, 0.05, wz + CITY.roadHalf);
      if (e && f && g && h) quad([e, f, g, h], '#2e2c34');
    }
  }
}

function buildingFaces(b) {
  const hw = b.w / 2, hd = b.d / 2;
  const corners = [
    [b.x - hw, b.z - hd], [b.x + hw, b.z - hd], [b.x + hw, b.z + hd], [b.x - hw, b.z + hd],
  ];
  const top = corners.map(([x, z]) => project(x, b.h, z));
  const bot = corners.map(([x, z]) => project(x, 0, z));
  if (top.some((p) => !p) || bot.some((p) => !p)) return;
  const faces = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const midDepth = (bot[i].depth + bot[j].depth) / 2;
    faces.push({ pts: [bot[i], bot[j], top[j], top[i]], depth: midDepth, f: 0.55 + 0.14 * i, side: i });
  }
  faces.push({ pts: top, depth: top[0].depth, f: 1.05, side: -1 });
  faces.sort((a, z) => z.depth - a.depth);
  for (const face of faces) {
    quad(face.pts, shade(b.wall, face.f));
    if (face.side >= 0) {
      // Lit windows on the two faces most likely toward the camera.
      const a = face.pts[0], c = face.pts[2];
      const widthPx = Math.abs(c.x - a.x), heightPx = Math.abs(a.y - c.y);
      if (widthPx > 26 && heightPx > 30) {
        const cols = Math.min(6, Math.floor(widthPx / 16)), rows = Math.min(9, Math.floor(heightPx / 16));
        const wrng = makeRng(b.litSeed + face.side * 131);
        for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
          if (wrng() < 0.42) continue;
          const lx = a.x + (c.x - a.x) * ((cx + 0.5) / cols);
          const ly = a.y + (c.y - a.y) * ((cy + 0.5) / rows);
          ctx.fillStyle = wrng() < 0.8 ? 'rgba(255,205,110,0.9)' : 'rgba(160,235,255,0.9)';
          ctx.fillRect(lx - 2, ly - 2.5, 4, 5);
        }
      }
      if (b.sign >= 0 && face.side === 2) {
        const sign = NEON_SIGNS[b.sign];
        const mx = (a.x + c.x) / 2, my = a.y + (c.y - a.y) * 0.3;
        ctx.font = `bold ${Math.max(9, Math.min(26, widthPx / 6))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = sign.color; ctx.shadowBlur = 14;
        ctx.fillStyle = sign.color;
        ctx.fillText(sign.text, mx, my);
        ctx.shadowBlur = 0;
      }
    }
  }
}

function drawPalm(p) {
  const base = project(p.x, 0, p.z), topP = project(p.x, 6.4 * p.s, p.z);
  if (!base || !topP) return;
  ctx.strokeStyle = '#6d4c33'; ctx.lineWidth = Math.max(1.5, base.s * 0.14);
  ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(topP.x, topP.y); ctx.stroke();
  ctx.strokeStyle = '#3f9e4d'; ctx.lineWidth = Math.max(1.2, base.s * 0.1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI - 0.2;
    ctx.beginPath(); ctx.moveTo(topP.x, topP.y);
    ctx.quadraticCurveTo(topP.x + Math.cos(a) * base.s * 1.5, topP.y - base.s * 0.5, topP.x + Math.cos(a) * base.s * 2.6, topP.y + base.s * 0.7);
    ctx.stroke();
  }
}

function drawCar(car) {
  const p = project(car.x, 0, car.z);
  if (!p) return;
  const w = p.s * 2.1, h = p.s * 1.05;
  const sin = Math.sin(car.angle - camYaw);
  const squash = 0.45 + 0.55 * Math.abs(sin);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, w * 0.62, h * 0.16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = car.color;
  ctx.fillRect(p.x - w / 2, p.y - h * squash, w, h * squash * 0.62);
  ctx.fillStyle = shade(car.color.startsWith('#') ? car.color : '#888888', 1.25);
  ctx.fillRect(p.x - w * 0.32, p.y - h * squash * 1.5, w * 0.64, h * squash * 0.55);
  ctx.fillStyle = '#bfe8ff';
  ctx.fillRect(p.x - w * 0.26, p.y - h * squash * 1.42, w * 0.52, h * squash * 0.34);
  ctx.fillStyle = '#151515';
  ctx.fillRect(p.x - w * 0.44, p.y - h * 0.2, w * 0.18, h * 0.2);
  ctx.fillRect(p.x + w * 0.26, p.y - h * 0.2, w * 0.18, h * 0.2);
  if (car.kind === 'cop') {
    const flash = Math.floor(state.time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
    ctx.fillRect(p.x - w * 0.2, p.y - h * squash * 1.62, w * 0.4, h * 0.14);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(p.x - w * 0.1, p.y - h * squash * 0.9, w * 0.2, h * 0.3);
  }
}

function drawPed(ped) {
  const base = project(ped.x, 0, ped.z), head = project(ped.x, 1.75, ped.z);
  if (!base || !head) return;
  const h = base.y - head.y;
  ctx.strokeStyle = ped.alive ? '#20242c' : '#5a2020';
  ctx.lineWidth = Math.max(1.4, base.s * 0.16);
  ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(head.x, head.y); ctx.stroke();
  ctx.fillStyle = ['#e8b04b', '#7fe7d2', '#ff7bac', '#caffbf'][Math.floor(ped.hue * 4) % 4];
  ctx.beginPath(); ctx.arc(head.x, head.y, Math.max(1.6, h * 0.14), 0, 7); ctx.fill();
}

function drawBeacon(x, z, color) {
  const base = project(x, 0, z), topP = project(x, 26, z);
  if (!base || !topP) return;
  const grad = ctx.createLinearGradient(0, topP.y, 0, base.y);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fillRect(base.x - base.s * 0.5, topP.y, base.s, base.y - topP.y);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(base.x, base.y, base.s * 0.8, base.s * 0.22, 0, 0, 7); ctx.fill();
}

// --- HUD, minimap, screens ----------------------------------------------------
function drawMinimap() {
  const size = Math.min(168, W * 0.2), x0 = W - size - 16, y0 = H - size - 16;
  ctx.fillStyle = 'rgba(12,14,24,0.78)'; ctx.fillRect(x0, y0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.strokeRect(x0, y0, size, size);
  const toMap = (wx, wz) => [x0 + size / 2 + (wx - player.x) * (size / 190), y0 + size / 2 - (wz - player.z) * (size / 190)];
  ctx.fillStyle = '#27567f';
  const [, shoreY] = toMap(0, CITY.shoreZ);
  ctx.fillRect(x0, Math.max(y0, shoreY), size, Math.max(0, y0 + size - shoreY));
  ctx.fillStyle = '#8b93a3';
  for (const b of harbor.buildings) {
    const [bx, by] = toMap(b.x, b.z);
    if (bx > x0 && bx < x0 + size && by > y0 && by < y0 + size) ctx.fillRect(bx, by, 2, 2);
  }
  ctx.fillStyle = '#ffd166';
  for (const c of cars) { const [cx2, cy2] = toMap(c.x, c.z); ctx.fillRect(cx2 - 1, cy2 - 1, 3, 3); }
  ctx.fillStyle = '#ff4040';
  for (const c of cops) { const [cx2, cy2] = toMap(c.x, c.z); ctx.fillRect(cx2 - 1, cy2 - 1, 3, 3); }
  if (state.mission) {
    const t = missionTarget();
    if (t) { const [tx, ty] = toMap(t.x, t.z); ctx.fillStyle = '#7CFC00'; ctx.beginPath(); ctx.arc(tx, ty, 4, 0, 7); ctx.fill(); }
  }
  const [px, py] = toMap(player.x, player.z);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(px, py, 3.4, 0, 7); ctx.fill();
}

function drawHud() {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,10,18,0.55)';
  ctx.fillRect(14, 14, 252, 86);
  ctx.fillStyle = '#7CFC00'; ctx.font = 'bold 24px monospace';
  ctx.fillText('$' + state.cash, 26, 44);
  ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('HEALTH ' + Math.max(0, Math.round(state.health)), 26, 68);
  ctx.fillStyle = '#ffd94d'; ctx.font = 'bold 20px sans-serif';
  ctx.fillText('★'.repeat(state.wanted) + '☆'.repeat(Math.max(0, 5 - state.wanted)), 26, 92);
  if (state.mission) {
    const m = state.mission;
    ctx.fillStyle = 'rgba(10,10,18,0.55)';
    ctx.fillRect(14, 108, 430, 54);
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(m.def.title + ' — ' + Math.ceil(m.tLeft) + 's', 26, 130);
    ctx.fillStyle = '#d7f9d0'; ctx.font = '13px sans-serif';
    ctx.fillText(missionHint(), 26, 150);
  } else if (!state.finished) {
    ctx.fillStyle = 'rgba(255,233,168,0.92)'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Find the silver coupe by the boardwalk to start: ' + MISSIONS[state.missionIdx].title, 16, H - 196);
  }
  if (state.messageT > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,240,200,0.97)'; ctx.font = 'bold 26px sans-serif';
    ctx.fillText(state.message, W / 2, 120);
    ctx.textAlign = 'left';
  }
  drawMinimap();
}

function overlay(title, lines, accent) {
  ctx.fillStyle = 'rgba(16,6,24,0.62)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent; ctx.font = 'bold 64px sans-serif';
  ctx.shadowColor = accent; ctx.shadowBlur = 24;
  ctx.fillText(title, W / 2, H * 0.38);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffe9d2'; ctx.font = '19px sans-serif';
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.38 + 44 + i * 27));
  ctx.textAlign = 'left';
}

function render() {
  horizon = H * 0.52; focal = H * 0.95;
  drawSky();
  drawGround();
  const items = [];
  for (const b of harbor.buildings) {
    const dx = b.x - cam.x, dz = b.z - cam.z;
    const rz = dx * Math.sin(camYaw) + dz * Math.cos(camYaw);
    if (rz > -6 && rz < 190 && Math.abs(dx) < 210 && Math.abs(dz) < 210) items.push({ d: rz, fn: () => buildingFaces(b) });
  }
  for (const p of harbor.palms) items.push({ d: (p.x - cam.x) * Math.sin(camYaw) + (p.z - cam.z) * Math.cos(camYaw), fn: () => drawPalm(p) });
  for (const ped of peds) items.push({ d: (ped.x - cam.x) * Math.sin(camYaw) + (ped.z - cam.z) * Math.cos(camYaw), fn: () => drawPed(ped) });
  for (const c of [...cars, ...cops]) items.push({ d: (c.x - cam.x) * Math.sin(camYaw) + (c.z - cam.z) * Math.cos(camYaw), fn: () => drawCar(c) });
  items.sort((a, b) => b.d - a.d);
  for (const it of items) if (it.d > -4) it.fn();
  // Hideout garage marker: a squat glowing doorway block at the hideout.
  drawBeacon(HIDEOUT.x, HIDEOUT.z, 'rgba(127,231,210,0.5)');
  const t = state.mission ? missionTarget() : (state.finished ? null : { x: coupe.x, z: coupe.z });
  if (t && state.mode === 'play') drawBeacon(t.x, t.z, 'rgba(124,252,0,0.55)');
  if (!player.inCar && state.mode === 'play') {
    const feet = project(player.x, 0, player.z), head = project(player.x, 1.8, player.z);
    if (feet && head) {
      ctx.strokeStyle = '#14100e'; ctx.lineWidth = Math.max(2, feet.s * 0.22);
      ctx.beginPath(); ctx.moveTo(feet.x, feet.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.fillStyle = '#ffd9b0'; ctx.beginPath(); ctx.arc(head.x, head.y, Math.max(2.4, feet.s * 0.17), 0, 7); ctx.fill();
    }
  }
  if (state.mode === 'play' || state.mode === 'pause') drawHud();
  if (state.mode === 'title') overlay('VICE HARBOR', ['A Marisol crew story in a golden-hour harbour city', 'Press Enter — WASD move · E steal a car · click to shoot', 'Finish all three jobs to clear the harbor'], '#ff7bac');
  if (state.mode === 'pause') overlay('PAUSED', ['Esc / P to keep rolling'], '#7fe7d2');
  if (state.mode === 'end') overlay(state.health > 0 ? 'HARBOR CLEARED' : 'BUSTED FLAT', ['Final cash: $' + state.cash, 'Reload to run it again'], '#ffd166');
}

// --- gameplay -------------------------------------------------------------------
function missionTarget() {
  const m = state.mission;
  if (!m) return null;
  if (m.def.kind === 'gates') return m.def.gates[m.gateIdx];
  return m.def.target;
}
function missionHint() {
  const m = state.mission;
  if (!m) return '';
  if (m.def.kind === 'delivery') return player.inCar === coupe ? 'Drive to the green beacon at Pier 9' : 'Get in the silver coupe';
  if (m.def.kind === 'escape') return 'Reach the teal hideout beacon — do not stop';
  return 'Gate ' + (m.gateIdx + 1) + ' of ' + m.def.gates.length + ' — follow the green beacon';
}

function startMission() {
  const def = MISSIONS[state.missionIdx];
  state.mission = { def, tLeft: def.time, gateIdx: 0 };
  if (def.wanted) state.wanted = Math.max(state.wanted, def.wanted);
  say(def.title + ': ' + def.brief);
  blip(660, 0.15, 'square', 0.1);
}
function say(text) { state.message = text; state.messageT = 3.4; }
function completeMission() {
  const m = state.mission;
  state.cash += m.def.reward;
  say('Job done — +$' + m.def.reward);
  blip(880, 0.2, 'triangle', 0.14); setTimeout(() => blip(1320, 0.25, 'triangle', 0.12), 90);
  state.mission = null;
  state.missionIdx += 1;
  if (state.missionIdx >= MISSIONS.length) { state.finished = true; state.mode = 'end'; }
  saveGame();
}
function failMission(reason) {
  say(reason);
  state.mission = null;
  state.wanted = Math.max(0, state.wanted - 1);
}

function toggleCar() {
  if (player.inCar) {
    player.x = player.inCar.x + 2.6; player.z = player.inCar.z;
    player.inCar.driver = false; player.inCar = null;
    return;
  }
  let best = null, bestD = 6;
  for (const c of cars) {
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best) {
    player.inCar = best; best.driver = true;
    if (best.kind === 'traffic') { state.wanted = Math.min(5, state.wanted + 1); say('Car jacked — the heat noticed'); }
    if (best === coupe && !state.mission && !state.finished && state.missionIdx === 0) startMission();
  }
}

function shoot() {
  blip(180, 0.09, 'sawtooth', 0.16);
  state.wanted = Math.min(5, state.wanted + (state.wanted < 2 ? 1 : 0));
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  let hit = null, hitD = 42;
  for (const ped of peds) {
    if (!ped.alive) continue;
    const dx = ped.x - player.x, dz = ped.z - player.z;
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < hitD && side < 1.6) { hit = ped; hitD = along; }
  }
  if (hit) { hit.alive = false; state.cash += 15; say('Target down — +$15, heat rising'); }
  for (const ped of peds) if (Math.hypot(ped.x - player.x, ped.z - player.z) < 16) ped.scared = 4;
}

function startPlay() { if (state.mode === 'title') state.mode = 'play'; }

function clampCity(o) {
  o.x = Math.max(-CITY.half - 20, Math.min(CITY.half + 20, o.x));
  o.z = Math.max(CITY.shoreZ - 60, Math.min(CITY.half + 20, o.z));
}
function collideBuildings(o, r) {
  for (const b of harbor.buildings) {
    if (Math.abs(o.x - b.x) < b.w / 2 + r && Math.abs(o.z - b.z) < b.d / 2 + r) {
      const px = b.w / 2 + r - Math.abs(o.x - b.x), pz = b.d / 2 + r - Math.abs(o.z - b.z);
      if (px < pz) o.x += (o.x > b.x ? px : -px); else o.z += (o.z > b.z ? pz : -pz);
    }
  }
}

function update(dt) {
  state.time += dt;
  if (state.messageT > 0) state.messageT -= dt;
  if (state.mode !== 'play') return;

  if (keys.has('KeyQ')) camYaw -= dt * 1.7;
  if (keys.has('KeyE') && !player.inCar) camYaw += dt * 1.7;
  if (mouseDX) { camYaw += mouseDX * 0.0032; mouseDX = 0; }

  const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const turn = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  if (player.inCar) {
    const car = player.inCar;
    const accel = keys.has('Shift') ? 30 : 20;
    car.speed += fwd * accel * dt;
    car.speed -= car.speed * (keys.has('Space') ? 2.6 : 0.7) * dt;
    car.speed = Math.max(-9, Math.min(30, car.speed));
    if (Math.abs(car.speed) > 0.4) car.angle += turn * dt * 1.35 * Math.sign(car.speed);
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    clampCity(car); collideBuildings(car, 1.6);
    player.x = car.x; player.z = car.z; player.angle = car.angle;
    if (engineOsc && engineOsc._gain) {
      engineOsc.frequency.value = 55 + Math.abs(car.speed) * 4;
      engineOsc._gain.gain.value = 0.03 + Math.abs(car.speed) * 0.0016;
    }
  } else {
    const sp = (keys.has('Shift') ? 11 : 6.2) * dt;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    player.x += (sin * fwd + cos * strafe) * sp;
    player.z += (cos * fwd - sin * strafe) * sp;
    player.walkBob += Math.abs(fwd) + Math.abs(strafe) > 0 ? dt * 9 : 0;
    clampCity(player); collideBuildings(player, 0.7);
    if (engineOsc && engineOsc._gain) engineOsc._gain.gain.value = 0;
  }

  // Traffic keeps to its avenue; turns around at the city edge.
  for (const c of cars) {
    if (c === player.inCar || !c.driver) continue;
    c.x += Math.sin(c.angle) * c.speed * dt;
    c.z += Math.cos(c.angle) * c.speed * dt;
    if (c.x > CITY.half + 16 || c.x < -CITY.half - 16 || c.z > CITY.half + 16 || c.z < CITY.shoreZ - 30) c.angle += Math.PI;
    collideBuildings(c, 1.6);
  }
  for (const ped of peds) {
    if (!ped.alive) continue;
    const run = ped.scared > 0 ? 3.2 : 1;
    if (ped.scared > 0) ped.scared -= dt;
    if (ped.alongX) ped.x += ped.dir * ped.speed * run * dt; else ped.z += ped.dir * ped.speed * run * dt;
    if (ped.x > CITY.half || ped.x < -CITY.half) ped.dir *= -1;
    if (ped.z > CITY.half || ped.z < CITY.shoreZ + 4) ped.dir *= -1;
  }

  // Wanted system: cops spawn with heat, chase, and ram.
  state.heatCooldown -= dt;
  if (state.wanted > 0 && cops.length < state.wanted + 1 && state.heatCooldown <= 0) { spawnCop(); state.heatCooldown = 2.5; }
  if (state.wanted === 0 && cops.length) cops.pop();
  for (const cop of cops) {
    const dx = player.x - cop.x, dz = player.z - cop.z;
    const want = Math.atan2(dx, dz);
    let diff = want - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.angle += Math.max(-1.9 * dt, Math.min(1.9 * dt, diff));
    const dist = Math.hypot(dx, dz);
    cop.speed = Math.min(27, cop.speed + 16 * dt);
    if (dist < 7) cop.speed = Math.max(0, cop.speed - 20 * dt);
    cop.x += Math.sin(cop.angle) * cop.speed * dt;
    cop.z += Math.cos(cop.angle) * cop.speed * dt;
    clampCity(cop); collideBuildings(cop, 1.6);
    if (dist < 3.4 && state.mode === 'play') {
      state.health -= 9 * dt;
      if (state.health <= 0) { state.mode = 'end'; say('Busted flat'); saveGame(); }
    }
  }

  // Missions.
  const m = state.mission;
  if (m) {
    m.tLeft -= dt;
    if (m.tLeft <= 0) failMission('Out of time — the crew is not pleased');
    else {
      const t = missionTarget();
      const d = Math.hypot(player.x - t.x, player.z - t.z);
      if (m.def.kind === 'delivery' && d < 7 && player.inCar === coupe) completeMission();
      else if (m.def.kind === 'escape' && d < HIDEOUT.r) { state.wanted = 0; cops.length = 0; completeMission(); }
      else if (m.def.kind === 'gates' && d < 8) {
        m.gateIdx += 1; blip(990, 0.12, 'square', 0.1);
        if (m.gateIdx >= m.def.gates.length) completeMission();
        else say('Gate ' + m.gateIdx + ' cleared');
      }
    }
  } else if (!state.finished && state.missionIdx === 1 && !state.mission) {
    // Chain continues automatically once the coupe job is done.
    if (player.inCar) startMission();
  } else if (!state.finished && state.missionIdx === 2 && !state.mission) {
    if (player.inCar) startMission();
  }

  // Camera settles behind the player.
  const back = player.inCar ? 10.5 : 7.5;
  const lookYaw = player.inCar ? player.angle : camYaw;
  if (player.inCar) camYaw += (((player.angle - camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 4);
  cam.x = player.x - Math.sin(lookYaw) * back;
  cam.z = player.z - Math.cos(lookYaw) * back;
  cam.y = player.inCar ? 4.4 : 3.1;
  collideBuildings(cam, 0.5);
}

// --- deterministic screenshot scenes -------------------------------------------
function applyShotScene() {
  if (!SHOT) return;
  state.mode = 'play';
  if (SHOT === 'start') {
    state.mode = 'title';
    player.x = 0; player.z = CITY.shoreZ + 30; camYaw = Math.PI; // look north into the city... adjusted below
    camYaw = 0;
    cam.x = 0; cam.y = 10; cam.z = CITY.shoreZ - 6;
  } else if (SHOT === 'play') {
    player.inCar = coupe; coupe.driver = true;
    coupe.x = -38; coupe.z = -76; coupe.angle = Math.PI / 2; coupe.speed = 14;
    player.x = coupe.x; player.z = coupe.z; player.angle = coupe.angle;
    camYaw = coupe.angle;
    cam.x = coupe.x - Math.sin(camYaw) * 11; cam.z = coupe.z - Math.cos(camYaw) * 11; cam.y = 4.4;
    state.cash = 640;
  } else if (SHOT === 'chase') {
    player.inCar = coupe; coupe.driver = true;
    coupe.x = 0; coupe.z = 0; coupe.angle = 0; coupe.speed = 18;
    player.x = 0; player.z = 0; player.angle = 0;
    state.wanted = 3;
    cops.push(
      { x: -4, z: -13, angle: 0, speed: 16, kind: 'cop', color: '#20304a', health: 100, driver: true },
      { x: 5, z: -20, angle: 0.1, speed: 16, kind: 'cop', color: '#20304a', health: 100, driver: true },
      { x: -9, z: -26, angle: -0.08, speed: 15, kind: 'cop', color: '#20304a', health: 100, driver: true },
    );
    camYaw = 0; cam.x = 0; cam.z = -11; cam.y = 4.6;
    state.cash = 890;
  } else if (SHOT === 'mission') {
    state.missionIdx = 0;
    player.inCar = coupe; coupe.driver = true;
    coupe.x = -76; coupe.z = CITY.shoreZ + 34; coupe.angle = Math.PI / 2; coupe.speed = 10;
    player.x = coupe.x; player.z = coupe.z; player.angle = coupe.angle;
    startMission();
    camYaw = coupe.angle;
    cam.x = coupe.x - Math.sin(camYaw) * 11; cam.z = coupe.z - Math.cos(camYaw) * 11; cam.y = 4.4;
    state.cash = 410;
  }
}
applyShotScene();

let last = performance.now();
let framesRendered = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!SHOT) update(dt);
  else if (SHOT === 'play' || SHOT === 'chase' || SHOT === 'mission') {
    // Hold the composed scene; nudge traffic so the shot feels alive.
    state.time += dt;
    for (const c of cars) if (c !== coupe && c.driver) { c.x += Math.sin(c.angle) * c.speed * dt; c.z += Math.cos(c.angle) * c.speed * dt; }
  } else {
    state.time += dt;
  }
  render();
  framesRendered += 1;
  if (SHOT && framesRendered >= 12) window.__shotReady = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
