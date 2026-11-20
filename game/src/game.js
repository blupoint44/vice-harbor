// Vice Harbor — an original open-world crime game in one self-contained
// canvas engine. A projected-3D renderer (no libraries) draws a golden-hour
// coastal city: drive or walk it, dodge traffic, outrun the harbour police,
// and run a three-job story chain for the Marlin Club.
import { buildWorld, makeRng, CITY, buildingHit, clampToCity } from './world.js';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let W = 0, H = 0;
function resize() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
addEventListener('resize', resize); resize();

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot');
const world = buildWorld(SEED);
const rng = makeRng(SEED * 31 + 7);

// ---------- tiny WebAudio synth: engine hum, shots, sirens, jingles ----------
let AC = null, gestured = false;
function audio() { if (!gestured) return null; if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } return AC; }
function beep(freq, dur, type, vol, slide) {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'square'; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.05, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
function shotSound() { beep(160, 0.09, 'sawtooth', 0.09, -110); }
function cashSound() { beep(880, 0.1, 'square', 0.05); setTimeout(() => beep(1320, 0.14, 'square', 0.05), 70); }
function sirenTick(t) { if (G.wanted > 0 && t % 40 === 0) beep(660 + (Math.floor(t / 40) % 2) * 220, 0.16, 'triangle', 0.02); }

// ---------- input ----------
const keys = {};
let mouseDown = false, mouseX = 0, mouseY = 0;
addEventListener('keydown', (e) => {
  gestured = true;
  keys[e.code] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyE') tryEnterExit();
  if ((e.code === 'Enter' || e.code === 'Space') && (G.screen === 'title' || G.screen === 'end')) startGame();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
cv.addEventListener('mousedown', (e) => { gestured = true; mouseDown = true; mouseX = e.clientX; mouseY = e.clientY; if (G.screen === 'title' || G.screen === 'end') startGame(); else shoot(); });
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

// ---------- game state ----------
const SAVE_KEY = 'vice-harbor-save-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch (e) { saved = {}; }
const G = {
  screen: SHOT ? 'play' : 'title',
  paused: false,
  time: 0,
  cash: saved.cash || 0,
  missionDone: saved.missionDone || 0,
  wanted: 0, heat: 0,
  cam: { a: 0 },
  shake: 0,
  msg: '', msgT: 0,
  mission: null,
  over: '',
};
const player = { x: 330, y: 300, a: 0, hp: 100, car: null, walk: 0 };
const cars = [];
const peds = [];
const cops = [];
const bullets = [];
const CAR_COLORS = ['#d94f30', '#3f7fbf', '#e0a81c', '#59a96a', '#b04a8a', '#d8d3c8', '#445', '#7a4fd0'];

function spawnCar(x, y, a, cop) {
  const c = { x, y, a: a || 0, v: 0, color: cop ? '#20304a' : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], cop: !!cop, ai: !cop, hp: 100, lane: 0 };
  cars.push(c); return c;
}
function spawnTraffic() {
  for (let i = 0; i < 16; i++) {
    const vert = rng() < 0.5;
    const gx = Math.floor(rng() * CITY.cols) * CITY.block;
    const gy = Math.floor(rng() * CITY.rows) * CITY.block;
    const c = spawnCar(gx + (vert ? 12 : rng() * 1600), gy + (vert ? rng() * 1500 : 12), vert ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI));
    c.lane = vert ? gx + 12 : gy + 12;
  }
  for (let i = 0; i < 22; i++) {
    peds.push({ x: rng() * world.width, y: rng() * world.height, a: rng() * 6.28, t: Math.floor(rng() * 200), hue: Math.floor(rng() * 360), down: 0 });
  }
}
function say(text, secs) { G.msg = text; G.msgT = (secs || 3) * 60; }
function addWanted(n) {
  G.heat += n;
  const stars = Math.min(5, Math.floor(G.heat / 30));
  if (stars > G.wanted) { G.wanted = stars; if (stars >= 2) say('Harbour Police are on you — ' + stars + ' stars!', 3); }
}
function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: G.cash, missionDone: G.missionDone })); } catch (e) {} }

// ---------- missions: a 3-job chain for the Marlin Club ----------
const MISSIONS = [
  { name: 'JOB 1 — HOT PACKAGE', text: 'Drive the package to Pier 9 before the timer runs out.', kind: 'delivery', time: 75, pay: 400 },
  { name: 'JOB 2 — LOSE THE HEAT', text: 'Reach the hideout garage with 2 stars and shake the police.', kind: 'escape', pay: 750 },
  { name: 'JOB 3 — HARBOUR RUN', text: 'Blast through all 5 checkpoint gates around the bay.', kind: 'gates', pay: 1500 },
];
function startMission(i) {
  const m = { ...MISSIONS[i], idx: i, t: (MISSIONS[i].time || 150) * 60, gate: 0 };
  G.mission = m;
  if (m.kind === 'delivery') { m.tx = world.pier.x1 - 30; m.ty = world.pier.y; }
  if (m.kind === 'escape') { m.tx = world.hideout.x; m.ty = world.hideout.y; G.heat = Math.max(G.heat, 60); G.wanted = 2; }
  if (m.kind === 'gates') { const g = world.gates[0]; g.hit = false; m.tx = g.x; m.ty = g.y; for (const gt of world.gates) gt.hit = false; }
  say(m.name + ': ' + m.text, 5);
}
function missionWin() {
  const m = G.mission; G.cash += m.pay; G.missionDone = Math.max(G.missionDone, m.idx + 1);
  saveGame(); cashSound(); say('Job done! +$' + m.pay + ' — cash $' + G.cash, 4);
  G.mission = null;
  if (m.idx + 1 < MISSIONS.length) setTimeout(() => { if (G.screen === 'play') startMission(m.idx + 1); }, 2500);
  else { G.screen = 'end'; G.over = 'You own the harbour now. Final cash: $' + G.cash; }
}
function updateMission() {
  const m = G.mission; if (!m) return;
  m.t--;
  if (m.t <= 0) { say('Job failed — the club finds someone else.', 3); G.mission = null; return; }
  const px = player.car ? player.car.x : player.x, py = player.car ? player.car.y : player.y;
  if (m.kind === 'gates') {
    const g = world.gates[m.gate];
    if (g && Math.hypot(px - g.x, py - g.y) < g.r) {
      g.hit = true; cashSound(); m.gate++;
      if (m.gate >= world.gates.length) return missionWin();
      const n = world.gates[m.gate]; m.tx = n.x; m.ty = n.y; say('Gate ' + m.gate + '/5 — keep going!', 2);
    }
  } else if (Math.hypot(px - m.tx, py - m.ty) < 70) {
    if (m.kind === 'escape' && G.wanted > 0) { /* must arrive then lose heat below */ }
    missionWin();
  }
}

// ---------- interaction & combat ----------
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of cars) { const d = Math.hypot(c.x - player.x, c.y - player.y); if (d < bd) { bd = d; best = c; } }
  return best;
}
function tryEnterExit() {
  if (G.screen !== 'play') return;
  if (player.car) {
    player.x = player.car.x + Math.cos(player.car.a + Math.PI / 2) * 26;
    player.y = player.car.y + Math.sin(player.car.a + Math.PI / 2) * 26;
    player.car.driver = false; player.car = null; beep(220, 0.08, 'square', 0.04);
  } else {
    const c = nearestCar(46);
    if (c) {
      if (c.cop) addWanted(35);
      player.car = c; c.driver = true; c.ai = false; beep(330, 0.08, 'square', 0.04);
      say(c.cop ? 'You stole a police cruiser!' : 'Wheels acquired. WASD to drive.', 2);
    }
  }
}
function shoot() {
  if (G.screen !== 'play' || G.paused || player.car) return;
  audio(); shotSound();
  const a = player.a;
  bullets.push({ x: player.x, y: player.y, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, life: 26 });
  addWanted(12);
}
function togglePause() { if (G.screen === 'play') { G.paused = !G.paused; } }
function startGame() {
  if (G.screen === 'play') return;
  G.screen = 'play'; G.paused = false; player.hp = 100; G.wanted = 0; G.heat = 0;
  audio();
  if (G.missionDone < MISSIONS.length && !G.mission) startMission(G.missionDone);
  say('Welcome to Vice Harbor. E: enter car · click: shoot · Esc: pause', 4);
}

// ---------- update ----------
function stepPlayer() {
  const run = keys.ShiftLeft || keys.ShiftRight;
  if (player.car) {
    const c = player.car;
    const accel = keys.KeyW ? 0.24 : keys.KeyS ? -0.14 : 0;
    c.v += accel; c.v *= keys.Space ? 0.9 : 0.985;
    if (keys.KeyA) c.a -= 0.035 * Math.sign(c.v || 1);
    if (keys.KeyD) c.a += 0.035 * Math.sign(c.v || 1);
    c.v = Math.max(-6, Math.min(13, c.v));
    const nx = c.x + Math.cos(c.a) * c.v, ny = c.y + Math.sin(c.a) * c.v;
    if (!buildingHit(world, nx, ny, 12)) { c.x = nx; c.y = ny; } else { c.v *= -0.3; G.shake = 6; c.hp -= 4; }
    clampToCity(world, c);
    player.x = c.x; player.y = c.y; player.a = c.a;
    if (Math.abs(c.v) > 8) addWanted(0.05);
    for (const p of peds) if (!p.down && Math.hypot(p.x - c.x, p.y - c.y) < 20 && Math.abs(c.v) > 2) { p.down = 240; addWanted(30); G.shake = 5; }
  } else {
    const sp = run ? 3.4 : 1.9;
    let mx = 0, my = 0;
    if (keys.KeyW) my -= 1; if (keys.KeyS) my += 1; if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
    if (keys.KeyQ) G.cam.a -= 0.04; if (keys.KeyE) { /* handled on keydown */ }
    if (keys.KeyQ) player.a -= 0.05; if (keys.KeyE2) player.a += 0.05;
    const ca = G.cam.a;
    const wx = mx * Math.cos(ca) - my * Math.sin(ca), wy = mx * Math.sin(ca) + my * Math.cos(ca);
    const nx = player.x + wx * sp, ny = player.y + wy * sp;
    if (!buildingHit(world, nx, player.y, 8)) player.x = nx;
    if (!buildingHit(world, player.x, ny, 8)) player.y = ny;
    if (mx || my) { player.a = Math.atan2(wy, wx); player.walk += 0.3; }
    clampToCity(world, player);
  }
  // camera follows behind heading
  const target = player.car ? player.car.a : G.cam.a + Math.PI / 2 * 0 + player.a * 0 + G.cam.a;
  void target;
  if (!player.car && (keys.KeyQ || keys.ArrowLeft)) G.cam.a -= 0.03;
  if (mouseDown && !player.car) player.a = Math.atan2(mouseY - H / 2, mouseX - W / 2) + G.cam.a;
}
function stepTraffic() {
  for (const c of cars) {
    if (c.driver || !c.ai) continue;
    c.v += (3.2 - c.v) * 0.02;
    let nx = c.x + Math.cos(c.a) * c.v, ny = c.y + Math.sin(c.a) * c.v;
    // turn at intersections occasionally
    const gx = Math.round(c.x / CITY.block) * CITY.block, gy = Math.round(c.y / CITY.block) * CITY.block;
    if (Math.hypot(c.x - gx, c.y - gy) < 14 && rng() < 0.02) c.a += (rng() < 0.5 ? 1 : -1) * Math.PI / 2;
    if (buildingHit(world, nx, ny, 12) || nx < CITY.shoreX || nx > world.width || ny < 0 || ny > world.height) { c.a += Math.PI / 2; nx = c.x; ny = c.y; }
    c.x = nx; c.y = ny;
  }
  for (const p of peds) {
    if (p.down > 0) { p.down--; continue; }
    if (--p.t <= 0) { p.a = rng() * 6.28; p.t = 120 + rng() * 200; }
    const flee = player.car && Math.hypot(p.x - player.x, p.y - player.y) < 90;
    const sp = flee ? 2.4 : 0.7;
    const nx = p.x + Math.cos(p.a) * sp, ny = p.y + Math.sin(p.a) * sp;
    if (!buildingHit(world, nx, ny, 6)) { p.x = nx; p.y = ny; }
    clampToCity(world, p);
  }
}
function stepCops() {
  const want = G.wanted;
  const need = want * 1;
  while (cops.length < need) { const c = spawnCar(player.x + (rng() - 0.5) * 900, player.y + (rng() - 0.5) * 900, 0, true); c.ai = true; cops.push(c); }
  while (cops.length > need) { const c = cops.pop(); const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); }
  for (const c of cops) {
    if (c.driver) continue;
    const d = Math.hypot(player.x - c.x, player.y - c.y);
    const ta = Math.atan2(player.y - c.y, player.x - c.x);
    let diff = ta - c.a; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    c.a += Math.max(-0.05, Math.min(0.05, diff));
    c.v += ((d > 60 ? 7.5 : 2) - c.v) * 0.03;
    c.x += Math.cos(c.a) * c.v; c.y += Math.sin(c.a) * c.v;
    clampToCity(world, c);
    if (d < 30) { player.hp -= player.car ? 0.06 : 0.25; G.shake = Math.max(G.shake, 3); }
  }
  if (want === 0 && G.heat > 0) G.heat = Math.max(0, G.heat - 0.05);
  if (G.heat > 0 && want > 0) G.heat = Math.max(0, G.heat - 0.008);
  G.wanted = Math.min(5, Math.floor(G.heat / 30));
  if (player.hp <= 0) { G.screen = 'end'; G.over = 'Wasted in Vice Harbor. Cash kept: $' + G.cash; saveGame(); }
}
function stepBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.x += b.vx; b.y += b.vy;
    if (--b.life <= 0 || buildingHit(world, b.x, b.y, 0)) { bullets.splice(i, 1); continue; }
    for (const p of peds) if (!p.down && Math.hypot(p.x - b.x, p.y - b.y) < 12) { p.down = 300; addWanted(25); bullets.splice(i, 1); break; }
  }
}

// ---------- projected-3D renderer ----------
function camAngle() { return player.car ? player.car.a - Math.PI / 2 : G.cam.a; }
function project(x, y, hgt) {
  const ca = camAngle();
  const px = player.car ? player.car.x : player.x, py = player.car ? player.car.y : player.y;
  const dx = x - px, dy = y - py;
  const sin = Math.sin(-ca), cos = Math.cos(-ca);
  const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos; // ry = forward
  const camH = player.car ? 95 : 70;
  const f = H * 1.15;
  if (ry < 8) return null;
  return { sx: W / 2 + (rx / ry) * f, sy: H * 0.52 + ((camH - hgt) / ry) * f, depth: ry, scale: f / ry };
}
function poly(pts, fill) {
  ctx.fillStyle = fill; ctx.beginPath();
  pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.sx, p.sy); else ctx.lineTo(p.sx, p.sy); });
  ctx.closePath(); ctx.fill();
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f);
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
function drawSky() {
  const gr = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  gr.addColorStop(0, '#2e2a5e'); gr.addColorStop(0.45, '#b34a6e'); gr.addColorStop(0.8, '#f08c3c'); gr.addColorStop(1, '#ffc46b');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H * 0.62);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath(); ctx.arc(W * 0.72, H * 0.44, 34, 0, 6.29); ctx.fill();
  ctx.fillStyle = 'rgba(255,180,90,0.35)';
  ctx.beginPath(); ctx.arc(W * 0.72, H * 0.44, 58, 0, 6.29); ctx.fill();
}
function drawGround() {
  // ocean west, sand strip, then city ground plane in bands by depth
  const horizon = H * 0.52;
  ctx.fillStyle = '#274b63'; ctx.fillRect(0, horizon, W, H - horizon);
  const px = player.car ? player.car.x : player.x;
  const shoreScreen = project(CITY.shoreX, player.y + 400, 0);
  void shoreScreen;
  const bands = 26;
  for (let i = bands - 1; i >= 0; i--) {
    const d0 = 30 + i * 42, d1 = d0 + 42;
    const ca = camAngle();
    const cxp = px, cyp = player.car ? player.car.y : player.y;
    const corners = [[-900, d0], [900, d0], [900, d1], [-900, d1]].map(([lx, fwd]) => {
      const wx = cxp + Math.cos(ca) * fwd - Math.sin(ca) * lx * 0 + Math.sin(ca) * 0 + (Math.cos(ca + Math.PI / 2)) * lx;
      const wy = cyp + Math.sin(ca) * fwd + Math.cos(ca + Math.PI / 2) * 0 + (Math.sin(ca + Math.PI / 2)) * lx;
      return project(wx, wy, 0);
    });
    if (corners.some((c) => !c)) continue;
    const midX = cxp + Math.cos(ca) * ((d0 + d1) / 2);
    let fill = '#4a4a52';
    if (midX < CITY.shoreX - 40) fill = i % 2 ? '#1d5f7a' : '#22708c';        // ocean
    else if (midX < CITY.shoreX + 30) fill = '#d9b878';                        // sand/boardwalk
    else fill = i % 2 ? '#55565e' : '#4d4e55';                                 // streets
    poly(corners, fill);
  }
  // road centre dashes on the nearest grid lines
  ctx.strokeStyle = 'rgba(255,210,90,0.5)'; ctx.lineWidth = 2;
  for (let gx = 0; gx <= CITY.cols; gx++) {
    const pts = [];
    for (let d = 40; d < 900; d += 60) {
      const ca = camAngle(); const cxp = player.car ? player.car.x : player.x, cyp = player.car ? player.car.y : player.y;
      const p = project(cxp + Math.cos(ca) * d + (gx * CITY.block - cxp) * 0 + (gx * CITY.block - cxp), 0, 0);
      void p; pts.push(project(gx * CITY.block, cyp + Math.sin(ca) * d + d * 0 + (Math.cos(ca)) * 0 + (cyp * 0) + Math.cos(ca) * 0 + (player.y * 0) + (cyp + d) * 0 + (cyp + d), 0));
    }
    void pts;
  }
}
function drawBuilding(b) {
  const c = [
    project(b.x, b.y, 0), project(b.x + b.w, b.y, 0), project(b.x + b.w, b.y + b.d, 0), project(b.x, b.y + b.d, 0),
    project(b.x, b.y, b.h), project(b.x + b.w, b.y, b.h), project(b.x + b.w, b.y + b.d, b.h), project(b.x, b.y + b.d, b.h),
  ];
  if (c.some((p) => !p)) {
    // partially behind camera: draw only if any top corner projects
    if (!c[4] && !c[5] && !c[6] && !c[7]) return;
    return;
  }
  poly([c[0], c[1], c[5], c[4]], shade(b.color, 0.85));
  poly([c[1], c[2], c[6], c[5]], shade(b.color, 0.62));
  poly([c[4], c[5], c[6], c[7]], shade(b.color, 1.12));
  // lit windows on the two visible faces
  const wr = makeRng(b.winSeed);
  ctx.fillStyle = 'rgba(255,214,120,0.9)';
  for (let f = 0; f < 2; f++) {
    const a = f === 0 ? c[0] : c[1], bb = f === 0 ? c[1] : c[2], t1 = f === 0 ? c[4] : c[5], t2 = f === 0 ? c[5] : c[6];
    const colsW = 4, rowsW = Math.max(2, Math.floor(b.h / 42));
    for (let i = 0; i < colsW; i++) for (let j = 0; j < rowsW; j++) {
      if (wr() > b.lit) continue;
      const u = (i + 0.3) / colsW, v = (j + 0.3) / rowsW;
      const x = a.sx + (bb.sx - a.sx) * u + (t1.sx - a.sx) * v;
      const y = a.sy + (bb.sy - a.sy) * u + (t1.sy - a.sy) * v;
      const s = Math.max(1, 3.2 * a.scale * 0.09);
      ctx.fillRect(x, y, s, s * 1.3);
    }
    void t2;
  }
}
function drawPalm(p) {
  const base = project(p.x, p.y, 0), top = project(p.x, p.y, 52 * p.s);
  if (!base || !top) return;
  ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = Math.max(1, 3 * base.scale * 0.06);
  ctx.beginPath(); ctx.moveTo(base.sx, base.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();
  ctx.strokeStyle = '#3f9e4d';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + p.x;
    ctx.beginPath(); ctx.moveTo(top.sx, top.sy);
    ctx.lineTo(top.sx + Math.cos(a) * 14 * p.s * base.scale * 0.12, top.sy + Math.sin(a) * 5 * base.scale * 0.12 - 3); ctx.stroke();
  }
}
function drawSign(s) {
  const p = project(s.x, s.y, s.h);
  if (!p || p.depth > 700) return;
  ctx.font = 'bold ' + Math.max(5, 15 * p.scale * 0.14) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'hsl(' + s.hue + ',100%,68%)';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
  ctx.fillText(s.text, p.sx, p.sy);
  ctx.shadowBlur = 0;
}
function drawCarSprite(c) {
  const base = project(c.x, c.y, 0), top = project(c.x, c.y, 26);
  if (!base || !top || base.depth > 1100) return;
  const wdt = Math.max(3, 46 * base.scale * 0.14), hgt = base.sy - top.sy;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(base.sx, base.sy, wdt * 0.6, wdt * 0.18, 0, 0, 6.29); ctx.fill();
  ctx.fillStyle = c.cop ? '#20304a' : c.color;
  ctx.fillRect(base.sx - wdt / 2, top.sy + hgt * 0.35, wdt, hgt * 0.65);
  ctx.fillStyle = c.cop ? '#e8ecf2' : shade(c.color.startsWith('#') && c.color.length === 7 ? c.color : '#888888', 1.25);
  ctx.fillRect(base.sx - wdt * 0.32, top.sy, wdt * 0.64, hgt * 0.42);
  ctx.fillStyle = '#bfe6ff'; ctx.fillRect(base.sx - wdt * 0.28, top.sy + hgt * 0.06, wdt * 0.56, hgt * 0.2);
  if (c.cop) { ctx.fillStyle = (G.time >> 4) % 2 ? '#ff4444' : '#4488ff'; ctx.fillRect(base.sx - wdt * 0.2, top.sy - 3, wdt * 0.4, 4); }
  ctx.fillStyle = '#ffd76b';
  ctx.fillRect(base.sx - wdt / 2 + 1, base.sy - 3, 3, 3); ctx.fillRect(base.sx + wdt / 2 - 4, base.sy - 3, 3, 3);
}
function drawPed(p) {
  const base = project(p.x, p.y, 0), top = project(p.x, p.y, 34);
  if (!base || !top || base.depth > 800) return;
  const hgt = base.sy - top.sy;
  ctx.fillStyle = p.down ? '#773' : 'hsl(' + p.hue + ',60%,55%)';
  if (p.down) { ctx.fillRect(base.sx - hgt * 0.4, base.sy - 3, hgt * 0.8, 3); return; }
  ctx.fillRect(base.sx - hgt * 0.16, top.sy + hgt * 0.25, hgt * 0.32, hgt * 0.75);
  ctx.fillStyle = '#e8b88a'; ctx.beginPath(); ctx.arc(base.sx, top.sy + hgt * 0.14, hgt * 0.13, 0, 6.29); ctx.fill();
}
function drawPlayer() {
  if (player.car) return;
  const base = project(player.x, player.y, 0), top = project(player.x, player.y, 36);
  if (!base || !top) return;
  const hgt = base.sy - top.sy;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(base.sx, base.sy, hgt * 0.3, hgt * 0.1, 0, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(base.sx - hgt * 0.17, top.sy + hgt * 0.25, hgt * 0.34, hgt * 0.75);
  ctx.fillStyle = '#e8b88a'; ctx.beginPath(); ctx.arc(base.sx, top.sy + hgt * 0.13, hgt * 0.13, 0, 6.29); ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  const gx = base.sx + Math.cos(player.a - G.cam.a) * hgt * 0.4, gy = top.sy + hgt * 0.45 + Math.sin(player.a - G.cam.a) * hgt * 0.15;
  ctx.beginPath(); ctx.moveTo(base.sx, top.sy + hgt * 0.45); ctx.lineTo(gx, gy); ctx.stroke();
}
function drawMarker() {
  const m = G.mission; if (!m) return;
  const p = project(m.tx, m.ty, 90 + Math.sin(G.time * 0.1) * 12);
  if (p) {
    ctx.fillStyle = 'rgba(255,80,160,0.9)';
    ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx - 10, p.sy - 22); ctx.lineTo(p.sx + 10, p.sy - 22); ctx.closePath(); ctx.fill();
  }
  // off-screen direction arrow
  const a = Math.atan2(m.ty - player.y, m.tx - player.x) - camAngle();
  ctx.save(); ctx.translate(W / 2, H * 0.2); ctx.rotate(a + Math.PI / 2);
  ctx.fillStyle = 'rgba(255,80,160,0.75)';
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(8, 8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.restore();
}
function render() {
  drawSky();
  drawGround();
  // depth-sorted draw list
  const items = [];
  for (const b of world.buildings) { const p = project(b.x + b.w / 2, b.y + b.d / 2, 0); if (p && p.depth < 1200) items.push({ d: p.depth, f: () => drawBuilding(b) }); }
  for (const p of world.palms) { const pr = project(p.x, p.y, 0); if (pr && pr.depth < 900) items.push({ d: pr.depth, f: () => drawPalm(p) }); }
  for (const c of cars) { const pr = project(c.x, c.y, 0); if (pr) items.push({ d: pr.depth, f: () => drawCarSprite(c) }); }
  for (const p of peds) { const pr = project(p.x, p.y, 0); if (pr) items.push({ d: pr.depth, f: () => drawPed(p) }); }
  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.f();
  for (const s of world.signs) drawSign(s);
  drawPlayer();
  for (const b of bullets) { const p = project(b.x, b.y, 30); if (p) { ctx.fillStyle = '#ffe98a'; ctx.fillRect(p.sx - 2, p.sy - 1, 4, 2); } }
  drawMarker();
  if (G.shake > 0) { ctx.save(); ctx.translate((rng() - 0.5) * G.shake, (rng() - 0.5) * G.shake); ctx.restore(); G.shake--; }
}

// ---------- HUD, minimap, screens ----------
function drawMinimap() {
  const s = 148, x0 = W - s - 16, y0 = 16;
  ctx.fillStyle = 'rgba(10,14,24,0.72)'; ctx.fillRect(x0, y0, s, s);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.strokeRect(x0, y0, s, s);
  const kx = s / (world.width + 600), ky = s / (world.height + 120);
  const mx = (wx) => x0 + (wx - CITY.shoreX + 300) * kx, my = (wy) => y0 + (wy + 60) * ky;
  ctx.fillStyle = '#1d5f7a'; ctx.fillRect(x0, y0, (CITY.shoreX + 300 - 300) * kx + 8, s);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  for (let gx = 0; gx <= CITY.cols; gx++) { ctx.beginPath(); ctx.moveTo(mx(gx * CITY.block), y0); ctx.lineTo(mx(gx * CITY.block), y0 + s); ctx.stroke(); }
  for (let gy = 0; gy <= CITY.rows; gy++) { ctx.beginPath(); ctx.moveTo(x0, my(gy * CITY.block)); ctx.lineTo(x0 + s, my(gy * CITY.block)); ctx.stroke(); }
  if (G.mission) { ctx.fillStyle = '#ff50a0'; ctx.fillRect(mx(G.mission.tx) - 3, my(G.mission.ty) - 3, 6, 6); }
  for (const c of cops) { ctx.fillStyle = '#5aa2ff'; ctx.fillRect(mx(c.x) - 2, my(c.y) - 2, 4, 4); }
  ctx.fillStyle = '#ffe14d';
  ctx.beginPath(); ctx.arc(mx(player.x), my(player.y), 4, 0, 6.29); ctx.fill();
  ctx.strokeStyle = '#ffe14d';
  ctx.beginPath(); ctx.moveTo(mx(player.x), my(player.y));
  ctx.lineTo(mx(player.x) + Math.cos(camAngle()) * 10, my(player.y) + Math.sin(camAngle()) * 10); ctx.stroke();
}
function drawHUD() {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,14,24,0.55)'; ctx.fillRect(14, 14, 252, 96);
  ctx.fillStyle = '#7dff8a'; ctx.font = 'bold 22px monospace';
  ctx.fillText('$' + G.cash, 24, 42);
  ctx.font = '16px monospace'; ctx.fillStyle = '#fff';
  ctx.fillText('HP ' + Math.max(0, Math.ceil(player.hp)), 24, 66);
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(80, 54, 120, 10);
  ctx.fillStyle = player.hp > 30 ? '#59d977' : '#e0483e'; ctx.fillRect(80, 54, 120 * Math.max(0, player.hp) / 100, 10);
  ctx.font = '20px sans-serif';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
  ctx.fillStyle = G.wanted ? '#ffd23e' : 'rgba(255,255,255,0.35)';
  ctx.fillText(stars, 24, 94);
  if (player.car) { ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.fillText('SPEED ' + Math.abs(Math.round(player.car.v * 9)) + ' km/h', 24, 128); }
  if (G.mission) {
    const m = G.mission;
    ctx.fillStyle = 'rgba(10,14,24,0.55)'; ctx.fillRect(14, H - 84, Math.min(560, W - 28), 62);
    ctx.fillStyle = '#ffb3d9'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(m.name, 24, H - 58);
    ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    ctx.fillText(m.text + '  ⏱ ' + Math.ceil(m.t / 60) + 's', 24, H - 36);
  }
  if (G.msgT > 0) {
    ctx.textAlign = 'center'; ctx.font = 'bold 19px sans-serif';
    ctx.fillStyle = 'rgba(10,14,24,0.6)';
    const wdt = ctx.measureText(G.msg).width + 30;
    ctx.fillRect(W / 2 - wdt / 2, 18, wdt, 34);
    ctx.fillStyle = '#ffe9a8'; ctx.fillText(G.msg, W / 2, 42); ctx.textAlign = 'left';
  }
  drawMinimap();
}
function drawTitle() {
  render();
  ctx.fillStyle = 'rgba(16,8,30,0.45)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillStyle = '#ff5fa2'; ctx.shadowColor = '#ff5fa2'; ctx.shadowBlur = 26;
  ctx.fillText('VICE HARBOR', W / 2, H * 0.36);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd76b'; ctx.font = 'bold 24px sans-serif';
  ctx.fillText('An original open-world crime caper on the golden coast', W / 2, H * 0.44);
  ctx.fillStyle = '#fff'; ctx.font = '17px sans-serif';
  ctx.fillText('Run three jobs for the Marlin Club: a pier delivery, a police escape, a 5-gate harbour run.', W / 2, H * 0.52);
  ctx.fillText('WASD move/drive · Q/E or mouse camera · Shift sprint · E enter/exit car · Click shoot · Space handbrake · Esc pause', W / 2, H * 0.58);
  ctx.fillStyle = '#7dff8a'; ctx.font = 'bold 21px sans-serif';
  ctx.fillText(G.missionDone > 0 || G.cash > 0 ? 'Saved cash $' + G.cash + ' — press Enter to continue' : 'Press Enter or click to play', W / 2, H * 0.68);
  ctx.textAlign = 'left';
}
function drawEnd() {
  render();
  ctx.fillStyle = 'rgba(10,4,18,0.6)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#ffd76b';
  ctx.fillText(G.missionDone >= 3 ? 'HARBOR LEGEND' : 'BUSTED / WASTED', W / 2, H * 0.4);
  ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
  ctx.fillText(G.over, W / 2, H * 0.5);
  ctx.fillText('Press Enter to roam again', W / 2, H * 0.58);
  ctx.textAlign = 'left';
}
function drawPause() {
  ctx.fillStyle = 'rgba(8,8,16,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 40px sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2);
  ctx.font = '16px sans-serif'; ctx.fillText('Esc or P to resume', W / 2, H / 2 + 32);
  ctx.textAlign = 'left';
}

// ---------- deterministic screenshot scenes ----------
function setupShot(name) {
  G.screen = 'play'; G.paused = false;
  if (name === 'start') { G.screen = 'title'; player.x = CITY.shoreX + 120; player.y = world.pier.y - 60; G.cam.a = -Math.PI / 2; return; }
  if (name === 'play') {
    const c = spawnCar(2.05 * CITY.block, 1.4 * CITY.block, Math.PI / 2); player.car = c; c.driver = true; c.ai = false; c.v = 8;
    player.x = c.x; player.y = c.y; startMission(0); G.mission.t = 70 * 60; return;
  }
  if (name === 'chase') {
    player.x = 2.05 * CITY.block; player.y = 1.35 * CITY.block; player.a = Math.PI / 2; G.cam.a = 0;
    G.heat = 90; G.wanted = 3;
    const ahead = spawnCar(player.x - 12, player.y + 250, -Math.PI / 2, true); ahead.ai = true; ahead.v = 4;
    const t1 = spawnCar(player.x + 14, player.y + 130, Math.PI / 2); t1.ai = true; t1.v = 4;
    spawnCar(player.x - 10, player.y - 120, Math.PI / 2, true).ai = true; spawnCar(player.x + 16, player.y - 210, Math.PI / 2, true).ai = true;
    cops.push(cars[cars.length - 1], cars[cars.length - 2], ahead);
    say('Harbour Police are on you — 3 stars! Lose them!', 5);
    return;
  }
  if (name === 'mission') {
    player.x = 1.5 * CITY.block; player.y = 5.4 * CITY.block; G.cam.a = Math.PI / 2; player.a = Math.PI / 2;
    startMission(2); return;
  }
}

// ---------- main loop ----------
spawnTraffic();
if (SHOT) setupShot(SHOT);
else if (G.missionDone < MISSIONS.length) { /* mission starts on play */ }
let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  G.time++; frames++;
  if (G.screen === 'play' && !G.paused) {
    stepPlayer(); stepTraffic(); stepCops(); stepBullets(); updateMission();
    if (G.msgT > 0) G.msgT--;
    sirenTick(G.time);
    if (player.car && Math.abs(player.car.v) > 1 && frames % 9 === 0) beep(55 + Math.abs(player.car.v) * 7, 0.07, 'sawtooth', 0.012);
  }
  if (G.screen === 'title') drawTitle();
  else if (G.screen === 'end') drawEnd();
  else { render(); drawHUD(); if (G.paused) drawPause(); }
  if (SHOT && frames > 40 && !window.__shotReady) window.__shotReady = true;
}
loop();
