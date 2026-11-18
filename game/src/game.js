// Vice Harbor — the game itself: boot, the frame loop, and every system that turns
// the city into a place with consequences. On foot or behind a wheel, the loop is the
// same: read input, advance the world, keep the law interested in proportion to the
// trouble caused, and paint the HUD the player actually needs.
(function () {
  'use strict';
  const U = window.VH.util;
  const A = window.VH.actors;
  const params = U.readParams();
  const rng = U.makeRng(params.seed * 7919 + 13);
  const shotMode = params.shot || '';

  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  const city = window.VH.city.build(scene, rng);
  const traffic = A.spawnTraffic(scene, rng, 15);
  const parked = A.spawnParked(scene, rng, 16, city);
  const allCars = traffic.concat(parked);
  const peds = A.spawnPeds(scene, rng, 26);
  const police = [];

  const playerMesh = A.makePlayerMesh();
  scene.add(playerMesh);

  // ---- persistent save ------------------------------------------------------
  const SAVE_KEY = 'vice-harbor-save-v1';
  let save = { cash: 120, mission: 0 };
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed.cash === 'number') save = parsed; }
  } catch (e) { /* private mode: play unsaved */ }
  function persist() {
    save.cash = Math.round(player.cash); save.mission = missionIndex;
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  // ---- player + run state ---------------------------------------------------
  const player = {
    x: -8, z: 128, heading: Math.PI, health: 100, cash: 120,
    wanted: 0, inCar: null, speed: 0, bust: 0, dead: 0, walkPhase: 0,
  };
  let state = 'title'; // title | play | pause | over
  let camYaw = Math.PI, camDist = 7;
  let heatCooldown = 0; // seconds of good behaviour before a star fades
  let shotCooldown = 0;
  let dangerPoint = null, dangerTime = 0;
  let messageTimer = 0;

  // ---- missions ---------------------------------------------------------------
  // A short chained story: Rosa needs a package moved, then the law needs losing,
  // then the harbour gates need running before the ferry leaves.
  const MISSIONS = [
    {
      title: 'M1 · Hot Delivery',
      brief: 'Rosa at Cafe Sol is waiting. Take any car and reach the gold marker in 75 seconds.',
      needCar: true, time: 75, pay: 250, target: { x: 120, z: 57 },
      done: 'Package delivered. Rosa tips well.',
    },
    {
      title: 'M2 · Lose the Heat',
      brief: 'The delivery was watched. You are at 2 stars — reach the Hideout garage before time runs out.',
      needCar: false, time: 90, pay: 300, target: { x: city.hideout.x + 14, z: city.hideout.z - 10 },
      setWanted: 2, done: 'Heat lost in the garage shadows.',
    },
    {
      title: 'M3 · Harbour Gates',
      brief: 'Run all 5 harbour gates in order before the ferry leaves. Any car, any route.',
      needCar: true, time: 110, pay: 500, gates: [
        { x: 60, z: -57 }, { x: 120, z: 3 }, { x: 57, z: 120 }, { x: -3, z: 63 }, { x: -60, z: -3 },
      ],
      done: 'All gates cleared. The harbour is yours.',
    },
  ];
  let missionIndex = 0;
  let mission = null; // {def, timeLeft, gate}
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 26, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  marker.visible = false; scene.add(marker);

  function startMission(idx) {
    if (idx >= MISSIONS.length) { mission = null; setObjective('Free roam — the city is open. Steal, cruise, cause no paperwork.'); marker.visible = false; return; }
    const def = MISSIONS[idx];
    mission = { def, timeLeft: def.time, gate: 0 };
    if (def.setWanted) setWanted(Math.max(player.wanted, def.setWanted));
    const t = currentTarget();
    marker.position.set(t.x, 13, t.z); marker.visible = true;
    setObjective(def.title + ' — ' + def.brief);
    showMessage(def.title, def.brief);
    window.VH.audio.click();
  }
  function currentTarget() {
    if (!mission) return null;
    return mission.def.gates ? mission.def.gates[mission.gate] : mission.def.target;
  }
  function completeMission() {
    const def = mission.def;
    player.cash += def.pay;
    showMessage('Mission complete', def.done + '  +$' + def.pay);
    window.VH.audio.cash();
    missionIndex += 1; mission = null; persist();
    setTimeout(() => { if (state === 'play') startMission(missionIndex); }, 2600);
  }
  function failMission(reason) {
    showMessage('Mission failed', reason + ' — the job restarts.');
    window.VH.audio.fail();
    const idx = missionIndex; mission = null;
    setTimeout(() => { if (state === 'play') startMission(idx); }, 2200);
  }

  // ---- wanted + police ---------------------------------------------------------
  function setWanted(n) { player.wanted = U.clamp(Math.round(n), 0, 5); heatCooldown = 0; }
  function addWanted(n) { setWanted(player.wanted + n); }

  function spawnPolice() {
    const car = A.makeCar(scene, rng, 0, 0xffffff, true);
    car.mode = 'police'; car.health = 80;
    const ang = rng() * Math.PI * 2;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    car.x = U.clamp(px + Math.sin(ang) * 55, -160, 165);
    car.z = U.clamp(pz + Math.cos(ang) * 55, -160, 160);
    if (city.hitsBuilding(car.x, car.z, 2)) { car.x = px + 40; car.z = pz; }
    car.sync(); police.push(car); allCars.push(car);
  }
  function updatePolice(dt) {
    const wantCount = player.wanted === 0 ? 0 : Math.min(2 + player.wanted, 7);
    if (police.length < wantCount && state === 'play') spawnPolice();
    if (player.wanted === 0 && police.length) {
      for (const c of police) { scene.remove(c.mesh); }
      police.length = 0;
    }
    const tx = player.inCar ? player.inCar.x : player.x;
    const tz = player.inCar ? player.inCar.z : player.z;
    let nearest = 999;
    for (const cop of police) {
      if (cop.health <= 0) { cop.speed = Math.max(0, cop.speed - 20 * dt); cop.sync(); continue; }
      const d = U.dist2(cop.x, cop.z, tx, tz);
      nearest = Math.min(nearest, d);
      const want = Math.atan2(tx - cop.x, tz - cop.z);
      cop.heading = U.angleLerp(cop.heading, want, Math.min(1, dt * 2.2));
      const top = player.inCar ? 21 : 15;
      cop.speed += U.clamp((d > 9 ? top : 4) - cop.speed, -22 * dt, 10 * dt);
      cop.x += Math.sin(cop.heading) * cop.speed * dt;
      cop.z += Math.cos(cop.heading) * cop.speed * dt;
      const fixed = city.resolve(cop.x, cop.z, 1.3);
      if (fixed.x !== cop.x || fixed.z !== cop.z) cop.speed *= 0.4;
      cop.x = U.clamp(fixed.x, -168, 172); cop.z = U.clamp(fixed.z, -165, 165);
      cop.sync();
      // Return fire once things are serious.
      if (player.wanted >= 3 && d < 34 && Math.random() < dt * 0.55) {
        damagePlayer(3 + Math.random() * 4);
        flashAt(cop.x, cop.z);
      }
    }
    // Busted: a close officer and a slow, on-foot player.
    if (!player.inCar && nearest < 4.2 && Math.abs(player.speed) < 1.2 && player.wanted > 0) {
      player.bust += dt;
      if (player.bust > 1.6) endRun('BUSTED');
    } else player.bust = Math.max(0, player.bust - dt * 2);
    // Stars fade after a clean stretch with no officer close.
    if (player.wanted > 0 && nearest > 30) {
      heatCooldown += dt;
      const locked = mission && mission.def.setWanted && player.wanted <= mission.def.setWanted;
      if (heatCooldown > 14 && !locked) { setWanted(player.wanted - 1); heatCooldown = 0; }
    } else heatCooldown = 0;
    window.VH.audio.setSiren(player.wanted > 0 && police.length > 0, dt);
  }

  // ---- combat + damage -----------------------------------------------------------
  const flashGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe28a });
  function flashAt(x, z) {
    const m = new THREE.Mesh(flashGeo, flashMat);
    m.position.set(x, 1.4, z); scene.add(m);
    setTimeout(() => scene.remove(m), 60);
  }
  function damagePlayer(n) {
    if (state !== 'play' || player.dead > 0) return;
    player.health -= n;
    window.VH.audio.hurt();
    if (player.health <= 0) { player.health = 0; endRun('WASTED'); }
  }
  function shoot() {
    if (shotCooldown > 0 || player.inCar || state !== 'play') return;
    shotCooldown = 0.28;
    window.VH.audio.shot();
    playerMesh.userData.gun.visible = true;
    setTimeout(() => { playerMesh.userData.gun.visible = false; }, 90);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    flashAt(player.x + fx * 0.8, player.z + fz * 0.8);
    dangerPoint = { x: player.x, z: player.z }; dangerTime = 1.2;
    let best = null, bestD = 42;
    function consider(x, z, obj, kind) {
      const dx = x - player.x, dz = z - player.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > bestD || d < 0.5) return;
      const dot = (dx * fx + dz * fz) / d;
      if (dot > 0.86) { best = { obj, kind }; bestD = d; }
    }
    for (const p of peds) if (p.alive) consider(p.x, p.z, p, 'ped');
    for (const c of allCars) consider(c.x, c.z, c, 'car');
    if (best) {
      if (best.kind === 'ped') {
        best.obj.health -= 30;
        if (best.obj.health <= 0) { best.obj.alive = false; best.obj.mesh.rotation.x = Math.PI / 2; best.obj.mesh.position.y = 0.3; addWanted(2); }
        else best.obj.flee = 2;
      } else {
        best.obj.health -= 25;
        if (best.obj.isPolice) addWanted(1);
        if (best.obj.health <= 0 && best.obj.mode === 'traffic') best.obj.mode = 'parked';
      }
      addWanted(0); // noise alone does not add a star; the hits above do
    }
  }

  // ---- run end / respawn ---------------------------------------------------------
  function endRun(kind) {
    if (player.dead > 0) return;
    player.dead = 2.4;
    state = 'over';
    const fine = Math.min(player.cash, 50 + player.wanted * 25);
    player.cash -= fine;
    showBig(kind, kind === 'BUSTED' ? 'The harbour police walk you to the station. Fine: $' + fine : 'You wake up outside the clinic. Bill: $' + fine);
    window.VH.audio.fail();
    window.VH.audio.setEngine(false, 0); window.VH.audio.setSiren(false, 0);
    setTimeout(() => {
      player.x = city.hideout.x + 14; player.z = city.hideout.z - 10;
      player.health = 100; player.inCar = null; playerMesh.visible = true;
      setWanted(0); player.dead = 0; state = 'play';
      hideBig(); persist();
      if (mission && mission.def.setWanted) setWanted(mission.def.setWanted);
    }, 2400);
  }

  // ---- input ----------------------------------------------------------------------
  const keys = {};
  let dragging = false, lastMX = 0;
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    window.VH.audio.unlock();
    if ((e.code === 'Escape' || e.code === 'KeyP') && (state === 'play' || state === 'pause')) togglePause();
    if (e.code === 'KeyE' && state === 'play') toggleCar();
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  canvas.addEventListener('pointerdown', (e) => {
    window.VH.audio.unlock();
    dragging = true; lastMX = e.clientX;
    if (state === 'play' && !player.inCar) shoot();
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    camYaw -= (e.clientX - lastMX) * 0.005; lastMX = e.clientX;
  });

  function togglePause() {
    if (state === 'play') { state = 'pause'; persist(); showScreen('pause'); }
    else if (state === 'pause') { state = 'play'; showScreen(''); }
  }
  function nearestCar(maxD) {
    let best = null, bd = maxD;
    for (const c of allCars) {
      if (c.mode === 'police' || c.health <= 0) continue;
      const d = U.dist2(player.x, player.z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function toggleCar() {
    if (player.inCar) {
      const car = player.inCar;
      player.x = car.x + Math.cos(car.heading) * 2.2; player.z = car.z - Math.sin(car.heading) * 2.2;
      car.mode = 'parked'; car.speed = 0; player.inCar = null;
      playerMesh.visible = true;
      window.VH.audio.door(); window.VH.audio.setEngine(false, 0);
    } else {
      const car = nearestCar(3.6);
      if (!car) return;
      const wasParked = car.mode === 'parked';
      player.inCar = car; car.mode = 'player';
      playerMesh.visible = false;
      window.VH.audio.door();
      if (wasParked || car.wasStolen) { /* quiet entry */ }
      if (!car.countedTheft) { car.countedTheft = true; addWanted(1); showMessage('Car taken', 'That was not yours. The harbour notices.'); }
    }
  }

  // ---- per-frame updates -------------------------------------------------------------
  function updatePlayer(dt) {
    // Orbit keys: Q swings the camera one way; E swings it back, unless E is busy
    // being the car key (in a car, or standing close enough to steal one).
    if (keys['KeyQ']) camYaw += dt * 1.9;
    if (keys['KeyE'] && !player.inCar && !nearestCar(3.6)) camYaw -= dt * 1.9;
    if (player.inCar) { updateDriving(dt); player.speed = player.inCar.speed; return; }
    let mx = 0, mz = 0;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = fz, rz = -fx;
    if (keys['KeyW'] || keys['ArrowUp']) { mx += fx; mz += fz; }
    if (keys['KeyS'] || keys['ArrowDown']) { mx -= fx; mz -= fz; }
    if (keys['KeyA'] || keys['ArrowLeft']) { mx -= rx; mz -= rz; }
    if (keys['KeyD'] || keys['ArrowRight']) { mx += rx; mz += rz; }
    const len = Math.sqrt(mx * mx + mz * mz) || 1;
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const spd = sprint ? 9.5 : 5.6;
    const moving = (mx !== 0 || mz !== 0);
    player.speed = moving ? spd : 0;
    if (moving) {
      player.x += (mx / len) * spd * dt; player.z += (mz / len) * spd * dt;
      player.heading = U.angleLerp(player.heading, Math.atan2(mx, mz), Math.min(1, dt * 10));
      player.walkPhase += dt * (sprint ? 11 : 8);
    }
    const fixed = city.resolve(player.x, player.z, 0.5);
    player.x = U.clamp(fixed.x, -170, 176); player.z = U.clamp(fixed.z, -166, 166);
    playerMesh.position.set(player.x, moving ? Math.abs(Math.sin(player.walkPhase)) * 0.08 : 0, player.z);
    playerMesh.rotation.y = player.heading;
  }

  function updateDriving(dt) {
    const car = player.inCar;
    const accel = 16, topF = 30, topR = -10;
    if (keys['KeyW'] || keys['ArrowUp']) car.speed += accel * dt;
    else if (keys['KeyS'] || keys['ArrowDown']) car.speed -= (car.speed > 0.5 ? 22 : 9) * dt;
    else car.speed -= U.clamp(car.speed, -3 * dt, 3 * dt) * 1; // gentle roll-off
    if (keys['Space']) car.speed -= U.clamp(car.speed, -26 * dt, 26 * dt);
    car.speed = U.clamp(car.speed, topR, topF);
    let steer = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) steer += 1;
    if (keys['KeyD'] || keys['ArrowRight']) steer -= 1;
    if (keys['KeyQ']) steer += 0.6;
    if (steer !== 0 && Math.abs(car.speed) > 0.4) {
      const grip = keys['Space'] ? 1.7 : 1.05;
      car.heading += steer * grip * dt * U.clamp(Math.abs(car.speed) / 9, 0.3, 1.4) * (car.speed < 0 ? -1 : 1);
    }
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const fixed = city.resolve(car.x, car.z, 1.4);
    if ((fixed.x !== car.x || fixed.z !== car.z) && Math.abs(car.speed) > 8) window.VH.audio.hurt();
    if (fixed.x !== car.x || fixed.z !== car.z) car.speed *= 0.35;
    car.x = U.clamp(fixed.x, -170, 176); car.z = U.clamp(fixed.z, -166, 166);
    // Running someone down is loud, messy and very illegal.
    for (const p of peds) {
      if (p.alive && Math.abs(car.speed) > 4 && U.dist2(car.x, car.z, p.x, p.z) < 1.8) {
        p.alive = false; p.mesh.rotation.x = Math.PI / 2; p.mesh.position.y = 0.3;
        addWanted(1); damagePlayer(0); showMessage('Pedestrian down', 'That will be in the report.');
      }
    }
    for (const other of allCars) {
      if (other !== car && other.mode !== 'player' && U.dist2(car.x, car.z, other.x, other.z) < 3.1 && Math.abs(car.speed) > 3) {
        car.speed *= -0.25; other.health -= 8;
      }
    }
    car.sync();
    window.VH.audio.setEngine(true, car.speed / topF);
    // Chase camera settles behind the car: camera forward matches the car's nose.
    camYaw = U.angleLerp(camYaw, car.heading, Math.min(1, dt * 3.2));
  }

  function updateMission(dt) {
    if (!mission || state !== 'play') return;
    mission.timeLeft -= dt;
    const t = currentTarget();
    if (t) {
      marker.position.set(t.x, 13 + Math.sin(perf * 2.2) * 0.7, t.z);
      const px = player.inCar ? player.inCar.x : player.x;
      const pz = player.inCar ? player.inCar.z : player.z;
      const inVehicle = !mission.def.needCar || !!player.inCar;
      if (U.dist2(px, pz, t.x, t.z) < 5.5 && inVehicle) {
        if (mission.def.gates && mission.gate < mission.def.gates.length - 1) {
          mission.gate += 1; window.VH.audio.cash();
          showMessage('Gate ' + mission.gate + ' of ' + mission.def.gates.length, 'Keep moving.');
          const nt = currentTarget(); marker.position.set(nt.x, 13, nt.z);
        } else completeMission();
        return;
      }
    }
    if (mission.timeLeft <= 0) failMission('Out of time');
  }

  function updateCamera(dt) {
    const focus = player.inCar || player;
    const fx = focus.x, fz = focus.z;
    const dist = player.inCar ? 10.5 : camDist;
    const height = player.inCar ? 4.2 : 3.1;
    const bx = fx - Math.sin(camYaw) * dist;
    const bz = fz - Math.cos(camYaw) * dist;
    camera.position.set(bx, height, bz);
    camera.lookAt(fx, 1.4, fz);
  }

  // ---- HUD ----------------------------------------------------------------------------
  const el = (id) => document.getElementById(id);
  const hud = {
    cash: el('hud-cash'), health: el('hud-health-fill'), stars: el('hud-stars'),
    objective: el('hud-objective'), speed: el('hud-speed'), timer: el('hud-timer'),
    prompt: el('hud-prompt'), msgTitle: el('msg-title'), msgBody: el('msg-body'), msg: el('msg'),
    big: el('big'), bigTitle: el('big-title'), bigBody: el('big-body'),
  };
  function setObjective(text) { hud.objective.textContent = text; }
  function showMessage(title, body) {
    hud.msgTitle.textContent = title; hud.msgBody.textContent = body;
    hud.msg.style.opacity = '1'; messageTimer = 3.4;
  }
  function showBig(title, body) { hud.bigTitle.textContent = title; hud.bigBody.textContent = body; hud.big.style.display = 'flex'; }
  function hideBig() { hud.big.style.display = 'none'; }
  function showScreen(name) {
    for (const id of ['screen-title', 'screen-pause', 'screen-how']) {
      el(id).style.display = 'none';
    }
    if (name === 'title') el('screen-title').style.display = 'flex';
    if (name === 'pause') el('screen-pause').style.display = 'flex';
    if (name === 'how') el('screen-how').style.display = 'flex';
    el('hud').style.display = (name === '' || name === 'pause') && state !== 'title' ? 'block' : (state === 'title' ? 'none' : 'block');
    if (state === 'title') el('hud').style.display = 'none'; else if (name === '') el('hud').style.display = 'block';
  }
  function refreshHud() {
    hud.cash.textContent = '$' + Math.round(player.cash);
    hud.health.style.width = U.clamp(player.health, 0, 100) + '%';
    hud.health.style.background = player.health < 30 ? '#e5534b' : '#53d769';
    hud.stars.textContent = '★★★★★'.slice(0, player.wanted) + '☆☆☆☆☆'.slice(0, 5 - player.wanted);
    hud.stars.style.color = player.wanted ? '#ffd23e' : '#5a6270';
    if (player.inCar) {
      hud.speed.style.display = 'block';
      hud.speed.textContent = Math.round(Math.abs(player.inCar.speed) * 3.6) + ' km/h';
    } else hud.speed.style.display = 'none';
    if (mission) {
      hud.timer.style.display = 'block';
      const gateNote = mission.def.gates ? ' · Gate ' + (mission.gate + 1) + '/5' : '';
      hud.timer.textContent = mission.def.title + ' · ' + Math.max(0, Math.ceil(mission.timeLeft)) + 's' + gateNote;
      hud.timer.style.color = mission.timeLeft < 15 ? '#ff6b5e' : '#fff';
    } else hud.timer.style.display = 'none';
    const near = !player.inCar && nearestCar(3.6);
    hud.prompt.style.display = near ? 'block' : (player.inCar ? 'block' : 'none');
    hud.prompt.textContent = player.inCar ? 'E — get out' : (near ? 'E — steal this car' : '');
    if (player.bust > 0.15) { hud.prompt.style.display = 'block'; hud.prompt.textContent = 'BUSTED in ' + (1.6 - player.bust).toFixed(1) + 's — RUN'; }
  }

  // ---- minimap ---------------------------------------------------------------------------
  const mapCtx = el('minimap').getContext('2d');
  function drawMinimap() {
    const S = 180, half = 90, scale = S / 440;
    mapCtx.fillStyle = '#20242e'; mapCtx.fillRect(0, 0, S, S);
    mapCtx.strokeStyle = '#4a5265'; mapCtx.lineWidth = 5;
    for (const r of window.VH.city.ROADS) {
      mapCtx.beginPath(); mapCtx.moveTo((r + 220) * scale, 0); mapCtx.lineTo((r + 220) * scale, S); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(0, (r + 220) * scale); mapCtx.lineTo(S, (r + 220) * scale); mapCtx.stroke();
    }
    mapCtx.fillStyle = '#1d6f8e'; mapCtx.fillRect((396) * scale, 0, S, S);
    function blip(x, z, color, size) {
      mapCtx.fillStyle = color;
      mapCtx.fillRect((x + 220) * scale - size / 2, (z + 220) * scale - size / 2, size, size);
    }
    const t = currentTarget();
    if (t && mission) blip(t.x, t.z, '#ffd23e', 8);
    blip(city.hideout.x, city.hideout.z, '#7dff6a', 6);
    for (const c of police) blip(c.x, c.z, '#4f9dff', 5);
    const fx = player.inCar ? player.inCar.x : player.x;
    const fz = player.inCar ? player.inCar.z : player.z;
    blip(fx, fz, '#ffffff', 7);
    mapCtx.strokeStyle = 'rgba(255,255,255,0.25)'; mapCtx.lineWidth = 1;
    mapCtx.strokeRect(0.5, 0.5, S - 1, S - 1);
    void half;
  }

  // ---- title / buttons ----------------------------------------------------------------------
  function beginPlay(fresh) {
    if (fresh) { player.cash = 120; missionIndex = 0; }
    else { player.cash = save.cash; missionIndex = U.clamp(save.mission || 0, 0, MISSIONS.length); }
    state = 'play'; showScreen('');
    startMission(missionIndex);
    window.VH.audio.unlock(); window.VH.audio.click();
  }
  el('btn-play').addEventListener('click', () => beginPlay(true));
  el('btn-continue').addEventListener('click', () => beginPlay(false));
  el('btn-how').addEventListener('click', () => { showScreen('how'); window.VH.audio.click(); });
  el('btn-how-back').addEventListener('click', () => { showScreen('title'); });
  el('btn-resume').addEventListener('click', () => togglePause());
  el('btn-quit').addEventListener('click', () => { state = 'title'; showScreen('title'); persist(); });
  if (!window.localStorage.getItem(SAVE_KEY)) el('btn-continue').style.opacity = '0.45';

  // ---- deterministic screenshot staging --------------------------------------------------------
  function stageShot(name) {
    state = 'play'; showScreen('');
    if (name === 'start') {
      state = 'title'; showScreen('title');
      camera.position.set(-4, 3.4, 96); camera.lookAt(30, 7, 40);
      player.x = 4; player.z = 118; playerMesh.position.set(player.x, 0, player.z);
      return 'fixed';
    }
    if (name === 'play') {
      // The drive shot: cruising the palm boulevard at golden hour, first job live.
      const car = parked[1] || parked[0] || traffic[0];
      car.mode = 'player'; car.x = -3; car.z = 96; car.heading = Math.PI; car.speed = 13;
      player.inCar = car; playerMesh.visible = false; car.sync();
      camYaw = Math.PI;
      startMission(0);
      return 'cam';
    }
    if (name === 'chase' || name === 'mission') {
      const car = parked[0] || traffic[0];
      car.mode = 'player'; car.x = 3; car.z = 40; car.heading = Math.PI; car.speed = 14;
      player.inCar = car; playerMesh.visible = false; car.sync();
      camYaw = Math.PI; // behind the northbound car, looking down the boulevard
      if (name === 'chase') {
        setWanted(3);
        for (let i = 0; i < 2; i++) {
          const cop = A.makeCar(scene, rng, 0, 0xffffff, true);
          cop.mode = 'police'; cop.health = 80;
          cop.x = 3 + (i === 0 ? -3.4 : 3.2); cop.z = 40 + 5.5 + i * 3.5;
          cop.heading = Math.PI; cop.speed = 14; cop.sync();
          police.push(cop); allCars.push(cop);
        }
        setObjective('Lose the heat — or do not. The harbour is watching.');
        showMessage('WANTED', 'Three stars. Every unit in the harbour is rolling.');
      } else {
        // Stage the run a straight boulevard away from gate one, so the gold
        // marker reads clearly down the road ahead of the car.
        car.x = 57; car.z = -14; car.sync();
        missionIndex = 2; startMission(2);
        const t = currentTarget();
        marker.position.set(t.x, 13, t.z);
      }
      return 'cam';
    }
    return 'cam';
  }

  // ---- main loop ----------------------------------------------------------------------------------
  let last = performance.now(), perf = 0, shotFrames = 0;
  const staged = shotMode ? stageShot(shotMode) : null;
  if (!shotMode) showScreen('title');

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now; perf += dt;
    if (shotMode) dt = 0.016;
    const running = state === 'play' || !!shotMode;
    if (running && state !== 'title') {
      shotCooldown = Math.max(0, shotCooldown - dt);
      if (dangerTime > 0) { dangerTime -= dt; if (dangerTime <= 0) dangerPoint = null; }
      updatePlayer(dt);
      A.updateTraffic(traffic, dt, city);
      A.updatePeds(peds, dt, rng, dangerPoint, city);
      if (!shotMode || shotMode === 'chase') updatePolice(dt);
      updateMission(dt);
      if (messageTimer > 0) { messageTimer -= dt; if (messageTimer <= 0) hud.msg.style.opacity = '0'; }
      if (city.sea) city.sea.position.y = 0.25 + Math.sin(perf * 0.8) * 0.05;
      marker.rotation.y += dt * 0.8;
    }
    if (shotMode && staged === 'fixed') { /* camera already placed */ }
    else updateCamera(dt);
    if (shotMode === 'start') { camera.position.set(-4, 3.4, 96); camera.lookAt(30, 7, 40); }
    refreshHud(); drawMinimap();
    renderer.render(scene, camera);
    if (shotMode && ++shotFrames > 12) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
})();
