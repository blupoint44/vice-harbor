// Vice Harbor — world.js (part 1): seeded RNG, canvas textures, city geometry.
// Builds the golden-hour coastal city: tower grid, roads, palms, neon signs,
// ocean, boardwalk, pier and the hideout garage. Exposes window.VHWorld.
(function () {
  'use strict';

  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function windowTexture(rng, base, lit) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 120; y += 10) {
      for (let x = 5; x < 58; x += 9) {
        g.fillStyle = rng() < 0.42 ? lit : 'rgba(20,26,44,0.9)';
        g.fillRect(x, y, 5, 6);
      }
    }
    return new THREE.CanvasTexture(c);
  }

  function signTexture(text, fg, bg) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 256, 64);
    g.font = 'bold 32px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = fg; g.shadowBlur = 16;
    g.fillStyle = fg;
    g.fillText(text, 128, 34);
    return new THREE.CanvasTexture(c);
  }

  const SIGNS = [
    ['VICE HARBOR', '#ff5fa2', '#1a0b26'],
    ['PALM ROYALE', '#37e0c8', '#06222b'],
    ['NEON TIDES', '#ffd23e', '#241a00'],
    ['MARINA 9', '#6ab8ff', '#081a33'],
    ['CASA SOL', '#ff8a5c', '#2b1006'],
    ['HOTEL AZUL', '#c792ff', '#170b2e'],
    ['DOCK & DINE', '#7dff8a', '#06240c'],
    ['SUNSET FM', '#ff5f5f', '#2b0606']
  ];

  function buildCity(scene, seed) {
    const rng = makeRng(seed * 7919 + 13);
    const world = {
      size: 420, block: 60, road: 16,
      colliders: [], signs: [],
      garage: new THREE.Vector3(-114, 0, 114),
      pierEnd: new THREE.Vector3(114, 0, 240)
    };
    const step = world.block + world.road; // 76
    world.step = step;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshLambertMaterial({ color: 0x8a7a5e })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 280),
      new THREE.MeshLambertMaterial({ color: 0x1d6f9f })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, 0.02, 345);
    scene.add(ocean);
    world.ocean = ocean;

    const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e2e38 });
    for (let i = -3; i <= 3; i++) {
      const p = i * step;
      const rx = new THREE.Mesh(new THREE.PlaneGeometry(world.size + 90, world.road), roadMat);
      rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.01, p);
      scene.add(rx);
      const rz = new THREE.Mesh(new THREE.PlaneGeometry(world.road, world.size + 90), roadMat);
      rz.rotation.x = -Math.PI / 2; rz.position.set(p, 0.01, 0);
      scene.add(rz);
    }
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(world.size + 90, 14),
      new THREE.MeshLambertMaterial({ color: 0xb08d5f })
    );
    board.rotation.x = -Math.PI / 2;
    board.position.set(0, 0.03, 196);
    scene.add(board);

    const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7648 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 92), pierMat);
    pier.position.set(114, 0.5, 242);
    scene.add(pier);
    for (let i = 0; i < 6; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 6), pierMat);
      post.position.set(110 + (i % 2) * 8, -1, 208 + Math.floor(i / 2) * 34);
      scene.add(post);
    }
    return { world, rng };
  }

  window.VHWorld = { makeRng, windowTexture, signTexture, SIGNS, buildCity };
})();

// world.js (part 2): towers with lit windows, palm boulevards, neon signs, garage.
(function () {
  'use strict';
  const W = window.VHWorld;

  function populateCity(scene, world, rng) {
    const step = world.step;
    const bases = ['#3a4a6b', '#5b3a5e', '#2e4a4a', '#6b4a2e', '#44475e', '#59324a'];
    const lits = ['#ffd98a', '#9fe8ff', '#ffb3d9', '#c8ffb3'];
    let signIdx = 0;

    function palm(x, z) {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6),
        new THREE.MeshLambertMaterial({ color: 0x7a5c36 })
      );
      trunk.position.y = 2.7;
      grp.add(trunk);
      const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e9e4f });
      for (let i = 0; i < 6; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 4), leafMat);
        const a = (i / 6) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 1.2, 5.6, Math.sin(a) * 1.2);
        leaf.rotation.z = Math.cos(a) * 1.1;
        leaf.rotation.x = -Math.sin(a) * 1.1;
        grp.add(leaf);
      }
      grp.position.set(x, 0, z);
      scene.add(grp);
    }

    for (let bx = -3; bx <= 3; bx++) {
      for (let bz = -3; bz <= 3; bz++) {
        if (bz === 3) continue; // shore row stays open (boardwalk / ocean)
        const cx = bx * step, cz = bz * step;
        // Skip the garage block (SW) — the hideout sits there instead.
        if (bx === -2 && bz === 2) continue;
        const n = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const w = 14 + rng() * 12;
          const d = 14 + rng() * 12;
          const h = 18 + rng() * 46;
          const px = cx + (rng() - 0.5) * (world.block - w - 4);
          const pz = cz + (rng() - 0.5) * (world.block - d - 4);
          const tex = W.windowTexture(rng, bases[Math.floor(rng() * bases.length)], lits[Math.floor(rng() * lits.length)]);
          const mat = new THREE.MeshLambertMaterial({ map: tex });
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(px, h / 2, pz);
          scene.add(b);
          world.colliders.push({ x: px, z: pz, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
          if (h > 34 && signIdx < W.SIGNS.length * 3) {
            const s = W.SIGNS[signIdx % W.SIGNS.length];
            signIdx++;
            const sign = new THREE.Mesh(
              new THREE.PlaneGeometry(13, 3.2),
              new THREE.MeshBasicMaterial({ map: W.signTexture(s[0], s[1], s[2]) })
            );
            sign.position.set(px, h * 0.72, pz + d / 2 + 0.15);
            scene.add(sign);
            world.signs.push(sign);
          }
        }
        // Palms at block corners.
        palm(cx - step / 2 + 4, cz - step / 2 + 4);
        palm(cx + step / 2 - 4, cz + step / 2 - 4);
      }
    }
    // Boardwalk palm row.
    for (let x = -220; x <= 220; x += 22) palm(x, 188);

    // Hideout garage: open-front box building with a glowing door frame.
    const g = world.garage;
    const gMat = new THREE.MeshLambertMaterial({ color: 0x555c6e });
    const back = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 1), gMat);
    back.position.set(g.x, 4, g.z - 10);
    scene.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 20), gMat);
    left.position.set(g.x - 10.5, 4, g.z);
    scene.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 20), gMat);
    right.position.set(g.x + 10.5, 4, g.z);
    scene.add(right);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(22, 1, 21), gMat);
    roof.position.set(g.x, 8.5, g.z);
    scene.add(roof);
    const gSign = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 3.4),
      new THREE.MeshBasicMaterial({ map: W.signTexture('HIDEOUT GARAGE', '#37e0c8', '#0a1a22') })
    );
    gSign.position.set(g.x, 6.8, g.z + 10.6);
    scene.add(gSign);
    world.colliders.push({ x: g.x, z: g.z - 10, hw: 11.4, hd: 0.9 });
    world.colliders.push({ x: g.x - 10.5, z: g.z, hw: 0.9, hd: 10.4 });
    world.colliders.push({ x: g.x + 10.5, z: g.z, hw: 0.9, hd: 10.4 });
  }

  W.populateCity = populateCity;
})();
