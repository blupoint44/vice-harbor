// Vice Harbor — hand-in program for the gta6-01 bounty (Node 22, standard library
// only). The playable game lives in game/ as plain static files: index.html, a handful
// of classic scripts under game/src/, and three.js vendored at game/vendor/. Nothing
// is built or fetched; this program simply copies game/ and screenshots/ into the
// output directory and asks the vendored make.fun library to summarise them into
// dossier.json, exactly as the scorer will.
//
// Run it the way the grader does, or locally with an output override:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game itself with:  node serve.ts   ->  http://localhost:8080

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output tree: the game folder wholesale, then the screenshots beside it.
mkdirSync(outputDir, { recursive: true });
cpSync(join(entryDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(entryDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The caps below mirror the scorer's gate, so an entry the scorer would refuse
// (too many or too-large screenshots, an oversized game tree, an over-long path)
// fails here first, on my machine, instead of after submission.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
