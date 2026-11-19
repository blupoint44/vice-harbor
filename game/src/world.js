// Vice Harbor — procedural golden-hour coastal city.
// Original world: towers with lit windows, palm boulevards, invented neon
// signs, ocean / boardwalk / pier, and the Skyline Garage hideout.
// Exposes window.VHWorld.buildWorld(THREE, scene, seed).
(function () {
'use strict';

function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return new THREE.CanvasTexture(c);
}

// Building facade: dark slab with a grid of windows, some lit warm.
function facadeTexture(rand, base, litRatio) {
  return canvasTex(128, 256, function (g, w, h) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 14, cw = w / cols, ch = h / rows;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const r = rand();
        if (r < litRatio) g.fillStyle = ['#ffd98a', '#fff3c4', '#ffb35c'][Math.floor(rand() * 3)];
        else g.fillStyle = 'rgba(18,24,38,0.9)';
        g.fillRect(x * cw + 2, y * ch + 3, cw - 4, ch - 6);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 10, w, 10);
  });
}

function signTexture(text, fg, bg) {
  return canvasTex(256, 64, function (g, w, h) {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = fg; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
  });
}

const AVENUES = [-66, -22, 22, 66];       // roads running along Z (x = const)
const STREETS = [-66, -22, 0, 22, 66];    // roads running along X (z = const), 0 = Harbor Blvd

function buildWorld(THREE, scene, seed) {
  const rand = makeRng(seed * 7919 + 13);
  const world = {
    colliders: [], gates: [], avenues: AVENUES, streets: STREETS,
    hideout: { x: -44, z: 29, r: 6 },
    pierPickup: { x: 140, z: 0 },
    pickupSpots: [], bounds: 100
  };

  // Sky dome: vertical golden-hour gradient.
  const skyTex = canvasTex(4, 256, function (g, w, h) {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2c4a7c'); gr.addColorStop(0.45, '#7a5a8c');
    gr.addColorStop(0.72, '#e2703a'); gr.addColorStop(0.92, '#ffb36b'); gr.addColorStop(1, '#ffd9a0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe88a52, 130, 380);

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x2e3a4a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-120, 55, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 400;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x604a38, 0.5));

  const mat = function (color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.95, metalness: 0 }, opts || {}));
  };
  function flat(w, d, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, opts));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    m.receiveShadow = true; scene.add(m); return m;
  }

  // Base ground, sand strip, boardwalk, ocean.
  flat(340, 260, 0x4c463f, 20, 0, 0);
  flat(14, 260, 0xd9b380, 99, 0.015, 0);                    // sand
  flat(7, 260, 0x8a6844, 90.5, 0.02, 0);                    // boardwalk
  world.water = flat(230, 300, 0x14607e, 219, -0.3, 0, { roughness: 0.35, metalness: 0.25 });

  // Roads: sidewalk slab, asphalt, dashed centre line.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf7e08a });
  function road(len, cx, cz, alongZ) {
    flat(alongZ ? 15 : len, alongZ ? len : 15, 0x8a8378, cx, 0.03, cz);
    flat(alongZ ? 11.5 : len, alongZ ? len : 11.5, 0x2e2c30, cx, 0.045, cz);
    const n = Math.floor(len / 10);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + 5 + i * 10;
      const d = new THREE.Mesh(new THREE.PlaneGeometry(alongZ ? 0.35 : 4.5, alongZ ? 4.5 : 0.35), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(alongZ ? cx : cx + t, 0.06, alongZ ? cz + t : cz);
      scene.add(d);
    }
  }
  AVENUES.forEach(function (x) { road(216, x, 0, true); });
  STREETS.forEach(function (z) { road(z === 0 ? 268 : 216, z === 0 ? 24 : 0, z, false); });

  // Pier: wooden deck reaching into the ocean along Harbor Blvd.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(52, 0.5, 9), mat(0x7a5a38));
  deck.position.set(124, 0.1, 0); deck.receiveShadow = true; scene.add(deck);
  for (let px = 102; px <= 148; px += 8) {
    [-4.6, 4.6].forEach(function (pz) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.4, 6), mat(0x54402a));
      post.position.set(px, -0.6, pz); scene.add(post);
    });
  }
  const pierSign = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 2.8),
    new THREE.MeshBasicMaterial({ map: signTexture('VICE HARBOR PIER', '#7df9ff', '#12303e'), side: THREE.DoubleSide })
  );
  pierSign.position.set(101, 4.4, 0); pierSign.rotation.y = -Math.PI / 2; scene.add(pierSign);
  [-3.4, 3.4].forEach(function (pz) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 5), mat(0x333333));
    pole.position.set(101, 2.3, pz); scene.add(pole);
  });
  world.colliders.push({ x: 150, z: 0, hw: 0.6, hd: 5 });   // pier end rail
  world.colliders.push({ x: 124, z: -5.4, hw: 26, hd: 0.4 });
  world.colliders.push({ x: 124, z: 5.4, hw: 26, hd: 0.4 });

  return finishWorld(THREE, scene, rand, world, mat, signTexture, facadeTexture);
}

function finishWorld(THREE, scene, rand, world, mat, signTexture, facadeTexture) {
  const bases = ['#5a4a56', '#4a5568', '#6b4a3a', '#3f4a5a', '#63504a', '#54486b'];
  const facades = bases.map(function (b) {
    return new THREE.MeshStandardMaterial({ map: facadeTexture(rand, b, 0.38), roughness: 0.9 });
  });
  const roofMat = mat(0x2b2b30);
  const signNames = [
    ['HOTEL SOLANA', '#ffd98a', '#3a1f2e'], ['CLUB NEREID', '#ff7dd6', '#1c1030'],
    ['PALM COURT', '#8affc1', '#10301e'], ['DINE 24H', '#ffb35c', '#30180c'],
    ['MOTO RENTALS', '#7df9ff', '#0c2430'], ['HARBORETTE', '#ff8a7a', '#30120e'],
    ['CAFE OLE', '#fff3c4', '#2e2410'], ['TIDE LOUNGE', '#8ac8ff', '#0e2036']
  ];
  let signIdx = 0;

  function building(x, z, w, d, h) {
    const f = facades[Math.floor(rand() * facades.length)];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [f, f, roofMat, roofMat, f, f]);
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    world.colliders.push({ x: x, z: z, hw: w / 2, hd: d / 2 });
    // Neon sign on a random face of some buildings.
    if (rand() < 0.4 && signIdx < signNames.length * 2) {
      const s = signNames[signIdx++ % signNames.length];
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.85, 9), 2.2),
        new THREE.MeshBasicMaterial({ map: signTexture(s[0], s[1], s[2]) })
      );
      const face = Math.floor(rand() * 4);
      const y = Math.min(h - 2, 4 + rand() * 5);
      if (face === 0) { sign.position.set(x, y, z + d / 2 + 0.07); }
      else if (face === 1) { sign.position.set(x, y, z - d / 2 - 0.07); sign.rotation.y = Math.PI; }
      else if (face === 2) { sign.position.set(x + w / 2 + 0.07, y, z); sign.rotation.y = Math.PI / 2; }
      else { sign.position.set(x - w / 2 - 0.07, y, z); sign.rotation.y = -Math.PI / 2; }
      scene.add(sign);
    }
  }

  const xSegs = [[-98, -72], [-60, -28], [-16, 16], [28, 60], [72, 96]];
  const zSegs = [[-98, -72], [-60, -28], [-16, -6], [6, 16], [28, 60], [72, 98]];
  xSegs.forEach(function (xs) {
    zSegs.forEach(function (zs) {
      if (xs[0] === -60 && zs[0] === 28) return; // hideout block
      const beach = xs[0] === 72;
      for (let cx = 0; cx < 2; cx++) {
        for (let cz = 0; cz < 2; cz++) {
          if (rand() < 0.22) continue;
          const cellW = (xs[1] - xs[0]) / 2, cellD = (zs[1] - zs[0]) / 2;
          const x = xs[0] + cellW * (cx + 0.5) + (rand() - 0.5) * 2;
          const z = zs[0] + cellD * (cz + 0.5) + (rand() - 0.5) * 2;
          const w = Math.min(cellW - 3, 9 + rand() * 7);
          const d = Math.min(cellD - 3, 9 + rand() * 7);
          const dc = Math.sqrt(x * x + z * z);
          const h = beach ? 5 + rand() * 3 : Math.max(7, 10 + rand() * 26 - dc * 0.12);
          building(x, z, w, d, h);
        }
      }
    });
  });

  // Palms: Harbor Blvd sidewalks + boardwalk.
  const trunkMat = mat(0x7a5c3e), frondMat = mat(0x2e7d46, { side: THREE.DoubleSide });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 4.6, 5), trunkMat);
    trunk.position.y = 2.3; trunk.rotation.z = (rand() - 0.5) * 0.15; trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 4), frondMat);
      const a = (i / 5) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1, 4.9, Math.sin(a) * 1.1);
      frond.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15);
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    world.colliders.push({ x: x, z: z, hw: 0.35, hd: 0.35 });
  }
  for (let x = -92; x <= 92; x += 13) { palm(x + rand() * 2, -8.6); palm(x + rand() * 2, 8.6); }
  for (let z = -96; z <= 96; z += 16) { palm(90.5, z + rand() * 2); }

  // Hideout: Skyline Garage — open-front garage in its own block.
  const wallMat = mat(0x6b5a4a), darkMat = mat(0x1c1a1e);
  function wallBox(w, h, d, x, y, z, m) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || wallMat);
    b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; scene.add(b); return b;
  }
  wallBox(21, 6.5, 1, -44, 3.25, 47);                       // back
  wallBox(1, 6.5, 15, -54.5, 3.25, 40);                     // west side
  wallBox(1, 6.5, 15, -33.5, 3.25, 40);                     // east side
  wallBox(22, 0.7, 16, -44, 6.6, 40, roofMat0());            // roof slab
  function roofMat0() { return mat(0x333038); }
  wallBox(22, 1.1, 1, -44, 5.9, 32.8);                      // front lintel
  const floorIn = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), darkMat);
  floorIn.rotation.x = -Math.PI / 2; floorIn.position.set(-44, 0.07, 40); scene.add(floorIn);
  const gSign = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('SKYLINE GARAGE', '#ffd98a', '#241a10') })
  );
  gSign.position.set(-44, 5.6, 32.2); gSign.rotation.y = Math.PI; scene.add(gSign);
  world.colliders.push({ x: -44, z: 47, hw: 10.5, hd: 0.6 });
  world.colliders.push({ x: -54.5, z: 40, hw: 0.6, hd: 7.5 });
  world.colliders.push({ x: -33.5, z: 40, hw: 0.6, hd: 7.5 });

  // Checkpoint gates (mission 3 rings).
  const gatePos = [[22, -22], [66, -66], [66, 22], [-22, 66], [-66, -22]];
  gatePos.forEach(function (p) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.22, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x39ff88 })
    );
    ring.position.set(p[0], 3.2, p[1]); scene.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 34, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.set(p[0], 17, p[1]); scene.add(beam);
    world.gates.push({ x: p[0], z: p[1], ring: ring, beam: beam });
  });

  // Cash briefcase pickup spots (sidewalks / landmarks).
  world.pickupSpots = [
    [-22, -8.6], [22, 8.6], [66, -30], [-66, 30], [8, -22], [-8, 66],
    [88, 40], [88, -52], [-44, -8.6], [44, 22], [120, 0], [-90, -90]
  ];
  return world;
}

window.VHWorld = { buildWorld: buildWorld, makeRng: makeRng };
})();
