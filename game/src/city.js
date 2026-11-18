// Vice Harbor — the city itself. A procedural grid of avenues and streets
// at golden hour: emissive-window towers, palm-lined boulevards, invented
// neon businesses, streetlights, and an ocean boardwalk along the east edge.
// All textures are painted on canvases at runtime; nothing is downloaded.

import { mat, makePalm } from './entities.js';

export const AVENUES = [-132, -88, -44, 0, 44, 88, 132]; // vertical roads (run along Z)
export const STREETS = [-132, -88, -44, 0, 44, 88, 132]; // horizontal roads (run along X)
export const ROAD_HALF = 7;
export const CITY_EDGE = 152;      // buildings/roads stop here
export const WORLD_EDGE = 196;     // hard clamp for actors
export const BOARDWALK_X = 158;    // promenade centre line
export const OCEAN_X = 176;        // water starts here

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// A building facade: dark blue-grey wall, grid of windows, some lit warm.
function facadeTexture(rng, base, litRatio) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cols = 6, rows = 14;
    const cw = w / cols, ch = h / rows;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const lit = rng() < litRatio;
        ctx.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#9fe8ff') : '#232c3d';
        ctx.fillRect(x * cw + 2, y * ch + 3, cw - 4, ch - 6);
      }
    }
  });
}

function roadTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2e2a33';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#353040';
    for (let i = 0; i < 300; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    ctx.fillStyle = '#f7d154';
    ctx.fillRect(w / 2 - 2, 6, 4, 34);
    ctx.fillRect(w / 2 - 2, 88, 4, 34);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(4, 0, 3, h);
    ctx.fillRect(w - 7, 0, 3, h);
  });
}

function neonTexture(text, fg, bg) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = fg;
    ctx.shadowBlur = 22;
    ctx.fillStyle = fg;
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

const NEON_SIGNS = [
  ['HOTEL MARINA', '#ff5da2', '#2a0a1e'],
  ['CLUB SOLSTICE', '#22e6ff', '#071a26'],
  ['DINER LUNA', '#ffd166', '#26160a'],
  ['PALMS CASINO', '#7dff6a', '#0a2612'],
  ['SURF & SAND', '#ff8c42', '#260f04'],
  ['TACOS DEL MAR', '#ff5d5d', '#260a0a'],
  ['BAR NEON NOIR', '#c77dff', '#180a26'],
  ['VICE MOTORS', '#4dc9ff', '#0a1626'],
  ['HOTEL MARINA', '#ff5da2', '#2a0a1e'],
  ['CLUB SOLSTICE', '#22e6ff', '#071a26'],
];

const FACADE_BASES = ['#3d4b63', '#54455a', '#2f4858', '#6b4a3a', '#46536e', '#59344a'];

export function buildCity(scene, seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  const colliders = [];
  const animated = { neonMats: [], water: null, sunSprite: null };

  // --- sky, sun, light rig -------------------------------------------------
  const skyTex = canvasTexture(64, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2d4a7a');
    grad.addColorStop(0.42, '#7a5a9e');
    grad.addColorStop(0.62, '#e86a92');
    grad.addColorStop(0.78, '#ff9a5c');
    grad.addColorStop(1, '#ffc46b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  const glowTex = canvasTexture(128, 128, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.25, 'rgba(255,190,110,0.75)');
    grad.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, fog: false, depthWrite: false }));
  sunSprite.scale.set(340, 340, 1);
  sunSprite.position.set(620, 150, -380);
  scene.add(sunSprite);
  animated.sunSprite = sunSprite;

  scene.fog = new THREE.Fog(0xf2a56b, 120, 620);
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x35506b, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb066, 1.55);
  sun.position.set(180, 130, -110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -190; sun.shadow.camera.right = 190;
  sun.shadow.camera.top = 190; sun.shadow.camera.bottom = -190;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x604a6a, 0.5));

  // --- ground, ocean, beach, boardwalk --------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat(0x4a4a52, { rough: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(26, 420), mat(0xe8c98f, { rough: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(166, 0.01, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0e7d8c, roughness: 0.25, metalness: 0.35,
    emissive: 0x083a4a, emissiveIntensity: 0.7, transparent: true, opacity: 0.94,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 900), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(OCEAN_X + 240, 0.06, 0);
  scene.add(water);
  animated.water = waterMat;

  const walkMat = mat(0x9a6b4f, { rough: 0.95 });
  for (let z = -200; z < 200; z += 4) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 3.6), walkMat);
    plank.position.set(BOARDWALK_X, 0.09, z);
    plank.receiveShadow = true;
    scene.add(plank);
  }
  // Pier jutting into the sea, near the middle of the map.
  for (let x = BOARDWALK_X; x < 226; x += 4) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 10), walkMat);
    plank.position.set(x + 2, 0.09, 4);
    plank.receiveShadow = true;
    scene.add(plank);
  }
  colliders.push({ minX: 214, maxX: 232, minZ: -4, maxZ: 12 }); // pier end railing zone kept walkable edge

  // --- roads and sidewalks ----------------------------------------------------
  const roadTex = roadTexture();
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  const walkPaveMat = mat(0x8d8578, { rough: 1 });
  const span = CITY_EDGE + ROAD_HALF + 4;

  function addRoad(cx, cz, alongZ) {
    const len = span * 2;
    const tex = roadTex.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, len / 16);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), m);
    road.rotation.x = -Math.PI / 2;
    if (!alongZ) road.rotation.z = Math.PI / 2;
    road.position.set(cx, 0.02, cz);
    road.receiveShadow = true;
    scene.add(road);
    for (const side of [-1, 1]) {
      const off = side * (ROAD_HALF + 1.6);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 3.2 : len, 0.22, alongZ ? len : 3.2), walkPaveMat);
      walk.position.set(alongZ ? cx + off : cx, 0.11, alongZ ? cz : cz + off);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }
  for (const x of AVENUES) addRoad(x, 0, true);
  for (const z of STREETS) addRoad(0, z, false);

  // --- buildings ---------------------------------------------------------------
  const facades = FACADE_BASES.map((base, i) => facadeTexture(rng, base, 0.42 + (i % 3) * 0.12));
  let signIdx = 0;
  const blockCenters = [];
  for (let i = 0; i < AVENUES.length - 1; i++) {
    for (let j = 0; j < STREETS.length - 1; j++) {
      blockCenters.push([(AVENUES[i] + AVENUES[i + 1]) / 2, (STREETS[j] + STREETS[j + 1]) / 2]);
    }
  }
  for (const [bx, bz] of blockCenters) {
    const plots = rng() < 0.4 ? 1 : 2;
    for (let p = 0; p < plots; p++) {
      const w = plots === 1 ? 24 + rng() * 6 : 12 + rng() * 4;
      const d = plots === 1 ? 24 + rng() * 6 : 12 + rng() * 6;
      const ox = plots === 1 ? 0 : (p === 0 ? -8.5 : 8.5);
      const oz = plots === 1 ? 0 : (rng() - 0.5) * 8;
      const height = 12 + Math.pow(rng(), 1.6) * 52;
      const tex = facades[Math.floor(rng() * facades.length)];
      const wallMat = new THREE.MeshStandardMaterial({
        map: tex, emissive: 0xffc98a, emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.9,
      });
      const roofMat = mat(0x2b2b33, { rough: 1 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, height, d),
        [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat]);
      b.position.set(bx + ox, height / 2, bz + oz);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
      colliders.push({ minX: bx + ox - w / 2 - 0.4, maxX: bx + ox + w / 2 + 0.4, minZ: bz + oz - d / 2 - 0.4, maxZ: bz + oz + d / 2 + 0.4 });

      // Rooftop clutter sells the skyline in wide shots.
      if (rng() < 0.7) {
        const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), roofMat);
        hut.position.set(bx + ox + (rng() - 0.5) * 6, height + 0.8, bz + oz + (rng() - 0.5) * 6);
        scene.add(hut);
      }
      // Neon sign on street-facing side for a share of buildings.
      if (rng() < 0.34 && signIdx < NEON_SIGNS.length * 3) {
        const [text, fg, bg] = NEON_SIGNS[signIdx % NEON_SIGNS.length];
        signIdx++;
        const signMat = new THREE.MeshBasicMaterial({ map: neonTexture(text, fg, bg) });
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), signMat);
        const faceEast = bx < 140 && rng() < 0.5;
        if (faceEast) {
          sign.position.set(bx + ox + w / 2 + 0.15, Math.min(height - 2, 6 + rng() * 5), bz + oz);
          sign.rotation.y = Math.PI / 2;
        } else {
          sign.position.set(bx + ox, Math.min(height - 2, 6 + rng() * 5), bz + oz + d / 2 + 0.15);
        }
        scene.add(sign);
        animated.neonMats.push(signMat);
      }
    }
  }

  // --- palms along boulevards and the boardwalk --------------------------------
  for (const x of AVENUES) {
    for (let z = -CITY_EDGE; z <= CITY_EDGE; z += 22) {
      if (STREETS.some((s) => Math.abs(s - z) < 11)) continue;
      for (const side of [-1, 1]) {
        if (rng() < 0.3) continue;
        const palm = makePalm(rng);
        palm.position.set(x + side * (ROAD_HALF + 3.4), 0, z + (rng() - 0.5) * 5);
        palm.scale.setScalar(0.9 + rng() * 0.5);
        scene.add(palm);
      }
    }
  }
  for (let z = -190; z <= 190; z += 15) {
    if (rng() < 0.25) continue;
    const palm = makePalm(rng);
    palm.position.set(BOARDWALK_X - 6.5, 0, z + (rng() - 0.5) * 4);
    palm.scale.setScalar(1 + rng() * 0.45);
    scene.add(palm);
  }

  // --- streetlights ---------------------------------------------------------------
  const lampMat = mat(0xffe9b0, { emissive: 0xffd98a, emissiveIntensity: 2.6 });
  const poleMat = mat(0x30343c, { rough: 0.6, metal: 0.5 });
  let lightCount = 0;
  for (const x of AVENUES) {
    for (const z of STREETS) {
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6), poleMat);
        pole.position.set(x + sx * (ROAD_HALF + 0.7), 2.7, z + sz * (ROAD_HALF + 0.7));
        scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lampMat);
        lamp.position.set(x + sx * (ROAD_HALF + 0.7), 5.5, z + sz * (ROAD_HALF + 0.7));
        scene.add(lamp);
        if ((Math.abs(x) + Math.abs(z)) % 88 === 0 && lightCount < 14) {
          const pl = new THREE.PointLight(0xffc27a, 0.55, 30);
          pl.position.copy(lamp.position);
          scene.add(pl);
          lightCount++;
        }
      }
    }
  }

  // Hideout: a marked garage doorway on the west side (mission landmark).
  const hideout = new THREE.Group();
  const hDoor = new THREE.Mesh(new THREE.BoxGeometry(6, 4.4, 0.4), mat(0x14532d, { emissive: 0x0f5132, emissiveIntensity: 0.8 }));
  hDoor.position.set(0, 2.2, 0);
  const hSignMat = new THREE.MeshBasicMaterial({ map: neonTexture('HIDEOUT GARAGE', '#7dff6a', '#0a2012') });
  const hSign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), hSignMat);
  hSign.position.set(0, 5.4, 0.25);
  hideout.add(hDoor, hSign);
  hideout.position.set(-146, 0, -22);
  hideout.rotation.y = Math.PI / 2;
  scene.add(hideout);
  animated.neonMats.push(hSignMat);

  return { colliders, animated, hideoutPos: new THREE.Vector3(-140, 0, -22) };
}

// Pushes a point (with radius) out of every building AABB. Mutates pos.
export function collide(pos, radius, colliders) {
  for (const c of colliders) {
    if (pos.x > c.minX - radius && pos.x < c.maxX + radius && pos.z > c.minZ - radius && pos.z < c.maxZ + radius) {
      const dxl = pos.x - (c.minX - radius);
      const dxr = (c.maxX + radius) - pos.x;
      const dzl = pos.z - (c.minZ - radius);
      const dzr = (c.maxZ + radius) - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = c.minX - radius;
      else if (m === dxr) pos.x = c.maxX + radius;
      else if (m === dzl) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  pos.x = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.x));
  pos.z = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.z));
}
