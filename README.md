# Vice Harbor

An original open-world crime game in a golden-hour coastal city — no third-party IP:
the city, the names and the story are all its own. Explore on foot, take any car you
can reach, work a short three-mission story for Rosa at Cafe Sol, and manage the
attention of the harbour police while you do it.

## Play it

```
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Everything runs offline: the game
is static files under `game/`, with three.js vendored alongside the source.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| Mouse drag, Q / E | Orbit the camera |
| Shift | Sprint on foot |
| E | Steal / enter a car, get out again |
| Mouse click | Fire the pistol (on foot) |
| Space | Handbrake |
| Esc / P | Pause |

## What is in the harbour

- A procedural sunset city: tower grid with lit windows, palm boulevards, ten
  invented neon signs, an ocean, boardwalk and pier, and a hideout garage.
- Traffic that drives the grid, parked cars waiting to be borrowed, and around
  two dozen pedestrians who stroll — and flee when things get loud.
- A 0–5 star wanted system: police spawn, pursue and, from three stars, return
  fire. Get busted or wasted and you respawn at the hideout, minus a fine.
- A chained three-mission story: a timed delivery, an escape at two stars, and a
  five-gate checkpoint run, each with a timer and a cash payout.
- HUD with cash, health, wanted stars, objective and speed, plus a live canvas
  minimap with blips for you, the police and the current objective.
- Title, pause and busted/wasted screens, and a localStorage save (cash and
  mission progress) behind the Continue button.
- Sound with no audio files: engine, siren, gunshots and UI stings are all
  synthesised with WebAudio and start on the first user gesture.

## Screenshot scenes

Deterministic staging for captures, frozen from a fixed seed:

```
http://localhost:8080/?shot=start&seed=1
http://localhost:8080/?shot=play&seed=1
http://localhost:8080/?shot=chase&seed=1
http://localhost:8080/?shot=mission&seed=1
```

Each scene sets `window.__shotReady` once it has rendered.

## Layout

- `game/index.html` — page, HUD, menus and styling
- `game/src/util.js` — seeded random source and shared maths
- `game/src/audio.js` — the WebAudio synthesiser
- `game/src/city.js` — the procedural city, ocean and hideout
- `game/src/actors.js` — car and pedestrian factories, traffic and crowd brains
- `game/src/game.js` — the loop: player, driving, police, combat, missions, HUD
- `game/vendor/three.min.js` — vendored three.js
- `main.ts` — copies `game/` and `screenshots/` out and writes `dossier.json`
