// Vice Harbor — entity factories. Every vehicle and character in the game
// is assembled here from plain boxes, cylinders and spheres: no model files,
// no textures loaded from disk, just procedural low-poly construction.

export const CAR_COLORS = [
  0xff5d8f, 0x2ec4b6, 0xffd166, 0xef476f, 0x118ab2, 0xf4f1de,
  0x9b5de5, 0x00f5d4, 0xff8c42, 0x6a8eae, 0xe0e1dd, 0x353535,
];

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.rough ?? 0.8) + '|' + (opts.flat ? 1 : 0);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0.05,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      flatShading: !!opts.flat,
    }));
  }
  return matCache.get(key);
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// Builds one car. kind: 'sedan' | 'sport' | 'taxi' | 'van' | 'police'.
// Returns a group whose forward axis is +Z, with userData.wheels for spin.
export function makeCar(kind, color) {
  const g = new THREE.Group();
  const isPolice = kind === 'police';
  const isVan = kind === 'van';
  const isSport = kind === 'sport';
  const paint = isPolice ? 0xf2f2f2 : color;
  const bodyMat = mat(paint, { rough: 0.35, metal: 0.5 });
  const darkMat = mat(0x14181d, { rough: 0.4, metal: 0.3 });
  const glassMat = mat(0x9fd8e8, { rough: 0.1, metal: 0.7 });

  const bodyH = isVan ? 1.05 : isSport ? 0.55 : 0.68;
  const bodyY = isVan ? 0.95 : 0.62;
  const body = box(1.8, bodyH, isVan ? 4.4 : 4.1, bodyMat, 0, bodyY, 0);
  g.add(body);
  if (isPolice) g.add(box(1.84, 0.34, 2.1, darkMat, 0, 0.55, 0.1));

  if (isVan) {
    g.add(box(1.7, 0.5, 1.0, glassMat, 0, 1.62, 1.55));
    g.add(box(1.7, 0.55, 2.6, bodyMat, 0, 1.55, -0.6));
  } else {
    const cabin = box(1.55, 0.52, isSport ? 1.7 : 2.0, glassMat, 0, bodyY + bodyH / 2 + 0.24, isSport ? -0.25 : -0.1);
    g.add(cabin);
    g.add(box(1.6, 0.09, isSport ? 1.8 : 2.1, bodyMat, 0, bodyY + bodyH / 2 + 0.52, isSport ? -0.25 : -0.1));
  }
  if (kind === 'taxi') {
    g.add(box(0.7, 0.22, 0.3, mat(0xffe14d, { emissive: 0xcc9900, emissiveIntensity: 0.7 }), 0, 1.32, -0.1));
  }
  if (isSport) {
    g.add(box(1.7, 0.08, 0.35, darkMat, 0, 0.98, -2.0));
    g.add(box(0.12, 0.22, 0.3, darkMat, -0.7, 0.82, -2.0));
    g.add(box(0.12, 0.22, 0.3, darkMat, 0.7, 0.82, -2.0));
  }
  // Headlights and tail lights (emissive: the dusk look sells the scene).
  const headMat = mat(0xfff6c9, { emissive: 0xffedb0, emissiveIntensity: 2.2 });
  const tailMat = mat(0xff2a3c, { emissive: 0xd90429, emissiveIntensity: 1.8 });
  g.add(box(0.36, 0.14, 0.06, headMat, -0.58, 0.66, 2.06));
  g.add(box(0.36, 0.14, 0.06, headMat, 0.58, 0.66, 2.06));
  g.add(box(0.4, 0.12, 0.06, tailMat, -0.56, 0.72, -2.06));
  g.add(box(0.4, 0.12, 0.06, tailMat, 0.56, 0.72, -2.06));

  let lightBar = null;
  let beaconRed = null;
  let beaconBlue = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    const barBase = box(1.1, 0.1, 0.34, darkMat, 0, 0, 0);
    beaconRed = box(0.5, 0.14, 0.3, mat(0xff2244, { emissive: 0xff0033, emissiveIntensity: 3 }), -0.28, 0.1, 0);
    beaconBlue = box(0.5, 0.14, 0.3, mat(0x2266ff, { emissive: 0x1155ff, emissiveIntensity: 3 }), 0.28, 0.1, 0);
    lightBar.add(barBase, beaconRed, beaconBlue);
    lightBar.position.set(0, 1.6, -0.1);
    g.add(lightBar);
    const badge = box(0.02, 0.4, 0.9, mat(0x1b3a6b, { emissive: 0x0a1e40, emissiveIntensity: 0.6 }), 0.92, 0.7, 0.2);
    const badge2 = badge.clone();
    badge2.position.x = -0.92;
    g.add(badge, badge2);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.26, 10);
  const wheels = [];
  const wheelPos = [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]];
  for (const [wx, wz] of wheelPos) {
    const pivot = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, mat(0x111111, { rough: 0.95 }));
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, mat(0xcccccc, { rough: 0.3, metal: 0.8 }));
    hub.rotation.z = Math.PI / 2;
    pivot.add(tire, hub);
    pivot.position.set(wx, 0.34, wz);
    g.add(pivot);
    wheels.push(pivot);
  }

  g.userData.wheels = wheels;
  g.userData.beaconRed = beaconRed;
  g.userData.beaconBlue = beaconBlue;
  g.userData.kind = kind;
  return g;
}

// Builds one articulated low-poly person. Limbs are pivots so the walk
// cycle in main.js can swing arms and legs. palette picks shirt/pants/skin.
export function makePerson(palette) {
  const g = new THREE.Group();
  const skin = mat(palette.skin, { rough: 0.7 });
  const shirt = mat(palette.shirt, { rough: 0.85 });
  const pants = mat(palette.pants, { rough: 0.9 });
  const hairM = mat(palette.hair, { rough: 0.95 });

  const torso = box(0.52, 0.62, 0.28, shirt, 0, 1.12, 0);
  const head = box(0.3, 0.32, 0.3, skin, 0, 1.62, 0);
  const hair = box(0.32, 0.1, 0.32, hairM, 0, 1.8, 0);
  g.add(torso, head, hair);

  function limb(w, h, material, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const seg = box(w, h, w, material, 0, -h / 2 + 0.04, 0);
    pivot.add(seg);
    g.add(pivot);
    return pivot;
  }
  const armL = limb(0.13, 0.58, shirt, -0.34, 1.4);
  const armR = limb(0.13, 0.58, shirt, 0.34, 1.4);
  const legL = limb(0.16, 0.78, pants, -0.14, 0.82);
  const legR = limb(0.16, 0.78, pants, 0.14, 0.82);
  g.userData.parts = { armL, armR, legL, legR, torso, head };
  return g;
}

export const PERSON_PALETTES = [
  { skin: 0xf1c27d, shirt: 0xff5d8f, pants: 0x22304a, hair: 0x2b2118 },
  { skin: 0x8d5524, shirt: 0x2ec4b6, pants: 0x3a3a3a, hair: 0x0d0d0d },
  { skin: 0xffdbac, shirt: 0xffd166, pants: 0x5b2a86, hair: 0x6e4520 },
  { skin: 0xe0ac69, shirt: 0xf4f1de, pants: 0x118ab2, hair: 0x1a1a1a },
  { skin: 0xc68642, shirt: 0xef476f, pants: 0xe0e1dd, hair: 0x301d0d },
  { skin: 0xffdbac, shirt: 0x06d6a0, pants: 0x22223b, hair: 0x8a5a2b },
  { skin: 0x8d5524, shirt: 0x9b5de5, pants: 0x14213d, hair: 0x050505 },
  { skin: 0xf1c27d, shirt: 0xff8c42, pants: 0x073b4c, hair: 0x3a2314 },
];

export const POLICE_PALETTE = { skin: 0xe0ac69, shirt: 0x1b3a6b, pants: 0x101c33, hair: 0x0d0d0d };
export const PLAYER_PALETTE = { skin: 0xc68642, shirt: 0x00b4a2, pants: 0x2b2d42, hair: 0x14100c };

// A palm tree: leaning segmented trunk plus a crown of drooping fronds.
export function makePalm(rng) {
  const g = new THREE.Group();
  const trunkMat = mat(0x8a6b4a, { rough: 0.95 });
  const lean = (rng() - 0.5) * 0.35;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.14 - i * 0.012, 0.17 - i * 0.012, 0.9, 7), trunkMat);
    x += lean * 0.45;
    y += 0.82;
    seg.position.set(x, y, 0);
    seg.rotation.z = -lean;
    seg.castShadow = true;
    g.add(seg);
  }
  const crown = new THREE.Group();
  crown.position.set(x + lean * 0.4, y + 0.45, 0);
  const frondMat = mat(0x2fa84f, { rough: 0.8, flat: true });
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.16, 2.3, 4), frondMat);
    const a = (i / 7) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 0.85, 0.18, Math.sin(a) * 0.85);
    frond.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15);
    frond.castShadow = true;
    crown.add(frond);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0x6b4a2b, { rough: 0.9 }));
  nuts.position.y = -0.1;
  crown.add(nuts);
  g.add(crown);
  return g;
}
