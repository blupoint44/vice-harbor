// Vice Harbor world module: builds the coastal city of Port Solana.
// Deterministic seeded layout: blocks, towers, palms, neon signs, pier.
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const WORLD = { size: 2400, roadEvery: 300, seaX: 1750 };
export const SIGNS = ['PALMS HOTEL','NEON TIDE','CASA SOL','VICE DINER','MARINA 9','CLUB LUMEN','PIER BAR','HOTEL AZUL','TACO REY','SURF SHACK'];
export function buildCity(seed) {
  const rnd = mulberry(seed * 7919 + 13);
  const buildings = [], palms = [], signs = [];
  for (let bx = 0; bx < 6; bx++) for (let bz = 0; bz < 8; bz++) {
    const cx = bx * WORLD.roadEvery + 40, cz = bz * WORLD.roadEvery + 40;
    if (cx > WORLD.seaX - 260) continue;
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const w = 60 + rnd() * 70, d = 60 + rnd() * 70;
      const x = cx + rnd() * 140, z = cz + rnd() * 140;
      const h = 90 + rnd() * 320;
      buildings.push({ x, z, w, d, h, hue: 20 + rnd() * 40, lit: 0.35 + rnd() * 0.5, seed: Math.floor(rnd() * 1e9) });
      if (rnd() < 0.5) signs.push({ x: x + w / 2 + 4, z, h: h * (0.5 + rnd() * 0.3), text: SIGNS[Math.floor(rnd() * SIGNS.length)], hue: Math.floor(rnd() * 360) });
    }
  }
  for (let i = 0; i < 130; i++) {
    const alongRoad = Math.floor(rnd() * 8) * WORLD.roadEvery + (rnd() < 0.5 ? -14 : WORLD.roadEvery - 86);
    palms.push({ x: alongRoad, z: rnd() * WORLD.size, s: 0.8 + rnd() * 0.5 });
    palms.push({ x: rnd() * (WORLD.seaX - 60), z: Math.floor(rnd() * 8) * WORLD.roadEvery + 8, s: 0.8 + rnd() * 0.5 });
  }
  const pier = [];
  for (let i = 0; i < 9; i++) pier.push({ x: WORLD.seaX + 40 + i * 42, z: 1150 });
  return { buildings, palms, signs, pier, garage: { x: 170, z: 170, w: 150, d: 110 } };
}

// Collision + road helpers appended to the world module.
export function onRoad(x, z) {
  const m = WORLD.roadEvery;
  const rx = ((x % m) + m) % m, rz = ((z % m) + m) % m;
  return rx > m - 100 || rz > m - 100;
}
export function collide(buildings, x, z, r) {
  for (const b of buildings) {
    if (x > b.x - r && x < b.x + b.w + r && z > b.z - r && z < b.z + b.d + r) return b;
  }
  return null;
}
export function clampWorld(v) { return Math.max(10, Math.min(WORLD.size - 10, v)); }
