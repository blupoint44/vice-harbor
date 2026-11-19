// city.js — procedural Vice Harbor: a golden-hour coastal grid of towers
// with lit windows, palm boulevards, invented neon signs, an ocean shore
// with boardwalk and pier, and the player's hideout garage.
// Everything is generated from the shared seed; nothing is loaded.

import { randRange, randInt, pick } from './util.js';

export const PITCH = 44;          // distance between block centres
export const ROAD_HALF = 8;       // half the road width
export const BLOCK_HALF = 14;     // half the building block size
export const GRID = [-132, -88, -44, 0, 44, 88, 132]; // block centres
export const ROADS = [-154, -110, -66, -22, 22, 66, 110, 154]; // road centres
export const LAND_EDGE = 178;     // land ends, sand + ocean begin (east, +x)
export const WORLD_BOUND = 172;   // gameplay clamp on land

export const HIDEOUT = { x: -154, z: 132 };       // garage door, on the west road
export const PIER = { x: 226, z: 0 };             // end of the pier
export const DINER = { x: 110, z: -66 };          // mission 1 pickup corner
export const CHECKPOINTS = [
  { x: -110, z: -110 },
  { x: 22, z: -154 },
  { x: 110, z: -22 },
  { x: -22, z: 66 },
  { x: 66, z: 110 },
];

const NEON_SIGNS = [
  ['PALM ROYALE', '#ff5da2'], ['HOTEL SOLMAR', '#ffb347'], ['VICE HARBOR', '#4dd8ff'],
  ['CAFE LUMEN', '#ffe066'], ['NEON TIDE', '#7dffcb'], ['BAR AZUL', '#6a8dff'],
  ['CLUB MERIDIAN', '#ff6a6a'], ['DINER SOL', '#ffd24d'], ['MARINA 9', '#4dffe0'],
  ['CINEMA RIALTO', '#e08dff'],
];

const TOWER_COLORS = [0xd9c8b4, 0xb8c4cc, 0xe6d3a3, 0xc9a689, 0xa8b8c8, 0xe0b7a4, 0xbfc9a8];

// A canvas texture of a tower facade: rows of windows, some lit warm.
function facadeTexture(THREE, rng, baseColor) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0, 128, 10);
  const cols = 6, rows = 14;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#bfe8ff') : 'rgba(30,40,55,0.85)';
      g.fillRect(8 + x * 20, 14 + y * 17, 12, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(THREE, text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#14101e';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.strokeRect(4, 4, 248, 56);
  g.font = 'bold 26px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(THREE, w, h, d, color, x, y, z, opts) {
  const mat = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Build the whole city into the scene. Returns colliders and dressing info.
export function buildCity(THREE, scene, rng) {
  const colliders = [];
  const addCollider = (x, z, hw, hd) => colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });

  // Sky, fog and lights: fixed golden hour.
  scene.background = new THREE.Color(0xf7a95c);
  scene.fog = new THREE.Fog(0xf2a56b, 180, 620);
  const hemi = new THREE.HemisphereLight(0xffe3b3, 0x5a6a8a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc37a, 1.6);
  sun.position.set(-260, 190, -140);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x7fb2ff, 0.35);
  fill.position.set(200, 120, 220);
  scene.add(fill);

  // Ground: city slab, then sand and ocean to the east.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 460),
    new THREE.MeshLambertMaterial({ color: 0x8f9a7d })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-10, -0.05, 0);
  scene.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 460),
    new THREE.MeshLambertMaterial({ color: 0xe8cf9a })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(196, -0.02, 0);
  scene.add(sand);
  const oceanMat = new THREE.MeshLambertMaterial({ color: 0x2e7fa8 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(420, 460), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(430, -0.35, 0);
  scene.add(ocean);

  // Boardwalk: a wooden strip along the shore.
  const walk = box(THREE, 6, 0.35, 440, 0xa97c50, 184, 0.18, 0);
  scene.add(walk);
  // Pier: planks running east over the water, with posts and lamps.
  const pier = box(THREE, 74, 0.5, 10, 0x9a7448, 224, 0.45, 0);
  scene.add(pier);
  for (let px = 192; px <= 256; px += 16) {
    for (const pz of [-4.4, 4.4]) {
      scene.add(box(THREE, 0.7, 2.4, 0.7, 0x6e5233, px, -0.6, pz));
    }
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
    );
    lamp.position.set(px, 3.4, 0);
    scene.add(lamp);
    scene.add(box(THREE, 0.25, 3, 0.25, 0x3a3f46, px, 1.8, 0));
  }

  // Roads: dark strips along every grid line, with dashed centre lines.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  const sideMat = new THREE.MeshLambertMaterial({ color: 0xb9b0a0 });
  for (const r of ROADS) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 360), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(r, 0.01, 0); scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(360, ROAD_HALF * 2), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.012, r); scene.add(h);
    for (let d = -170; d <= 170; d += 12) {
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), lineMat);
      dashV.rotation.x = -Math.PI / 2; dashV.position.set(r, 0.03, d); scene.add(dashV);
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.4), lineMat);
      dashH.rotation.x = -Math.PI / 2; dashH.position.set(d, 0.03, r); scene.add(dashH);
    }
  }
  // Sidewalk aprons around each block.
  for (const bx of GRID) for (const bz of GRID) {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), sideMat);
    apron.rotation.x = -Math.PI / 2; apron.position.set(bx, 0.005, bz); scene.add(apron);
  }

  // Towers: 1-4 per block, seeded heights, lit-window facades.
  const facades = [];
  for (let i = 0; i < 6; i++) {
    const col = '#' + pick(rng, TOWER_COLORS).toString(16).padStart(6, '0');
    facades.push(facadeTexture(THREE, rng, col));
  }
  let signIndex = 0;
  for (const bx of GRID) for (const bz of GRID) {
    const nearHideout = bx === -132 && bz === 132;
    if (nearHideout) continue; // the hideout block is built separately
    const count = randInt(rng, 1, 3);
    const spots = [[-7, -7], [7, -7], [-7, 7], [7, 7], [0, 0]];
    for (let k = 0; k < count; k++) {
      const [ox, oz] = spots[k % spots.length];
      const w = randRange(rng, 9, 13), d = randRange(rng, 9, 13);
      const h = randRange(rng, 14, 52) * (Math.abs(bx) + Math.abs(bz) < 100 ? 1.35 : 1);
      const tex = pick(rng, facades);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      tower.position.set(bx + ox, h / 2, bz + oz);
      scene.add(tower);
      const roof = box(THREE, w + 0.6, 0.7, d + 0.6, 0x5a5148, bx + ox, h + 0.35, bz + oz);
      scene.add(roof);
      addCollider(bx + ox, bz + oz, w / 2, d / 2);
      // Some towers carry a neon sign facing the nearest road.
      if (rng() < 0.3 && signIndex < NEON_SIGNS.length) {
        const [text, color] = NEON_SIGNS[signIndex++];
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(11, 2.8),
          new THREE.MeshBasicMaterial({ map: signTexture(THREE, text, color) })
        );
        sign.position.set(bx + ox, Math.min(h - 3, 12), bz + oz - d / 2 - 0.15);
        sign.rotation.y = Math.PI;
        scene.add(sign);
      }
    }
  }

  // Hideout garage on the south-west block: low block, wide door, sign.
  const hideoutBase = box(THREE, 24, 7, 18, 0x7a6a58, -132, 3.5, 132);
  scene.add(hideoutBase);
  const door = box(THREE, 10, 5, 0.4, 0x2f6f8f, -132, 2.5, 122.8);
  scene.add(door);
  const hSign = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 3),
    new THREE.MeshBasicMaterial({ map: signTexture(THREE, 'VALE GARAGE', '#4dd8ff') })
  );
  hSign.position.set(-132, 8.2, 122.7);
  hSign.rotation.y = Math.PI;
  scene.add(hSign);
  addCollider(-132, 132, 12, 9);

  // Palms along the boulevards and the boardwalk.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d, side: THREE.DoubleSide });
  function palm(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 6.5 * s, 6), trunkMat);
    trunk.position.y = 3.25 * s;
    trunk.rotation.z = randRange(rng, -0.06, 0.06);
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.6 * s, 0.9 * s), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.5 * s, 6.6 * s, Math.sin(a) * 1.5 * s);
      frond.rotation.set(-0.7, -a, 0, 'YXZ');
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (const r of ROADS) {
    for (let d = -160; d <= 160; d += 32) {
      if (rng() < 0.75) palm(r + ROAD_HALF + 2.2, d + randRange(rng, -3, 3), randRange(rng, 0.85, 1.2));
      if (rng() < 0.75) palm(d + randRange(rng, -3, 3), r - ROAD_HALF - 2.2, randRange(rng, 0.85, 1.2));
    }
  }
  for (let z = -160; z <= 160; z += 26) palm(180.5, z + randRange(rng, -4, 4), randRange(rng, 1, 1.35));

  // Street lamps at intersections (emissive heads; the sun does the lighting).
  const lampHead = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const rx of ROADS) for (const rz of ROADS) {
    if (rng() < 0.4) continue;
    scene.add(box(THREE, 0.28, 5.4, 0.28, 0x3a3f46, rx + 9, 2.7, rz + 9));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), lampHead);
    head.position.set(rx + 9, 5.5, rz + 9);
    scene.add(head);
  }

  // Benches and planters on the boardwalk for silhouette variety.
  for (let z = -150; z <= 150; z += 30) {
    scene.add(box(THREE, 1.2, 0.5, 3.4, 0x7a5c38, 181.5, 0.55, z));
  }

  return { colliders, oceanMat };
}

// Circle-vs-buildings resolve: push (x,z) out of every collider it enters.
export function collideCircle(colliders, x, z, radius) {
  for (const c of colliders) {
    if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) {
      const pushLeft = x - (c.minX - radius);
      const pushRight = (c.maxX + radius) - x;
      const pushNear = z - (c.minZ - radius);
      const pushFar = (c.maxZ + radius) - z;
      const m = Math.min(pushLeft, pushRight, pushNear, pushFar);
      if (m === pushLeft) x = c.minX - radius;
      else if (m === pushRight) x = c.maxX + radius;
      else if (m === pushNear) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return [x, z];
}
