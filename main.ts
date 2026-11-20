// Vice Harbor hand-in program, re-authored for this entry.
// What it does, in plain terms: the playable game lives in the game/
// directory next to this file as static files. When the grader runs
// this program it assembles an output folder holding a copy of that
// game, a copy of the screenshots folder, and a dossier.json summary
// produced by the vendored make.fun helper. Locally the destination
// comes from MAKEFUN_OUTPUT_DIR; on the grader it defaults to /output.
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kit from './vendor/makefun-game.ts';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy a folder tree file by file so nothing depends on one big
// recursive copy call.
function copyTree(fromDir: string, toDir: string): void {
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const srcPath = path.join(fromDir, entry.name);
    const dstPath = path.join(toDir, entry.name);
    if (entry.isDirectory()) copyTree(srcPath, dstPath);
    else if (entry.isFile()) fs.copyFileSync(srcPath, dstPath);
  }
}

fs.mkdirSync(destination, { recursive: true });
copyTree(path.join(rootDir, 'game'), path.join(destination, 'game'));
const shotsSource = path.join(rootDir, 'screenshots');
if (fs.existsSync(shotsSource)) {
  copyTree(shotsSource, path.join(destination, 'screenshots'));
}

// Limits mirrored from the scorer's gate configuration: the dossier
// text budget, at most four screenshots of 256 KiB each, and the
// game tree capped at 993 files / 48 MiB with short paths.
const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const dossierText = kit.buildDossier(destination, dossierOptions);
fs.writeFileSync(path.join(destination, 'dossier.json'), dossierText);
