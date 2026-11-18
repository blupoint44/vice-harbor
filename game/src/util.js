// Vice Harbor — small shared helpers: a seeded random source so a given
// ?seed= always grows the same city, plus the maths the rest of the game leans on.
(function () {
  'use strict';

  function makeRng(seed) {
    let state = (seed >>> 0) || 1;
    return function next() {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 4294967296;
    };
  }

  function pick(rng, list) { return list[Math.floor(rng() * list.length) % list.length]; }
  function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
  function angleLerp(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  function readParams() {
    const q = new URLSearchParams(window.location.search);
    const seed = parseInt(q.get('seed') || '1', 10);
    return { shot: q.get('shot') || '', seed: Number.isFinite(seed) ? seed : 1 };
  }

  window.VH = window.VH || {};
  window.VH.util = { makeRng, pick, range, clamp, lerp, dist2, angleLerp, readParams };
})();
