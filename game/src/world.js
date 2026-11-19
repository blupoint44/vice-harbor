// Vice Harbor world generation.
// Everything in the city is derived from one seeded random stream, so a given
// seed always produces the same streets, towers and palm rows. That is what
// makes the screenshot scenes reproducible.

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CITY = {
  half: 190,          // streets run from -half..half on both axes
  block: 38,          // distance between neighbouring avenues
  roadHalf: 5.5,      // half width of a street
  shoreZ: -148,       // south of this line the boardwalk and ocean begin
};

const TOWER_SKINS = [
  { wall: '#8a5a44', trim: '#e8b04b' },
  { wall: '#5d6e8a', trim: '#7fe7d2' },
  { wall: '#a26769', trim: '#ffd166' },
  { wall: '#4f5d75', trim: '#ff7bac' },
  { wall: '#77685d', trim: '#9bf6ff' },
  { wall: '#63535f', trim: '#caffbf' },
];

export function isRoad(x, z) {
  if (z < CITY.shoreZ) return false;
  const bx = Math.abs(((x % CITY.block) + CITY.block) % CITY.block);
  const bz = Math.abs(((z % CITY.block) + CITY.block) % CITY.block);
  return bx < CITY.roadHalf || bx > CITY.block - CITY.roadHalf ||
         bz < CITY.roadHalf || bz > CITY.block - CITY.roadHalf;
}

function towerAt(rng, x, z) {
  const skin = TOWER_SKINS[Math.floor(rng() * TOWER_SKINS.length)];
  return {
    x, z,
    w: 9 + rng() * 7,
    d: 9 + rng() * 7,
    h: 10 + Math.pow(rng(), 1.6) * 42,
    wall: skin.wall,
    trim: skin.trim,
    litSeed: Math.floor(rng() * 100000),
    sign: -1,
  };
}

export function buildHarbor(seed) {
  const rng = makeRng(seed * 7919 + 17);
  const buildings = [];
  for (let gx = -CITY.half + 12; gx < CITY.half - 8; gx += CITY.block) {
    for (let gz = CITY.shoreZ + 20; gz < CITY.half - 8; gz += CITY.block) {
      if (rng() < 0.14) continue; // a few empty lots keep the skyline honest
      buildings.push(towerAt(rng, gx + 8 + rng() * 8, gz + 8 + rng() * 8));
      if (rng() < 0.3) buildings.push(towerAt(rng, gx + 22 + rng() * 6, gz + 20 + rng() * 6));
    }
  }
  const palms = [];
  for (let x = -CITY.half + 6; x < CITY.half; x += 13) {
    palms.push({ x: x + rng() * 3, z: CITY.shoreZ + 4 + rng() * 2, s: 0.9 + rng() * 0.5 });
    if (rng() < 0.7) palms.push({ x: x + 6, z: CITY.shoreZ + 10, s: 0.8 + rng() * 0.4 });
  }
  for (let i = 0; i < 46; i++) {
    const along = -CITY.half + rng() * CITY.half * 2;
    const onX = rng() < 0.5;
    palms.push(onX
      ? { x: along, z: Math.round((rng() * 8 - 4)) * CITY.block + CITY.roadHalf + 1.4, s: 0.85 + rng() * 0.4 }
      : { x: Math.round((rng() * 8 - 4)) * CITY.block + CITY.roadHalf + 1.4, z: Math.max(CITY.shoreZ + 14, along), s: 0.85 + rng() * 0.4 });
  }
  return { buildings, palms };
}

// Invented neon signage for the harbour strip — every name is made up for
// this game. A handful of towers get one of these bolted to their face.
export const NEON_SIGNS = [
  { text: 'MARISOL', color: '#ff7bac' },
  { text: 'HOTEL CORALINA', color: '#7fe7d2' },
  { text: 'PIER 9 DINER', color: '#ffd166' },
  { text: 'VELVET TIDE', color: '#c77dff' },
  { text: 'GARAGE SOL', color: '#9bf6ff' },
  { text: 'CAFE BRISA', color: '#caffbf' },
  { text: 'CLUB FARO', color: '#ff9e6b' },
  { text: 'BAHIA RECORDS', color: '#f9f871' },
];

export function decorateSigns(harbor, seed) {
  const rng = makeRng(seed * 331 + 7);
  const nearShore = harbor.buildings
    .filter((b) => b.z < CITY.shoreZ + 90 && b.h > 18)
    .sort((a, b) => a.x - b.x);
  nearShore.forEach((b, i) => {
    if (i % 2 === 0) b.sign = Math.floor(rng() * NEON_SIGNS.length);
  });
  return harbor;
}

// The Marisol crew's three jobs, in order. Each entry is plain data; the
// game loop in game.js interprets the kind.
export const MISSIONS = [
  {
    title: 'Warm Handoff',
    brief: 'Get the silver coupe to Pier 9 before the timer dies.',
    kind: 'delivery',
    target: { x: -114, z: CITY.shoreZ + 6 },
    time: 75,
    reward: 400,
  },
  {
    title: 'Heat Check',
    brief: 'Shake a two-star tail and reach the Sol Garage hideout.',
    kind: 'escape',
    target: { x: 76, z: 38 },
    time: 90,
    reward: 650,
    wanted: 2,
  },
  {
    title: 'Harbor Run',
    brief: 'Thread all five checkpoint gates along the boulevard.',
    kind: 'gates',
    gates: [
      { x: -152, z: -76 }, { x: -76, z: 0 }, { x: 0, z: -76 },
      { x: 76, z: 0 }, { x: 152, z: -76 },
    ],
    time: 110,
    reward: 1000,
  },
];

export const HIDEOUT = { x: 76, z: 38, r: 9 };

export function trafficSpawn(rng, i) {
  // Cars live on the avenue grid: half run north-south, half east-west.
  const lane = CITY.roadHalf - 2.2;
  const axisRoad = Math.round((rng() * 9 - 4.5)) * CITY.block;
  const along = -CITY.half + rng() * CITY.half * 2;
  const northSouth = i % 2 === 0;
  const dir = rng() < 0.5 ? 1 : -1;
  return northSouth
    ? { x: axisRoad + lane * dir, z: along, angle: dir > 0 ? 0 : Math.PI, speed: 9 + rng() * 7, hue: rng() }
    : { x: along, z: Math.max(CITY.shoreZ + CITY.block, axisRoad + lane * dir), angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2, speed: 9 + rng() * 7, hue: rng() };
}

export function pedSpawn(rng) {
  const onX = rng() < 0.5;
  const road = Math.round((rng() * 9 - 4.5)) * CITY.block;
  const along = -CITY.half + rng() * CITY.half * 2;
  return onX
    ? { x: along, z: Math.max(CITY.shoreZ + 8, road + CITY.roadHalf + 0.9), dir: rng() < 0.5 ? 1 : -1, alongX: true, speed: 1.1 + rng() * 0.9, hue: rng() }
    : { x: road + CITY.roadHalf + 0.9, z: Math.max(CITY.shoreZ + 8, along), dir: rng() < 0.5 ? 1 : -1, alongX: false, speed: 1.1 + rng() * 0.9, hue: rng() };
}
