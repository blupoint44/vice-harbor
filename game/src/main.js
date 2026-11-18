// Vice Harbor — game entry point and core loop.
// An original open-world crime game: explore a golden-hour harbour city on
// foot or by car, steal rides, outrun the VHPD, work Marina Vale's three
// jobs, and try to stay out of the pier-side cells. Everything is wired
// together here: input, cameras, traffic, pedestrians, police, combat,
// missions, HUD, minimap, saving and the deterministic screenshot scenes.

import { SoundFX } from './audio.js';
import { buildCity, collide, mulberry32, AVENUES, STREETS, ROAD_HALF, CITY_EDGE, BOARDWALK_X } from './city.js';
import { makeCar, makePerson, CAR_COLORS, PERSON_PALETTES, POLICE_PALETTE, PLAYER_PALETTE } from './entities.js';
import { MISSIONS, startMission, currentStage, advanceMission, STORY_INTRO, STORY_DONE } from './missions.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = Number(params.get('seed') || '1') || 1;
const rng = mulberry32(SEED * 31337 + 7);

// ---------------------------------------------------------------- DOM refs
const $ = (id) => document.getElementById(id);
const hud = $('hud'), moneyEl = $('money'), starsEl = $('stars'), clockEl = $('clock');
const objTitleEl = $('objective-title'), objEl = $('objective'), timerEl = $('timer');
const healthFill = $('health-fill'), armorLine = $('armor-line'), speedEl = $('speed');
const interactEl = $('interact'), crosshairEl = $('crosshair'), bannerEl = $('banner');
const toastEl = $('toast'), vignette = $('vignette'), minimapCtx = $('minimap').getContext('2d');
const titleScreen = $('title-screen'), pauseScreen = $('pause-screen'), endScreen = $('end-screen');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$('game-holder').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600);
camera.position.set(-150, 24, -70);

const city = buildCity(scene, SEED);
const colliders = city.colliders;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- audio
const sfx = new SoundFX();
function unlockAudio() { sfx.unlock(); }
addEventListener('pointerdown', unlockAudio, { once: false });
addEventListener('keydown', unlockAudio, { once: false });

// ---------------------------------------------------------------- save data
const SAVE_KEY = 'viceharbor-save-v1';
let save = null;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (err) { save = null; }
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: G.money, missionIndex: G.missionIndex,
      x: Math.round(playerPos().x), z: Math.round(playerPos().z),
      stats: G.stats,
    }));
  } catch (err) { /* private mode: saving is best-effort */ }
}

// ---------------------------------------------------------------- game state
const G = {
  mode: 'title',           // title | playing | paused | ended
  money: save && save.money != null ? save.money : 250,
  missionIndex: save && save.missionIndex != null ? save.missionIndex : 0,
  mission: null,           // running mission state
  missionOffer: true,      // a "start" marker is on the map
  wanted: 0,               // 0..5 float, stars shown = ceil
  lastCrimeAt: -99,
  lastDamageAt: -99,
  heatSeenAt: -99,
  bustTimer: 0,
  elapsed: 0,
  stats: (save && save.stats) || { earned: 0, stolen: 0, shots: 0, hits: 0, missions: 0, busted: 0, wasted: 0 },
  endKind: '',
};
if (G.missionIndex >= MISSIONS.length) G.missionOffer = false;

const clockState = { t: 0 };

// ---------------------------------------------------------------- player
const playerMesh = makePerson(PLAYER_PALETTE);
playerMesh.scale.setScalar(1.06);
scene.add(playerMesh);
const player = {
  mesh: playerMesh,
  health: 100,
  heading: Math.PI,        // facing -Z-ish at spawn
  speed: 0,
  walkPhase: 0,
  car: null,               // car object while driving
  fireCooldown: 0,
  dead: false,
};
playerMesh.position.set(BOARDWALK_X - 4, 0, 26);
if (save && save.x != null && !SHOT) playerMesh.position.set(save.x, 0, save.z);
function playerPos() { return player.car ? player.car.mesh.position : playerMesh.position; }

// ---------------------------------------------------------------- markers
const markerGroup = new THREE.Group();
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.4, depthWrite: false });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 42, 12, 1, true), beamMat);
beam.position.y = 21;
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.1, 40), ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.15;
const markerLight = new THREE.PointLight(0xffd23e, 1.1, 26);
markerLight.position.y = 3;
markerGroup.add(beam, ring, markerLight);
scene.add(markerGroup);

const packageMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 0.5, 0.7),
  new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x8a5a00, emissiveIntensity: 1.4, roughness: 0.5 })
);
packageMesh.castShadow = true;
scene.add(packageMesh);

// ---------------------------------------------------------------- cars
const cars = [];
function addCar(kind, color, x, z, heading, state) {
  const mesh = makeCar(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const car = {
    mesh, kind, state, heading,
    speed: 0, steer: 0, health: 100,
    dirX: Math.sin(heading), dirZ: Math.cos(heading),
    targetSpeed: 10 + rng() * 4,
    turnCooldown: 0, cop: null, flashPhase: rng() * 6,
  };
  cars.push(car);
  return car;
}
function laneOffsetFor(dirX, dirZ) { return { x: dirZ * 3.1, z: -dirX * 3.1 }; }

function spawnTraffic(count) {
  const kinds = ['sedan', 'sedan', 'sport', 'taxi', 'van'];
  for (let i = 0; i < count; i++) {
    const vertical = rng() < 0.5;
    const line = vertical ? AVENUES[Math.floor(rng() * AVENUES.length)] : STREETS[Math.floor(rng() * STREETS.length)];
    const along = -CITY_EDGE + rng() * CITY_EDGE * 2;
    const dirSign = rng() < 0.5 ? 1 : -1;
    const dirX = vertical ? 0 : dirSign;
    const dirZ = vertical ? dirSign : 0;
    const off = laneOffsetFor(dirX, dirZ);
    const x = vertical ? line + off.x : along;
    const z = vertical ? along : line + off.z;
    const heading = Math.atan2(dirX, dirZ);
    addCar(kinds[Math.floor(rng() * kinds.length)], CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], x, z, heading, 'traffic');
  }
}
function spawnParked(count) {
  const kinds = ['sedan', 'sedan', 'sport', 'van', 'taxi'];
  for (let i = 0; i < count; i++) {
    const vertical = rng() < 0.5;
    const line = vertical ? AVENUES[Math.floor(rng() * AVENUES.length)] : STREETS[Math.floor(rng() * STREETS.length)];
    const along = -CITY_EDGE + 12 + rng() * (CITY_EDGE * 2 - 24);
    if (STREETS.some((s) => Math.abs(s - along) < 10) || AVENUES.some((a) => Math.abs(a - along) < 10)) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const off = side * (ROAD_HALF - 1.6);
    const x = vertical ? line + off : along;
    const z = vertical ? along : line + off;
    const heading = vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    addCar(kinds[Math.floor(rng() * kinds.length)], CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], x, z, heading, 'parked');
  }
}
spawnTraffic(15);
spawnParked(16);

// ---------------------------------------------------------------- people
const peds = [];
function addPed(x, z, palette, isCop = false) {
  const mesh = makePerson(palette || PERSON_PALETTES[Math.floor(rng() * PERSON_PALETTES.length)]);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const ped = {
    mesh, isCop, health: 100, heading: rng() * Math.PI * 2,
    speed: 0, walkPhase: rng() * 6, state: 'walk',
    tx: x, tz: z, fleeUntil: 0, fleeFrom: null, dead: false, deadAt: 0,
    shootCooldown: 0, car: null,
  };
  peds.push(ped);
  return ped;
}
function sidewalkTargetNear(x, z) {
  const ax = AVENUES[Math.floor(rng() * AVENUES.length)];
  const sz = STREETS[Math.floor(rng() * STREETS.length)];
  const sideA = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 1.6);
  const sideB = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 1.6);
  if (rng() < 0.5) return { x: ax + sideA, z: Math.max(-CITY_EDGE, Math.min(CITY_EDGE, z + (rng() - 0.5) * 90)) };
  return { x: Math.max(-CITY_EDGE, Math.min(CITY_EDGE, x + (rng() - 0.5) * 90)), z: sz + sideB };
}
for (let i = 0; i < 26; i++) {
  const t = sidewalkTargetNear((rng() - 0.5) * 260, (rng() - 0.5) * 260);
  const ped = addPed(t.x, t.z);
  const nt = sidewalkTargetNear(t.x, t.z);
  ped.tx = nt.x; ped.tz = nt.z;
}
// A greeter by the pier so the spawn point feels alive.
addPed(BOARDWALK_X - 5, 18);

// ---------------------------------------------------------------- input
const keys = {};
let camYaw = Math.PI * 0.78, camPitch = 0.32;
let mouseAimX = 0;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (G.mode === 'playing' && (e.code === 'Escape' || e.code === 'KeyP')) pauseGame();
  else if (G.mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) resumeGame();
  if (e.code === 'KeyE' && G.mode === 'playing' && !e.repeat) toggleCar();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (G.mode !== 'playing' || SHOT) return;
  camYaw -= (e.movementX || 0) * 0.0032;
  camPitch = Math.max(0.06, Math.min(1.05, camPitch + (e.movementY || 0) * 0.0026));
});
let mouseDownAt = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (G.mode !== 'playing' || player.car || SHOT) return;
  mouseDownAt = performance.now();
  firePistol();
});
addEventListener('contextmenu', (e) => { if (G.mode === 'playing') e.preventDefault(); });

// ---------------------------------------------------------------- helpers
function dist2D(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.hypot(dx, dz); }
function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function stars() { return Math.max(0, Math.min(5, Math.ceil(G.wanted - 0.001))); }
function commitCrime(amount, x, z) {
  G.wanted = Math.min(5, G.wanted + amount);
  G.lastCrimeAt = G.elapsed;
  alertCrowd(x, z, 20);
}
function alertCrowd(x, z, radius) {
  for (const ped of peds) {
    if (ped.dead || ped.isCop) continue;
    if (dist2D(ped.mesh.position.x, ped.mesh.position.z, x, z) < radius) {
      ped.state = 'flee';
      ped.fleeUntil = G.elapsed + 3 + rng() * 2;
      ped.fleeFrom = { x, z };
    }
  }
}
let toastTimer = null;
function toast(text, ms = 3400) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}
function showBanner(big, sub, ms = 2600) {
  bannerEl.querySelector('.big').textContent = big;
  bannerEl.querySelector('.sub').textContent = sub || '';
  bannerEl.classList.add('show');
  setTimeout(() => bannerEl.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- cars: enter / exit
function nearestCar(maxDist) {
  const p = playerMesh.position;
  let best = null, bestD = maxDist;
  for (const car of cars) {
    if (car.state === 'police' && car.copDeployed) continue;
    const d = dist2D(p.x, p.z, car.mesh.position.x, car.mesh.position.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}
function toggleCar() {
  if (player.car) {
    const car = player.car;
    car.state = car.prevState === 'traffic' ? 'parked' : (car.prevState || 'parked');
    if (car.state === 'parked') { car.speed = 0; }
    player.car = null;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    playerMesh.position.set(car.mesh.position.x + side.x * 2.4, 0, car.mesh.position.z + side.z * 2.4);
    playerMesh.visible = true;
    sfx.carDoor();
    sfx.setEngine(false, 0);
    persist();
  } else {
    const car = nearestCar(3.8);
    if (!car) return;
    const wasParked = car.state === 'parked';
    car.prevState = car.state;
    car.state = 'player';
    car.speed = 0;
    player.car = car;
    playerMesh.visible = false;
    G.stats.stolen += wasParked || car.prevState === 'traffic' ? 1 : 0;
    sfx.carDoor();
    if (car.prevState === 'traffic') { commitCrime(1.2, car.mesh.position.x, car.mesh.position.z); toast('Vehicle stolen! The VHPD has been notified.'); }
    else if (wasParked) { commitCrime(0.55, car.mesh.position.x, car.mesh.position.z); toast('Vehicle stolen.'); }
    persist();
  }
}

// ---------------------------------------------------------------- combat
const tracers = [];
const muzzleLight = new THREE.PointLight(0xffc46b, 0, 18);
scene.add(muzzleLight);
function firePistol() {
  if (player.fireCooldown > 0 || player.dead) return;
  player.fireCooldown = 0.22;
  G.stats.shots += 1;
  sfx.gunshot();
  // Aim: from the camera through the crosshair.
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const from = playerMesh.position.clone(); from.y = 1.45;
  let bestT = 70, bestPed = null, bestCar = null;
  for (const ped of peds) {
    if (ped.dead) continue;
    const c = ped.mesh.position.clone(); c.y = 1.1;
    const to = c.clone().sub(origin);
    const t = to.dot(dir);
    if (t < 1 || t > 70) continue;
    const perp = to.sub(dir.clone().multiplyScalar(t)).length();
    if (perp < 0.85 && t < bestT) { bestT = t; bestPed = ped; bestCar = null; }
  }
  for (const car of cars) {
    if (car === player.car) continue;
    const c = car.mesh.position.clone(); c.y = 0.8;
    const to = c.clone().sub(origin);
    const t = to.dot(dir);
    if (t < 1 || t > 70) continue;
    const perp = to.sub(dir.clone().multiplyScalar(t)).length();
    if (perp < 1.7 && t < bestT) { bestT = t; bestCar = car; bestPed = null; }
  }
  const end = origin.clone().add(dir.clone().multiplyScalar(bestPed || bestCar ? bestT : 55));
  end.y = Math.max(0.2, end.y);
  const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
  scene.add(line);
  tracers.push({ line, life: 0.07 });
  muzzleLight.position.copy(from).add(dir.clone().multiplyScalar(0.7));
  muzzleLight.intensity = 2.4;
  commitCrime(0.5, playerMesh.position.x, playerMesh.position.z);
  if (bestPed) {
    G.stats.hits += 1;
    bestPed.health -= 34;
    sfx.hitThud();
    if (bestPed.health <= 0 && !bestPed.dead) killPed(bestPed);
    else { bestPed.state = 'flee'; bestPed.fleeUntil = G.elapsed + 4; bestPed.fleeFrom = { x: playerMesh.position.x, z: playerMesh.position.z }; }
    if (bestPed.isCop) G.wanted = Math.min(5, G.wanted + 0.8);
  } else if (bestCar) {
    bestCar.health -= 20;
    sfx.hitThud();
  }
}
function killPed(ped) {
  ped.dead = true;
  ped.deadAt = G.elapsed;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.25;
  if (ped.isCop) { G.wanted = Math.min(5, G.wanted + 0.7); }
}

// ---------------------------------------------------------------- police
const policeCars = [];
function desiredPolice() { return stars() === 0 ? 0 : Math.min(6, stars() + 1); }
function spawnPolice() {
  const p = playerPos();
  let angle = rng() * Math.PI * 2;
  let x = p.x + Math.cos(angle) * 85, z = p.z + Math.sin(angle) * 85;
  // Snap to the nearest road line so cruisers arrive on streets, not rooftops.
  const nearA = AVENUES.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a, AVENUES[0]);
  const nearS = STREETS.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a, STREETS[0]);
  if (Math.abs(nearA - x) < Math.abs(nearS - z)) x = nearA; else z = nearS;
  x = Math.max(-CITY_EDGE, Math.min(CITY_EDGE, x));
  z = Math.max(-CITY_EDGE, Math.min(CITY_EDGE, z));
  const car = addCar('police', 0xffffff, x, z, Math.atan2(p.x - x, p.z - z), 'police');
  car.targetSpeed = 26;
  policeCars.push(car);
  return car;
}
function clearPolice() {
  for (const car of policeCars) {
    if (car.copPed) { car.copPed.dead = true; car.copPed.mesh.visible = false; }
    car.mesh.visible = false;
    car.state = 'gone';
  }
  policeCars.length = 0;
  for (const ped of peds) if (ped.isCop) { ped.dead = true; ped.mesh.visible = false; }
}
function deployCop(car) {
  if (car.copPed || car.copDeployed) return;
  const ped = addPed(car.mesh.position.x + 2, car.mesh.position.z, POLICE_PALETTE, true);
  ped.car = car;
  car.copPed = ped;
  car.copDeployed = true;
}

// ---------------------------------------------------------------- missions
function offerTarget() {
  const def = MISSIONS[G.missionIndex];
  return def.offerTarget || def.stages[0].target;
}
function missionTarget() {
  if (G.mission) { const s = currentStage(G.mission); return s ? s.target : null; }
  if (G.missionOffer && G.missionIndex < MISSIONS.length) return offerTarget();
  return null;
}
function startCurrentMission() {
  G.mission = startMission(G.missionIndex);
  G.missionOffer = false;
  const def = G.mission.def;
  if (def.wantedOnStart) { G.wanted = Math.max(G.wanted, def.wantedOnStart); G.lastCrimeAt = G.elapsed; }
  showBanner(def.title, def.brief, 3600);
  sfx.missionSting(true);
  toast('Mission started: ' + def.title);
}
function completeStage() {
  const st = currentStage(G.mission);
  if (st && st.kind === 'pickup') { sfx.pickupChime(); toast('Package acquired. Move!'); }
  const result = advanceMission(G.mission);
  if (result === 'done') {
    const pay = G.mission.def.pay;
    G.money += pay;
    G.stats.earned += pay;
    G.stats.missions += 1;
    const title = G.mission.def.title;
    G.mission = null;
    G.missionIndex += 1;
    if (G.missionIndex < MISSIONS.length) G.missionOffer = true;
    if (title === 'Hot Harbour') G.wanted = 0;
    sfx.cashRegister();
    sfx.missionSting(true);
    showBanner('Mission Passed', title + '  ·  +$' + pay);
    persist();
  } else {
    sfx.pickupChime();
    const next = currentStage(G.mission);
    toast('Next: ' + (next ? next.label : ''));
  }
}
function failMission(reason) {
  if (!G.mission) return;
  showBanner('Mission Failed', reason, 2800);
  sfx.missionSting(false);
  G.mission = null;
  G.missionOffer = true;
}

// ---------------------------------------------------------------- updates: player on foot
function updatePlayerOnFoot(dt) {
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  let mx = 0, mz = 0;
  if (keys.KeyW) mz += 1;
  if (keys.KeyS) mz -= 1;
  if (keys.KeyA) mx -= 1;
  if (keys.KeyD) mx += 1;
  if (keys.KeyQ) camYaw += dt * 2.2;
  if (keys.KeyE) camYaw -= dt * 2.2;
  const moving = (mx !== 0 || mz !== 0) && !SHOT;
  const speed = sprint ? 9.5 : 5.2;
  if (moving) {
    const len = Math.hypot(mx, mz);
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const wx = (mx * cos - mz * sin) / len;
    const wz = (-mx * sin - mz * cos) / len * -1;
    // Camera forward on the ground plane is (-sin(camYaw), -cos(camYaw)) flipped by view; use heading blend:
    const dirX = (Math.sin(camYaw) * -mz + Math.cos(camYaw) * mx) / len;
    const dirZ = (Math.cos(camYaw) * -mz - Math.sin(camYaw) * mx) / len;
    void wx; void wz;
    playerMesh.position.x += dirX * speed * dt;
    playerMesh.position.z += dirZ * speed * dt;
    player.heading = angleLerp(player.heading, Math.atan2(dirX, dirZ), 1 - Math.pow(0.0001, dt));
    player.walkPhase += dt * (sprint ? 13 : 9);
  } else {
    player.walkPhase += dt * 1.2;
  }
  collide(playerMesh.position, 0.55, colliders);
  playerMesh.rotation.y = player.heading;
  const parts = playerMesh.userData.parts;
  const swing = moving ? Math.sin(player.walkPhase) * 0.62 : Math.sin(player.walkPhase) * 0.04;
  parts.legL.rotation.x = swing;
  parts.legR.rotation.x = -swing;
  parts.armL.rotation.x = -swing * 0.8;
  parts.armR.rotation.x = swing * 0.8;
  playerMesh.position.y = moving ? Math.abs(Math.sin(player.walkPhase)) * 0.05 : 0;
  // Near-miss panic for peds.
  for (const ped of peds) {
    if (ped.dead || ped.isCop) continue;
    const d = dist2D(ped.mesh.position.x, ped.mesh.position.z, playerMesh.position.x, playerMesh.position.z);
    if (d < 2.2 && sprint) { ped.state = 'flee'; ped.fleeUntil = G.elapsed + 1.6; ped.fleeFrom = { x: playerMesh.position.x, z: playerMesh.position.z }; }
  }
}

// ---------------------------------------------------------------- updates: driving
function updatePlayerCar(dt) {
  const car = player.car;
  const maxF = car.kind === 'sport' ? 40 : car.kind === 'van' ? 26 : 33;
  const maxR = 10;
  let accel = 0;
  if (!SHOT) {
    if (keys.KeyW) accel = 17;
    if (keys.KeyS) accel = car.speed > 0.5 ? -26 : -9;
  } else accel = 6;
  car.speed += accel * dt;
  car.speed -= car.speed * 0.55 * dt;                    // drag
  if ((keys.Space) && !SHOT) car.speed -= car.speed * 3.2 * dt; // handbrake
  car.speed = Math.max(-maxR, Math.min(maxF, car.speed));
  if (!keys.KeyW && !keys.KeyS && Math.abs(car.speed) < 0.25) car.speed = 0;
  let steer = 0;
  if (!SHOT) {
    if (keys.KeyA) steer += 1;
    if (keys.KeyD) steer -= 1;
  }
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 8) * (car.speed < 0 ? -1 : 1);
  car.heading += steer * 1.65 * steerAuthority * dt * (1 - Math.min(0.55, Math.abs(car.speed) / 90));
  car.dirX = Math.sin(car.heading);
  car.dirZ = Math.cos(car.heading);
  car.mesh.position.x += car.dirX * car.speed * dt;
  car.mesh.position.z += car.dirZ * car.speed * dt;
  collide(car.mesh.position, 1.7, colliders);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = -steer * Math.min(0.06, Math.abs(car.speed) * 0.002);
  spinWheels(car, dt);
  sfx.setEngine(true, car.speed / maxF);
  // Running over a ped is very much a crime.
  for (const ped of peds) {
    if (ped.dead) continue;
    const d = dist2D(ped.mesh.position.x, ped.mesh.position.z, car.mesh.position.x, car.mesh.position.z);
    if (d < 1.9 && Math.abs(car.speed) > 3) {
      killPed(ped);
      commitCrime(1.1, car.mesh.position.x, car.mesh.position.z);
      sfx.hitThud();
      car.speed *= 0.82;
    } else if (d < 4.2 && Math.abs(car.speed) > 7 && !ped.isCop) {
      ped.state = 'flee'; ped.fleeUntil = G.elapsed + 2.4;
      ped.fleeFrom = { x: car.mesh.position.x, z: car.mesh.position.z };
    }
  }
  // Shunting other cars.
  for (const other of cars) {
    if (other === car || other.state === 'gone') continue;
    const d = dist2D(other.mesh.position.x, other.mesh.position.z, car.mesh.position.x, car.mesh.position.z);
    if (d < 3.4) {
      const push = (3.4 - d) * 0.5;
      const nx = (other.mesh.position.x - car.mesh.position.x) / (d || 1);
      const nz = (other.mesh.position.z - car.mesh.position.z) / (d || 1);
      other.mesh.position.x += nx * push;
      other.mesh.position.z += nz * push;
      if (Math.abs(car.speed) > 6) { sfx.hitThud(); commitCrime(0.25, car.mesh.position.x, car.mesh.position.z); }
      car.speed *= 0.86;
    }
  }
}
function spinWheels(car, dt) {
  const w = car.mesh.userData.wheels || [];
  for (let i = 0; i < w.length; i++) {
    w[i].rotation.x += (car.speed * dt) / 0.34;
    if (i < 2) w[i].rotation.y = (car.steerVis || 0);
  }
}

// ---------------------------------------------------------------- updates: traffic
function updateTrafficCar(car, dt) {
  const pos = car.mesh.position;
  // Obstacle scan straight ahead.
  let blocked = false;
  const aheadX = pos.x + car.dirX * 7, aheadZ = pos.z + car.dirZ * 7;
  for (const other of cars) {
    if (other === car || other.state === 'gone') continue;
    if (dist2D(other.mesh.position.x, other.mesh.position.z, aheadX, aheadZ) < 3.4) { blocked = true; break; }
  }
  if (!blocked && !player.car && dist2D(playerMesh.position.x, playerMesh.position.z, aheadX, aheadZ) < 2.6) blocked = true;
  if (!blocked && player.car && dist2D(player.car.mesh.position.x, player.car.mesh.position.z, aheadX, aheadZ) < 3.6) blocked = true;
  const target = blocked ? 0 : car.targetSpeed;
  car.speed += Math.max(-22 * dt, Math.min(9 * dt, target - car.speed));
  pos.x += car.dirX * car.speed * dt;
  pos.z += car.dirZ * car.speed * dt;
  car.turnCooldown -= dt;
  // Turn at intersections, or U-turn at the city edge.
  const nearAve = AVENUES.some((a) => Math.abs(a - pos.x) < 2.4);
  const nearStr = STREETS.some((s) => Math.abs(s - pos.z) < 2.4);
  const atEdge = Math.abs(pos.x) > CITY_EDGE - 6 || Math.abs(pos.z) > CITY_EDGE - 6;
  if (((nearAve && nearStr) || atEdge) && car.turnCooldown <= 0 && Math.abs(car.speed) > 2) {
    const doTurn = atEdge ? true : rng() < 0.3;
    if (doTurn) {
      const options = [];
      if (car.dirX === 0) { options.push([1, 0], [-1, 0]); if (atEdge) options.push([0, -car.dirZ]); }
      else { options.push([0, 1], [0, -1]); if (atEdge) options.push([-car.dirX, 0]); }
      const [ndx, ndz] = options[Math.floor(rng() * options.length)];
      // Snap onto the cross road's lane before turning.
      if (ndx !== 0) { const s = STREETS.reduce((a, b) => Math.abs(b - pos.z) < Math.abs(a - pos.z) ? b : a, STREETS[0]); pos.z = s; }
      if (ndz !== 0) { const a = AVENUES.reduce((p, q) => Math.abs(q - pos.x) < Math.abs(p - pos.x) ? q : p, AVENUES[0]); pos.x = a; }
      car.dirX = ndx; car.dirZ = ndz;
      const off = laneOffsetFor(ndx, ndz);
      pos.x += off.x; pos.z += off.z;
      car.turnCooldown = 2.5;
    }
  }
  car.heading = angleLerp(car.heading, Math.atan2(car.dirX, car.dirZ), 1 - Math.pow(0.001, dt));
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
}

// ---------------------------------------------------------------- updates: police
function updatePolice(dt) {
  const want = desiredPolice();
  while (policeCars.length < want) spawnPolice();
  if (want === 0 && policeCars.length) {
    // Heat is gone: cruisers give up and leave.
    for (const car of policeCars) car.state = 'leaving';
  }
  const p = playerPos();
  let anySees = false;
  for (let i = policeCars.length - 1; i >= 0; i--) {
    const car = policeCars[i];
    const pos = car.mesh.position;
    const d = dist2D(pos.x, pos.z, p.x, p.z);
    if (d < 60) { anySees = true; G.heatSeenAt = G.elapsed; }
    if (car.state === 'leaving') {
      car.speed = Math.min(16, car.speed + 8 * dt);
      pos.x += car.dirX * car.speed * dt;
      pos.z += car.dirZ * car.speed * dt;
      car.mesh.rotation.y = car.heading;
      spinWheels(car, dt);
      if (d > 130) { car.mesh.visible = false; car.state = 'gone'; policeCars.splice(i, 1); }
      continue;
    }
    // Pursuit steering: aim at the player, capped turn rate.
    const desired = Math.atan2(p.x - pos.x, p.z - pos.z);
    const aggression = 0.65 + stars() * 0.16;
    car.heading = angleLerp(car.heading, desired, Math.min(1, dt * (1.4 + stars() * 0.3)));
    car.dirX = Math.sin(car.heading);
    car.dirZ = Math.cos(car.heading);
    const topSpeed = player.car ? 27 + stars() * 1.6 : 15;
    const wantSpeed = d > 9 ? topSpeed : Math.max(8.5, d * 1.15);
    car.speed += Math.max(-26 * dt, Math.min(13 * dt, wantSpeed - car.speed));
    pos.x += car.dirX * car.speed * dt;
    pos.z += car.dirZ * car.speed * dt;
    collide(pos, 1.7, colliders);
    car.mesh.rotation.y = car.heading;
    spinWheels(car, dt);
    // Flashing beacons.
    car.flashPhase += dt * 9;
    const on = Math.sin(car.flashPhase) > 0;
    if (car.mesh.userData.beaconRed) car.mesh.userData.beaconRed.material = beaconMat(on, true);
    if (car.mesh.userData.beaconBlue) car.mesh.userData.beaconBlue.material = beaconMat(!on, false);
    // On foot nearby? The officer gets out and gives chase.
    if (!player.car && d < 15 && Math.abs(car.speed) < 4) deployCop(car);
    if (car.copPed && (player.car || d > 30)) {
      car.copPed.dead = true; car.copPed.mesh.visible = false;
      car.copPed = null; car.copDeployed = false;
    }
    void aggression;
  }
  sfx.setSiren(stars() >= 2 && policeCars.length > 0 && G.mode === 'playing');
  return anySees;
}
const beaconMats = {};
function beaconMat(on, red) {
  const key = (red ? 'r' : 'b') + (on ? '1' : '0');
  if (!beaconMats[key]) {
    beaconMats[key] = new THREE.MeshStandardMaterial({
      color: red ? 0xff2244 : 0x2266ff,
      emissive: red ? 0xff0033 : 0x1155ff,
      emissiveIntensity: on ? 3.2 : 0.25, roughness: 0.4,
    });
  }
  return beaconMats[key];
}

// ---------------------------------------------------------------- updates: pedestrians & cops
function updatePeds(dt) {
  const p = playerPos();
  for (const ped of peds) {
    if (ped.dead) continue;
    const pos = ped.mesh.position;
    let speed = 0;
    if (ped.isCop) {
      // Officer AI: chase the player; shoot at 3+ stars; bust on contact.
      const d = dist2D(pos.x, pos.z, playerMesh.position.x, playerMesh.position.z);
      if (!player.car && G.wanted > 0) {
        if (d > 2.4) {
          ped.heading = angleLerp(ped.heading, Math.atan2(playerMesh.position.x - pos.x, playerMesh.position.z - pos.z), 1 - Math.pow(0.001, dt));
          speed = 6.4;
        }
        ped.shootCooldown -= dt;
        if (stars() >= 3 && d < 27 && d > 2.4 && ped.shootCooldown <= 0) {
          ped.shootCooldown = 0.85 + rng() * 0.5;
          sfx.gunshot();
          if (rng() < 0.42) damagePlayer(6 + rng() * 5, pos.x, pos.z);
        }
      } else if (ped.car) {
        ped.heading = angleLerp(ped.heading, Math.atan2(ped.car.mesh.position.x - pos.x, ped.car.mesh.position.z - pos.z), 0.2);
        if (d > 3) speed = 3;
      }
    } else if (ped.state === 'flee' && ped.fleeFrom && G.elapsed < ped.fleeUntil) {
      ped.heading = Math.atan2(pos.x - ped.fleeFrom.x, pos.z - ped.fleeFrom.z);
      speed = 7.2;
    } else {
      ped.state = 'walk';
      const d = dist2D(pos.x, pos.z, ped.tx, ped.tz);
      if (d < 1.6) { const t = sidewalkTargetNear(pos.x, pos.z); ped.tx = t.x; ped.tz = t.z; }
      ped.heading = angleLerp(ped.heading, Math.atan2(ped.tx - pos.x, ped.tz - pos.z), 1 - Math.pow(0.01, dt));
      speed = 1.7;
    }
    if (speed > 0) {
      pos.x += Math.sin(ped.heading) * speed * dt;
      pos.z += Math.cos(ped.heading) * speed * dt;
      collide(pos, 0.5, colliders);
      ped.walkPhase += dt * (speed > 3 ? 12 : 7);
    } else {
      ped.walkPhase += dt * 1.4;
    }
    ped.mesh.rotation.y = ped.heading;
    const parts = ped.mesh.userData.parts;
    const swing = Math.sin(ped.walkPhase) * (speed > 3 ? 0.7 : 0.45);
    parts.legL.rotation.x = speed > 0 ? swing : 0;
    parts.legR.rotation.x = speed > 0 ? -swing : 0;
    parts.armL.rotation.x = speed > 0 ? -swing * 0.8 : 0;
    parts.armR.rotation.x = speed > 0 ? swing * 0.8 : 0;
    void p;
  }
}

// ---------------------------------------------------------------- damage / bust / end
function damagePlayer(amount, fromX, fromZ) {
  if (G.mode !== 'playing' || player.dead) return;
  player.health -= amount;
  G.lastDamageAt = G.elapsed;
  sfx.hurt();
  vignette.style.opacity = '1';
  setTimeout(() => { vignette.style.opacity = '0'; }, 180);
  if (player.health <= 0) { player.health = 0; endGame('wasted'); }
}
function endGame(kind) {
  if (G.mode !== 'playing') return;
  G.mode = 'ended';
  G.endKind = kind;
  player.dead = kind === 'wasted';
  const penalty = Math.min(G.money, kind === 'busted' ? 120 + stars() * 60 : 160);
  G.money -= penalty;
  if (kind === 'busted') { G.stats.busted += 1; sfx.bustedBuzz(); }
  else G.stats.wasted += 1;
  G.wanted = 0;
  $('end-title').textContent = kind === 'busted' ? 'Busted' : 'Wasted';
  $('end-title').className = 'panel-title bad';
  $('end-stats').innerHTML =
    'The VHPD processed you at the pier station.<br>' +
    'Fine paid: <b>-$' + penalty + '</b> · Cash left: <b>$' + G.money + '</b><br>' +
    'Missions done: ' + G.stats.missions + ' · Cars stolen: ' + G.stats.stolen + ' · Earned all-time: $' + G.stats.earned;
  endScreen.classList.remove('hidden');
  hud.classList.add('hidden');
  sfx.setSiren(false);
  sfx.setEngine(false, 0);
  persist();
}
function respawn() {
  endScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  clearPolice();
  if (player.car) { player.car.state = 'parked'; player.car.speed = 0; player.car = null; }
  playerMesh.visible = true;
  playerMesh.position.set(BOARDWALK_X - 4, 0, 10);
  player.health = 100;
  player.dead = false;
  G.bustTimer = 0;
  G.mode = 'playing';
  toast('Discharged at Pier Clinic. Try to stay legal-ish.');
}

// ---------------------------------------------------------------- mission & wanted tick
let missionStartGrace = 0;
function updateMissions(dt) {
  const target = missionTarget();
  const p = playerPos();
  if (target) {
    markerGroup.visible = true;
    markerGroup.position.set(target.x, 0, target.z);
    ring.scale.setScalar(1 + Math.sin(G.elapsed * 3.2) * 0.1);
    beamMat.opacity = 0.32 + Math.sin(G.elapsed * 2.4) * 0.12;
  } else {
    markerGroup.visible = false;
  }
  // The delivery package sits glowing at the pickup point until collected.
  const showPackage = (G.missionOffer && G.missionIndex === 0) ||
    (G.mission && G.mission.def.id === 'delivery' && G.mission.stage === 0);
  packageMesh.visible = !!showPackage;
  if (showPackage) {
    const t = MISSIONS[0].stages[0].target;
    packageMesh.position.set(t.x, 0.9 + Math.sin(G.elapsed * 2.6) * 0.22, t.z);
    packageMesh.rotation.y += dt * 1.4;
  }
  missionStartGrace -= dt;
  if (!G.mission && G.missionOffer && G.missionIndex < MISSIONS.length) {
    const def = MISSIONS[G.missionIndex];
    const t0 = offerTarget();
    objTitleEl.textContent = 'New Job — ' + def.giver;
    objEl.textContent = def.title + ': head to the gold marker';
    timerEl.classList.add('hidden');
    if (dist2D(p.x, p.z, t0.x, t0.z) < 6) {
      startCurrentMission();
      missionStartGrace = 1.4;
    }
    return;
  }
  if (!G.mission) {
    objTitleEl.textContent = 'Free Roam';
    objEl.textContent = STORY_DONE;
    timerEl.classList.add('hidden');
    return;
  }
  const stage = currentStage(G.mission);
  if (!stage) return;
  objTitleEl.textContent = G.mission.def.title + ' — ' + G.mission.def.giver;
  objEl.textContent = stage.label + (stage.needsCar && !player.car ? '  (you need a car!)' : '');
  if (stage.timer) {
    G.mission.timeLeft -= dt;
    timerEl.classList.remove('hidden');
    const left = Math.max(0, G.mission.timeLeft);
    timerEl.textContent = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
    timerEl.classList.toggle('low', left < 20);
    if (left <= 0) { failMission('Out of time. Marina is not impressed.'); return; }
  } else {
    timerEl.classList.add('hidden');
  }
  if (missionStartGrace > 0) return;
  const d = dist2D(p.x, p.z, stage.target.x, stage.target.z);
  if (d < stage.radius && (!stage.needsCar || player.car)) completeStage();
}

function updateWanted(dt) {
  // Heat decays only while nobody in uniform is watching.
  const unseenFor = G.elapsed - Math.max(G.heatSeenAt, G.lastCrimeAt);
  if (G.wanted > 0 && unseenFor > 6) {
    G.wanted = Math.max(0, G.wanted - dt * 0.05);
    if (G.wanted === 0) toast('You lost the VHPD. Heat cleared.');
  }
  // Bust pressure.
  let pinned = false;
  if (stars() >= 1 && G.mode === 'playing') {
    if (player.car) {
      if (Math.abs(player.car.speed) < 2.6) {
        for (const car of policeCars) {
          if (dist2D(car.mesh.position.x, car.mesh.position.z, player.car.mesh.position.x, player.car.mesh.position.z) < 8) { pinned = true; break; }
        }
      }
    } else {
      for (const ped of peds) {
        if (ped.isCop && !ped.dead && dist2D(ped.mesh.position.x, ped.mesh.position.z, playerMesh.position.x, playerMesh.position.z) < 3.1) { pinned = true; break; }
      }
      if (!pinned) {
        for (const car of policeCars) {
          if (dist2D(car.mesh.position.x, car.mesh.position.z, playerMesh.position.x, playerMesh.position.z) < 4.2 && Math.abs(car.speed) < 3) { pinned = true; break; }
        }
      }
    }
  }
  if (pinned) {
    G.bustTimer += dt;
    if (G.bustTimer > 2.2) { endGame('busted'); return; }
  } else {
    G.bustTimer = Math.max(0, G.bustTimer - dt * 1.6);
  }
  // Slow health recovery once the shooting stops.
  if (!player.dead && player.health > 0 && player.health < 100 && G.elapsed - G.lastDamageAt > 8) {
    player.health = Math.min(100, player.health + dt * 3);
  }
}

// ---------------------------------------------------------------- camera
let chaseYaw = Math.PI;
function updateCamera(dt) {
  const t = clockState.t;
  if (G.mode === 'title') {
    // Cover vista: low over the central east-west street, looking down the
    // canyon of towers toward the ocean and the low sun beyond the pier.
    camera.position.set(-158 - Math.sin(t * 0.05) * 6, 20 + Math.sin(t * 0.09) * 2.5, -11 + Math.cos(t * 0.04) * 5);
    camera.lookAt(150, 5, 2);
    return;
  }
  if (player.car) {
    const car = player.car;
    chaseYaw = angleLerp(chaseYaw, car.heading + Math.PI, 1 - Math.pow(0.002, dt));
    const back = 10.5, up = 4.4;
    const dx = car.mesh.position.x + Math.sin(chaseYaw) * back;
    const dz = car.mesh.position.z + Math.cos(chaseYaw) * back;
    camera.position.x += (dx - camera.position.x) * (1 - Math.pow(0.0001, dt));
    camera.position.z += (dz - camera.position.z) * (1 - Math.pow(0.0001, dt));
    camera.position.y += ((car.mesh.position.y + up) - camera.position.y) * (1 - Math.pow(0.0001, dt));
    camera.lookAt(car.mesh.position.x, 1.4, car.mesh.position.z);
  } else {
    const p = playerMesh.position;
    const dist = 7.6;
    const dx = p.x + Math.sin(camYaw) * Math.cos(camPitch) * dist;
    const dz = p.z + Math.cos(camYaw) * Math.cos(camPitch) * dist;
    const dy = p.y + 1.4 + Math.sin(camPitch) * dist;
    const k = 1 - Math.pow(0.000001, dt);
    camera.position.x += (dx - camera.position.x) * k;
    camera.position.z += (dz - camera.position.z) * k;
    camera.position.y += (dy - camera.position.y) * k;
    camera.lookAt(p.x, p.y + 1.55, p.z);
  }
}

// ---------------------------------------------------------------- HUD & minimap
function updateHUD() {
  moneyEl.textContent = '$' + G.money;
  const s = stars();
  let starHtml = '';
  for (let i = 0; i < 5; i++) starHtml += '<span class="' + (i < s ? 'lit' : '') + '">★</span>';
  starsEl.innerHTML = starHtml;
  clockEl.textContent = s >= 2 ? 'VHPD PURSUIT IN PROGRESS' : 'GOLDEN HOUR · VICE HARBOR PD';
  healthFill.style.width = Math.max(0, player.health) + '%';
  if (G.bustTimer > 0.25 && G.mode === 'playing') {
    armorLine.textContent = '⚠ THE VHPD IS PINNING YOU — MOVE! (' + Math.max(0, 2.2 - G.bustTimer).toFixed(1) + 's)';
    armorLine.style.color = '#ff6b81';
  } else if (player.car) {
    armorLine.textContent = 'Driving: ' + player.car.kind.toUpperCase() + (player.car.prevState === 'traffic' || player.car.prevState === 'parked' ? ' (stolen)' : '');
    armorLine.style.color = '#aee9ff';
  } else {
    armorLine.textContent = nearestCar(3.8) ? '' : (stars() > 0 ? 'Wanted — break line of sight to cool off' : 'Pistol ready · Marina pays cash for jobs');
    armorLine.style.color = '#aee9ff';
  }
  const near = !player.car ? nearestCar(3.8) : null;
  interactEl.classList.toggle('hidden', !near);
  if (near) interactEl.querySelector('span').textContent = near.state === 'traffic' ? 'Steal vehicle' : 'Enter vehicle';
  crosshairEl.classList.toggle('hidden', !!player.car);
  if (player.car) {
    speedEl.innerHTML = Math.round(Math.abs(player.car.speed) * 3.6) + ' <small>km/h</small>';
  } else speedEl.textContent = '';
}

function drawMinimap() {
  const ctx = minimapCtx;
  const W = 184, C = W / 2, scale = W / 430;
  const p = playerPos();
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = '#274b34';
  ctx.fillRect(0, 0, W, W);
  const toMap = (wx, wz) => [C + (wx - p.x) * scale, C + (wz - p.z) * scale];
  // Ocean on the east.
  const [ox] = toMap(172, 0);
  ctx.fillStyle = '#14607a';
  ctx.fillRect(Math.max(0, ox), 0, W, W);
  // Roads.
  ctx.fillStyle = '#3c3a44';
  for (const a of AVENUES) { const [x] = toMap(a, 0); ctx.fillRect(x - ROAD_HALF * scale, 0, ROAD_HALF * 2 * scale, W); }
  for (const s of STREETS) { const [, y] = toMap(0, s); ctx.fillRect(0, y - ROAD_HALF * scale, W, ROAD_HALF * 2 * scale); }
  ctx.strokeStyle = 'rgba(255,210,62,.35)';
  ctx.setLineDash([4, 5]);
  for (const a of AVENUES) { const [x] = toMap(a, 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, W); ctx.stroke(); }
  ctx.setLineDash([]);
  // Cars and people.
  for (const car of cars) {
    if (car.state === 'gone') continue;
    const [x, y] = toMap(car.mesh.position.x, car.mesh.position.z);
    if (x < -4 || x > W + 4 || y < -4 || y > W + 4) continue;
    ctx.fillStyle = car === player.car ? '#ffffff' : car.state === 'parked' ? '#9aa0a8' : '#e8e8e8';
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  for (const ped of peds) {
    if (ped.dead || ped.isCop) continue;
    const [x, y] = toMap(ped.mesh.position.x, ped.mesh.position.z);
    if (x < 0 || x > W || y < 0 || y > W) continue;
    ctx.fillStyle = '#ff8fc0';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  for (const car of policeCars) {
    const [x, y] = toMap(car.mesh.position.x, car.mesh.position.z);
    const cx = Math.max(5, Math.min(W - 5, x)), cy = Math.max(5, Math.min(W - 5, y));
    ctx.fillStyle = Math.sin(G.elapsed * 9) > 0 ? '#ff3355' : '#3388ff';
    ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, Math.PI * 2); ctx.fill();
  }
  // Mission marker.
  const target = missionTarget();
  if (target) {
    const [x, y] = toMap(target.x, target.z);
    const cx = Math.max(7, Math.min(W - 7, x)), cy = Math.max(7, Math.min(W - 7, y));
    ctx.fillStyle = '#ffd23e';
    ctx.strokeStyle = '#7a5200';
    ctx.beginPath(); ctx.arc(cx, cy, 4.6 + Math.sin(G.elapsed * 5) * 1.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // Player arrow.
  const facing = player.car ? player.car.heading : player.heading;
  ctx.save();
  ctx.translate(C, C);
  ctx.rotate(Math.atan2(Math.sin(facing), -Math.cos(facing)) + Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('N', C - 4, 14);
}

// ---------------------------------------------------------------- screens & flow
function startPlaying(fresh) {
  if (fresh) {
    G.money = 250; G.missionIndex = 0; G.stats = { earned: 0, stolen: 0, shots: 0, hits: 0, missions: 0, busted: 0, wasted: 0 };
    G.mission = null; G.missionOffer = true; G.wanted = 0;
    playerMesh.position.set(BOARDWALK_X - 4, 0, 26);
    player.health = 100;
  }
  titleScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  G.mode = 'playing';
  toast(STORY_INTRO, 4200);
  persist();
}
function pauseGame() {
  if (G.mode !== 'playing') return;
  G.mode = 'paused';
  pauseScreen.classList.remove('hidden');
  sfx.setSiren(false);
  sfx.setEngine(false, 0);
}
function resumeGame() {
  if (G.mode !== 'paused') return;
  pauseScreen.classList.add('hidden');
  G.mode = 'playing';
}
$('btn-play').addEventListener('click', () => startPlaying(true));
$('btn-continue').addEventListener('click', () => startPlaying(false));
$('btn-how').addEventListener('click', () => $('how-panel').classList.toggle('hidden'));
$('btn-resume').addEventListener('click', resumeGame);
$('btn-quit-title').addEventListener('click', () => {
  pauseScreen.classList.add('hidden');
  hud.classList.add('hidden');
  titleScreen.classList.remove('hidden');
  G.mode = 'title';
  persist();
});
$('btn-respawn').addEventListener('click', respawn);
if (!save) $('btn-continue').disabled = true;

// ---------------------------------------------------------------- screenshot scenes
function givePlayerCar(kind, color, x, z, heading, speed) {
  const car = addCar(kind, color, x, z, heading, 'player');
  car.prevState = 'parked';
  car.speed = speed;
  car.dirX = Math.sin(heading);
  car.dirZ = Math.cos(heading);
  player.car = car;
  playerMesh.visible = false;
  chaseYaw = heading + Math.PI;
  camYaw = heading + Math.PI;
  camera.position.set(x - Math.sin(heading) * 11, 4.6, z - Math.cos(heading) * 11);
  return car;
}
function setupShot() {
  if (!SHOT) return;
  hud.classList.remove('hidden');
  if (SHOT === 'start') {
    G.mode = 'title';
    hud.classList.add('hidden');
    return;
  }
  titleScreen.classList.add('hidden');
  G.mode = 'playing';
  if (SHOT === 'play') {
    givePlayerCar('sport', 0xff5d8f, 128.9, 46, Math.PI, 15);
    addCar('sedan', 0x2ec4b6, 128.9, 18, Math.PI, 'traffic').speed = 9;
    addCar('taxi', 0xffd166, 135.1, 74, 0, 'traffic').speed = 8;
    G.wanted = 0;
  } else if (SHOT === 'chase') {
    givePlayerCar('sedan', 0x2ec4b6, 47.1, -6, 0, 18);
    G.wanted = 3;
    G.lastCrimeAt = 9999;
    // Stage the pursuit in the chase camera's frame: one cruiser alongside
    // (ramming pose), two more closing from behind.
    const spots = [[42.9, -7.5, 0.05, 19], [51.4, -17, -0.1, 22], [47.1, -25, 0, 23]];
    for (const [x, z, tilt, spd] of spots) {
      const cop = addCar('police', 0xffffff, x, z, tilt, 'police');
      cop.speed = spd;
      cop.dirX = Math.sin(tilt); cop.dirZ = Math.cos(tilt);
      policeCars.push(cop);
    }
  } else if (SHOT === 'mission') {
    G.money = 700;
    G.missionIndex = 0;
    G.mission = startMission(0);
    advanceMission(G.mission); // package collected: now mid-delivery
    G.mission.timeLeft = 82;
    G.missionOffer = false;
    givePlayerCar('taxi', 0xffd166, -26, 40.9, Math.PI / 2, 17);
    showBanner('Sunset Delivery', 'Deliver it to the pier kiosk · $450 on the line', 60000);
  }
}
setupShot();

// ---------------------------------------------------------------- main loop
let lastNow = performance.now();
let saveTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  clockState.t += dt;
  if (G.mode === 'playing') {
    G.elapsed += dt;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    if (player.car) updatePlayerCar(dt); else updatePlayerOnFoot(dt);
    for (const car of cars) {
      if (car.state === 'traffic') updateTrafficCar(car, dt);
    }
    updatePolice(dt);
    updatePeds(dt);
    updateMissions(dt);
    updateWanted(dt);
    saveTick += dt;
    if (saveTick > 5) { saveTick = 0; persist(); }
  }
  // Tracers fade fast; muzzle light decays.
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    tracers[i].line.material.opacity = Math.max(0, tracers[i].life / 0.07);
    if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers.splice(i, 1); }
  }
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 22);
  // Ambient life: water shimmer and a breathing sun glow.
  city.animated.water.emissiveIntensity = 0.6 + Math.sin(clockState.t * 0.8) * 0.15;
  if (G.mode === 'playing' || G.mode === 'title') updateHUD();
  if (G.mode === 'playing') drawMinimap();
  updateCamera(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
