// game.js — Vice Harbor: the game itself. Player on foot and in cars,
// driving, traffic, pedestrians, wanted stars and Harbor Patrol pursuit,
// hitscan pistol combat, a chained 3-mission story, HUD + canvas minimap,
// title / pause / end screens, a localStorage save, and the deterministic
// screenshot scenes (?shot=start|play|chase|mission&seed=1).

import { makeRng, clamp, lerp, angleDelta, dist2d, formatCash, formatTime } from './util.js';
import { SoundBank } from './audio.js';
import { buildCity, collideCircle, ROADS, HIDEOUT, PIER, DINER, CHECKPOINTS, WORLD_BOUND } from './city.js';
import { TrafficCar, Pedestrian, PoliceUnit, makeCarMesh, makePersonMesh, CAR_COLORS } from './actors.js';

const THREE = window.THREE;
const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '7', 10) || 7;
const SHOT = params.get('shot');
const rng = makeRng(SEED * 1000 + 17);

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('view').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const world = buildCity(THREE, scene, rng);
const colliders = world.colliders;
const sound = new SoundBank();

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
function makeMarker(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 13;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  g.add(ring);
  g.visible = false;
  scene.add(g);
  return g;
}
const marker = makeMarker(0xff5da2);
const gateMarker = makeMarker(0x4dd8ff);

// ---------------------------------------------------------------- actors
const traffic = [];
for (let i = 0; i < 15; i++) traffic.push(new TrafficCar(THREE, rng, scene));
const parked = [];
const PARK_SPOTS = [
  [-22, -100, 0.4], [66, -30, -0.5], [-110, 44, 0.9], [22, 96, 2.6], [110, -100, 1.8],
  [-66, 140, -1.2], [154, 60, 0.2], [-154, -60, 2.9], [44, -154, 1.4], [-22, 22, -2.2],
  [96, 110, 0.7], [-140, -110, 2.2], [130, 22, -0.8], [-88, -22, 1.1], [10, -66, 2.4], [150, -130, 0.5],
];
for (let i = 0; i < PARK_SPOTS.length; i++) {
  const [x, z, h] = PARK_SPOTS[i];
  const mesh = makeCarMesh(THREE, CAR_COLORS[i % CAR_COLORS.length], i % 5, false);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = h;
  scene.add(mesh);
  parked.push({ mesh, x, z, heading: h, speed: 0, kind: 'parked', taken: false });
}
const peds = [];
for (let i = 0; i < 26; i++) peds.push(new Pedestrian(THREE, rng, scene));
const police = [];

// Player figure (Nico Vale: teal shirt, dark jeans).
const playerMesh = makePersonMesh(THREE, makeRng(99), false);
playerMesh.children[1].material = new THREE.MeshLambertMaterial({ color: 0x14b8a6 });
scene.add(playerMesh);

// Muzzle flash + tracer line for the pistol.
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
flash.visible = false;
scene.add(flash);
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 });
const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), tracerMat);
tracer.visible = false;
scene.add(tracer);

// ---------------------------------------------------------------- state
const SAVE_KEY = 'viceharbor-save-v1';
const state = {
  mode: SHOT ? 'play' : 'title',   // title | play | pause | end
  cash: 150,
  health: 100,
  wanted: 0,                        // 0..5 float; stars shown are ceil
  heatCooldown: 0,
  missionIndex: 0,                  // 0..2 active, 3 = story complete
  missionStage: 'offer',            // offer | active | done
  missionTime: 0,
  gateIndex: 0,
  bustMeter: 0,
  dead: false,
  endKind: '',
  time: 0,
};
const player = {
  x: HIDEOUT.x + 4, z: HIDEOUT.z - 16, heading: Math.PI, speed: 0,
  car: null,                        // driven car object or null
  camYaw: Math.PI, camPitch: 0.32,
};
let saveData = null;
try { saveData = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { saveData = null; }
if (saveData && typeof saveData.cash === 'number') $('btn-continue').classList.remove('hidden');

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash, missionIndex: state.missionIndex, x: player.x, z: player.z,
    }));
  } catch (e) { /* storage unavailable: play on without saving */ }
}
function loadSave() {
  if (!saveData) return;
  state.cash = saveData.cash;
  state.missionIndex = Math.min(3, saveData.missionIndex || 0);
  if (typeof saveData.x === 'number') { player.x = saveData.x; player.z = saveData.z; }
  state.missionStage = state.missionIndex >= 3 ? 'done' : 'offer';
}

// ---------------------------------------------------------------- missions
const MISSIONS = [
  {
    title: 'Job 1 — Hot Package',
    offer: 'Reyes left a package at Diner Sol. Pick it up.',
    active: 'Take the package to the end of the pier.',
    pickup: DINER, dropoff: PIER, time: 100, pay: 600,
  },
  {
    title: 'Job 2 — Shake the Heat',
    offer: 'The drop went bad. Get 2 stars, then lose the Patrol.',
    active: 'Lose the Harbor Patrol!',
    time: 0, pay: 800,
  },
  {
    title: 'Job 3 — Harbor Run',
    offer: 'Hit all 5 checkpoints across the harbor before time runs out.',
    active: 'Reach the next checkpoint!',
    time: 150, pay: 1100,
  },
];

function currentMission() {
  return state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
}
function missionTarget() {
  const m = currentMission();
  if (!m || state.missionStage === 'done') return null;
  if (state.missionIndex === 0) return state.missionStage === 'offer' ? m.pickup : m.dropoff;
  if (state.missionIndex === 2 && state.missionStage === 'active') return CHECKPOINTS[state.gateIndex];
  return null;
}
function startMission() {
  const m = currentMission();
  if (!m) return;
  state.missionStage = 'active';
  state.missionTime = m.time;
  state.gateIndex = 0;
  if (state.missionIndex === 1) addWanted(2, true);
  toast(m.title, m.active);
  sound.pickup();
  refreshObjective();
}
function completeMission() {
  const m = currentMission();
  state.cash += m.pay;
  sound.cashSting();
  state.missionIndex += 1;
  state.missionStage = state.missionIndex >= 3 ? 'done' : 'offer';
  toast('JOB DONE  +' + formatCash(m.pay), state.missionIndex >= 3 ? 'The debt is paid. You are free, Nico.' : 'Reyes has another job. Check the pink marker.');
  if (state.missionIndex >= 3) showEnd('free');
  saveGame();
  refreshObjective();
}
function failMission(reason) {
  sound.failSting();
  state.missionStage = 'offer';
  toast('JOB FAILED', reason + ' — try again at the marker.');
  refreshObjective();
}
function refreshObjective() {
  const m = currentMission();
  if (!m) {
    $('missiontitle').textContent = 'Story complete';
    $('objective').textContent = 'Free roam — the harbor is yours.';
    $('timer').textContent = '';
    marker.visible = false;
    gateMarker.visible = false;
    return;
  }
  $('missiontitle').textContent = m.title;
  if (state.missionStage === 'offer') {
    $('objective').textContent = m.offer;
    $('timer').textContent = 'Reward ' + formatCash(m.pay);
  } else if (state.missionIndex === 1) {
    $('objective').textContent = m.active;
    $('timer').textContent = '';
  } else {
    $('objective').textContent = m.active + (state.missionIndex === 2 ? '  (' + (state.gateIndex + 1) + '/5)' : '');
    $('timer').textContent = formatTime(state.missionTime);
  }
  const t = missionTarget();
  const useGate = state.missionIndex === 2 && state.missionStage === 'active';
  marker.visible = !!t && !useGate;
  gateMarker.visible = !!t && useGate;
  if (t) {
    (useGate ? gateMarker : marker).position.set(t.x, 0, t.z);
  }
}

// ---------------------------------------------------------------- wanted
function stars() { return Math.ceil(state.wanted - 0.001); }
function addWanted(amount, exact) {
  const before = stars();
  state.wanted = exact ? Math.max(state.wanted, amount) : clamp(state.wanted + amount, 0, 5);
  state.heatCooldown = 6;
  if (stars() > before) sound.starUp();
  syncPolice();
}
function syncPolice() {
  const want = stars();
  const target = want === 0 ? 0 : Math.min(2 + want, 6);
  while (police.length < target) {
    const a = rng() * Math.PI * 2;
    const d = 55 + rng() * 30;
    const sx = clamp(player.x + Math.sin(a) * d, -170, 190);
    const sz = clamp(player.z + Math.cos(a) * d, -170, 170);
    police.push(new PoliceUnit(THREE, rng, scene, sx, sz));
  }
  while (police.length > target) {
    const u = police.pop();
    scene.remove(u.mesh);
  }
}

// ---------------------------------------------------------------- combat
let shotCooldown = 0;
function playerShoot() {
  if (state.mode !== 'play' || player.car || shotCooldown > 0) return;
  shotCooldown = 0.28;
  sound.unlock();
  sound.shoot();
  const from = new THREE.Vector3(player.x, 1.5, player.z);
  const dir = new THREE.Vector3(Math.sin(player.camYaw + Math.PI), 0, Math.cos(player.camYaw + Math.PI));
  // Face the shot direction.
  player.heading = Math.atan2(dir.x, dir.z);
  let best = null, bestDist = 42;
  const consider = (x, z, obj, kind) => {
    const d = dist2d(player.x, player.z, x, z);
    if (d > bestDist) return;
    const dot = ((x - player.x) * dir.x + (z - player.z) * dir.z) / (d || 1);
    if (dot > 0.86) { best = { obj, kind, x, z, d }; bestDist = d; }
  };
  for (const p of peds) if (!p.dead) consider(p.x, p.z, p, 'ped');
  for (const u of police) consider(u.x, u.z, u, 'cop');
  const end = best
    ? new THREE.Vector3(best.x, 1.1, best.z)
    : from.clone().add(dir.clone().multiplyScalar(42));
  tracer.geometry.setFromPoints([new THREE.Vector3(player.x, 1.35, player.z), end]);
  tracer.visible = true;
  flash.position.copy(end);
  flash.visible = true;
  setTimeout(() => { tracer.visible = false; flash.visible = false; }, 60);
  if (!best) return;
  sound.hit();
  if (best.kind === 'ped') {
    best.obj.dead = true;
    best.obj.mesh.rotation.x = Math.PI / 2;
    best.obj.mesh.position.y = 0.25;
    for (const p of peds) p.scare(best.x, best.z, state.time);
    addWanted(1.2);
  } else {
    best.obj.hits = (best.obj.hits || 0) + 1;
    if (best.obj.hits >= 3) {
      scene.remove(best.obj.mesh);
      police.splice(police.indexOf(best.obj), 1);
      addWanted(0.8);
      setTimeout(() => syncPolice(), 1500);
    } else {
      addWanted(0.4);
    }
  }
}

// ---------------------------------------------------------------- input
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyF') tryEnterExit();
  if ((e.code === 'Escape' || e.code === 'KeyP') && (state.mode === 'play' || state.mode === 'pause')) togglePause();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('mousemove', (e) => {
  if (state.mode !== 'play' || player.car) return;
  player.camYaw -= e.movementX * 0.004;
  player.camPitch = clamp(player.camPitch + e.movementY * 0.003, 0.08, 1.1);
});
window.addEventListener('mousedown', () => { sound.unlock(); playerShoot(); });

function togglePause() {
  if (state.mode === 'play') {
    state.mode = 'pause';
    $('pausestats').textContent = 'Cash ' + formatCash(state.cash) + ' · ' +
      (state.missionIndex >= 3 ? 'Story complete' : 'Next: ' + MISSIONS[state.missionIndex].title);
    $('pause').classList.remove('hidden');
  } else if (state.mode === 'pause') {
    state.mode = 'play';
    $('pause').classList.add('hidden');
  }
}

function nearestCar() {
  let best = null, bestD = 4.2;
  const consider = (car, x, z) => {
    const d = dist2d(player.x, player.z, x, z);
    if (d < bestD) { best = car; bestD = d; }
  };
  for (const c of parked) if (!c.taken) consider(c, c.x, c.z);
  for (const c of traffic) if (!c.stolen) { const p = c.position(); consider(c, p.x, p.z); }
  return best;
}
function tryEnterExit() {
  if (state.mode !== 'play') return;
  sound.unlock();
  if (player.car) {
    const car = player.car;
    player.x = car.x + Math.cos(car.heading) * 2.2;
    player.z = car.z - Math.sin(car.heading) * 2.2;
    player.heading = car.heading;
    player.car = null;
    playerMesh.visible = true;
    sound.door();
    return;
  }
  const car = nearestCar();
  if (!car) return;
  if (car.kind === 'parked') {
    car.taken = true;
    player.car = { mesh: car.mesh, x: car.x, z: car.z, heading: car.heading, speed: 0, kind: 'parked', ref: car };
  } else {
    car.stolen = true;
    const p = car.position();
    player.car = { mesh: car.mesh, x: p.x, z: p.z, heading: car.heading(), speed: car.speed, kind: 'traffic', ref: car };
  }
  playerMesh.visible = false;
  sound.door();
  // Stealing is a crime when anyone is watching.
  let witnessed = false;
  for (const p of peds) if (dist2d(player.x, player.z, p.x, p.z) < 16) witnessed = true;
  if (witnessed || car.kind === 'traffic') {
    addWanted(car.kind === 'traffic' ? 1 : 0.6);
    toast('VEHICLE STOLEN', witnessed ? 'Someone saw that…' : '');
  }
}

// ---------------------------------------------------------------- UI wiring
let toastTimer = null;
function toast(main, sub) {
  $('toast').textContent = main;
  $('subtoast').textContent = sub || '';
  $('toast').classList.remove('hidden');
  $('subtoast').classList.toggle('hidden', !sub);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('toast').classList.add('hidden');
    $('subtoast').classList.add('hidden');
  }, 3400);
}
function startGame(fresh) {
  sound.unlock();
  if (!fresh) loadSave();
  if (fresh) { state.missionIndex = 0; state.missionStage = 'offer'; }
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state.mode = 'play';
  refreshObjective();
}
$('btn-play').addEventListener('click', () => startGame(true));
$('btn-continue').addEventListener('click', () => startGame(false));
$('btn-how').addEventListener('click', () => $('controls').classList.toggle('hidden'));
$('btn-resume').addEventListener('click', togglePause);
$('btn-restart').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  location.reload();
});
$('btn-again').addEventListener('click', () => {
  $('end').classList.add('hidden');
  respawn();
});
function showEnd(kind) {
  state.mode = 'end';
  state.endKind = kind;
  const titles = { busted: 'BUSTED', wasted: 'WASTED', free: 'DEBT PAID — YOU WIN' };
  const texts = {
    busted: 'The Harbor Patrol got you. Fine paid: ' + formatCash(Math.min(200, state.cash)) + '.',
    wasted: 'You woke up outside the hideout. The clinic took ' + formatCash(Math.min(150, state.cash)) + '.',
    free: 'Three jobs, one paid debt. Nico Vale owns his wheels again. Free roam is open — the harbor is yours.',
  };
  $('endtitle').textContent = titles[kind];
  $('endtext').textContent = texts[kind];
  $('end').classList.remove('hidden');
  if (kind === 'busted') state.cash = Math.max(0, state.cash - 200);
  if (kind === 'wasted') state.cash = Math.max(0, state.cash - 150);
  state.wanted = 0;
  state.bustMeter = 0;
  syncPolice();
  saveGame();
}
function respawn() {
  state.health = 100;
  state.dead = false;
  if (player.car) { player.car = null; }
  playerMesh.visible = true;
  player.x = HIDEOUT.x + 4;
  player.z = HIDEOUT.z - 16;
  player.heading = Math.PI;
  for (const u of police) scene.remove(u.mesh);
  police.length = 0;
  $('hud').classList.remove('hidden');
  state.mode = 'play';
  if (state.missionStage === 'active') failMission('You lost the job');
  refreshObjective();
}

// ---------------------------------------------------------------- HUD
function drawMinimap() {
  const cv = $('minimap');
  const g = cv.getContext('2d');
  const W = cv.width, C = W / 2, scale = W / 2 / 120;
  g.clearRect(0, 0, W, W);
  g.fillStyle = '#2e7fa8';
  g.fillRect(0, 0, W, W);
  const px = (x) => C + (x - player.x) * scale;
  const pz = (z) => C + (z - player.z) * scale;
  g.fillStyle = '#59624f';
  g.fillRect(px(-178), pz(-178), 356 * scale, 356 * scale);
  g.fillStyle = '#e8cf9a';
  g.fillRect(px(178), pz(-178), 20 * scale, 356 * scale);
  g.strokeStyle = '#3c4148';
  g.lineWidth = 7 * scale + 1;
  for (const r of ROADS) {
    g.beginPath(); g.moveTo(px(r), pz(-178)); g.lineTo(px(r), pz(178)); g.stroke();
    g.beginPath(); g.moveTo(px(-178), pz(r)); g.lineTo(px(178), pz(r)); g.stroke();
  }
  const blip = (x, z, color, r) => {
    g.fillStyle = color;
    g.beginPath(); g.arc(px(x), pz(z), r || 3, 0, Math.PI * 2); g.fill();
  };
  for (const c of traffic) { const p = c.position(); blip(p.x, p.z, '#cfd6dd', 2.4); }
  for (const c of parked) if (!c.taken) blip(c.x, c.z, '#8f9aa5', 2.4);
  for (const p of peds) if (!p.dead) blip(p.x, p.z, '#ffe9a8', 1.8);
  for (const u of police) blip(u.x, u.z, (Math.floor(state.time * 3) % 2 ? '#ff4444' : '#4488ff'), 3.6);
  const t = missionTarget();
  if (t) blip(t.x, t.z, '#ff5da2', 4.5);
  // Player arrow, pointing up = facing -z on the map (heading 0 faces +z).
  g.save();
  g.translate(C, C);
  g.rotate(Math.PI - playerHeading());
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
  g.restore();
}
function playerHeading() {
  return player.car ? player.car.heading : player.heading;
}
function refreshHud() {
  const s = stars();
  let html = '';
  for (let i = 0; i < 5; i++) html += i < s ? '★' : '<span class="off">★</span>';
  $('stars').innerHTML = html;
  $('cash').textContent = formatCash(state.cash);
  $('healthbar').style.width = clamp(state.health, 0, 100) + '%';
  const speed = player.car ? Math.abs(player.car.speed) * 3.6 : 0;
  $('speed').innerHTML = Math.round(speed) + ' <small>KM/H</small>';
  const near = !player.car && nearestCar();
  const bustWarning = state.bustMeter > 0.35 && stars() > 0;
  $('prompt').classList.toggle('hidden', !near && !bustWarning);
  if (bustWarning) $('prompt').textContent = '⚠ THE PATROL IS ON YOU — MOVE!';
  else if (near) $('prompt').textContent = 'Press F to steal the car';
  $('crosshair').classList.toggle('hidden', !!player.car);
  if (state.missionStage === 'active' && currentMission() && currentMission().time > 0) {
    $('timer').textContent = formatTime(state.missionTime);
  }
}

// ---------------------------------------------------------------- updates
function updatePlayer(dt) {
  if (player.car) {
    const car = player.car;
    const accel = keys.KeyW || keys.ArrowUp ? 16 : 0;
    const brake = keys.KeyS || keys.ArrowDown ? 14 : 0;
    const hand = keys.Space ? 26 : 0;
    car.speed += (accel - brake * (car.speed > 0.5 ? 1 : 0.45)) * dt;
    car.speed -= car.speed * 0.55 * dt;
    car.speed -= Math.sign(car.speed) * hand * dt;
    car.speed = clamp(car.speed, -11, 31);
    const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
    if (Math.abs(car.speed) > 0.4) {
      car.heading += steer * dt * 1.55 * Math.sign(car.speed) * clamp(Math.abs(car.speed) / 9, 0.35, 1);
    }
    let nx = car.x + Math.sin(car.heading) * car.speed * dt;
    let nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const before = { x: car.x, z: car.z };
    [nx, nz] = collideCircle(colliders, nx, nz, 1.7);
    if (dist2d(nx, nz, before.x, before.z) < Math.abs(car.speed) * dt * 0.35 && Math.abs(car.speed) > 9) {
      // The building stopped the car: bounce back, take damage, draw heat.
      sound.crash();
      car.speed *= -0.25;
      damagePlayer(4);
      addWanted(0.25);
    }
    car.x = clamp(nx, -WORLD_BOUND, 196);
    car.z = clamp(nz, -WORLD_BOUND, WORLD_BOUND);
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.2;
    player.x = car.x; player.z = car.z; player.heading = car.heading;
    // Running over a pedestrian is very much a crime.
    for (const p of peds) {
      if (!p.dead && Math.abs(car.speed) > 6 && dist2d(car.x, car.z, p.x, p.z) < 2.1) {
        p.dead = true;
        p.mesh.rotation.x = Math.PI / 2;
        p.mesh.position.y = 0.25;
        addWanted(1.5);
        sound.crash();
      } else if (!p.dead && Math.abs(car.speed) > 10 && dist2d(car.x, car.z, p.x, p.z) < 7) {
        p.scare(car.x, car.z, state.time);
      }
    }
    sound.setEngine(Math.abs(car.speed) / 31, true);
    return;
  }
  // On foot.
  sound.setEngine(0, false);
  if (keys.KeyQ) player.camYaw += dt * 2.2;
  if (keys.KeyE) player.camYaw -= dt * 2.2;
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const side = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const speed = sprint ? 9.5 : 5.2;
  if (fwd || side) {
    const moveA = player.camYaw + Math.atan2(side, fwd) + Math.PI;
    let nx = player.x + Math.sin(moveA) * speed * dt;
    let nz = player.z + Math.cos(moveA) * speed * dt;
    [nx, nz] = collideCircle(colliders, nx, nz, 0.7);
    player.x = clamp(nx, -WORLD_BOUND, 190);
    player.z = clamp(nz, -WORLD_BOUND, WORLD_BOUND);
    player.heading = moveA;
  }
  playerMesh.position.set(player.x, 0, player.z);
  playerMesh.rotation.y = player.heading;
}

function damagePlayer(amount) {
  state.health -= amount;
  $('damage').style.opacity = 0.9;
  setTimeout(() => { $('damage').style.opacity = 0; }, 130);
  if (state.health <= 0 && !state.dead) {
    state.dead = true;
    showEnd('wasted');
  }
}

function updateWanted(dt) {
  // Decay only while no patrol unit has eyes on the player.
  let seen = false;
  for (const u of police) if (dist2d(u.x, u.z, player.x, player.z) < 46) seen = true;
  if (!seen && state.wanted > 0) {
    state.heatCooldown -= dt;
    if (state.heatCooldown <= 0) {
      state.wanted = Math.max(0, state.wanted - dt * 0.14);
      if (state.wanted === 0 && state.missionIndex === 1 && state.missionStage === 'active') {
        // Mission 2 completes the moment the heat is fully lost after 2 stars.
      }
      syncPolice();
    }
  }
  // Police return fire at 3+ stars.
  if (stars() >= 3 && state.mode === 'play') {
    for (const u of police) {
      const d = dist2d(u.x, u.z, player.x, player.z);
      if (d < 30 && rng() < dt * 0.55) damagePlayer(2.2);
    }
  }
  // Busted: a unit parked on top of a slow / on-foot player fills the meter.
  let close = false;
  for (const u of police) {
    const d = dist2d(u.x, u.z, player.x, player.z);
    if (d < 4.4 && (!player.car || Math.abs(player.car.speed) < 3)) close = true;
  }
  if (close && stars() > 0) {
    state.bustMeter += dt;
    if (state.bustMeter > 1.6) { showEnd('busted'); return; }
  } else {
    state.bustMeter = Math.max(0, state.bustMeter - dt * 1.5);
  }
  // Siren loudness follows the nearest unit.
  let nearest = 999;
  for (const u of police) nearest = Math.min(nearest, dist2d(u.x, u.z, player.x, player.z));
  sound.setSiren(police.length ? clamp(1 - nearest / 70, 0, 1) : 0);
}

function updateMission(dt) {
  const m = currentMission();
  if (!m) { marker.visible = false; gateMarker.visible = false; return; }
  const t = missionTarget();
  if (t) {
    const useGate = state.missionIndex === 2 && state.missionStage === 'active';
    (useGate ? gateMarker : marker).position.set(t.x, 0, t.z);
    (useGate ? gateMarker : marker).visible = true;
    (useGate ? marker : gateMarker).visible = false;
    (useGate ? gateMarker : marker).children[1].rotation.z += dt * 1.5;
  }
  if (state.missionStage === 'offer') {
    // Offer markers sit at the pickup for job 1, at the hideout otherwise.
    const offerAt = state.missionIndex === 0 ? DINER : HIDEOUT;
    marker.position.set(offerAt.x, 0, offerAt.z);
    marker.visible = true;
    if (dist2d(player.x, player.z, offerAt.x, offerAt.z) < 4.5) startMission();
    return;
  }
  if (state.missionStage !== 'active') return;
  if (m.time > 0) {
    state.missionTime -= dt;
    if (state.missionTime <= 0) { failMission('Out of time'); return; }
  }
  if (state.missionIndex === 0) {
    if (dist2d(player.x, player.z, PIER.x, PIER.z) < 6) completeMission();
  } else if (state.missionIndex === 1) {
    if (state.wanted <= 0.01 && stars() === 0) completeMission();
  } else if (state.missionIndex === 2) {
    const gate = CHECKPOINTS[state.gateIndex];
    if (dist2d(player.x, player.z, gate.x, gate.z) < 7) {
      sound.pickup();
      state.gateIndex += 1;
      if (state.gateIndex >= CHECKPOINTS.length) completeMission();
      else {
        toast('CHECKPOINT ' + state.gateIndex + '/5', 'Keep going!');
        refreshObjective();
      }
    }
  }
}

function updateCamera(dt) {
  if (state.mode === 'title') {
    const t = state.time * 0.07;
    camera.position.set(Math.sin(t) * 95 - 20, 26, Math.cos(t) * 95 + 10);
    camera.lookAt(10, 8, -10);
    return;
  }
  if (player.car) {
    const car = player.car;
    const back = 10.5, up = 4.4;
    const tx = car.x - Math.sin(car.heading) * back;
    const tz = car.z - Math.cos(car.heading) * back;
    camera.position.x = lerp(camera.position.x, tx, 1 - Math.pow(0.0015, dt));
    camera.position.z = lerp(camera.position.z, tz, 1 - Math.pow(0.0015, dt));
    camera.position.y = lerp(camera.position.y, up, 1 - Math.pow(0.001, dt));
    camera.lookAt(car.x + Math.sin(car.heading) * 8, 1.6, car.z + Math.cos(car.heading) * 8);
    player.camYaw = car.heading + Math.PI;
  } else {
    const dist = 8.5;
    const tx = player.x + Math.sin(player.camYaw) * dist * Math.cos(player.camPitch);
    const tz = player.z + Math.cos(player.camYaw) * dist * Math.cos(player.camPitch);
    const ty = 1.7 + Math.sin(player.camPitch) * dist;
    camera.position.x = lerp(camera.position.x, tx, 1 - Math.pow(0.0001, dt));
    camera.position.z = lerp(camera.position.z, tz, 1 - Math.pow(0.0001, dt));
    camera.position.y = lerp(camera.position.y, ty, 1 - Math.pow(0.0001, dt));
    camera.lookAt(player.x, 1.5, player.z);
  }
}

// ---------------------------------------------------------------- shots
function stageShot(name) {
  $('title').classList.add('hidden');
  if (name === 'start') {
    $('title').classList.remove('hidden');
    state.mode = 'title';
    // Vista: look down the south boulevard toward the towers.
    camera.position.set(-88, 9, 96);
    camera.lookAt(60, 14, -30);
    // Park a hero car in the street canyon below the title.
    const hero = parked[3];
    hero.mesh.position.set(-40, 0, 66);
    hero.mesh.rotation.y = Math.PI / 2;
    return;
  }
  $('hud').classList.remove('hidden');
  state.mode = 'play';
  if (name === 'play') {
    const car = parked[0];
    car.taken = true;
    player.car = { mesh: car.mesh, x: 25.1, z: -30, heading: 0, speed: 14, kind: 'parked', ref: car };
    car.mesh.position.set(25.1, 0, -30);
    car.mesh.rotation.y = 0;
    playerMesh.visible = false;
    player.x = 25.1; player.z = -30;
    // Stage traffic on the same boulevard: one car ahead, one oncoming.
    const ahead = traffic[0];
    ahead.axis = 'z'; ahead.line = 22; ahead.dir = 1; ahead.pos = 6; ahead.syncMesh(0);
    const oncoming = traffic[1];
    oncoming.axis = 'z'; oncoming.line = 22; oncoming.dir = -1; oncoming.pos = 2; oncoming.syncMesh(0);
    camera.position.set(25.1, 4.4, -41);
    camera.lookAt(25.1, 1.6, -22);
  } else if (name === 'chase') {
    const car = parked[1];
    car.taken = true;
    player.car = { mesh: car.mesh, x: 69.1, z: 30, heading: 0, speed: 17, kind: 'parked', ref: car };
    car.mesh.position.set(69.1, 0, 30);
    car.mesh.rotation.y = 0;
    playerMesh.visible = false;
    player.x = 69.1; player.z = 30;
    state.wanted = 3;
    // Two units on the player's tail (between camera and player), one ahead.
    const spots = [[65.5, 21, 0.25], [72.5, 23, -0.2], [63, 47, 2.9]];
    for (const [x, z, h] of spots) {
      const u = new PoliceUnit(THREE, rng, scene, x, z);
      u.heading = h;
      u.syncMesh(0);
      police.push(u);
    }
    camera.position.set(69, 5.2, 13);
    camera.lookAt(69, 1.6, 36);
  } else if (name === 'mission') {
    state.missionIndex = 0;
    state.missionStage = 'offer';
    player.x = 103; player.z = -58;
    player.heading = Math.atan2(DINER.x - player.x, DINER.z - player.z);
    playerMesh.position.set(player.x, 0, player.z);
    playerMesh.rotation.y = player.heading;
    marker.position.set(DINER.x, 0, DINER.z);
    marker.visible = true;
    camera.position.set(97, 3.4, -50);
    camera.lookAt(112, 2.2, -68);
  }
  refreshObjective();
  refreshHud();
  drawMinimap();
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let minimapTick = 0;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = SHOT ? 1 / 60 : Math.min(rawDt, 0.05);
  if (state.mode !== 'pause' && state.mode !== 'end') state.time += dt;
  if (SHOT) {
    // Frozen tableau: only water, markers and lightbars keep moving.
    world.oceanMat.color.offsetHSL(0, 0, Math.sin(state.time * 0.7) * 0.004);
    marker.children[1].rotation.z += dt * 1.5;
    for (const u of police) { u.flash += dt * 9; if (u.mesh.userData.lightbar) u.mesh.userData.lightbar.rotation.y = Math.sin(u.flash) > 0 ? 0.5 : -0.5; }
    renderer.render(scene, camera);
    return;
  }
  if (state.mode === 'play') {
    shotCooldown = Math.max(0, shotCooldown - dt);
    updatePlayer(dt);
    const obstacles = [{ x: player.x, z: player.z }];
    for (const c of traffic) { const p = c.position(); obstacles.push(p); }
    for (const c of traffic) if (!c.stolen) c.update(dt, obstacles);
    for (const p of peds) p.update(dt, state.time);
    for (const u of police) u.update(dt, player, stars() * 0.22);
    updateWanted(dt);
    updateMission(dt);
    world.oceanMat.color.offsetHSL(0, 0, Math.sin(state.time * 0.7) * 0.004);
    refreshHud();
    if ((minimapTick++ & 1) === 0) drawMinimap();
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

if (SHOT) stageShot(SHOT);
refreshObjective();
frame();
window.__viceHarbor = { state, player, police, traffic, peds };
window.__shotReady = true;
