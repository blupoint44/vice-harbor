// Vice Harbor world generation — procedural coastal city, deterministic per seed.
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const WORLD_W = 3200, WORLD_H = 2400;
export const SIGNS = ['PALM COURT', 'NEON TIDE', 'VICE HARBOR', 'HOTEL CORAL', 'MARINA 9', 'CLUB SOLSTICE', 'TACO LAGO', 'PIER 7 DINER', 'AZUL LOUNGE', 'SURF & SAND'];
export function buildWorld(seed) {
  const rnd = mulberry(seed * 7919 + 13);
  const buildings = [], palms = [], signs = [];
  const block = 400;
  for (let bx = 0; bx < WORLD_W / block; bx++) {
    for (let by = 0; by < 4; by++) {
      if (rnd() < 0.18) continue;
      const w = 90 + rnd() * 130, d = 90 + rnd() * 130;
      const x = bx * block + 60 + rnd() * 120, y = by * block + 60 + rnd() * 120;
      const floors = 3 + Math.floor(rnd() * 14);
      const hue = [18, 200, 330, 45, 160][Math.floor(rnd() * 5)];
      const wins = [];
      for (let f = 0; f < floors; f++) for (let c = 0; c < Math.floor(w / 22); c++)
        if (rnd() < 0.55) wins.push([c, f, rnd() < 0.8 ? '#ffd97a' : '#9fe8ff']);
      buildings.push({ x, y, w, d, h: floors * 16, floors, hue, wins });
      if (rnd() < 0.5) signs.push({ x: x + w / 2, y: y - 8, text: SIGNS[Math.floor(rnd() * SIGNS.length)], color: ['#ff4fa3', '#22e6ff', '#ffb02e', '#7CFC9a'][Math.floor(rnd() * 4)] });
    }
  }
  // Palms line the boulevards and the boardwalk; the ocean strip is the south edge.
  for (let x = 60; x < WORLD_W; x += 130) {
    palms.push({ x: x + rnd() * 40, y: 1660 + rnd() * 30 });
    if (rnd() < 0.7) palms.push({ x: x + rnd() * 40, y: 1960 + rnd() * 40 });
    if (rnd() < 0.5) palms.push({ x: 120 + rnd() * 30, y: 120 + rnd() * 1400 });
  }
  const gates = [];
  for (let i = 0; i < 5; i++) gates.push({ x: 400 + i * 560, y: 500 + (i % 2) * 700 });
  return {
    buildings, palms, signs, gates,
    oceanY: 2050, pier: { x: 1500, y: 2050, w: 90, len: 300 },
    garage: { x: 240, y: 240, w: 150, d: 110 },
    roadsX: [0, 400, 800, 1200, 1600, 2000, 2400, 2800],
    roadsY: [0, 400, 800, 1200, 1600, 2000],
    spawn: { x: 330, y: 330 },
    drop: { x: 2750, y: 1450 },
  };
}
export function roadSnap(v, roads) {
  let best = roads[0], bd = 1e9;
  for (const r of roads) { const d = Math.abs(r + 200 - v); if (d < bd) { bd = d; best = r + 200; } }
  return best;
}
