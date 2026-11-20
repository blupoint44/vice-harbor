[![Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor rank](https://make.fun/badge/gta6-01/lively-meteor-52/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor reward](https://make.fun/badge/gta6-01/lively-meteor-52/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

# Vice Harbor

An original open-world crime game set in a golden-hour coastal city — procedural
towers with lit windows, palm boulevards, invented neon signs, an ocean
boardwalk and pier, and a hideout garage. Everything is drawn by a
self-contained projected-3D canvas engine: no libraries, no assets, no network.

## Run it

```sh
node serve.ts          # then open http://localhost:8080
# or simply open game/index.html in a desktop browser
```

To hand it in / verify the dossier:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

- **WASD** — walk / drive
- **Q / E camera on foot, mouse** — look and aim (E also enters/exits cars when not turning)
- **Shift** — sprint
- **E** — enter / exit (or steal) a car, including police cruisers
- **Click** — fire the pistol (hitscan)
- **Space** — handbrake
- **Esc / P** — pause

## Features

- Play on foot or steal and drive any car; traffic AI cruises the grid and
  pedestrians stroll — or flee — the boulevards.
- Wanted-star system: crimes raise heat, harbour police cruisers spawn and
  pursue; lose them to cool down.
- A 3-mission story chain for the Marlin Club: a timed pier delivery, an
  escape to the hideout garage at 2 stars, and a 5-gate checkpoint run.
- HUD with cash, health, wanted stars and speed, plus a live canvas minimap.
- Title, pause and end screens; progress (cash, jobs done) saved to
  localStorage.
- WebAudio-synthesized sound: engine hum, gunshots, sirens and cash jingles.
- Deterministic screenshot scenes: `?shot=start|play|chase|mission&seed=1`
  (each sets `window.__shotReady` once rendered).

Built for the make.fun gta6-01 bounty: https://make.fun/bounty/gta6-01
Play more entries via my referral link: https://make.fun/r/43vjng2p
