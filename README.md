[![Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor rank](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor reward](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

# Vice Harbor

An original open-world crime game that runs in a desktop browser from static
files — no build step, no network requests. You are Nico Vale, a wheelman who
washed up in Vice Harbor with nothing but a hideout garage and a phone full of
debts. Work three jobs for fixer Marlowe Reyes, outrun the Harbor Patrol, and
turn a stolen coupe into a way out of the city.

## What is in the game

- **A golden-hour coastal city** — a procedural grid of towers with lit
  windows, palm-lined boulevards, invented neon signs, an ocean shore with a
  boardwalk and a pier, and your hideout garage.
- **On foot and behind the wheel** — walk the streets, steal any parked or
  moving car, and drive with an arcade model (acceleration, drift handbrake,
  chase camera).
- **Living traffic and pedestrians** — AI cars loop the road grid and brake
  for obstacles; pedestrians stroll the sidewalks and flee from danger.
- **Wanted system** — crimes raise your stars (0–5). Harbor Patrol units spawn
  and pursue; at three stars and up they shoot back. Get busted or wasted and
  you respawn at the hideout, fined.
- **Combat** — a hitscan pistol on foot: muzzle flash, tracer, hit feedback.
- **A chained 3-mission story** — a timed package delivery, an escape at two
  stars, and a five-gate checkpoint run across the harbor, with cash payouts.
- **HUD and minimap** — cash, health, wanted stars, mission objective and
  timer, speedometer, and a live canvas minimap with blips for cars, police,
  pedestrians and your objective.
- **Screens and save** — title screen (Play / Continue / How to play), pause,
  busted / wasted / story-complete end screens, and a localStorage save of
  cash, mission progress and position.
- **Synthesized sound** — engine hum, sirens, gunshots, pickup and mission
  stings, all generated with WebAudio. No audio files.

## Run it

```
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

Deterministic screenshot scenes (used for the entry screenshots):
`?shot=start`, `?shot=play`, `?shot=chase`, `?shot=mission`, each with
`&seed=1`.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse move, Q / E | Orbit camera on foot |
| Shift | Sprint |
| F | Enter / exit car |
| Mouse click | Shoot (on foot) |
| Space | Handbrake (in car) |
| Esc / P | Pause |

## Layout

- `game/index.html` — page, HUD and screens markup
- `game/src/util.js` — seeded RNG and small math helpers
- `game/src/audio.js` — WebAudio synthesized sound effects
- `game/src/city.js` — procedural city, ocean, palms, neon, roads
- `game/src/actors.js` — traffic cars, pedestrians and police units
- `game/src/game.js` — the game itself: player, driving, combat, wanted,
  missions, HUD, minimap, save and screenshot scenes
- `game/vendor/three.min.js` — vendored three.js (minified library build)
- `main.ts` — hands the entry in: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`
- `serve.ts` — tiny static server for local play

MIT licensed — see `LICENSE`.
