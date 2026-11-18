[![Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor rank](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor reward](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

# Vice Harbor

**Sunset never pays its debts.**

Vice Harbor is an original open-world crime game that runs entirely in a
desktop browser from static files — no build step, no network requests, no
asset downloads. A golden-hour harbour city is generated procedurally at
load: a grid of avenues and boulevards with emissive-window towers, palm
trees, invented neon businesses (Hotel Marina, Club Solstice, Diner Luna,
Palms Casino…), streetlights, and an ocean boardwalk with a pier along the
east edge, all lit by a low orange sun.

You play a nobody with a pistol and a talent for borrowing cars. Fixer
**Marina Vale** runs the harbour's grey economy; the **VHPD** runs
everything else. Work her jobs, mind the stars.

## What is in the game

- **A living city** — traffic AI that follows the road grid, turns at
  intersections and brakes for obstacles; parked cars along every street;
  26+ pedestrians who stroll the sidewalks, panic at gunfire and dive away
  from near-miss cars.
- **On foot & driving** — third-person on-foot movement with a mouse-orbit
  follow camera, sprinting, and walk-cycle animation; walk up to any car,
  press **E** and it is yours (the VHPD will have opinions). Arcade driving
  with a chase camera, handbrake, speedometer and engine hum.
- **Wanted system** — five stars. Theft, collisions with pedestrians,
  gunfire and mission mayhem raise them; VHPD cruisers spawn in proportion,
  pursue, ram, and put officers on foot who chase you down and, from three
  stars, shoot. Break line of sight and the heat decays. Get pinned and you
  are **BUSTED**; lose your health and you are **WASTED**. Both cost cash
  and end with a respawn at the pier clinic.
- **Combat** — a hitscan pistol with muzzle flash, tracers and synthesized
  gunshots; pedestrians and officers have health and fall.
- **Three missions** from Marina Vale, offered in sequence at the gold
  marker: *Sunset Delivery* (pickup & timed delivery to the pier kiosk),
  *Hot Harbour* (a drop that goes loud — escape at 2+ stars to the Hideout
  Garage), and *Neon Run* (five glowing gates, one car, one timer). Each
  pays cash under a MISSION PASSED banner; free roam continues after.
- **HUD & minimap** — cash, health bar, wanted stars, objective banner with
  mission timer, speed while driving, and a round live minimap: roads,
  ocean, traffic, pedestrians, flashing police blips and the mission
  marker, with a north indicator.
- **Screens & saving** — title screen over a live city vista (Play /
  Continue / How to Play), pause on Esc/P, busted/wasted end screens with
  run stats. Cash, position, mission progress and lifetime stats persist
  in `localStorage`.
- **Sound, synthesized** — every effect (gunshot, door, pickup chime, cash
  register, mission stings, police siren loop, engine hum) is generated
  with WebAudio oscillators and filtered noise. There are no audio files.

## Controls

| Context | Keys |
| --- | --- |
| On foot | WASD move · mouse or Q/E orbit camera · SHIFT sprint · E enter car · mouse click fire pistol |
| Driving | W/S accelerate, brake & reverse · A/D steer · SPACE handbrake · E exit |
| Anywhere | ESC or P pause · follow the gold marker for missions |

## Run it locally

```sh
node serve.ts
```

then open <http://localhost:8080> in desktop Chrome. Any static file
server pointed at `game/` works just as well — `game/index.html` is the
entry point, three.js r128 is vendored at `game/vendor/three.min.js`, and
every texture is painted on a canvas at runtime.

## Handing it in (make.fun gta6-01)

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes the dossier with the vendored `buildDossier`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

The four screenshots in `screenshots/` are real captures of this game's
own deterministic shot scenes (`game/index.html?shot=start|play|chase|mission&seed=1`,
see `shots.json`).
