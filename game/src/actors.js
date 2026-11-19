// actors.js — the living city: traffic cars that loop the road grid,
// pedestrians who stroll and flee, and Harbor Patrol units that pursue.
// Meshes are built from primitives; behaviour is deliberately simple and
// robust — grid driving for traffic, steering pursuit for police.

import { ROADS, WORLD_BOUND } from './city.js';
import { clamp, angleDelta, dist2d, pick } from './util.js';

export const CAR_COLORS = [0xd94f4f, 0x4f7fd9, 0xf2f2f2, 0x2b2f36, 0xf2b544, 0x62b56f, 0xb565d8, 0x4fc9c0, 0xd97b4f];
const SHIRT_COLORS = [0xef6461, 0xf4d35e, 0x83c5be, 0xee964b, 0x9b5de5, 0xf1fa8c, 0xffffff, 0x3a86ff];

// One car mesh, five body styles picked by index. Police get a lightbar.
export function makeCarMesh(THREE, color, style, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f2f2 : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2126 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });
  const bodyH = style === 3 ? 1.15 : 0.72;         // style 3 = van/truck
  const bodyL = style === 3 ? 5.2 : 4.3;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, bodyH, bodyL), paint);
  body.position.y = 0.45 + bodyH / 2;
  g.add(body);
  if (style !== 3) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.6, bodyL * 0.48), glass);
    cab.position.set(0, 0.45 + bodyH + 0.28, -0.15);
    g.add(cab);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.1), glass);
    cab.position.set(0, 0.75, bodyL / 2 - 0.6);
    g.add(cab);
  }
  if (style === 1) { // convertible: no roof look, add a spoiler
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), dark);
    spoiler.position.set(0, 1.25, -bodyL / 2 + 0.3);
    g.add(spoiler);
  }
  if (style === 4) { // pickup bed walls
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.6), dark);
    bed.position.set(0, 1.05, -bodyL / 2 + 1.0);
    g.add(bed);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, bodyL / 2 - 0.8], [0.95, bodyL / 2 - 0.8], [-0.95, -bodyL / 2 + 0.8], [0.95, -bodyL / 2 + 0.8]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
    wheels.push(w);
  }
  const lightGeo = new THREE.BoxGeometry(0.32, 0.16, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(lightGeo, headMat);
    hl.position.set(sx, 0.75, bodyL / 2 + 0.02);
    g.add(hl);
    const tl = new THREE.Mesh(lightGeo, tailMat);
    tl.position.set(sx, 0.75, -bodyL / 2 - 0.02);
    g.add(tl);
  }
  let lightbar = null;
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, bodyL * 0.9),
      new THREE.MeshLambertMaterial({ color: 0x2456a8 }));
    stripe.position.y = 0.85;
    g.add(stripe);
    lightbar = new THREE.Group();
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.9),
      new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    const lb2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x3388ff }));
    lb.position.x = -0.3; lb2.position.x = 0.3;
    lightbar.add(lb); lightbar.add(lb2);
    lightbar.position.y = 1.62;
    g.add(lightbar);
  }
  g.userData.wheels = wheels;
  g.userData.lightbar = lightbar;
  g.userData.length = bodyL;
  return g;
}

export function makePersonMesh(THREE, rng, isCop) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: isCop ? 0x2456a8 : pick(rng, SHIRT_COLORS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xe8b88a, 0xc98d5e, 0x8a5a3b, 0xf0c8a0]) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.75, 0.26),
    new THREE.MeshLambertMaterial({ color: isCop ? 0x1c2a44 : 0x35424f }));
  legs.position.y = 0.38;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3), shirt);
  torso.position.y = 1.08;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.25, 0.12, 8),
      new THREE.MeshLambertMaterial({ color: 0x16283f }));
    cap.position.y = 1.8;
    g.add(cap);
  }
  g.userData.torso = torso;
  return g;
}

// A traffic car: drives along one road line, turns at intersections,
// brakes when something is close ahead. Parked cars use the same mesh.
export class TrafficCar {
  constructor(THREE, rng, scene) {
    this.mesh = makeCarMesh(THREE, pick(rng, CAR_COLORS), Math.floor(rng() * 5), false);
    this.rng = rng;
    this.axis = rng() < 0.5 ? 'z' : 'x';       // travel along z or along x
    this.line = pick(rng, ROADS);              // the road it drives on
    this.pos = (rng() * 2 - 1) * 160;
    this.dir = rng() < 0.5 ? 1 : -1;
    this.speed = 0;
    this.cruise = 11 + rng() * 7;
    this.stolen = false;
    scene.add(this.mesh);
    this.syncMesh(0);
  }

  laneOffset() {
    // Right-hand traffic: offset to the right of the direction of travel.
    return this.dir * 3.1;
  }

  position() {
    if (this.axis === 'z') return { x: this.line + this.laneOffset(), z: this.pos };
    return { x: this.pos, z: this.line - this.laneOffset() };
  }

  heading() {
    if (this.axis === 'z') return this.dir > 0 ? 0 : Math.PI;
    return this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  syncMesh(dt) {
    const p = this.position();
    this.mesh.position.set(p.x, 0, p.z);
    this.mesh.rotation.y = this.heading();
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2.2;
  }

  update(dt, obstacles) {
    const p = this.position();
    let target = this.cruise;
    for (const o of obstacles) {
      const ahead = this.axis === 'z'
        ? (o.z - p.z) * this.dir
        : (o.x - p.x) * this.dir;
      const lateral = this.axis === 'z' ? Math.abs(o.x - p.x) : Math.abs(o.z - p.z);
      if (ahead > 0 && ahead < 9 && lateral < 2.6) target = 0;
      else if (ahead > 0 && ahead < 16 && lateral < 2.6) target = Math.min(target, this.cruise * 0.4);
    }
    this.speed += clamp(target - this.speed, -22 * dt * 3, 7 * dt * 3) * dt * 3;
    if (this.speed < 0) this.speed = 0;
    this.pos += this.dir * this.speed * dt;
    if (this.pos > 168) { this.pos = 168; this.dir = -1; }
    if (this.pos < -168) { this.pos = -168; this.dir = 1; }
    // Random turns at intersections.
    for (const r of ROADS) {
      if (Math.abs(this.pos - r) < this.speed * dt + 0.4 && Math.abs(this.pos - r) > 0) {
        if (this.rng() < 0.3 * dt * 8) {
          const cross = this.line;
          this.line = r;
          this.pos = cross + this.laneOffset() * (this.axis === 'z' ? 1 : -1);
          this.axis = this.axis === 'z' ? 'x' : 'z';
          if (this.rng() < 0.5) this.dir = -this.dir;
          break;
        }
      }
    }
    this.syncMesh(dt);
  }
}

// A pedestrian: strolls along sidewalk lines, flees from danger points.
export class Pedestrian {
  constructor(THREE, rng, scene) {
    this.mesh = makePersonMesh(THREE, rng, false);
    this.rng = rng;
    this.x = (rng() * 2 - 1) * 160;
    this.z = (rng() * 2 - 1) * 160;
    this.heading = rng() * Math.PI * 2;
    this.speed = 0;
    this.walkSpeed = 1.4 + rng() * 1.1;
    this.fleeUntil = 0;
    this.fleeFrom = null;
    this.bob = rng() * 6;
    this.dead = false;
    scene.add(this.mesh);
    this.syncMesh(0);
  }

  scare(x, z, now) {
    this.fleeFrom = { x, z };
    this.fleeUntil = now + 2.5;
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.bob)) * 0.06, this.z);
    this.mesh.rotation.y = this.heading;
  }

  update(dt, now) {
    if (this.dead) return;
    let desired = this.walkSpeed;
    if (this.fleeFrom && now < this.fleeUntil) {
      this.heading = Math.atan2(this.x - this.fleeFrom.x, this.z - this.fleeFrom.z);
      desired = 4.6;
    } else if (this.rng() < dt * 0.25) {
      // Snap to a sidewalk-friendly heading (along a grid axis).
      this.heading = Math.floor(this.rng() * 4) * (Math.PI / 2) + (this.rng() < 0.5 ? 0.35 : -0.35);
    }
    this.speed += clamp(desired - this.speed, -8 * dt, 8 * dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.x = clamp(this.x, -WORLD_BOUND, 186);
    this.z = clamp(this.z, -WORLD_BOUND, WORLD_BOUND);
    this.bob += dt * this.speed * 3.2;
    this.syncMesh(dt);
  }
}

// A Harbor Patrol unit: steering pursuit of a target, with a lightbar
// flash phase the game drives for the siren/flash effect.
export class PoliceUnit {
  constructor(THREE, rng, scene, x, z) {
    this.mesh = makeCarMesh(THREE, 0xffffff, 0, true);
    this.x = x; this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.speed = 0;
    this.flash = rng() * 6;
    scene.add(this.mesh);
    this.syncMesh(0);
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2.2;
  }

  // Chase `target` ({x,z}); aggression scales top speed and steering.
  update(dt, target, aggression) {
    const want = Math.atan2(target.x - this.x, target.z - this.z);
    const turn = clamp(angleDelta(this.heading, want), -2.4 * dt, 2.4 * dt);
    this.heading += turn;
    const d = dist2d(this.x, this.z, target.x, target.z);
    const top = 17 + aggression * 5;
    const desired = d > 7 ? top : top * 0.55;
    this.speed += clamp(desired - this.speed, -26 * dt, 11 * dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.x = clamp(this.x, -176, 196);
    this.z = clamp(this.z, -176, 176);
    this.flash += dt * 9;
    const bar = this.mesh.userData.lightbar;
    if (bar) bar.rotation.y = Math.sin(this.flash) > 0 ? 0.5 : -0.5;
    this.syncMesh(dt);
  }
}
