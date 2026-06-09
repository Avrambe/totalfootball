// One-time/dev generator: copy the flag-icons SVG for each team into public/flags/<TEAM_CODE>.svg,
// so the runtime can serve flags by team_code with no dependency. The four defunct nations
// (SUN/DDR/YUG/SCG) are hand-authored and already present — we skip (and verify) them here.
// Run with: npm run flags   (requires `npm install` first to pull flag-icons).

import { copyFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { FLAG_KEY, CUSTOM_FLAGS } from "../src/data/flags.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "node_modules", "flag-icons", "flags", "4x3");
const OUT = join(here, "..", "public", "flags");

if (!existsSync(SRC)) {
  console.error(`flag-icons not found at ${SRC}\nRun "npm install" first.`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

let copied = 0;
const missing = [];
for (const [code, key] of Object.entries(FLAG_KEY)) {
  const from = join(SRC, `${key}.svg`);
  if (!existsSync(from)) { missing.push(`${code} -> ${key}`); continue; }
  copyFileSync(from, join(OUT, `${code}.svg`));
  copied += 1;
}

const customMissing = CUSTOM_FLAGS.filter((c) => !existsSync(join(OUT, `${c}.svg`)));

console.log(`flags: copied ${copied}/${Object.keys(FLAG_KEY).length} from flag-icons; ${CUSTOM_FLAGS.length} custom (${CUSTOM_FLAGS.join(", ")})`);
if (missing.length) console.warn(`  MISSING flag-icons sources: ${missing.join(", ")}`);
if (customMissing.length) console.warn(`  MISSING custom SVGs in public/flags: ${customMissing.join(", ")}`);
if (missing.length || customMissing.length) process.exit(1);
