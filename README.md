[![Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor rank](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![Vice Harbor reward](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

# Vice Harbor

An original open-world crime game set in a golden-hour coastal city — no third-party IP,
every name, sign and story beat invented for this entry. Built with three.js (vendored,
fully offline) as plain static files under `game/`.

You are a runner for Marisol Vega, fixer of Pier 9. Cross a procedural city of lit towers,
palm boulevards and neon signs; walk the boardwalk, steal cars, outrun the harbor patrol
and finish a three-mission story chain: a timed delivery to the pier, an escape at two
wanted stars, and a five-gate checkpoint run across the city.

## Features

- Procedural coastal city: tower blocks with lit windows, invented neon signs, ocean,
  boardwalk, pier and a hideout garage
- On-foot movement with sprint and a mouse/Q/E orbit camera
- Steal and drive cars; traffic AI circulates the road grid
- Pedestrians who stroll the sidewalks and flee from gunfire and fast cars
- Wanted system (0–5 stars) with police pursuit, flashing light bars and bust pressure
- Hitscan pistol combat on foot
- Three chained missions with timers, checkpoint gates, cash rewards
- HUD with cash, wanted stars, mission tracker, speedometer and a live canvas minimap
- Title, pause and end screens; progress saved in localStorage
- WebAudio-synthesized engine, siren, gunshot and chime sounds (no audio files)

## Controls

- **WASD** — move / drive
- **Mouse drag or Q** — camera
- **Shift** — sprint
- **E** — enter / exit (steal) car
- **Mouse click** — shoot (on foot)
- **Space** — handbrake
- **Esc / P** — pause

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080
```

Deterministic screenshot scenes: `?shot=cover|drive|chase|mission&seed=1`.

## License

MIT — see `LICENSE`.
