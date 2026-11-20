// Vice Harbor — original open-world crime game. Plain canvas 2D, projected-3D look.
import { buildWorld, mulberry, WORLD_W, WORLD_H } from './world.js';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let W = 0, H = 0;
function fit() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
addEventListener('resize', fit); fit();

const qs = new URLSearchParams(location.search);
const shotMode = qs.get('shot');
const seed = parseInt(qs.get('seed') || '1', 10) || 1;
const world = buildWorld(seed);
const rng = mulberry(seed * 331 + 7);

const SAVE_KEY = 'vice-harbor-save-v1';
let save = { cash: 0, mission: 0, done: false };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) save = s; } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ---- audio: WebAudio synth, created only after a user gesture ----
let AC = null, muted = false;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function beep(freq, dur, type, vol, slide) {
  const ac = audio(); if (!ac || muted) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'square'; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
  g.gain.value = vol || 0.05; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
const sfx = {
  shot() { beep(720, 0.09, 'sawtooth', 0.09, -500); },
  cash() { beep(880, 0.08, 'sine', 0.07); setTimeout(() => beep(1320, 0.1, 'sine', 0.07), 70); },
  siren() { beep(660, 0.18, 'triangle', 0.04, 220); },
  crash() { beep(120, 0.2, 'sawtooth', 0.1, -70); },
  gate() { beep(520, 0.12, 'sine', 0.08, 260); },
};

// ---- input ----
const keys = {};
let mouseX = W / 2, mouseY = H / 2, mouseDown = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true; audio();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyE' && !e.repeat) tryEnterExit();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
cv.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
cv.addEventListener('mousedown', (e) => { mouseDown = true; audio(); if (screen === 'title') startGame(); else if (screen === 'play') shoot(); });
addEventListener('mouseup', () => { mouseDown = false; });

// ---- entities & game state ----
let screen = 'title'; // title | play | pause | end
let camAngle = 0, camX = world.spawn.x, camY = world.spawn.y;
const player = { x: world.spawn.x, y: world.spawn.y, a: 0, hp: 100, inCar: null, walk: 0 };
let wanted = 0, wantedTimer = 0, cashRun = 0, shotsFx = [];
let missionIdx = save.mission || 0, missionState = 'offer', missionTime = 0, gateIdx = 0, endMsg = '';
const MISSIONS = [
  { name: 'M1 · Hot Delivery', text: 'Drive the package to the marina drop before the clock runs out.', time: 75 },
  { name: 'M2 · Two-Star Heat', text: 'You are at 2 stars. Shake the police — stay out of sight until the heat cools.', time: 90 },
  { name: 'M3 · Checkpoint Run', text: 'Blast through all 5 neon gates across the city.', time: 120 },
];
const CAR_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#9b5de5', '#00bbf9', '#f15bb5', '#8ac926'];
const cars = [], peds = [], cops = [];
function makeCar(x, y, a, cop) {
  return { x, y, a, speed: 0, color: cop ? '#dfe6ee' : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], cop: !!cop, hp: 100, ai: rng() * 10, lane: rng() < 0.5 ? -14 : 14 };
}
for (let i = 0; i < 16; i++) {
  const vert = rng() < 0.5;
  const rx = world.roadsX[Math.floor(rng() * world.roadsX.length)] + 200;
  const ry = world.roadsY[Math.floor(rng() * world.roadsY.length)] + 200;
  cars.push(makeCar(vert ? rx : 200 + rng() * 2800, vert ? 200 + rng() * 1600 : ry, vert ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI)));
}
for (let i = 0; i < 22; i++) peds.push({ x: 150 + rng() * 2900, y: 150 + rng() * 1800, a: rng() * 6.28, t: rng() * 10, color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], flee: 0 });
function spawnCop() {
  const a = rng() * 6.28;
  cops.push(makeCar(player.x + Math.cos(a) * 700, player.y + Math.sin(a) * 700, a, true));
}
function addWanted(n) { wanted = Math.min(5, wanted + n); wantedTimer = 14; if (wanted >= 2 && cops.length < wanted) spawnCop(); }
function startGame() { if (screen === 'title' || screen === 'end') { screen = 'play'; if (missionState === 'offer') beginMission(missionIdx); } }
function togglePause() { if (screen === 'play') screen = 'pause'; else if (screen === 'pause') screen = 'play'; }
function beginMission(i) {
  missionIdx = i; gateIdx = 0;
  if (i >= MISSIONS.length) { missionState = 'done'; return; }
  missionState = 'active'; missionTime = MISSIONS[i].time;
  if (i === 1) { wanted = Math.max(wanted, 2); wantedTimer = 20; while (cops.length < 2) spawnCop(); }
}
function completeMission() {
  const pay = 250 + missionIdx * 200;
  cashRun += pay; save.cash = (save.cash || 0) + pay; save.mission = missionIdx + 1;
  sfx.cash();
  if (missionIdx + 1 >= MISSIONS.length) { save.done = true; persist(); endMsg = 'Story complete! Final cash: $' + cashRun; screen = 'end'; missionState = 'done'; }
  else { persist(); beginMission(missionIdx + 1); }
}
function tryEnterExit() {
  if (screen !== 'play') return;
  if (player.inCar) { player.x = player.inCar.x + 26; player.y = player.inCar.y; player.inCar = null; return; }
  let best = null, bd = 70;
  for (const c of cars.concat(cops)) { const d = Math.hypot(c.x - player.x, c.y - player.y); if (d < bd) { bd = d; best = c; } }
  if (best) { player.inCar = best; if (!best.cop && rng() < 0.6) addWanted(1); }
}
function shoot() {
  if (player.inCar || screen !== 'play') return;
  sfx.shot();
  const a = Math.atan2(mouseY - H / 2, mouseX - W / 2) + camAngle;
  shotsFx.push({ x: player.x, y: player.y, a, t: 0.12 });
  for (const p of peds) { const d = Math.hypot(p.x - player.x, p.y - player.y); const pa = Math.atan2(p.y - player.y, p.x - player.x); if (d < 320 && Math.abs(((pa - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.12) { p.flee = 5; addWanted(1); } }
  for (const c of cops) { const d = Math.hypot(c.x - player.x, c.y - player.y); if (d < 340) { c.hp -= 34; if (c.hp <= 0) { cops.splice(cops.indexOf(c), 1); addWanted(1); sfx.crash(); } } }
}

// ---- simulation ----
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function step(dt) {
  if (keys.KeyQ) camAngle -= 1.8 * dt;
  if (keys.KeyE && false) {}
  // camera orbit with mouse when at screen edges is implicit; Q/E handled: E is enter/exit, so orbit uses Q and R
  if (keys.KeyR) camAngle += 1.8 * dt;
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const str = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  if (player.inCar) {
    const c = player.inCar;
    const maxv = keys.ShiftLeft ? 430 : 300;
    c.speed += fwd * 260 * dt; c.speed -= c.speed * 0.8 * dt;
    if (keys.Space) c.speed -= c.speed * 3 * dt;
    c.speed = clamp(c.speed, -120, maxv);
    if (Math.abs(c.speed) > 5) c.a += str * 1.7 * dt * Math.sign(c.speed);
    c.x = clamp(c.x + Math.cos(c.a) * c.speed * dt, 20, WORLD_W - 20);
    c.y = clamp(c.y + Math.sin(c.a) * c.speed * dt, 20, WORLD_H - 20);
    player.x = c.x; player.y = c.y; player.a = c.a;
  } else {
    const sp = (keys.ShiftLeft ? 210 : 125);
    const mx = Math.cos(camAngle) * str - Math.sin(camAngle) * -fwd;
    const my = Math.sin(camAngle) * str + Math.cos(camAngle) * -fwd;
    // movement in camera space: forward is up-screen
    const vx = str * Math.cos(camAngle) - fwd * Math.sin(camAngle + Math.PI / 2) * 0 + (fwd ? Math.sin(camAngle) * 0 : 0);
    void mx; void my; void vx;
    const dx = (str * Math.cos(camAngle) + fwd * Math.sin(camAngle));
    const dy = (str * Math.sin(camAngle) - fwd * Math.cos(camAngle));
    const len = Math.hypot(dx, dy) || 1;
    if (fwd || str) { player.x = clamp(player.x + (dx / len) * sp * dt, 15, WORLD_W - 15); player.y = clamp(player.y + (dy / len) * sp * dt, 15, WORLD_H - 15); player.a = Math.atan2(dy, dx); player.walk += dt * 9; }
  }
  camX += (player.x - camX) * Math.min(1, dt * 5);
  camY += (player.y - camY) * Math.min(1, dt * 5);
  // traffic AI: cruise along facing, turn at random, avoid nothing fancy
  for (const c of cars) {
    if (c === player.inCar) continue;
    c.ai -= dt;
    if (c.ai <= 0) { c.ai = 2 + rng() * 4; if (rng() < 0.4) c.a += (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2); }
    c.speed += (90 - c.speed) * dt;
    c.x += Math.cos(c.a) * c.speed * dt; c.y += Math.sin(c.a) * c.speed * dt;
    if (c.x < 30 || c.x > WORLD_W - 30 || c.y < 30 || c.y > WORLD_H - 30) { c.a += Math.PI; c.x = clamp(c.x, 30, WORLD_W - 30); c.y = clamp(c.y, 30, WORLD_H - 30); }
  }
  for (const p of peds) {
    p.t -= dt;
    if (p.t <= 0) { p.t = 2 + rng() * 3; p.a = rng() * 6.28; }
    const sp = p.flee > 0 ? 95 : 34; if (p.flee > 0) { p.flee -= dt; p.a = Math.atan2(p.y - player.y, p.x - player.x); }
    p.x = clamp(p.x + Math.cos(p.a) * sp * dt, 20, WORLD_W - 20); p.y = clamp(p.y + Math.sin(p.a) * sp * dt, 20, 2020);
  }
  // police pursuit
  for (const c of cops) {
    if (c === player.inCar) continue;
    const ta = Math.atan2(player.y - c.y, player.x - c.x);
    let da = ((ta - c.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    c.a += clamp(da, -1.6 * dt, 1.6 * dt);
    c.speed += ((player.inCar ? 300 : 215) - c.speed) * dt * 0.8;
    c.x += Math.cos(c.a) * c.speed * dt; c.y += Math.sin(c.a) * c.speed * dt;
    const d = Math.hypot(player.x - c.x, player.y - c.y);
    if (d < 34) { player.hp -= 14 * dt; if (Math.random() < dt * 0.4) sfx.siren(); }
  }
  if (wanted > 0) {
    wantedTimer -= dt;
    const seen = cops.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 460);
    if (!seen && wantedTimer <= 0) { wanted--; wantedTimer = 12; if (wanted === 0) cops.length = 0; }
    if (seen) wantedTimer = Math.max(wantedTimer, 4);
    while (cops.length < Math.min(wanted, 4)) spawnCop();
  }
  for (const s of shotsFx) s.t -= dt;
  shotsFx = shotsFx.filter((s) => s.t > 0);
  // missions
  if (missionState === 'active' && screen === 'play') {
    missionTime -= dt;
    if (missionTime <= 0) { missionState = 'offer'; beginMission(missionIdx); }
    if (missionIdx === 0 && player.inCar && Math.hypot(player.x - world.drop.x, player.y - world.drop.y) < 90) completeMission();
    if (missionIdx === 1 && wanted === 0) completeMission();
    if (missionIdx === 2) {
      const g = world.gates[gateIdx];
      if (g && Math.hypot(player.x - g.x, player.y - g.y) < 80) { gateIdx++; sfx.gate(); if (gateIdx >= world.gates.length) completeMission(); }
    }
  }
  if (player.hp <= 0) { endMsg = 'Wasted in Vice Harbor. Cash earned: $' + cashRun; screen = 'end'; player.hp = 100; wanted = 0; cops.length = 0; }
}

// ---- rendering: top-down world rotated by camera, buildings extruded for a 3D look ----
function w2s(x, y) {
  const dx = x - camX, dy = y - camY;
  const ca = Math.cos(-camAngle), sa = Math.sin(-camAngle);
  return [W / 2 + dx * ca - dy * sa, H / 2 + dx * sa + dy * ca];
}
function drawCar(c) {
  const [x, y] = w2s(c.x, c.y); if (x < -80 || y < -80 || x > W + 80 || y > H + 80) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(c.a + camAngle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-20, -8, 44, 22);
  ctx.fillStyle = c.cop ? '#eef2f6' : c.color; ctx.beginPath(); ctx.roundRect(-22, -11, 44, 22, 6); ctx.fill();
  ctx.fillStyle = c.cop ? '#2255cc' : 'rgba(20,20,40,0.85)'; ctx.fillRect(-6, -9, 16, 18);
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(20, -9, 3, 5); ctx.fillRect(20, 4, 3, 5);
  ctx.fillStyle = '#ff3355'; ctx.fillRect(-24, -9, 3, 5); ctx.fillRect(-24, 4, 3, 5);
  if (c.cop) { ctx.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff2244' : '#2266ff'; ctx.fillRect(-3, -3, 7, 6); ctx.fillStyle = '#112'; ctx.font = 'bold 7px sans-serif'; ctx.fillText('POLICE', -14, 2); }
  ctx.restore();
}
function draw() {
  // golden-hour sky gradient backdrop
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.5, '#7597de'); sky.addColorStop(1, '#ff9a5a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // ground: city slab
  const corners = [w2s(0, 0), w2s(WORLD_W, 0), w2s(WORLD_W, WORLD_H), w2s(0, WORLD_H)];
  ctx.fillStyle = '#8d8577'; ctx.beginPath(); corners.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  // ocean
  const oc = [w2s(0, world.oceanY), w2s(WORLD_W, world.oceanY), w2s(WORLD_W, WORLD_H), w2s(0, WORLD_H)];
  const og = ctx.createLinearGradient(0, oc[0][1], 0, oc[2][1]); og.addColorStop(0, '#ffb37a'); og.addColorStop(0.25, '#2e86c1'); og.addColorStop(1, '#14507e');
  ctx.fillStyle = og; ctx.beginPath(); oc.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
  // boardwalk + pier
  ctx.strokeStyle = '#c9a06a'; ctx.lineWidth = 26;
  let a = w2s(0, world.oceanY - 14), b = w2s(WORLD_W, world.oceanY - 14);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  ctx.lineWidth = world.pier.w; const p0 = w2s(world.pier.x, world.pier.y), p1 = w2s(world.pier.x, world.pier.y + world.pier.len);
  ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
  // roads
  ctx.strokeStyle = '#3c3f47'; ctx.lineWidth = 64;
  for (const rx of world.roadsX) { const p = w2s(rx + 200, 0), q = w2s(rx + 200, WORLD_H); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
  for (const ry of world.roadsY) { const p = w2s(0, ry + 200), q = w2s(WORLD_W, ry + 200); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
  ctx.strokeStyle = '#f7d154'; ctx.lineWidth = 2; ctx.setLineDash([16, 18]);
  for (const rx of world.roadsX) { const p = w2s(rx + 200, 0), q = w2s(rx + 200, WORLD_H); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
  ctx.setLineDash([]);
  // garage (hideout)
  const g = world.garage, [gx, gy] = w2s(g.x, g.y);
  ctx.fillStyle = '#5b4a68'; ctx.fillRect(gx, gy, g.w, g.d);
  ctx.fillStyle = '#22e6ff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('HIDEOUT GARAGE', gx + 8, gy + 20);
  // mission markers
  if (missionState === 'active') {
    let tx, ty, col = '#ffd23e';
    if (missionIdx === 0) { tx = world.drop.x; ty = world.drop.y; }
    else if (missionIdx === 2 && world.gates[gateIdx]) { tx = world.gates[gateIdx].x; ty = world.gates[gateIdx].y; col = '#39ff88'; }
    if (tx !== undefined) { const [mx, my] = w2s(tx, ty); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(mx, my, 42 + Math.sin(performance.now() / 200) * 6, 0, 6.29); ctx.stroke(); ctx.fillStyle = col; ctx.font = 'bold 22px sans-serif'; ctx.fillText('▼', mx - 8, my - 52); }
  }
  // buildings sorted far-to-near by screen y for extrusion overlap
  const bs = world.buildings.map((bd) => ({ bd, s: w2s(bd.x, bd.y) })).filter((o) => o.s[0] > -300 && o.s[1] > -300 && o.s[0] < W + 300 && o.s[1] < H + 300).sort((p, q) => p.s[1] - q.s[1]);
  for (const { bd, s } of bs) {
    const lift = bd.h * 0.55;
    ctx.fillStyle = `hsl(${bd.hue} 45% 26%)`;
    ctx.fillRect(s[0], s[1] - lift, bd.w, bd.d + lift); // side
    ctx.fillStyle = `hsl(${bd.hue} 60% 52%)`;
    ctx.fillRect(s[0], s[1] - lift, bd.w, bd.d); // roof face (top-down footprint raised)
    ctx.fillStyle = `hsl(${bd.hue} 55% 40%)`;
    ctx.fillRect(s[0], s[1] - lift, bd.w, 6);
    for (const [c, f, col] of bd.wins) { ctx.fillStyle = col; ctx.fillRect(s[0] + 6 + c * 22, s[1] - lift + 10 + f * 15, 9, 7); if (f * 15 > bd.d) break; }
  }
  // neon signs
  ctx.textAlign = 'center';
  for (const sg of world.signs) { const [x, y] = w2s(sg.x, sg.y); if (x < -100 || x > W + 100 || y < -50 || y > H + 50) continue; ctx.font = 'bold 13px sans-serif'; ctx.shadowColor = sg.color; ctx.shadowBlur = 12; ctx.fillStyle = sg.color; ctx.fillText(sg.text, x, y - 40); ctx.shadowBlur = 0; }
  ctx.textAlign = 'left';
  // palms
  for (const pm of world.palms) { const [x, y] = w2s(pm.x, pm.y); if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue; ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 18); ctx.stroke(); ctx.strokeStyle = '#2fae5f'; ctx.lineWidth = 3; for (let i = 0; i < 5; i++) { const aa = (i / 5) * 6.28; ctx.beginPath(); ctx.moveTo(x + 4, y - 18); ctx.lineTo(x + 4 + Math.cos(aa) * 16, y - 18 + Math.sin(aa) * 7 - 3); ctx.stroke(); } }
  // peds
  for (const p of peds) { const [x, y] = w2s(p.x, p.y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.29); ctx.fill(); ctx.fillStyle = '#f2c79b'; ctx.beginPath(); ctx.arc(x, y - 2, 3.4, 0, 6.29); ctx.fill(); }
  for (const c of cars) drawCar(c);
  for (const c of cops) drawCar(c);
  // shot tracers
  for (const s of shotsFx) { const [x, y] = w2s(s.x, s.y); ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(s.a - camAngle) * 300, y + Math.sin(s.a - camAngle) * 300); ctx.stroke(); }
  // player
  if (!player.inCar) { const [x, y] = w2s(player.x, player.y); ctx.save(); ctx.translate(x, y); ctx.rotate(player.a + camAngle); ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.29); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(4, -2, 9, 4); ctx.restore(); }
  drawHUD();
  if (screen === 'title') drawTitle();
  if (screen === 'pause') drawOverlay('PAUSED', 'Esc / P to resume · WASD move · E car · Click shoot · Space handbrake');
  if (screen === 'end') drawOverlay('VICE HARBOR', endMsg + ' — click to play again');
}
function drawOverlay(t, s) { ctx.fillStyle = 'rgba(10,6,30,0.72)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 52px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t, W / 2, H / 2 - 10); ctx.fillStyle = '#fff'; ctx.font = '17px sans-serif'; ctx.fillText(s, W / 2, H / 2 + 30); ctx.textAlign = 'left'; }
function drawTitle() {
  const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(43,16,85,0.55)'); gr.addColorStop(1, 'rgba(255,110,64,0.35)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 84px sans-serif'; ctx.shadowColor = '#ff4fa3'; ctx.shadowBlur = 26; ctx.fillStyle = '#ffe66d'; ctx.fillText('VICE HARBOR', W / 2, H / 2 - 60); ctx.shadowBlur = 0;
  ctx.fillStyle = '#22e6ff'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('GOLDEN HOUR · OPEN WORLD · THREE JOBS', W / 2, H / 2 - 20);
  ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
  ctx.fillText('Click to start — WASD move, E steal a car, click to shoot, Space handbrake', W / 2, H / 2 + 26);
  ctx.fillText('Saved cash: $' + (save.cash || 0) + (save.done ? ' · Story complete' : ' · Mission ' + ((save.mission || 0) + 1) + ' of 3'), W / 2, H / 2 + 56);
  ctx.textAlign = 'left';
}
function drawHUD() {
  if (screen === 'title') return;
  ctx.fillStyle = 'rgba(8,6,24,0.55)'; ctx.fillRect(12, 12, 300, 86);
  ctx.fillStyle = '#ff5566'; ctx.fillRect(22, 24, 160, 12); ctx.fillStyle = '#39ff88'; ctx.fillRect(22, 24, 160 * Math.max(0, player.hp) / 100, 12);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('HP', 190, 35);
  ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 19px sans-serif';
  ctx.fillText('★'.repeat(wanted) + '☆'.repeat(5 - wanted), 22, 62);
  ctx.fillStyle = '#7CFC9a'; ctx.fillText('$' + cashRun, 170, 62);
  ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
  if (missionState === 'active') ctx.fillText(MISSIONS[missionIdx].name + ' · ' + Math.ceil(missionTime) + 's' + (missionIdx === 2 ? ' · Gate ' + (gateIdx + 1) + '/5' : ''), 22, 86);
  else ctx.fillText('Free roam — hideout garage is NW', 22, 86);
  if (missionState === 'active') { ctx.fillStyle = 'rgba(8,6,24,0.5)'; ctx.fillRect(W / 2 - 260, H - 44, 520, 30); ctx.fillStyle = '#ffe66d'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(MISSIONS[missionIdx].text, W / 2, H - 23); ctx.textAlign = 'left'; }
  // minimap
  const mw = 150, mh = 112, mx0 = W - mw - 14, my0 = 14;
  ctx.fillStyle = 'rgba(8,20,40,0.8)'; ctx.fillRect(mx0, my0, mw, mh);
  ctx.fillStyle = '#2e86c1'; ctx.fillRect(mx0, my0 + mh * (world.oceanY / WORLD_H), mw, mh * (1 - world.oceanY / WORLD_H));
  ctx.fillStyle = '#ffd23e'; for (const bd of world.buildings) ctx.fillRect(mx0 + mw * bd.x / WORLD_W, my0 + mh * bd.y / WORLD_H, 2, 2);
  ctx.fillStyle = '#ff2244'; for (const c of cops) ctx.fillRect(mx0 + mw * c.x / WORLD_W - 2, my0 + mh * c.y / WORLD_H - 2, 4, 4);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx0 + mw * player.x / WORLD_W, my0 + mh * player.y / WORLD_H, 3.5, 0, 6.29); ctx.fill();
  ctx.strokeStyle = '#22e6ff'; ctx.strokeRect(mx0, my0, mw, mh);
}

// ---- deterministic screenshot scenes ----
function setupShot(name) {
  if (name === 'start') { screen = 'title'; camX = 900; camY = 1000; camAngle = 0.4; }
  if (name === 'play') {
    screen = 'play'; beginMission(0);
    const c = cars[0]; c.x = 1000; c.y = 1000; c.a = 0.5; player.inCar = c; player.x = c.x; player.y = c.y; camX = c.x; camY = c.y; camAngle = 0.3;
  }
  if (name === 'chase') {
    screen = 'play'; beginMission(1); wanted = 3; wantedTimer = 30;
    const c = cars[1]; c.x = 1400; c.y = 900; c.a = 0.2; player.inCar = c; player.x = c.x; player.y = c.y; camX = c.x; camY = c.y;
    cops.length = 0; for (let i = 0; i < 3; i++) { const cp = makeCar(c.x - 90 - i * 70, c.y + 50 + i * 34, 0.2, true); cops.push(cp); }
  }
  if (name === 'mission') {
    screen = 'play'; missionIdx = 2; missionState = 'active'; missionTime = 87; gateIdx = 1;
    const c = cars[2]; c.x = world.gates[1].x - 130; c.y = world.gates[1].y + 30; c.a = 0; player.inCar = c; player.x = c.x; player.y = c.y; camX = c.x; camY = c.y;
  }
  // settle a few frames of simulation so AI and camera are alive in the still
  for (let i = 0; i < 20; i++) step(1 / 30);
  draw();
  requestAnimationFrame(() => { draw(); window.__shotReady = true; });
}
// ---- main loop ----
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (screen === 'play' && !shotMode) step(dt);
  draw();
  requestAnimationFrame(loop);
}
if (shotMode) setupShot(shotMode); else requestAnimationFrame(loop);
document.getElementById('status').textContent = 'Vice Harbor loaded';
