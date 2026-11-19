// Vice Harbor — game logic: driving, on-foot play, traffic, pedestrians,
// Harbor Patrol pursuit, pistol combat, and a 3-mission story chain.
(function () {
'use strict';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot'); // start | play | chase | mission | null
const rng = window.VHWorld.makeRng(SEED * 31 + 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(60, 16, -34);

const world = window.VHWorld.buildWorld(THREE, scene, SEED);
const colliders = world.colliders;

// ---------- tiny WebAudio synth (created only after a user gesture) ----------
const AudioSys = {
  ctx: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
  init: function () {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch (e) { this.ctx = null; }
  },
  blip: function (freq, dur, type, vol, slide) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  shot: function () { this.blip(160, 0.14, 'sawtooth', 0.2, -120); },
  pickup: function () { this.blip(880, 0.12, 'sine', 0.14); setTimeout(() => this.blip(1320, 0.16, 'sine', 0.12), 70); },
  crash: function () { this.blip(90, 0.25, 'square', 0.18, -50); },
  done: function () { this.blip(660, 0.15, 'sine', 0.14); setTimeout(() => this.blip(990, 0.25, 'sine', 0.14), 120); },
  update: function (driving, speedRatio, sirenNear, t) {
    if (!this.ctx) return;
    this.engineGain.gain.value = driving ? 0.05 + Math.abs(speedRatio) * 0.05 : 0;
    this.engineOsc.frequency.value = 55 + Math.abs(speedRatio) * 130;
    this.sirenGain.gain.value = sirenNear ? 0.035 : 0;
    this.sirenOsc.frequency.value = 700 + Math.sin(t * 6) * 180;
  }
};

// ---------- entity factories ----------
const CAR_COLORS = [0xd64541, 0x3a7bd5, 0xf2b134, 0xeeeeee, 0x22262b, 0x7bd53a, 0xd53ab1, 0x3ad5c8];
function stdMat(c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.25 }, o || {})); }

function makeCarMesh(color, isCop) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), stdMat(color, { roughness: 0.35, metalness: 0.5 }));
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.1), stdMat(0x141a24, { roughness: 0.2, metalness: 0.4 }));
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelG = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 10);
  const wheelM = stdMat(0x111111, { roughness: 0.9, metalness: 0 });
  [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
    const w = new THREE.Mesh(wheelG, wheelM);
    w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.36, p[1]); g.add(w);
  });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff6c9 }));
  hl.position.set(0, 0.62, -2.16); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  tl.position.set(0, 0.66, 2.16); g.add(tl);
  if (isCop) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.5), stdMat(0xdddddd));
    bar.position.set(0, 1.46, -0.2); g.add(bar);
    const lr = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    lr.position.set(-0.34, 1.58, -0.2); g.add(lr);
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.4), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    lb.position.set(0.34, 1.58, -0.2); g.add(lb);
    g.userData.lights = [lr, lb];
  }
  scene.add(g);
  return g;
}

function makePedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.26), stdMat(pants, { roughness: 0.9, metalness: 0 }));
  legs.position.y = 0.38; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), stdMat(shirt, { roughness: 0.9, metalness: 0 }));
  torso.position.y = 1.1; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 8), stdMat(skin, { roughness: 0.8, metalness: 0 }));
  head.position.y = 1.68; g.add(head);
  scene.add(g);
  return g;
}

// ---------- game state ----------
const save = { cash: 0, missions: 0, bestGate: 0 };
try {
  const s = JSON.parse(localStorage.getItem('viceharbor-save') || 'null');
  if (s) { save.cash = s.cash | 0; save.missions = s.missions | 0; save.bestGate = s.bestGate | 0; }
} catch (e) { /* fresh save */ }
function persist() {
  try { localStorage.setItem('viceharbor-save', JSON.stringify(save)); } catch (e) { /* private mode */ }
}

const player = {
  mesh: makePedMesh(0x14b8a6, 0x1f2937, 0xd9a066),
  x: -44, z: 24, ang: 0, health: 100, car: null, bust: 0, dead: false
};
player.mesh.position.set(player.x, 0, player.z);

const cars = [];   // {mesh,x,z,ang,speed,mode:'traffic'|'parked'|'cop'|'player',axis,dir,road,laneT,hp,flash}
const peds = [];   // {mesh,x,z,ang,speed,state,tx,tz,down}
function spawnCar(x, z, ang, mode, color) {
  const isCop = mode === 'cop';
  const mesh = makeCarMesh(isCop ? 0xf2f2f2 : (color !== undefined ? color : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]), isCop);
  const c = { mesh: mesh, x: x, z: z, ang: ang, speed: 0, mode: mode, axis: 'z', dir: 1, road: 0, hp: 100, cruise: 9 + rng() * 5 };
  mesh.position.set(x, 0, z); mesh.rotation.y = ang;
  cars.push(c); return c;
}
function laneOffset(dir) { return dir > 0 ? 2.8 : -2.8; }
function spawnTraffic() {
  for (let i = 0; i < 11; i++) {
    const onAve = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    if (onAve) {
      const road = world.avenues[Math.floor(rng() * world.avenues.length)];
      const c = spawnCar(road + laneOffset(dir), -95 + rng() * 190, dir > 0 ? 0 : Math.PI, 'traffic');
      c.axis = 'z'; c.dir = dir; c.road = road; c.speed = c.cruise;
    } else {
      const road = world.streets[Math.floor(rng() * world.streets.length)];
      const c = spawnCar(-95 + rng() * 190, road + (dir > 0 ? -2.8 : 2.8), dir > 0 ? -Math.PI / 2 : Math.PI / 2, 'traffic');
      c.axis = 'x'; c.dir = dir; c.road = road; c.speed = c.cruise;
    }
  }
  // Parked cars (stealable, no wanted penalty).
  [[-22, -12, 0.3], [30, 22, 1.8], [58, -22, -0.4], [-58, 0, 2.6], [12, 66, 0.9], [80, 14, -1.2], [-80, -40, 2.2], [100, 6, -Math.PI / 2]]
    .forEach(function (p) { const c = spawnCar(p[0], p[1], p[2], 'parked'); c.speed = 0; });
}
function spawnPeds() {
  const shirts = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0xec4899, 0xf8fafc, 0x8b5cf6];
  for (let i = 0; i < 14; i++) {
    const onAve = rng() < 0.5;
    const road = onAve ? world.avenues[Math.floor(rng() * 4)] : world.streets[Math.floor(rng() * 5)];
    const side = rng() < 0.5 ? -8.6 : 8.6;
    const x = onAve ? road + side : -95 + rng() * 190;
    const z = onAve ? -95 + rng() * 190 : road + side;
    const mesh = makePedMesh(shirts[i % shirts.length], 0x374151, [0xd9a066, 0x8d5524, 0xf1c27d][i % 3]);
    peds.push({ mesh: mesh, x: x, z: z, ang: rng() * 6.28, speed: 1.1 + rng() * 0.7, state: 'walk', tx: x, tz: z, down: 0, road: road, onAve: onAve, side: side });
    mesh.position.set(x, 0, z);
  }
}
spawnTraffic();
spawnPeds();

// Cash briefcases.
const pickups = [];
world.pickupSpots.forEach(function (p) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x8a6d1f, emissive: 0x332200, roughness: 0.4 }));
  m.position.set(p[0], 0.5, p[1]); scene.add(m);
  pickups.push({ mesh: m, x: p[0], z: p[1], active: true, timer: 0 });
});

// ---------- HUD ----------
const el = function (id) { return document.getElementById(id); };
const hud = {
  stars: el('stars'), cash: el('cash'), health: el('healthFill'), mission: el('missionText'),
  timer: el('timerText'), speed: el('speedText'), hint: el('hintText'), bust: el('bustFill'),
  bustWrap: el('bustWrap'), title: el('titleScreen'), pause: el('pauseScreen'), end: el('endScreen'),
  endTitle: el('endTitle'), endText: el('endText'), center: el('centerText')
};
const mm = el('minimap').getContext('2d');
let centerTimer = 0;
function centerMsg(text, secs) { hud.center.textContent = text; hud.center.style.opacity = '1'; centerTimer = secs || 2.5; }

// ---------- input ----------
const keys = {};
let camYaw = Math.PI, camPitch = 0.32, pointerLocked = false;
let state = SHOT ? 'playing' : 'title'; // title | playing | paused | ended
window.addEventListener('keydown', function (e) {
  keys[e.code] = true;
  AudioSys.init();
  if ((e.code === 'KeyP' || e.code === 'Escape') && !SHOT) {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  if (e.code === 'KeyF' && state === 'playing') toggleCar();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });
renderer.domElement.addEventListener('click', function () {
  AudioSys.init();
  if (state === 'playing' && !SHOT && !pointerLocked) renderer.domElement.requestPointerLock();
  else if (state === 'playing' && pointerLocked && !player.car) shoot();
});
document.addEventListener('pointerlockchange', function () {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && state === 'playing' && !SHOT) pauseGame();
});
window.addEventListener('mousemove', function (e) {
  if (!pointerLocked || state !== 'playing') return;
  camYaw -= e.movementX * 0.0028;
  camPitch = Math.max(0.05, Math.min(1.1, camPitch + e.movementY * 0.0022));
});
el('startBtn').addEventListener('click', function () { startGame(); });
el('resumeBtn').addEventListener('click', function () { resumeGame(); });
el('restartBtn').addEventListener('click', function () { location.reload(); });
el('freeBtn').addEventListener('click', function () {
  hud.end.style.display = 'none'; state = 'playing';
  renderer.domElement.requestPointerLock();
});
function startGame() {
  AudioSys.init();
  hud.title.style.display = 'none'; state = 'playing';
  renderer.domElement.requestPointerLock();
  centerMsg('Head to the gold marker at the Skyline Garage to start work.', 4);
}
function pauseGame() { if (state !== 'playing') return; state = 'paused'; hud.pause.style.display = 'flex'; }
function resumeGame() {
  hud.pause.style.display = 'none'; state = 'playing';
  renderer.domElement.requestPointerLock();
}

// ---------- wanted / police ----------
let wanted = 0, crimeTimer = 0, decayTimer = 0, panicTimer = 0;
function commitCrime(n) {
  if (SHOT) return;
  wanted = Math.min(5, wanted + n); crimeTimer = 0; decayTimer = 0;
  syncCops();
}
function syncCops() {
  const target = (state === 'playing' && wanted > 0) ? Math.min(4, wanted) : 0;
  let cops = cars.filter(function (c) { return c.mode === 'cop'; });
  while (cops.length < target) {
    const a = rng() * Math.PI * 2, d = 55 + rng() * 20;
    const x = Math.max(-98, Math.min(98, player.x + Math.cos(a) * d));
    const z = Math.max(-98, Math.min(98, player.z + Math.sin(a) * d));
    const c = spawnCar(x, z, 0, 'cop'); c.speed = 8;
    cops.push(c);
  }
  while (cops.length > target) {
    const c = cops.pop();
    cars.splice(cars.indexOf(c), 1); scene.remove(c.mesh);
  }
}
function nearestCopDist() {
  let best = 1e9;
  cars.forEach(function (c) { if (c.mode === 'cop') best = Math.min(best, Math.hypot(c.x - player.x, c.z - player.z)); });
  return best;
}

// ---------- collision helpers ----------
function collideCircle(x, z, r) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const dx = x - c.x, dz = z - c.z;
    const px = c.hw + r - Math.abs(dx), pz = c.hd + r - Math.abs(dz);
    if (px > 0 && pz > 0) {
      if (px < pz) x = c.x + (dx > 0 ? c.hw + r : -c.hw - r);
      else z = c.z + (dz > 0 ? c.hd + r : -c.hd - r);
    }
  }
  return [x, z];
}
function clampWorld(o, isCar) {
  const maxX = o.z > -5 && o.z < 5 ? 148 : 100;
  o.x = Math.max(isCar ? -102 : -104, Math.min(maxX, o.x));
  o.z = Math.max(-104, Math.min(104, o.z));
}

// ---------- enter / exit car ----------
function nearestCar(maxD) {
  let best = null, bd = maxD;
  cars.forEach(function (c) {
    if (c.mode === 'cop' && wanted === 0) return;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bd) { bd = d; best = c; }
  });
  return best;
}
function toggleCar() {
  if (player.car) {
    const c = player.car;
    player.x = c.x + Math.cos(c.ang) * 2.4; player.z = c.z - Math.sin(c.ang) * 2.4;
    const p = collideCircle(player.x, player.z, 0.5); player.x = p[0]; player.z = p[1];
    player.mesh.visible = true;
    c.mode = 'parked'; c.speed = 0; player.car = null;
  } else {
    const c = nearestCar(3.4);
    if (!c) return;
    if (c.mode === 'traffic') { commitCrime(1); centerMsg('Car jacked! The Patrol is watching.', 2); }
    if (c.mode === 'cop') commitCrime(1);
    c.mode = 'player'; player.car = c; player.mesh.visible = false;
    AudioSys.blip(520, 0.1, 'sine', 0.1);
  }
}

// ---------- shooting ----------
let shootCd = 0;
const muzzle = new THREE.PointLight(0xffcc66, 0, 18);
scene.add(muzzle);
function shoot() {
  if (shootCd > 0 || player.car || player.dead) return;
  shootCd = 0.18; AudioSys.shot(); panicTimer = 4;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  muzzle.position.copy(origin).addScaledVector(dir, 2); muzzle.intensity = 2.4;
  let bestT = 70, bestPed = null, bestCar = null;
  function rayHit(x, y, z, rad) {
    const vx = x - origin.x, vy = y - origin.y, vz = z - origin.z;
    const t = vx * dir.x + vy * dir.y + vz * dir.z;
    if (t < 1 || t > bestT) return -1;
    const px = origin.x + dir.x * t - x, py = origin.y + dir.y * t - y, pz = origin.z + dir.z * t - z;
    return (px * px + py * py + pz * pz) < rad * rad ? t : -1;
  }
  peds.forEach(function (p) {
    if (p.down) return;
    const t = rayHit(p.x, 1.1, p.z, 0.85);
    if (t > 0) { bestT = t; bestPed = p; bestCar = null; }
  });
  cars.forEach(function (c) {
    if (c === player.car) return;
    const t = rayHit(c.x, 0.8, c.z, 2.1);
    if (t > 0) { bestT = t; bestCar = c; bestPed = null; }
  });
  if (bestPed) { bestPed.down = 14; bestPed.state = 'down'; commitCrime(2); centerMsg('You dropped a civilian!', 2); }
  else if (bestCar) {
    bestCar.hp -= 34; AudioSys.crash();
    if (bestCar.mode === 'cop') commitCrime(1);
    if (bestCar.hp <= 0 && bestCar.mode !== 'player') { bestCar.speed = 0; bestCar.mode = 'parked'; }
  } else commitCrime(1);
}

// ---------- updates ----------
function updatePlayer(dt) {
  if (keys['KeyQ']) camYaw += dt * 1.9;
  if (keys['KeyE']) camYaw -= dt * 1.9;
  if (player.car) {
    const c = player.car;
    const accel = keys['KeyW'] ? 15 : 0, brake = keys['KeyS'] ? 13 : 0;
    if (accel) c.speed += accel * dt * (c.speed < 0 ? 2.2 : 1);
    if (brake) c.speed -= brake * dt * (c.speed > 0 ? 2.2 : 0.55);
    c.speed -= c.speed * dt * (keys['Space'] ? 1.6 : 0.35);
    const top = 30;
    c.speed = Math.max(-9, Math.min(top, c.speed));
    const steer = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
    if (Math.abs(c.speed) > 0.2) {
      c.ang += steer * dt * (keys['Space'] ? 1.7 : 1.25) * (c.speed > 0 ? 1 : -1) * Math.min(1, Math.abs(c.speed) / 9);
    }
    const nx = c.x - Math.sin(c.ang) * c.speed * dt;
    const nz = c.z - Math.cos(c.ang) * c.speed * dt;
    const p = collideCircle(nx, nz, 1.7);
    if ((Math.abs(p[0] - nx) > 0.01 || Math.abs(p[1] - nz) > 0.01) && Math.abs(c.speed) > 7) {
      player.health -= 4; AudioSys.crash();
    }
    c.x = p[0]; c.z = p[1]; clampWorld(c, true);
    // car vs car soft push
    cars.forEach(function (o) {
      if (o === c) return;
      const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 3.4) {
        const push = (3.4 - d) / 2;
        c.x += (dx / d) * push; c.z += (dz / d) * push;
        if (o.mode !== 'cop') { o.x -= (dx / d) * push; o.z -= (dz / d) * push; }
        if (Math.abs(c.speed) > 10) { o.hp -= 10; if (o.mode === 'cop') commitCrime(1); }
        c.speed *= 0.82;
      }
    });
    player.x = c.x; player.z = c.z; player.ang = c.ang;
  } else {
    const run = keys['ShiftLeft'] || keys['ShiftRight'] ? 8.4 : 4.6;
    let mx = 0, mz = 0;
    if (keys['KeyW']) mz += 1; if (keys['KeyS']) mz -= 1;
    if (keys['KeyA']) mx -= 1; if (keys['KeyD']) mx += 1;
    if (mx || mz) {
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const wx = (mx * cos - mz * sin), wz = (-mz * cos - mx * sin);
      player.x += wx * run * dt; player.z += wz * run * dt;
      player.ang = Math.atan2(wx, wz);
      const p = collideCircle(player.x, player.z, 0.5);
      player.x = p[0]; player.z = p[1]; clampWorld(player, false);
    }
    player.mesh.position.set(player.x, Math.abs(Math.sin(perfT * 9)) * (mx || mz ? 0.06 : 0), player.z);
    player.mesh.rotation.y = player.ang;
  }
}

function updateTrafficCar(c, dt) {
  // slow for obstacles ahead
  let target = c.cruise;
  const fx = c.axis === 'z' ? c.x : c.x - Math.sin(c.ang) * 6;
  const fz = c.axis === 'z' ? c.z - Math.cos(c.ang) * 0 + (c.dir > 0 ? -6 : 6) * -1 : c.z;
  cars.forEach(function (o) {
    if (o === c) return;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    if (d < 6.5 && Math.abs(o.x - c.x) < 2.4 && Math.abs(o.z - c.z) < 2.4 + 4) target = Math.min(target, 2);
    else if (d < 6.5 && ((c.axis === 'z' && Math.abs(o.x - c.x) < 2.4 && (o.z - c.z) * c.dir < 0) ||
             (c.axis === 'x' && Math.abs(o.z - c.z) < 2.4 && (o.x - c.x) * c.dir < 0))) target = 0;
  });
  if (player.car) {
    const d = Math.hypot(player.car.x - c.x, player.car.z - c.z);
    if (d < 6 && ((c.axis === 'z' && Math.abs(player.car.x - c.x) < 2.4) || (c.axis === 'x' && Math.abs(player.car.z - c.z) < 2.4))) target = 0;
  }
  c.speed += Math.max(-14 * dt, Math.min(7 * dt, target - c.speed));
  if (c.axis === 'z') {
    c.z -= c.dir * c.speed * dt * -1; // dir>0 travels -z in our heading convention below
    c.z = c.z; // (kept simple: recompute cleanly)
    c.x += (c.road + laneOffset(c.dir) - c.x) * Math.min(1, dt * 3);
    c.ang = c.dir > 0 ? Math.PI : 0;
    // turning at streets
    for (let i = 0; i < world.streets.length; i++) {
      const s = world.streets[i];
      if (Math.abs(c.z - s) < 1.4 && rng() < dt * 0.55) {
        c.axis = 'x'; c.road = s; c.dir = rng() < 0.5 ? 1 : -1; c.z = s + (c.dir > 0 ? -2.8 : 2.8);
        break;
      }
    }
    if (Math.abs(c.z) > 100) { c.dir *= -1; }
  } else {
    c.x += c.dir * c.speed * dt;
    c.z += (c.road + (c.dir > 0 ? -2.8 : 2.8) - c.z) * Math.min(1, dt * 3);
    c.ang = c.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (let i = 0; i < world.avenues.length; i++) {
      const a = world.avenues[i];
      if (Math.abs(c.x - a) < 1.4 && rng() < dt * 0.55) {
        c.axis = 'z'; c.road = a; c.dir = rng() < 0.5 ? 1 : -1; c.x = a + laneOffset(c.dir);
        break;
      }
    }
    if (Math.abs(c.x) > 100) { c.dir *= -1; }
  }
  c.mesh.position.set(c.x, 0, c.z);
  c.mesh.rotation.y = c.ang;
}

function updateCop(c, dt, t) {
  const dx = player.x - c.x, dz = player.z - c.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const targetAng = Math.atan2(-dx, -dz);
  let da = targetAng - c.ang;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  c.ang += Math.max(-2.4 * dt, Math.min(2.4 * dt, da));
  const topSpeed = Math.min(30, 15 + wanted * 2.6 + (dist > 45 ? 6 : 0));
  c.speed += Math.max(-16 * dt, Math.min(9 * dt, topSpeed - c.speed));
  if (player.car === null && dist < 7) c.speed = Math.min(c.speed, 3); // cops stop to bust on foot
  const nx = c.x - Math.sin(c.ang) * c.speed * dt;
  const nz = c.z - Math.cos(c.ang) * c.speed * dt;
  const p = collideCircle(nx, nz, 1.7);
  if (Math.abs(p[0] - nx) > 0.01 || Math.abs(p[1] - nz) > 0.01) c.speed *= 0.5;
  c.x = p[0]; c.z = p[1]; clampWorld(c, true);
  // ram / run-over damage
  if (dist < 3.2) {
    if (player.car && Math.abs(c.speed - player.car.speed) > 9) { player.health -= 9 * dt * 3; AudioSys.crash(); }
    if (!player.car && c.speed > 5) { player.health -= 26 * dt * 3; player.x -= (dx / dist) * 2.2; player.z -= (dz / dist) * 2.2; }
  }
  c.mesh.position.set(c.x, 0, c.z);
  c.mesh.rotation.y = c.ang;
  if (c.mesh.userData.lights) {
    const ph = Math.sin(t * 10) > 0;
    c.mesh.userData.lights[0].material.color.setHex(ph ? 0xff2222 : 0x661111);
    c.mesh.userData.lights[1].material.color.setHex(ph ? 0x112266 : 0x2255ff);
  }
}

function updatePeds(dt) {
  peds.forEach(function (p) {
    if (p.down > 0) {
      p.down -= dt;
      p.mesh.rotation.x = Math.PI / 2; p.mesh.position.set(p.x, 0.25, p.z);
      if (p.down <= 0) { // gets up far away / respawns
        p.mesh.rotation.x = 0; p.state = 'walk';
        p.x = player.x + (rng() - 0.5) * 160; p.z = player.z + (rng() - 0.5) * 160;
      }
      return;
    }
    let flee = false;
    if (panicTimer > 0 || (wanted >= 2 && Math.hypot(p.x - player.x, p.z - player.z) < 16)) flee = true;
    if (flee) {
      const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz) || 1;
      p.x += (dx / d) * 5.4 * dt; p.z += (dz / d) * 5.4 * dt;
      p.ang = Math.atan2(dx, dz);
    } else {
      if (Math.hypot(p.tx - p.x, p.tz - p.z) < 1.2 || rng() < dt * 0.05) {
        if (p.onAve) { p.tx = p.road + p.side; p.tz = -95 + rng() * 190; }
        else { p.tx = -95 + rng() * 190; p.tz = p.road + p.side; }
      }
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 1;
      p.x += (dx / d) * p.speed * dt; p.z += (dz / d) * p.speed * dt;
      p.ang = Math.atan2(dx, dz);
    }
    const q = collideCircle(p.x, p.z, 0.4); p.x = q[0]; p.z = q[1];
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.ang;
    // hit by player car
    if (player.car && Math.abs(player.car.speed) > 4) {
      if (Math.hypot(p.x - player.car.x, p.z - player.car.z) < 2.1) {
        p.down = 16; p.state = 'down'; commitCrime(2); centerMsg('You ran someone down!', 2); AudioSys.crash();
      }
    }
  });
}

// ---------- missions ----------
const marker = new THREE.Mesh(
  new THREE.CylinderGeometry(2.6, 2.6, 36, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
);
marker.position.set(world.hideout.x, 18, world.hideout.z); scene.add(marker);
const M = { stage: 0, phase: 'idle', timer: 0, gate: 0, holdT: 0, totalT: 0 };
// stage: 0 none done, 1..3 next mission index; phase: idle|pickup|deliver|escape|gates|done
function missionTarget() {
  if (M.phase === 'pickup') return world.pierPickup;
  if (M.phase === 'deliver' || M.phase === 'escape') return world.hideout;
  if (M.phase === 'gates') return world.gates[M.gate];
  return world.hideout;
}
function setMarker() {
  const t = missionTarget();
  marker.position.set(t.x, 18, t.z);
  marker.visible = !(M.phase === 'done');
  world.gates.forEach(function (g, i) {
    const active = M.phase === 'gates' && i === M.gate;
    g.ring.material.color.setHex(active ? 0x39ff88 : (M.phase === 'gates' && i < M.gate ? 0x1a5c38 : 0x2a7d4f));
    g.beam.visible = active;
    g.ring.rotation.z += 0.01;
  });
}
function startMission(n) {
  M.totalT = 0;
  if (n === 1) { M.phase = 'pickup'; M.timer = 170; centerMsg('MISSION 1 — PIER RUN: grab the package at the pier!', 4); }
  if (n === 2) { M.phase = 'escape'; wanted = Math.max(wanted, 2); crimeTimer = -999; syncCops(); centerMsg('MISSION 2 — HEAT ESCAPE: lose the Patrol at the garage!', 4); }
  if (n === 3) { M.phase = 'gates'; M.gate = 0; M.timer = 130; centerMsg('MISSION 3 — GATE RUSH: hit all 5 gates in order!', 4); }
  AudioSys.blip(740, 0.15, 'sine', 0.12);
}
function completeMission(n, reward) {
  save.cash += reward; save.missions = Math.max(save.missions, n); persist();
  M.stage = n; M.phase = n >= 3 ? 'done' : 'idle';
  AudioSys.done();
  if (n === 3) {
    if (!save.bestGate || M.totalT < save.bestGate) save.bestGate = Math.round(M.totalT); persist();
    endGame('HARBOR KING', 'Story complete! Total time ' + Math.round(M.totalT) + 's · Career cash $' + save.cash + '. The city is yours — keep cruising if you like.');
  } else {
    centerMsg('Mission complete! +$' + reward + ' — return to the garage marker for the next job.', 4.5);
  }
}
function failMission(reason) {
  M.phase = 'idle'; wanted = Math.min(wanted, 1); syncCops();
  centerMsg('Mission failed: ' + reason + ' — return to the garage to retry.', 4);
}
function updateMission(dt) {
  if (M.phase === 'idle' || M.phase === 'done') {
    if (M.phase === 'idle' && M.stage < 3) {
      const d = Math.hypot(player.x - world.hideout.x, player.z - world.hideout.z);
      if (d < world.hideout.r) startMission(M.stage + 1);
    }
    return;
  }
  M.totalT += dt;
  const t = missionTarget();
  const d = Math.hypot(player.x - t.x, player.z - t.z);
  if (M.phase === 'pickup') {
    M.timer -= dt;
    if (d < 5) { M.phase = 'deliver'; centerMsg('Package aboard! Get it back to the garage!', 3); AudioSys.pickup(); }
    else if (M.timer <= 0) failMission('out of time');
  } else if (M.phase === 'deliver') {
    M.timer -= dt;
    if (d < world.hideout.r) completeMission(1, 500);
    else if (M.timer <= 0) failMission('out of time');
  } else if (M.phase === 'escape') {
    wanted = Math.max(wanted, 2); crimeTimer = 0; // heat stays on during the escape
    if (d < world.hideout.r) {
      M.holdT += dt;
      if (M.holdT > 4) { wanted = 0; syncCops(); completeMission(2, 750); }
    } else M.holdT = 0;
  } else if (M.phase === 'gates') {
    M.timer -= dt;
    if (d < 5.2) {
      M.gate++; AudioSys.pickup();
      if (M.gate >= world.gates.length) completeMission(3, 1000);
      else centerMsg('Gate ' + M.gate + ' of 5 — next!', 1.6);
    } else if (M.timer <= 0) failMission('out of time');
  }
  setMarker();
}

// ---------- wanted decay / bust / health ----------
function updateSystems(dt) {
  crimeTimer += dt; panicTimer = Math.max(0, panicTimer - dt);
  shootCd = Math.max(0, shootCd - dt);
  if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 14);
  if (wanted > 0 && M.phase !== 'escape') {
    if (crimeTimer > 18 && nearestCopDist() > 30) {
      decayTimer += dt;
      if (decayTimer > 12) { wanted--; decayTimer = 0; syncCops(); if (wanted === 0) centerMsg('You lost the Patrol.', 2); }
    } else decayTimer = 0;
  }
  // bust meter
  const cd = nearestCopDist();
  if (!player.car && wanted > 0 && cd < 6.5 && player.health > 0) player.bust += dt * 0.45;
  else player.bust = Math.max(0, player.bust - dt * 0.35);
  if (player.car && wanted > 0 && cd < 3.4 && Math.abs(player.car.speed) < 1.5) player.bust += dt * 0.3;
  if (player.bust >= 1 && !SHOT) endGame('BUSTED', 'The Harbor Patrol boxed you in. Career cash kept: $' + save.cash + '.');
  if (player.health < 100) player.health = Math.min(100, player.health + dt * 1.1);
  if (player.health <= 0 && !player.dead) {
    player.dead = true;
    if (!SHOT) endGame('WASTED', 'You flatlined on the boulevard. Career cash kept: $' + save.cash + '.');
  }
  // pickups
  pickups.forEach(function (p) {
    if (!p.active) { p.timer -= dt; if (p.timer <= 0) { p.active = true; p.mesh.visible = true; } return; }
    p.mesh.rotation.y += dt * 2;
    if (Math.hypot(player.x - p.x, player.z - p.z) < 2.2) {
      p.active = false; p.mesh.visible = false; p.timer = 25;
      save.cash += 50; persist(); AudioSys.pickup(); centerMsg('+$50 — found a cash briefcase', 1.4);
    }
  });
}
function endGame(title, text) {
  if (state === 'ended') return;
  state = 'ended';
  if (document.pointerLockElement) document.exitPointerLock();
  hud.endTitle.textContent = title; hud.endText.textContent = text;
  hud.end.style.display = 'flex';
  el('freeBtn').style.display = (title === 'HARBOR KING') ? 'inline-block' : 'none';
}

// ---------- camera + minimap + HUD ----------
let perfT = 0;
function updateCamera(dt) {
  const tx = player.car ? player.car.x : player.x;
  const tz = player.car ? player.car.z : player.z;
  const dist = player.car ? 10.5 : 7;
  const h = player.car ? 3.4 : 2.6;
  const cx = tx + Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = tz + Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = h + Math.sin(camPitch) * dist;
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 6);
  camera.position.y += (Math.max(0.7, cy) - camera.position.y) * Math.min(1, dt * 6);
  camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 6);
  camera.lookAt(tx, 1.6, tz);
}
function drawMinimap() {
  const S = 180, k = S / 300;
  mm.fillStyle = '#10151f'; mm.fillRect(0, 0, S, S);
  mm.fillStyle = '#14607e'; mm.fillRect((104 + 150) * k, 0, S, S);
  mm.strokeStyle = '#4b5563'; mm.lineWidth = 3;
  world.avenues.forEach(function (x) { mm.beginPath(); mm.moveTo((x + 150) * k, 0); mm.lineTo((x + 150) * k, S); mm.stroke(); });
  world.streets.forEach(function (z) { mm.beginPath(); mm.moveTo(0, (z + 150) * k); mm.lineTo(S, (z + 150) * k); mm.stroke(); });
  const t = missionTarget();
  if (M.phase !== 'done') { mm.fillStyle = '#ffd23e'; mm.beginPath(); mm.arc((t.x + 150) * k, (t.z + 150) * k, 4, 0, 7); mm.fill(); }
  cars.forEach(function (c) {
    if (c.mode !== 'cop') return;
    mm.fillStyle = '#ff4444'; mm.fillRect((c.x + 150) * k - 2, (c.z + 150) * k - 2, 4, 4);
  });
  mm.save();
  mm.translate((player.x + 150) * k, (player.z + 150) * k);
  mm.rotate(player.car ? -player.car.ang : -player.ang);
  mm.fillStyle = '#ffffff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
}
function updateHUD() {
  hud.stars.textContent = wanted > 0 ? '★'.repeat(wanted) + '☆'.repeat(5 - wanted) : '';
  hud.cash.textContent = '$' + save.cash;
  hud.health.style.width = Math.max(0, player.health) + '%';
  hud.health.style.background = player.health > 35 ? '#3aff7a' : '#ff5040';
  hud.bustWrap.style.display = player.bust > 0.02 ? 'block' : 'none';
  hud.bust.style.width = Math.min(100, player.bust * 100) + '%';
  hud.speed.textContent = player.car ? Math.round(Math.abs(player.car.speed) * 3.6) + ' km/h' : '';
  let mtxt = '', ttxt = '';
  if (M.phase === 'pickup') { mtxt = 'MISSION 1 · PIER RUN — reach the pier package'; ttxt = Math.ceil(M.timer) + 's'; }
  else if (M.phase === 'deliver') { mtxt = 'MISSION 1 · PIER RUN — deliver to the Skyline Garage'; ttxt = Math.ceil(M.timer) + 's'; }
  else if (M.phase === 'escape') { mtxt = 'MISSION 2 · HEAT ESCAPE — hold inside the garage zone (' + Math.max(0, 4 - M.holdT).toFixed(1) + 's)'; }
  else if (M.phase === 'gates') { mtxt = 'MISSION 3 · GATE RUSH — gate ' + (M.gate + 1) + ' of 5'; ttxt = Math.ceil(M.timer) + 's'; }
  else if (M.phase === 'done') mtxt = 'Story complete — free roam';
  else if (M.stage < 3) mtxt = 'Go to the gold marker at the Skyline Garage for work';
  hud.mission.textContent = mtxt; hud.timer.textContent = ttxt;
  hud.hint.textContent = state === 'playing'
    ? (player.car ? 'WASD drive · Space handbrake · F exit car' : (nearestCar(3.4) ? 'Press F to take this car · WASD move · Click shoot' : 'WASD move · Shift sprint · Click canvas to aim'))
    : '';
  if (centerTimer > 0) { centerTimer -= 1 / 60; if (centerTimer <= 0) hud.center.style.opacity = '0'; }
}

// ---------- deterministic screenshot scenes ----------
function placeShotCar(x, z, ang, mode, color) {
  const c = spawnCar(x, z, ang, mode, color);
  c.mesh.position.set(x, 0, z); return c;
}
if (SHOT) {
  hud.title.style.display = 'none';
  cars.forEach(function (c) { c.speed = 0; });
  if (SHOT === 'start') {
    player.x = 88; player.z = -4; player.ang = -2.2;
    player.mesh.position.set(player.x, 0, player.z); player.mesh.rotation.y = player.ang;
    placeShotCar(84, 3, 0.4, 'parked', 0xd64541);
    camera.position.set(97, 5.5, -16); camera.lookAt(40, 7, 6);
  } else if (SHOT === 'play') {
    const c = placeShotCar(22, -30, 0, 'player', 0x3a7bd5);
    c.speed = 14; player.car = c; player.mesh.visible = false; player.x = 22; player.z = -30;
    camYaw = 0; camPitch = 0.3;
    camera.position.set(22, 5, -16); camera.lookAt(22, 1.5, -32);
  } else if (SHOT === 'chase') {
    const c = placeShotCar(-30, -22, -Math.PI / 2, 'player', 0xf2b134);
    c.speed = 18; player.car = c; player.mesh.visible = false; player.x = -30; player.z = -22;
    wanted = 3;
    [[-44, -25], [-46, -19], [-58, -22]].forEach(function (p) {
      const cop = placeShotCar(p[0], p[1], -Math.PI / 2, 'cop'); cop.speed = 17;
    });
    camera.position.set(-38, 6.5, -6); camera.lookAt(-26, 1.5, -23);
  } else if (SHOT === 'mission') {
    const c = placeShotCar(58, 0, -Math.PI / 2, 'player', 0x7bd53a);
    c.speed = 12; player.car = c; player.mesh.visible = false; player.x = 58; player.z = 0;
    M.stage = 0; M.phase = 'pickup'; M.timer = 150;
    setMarker();
    camera.position.set(48, 7, 14); camera.lookAt(70, 2, 0);
  }
  setMarker();
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let frames = 0, mmTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  perfT += dt;
  if (state === 'playing') {
    updatePlayer(dt);
    cars.forEach(function (c) {
      if (c.mode === 'traffic') updateTrafficCar(c, dt);
      else if (c.mode === 'cop') updateCop(c, dt, perfT);
      else if (c.mode === 'parked') { c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.ang; }
    });
    updatePeds(dt);
    updateMission(dt);
    updateSystems(dt);
    if (!SHOT) updateCamera(dt);
    else if (SHOT === 'play' || SHOT === 'chase' || SHOT === 'mission') { /* fixed cinematic cameras */ }
    const siren = wanted > 0 && nearestCopDist() < 40;
    AudioSys.update(!!player.car, player.car ? player.car.speed / 30 : 0, siren, perfT);
    mmTimer += dt;
    if (mmTimer > 0.12) { mmTimer = 0; drawMinimap(); }
    updateHUD();
  }
  if (world.water) world.water.position.y = -0.3 + Math.sin(perfT * 0.8) * 0.05;
  renderer.render(scene, camera);
  frames++;
  if (SHOT && frames === 40) window.__shotReady = true;
}
window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
drawMinimap();
animate();
})();
