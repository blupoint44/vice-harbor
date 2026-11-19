// Vice Harbor packaging step.
//
// Running this file assembles the submission bundle: the playable game and
// its four screenshots are mirrored into the output folder, and a dossier
// describing the game tree is written next to them for the platform to read.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kit from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));

// Walk a folder tree and reproduce it somewhere else, file by file. Written
// out by hand (instead of one library copy call) so the bundle step has no
// surprises about which entries travel and which stay behind.
function mirrorTree(fromDir: string, toDir: string): number {
  let carried = 0;
  mkdirSync(toDir, { recursive: true });
  const entries = readdirSync(fromDir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const srcPath = join(fromDir, entry.name);
    const dstPath = join(toDir, entry.name);
    if (entry.isDirectory()) {
      carried += mirrorTree(srcPath, dstPath);
    } else if (entry.isFile()) {
      writeFileSync(dstPath, readFileSync(srcPath));
      carried += 1;
    }
  }
  return carried;
}

function folderBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? folderBytes(p) : statSync(p).size;
  }
  return total;
}

// The platform's limits for this bounty, gathered in one place so the bundle
// step and the dossier can never drift apart.
const harborCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function assembleBundle(): void {
  const requested = process.env.MAKEFUN_OUTPUT_DIR;
  const outDir = requested ? resolve(here, requested) : join(here, 'out');
  if (!existsSync(join(here, 'game'))) throw new Error('game folder is missing');
  if (!existsSync(join(here, 'screenshots'))) throw new Error('screenshots folder is missing');

  const gameFiles = mirrorTree(join(here, 'game'), join(outDir, 'game'));
  const shotFiles = mirrorTree(join(here, 'screenshots'), join(outDir, 'screenshots'));

  const dossierBytes = kit.buildDossier(here, harborCaps);
  writeFileSync(join(outDir, 'dossier.json'), dossierBytes);

  const summary = {
    gameFiles,
    shotFiles,
    gameBytes: folderBytes(join(here, 'game')),
    dossierBytes: dossierBytes.byteLength,
    outDir,
  };
  console.log('Vice Harbor bundle ready:', JSON.stringify(summary));
}

assembleBundle();
