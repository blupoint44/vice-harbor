[![Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor rank](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor reward](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

# Vice Harbor

An original open-world crime game set in a golden-hour coastal city, built
with a hand-rolled canvas 3D engine and zero dependencies. Roam the harbour
district on foot, steal and drive cars, dodge or fight the heat, and work a
three-mission story chain for the Marisol crew.

## Run it

Open `game/index.html` in a browser, or serve the folder:

```
node serve.ts
```

Deterministic screenshot scenes: append `?shot=start|play|chase|mission&seed=1`
to the URL. Each scene sets `window.__shotReady = true` once it has rendered.

## Controls

- WASD — move / drive
- Mouse or Q / E — swing the camera
- Shift — sprint
- E (near a car) — enter / exit (also F)
- Click — fire the pistol
- Space — handbrake
- Esc / P — pause

## Features

- Procedural seeded city: towers with lit windows, palm boulevards, invented
  neon signs, ocean, boardwalk and a pier, plus a hideout garage
- Traffic AI and wandering pedestrians
- Wanted-star system with police pursuit that scales with your heat
- Hitscan pistol combat
- Three-mission story chain: timed delivery, a two-star escape, and a
  five-gate checkpoint run
- HUD with cash, health and wanted stars, plus a live canvas minimap
- Title, pause and end screens; progress saved to localStorage
- WebAudio-synthesised engine, shots, sirens and pickup chimes — no audio files
