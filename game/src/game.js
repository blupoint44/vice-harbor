// Vice Harbor — an original open-world crime game in Port Solana.
// Plain canvas 2D with a projected-3D look: extruded towers sorted by depth.
import { buildCity, mulberry, onRoad, collide, clampWorld, WORLD } from './world.js';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot') || '';
let W = 0, H = 0;
function resize() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
addEventListener('resize', resize); resize();

const city = buildCity(SEED);
const rnd = mulberry(SEED * 31 + 7);
const keys = {};
let mouseX = W / 2, mouseDown = false, started = false;

// ---- audio (created lazily on first gesture) ----
let AC = null, engOsc = null, engGain = null;
function audio() {
  if (AC) return AC;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    engOsc = AC.createOscillator(); engGain = AC.createGain();
    engOsc.type = 'sawtooth'; engOsc.frequency.value = 55; engGain.gain.value = 0;
    engOsc.connect(engGain).connect(AC.destination); engOsc.start();
  } catch (e) { AC = null; }
  return AC;
}
function beep(freq, dur, type, vol, slide) {
  if (!audio()) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, AC.currentTime + dur);
  g.gain.value = vol || 0.08;
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
  o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
}
function shotSound() { beep(720, 0.12, 'sawtooth', 0.15, 90); }
function sirenSound() { beep(660, 0.3, 'triangle', 0.05, 990); }

// ---- save ----
let save = { cash: 250, done: 0 };
try { const s = JSON.parse(localStorage.getItem('viceharbor') || 'null'); if (s) save = s; } catch (e) {}
function persist() { try { localStorage.setItem('viceharbor', JSON.stringify(save)); } catch (e) {} }

// ---- entities ----
const CAR_COLORS = ['#e74c3c','#3498db','#f1c40f','#9b59b6','#1abc9c','#e67e22','#ecf0f1','#fd79a8'];
function makeCar(x, z, police) {
  return { x, z, a: Math.floor(rnd() * 4) * Math.PI / 2, v: 0, police: !!police,
    color: police ? '#dfe6ee' : CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)],
    hp: 100, driver: true, cruise: 90 + rnd() * 70, turnT: 0 };
}
const cars = [], peds = [], cops = [];
for (let i = 0; i < 16; i++) {
  const horiz = rnd() < 0.5;
  const lane = Math.floor(rnd() * 8) * WORLD.roadEvery + WORLD.roadEvery - 50;
  const along = rnd() * WORLD.size;
  cars.push(makeCar(horiz ? along : lane, horiz ? lane : along, false));
}
for (let i = 0; i < 26; i++) peds.push({ x: 100 + rnd() * 1500, z: rnd() * WORLD.size, a: rnd() * 6.28, t: rnd() * 5, hue: Math.floor(rnd() * 360), dead: 0 });

const player = { x: 250, z: 250, a: -0.6, hp: 100, car: null, walk: 0 };
let cam = { x: player.x, z: player.z, yaw: 0.8, dist: 340 };
let wanted = 0, heat = 0, state = SHOT ? 'play' : 'title';
let msg = '', msgT = 0, tracer = null, flash = 0, time = 0, sirenT = 0;

// ---- missions: 1 timed delivery, 2 escape, 3 checkpoint run ----
const MISSIONS = [
  { name: 'Hot Package', text: 'Marisol Vega: get the package to the pier, fast.', kind: 'deliver', tx: 1830, tz: 1150, limit: 75, pay: 400 },
  { name: 'Shake the Heat', text: 'Lose the cops: stay out of sight until the stars fade.', kind: 'escape', pay: 650 },
  { name: 'Harbor Run', text: 'Hit all 5 checkpoint gates around Port Solana.', kind: 'gates', pay: 900 },
];
const GATES = [[600, 550], [1250, 250], [1550, 900], [900, 1500], [300, 2050]];
let mission = null;
function startMission(idx) {
  const m = MISSIONS[idx];
  mission = { idx, kind: m.kind, tx: m.tx, tz: m.tz, left: m.limit || 0, gate: 0, pay: m.pay };
  msg = m.text; msgT = 6;
  if (m.kind === 'escape') { wanted = 2; heat = 2; }
  beep(520, 0.15, 'square', 0.07); setTimeout(() => beep(780, 0.2, 'square', 0.07), 120);
}
function endMission(ok) {
  if (ok) { save.cash += mission.pay; save.done = Math.max(save.done, mission.idx + 1); msg = 'Mission passed! +$' + mission.pay; beep(880, 0.3, 'triangle', 0.1); }
  else msg = 'Mission failed. Talk to Marisol at the garage to retry.';
  msgT = 5; mission = null; persist();
}

// ---- input ----
addEventListener('keydown', (e) => {
  keys[e.code] = true; audio(); started = true;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') state = 'pause'; else if (state === 'pause') state = 'play'; }
  if (state === 'title' && (e.code === 'Enter' || e.code === 'Space')) state = 'play';
  if (state === 'end' && e.code === 'Enter') location.reload();
  if (e.code === 'KeyE' && state === 'play') toggleCar();
  if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => { mouseX = e.clientX; });
addEventListener('mousedown', () => { mouseDown = true; audio(); started = true; if (state === 'title') state = 'play'; else if (state === 'play') shoot(); });
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('click', () => { audio(); });

function toggleCar() {
  if (player.car) {
    const c = player.car; player.car = null;
    player.x = c.x + Math.cos(c.a + Math.PI / 2) * 26; player.z = c.z + Math.sin(c.a + Math.PI / 2) * 26;
    c.driver = false; msg = 'On foot.'; msgT = 2; return;
  }
  let best = null, bd = 70;
  for (const c of cars.concat(cops)) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
  if (best) {
    player.car = best; best.driver = true;
    if (best.police) addHeat(1);
    msg = best.police ? 'You stole a patrol car!' : 'Nice wheels. WASD to drive, Space = handbrake.'; msgT = 3;
    beep(300, 0.12, 'square', 0.06, 500);
  }
}
function addHeat(n) { heat = Math.min(5, heat + n); wanted = Math.floor(heat); }
function shoot() {
  if (player.car || flash > 0) return;
  flash = 0.08; shotSound();
  const dir = player.a;
  let hit = null, hd = 420;
  for (const p of peds) { if (p.dead) continue; const d = Math.hypot(p.x - player.x, p.z - player.z); const ang = Math.atan2(p.z - player.z, p.x - player.x); if (d < hd && Math.abs(angDiff(ang, dir)) < 0.09) { hit = p; hd = d; } }
  for (const c of cars.concat(cops)) { const d = Math.hypot(c.x - player.x, c.z - player.z); const ang = Math.atan2(c.z - player.z, c.x - player.x); if (d < hd && Math.abs(angDiff(ang, dir)) < 0.14) { hit = c; hd = d; } }
  tracer = { x1: player.x, z1: player.z, x2: player.x + Math.cos(dir) * hd, z2: player.z + Math.sin(dir) * hd, t: 0.09 };
  if (hit) {
    if (hit.hp !== undefined) { hit.hp -= 34; if (hit.hp <= 0) { hit.dead = 1; addHeat(1); } }
    else { hit.dead = 1; addHeat(1); msg = 'Civilian down — the heat is on!'; msgT = 3; }
  }
}
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

// ---- update ----
function stepCar(c, dt, isPlayer) {
  const fwd = isPlayer ? (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) : 1;
  const steer = isPlayer ? (keys.KeyA ? -1 : 0) + (keys.KeyD ? 1 : 0) : 0;
  const maxV = isPlayer ? 430 : c.cruise;
  c.v += (fwd * 260 - c.v * 0.7) * dt;
  if (!isPlayer) c.v += (c.cruise - c.v) * dt * 0.5;
  if (isPlayer && keys.Space) c.v *= Math.pow(0.12, dt);
  c.v = Math.max(-140, Math.min(maxV, c.v));
  if (Math.abs(c.v) > 4) c.a += steer * dt * 1.9 * Math.sign(c.v) * Math.min(1, Math.abs(c.v) / 120);
  const nx = c.x + Math.cos(c.a) * c.v * dt, nz = c.z + Math.sin(c.a) * c.v * dt;
  if (!collide(city.buildings, nx, nz, 16)) { c.x = clampWorld(nx); c.z = clampWorld(nz); }
  else if (isPlayer) { c.v *= -0.3; player.hp -= 2; }
  // traffic: follow road grid, turn at junctions
  if (!isPlayer && c.driver) {
    c.turnT -= dt;
    const m = WORLD.roadEvery;
    const nearJunction = (((c.x % m) + m) % m > m - 130) && (((c.z % m) + m) % m > m - 130);
    if (nearJunction && c.turnT <= 0 && rnd() < 0.5) { c.a += (rnd() < 0.5 ? 1 : -1) * Math.PI / 2; c.turnT = 3; }
    if (c.z > WORLD.seaX - 30 && Math.cos(c.a) > 0) c.a += Math.PI;
  }
}
function stepCop(c, dt) {
  const targetA = Math.atan2(player.z - c.z, player.x - c.x);
  c.a += Math.max(-2.2 * dt, Math.min(2.2 * dt, angDiff(targetA, c.a)));
  const d = Math.hypot(player.x - c.x, player.z - c.z);
  const want = d > 60 ? 380 : 60;
  c.v += (want - c.v) * dt * 1.4;
  const nx = c.x + Math.cos(c.a) * c.v * dt, nz = c.z + Math.sin(c.a) * c.v * dt;
  if (!collide(city.buildings, nx, nz, 16)) { c.x = clampWorld(nx); c.z = clampWorld(nz); }
  if (d < 34) { player.hp -= 14 * dt; if (player.hp <= 0) state = 'end'; }
}
function update(dt) {
  time += dt;
  if (flash > 0) flash -= dt;
  if (tracer) { tracer.t -= dt; if (tracer.t <= 0) tracer = null; }
  if (msgT > 0) msgT -= dt;
  // camera orbit
  if (keys.KeyQ) cam.yaw += dt * 1.6;
  if (!player.car && keys.KeyE) {} // E handled on keydown
  cam.yaw += ((mouseX / W) - 0.5) * dt * 0.7;
  // player
  if (player.car) {
    stepCar(player.car, dt, true);
    player.x = player.car.x; player.z = player.car.z; player.a = player.car.a;
    if (engGain) { engGain.gain.value = 0.03; engOsc.frequency.value = 50 + Math.abs(player.car.v) * 0.35; }
  } else {
    if (engGain) engGain.gain.value = 0;
    const sp = (keys.ShiftLeft || keys.ShiftRight) ? 215 : 125;
    let mx = 0, mz = 0;
    if (keys.KeyW) { mx += Math.cos(cam.yaw); mz += Math.sin(cam.yaw); }
    if (keys.KeyS) { mx -= Math.cos(cam.yaw); mz -= Math.sin(cam.yaw); }
    if (keys.KeyA) { mx += Math.cos(cam.yaw - Math.PI / 2); mz += Math.sin(cam.yaw - Math.PI / 2); }
    if (keys.KeyD) { mx += Math.cos(cam.yaw + Math.PI / 2); mz += Math.sin(cam.yaw + Math.PI / 2); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len; player.a = Math.atan2(mz, mx); player.walk += dt * 9;
      const nx = player.x + mx * sp * dt, nz = player.z + mz * sp * dt;
      if (!collide(city.buildings, nx, nz, 10)) { player.x = clampWorld(nx); player.z = clampWorld(nz); }
    }
  }
  cam.x += (player.x - Math.cos(cam.yaw) * 0 - cam.x) * Math.min(1, dt * 5);
  cam.z += (player.z - cam.z) * Math.min(1, dt * 5);
  for (const c of cars) if (c !== player.car && !c.dead) stepCar(c, dt, false);
  for (const p of peds) {
    if (p.dead) continue;
    p.t -= dt; if (p.t <= 0) { p.a = rnd() * 6.28; p.t = 2 + rnd() * 4; }
    const nx = p.x + Math.cos(p.a) * 34 * dt, nz = p.z + Math.sin(p.a) * 34 * dt;
    if (!collide(city.buildings, nx, nz, 6) && nx < WORLD.seaX - 20) { p.x = nx; p.z = nz; } else p.a += Math.PI;
  }
  // wanted / police
  if (wanted > 0) {
    sirenT -= dt; if (sirenT <= 0) { sirenSound(); sirenT = 0.62; }
    while (cops.length < wanted + 1 && cops.length < 6) {
      const a = rnd() * 6.28; cops.push(makeCar(player.x + Math.cos(a) * 520, player.z + Math.sin(a) * 520, true));
    }
    if (!(mission && mission.kind === 'escape')) heat = Math.max(0, heat - dt * 0.03);
  } else if (cops.length) cops.pop();
  wanted = Math.floor(heat);
  for (const c of cops) if (!c.dead && c !== player.car) stepCop(c, dt);
  for (let i = cops.length - 1; i >= 0; i--) if (cops[i].dead) cops.splice(i, 1);
  // garage: start next mission
  const g = city.garage;
  if (!mission && save.done < 3 && Math.abs(player.x - (g.x + g.w / 2)) < 60 && Math.abs(player.z - (g.z + g.d / 2)) < 60) startMission(save.done);
  // mission logic
  if (mission) {
    if (mission.kind === 'deliver') {
      mission.left -= dt;
      if (Math.hypot(player.x - mission.tx, player.z - mission.tz) < 55) endMission(true);
      else if (mission.left <= 0) endMission(false);
    } else if (mission.kind === 'escape') {
      if (wanted < 2) { mission.left += dt; if (mission.left > 6) endMission(true); }
      else mission.left = 0;
    } else if (mission.kind === 'gates') {
      const gt = GATES[mission.gate];
      if (Math.hypot(player.x - gt[0], player.z - gt[1]) < 60) { mission.gate++; beep(990, 0.15, 'triangle', 0.09); if (mission.gate >= GATES.length) endMission(true); }
    }
    if (state === 'play' && save.done >= 3 && !mission) state = 'end';
  }
  if (player.hp <= 0) state = 'end';
}

// ---- rendering: projected-3D look on a 2D canvas ----
function project(x, z) {
  // rotate world around camera, then weak perspective from a raised cam
  const dx = x - cam.x, dz = z - cam.z;
  const s = Math.sin(-cam.yaw), c = Math.cos(-cam.yaw);
  const rx = dx * c - dz * s, rz = dx * s + dz * c;
  const horizon = H * 0.42;
  const scale = 620 / Math.max(60, rz + 620);
  return { sx: W / 2 + rx * scale * 1.6, sy: horizon + rz * 0.42 * scale + 130 * scale, scale, behind: rz < -60 };
}
function draw() {
  // golden-hour sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.55, '#7597de'); sky.addColorStop(0.8, '#ff9a5a'); sky.addColorStop(1, '#ffd194');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.55);
  ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.3, 34, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,180,120,0.5)'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.3, 58, 0, 7); ctx.fill();
  // ground: sand/grass base, sea on the east side
  ctx.fillStyle = '#3f7d4e'; ctx.fillRect(0, H * 0.42, W, H * 0.58);
  const seaP = project(WORLD.seaX, cam.z);
  ctx.fillStyle = '#1d6f9f'; ctx.fillRect(seaP.sx, H * 0.42, W, H * 0.58);
  ctx.fillStyle = '#e8cf8f'; ctx.fillRect(seaP.sx - 26, H * 0.42, 26, H * 0.58);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 8; i++) { const y = H * 0.48 + ((time * 22 + i * 47) % (H * 0.45)); ctx.fillRect(seaP.sx + 20 + (i * 137) % Math.max(60, W - seaP.sx - 40), y, 42, 3); }
  drawRoads();
  // depth-sorted objects
  const items = [];
  for (const b of city.buildings) items.push({ z: b.z - cam.z, kind: 'b', o: b });
  for (const p of city.palms) items.push({ z: p.z - cam.z, kind: 'palm', o: p });
  for (const s of city.signs) items.push({ z: s.z - cam.z, kind: 'sign', o: s });
  for (const c of cars) items.push({ z: c.z - cam.z, kind: 'car', o: c });
  for (const c of cops) items.push({ z: c.z - cam.z, kind: 'car', o: c });
  for (const p of peds) items.push({ z: p.z - cam.z, kind: 'ped', o: p });
  items.push({ z: player.z - cam.z, kind: 'player', o: player });
  items.sort((a, b) => a.z - b.z);
  for (const it of items) {
    if (it.kind === 'b') drawBuilding(it.o);
    else if (it.kind === 'palm') drawPalm(it.o);
    else if (it.kind === 'sign') drawSign(it.o);
    else if (it.kind === 'car') drawCar(it.o);
    else if (it.kind === 'ped') drawPed(it.o);
    else drawPlayer();
  }
  if (tracer) {
    const a = project(tracer.x1, tracer.z1), b = project(tracer.x2, tracer.z2);
    ctx.strokeStyle = 'rgba(255,240,150,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy - 26 * a.scale); ctx.lineTo(b.sx, b.sy - 14 * b.scale); ctx.stroke();
  }
  drawGarageMarker();
  drawMissionMarker();
  drawHUD();
  if (state === 'title') drawTitle();
  if (state === 'pause') drawOverlay('PAUSED', 'Esc / P to resume — Vice Harbor');
  if (state === 'end') drawOverlay(save.done >= 3 ? 'STORY COMPLETE' : 'WASTED', 'Cash $' + save.cash + ' — press Enter to play again');
}
function drawRoads() {
  ctx.fillStyle = '#3a3f4a';
  const m = WORLD.roadEvery;
  for (let i = 0; i <= 8; i++) {
    const a = project(i * m - 100, cam.z - 700), b = project(i * m, cam.z + 900);
    ctx.fillRect(Math.min(a.sx, b.sx), H * 0.42, Math.abs(b.sx - a.sx) + 30, H * 0.58);
    const c1 = project(cam.x - 800, i * m - 100), c2 = project(cam.x + 800, i * m);
    ctx.fillRect(0, Math.min(c1.sy, c2.sy), W, Math.abs(c2.sy - c1.sy) + 8);
  }
  ctx.strokeStyle = 'rgba(255,215,90,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([16, 20]);
  for (let i = 0; i <= 8; i++) {
    const a = project(i * m - 50, cam.z - 700), b = project(i * m - 50, cam.z + 900);
    ctx.beginPath(); ctx.moveTo(a.sx, H); ctx.lineTo(b.sx, H * 0.42); ctx.stroke();
  }
  ctx.setLineDash([]);
}
function drawBuilding(b) {
  const base = project(b.x, b.z), top = project(b.x, b.z);
  if (base.behind) return;
  const s = base.scale, wpx = b.w * s * 1.6, hpx = b.h * s * 1.15;
  const x = base.sx - wpx / 2, y = base.sy - hpx;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 6 * s, base.sy - 4, wpx, 8 * s);
  ctx.fillStyle = `hsl(${b.hue},38%,${26 + b.h * 0.03}%)`; ctx.fillRect(x, y, wpx, hpx);
  ctx.fillStyle = `hsl(${b.hue},42%,${38 + b.h * 0.03}%)`; ctx.fillRect(x, y, wpx, 6 * s);
  ctx.fillStyle = `hsl(${b.hue + 18},36%,20%)`; ctx.fillRect(x + wpx * 0.82, y, wpx * 0.18, hpx);
  // lit windows from the building's own seed
  const wr = mulberry(b.seed);
  const cols = Math.max(2, Math.floor(b.w / 22)), rows = Math.max(3, Math.floor(b.h / 26));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (wr() < b.lit) { ctx.fillStyle = wr() < 0.2 ? '#ffd76a' : '#ffeec2'; ctx.fillRect(x + 4 + i * (wpx - 8) / cols, y + 5 + j * (hpx - 10) / rows, Math.max(1.5, 5 * s), Math.max(1.5, 7 * s)); }
  }
}
function drawPalm(p) {
  const q = project(p.x, p.z); if (q.behind) return;
  const s = q.scale * p.s;
  ctx.strokeStyle = '#6d4c2f'; ctx.lineWidth = Math.max(1.5, 5 * s);
  ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.quadraticCurveTo(q.sx + 8 * s, q.sy - 30 * s, q.sx + 14 * s, q.sy - 52 * s); ctx.stroke();
  ctx.strokeStyle = '#2e9e5b'; ctx.lineWidth = Math.max(1.2, 3.4 * s);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4; ctx.beginPath(); ctx.moveTo(q.sx + 14 * s, q.sy - 52 * s); ctx.quadraticCurveTo(q.sx + 14 * s + Math.cos(a) * 20 * s, q.sy - 52 * s + Math.sin(a) * 8 * s - 6 * s, q.sx + 14 * s + Math.cos(a) * 30 * s, q.sy - 52 * s + Math.sin(a) * 16 * s); ctx.stroke(); }
}
function drawSign(sgn) {
  const q = project(sgn.x, sgn.z); if (q.behind || q.scale < 0.35) return;
  const y = q.sy - sgn.h * q.scale * 1.15;
  ctx.font = `bold ${Math.max(7, 17 * q.scale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.shadowColor = `hsl(${sgn.hue},100%,65%)`; ctx.shadowBlur = 14 * q.scale;
  ctx.fillStyle = `hsl(${sgn.hue},100%,78%)`;
  ctx.fillText(sgn.text, q.sx, y);
  ctx.shadowBlur = 0;
}
function drawCar(c) {
  const q = project(c.x, c.z); if (q.behind) return;
  const s = q.scale, w = 34 * s, l = 58 * s;
  ctx.save(); ctx.translate(q.sx, q.sy); ctx.rotate(0); // top-ish projected body
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-w / 2 + 3, -l / 2 + 4, w, l);
  ctx.fillStyle = c.dead ? '#444' : c.color; ctx.fillRect(-w / 2, -l / 2, w, l);
  ctx.fillStyle = '#bfe8ff'; ctx.fillRect(-w / 2 + 4 * s, -l * 0.18, w - 8 * s, l * 0.3);
  ctx.fillStyle = '#22252c'; ctx.fillRect(-w / 2 + 3 * s, -l * 0.32, w - 6 * s, l * 0.12);
  if (c.police) {
    ctx.fillStyle = '#20304a'; ctx.fillRect(-w / 2, -l * 0.06, w, l * 0.12);
    ctx.fillStyle = (Math.floor(time * 4) % 2) ? '#ff4040' : '#4080ff';
    ctx.fillRect(-w * 0.22, -4 * s, w * 0.44, 7 * s);
    ctx.fillStyle = '#20304a'; ctx.font = `bold ${Math.max(5, 10 * s)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('POLICE', 0, l * 0.3);
  }
  ctx.fillStyle = '#ffe9a0'; ctx.fillRect(-w / 2 + 2 * s, -l / 2, 6 * s, 4 * s); ctx.fillRect(w / 2 - 8 * s, -l / 2, 6 * s, 4 * s);
  ctx.restore();
}
function drawPed(p) {
  const q = project(p.x, p.z); if (q.behind) return;
  const s = q.scale;
  if (p.dead) { ctx.fillStyle = '#7a2430'; ctx.fillRect(q.sx - 10 * s, q.sy - 3 * s, 20 * s, 5 * s); return; }
  ctx.fillStyle = `hsl(${p.hue},65%,55%)`;
  ctx.fillRect(q.sx - 4.5 * s, q.sy - 20 * s, 9 * s, 13 * s);
  ctx.fillStyle = '#f2c79b'; ctx.beginPath(); ctx.arc(q.sx, q.sy - 24 * s, 4.6 * s, 0, 7); ctx.fill();
  ctx.strokeStyle = '#26303c'; ctx.lineWidth = Math.max(1, 2.6 * s);
  const sw = Math.sin(time * 7 + p.x) * 5 * s;
  ctx.beginPath(); ctx.moveTo(q.sx, q.sy - 7 * s); ctx.lineTo(q.sx - sw, q.sy); ctx.moveTo(q.sx, q.sy - 7 * s); ctx.lineTo(q.sx + sw, q.sy); ctx.stroke();
}
function drawPlayer() {
  if (player.car) return;
  const q = project(player.x, player.z); const s = q.scale;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(q.sx, q.sy, 10 * s, 4 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff5964'; ctx.fillRect(q.sx - 5 * s, q.sy - 24 * s, 10 * s, 15 * s);
  ctx.fillStyle = '#ffe0b2'; ctx.beginPath(); ctx.arc(q.sx, q.sy - 29 * s, 5.2 * s, 0, 7); ctx.fill();
  ctx.fillStyle = '#14100c'; ctx.fillRect(q.sx - 5.2 * s, q.sy - 34 * s, 10.4 * s, 4 * s);
  const ga = player.a - cam.yaw;
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = Math.max(1.2, 3 * s);
  ctx.beginPath(); ctx.moveTo(q.sx, q.sy - 18 * s); ctx.lineTo(q.sx + Math.cos(ga - Math.PI / 2) * 13 * s, q.sy - 18 * s + Math.sin(ga - Math.PI / 2) * 6 * s); ctx.stroke();
  if (flash > 0) { ctx.fillStyle = '#ffd94d'; ctx.beginPath(); ctx.arc(q.sx + Math.cos(ga - Math.PI / 2) * 17 * s, q.sy - 18 * s, 6 * s, 0, 7); ctx.fill(); }
}
function drawGarageMarker() {
  const g = city.garage, q = project(g.x + g.w / 2, g.z + g.d / 2);
  ctx.fillStyle = '#5b6672'; ctx.fillRect(q.sx - 55 * q.scale, q.sy - 44 * q.scale, 110 * q.scale, 44 * q.scale);
  ctx.fillStyle = '#ffb703'; ctx.font = `bold ${Math.max(7, 13 * q.scale)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('VEGA GARAGE', q.sx, q.sy - 48 * q.scale);
  if (!mission && save.done < 3) beacon(g.x + g.w / 2, g.z + g.d / 2, '#ffd94d');
}
function beacon(x, z, color) {
  const q = project(x, z); if (q.behind) return;
  ctx.fillStyle = color; ctx.globalAlpha = 0.35 + 0.2 * Math.sin(time * 5);
  ctx.fillRect(q.sx - 3, 0, 6, q.sy); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.ellipse(q.sx, q.sy, 26 * q.scale, 9 * q.scale, 0, 0, 7); ctx.fill();
}
function drawMissionMarker() {
  if (!mission) return;
  if (mission.kind === 'deliver') beacon(mission.tx, mission.tz, '#4dff88');
  if (mission.kind === 'gates' && GATES[mission.gate]) beacon(GATES[mission.gate][0], GATES[mission.gate][1], '#4dc3ff');
}
function drawHUD() {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,10,18,0.55)'; ctx.fillRect(14, 14, 252, 86);
  ctx.fillStyle = '#ff5964'; ctx.fillRect(24, 26, 160 * Math.max(0, player.hp) / 100, 13);
  ctx.strokeStyle = '#fff'; ctx.strokeRect(24, 26, 160, 13);
  ctx.fillStyle = '#7CFC98'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('$' + save.cash, 24, 66);
  ctx.fillStyle = '#ffd94d'; ctx.font = '20px sans-serif';
  ctx.fillText('★'.repeat(wanted) + '☆'.repeat(5 - wanted), 110, 66);
  ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
  ctx.fillText(player.car ? 'DRIVING — E to exit' : 'ON FOOT — E near a car to steal it', 24, 90);
  if (mission) {
    ctx.fillStyle = 'rgba(10,10,18,0.6)'; ctx.fillRect(W / 2 - 230, 14, 460, 54);
    ctx.fillStyle = '#ffd94d'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    let line = MISSIONS[mission.idx].name;
    if (mission.kind === 'deliver') line += ' — ' + Math.max(0, mission.left).toFixed(0) + 's left';
    if (mission.kind === 'gates') line += ' — gate ' + (mission.gate + 1) + ' / 5';
    if (mission.kind === 'escape') line += ' — break line of sight!';
    ctx.fillText(line, W / 2, 38);
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(MISSIONS[mission.idx].text, W / 2, 58);
    ctx.textAlign = 'left';
  }
  if (msgT > 0 && msg) {
    ctx.fillStyle = 'rgba(10,10,18,0.65)'; ctx.fillRect(W / 2 - 260, H - 92, 520, 34);
    ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(msg, W / 2, H - 70); ctx.textAlign = 'left';
  }
  drawMinimap();
}
function drawMinimap() {
  const mw = 148, mx = W - mw - 14, my = 14, k = mw / WORLD.size;
  ctx.fillStyle = 'rgba(8,12,20,0.72)'; ctx.fillRect(mx, my, mw, mw);
  ctx.fillStyle = '#1d6f9f'; ctx.fillRect(mx + WORLD.seaX * k, my, mw - WORLD.seaX * k, mw);
  ctx.fillStyle = '#8a93a3';
  for (let i = 0; i <= 8; i++) { ctx.fillRect(mx + (i * WORLD.roadEvery - 50) * k, my, 100 * k, mw); ctx.fillRect(mx, my + (i * WORLD.roadEvery - 50) * k, mw, 100 * k); }
  ctx.fillStyle = '#ffd94d'; ctx.fillRect(mx + city.garage.x * k - 2, my + city.garage.z * k - 2, 5, 5);
  ctx.fillStyle = '#ff4040'; for (const c of cops) ctx.fillRect(mx + c.x * k - 1.5, my + c.z * k - 1.5, 3, 3);
  ctx.fillStyle = '#4dc3ff'; for (const c of cars) ctx.fillRect(mx + c.x * k - 1, my + c.z * k - 1, 2, 2);
  if (mission && mission.kind === 'deliver') { ctx.fillStyle = '#4dff88'; ctx.fillRect(mx + mission.tx * k - 2, my + mission.tz * k - 2, 5, 5); }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx + player.x * k, my + player.z * k, 3.4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.strokeRect(mx, my, mw, mw);
}
function drawTitle() {
  ctx.fillStyle = 'rgba(12,4,24,0.45)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff2e88'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffd94d'; ctx.font = 'bold 84px sans-serif'; ctx.fillText('VICE HARBOR', W / 2, H * 0.34);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#7ef0ff'; ctx.font = '22px sans-serif'; ctx.fillText('P O R T   S O L A N A', W / 2, H * 0.42);
  ctx.fillStyle = '#fff'; ctx.font = '17px sans-serif';
  ctx.fillText('Steal cars. Run packages for Marisol Vega. Outrun the Solana PD.', W / 2, H * 0.55);
  ctx.fillText('WASD move · E enter car · Click shoot · Shift sprint · Space handbrake · Esc pause', W / 2, H * 0.60);
  ctx.fillStyle = '#ffd94d'; ctx.font = 'bold 20px sans-serif';
  ctx.fillText(started ? 'CLICK OR PRESS ENTER TO PLAY' : 'PRESS ENTER TO PLAY', W / 2, H * 0.70);
  ctx.textAlign = 'left';
}
function drawOverlay(title, sub) {
  ctx.fillStyle = 'rgba(8,4,16,0.62)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd94d'; ctx.font = 'bold 58px sans-serif'; ctx.fillText(title, W / 2, H * 0.45);
  ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'; ctx.fillText(sub, W / 2, H * 0.55); ctx.textAlign = 'left';
}

// ---- deterministic screenshot scenes ----
function setupShot(name) {
  state = 'play';
  if (name === 'start') { state = 'title'; player.x = 420; player.z = 420; cam.yaw = 0.8; }
  if (name === 'play') {
    const c = cars[0]; c.x = 460; c.z = 450; c.a = 0.5; player.car = c; player.x = c.x; player.z = c.z; player.a = c.a; cam.yaw = 0.5;
    msg = 'Nice wheels. WASD to drive, Space = handbrake.'; msgT = 99;
  }
  if (name === 'chase') {
    player.x = 760; player.z = 760; const c = cars[1]; c.x = 760; c.z = 760; c.a = 0.7; player.car = c; player.a = 0.7; cam.yaw = 0.7;
    wanted = 3; heat = 3;
    cops.length = 0;
    cops.push(makeCar(690, 690, true), makeCar(845, 700, true), makeCar(700, 850, true));
    msg = 'Solana PD in pursuit!'; msgT = 99;
  }
  if (name === 'mission') {
    player.x = 300; player.z = 300; cam.yaw = 0.9;
    mission = { idx: 0, kind: 'deliver', tx: MISSIONS[0].tx, tz: MISSIONS[0].tz, left: 62, gate: 0, pay: 400 };
  }
  cam.x = player.x; cam.z = player.z;
}
if (SHOT) setupShot(SHOT);

let last = performance.now(), frames = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play') update(dt);
  else { time += dt; cam.x = player.x; cam.z = player.z; }
  draw();
  frames++;
  if (SHOT && frames > 4) window.__shotReady = true;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
