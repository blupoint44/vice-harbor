[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/blupoint44/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Vice Harbor

An original open-world crime game set in a golden-hour coastal city: procedural
towers with lit windows, palm boulevards, invented neon signs, an ocean
boardwalk and pier, and a hideout garage. Roam on foot or steal and drive cars,
dodge traffic AI and pedestrians, raise wanted stars and outrun the police,
and work through a three-mission story chain.

## Run

Serve the `game/` folder with any static server (for example
`python3 -m http.server` inside `game/`) and open `index.html` in a desktop
browser. No libraries and no network requests are needed.

Or build the submission dossier with `MAKEFUN_OUTPUT_DIR=out node main.ts`.

## Controls

- WASD — move / drive
- Mouse or Q / E — camera orbit
- Shift — sprint
- E — enter / exit car
- Click — shoot pistol
- Space — handbrake
- Esc / P — pause

## Features

- Procedural city with traffic, pedestrians and police pursuit AI
- Wanted-star system, hitscan pistol combat, health and cash
- Three-mission story: timed delivery, two-star escape, five-gate checkpoint run
- HUD with canvas minimap, title / pause / end screens
- Progress saved in localStorage; sound synthesized with WebAudio
- Deterministic screenshot scenes via `?shot=start|play|chase|mission&seed=1`
