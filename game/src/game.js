// Vice Harbor — game.js (part 1): boot, renderer, WebAudio synth, input, factories.
// An original open-world crime game in a golden-hour coastal city. No third-party IP.
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const SEED = parseInt(params.get('seed') || '1', 10) || 1;
  const SHOT = params.get('shot') || '';

  // ---------- Save (localStorage) ----------
  let save = { mission: 0, cash: 0, done: false };
  try {
    const raw = localStorage.getItem('viceHarborSave');
    if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') save = Object.assign(save, p); }
  } catch (e) { /* storage unavailable: play session-only */ }
  function persist() {
    try { localStorage.setItem('viceHarborSave', JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  // ---------- Renderer / scene ----------
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xff9e5e);
  scene.fog = new THREE.Fog(0xff9e5e, 120, 620);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

  const sun = new THREE.DirectionalLight(0xffd9a0, 1.15);
  sun.position.set(-140, 180, -220);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffe0b8, 0x33415e, 0.75));
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(26, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })
  );
  sunBall.position.set(-420, 130, -640);
  scene.add(sunBall);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- City ----------
  const built = window.VHWorld.buildCity(scene, SEED);
  const world = built.world;
  window.VHWorld.populateCity(scene, world, built.rng);
  const rng = window.VHWorld.makeRng(SEED * 31 + 7);

  // ---------- WebAudio synth ----------
  const AudioSys = {
    ctx: null, master: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
    init: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    blip: function (freq, dur, type, vol, slide) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    shot: function () {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * 0.12);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(g); g.connect(this.master);
      src.start(t);
      this.blip(160, 0.1, 'sawtooth', 0.25, 60);
    },
    chime: function () { this.blip(880, 0.14, 'sine', 0.25); const s = this; setTimeout(function () { s.blip(1320, 0.2, 'sine', 0.22); }, 90); },
    thud: function () { this.blip(90, 0.16, 'sine', 0.4, 40); },
    setEngine: function (on, speedNorm) {
      if (!this.ctx) return;
      if (on && !this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineGain.gain.value = 0.05;
        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      if (this.engineOsc) {
        this.engineOsc.frequency.value = 55 + speedNorm * 130;
        this.engineGain.gain.value = on ? 0.05 + speedNorm * 0.05 : 0.0;
        if (!on) { const o = this.engineOsc, g = this.engineGain; this.engineOsc = null; this.engineGain = null; setTimeout(function () { try { o.stop(); } catch (e) {} }, 120); }
      }
    },
    setSiren: function (on) {
      if (!this.ctx) return;
      if (on && !this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'triangle';
        this.sirenGain.gain.value = 0.035;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
      }
      if (this.sirenOsc) {
        this.sirenOsc.frequency.value = (Math.floor(performance.now() / 380) % 2 === 0) ? 660 : 880;
        if (!on) { const o = this.sirenOsc; this.sirenOsc = null; this.sirenGain = null; setTimeout(function () { try { o.stop(); } catch (e) {} }, 60); }
      }
    }
  };

  // ---------- Input ----------
  const keys = {};
  let camYaw = 0, camPitch = 0.32, mouseDown = false, lastMX = 0, shootQueued = false;
  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  canvas.addEventListener('mousedown', function (e) {
    AudioSys.init();
    mouseDown = true; lastMX = e.clientX;
    if (state.mode === 'play' && !player.inCar) shootQueued = true;
  });
  window.addEventListener('mouseup', function () { mouseDown = false; });
  window.addEventListener('mousemove', function (e) {
    if (mouseDown) {
      camYaw -= (e.clientX - lastMX) * 0.005;
      lastMX = e.clientX;
    }
  });

  // ---------- Factories ----------
  function makePerson(shirt, pants) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34),
      new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = 1.05;
    grp.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8b98d }));
    head.position.y = 1.78;
    grp.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22),
      new THREE.MeshLambertMaterial({ color: pants }));
    legL.position.set(-0.16, 0.31, 0);
    grp.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.16;
    grp.add(legR);
    grp.userData.legL = legL; grp.userData.legR = legR;
    return grp;
  }

  const CAR_COLORS = [0xd64541, 0x3e7cb1, 0xf2b134, 0x6abe30, 0xb565d8, 0xe8e8e8, 0x2ec4b6, 0xff7b54];
  function makeCar(color, isPolice) {
    const grp = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf4f4f4 : color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
    body.position.y = 0.62;
    grp.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2),
      new THREE.MeshLambertMaterial({ color: isPolice ? 0x1c2733 : 0x22303e }));
    cabin.position.set(0, 1.18, -0.2);
    grp.add(cabin);
    if (isPolice) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.2, 4.44),
        new THREE.MeshLambertMaterial({ color: 0x1c4f9c }));
      stripe.position.y = 0.62;
      grp.add(stripe);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff4444 }));
      bar.position.set(0, 1.55, -0.2);
      grp.add(bar);
      grp.userData.lightBar = bar;
    }
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    const wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.36, p[1]);
      grp.add(w);
      wheels.push(w);
    });
    grp.userData.wheels = wheels;
    return grp;
  }

  window.VHGame = { params, SEED, SHOT, save, persist, renderer, scene, camera, world, rng, AudioSys, keys, makePerson, makeCar, CAR_COLORS,
    get camYaw() { return camYaw; }, set camYaw(v) { camYaw = v; },
    get camPitch() { return camPitch; },
    get shootQueued() { return shootQueued; }, set shootQueued(v) { shootQueued = v; } };
  var state = { mode: 'title' };
  window.VHGame.state = state;
})();

// game.js (part 2): player, traffic AI, pedestrians, police pursuit, combat.
(function () {
  'use strict';
  const G = window.VHGame;
  const scene = G.scene, world = G.world, rng = G.rng;
  const state = G.state;
  const step = world.step;

  // ---------- Player ----------
  const playerObj = G.makePerson(0xff5fa2, 0x22303e);
  scene.add(playerObj);
  const player = {
    mesh: playerObj, pos: new THREE.Vector3(-114, 0, 88),
    heading: 0, speed: 0, inCar: null, health: 100, walkPhase: 0,
    wanted: 0, crimeHeat: 0, bust: 0
  };
  window.player = player; // used by part 1's click handler
  playerObj.position.copy(player.pos);

  // ---------- Cars ----------
  const cars = [];
  function addCar(x, z, heading, color, kind) {
    const mesh = G.makeCar(color, kind === 'police');
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = { mesh, pos: mesh.position, heading, speed: 0, kind: kind || 'traffic',
      lane: 0, axis: 'x', dir: 1, targetSpeed: 9 + rng() * 5, dead: false, driver: true };
    cars.push(car);
    return car;
  }
  // Traffic: straight runs along road lines, wrapping at the city edge.
  const roadLines = [-3, -2, -1, 0, 1, 2, 3].map(function (i) { return i * step; });
  for (let i = 0; i < 14; i++) {
    const horiz = rng() < 0.5;
    const line = roadLines[Math.floor(rng() * roadLines.length)];
    const dir = rng() < 0.5 ? 1 : -1;
    const laneOff = dir > 0 ? 3.4 : -3.4;
    const along = -230 + rng() * 460;
    let car;
    if (horiz) {
      car = addCar(along, line + laneOff, dir > 0 ? Math.PI / 2 : -Math.PI / 2, G.CAR_COLORS[i % G.CAR_COLORS.length]);
      car.axis = 'x';
    } else {
      car = addCar(line + laneOff, along, dir > 0 ? 0 : Math.PI, G.CAR_COLORS[i % G.CAR_COLORS.length]);
      car.axis = 'z';
    }
    car.dir = dir; car.lane = line + laneOff;
    car.speed = car.targetSpeed;
  }
  // Parked cars to steal (one by the hideout, others scattered).
  const parkedSpots = [[-108, 100], [-40, 8], [30, -68], [80, 84], [120, 190], [-160, -8], [8, 160]];
  parkedSpots.forEach(function (s, i) {
    const c = addCar(s[0], s[1], (i % 4) * Math.PI / 2, G.CAR_COLORS[(i + 3) % G.CAR_COLORS.length], 'parked');
    c.driver = false;
  });
  // Police pool.
  const police = [];
  for (let i = 0; i < 4; i++) {
    const c = addCar(400, 400, 0, 0xffffff, 'police');
    c.mesh.visible = false;
    police.push(c);
  }

  // ---------- Pedestrians ----------
  const peds = [];
  const SHIRTS = [0xf2b134, 0x3e7cb1, 0x6abe30, 0xe8e8e8, 0xff7b54, 0xb565d8];
  for (let i = 0; i < 22; i++) {
    const mesh = G.makePerson(SHIRTS[i % SHIRTS.length], 0x3a3f4a);
    scene.add(mesh);
    const horiz = rng() < 0.5;
    const line = roadLines[Math.floor(rng() * roadLines.length)] + (rng() < 0.5 ? 10.5 : -10.5);
    const ped = { mesh, pos: mesh.position, axis: horiz ? 'x' : 'z', lane: line,
      t: -230 + rng() * 460, dir: rng() < 0.5 ? 1 : -1, speed: 1.2 + rng() * 0.9,
      phase: rng() * 6, down: 0, flee: 0 };
    ped.pos.set(horiz ? ped.t : line, 0, horiz ? line : ped.t);
    peds.push(ped);
  }

  // ---------- Collision helpers ----------
  function collide(pos, radius) {
    for (let i = 0; i < world.colliders.length; i++) {
      const c = world.colliders[i];
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const ox = c.hw + radius - Math.abs(dx);
      const oz = c.hd + radius - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) pos.x += dx > 0 ? ox : -ox;
        else pos.z += dz > 0 ? oz : -oz;
      }
    }
    const lim = 245;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(258, pos.z));
  }

  function addWanted(n) {
    player.wanted = Math.max(0, Math.min(5, player.wanted + n));
    player.crimeHeat = 6;
  }

  // ---------- Combat ----------
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe27a }));
  muzzle.visible = false;
  scene.add(muzzle);
  let muzzleT = 0;
  const fwd = new THREE.Vector3();
  function shoot() {
    G.AudioSys.shot();
    G.camera.getWorldDirection(fwd);
    const origin = player.pos.clone(); origin.y = 1.5;
    muzzle.position.copy(origin).addScaledVector(fwd, 1.2);
    muzzle.visible = true; muzzleT = 0.06;
    let best = null, bestDist = 42;
    function test(target, radius, kind, ref) {
      const tp = target.clone(); tp.y = 1.1;
      const to = tp.sub(origin);
      const dist = to.length();
      if (dist > bestDist) return;
      to.normalize();
      if (to.dot(fwd) > 0.965 && dist < bestDist) { best = ref; bestDist = dist; }
    }
    peds.forEach(function (p) { if (!p.down) test(p.pos, 0.7, 'ped', { kind: 'ped', ref: p }); });
    cars.forEach(function (c) { if (!c.dead && c !== player.inCar) test(c.pos, 2.4, 'car', { kind: 'car', ref: c }); });
    if (best) {
      if (best.kind === 'ped') { best.ref.down = 8; addWanted(1); G.AudioSys.thud(); }
      else { best.ref.dead = true; best.ref.mesh.rotation.z = 0.35; addWanted(1); G.AudioSys.thud(); }
    } else {
      addWanted(0); // firing alone draws attention only near police; handled in update
      if (player.wanted === 0 && policeNear(60)) addWanted(1);
    }
    peds.forEach(function (p) { if (p.pos.distanceTo(player.pos) < 16) p.flee = 4; });
  }
  function policeNear(d) {
    for (let i = 0; i < police.length; i++) {
      if (police[i].mesh.visible && police[i].pos.distanceTo(player.pos) < d) return true;
    }
    return false;
  }

  G.actors = { player, cars, peds, police, addCar, collide, addWanted, shoot,
    get muzzleT() { return muzzleT; }, set muzzleT(v) { muzzleT = v; }, muzzle };
})();

// game.js (part 3): missions, HUD + minimap, screens, shot scenes, main loop.
(function () {
  'use strict';
  const G = window.VHGame;
  const scene = G.scene, camera = G.camera, world = G.world;
  const state = G.state, A = G.actors;
  const player = A.player, cars = A.cars, peds = A.peds, police = A.police;
  const keys = G.keys;

  const el = function (id) { return document.getElementById(id); };
  const hudCash = el('cash'), hudStars = el('stars'), hudMission = el('mission'),
    hudMsg = el('msg'), hudSpeed = el('speed'), minimap = el('minimap'),
    crosshair = el('crosshair');
  const mm = minimap.getContext('2d');

  // Mission marker: glowing pillar + ring.
  const marker = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  pillar.position.y = 15;
  marker.add(pillar);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
  marker.add(ring);
  marker.visible = false;
  scene.add(marker);

  const MISSIONS = [
    { name: 'Mission 1 — Sunset Delivery', text: 'Get a car and deliver the package to the pier, fast.', target: new THREE.Vector3(114, 0, 226), time: 90, reward: 500, needCar: true },
    { name: 'Mission 2 — Heat Escape', text: 'The harbor patrol is on you! Lose them at the hideout garage.', target: world.garage.clone(), time: 999, reward: 750, escape: true },
    { name: 'Mission 3 — Harbor Run', text: 'Hit all 5 checkpoint gates around the city.', target: null, time: 150, reward: 1200, gates: true }
  ];
  const GATES = [
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(152, 0, -152), new THREE.Vector3(-152, 0, -76),
    new THREE.Vector3(-76, 0, 152), new THREE.Vector3(152, 0, 76)
  ];
  let mission = null; // {def, idx, t, gate}
  let bannerT = 0;

  function showMsg(t, secs) { hudMsg.textContent = t; bannerT = secs || 3; }
  function startMission(idx) {
    if (idx >= MISSIONS.length) { mission = null; marker.visible = false; return; }
    const def = MISSIONS[idx];
    mission = { def, idx, t: def.time, gate: 0 };
    if (def.escape) { A.addWanted(2); if (player.wanted < 2) player.wanted = 2; }
    marker.position.copy(def.gates ? GATES[0] : def.target);
    marker.visible = true;
    hudMission.textContent = def.name + ': ' + def.text;
    showMsg(def.name, 4);
    G.AudioSys.chime();
  }
  function completeMission() {
    const idx = mission.idx;
    G.save.cash += mission.def.reward;
    G.save.mission = idx + 1;
    if (idx === MISSIONS.length - 1) { G.save.done = true; }
    G.persist();
    showMsg('Mission complete! +$' + mission.def.reward, 4);
    G.AudioSys.chime();
    if (mission.def.escape) player.wanted = 0;
    mission = null; marker.visible = false;
    if (idx === MISSIONS.length - 1) { endGame(true); }
    else setTimeout(function () { if (state.mode === 'play') startMission(idx + 1); }, 2500);
  }
  function failMission() {
    showMsg('Mission failed — retrying…', 3);
    const idx = mission.idx;
    mission = null; marker.visible = false;
    setTimeout(function () { if (state.mode === 'play') startMission(idx); }, 2000);
  }

  // ---------- Screens ----------
  function startGame() {
    G.AudioSys.init();
    el('title').style.display = 'none';
    el('end').style.display = 'none';
    state.mode = 'play';
    if (!mission) startMission(Math.min(G.save.mission, MISSIONS.length - 1));
    if (G.save.done) { G.save.mission = 0; }
  }
  function endGame(won) {
    state.mode = 'end';
    el('endTitle').textContent = won ? 'HARBOR LEGEND' : 'BUSTED';
    el('endText').textContent = won
      ? 'You finished the Vice Harbor story chain. Cash earned: $' + G.save.cash
      : 'The harbor patrol got you. Your progress is saved — run it back.';
    el('end').style.display = 'flex';
    G.AudioSys.setEngine(false, 0);
    G.AudioSys.setSiren(false);
  }
  el('startBtn').addEventListener('click', startGame);
  el('againBtn').addEventListener('click', function () {
    player.bust = 0; player.health = 100; player.wanted = 0;
    player.pos.set(-114, 0, 88);
    if (player.inCar) { player.inCar = null; player.mesh.visible = true; }
    startGame();
  });
  window.addEventListener('keydown', function (e) {
    if ((e.code === 'Escape' || e.code === 'KeyP') && (state.mode === 'play' || state.mode === 'pause')) {
      if (state.mode === 'play') { state.mode = 'pause'; el('pause').style.display = 'flex'; }
      else { state.mode = 'play'; el('pause').style.display = 'none'; }
    }
  });

  // ---------- Per-frame updates ----------
  const clock = new THREE.Clock();
  let prevE = false, frames = 0, decayT = 0;

  function updatePlayer(dt) {
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    if (player.inCar) {
      const car = player.inCar;
      const accel = 14, maxF = 26, maxR = 9;
      if (keys.KeyW) car.speed += accel * dt;
      else if (keys.KeyS) car.speed -= accel * 0.8 * dt;
      else car.speed -= car.speed * 0.35 * dt;
      if (keys.Space) car.speed -= car.speed * 2.6 * dt;
      car.speed = Math.max(-maxR, Math.min(maxF, car.speed));
      const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
      if (Math.abs(car.speed) > 0.2) car.heading += steer * dt * 1.5 * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 8);
      if (keys.KeyQ) G.camYaw += dt * 1.8;
      if (keys.KeyE2) { /* reserved */ }
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      const before = car.pos.clone();
      A.collide(car.pos, 1.6);
      if (before.distanceToSquared(car.pos) > 0.001 && Math.abs(car.speed) > 6) { G.AudioSys.thud(); car.speed *= 0.4; }
      car.mesh.rotation.y = car.heading;
      car.mesh.userData.wheels.forEach(function (w) { w.rotation.x += car.speed * dt * 2.4; });
      player.pos.copy(car.pos);
      player.heading = car.heading;
      G.AudioSys.setEngine(true, Math.abs(car.speed) / maxF);
      hudSpeed.textContent = Math.round(Math.abs(car.speed) * 3.6) + ' km/h';
      // Running over a pedestrian is a crime.
      peds.forEach(function (p) {
        if (!p.down && Math.abs(car.speed) > 5 && p.pos.distanceTo(car.pos) < 1.9) {
          p.down = 8; A.addWanted(1); G.AudioSys.thud();
        }
      });
    } else {
      G.AudioSys.setEngine(false, 0);
      hudSpeed.textContent = '';
      let mx = 0, mz = 0;
      if (keys.KeyW) mz += 1;
      if (keys.KeyS) mz -= 1;
      if (keys.KeyA) mx -= 1;
      if (keys.KeyD) mx += 1;
      if (keys.KeyQ) G.camYaw += dt * 1.9;
      if (keys.KeyE) { /* handled as enter/exit below via edge */ }
      const moving = (mx !== 0 || mz !== 0);
      const spd = sprint ? 9.5 : 5.2;
      if (moving) {
        const len = Math.hypot(mx, mz);
        const sin = Math.sin(G.camYaw), cos = Math.cos(G.camYaw);
        const dx = (mx * cos - mz * sin) / len, dz = (-mz * cos - mx * sin) / len;
        player.pos.x += dx * spd * dt;
        player.pos.z += dz * spd * dt;
        player.heading = Math.atan2(dx, dz);
        player.walkPhase += dt * (sprint ? 13 : 9);
      }
      A.collide(player.pos, 0.55);
      player.mesh.position.copy(player.pos);
      player.mesh.rotation.y = player.heading;
      const sw = moving ? Math.sin(player.walkPhase) * 0.5 : 0;
      player.mesh.userData.legL.rotation.x = sw;
      player.mesh.userData.legR.rotation.x = -sw;
      if (G.shootQueued) { G.shootQueued = false; A.shoot(); }
    }
    // Enter / exit car (E edge).
    const eNow = !!keys.KeyE;
    if (eNow && !prevE && state.mode === 'play') {
      if (player.inCar) {
        const car = player.inCar;
        player.inCar = null;
        car.kind = 'parked'; car.driver = false; car.speed = 0;
        player.pos.set(car.pos.x + Math.cos(car.heading) * 2.4, 0, car.pos.z - Math.sin(car.heading) * 2.4);
        player.mesh.visible = true;
        G.AudioSys.setEngine(false, 0);
      } else {
        let best = null, bd = 4.2;
        cars.forEach(function (c) {
          if (c.kind !== 'police' && !c.dead) {
            const d = c.pos.distanceTo(player.pos);
            if (d < bd) { bd = d; best = c; }
          }
        });
        if (best) {
          if (best.kind === 'traffic') { A.addWanted(1); showMsg('Vehicle stolen!', 2); }
          best.kind = 'player';
          player.inCar = best;
          player.mesh.visible = false;
          G.AudioSys.init(); G.AudioSys.blip(520, 0.1, 'square', 0.15);
        }
      }
    }
    prevE = eNow;
  }

  function updateTraffic(dt) {
    cars.forEach(function (c) {
      if (c.kind !== 'traffic' || c.dead) return;
      let slow = 1;
      cars.forEach(function (o) {
        if (o === c || o.dead) return;
        const ahead = c.axis === 'x' ? (o.pos.x - c.pos.x) * c.dir : (o.pos.z - c.pos.z) * c.dir;
        const side = c.axis === 'x' ? Math.abs(o.pos.z - c.pos.z) : Math.abs(o.pos.x - c.pos.x);
        if (ahead > 0 && ahead < 9 && side < 2.2) slow = 0.25;
      });
      c.speed += (c.targetSpeed * slow - c.speed) * Math.min(1, dt * 2);
      if (c.axis === 'x') c.pos.x += c.dir * c.speed * dt;
      else c.pos.z += c.dir * c.speed * dt;
      if (c.pos.x > 250) c.pos.x = -250;
      if (c.pos.x < -250) c.pos.x = 250;
      if (c.pos.z > 250) c.pos.z = -250;
      if (c.pos.z < -250) c.pos.z = 250;
      c.mesh.userData.wheels.forEach(function (w) { w.rotation.x += c.speed * dt * 2.4; });
    });
  }

  function updatePeds(dt) {
    peds.forEach(function (p) {
      if (p.down > 0) {
        p.down -= dt;
        p.mesh.rotation.x = Math.PI / 2;
        p.mesh.position.y = 0.3;
        if (p.down <= 0) { p.mesh.rotation.x = 0; p.mesh.position.y = 0; }
        return;
      }
      let vx = 0, vz = 0;
      if (p.flee > 0) {
        p.flee -= dt;
        const away = p.pos.clone().sub(player.pos).normalize();
        vx = away.x * 4.4; vz = away.z * 4.4;
      } else if (p.axis === 'x') { vx = p.dir * p.speed; }
      else { vz = p.dir * p.speed; }
      p.pos.x += vx * dt; p.pos.z += vz * dt;
      if (p.pos.x > 245) { p.pos.x = 245; p.dir = -1; }
      if (p.pos.x < -245) { p.pos.x = -245; p.dir = 1; }
      if (p.pos.z > 245) { p.pos.z = 245; p.dir = -1; }
      if (p.pos.z < -245) { p.pos.z = -245; p.dir = 1; }
      p.phase += dt * 7;
      p.mesh.rotation.y = Math.atan2(vx, vz);
      p.mesh.userData.legL.rotation.x = Math.sin(p.phase) * 0.45;
      p.mesh.userData.legR.rotation.x = -Math.sin(p.phase) * 0.45;
    });
  }

  function updatePolice(dt) {
    const active = Math.floor(player.wanted);
    let anyNear = false;
    police.forEach(function (c, i) {
      if (i < active) {
        if (!c.mesh.visible) {
          c.mesh.visible = true;
          const a = rng() * Math.PI * 2;
          c.pos.set(player.pos.x + Math.cos(a) * 55, 0, player.pos.z + Math.sin(a) * 55);
          c.speed = 0;
        }
        const to = player.pos.clone().sub(c.pos);
        const dist = to.length();
        if (dist < 30) anyNear = true;
        const targetHeading = Math.atan2(to.x, to.z);
        let dh = targetHeading - c.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        c.heading += Math.max(-1.7 * dt, Math.min(1.7 * dt, dh));
        const top = 13 + player.wanted * 1.6;
        c.speed += ((dist > 6 ? top : top * 0.3) - c.speed) * Math.min(1, dt * 1.6);
        c.pos.x += Math.sin(c.heading) * c.speed * dt;
        c.pos.z += Math.cos(c.heading) * c.speed * dt;
        A.collide(c.pos, 1.6);
        c.mesh.rotation.y = c.heading;
        if (c.mesh.userData.lightBar) {
          c.mesh.userData.lightBar.material.color.setHex(Math.floor(performance.now() / 300) % 2 ? 0xff4444 : 0x4488ff);
        }
        c.mesh.userData.wheels.forEach(function (w) { w.rotation.x += c.speed * dt * 2.4; });
        // Bust pressure on foot.
        if (!player.inCar && dist < 4) {
          player.bust += dt / 2.2;
          if (player.bust >= 1) { endGame(false); }
        }
      } else if (c.mesh.visible) {
        c.mesh.visible = false;
        c.pos.set(400, 0, 400);
        c.speed = 0;
      }
    });
    if (player.inCar || !anyNear) player.bust = Math.max(0, player.bust - dt * 0.25);
    G.AudioSys.setSiren(active > 0 && anyNear);
    // Wanted decay.
    if (player.crimeHeat > 0) player.crimeHeat -= dt;
    else if (player.wanted > 0) {
      decayT += dt;
      if (decayT > 9 && !anyNear) { player.wanted -= 1; decayT = 0; if (mission && mission.def.escape) { /* escape mission needs the garage */ } }
    }
  }

  function updateMission(dt) {
    if (!mission) return;
    mission.t -= dt;
    if (mission.def.time < 900 && mission.t <= 0) { failMission(); return; }
    const target = mission.def.gates ? GATES[mission.gate] : mission.def.target;
    marker.position.copy(target);
    ring.rotation.z += dt * 1.5;
    const dist = player.pos.distanceTo(target);
    if (mission.def.needCar && dist < 7 && player.inCar) completeMission();
    else if (mission.def.escape && dist < 13) completeMission();
    else if (mission.def.gates && dist < 8) {
      mission.gate++;
      G.AudioSys.chime();
      if (mission.gate >= GATES.length) completeMission();
      else { marker.position.copy(GATES[mission.gate]); showMsg('Gate ' + mission.gate + ' / ' + GATES.length, 2); }
    }
    const t = mission.def.time < 900 ? ' · ' + Math.max(0, Math.ceil(mission.t)) + 's' : '';
    hudMission.textContent = mission.def.name + ': ' + mission.def.text + t +
      ' · ' + Math.round(dist) + 'm';
  }

  function drawMinimap() {
    const S = 160, half = 250;
    mm.fillStyle = '#1c2733';
    mm.fillRect(0, 0, S, S);
    mm.fillStyle = '#1d6f9f';
    mm.fillRect(0, S * (200 + half) / (half * 2), S, S);
    mm.strokeStyle = '#4a5568';
    mm.lineWidth = 3;
    for (let i = -3; i <= 3; i++) {
      const p = (i * world.step + half) / (half * 2) * S;
      mm.beginPath(); mm.moveTo(p, 0); mm.lineTo(p, S); mm.stroke();
      mm.beginPath(); mm.moveTo(0, p); mm.lineTo(S, p); mm.stroke();
    }
    function dot(x, z, color, r) {
      mm.fillStyle = color;
      mm.beginPath();
      mm.arc((x + half) / (half * 2) * S, (z + half) / (half * 2) * S, r, 0, 6.3);
      mm.fill();
    }
    cars.forEach(function (c) { if (c.kind === 'traffic') dot(c.pos.x, c.pos.z, '#9aa5b1', 1.6); });
    police.forEach(function (c) { if (c.mesh.visible) dot(c.pos.x, c.pos.z, '#ff4444', 2.6); });
    if (marker.visible) dot(marker.position.x, marker.position.z, '#ffd23e', 3.4);
    dot(player.pos.x, player.pos.z, '#ffffff', 3);
  }

  function updateCamera(dt) {
    let targetPos, lookAt;
    if (state.mode === 'title' || (G.SHOT === 'cover')) {
      const t = performance.now() * 0.00005;
      targetPos = new THREE.Vector3(Math.cos(t) * 120, 34, 190 + Math.sin(t) * 30);
      lookAt = new THREE.Vector3(0, 18, -40);
    } else if (player.inCar) {
      const back = 10.5, h = 4.2;
      targetPos = new THREE.Vector3(
        player.pos.x - Math.sin(player.heading) * back,
        h,
        player.pos.z - Math.cos(player.heading) * back);
      lookAt = player.pos.clone(); lookAt.y = 1.4;
    } else {
      const back = 8.5;
      targetPos = new THREE.Vector3(
        player.pos.x - Math.sin(G.camYaw) * back * Math.cos(G.camPitch),
        2 + Math.sin(G.camPitch) * back,
        player.pos.z - Math.cos(G.camYaw) * back * Math.cos(G.camPitch));
      lookAt = player.pos.clone(); lookAt.y = 1.6;
    }
    camera.position.lerp(targetPos, state.mode === 'title' ? 1 : Math.min(1, dt * 6));
    camera.lookAt(lookAt);
  }

  function updateHUD() {
    hudCash.textContent = '$' + G.save.cash;
    let s = '';
    for (let i = 0; i < 5; i++) s += i < player.wanted ? '★' : '☆';
    hudStars.textContent = s;
    hudStars.style.color = player.wanted > 0 ? '#ffd23e' : '#666';
    crosshair.style.display = (state.mode === 'play' && !player.inCar) ? 'block' : 'none';
    if (bannerT > 0) { bannerT -= 1 / 60; if (bannerT <= 0) hudMsg.textContent = ''; }
  }

  // ---------- Deterministic shot scenes ----------
  function setupShot() {
    const shot = G.SHOT;
    if (!shot) return;
    el('title').style.display = shot === 'cover' ? 'flex' : 'none';
    state.mode = shot === 'cover' ? 'title' : 'play';
    if (shot === 'cover') return;
    startMission(0);
    if (shot === 'drive' || shot === 'chase') {
      let best = null, bd = 1e9;
      cars.forEach(function (c) {
        if (c.kind === 'parked') { const d = c.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = c; } }
      });
      if (best) {
        best.pos.set(-76, 0, 3.4);
        best.heading = Math.PI / 2;
        best.mesh.position.copy(best.pos);
        best.mesh.rotation.y = best.heading;
        best.kind = 'player';
        best.speed = 12;
        player.inCar = best;
        player.mesh.visible = false;
        player.pos.copy(best.pos);
        player.heading = best.heading;
      }
      if (shot === 'chase') {
        player.wanted = 3;
        police.forEach(function (c, i) {
          if (i < 3) {
            c.mesh.visible = true;
            c.pos.set(-76 - 12 - i * 9, 0, 3.4 + (i - 1) * 4.5);
            c.heading = Math.PI / 2;
            c.mesh.position.copy(c.pos);
            c.mesh.rotation.y = c.heading;
            c.speed = 11;
          }
        });
      }
    }
    if (shot === 'mission') {
      player.pos.set(-100, 0, 96);
      player.mesh.position.copy(player.pos);
      G.camYaw = -2.2;
    }
  }
  setupShot();

  // ---------- Main loop ----------
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    if (state.mode === 'play') {
      updatePlayer(dt);
      updateTraffic(dt);
      updatePeds(dt);
      updatePolice(dt);
      updateMission(dt);
    } else if (state.mode === 'title') {
      updateTraffic(dt);
      updatePeds(dt);
    }
    if (A.muzzleT > 0) { A.muzzleT -= dt; if (A.muzzleT <= 0) A.muzzle.visible = false; }
    world.ocean.position.y = 0.02 + Math.sin(performance.now() * 0.0012) * 0.05;
    updateCamera(dt);
    if (state.mode !== 'title') drawMinimap();
    updateHUD();
    G.renderer.render(scene, camera);
    frames++;
    if (G.SHOT && frames === 50) window.__vhReady = true;
  }
  frame();
})();
