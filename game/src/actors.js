// Vice Harbor — the cast: car and pedestrian factories plus the simple brains that
// move traffic around the grid and make crowds stroll (or run for their lives).
(function () {
  'use strict';
  const U = window.VH.util;
  const ROADS = window.VH.city.ROADS;

  const CAR_COLORS = [0xd94f3d, 0x3d7bd9, 0xe8c95a, 0x53b06a, 0xe8e4da, 0x8a5fd0, 0x3fbfae, 0x2c2f36];

  function makeCarMesh(style, color, isPolice) {
    const grp = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f2f2 : color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c2129 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });
    const dims = [
      { len: 4.4, wid: 1.9, cab: 2.0, cabH: 0.62 }, // sedan
      { len: 3.8, wid: 1.8, cab: 2.2, cabH: 0.72 }, // hatch
      { len: 4.8, wid: 2.0, cab: 1.4, cabH: 0.66 }, // pickup
      { len: 4.9, wid: 2.0, cab: 3.4, cabH: 0.95 }, // van
      { len: 4.2, wid: 1.9, cab: 1.7, cabH: 0.45 }, // sport
    ][style % 5];
    const body = new THREE.Mesh(new THREE.BoxGeometry(dims.wid, 0.62, dims.len), paint);
    body.position.y = 0.55; grp.add(body);
    if (isPolice) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(dims.wid + 0.04, 0.3, dims.len * 0.7), dark);
      stripe.position.y = 0.55; grp.add(stripe);
    }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(dims.wid * 0.86, dims.cabH, dims.cab),
      style === 3 ? paint : glass);
    cab.position.set(0, 0.86 + dims.cabH / 2, style === 2 ? -dims.len * 0.22 : -0.1);
    grp.add(cab);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (dims.wid / 2), 0.36, sz * (dims.len / 2 - 0.8));
      grp.add(wheel);
    }
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), lightMat);
      lamp.position.set(sx * dims.wid * 0.32, 0.62, dims.len / 2 + 0.02); grp.add(lamp);
    }
    if (isPolice) {
      const bar = new THREE.Group();
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      red.position.x = -0.3; bar.add(red);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.4),
        new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
      blue.position.x = 0.3; bar.add(blue);
      bar.position.y = 1.62; grp.add(bar);
      grp.userData.lightbar = bar;
    }
    grp.userData.len = dims.len;
    return grp;
  }

  function makeCar(scene, rng, style, color, isPolice) {
    const mesh = makeCarMesh(style, color, isPolice);
    scene.add(mesh);
    return {
      mesh, style, isPolice: !!isPolice, health: 60,
      x: 0, z: 0, heading: 0, speed: 0, axis: 'x', dir: 1, lane: 0, road: 0,
      mode: 'parked', flash: 0,
      sync() {
        this.mesh.position.set(this.x, 0, this.z);
        this.mesh.rotation.y = this.heading;
        if (this.mesh.userData.lightbar) {
          this.flash += 0.25;
          this.mesh.userData.lightbar.visible = Math.sin(this.flash * 6) > -0.2;
        }
      },
    };
  }

  function laneCoord(car) { return car.axis === 'x' ? car.z : car.x; }

  function spawnTraffic(scene, rng, count) {
    const cars = [];
    for (let i = 0; i < count; i++) {
      const car = makeCar(scene, rng, Math.floor(rng() * 5), U.pick(rng, CAR_COLORS), false);
      car.mode = 'traffic';
      car.axis = rng() < 0.5 ? 'x' : 'z';
      car.dir = rng() < 0.5 ? 1 : -1;
      car.road = U.pick(rng, ROADS);
      car.lane = car.dir > 0 ? 3 : -3; // drive on the right of the direction of travel
      const along = U.range(rng, -160, 160);
      // Lane placement: traffic keeps to one side per direction of travel.
      if (car.axis === 'x') { car.x = along; car.z = car.road + (car.dir > 0 ? 3 : -3); car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { car.z = along; car.x = car.road + (car.dir > 0 ? -3 : 3); car.heading = car.dir > 0 ? 0 : Math.PI; }
      car.speed = U.range(rng, 9, 14);
      car.sync(); cars.push(car);
    }
    return cars;
  }

  function updateTraffic(cars, dt, city) {
    for (const car of cars) {
      if (car.mode !== 'traffic') continue;
      let want = 12;
      for (const other of cars) { // slow down for the car ahead in the same lane
        if (other === car || other.mode === 'parked') continue;
        if (car.axis === 'x' && Math.abs(other.z - car.z) < 2 && (other.x - car.x) * car.dir > 0 && (other.x - car.x) * car.dir < 9) want = 4;
        if (car.axis === 'z' && Math.abs(other.x - car.x) < 2 && (other.z - car.z) * car.dir > 0 && (other.z - car.z) * car.dir < 9) want = 4;
      }
      car.speed += U.clamp(want - car.speed, -18 * dt, 6 * dt);
      if (car.axis === 'x') car.x += car.dir * car.speed * dt; else car.z += car.dir * car.speed * dt;
      if (car.x > 175) car.x = -175; if (car.x < -175) car.x = 175;
      if (car.z > 165) car.z = -165; if (car.z < -165) car.z = 165;
      const fixed = city.resolve(car.x, car.z, 1.2);
      car.x = fixed.x; car.z = fixed.z;
      car.sync();
    }
  }

  function spawnParked(scene, rng, count, city) {
    const cars = [];
    let placed = 0, guard = 0;
    while (placed < count && guard++ < 300) {
      const road = U.pick(rng, ROADS);
      const along = U.range(rng, -155, 155);
      const side = rng() < 0.5 ? 5.6 : -5.6;
      const vertical = rng() < 0.5;
      const x = vertical ? road + side : along;
      const z = vertical ? along : road + side;
      if (city.hitsBuilding(x, z, 2.4)) continue;
      const car = makeCar(scene, rng, Math.floor(rng() * 5), U.pick(rng, CAR_COLORS), false);
      car.mode = 'parked'; car.x = x; car.z = z;
      car.heading = vertical ? 0 : Math.PI / 2;
      car.sync(); cars.push(car); placed++;
    }
    return cars;
  }

  const PED_SHIRTS = [0xe8e4da, 0xd94f3d, 0x3d7bd9, 0xffd23e, 0x53b06a, 0xff5da2, 0x3fbfae];

  function makePed(scene, rng) {
    const grp = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: U.pick(rng, PED_SHIRTS) });
    const skin = new THREE.MeshLambertMaterial({ color: U.pick(rng, [0xe8b88a, 0xa06a42, 0x7a4a2c, 0xf2cdaa]) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.3), shirt); body.position.y = 1.05; grp.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin); head.position.y = 1.62; grp.add(head);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.68, 0.28),
      new THREE.MeshLambertMaterial({ color: 0x2c3242 })); legs.position.y = 0.34; grp.add(legs);
    scene.add(grp);
    return { mesh: grp, x: 0, z: 0, heading: rng() * 6.28, speed: 0, tx: 0, tz: 0, flee: 0, health: 30, phase: rng() * 6.28, alive: true };
  }

  function spawnPeds(scene, rng, count) {
    const peds = [];
    for (let i = 0; i < count; i++) {
      const p = makePed(scene, rng);
      const road = U.pick(rng, ROADS);
      p.x = road + (rng() < 0.5 ? 9 : -9); p.z = U.range(rng, -150, 150);
      p.tx = p.x; p.tz = p.z; peds.push(p);
    }
    return peds;
  }

  function updatePeds(peds, dt, rng, danger, city) {
    for (const p of peds) {
      if (!p.alive) continue;
      if (danger && U.dist2(p.x, p.z, danger.x, danger.z) < 16) p.flee = 1.6;
      let speed = 1.6;
      if (p.flee > 0) {
        p.flee -= dt; speed = 5.2;
        const away = Math.atan2(p.x - (danger ? danger.x : p.x), p.z - (danger ? danger.z : p.z));
        p.heading = away; p.tx = p.x + Math.sin(away) * 10; p.tz = p.z + Math.cos(away) * 10;
      } else if (U.dist2(p.x, p.z, p.tx, p.tz) < 1.5) {
        const road = U.pick(rng, ROADS);
        if (rng() < 0.5) { p.tx = road + (rng() < 0.5 ? 9 : -9); p.tz = U.range(rng, -150, 150); }
        else { p.tx = U.range(rng, -150, 150); p.tz = road + (rng() < 0.5 ? 9 : -9); }
      }
      const want = Math.atan2(p.tx - p.x, p.tz - p.z);
      p.heading = U.angleLerp(p.heading, want, Math.min(1, dt * 6));
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      const fixed = city.resolve(p.x, p.z, 0.45);
      p.x = U.clamp(fixed.x, -168, 172); p.z = U.clamp(fixed.z, -165, 165);
      p.phase += dt * (p.flee > 0 ? 11 : 6);
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.phase)) * 0.07, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  function makePlayerMesh() {
    const grp = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0xff7a3e });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.32), jacket); body.position.y = 1.08; grp.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36),
      new THREE.MeshLambertMaterial({ color: 0xe8b88a })); head.position.y = 1.68; grp.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x22242c })); cap.position.y = 1.9; grp.add(cap);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.7, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x27324a })); legs.position.y = 0.35; grp.add(legs);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x14161c })); gun.position.set(0.38, 1.15, 0.3); gun.visible = false; grp.add(gun);
    grp.userData.gun = gun;
    return grp;
  }

  window.VH = window.VH || {};
  window.VH.actors = { makeCar, spawnTraffic, updateTraffic, spawnParked, spawnPeds, updatePeds, makePlayerMesh, CAR_COLORS };
})();
