// Vice Harbor world generation: a golden-hour coastal city laid out on a
// street grid, built deterministically from a seed so screenshot scenes and
// saved games always see the same streets. Pure data here, no drawing.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const CITY = {
  block: 220,          // one city block, world units
  road: 46,            // road width centred on grid lines
  cols: 9, rows: 8,    // blocks across / deep
  shoreX: -260,        // west of this x the boardwalk and ocean begin
};

const SIGN_WORDS = [
  'MARLIN CLUB', 'HOTEL SOLACE', 'NEON PALMS', 'CASA AZUL', 'VICE INK',
  'TIDAL BAR', 'SOLSTICE', 'PALM COURT', 'EL FARO', 'ORO LIQUOR',
  'HAVEN MOTEL', 'CLUB LUMEN', 'SURF & SAND', 'DONA MARIA', 'PIER 9',
];
const PALETTE = ['#e8b04b', '#d96f4e', '#7fb5b5', '#c9d6df', '#e07a9a', '#8fae6b', '#b08968', '#6b8cae'];

export function buildWorld(seed) {
  const rnd = makeRng(seed * 7919 + 13);
  const { block, cols, rows } = CITY;
  const buildings = [];
  const palms = [];
  const signs = [];
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const bx = cx * block, by = cy * block;
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const w = 60 + rnd() * 70, d = 60 + rnd() * 70;
        const h = 90 + rnd() * 320;
        const x = bx + 30 + rnd() * (block - 60 - w);
        const y = by + 30 + rnd() * (block - 60 - d);
        buildings.push({
          x, y, w, d, h,
          color: PALETTE[Math.floor(rnd() * PALETTE.length)],
          winSeed: Math.floor(rnd() * 1e9),
          lit: 0.35 + rnd() * 0.4,
        });
        if (rnd() < 0.55) {
          signs.push({
            x: x + w / 2, y: y - 2, h: h * (0.55 + rnd() * 0.3),
            text: SIGN_WORDS[Math.floor(rnd() * SIGN_WORDS.length)],
            hue: Math.floor(rnd() * 360),
          });
        }
      }
      for (let p = 0; p < 3; p++) {
        palms.push({ x: bx + 12 + rnd() * (block - 24), y: by + 8 + rnd() * 16, s: 0.8 + rnd() * 0.5 });
        palms.push({ x: bx + 12 + rnd() * (block - 24), y: by + block - 24 + rnd() * 16, s: 0.8 + rnd() * 0.5 });
      }
    }
  }
  for (let y = -40; y < rows * block + 80; y += 55) {
    palms.push({ x: CITY.shoreX + 26 + rnd() * 20, y, s: 0.9 + rnd() * 0.6 });
  }
  const pier = { x0: CITY.shoreX - 320, x1: CITY.shoreX + 10, y: 3.2 * block, w: 54 };
  const hideout = { x: 1.5 * block, y: 0.5 * block, w: 90, d: 70 };
  return {
    buildings, palms, signs, pier, hideout,
    width: cols * block, height: rows * block,
    gates: [0, 1, 2, 3, 4].map((i) => ({ x: (1.5 + i * 1.4) * block, y: (6.5 - i * 1.1) * block, r: 60, hit: false })),
  };
}

// Road helpers shared by traffic AI, collision and the minimap.
export function onRoadX(x) { // vertical road if x sits on a grid line band
  const m = ((x % CITY.block) + CITY.block) % CITY.block;
  return m < CITY.road / 2 || m > CITY.block - CITY.road / 2;
}
export function onRoadY(y) {
  const m = ((y % CITY.block) + CITY.block) % CITY.block;
  return m < CITY.road / 2 || m > CITY.block - CITY.road / 2;
}
export function buildingHit(world, x, y, pad) {
  for (const b of world.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.d + pad) return b;
  }
  return null;
}
export function clampToCity(world, p) {
  p.x = Math.max(CITY.shoreX - 300, Math.min(world.width + 60, p.x));
  p.y = Math.max(-60, Math.min(world.height + 60, p.y));
}
