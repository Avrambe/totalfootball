// One-time/dev generator: copy the flag-icons SVG for each team into public/flags/<TEAM_CODE>.svg,
// so the runtime can serve flags by team_code with no dependency. The four defunct nations
// (SUN/DDR/YUG/SCG) are hand-authored and already present — we skip (and verify) them here.
// Run with: npm run flags   (requires `npm install` first to pull flag-icons).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { FLAG_KEY, CUSTOM_FLAGS } from "../src/data/flags.js";

// flag-icons ships SVGs with only a viewBox and no width/height. Chrome infers the size from the
// viewBox, but Safari/WebKit (and other strict browsers) treat the intrinsic size as 0 — combined
// with object-fit they render a BLANK box, and canvas drawImage() draws nothing on the share card.
// So we stamp explicit width/height (from the viewBox) onto the root <svg> when copying.
function withDimensions(svg) {
  const open = svg.match(/<svg[^>]*>/i);
  if (!open) return svg;
  const tag = open[0];
  if (/\swidth=/i.test(tag) && /\sheight=/i.test(tag)) return svg; // already sized
  const vb = tag.match(/viewBox="\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/i);
  if (!vb) return svg;
  const sized = tag.replace(/<svg/i, `<svg width="${vb[1]}" height="${vb[2]}"`);
  return svg.replace(tag, sized);
}

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
  writeFileSync(join(OUT, `${code}.svg`), withDimensions(readFileSync(from, "utf8")));
  copied += 1;
}

const customMissing = CUSTOM_FLAGS.filter((c) => !existsSync(join(OUT, `${c}.svg`)));

console.log(`flags: copied ${copied}/${Object.keys(FLAG_KEY).length} from flag-icons; ${CUSTOM_FLAGS.length} custom (${CUSTOM_FLAGS.join(", ")})`);
if (missing.length) console.warn(`  MISSING flag-icons sources: ${missing.join(", ")}`);
if (customMissing.length) console.warn(`  MISSING custom SVGs in public/flags: ${customMissing.join(", ")}`);
if (missing.length || customMissing.length) process.exit(1);
