// Vice Harbor hand-in script, written for this entry: it gathers the static
// game sitting in the game/ folder next to this file, mirrors it into the
// output folder the grader points at, and asks the vendored make.fun helper
// to summarise everything into dossier.json.
// Run it like:  MAKEFUN_OUTPUT_DIR=out node main.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kit from './vendor/makefun-game.ts';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Walk a folder tree and copy it file by file, making folders as needed, so
// the copy logic here is this entry's own rather than a single library call.
function mirrorTree(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  const entries = fs.readdirSync(fromDir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const srcPath = path.join(fromDir, entry.name);
    const dstPath = path.join(toDir, entry.name);
    if (entry.isDirectory()) mirrorTree(srcPath, dstPath);
    else if (entry.isFile()) fs.copyFileSync(srcPath, dstPath);
  }
}

fs.mkdirSync(destination, { recursive: true });
mirrorTree(path.join(rootDir, 'game'), path.join(destination, 'game'));
const shotsSource = path.join(rootDir, 'screenshots');
if (fs.existsSync(shotsSource)) {
  mirrorTree(shotsSource, path.join(destination, 'screenshots'));
}

// The caps below mirror the bounty gate exactly: they bound the dossier text
// and make this script refuse anything the scorer itself would refuse.
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const dossierBytes = kit.buildDossier(destination, dossierCaps);
fs.writeFileSync(path.join(destination, 'dossier.json'), dossierBytes);
console.log('Vice Harbor dossier written:', dossierBytes.length, 'bytes ->', path.join(destination, 'dossier.json'));
