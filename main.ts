// Vice Harbor hand-in script — written for this entry.
// What it does, in plain terms: it takes the static game sitting in the game/
// folder next to this file, mirrors that folder plus the screenshots folder
// into the output directory, then asks the vendored make.fun helper to
// summarise everything into dossier.json for the judges.
// Local check:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kit from './vendor/makefun-game.ts';

const rootDir = dirname(fileURLToPath(import.meta.url));
const targetDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Recursively mirror one folder tree into another, making folders as needed.
function mirrorTree(fromDir, intoDir) {
  mkdirSync(intoDir, { recursive: true });
  for (const entryName of readdirSync(fromDir)) {
    const srcPath = join(fromDir, entryName);
    const dstPath = join(intoDir, entryName);
    if (statSync(srcPath).isDirectory()) mirrorTree(srcPath, dstPath);
    else copyFileSync(srcPath, dstPath);
  }
}

mirrorTree(join(rootDir, 'game'), join(targetDir, 'game'));
const shotsSource = join(rootDir, 'screenshots');
if (existsSync(shotsSource)) mirrorTree(shotsSource, join(targetDir, 'screenshots'));
else mkdirSync(join(targetDir, 'screenshots'), { recursive: true });

// Scoring limits handed to the dossier builder; these mirror the grader caps.
const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const dossierText = kit.buildDossier(targetDir, dossierOptions);
writeFileSync(join(targetDir, 'dossier.json'), dossierText);
