// Vice Harbor — entrypoint for make.fun competition gta6-01.
// Node 22, standard library only. Copies the static game in game/ and the
// screenshots in screenshots/ into the output directory, then writes
// dossier.json with the kit's vendored buildDossier (vendor/makefun-game.ts,
// byte-identical to the kit copy — do not edit it).
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// Caps mirror the gate: dossier text capped at 160 KiB, at most 4
// screenshots of 256 KiB, game/ at most 993 entries and 48 MiB.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// Report what was handed in, so a local run is easy to eyeball before
// submitting: dossier size against the 1.5 MiB cap is the number that
// matters most, then confirmation that both payloads were copied.
const cap = 1.5 * 1024 * 1024;
console.log('Vice Harbor dossier written to ' + outputDir);
console.log('  dossier.json: ' + dossier.length + ' bytes (cap ' + cap + ')');
console.log('  game/ copied: ' + existsSync(join(outputDir, 'game', 'index.html')));
console.log('  screenshots/ copied: ' + existsSync(join(outputDir, 'screenshots')));
