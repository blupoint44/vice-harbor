// Vice Harbor — the city itself: a golden-hour coastal grid built procedurally from
// boxes and canvas textures. Streets sit on a regular lattice so traffic, the minimap
// and the mission routes can all reason about the same roads.
(function () {
  'use strict';
  const U = window.VH.util;

  const ROADS = [-120, -60, 0, 60, 120];
  const ROAD_HALF = 7;
  const EDGE = 168; // drivable streets end here; beach and ocean lie east

  const NEON_WORDS = ['VICE HARBOR', 'HOTEL CORAL', 'PALM CLUB', 'NEON DOCK', 'CAFE SOL',
    'MARINA 9', 'TACO LUNA', 'HOTEL AZUL', 'SURF RADIO', 'BAR DELFIN'];
  const NEON_COLORS = ['#ff5da2', '#39d0ff', '#ffd23e', '#7dff6a', '#ff7a3e', '#c792ff'];

  function groundTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d');
    const S = 1024 / 440; // world 440 across -> canvas
    const px = (w) => (w + 220) * S;
    g.fillStyle = '#3d4453'; g.fillRect(0, 0, 1024, 1024); // block pavement
    g.fillStyle = '#2b2f38';
    for (const r of ROADS) { // asphalt bands, both directions
      g.fillRect(px(r - ROAD_HALF - 2), 0, (ROAD_HALF * 2 + 4) * S, 1024);
      g.fillRect(0, px(r - ROAD_HALF - 2), 1024, (ROAD_HALF * 2 + 4) * S);
    }
    g.strokeStyle = '#e8c95a'; g.lineWidth = 2; g.setLineDash([16, 14]);
    for (const r of ROADS) {
      g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), 1024); g.stroke();
      g.beginPath(); g.moveTo(0, px(r)); g.lineTo(1024, px(r)); g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = '#d9b380'; g.fillRect(px(176), 0, 1024 - px(176), 1024); // sand
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function towerTexture(rng, base, litRatio) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 122; y += 10) for (let x = 5; x < 58; x += 9) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98a' : '#bfe6ff') : '#232833';
      g.fillRect(x, y, 6, 6);
    }
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  function signTexture(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#14101c'; g.fillRect(0, 0, 256, 64);
    g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 16; g.fillStyle = color;
    g.fillText(text, 128, 34);
    return new THREE.CanvasTexture(c);
  }

  function build(scene, rng) {
    const colliders = [];
    scene.fog = new THREE.Fog(0xf2a56b, 90, 430);
    const skyGeo = new THREE.SphereGeometry(900, 16, 12);
    const skyC = document.createElement('canvas'); skyC.width = 4; skyC.height = 256;
    const sg = skyC.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#3a4a7a'); grad.addColorStop(0.45, '#b45a7d');
    grad.addColorStop(0.72, '#f2824f'); grad.addColorStop(1, '#ffc46b');
    sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(skyC), side: THREE.BackSide, fog: false,
    }));
    scene.add(sky);

    scene.add(new THREE.HemisphereLight(0xffd9b0, 0x33415e, 0.95));
    const sun = new THREE.DirectionalLight(0xffb36b, 1.5);
    sun.position.set(220, 120, -140); scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 440),
      new THREE.MeshLambertMaterial({ map: groundTexture() }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);

    // Ocean east of the sand, with a boardwalk strip and a short pier.
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(360, 440),
      new THREE.MeshLambertMaterial({ color: 0x1d6f8e, transparent: true, opacity: 0.92 }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(368, 0.25, 0); scene.add(sea);
    const walk = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 400),
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
    walk.position.set(180, 0.25, 0); scene.add(walk);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(64, 1, 10),
      new THREE.MeshLambertMaterial({ color: 0x6e5138 }));
    pier.position.set(214, 0.6, -60); scene.add(pier);
    for (let i = 0; i < 5; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6),
        new THREE.MeshLambertMaterial({ color: 0x4c3826 }));
      post.position.set(190 + i * 14, -0.4, -55); scene.add(post);
    }

    // Towers inside each block cell between streets.
    const bases = ['#5a4a5e', '#4a5568', '#6b4a3f', '#44586b', '#59465a'];
    const texes = bases.map((b, i) => towerTexture(rng, b, 0.42 + i * 0.07));
    for (let bi = 0; bi < ROADS.length - 1; bi++) for (let bj = 0; bj < ROADS.length - 1; bj++) {
      const cx = (ROADS[bi] + ROADS[bi + 1]) / 2, cz = (ROADS[bj] + ROADS[bj + 1]) / 2;
      const count = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < count; k++) {
        const w = U.range(rng, 10, 16), d = U.range(rng, 10, 16), h = U.range(rng, 16, 52);
        const x = cx + U.range(rng, -13, 13), z = cz + U.range(rng, -13, 13);
        const mat = new THREE.MeshLambertMaterial({ map: texes[Math.floor(rng() * texes.length)] });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(x, h / 2, z); scene.add(tower);
        colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
        if (k === 0 && rng() < 0.55) { // a neon sign on the street face of some towers
          const word = NEON_WORDS[(bi * 4 + bj + k) % NEON_WORDS.length];
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.8),
            new THREE.MeshBasicMaterial({ map: signTexture(word, NEON_COLORS[Math.floor(rng() * NEON_COLORS.length)]), transparent: false }));
          sign.position.set(x, Math.min(h - 3, 9), z - d / 2 - 0.15); sign.rotation.y = Math.PI;
          scene.add(sign);
        }
      }
    }

    // Palms: a bent trunk and a fan of fronds, lined along the boulevards.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    function palm(x, z) {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6), trunkMat);
      trunk.position.y = 2.7; trunk.rotation.z = 0.1; grp.add(trunk);
      for (let i = 0; i < 6; i++) {
        const frond = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.7), leafMat);
        const a = (i / 6) * Math.PI * 2;
        frond.position.set(Math.cos(a) * 1.4 + 0.5, 5.5, Math.sin(a) * 1.4);
        frond.rotation.y = -a; frond.rotation.z = -0.35; grp.add(frond);
      }
      grp.position.set(x, 0, z); scene.add(grp);
      colliders.push({ x, z, hw: 0.5, hd: 0.5 });
    }
    for (const r of ROADS) for (let t = -150; t <= 150; t += 30) {
      if (rng() < 0.8) palm(r + ROAD_HALF + 2.5, t + U.range(rng, -3, 3));
      if (rng() < 0.8) palm(t + U.range(rng, -3, 3), r - ROAD_HALF - 2.5);
    }
    for (let z = -150; z <= 150; z += 18) palm(174, z); // beach row

    // The hideout: a low garage with a glowing door, south-west corner.
    const hideout = { x: -148, z: 148 };
    const garage = new THREE.Group();
    const gBody = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 12),
      new THREE.MeshLambertMaterial({ color: 0x707a68 }));
    gBody.position.y = 3; garage.add(gBody);
    const gDoor = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.4),
      new THREE.MeshBasicMaterial({ color: 0x39d0ff }));
    gDoor.position.set(0, 2.2, 6.1); garage.add(gDoor);
    const gSign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.4),
      new THREE.MeshBasicMaterial({ map: signTexture('HIDEOUT', '#7dff6a') }));
    gSign.position.set(0, 7.2, 0); garage.add(gSign);
    garage.position.set(hideout.x, 0, hideout.z); scene.add(garage);
    colliders.push({ x: hideout.x, z: hideout.z, hw: 8.4, hd: 6.4 });

    function hitsBuilding(x, z, pad) {
      for (const c of colliders) {
        if (Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad) return c;
      }
      return null;
    }
    // Slide a point out of any collider it entered, axis by axis.
    function resolve(x, z, pad) {
      const c = hitsBuilding(x, z, pad);
      if (!c) return { x, z };
      const dx = x - c.x, dz = z - c.z;
      const px = c.hw + pad - Math.abs(dx), pz = c.hd + pad - Math.abs(dz);
      if (px < pz) x = c.x + (dx >= 0 ? c.hw + pad : -c.hw - pad);
      else z = c.z + (dz >= 0 ? c.hd + pad : -c.hd - pad);
      return { x, z };
    }

    return { colliders, hideout, hitsBuilding, resolve, ROADS, ROAD_HALF, EDGE, sea };
  }

  window.VH = window.VH || {};
  window.VH.city = { build, ROADS, ROAD_HALF, EDGE };
})();
