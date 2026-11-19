[![Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor rank](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor reward](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

# Vice Harbor

An original open-world crime game set in a golden-hour coastal city, built with three.js.
Cruise palm boulevards, steal cars, dodge the Harbor Patrol, and run a three-mission story
chain from the pier to the Skyline Garage hideout.

## Run it

```
node serve.ts          # or: node main.ts with MAKEFUN_OUTPUT_DIR set for the dossier build
```

Then open http://localhost:8080 — the game is fully offline, no network requests.

## Controls

- **WASD** — move / drive
- **Mouse** (click canvas to lock) / **Q / E** — camera
- **Shift** — sprint
- **E** — enter / exit car (context: the interact key is **F** when a car is near; see HUD hint)
- **Click** — shoot pistol (on foot, pointer locked)
- **Space** — handbrake
- **Esc / P** — pause

## Features

- Procedural golden-hour city: lit-window towers, invented neon signs, palm boulevards,
  ocean, boardwalk and a fishing pier
- On-foot and driving play with traffic AI, pedestrians and parked cars to steal
- Wanted-star system with Harbor Patrol pursuit, bust meter and escape decay
- Hitscan pistol combat, cash briefcase pickups, vehicle damage and player health
- Three-mission story chain: timed pier delivery, a two-star escape, and a five-gate
  checkpoint run — with HUD, canvas minimap, title / pause / end screens
- localStorage save (career cash, missions completed, best Gate Rush time)
- WebAudio-synthesized engine, siren, gunshot and pickup sounds — no audio files
- Deterministic screenshot scenes via `?shot=start|play|chase|mission&seed=1`
