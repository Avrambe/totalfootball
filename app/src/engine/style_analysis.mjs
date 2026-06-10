// Style differentiation diagnostic. Question: is every style the BEST pick for some roster
// construction? For each style we build an "archetype" squad — strong exactly where that style's
// per-position weights are high, weak elsewhere, EQUAL overall rating budget, young (so stamina is
// neutral), in a formation that suits the style — then run ALL styles on that squad and see which
// wins. If the diagonal (a style on its own archetype) isn't the best (or near it), the lever is
// broken; if a style never tops any row, it's redundant and should be dropped.
// Run: node app/src/engine/style_analysis.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GAME } from "../data/loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "../../public");
GAME.cards = JSON.parse(readFileSync(join(pub, "cards.json"), "utf8"));
GAME.teams = JSON.parse(readFileSync(join(pub, "teams.json"), "utf8"));
GAME.elo = JSON.parse(readFileSync(join(pub, "elo.json"), "utf8"));

const { runBracket } = await import("./bracket.js");
const { quality } = await import("./squad.js");
const style = await import("./style.js");
const { STYLES, applyStyle, deriveStyle, matchupMultiplier } = style;
const { getFormation } = await import("../positions/formations.js");
const { opponentPool } = await import("./bracket.js");

const ERA = "alltime";
const pool = opponentPool(ERA);

// Reach into style.js internals via re-running its mapping logic here (kept in sync by hand).
const REF = ["GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"];
const TOKEN_TO_REF = {
  GK: "GK", CB: "CB", LB: "FB", RB: "FB", LWB: "FB", RWB: "FB",
  CDM: "DM", CM: "CM", CAM: "AM", LM: "W", RM: "W", LW: "W", RW: "W", ST: "ST",
};
const POS_WEIGHTS = {
  possession: [55, 64, 56, 74, 98, 92, 60, 60],
  positional: [55, 92, 92, 90, 80, 70, 55, 58],
  counter:    [60, 80, 86, 64, 55, 60, 92, 95],
  direct:     [55, 88, 50, 86, 60, 45, 45, 98],
  press:      [55, 64, 66, 94, 72, 58, 90, 92],
  wing:       [50, 60, 96, 60, 60, 70, 98, 82],
  total:      [70, 80, 85, 80, 90, 85, 85, 80],
};
const FORMATION_FIT = {
  possession: { "4-3-3": 1, "3-4-3": 1 },
  counter:    { "4-4-2": 1, "4-2-3-1": 1, "4-5-1": 1, "3-5-2": 1, "5-3-2": 1, "5-4-1": 1 },
  press:      { "4-3-3": 1, "4-2-3-1": 1, "4-4-2": 1 },
  direct:     { "4-4-2": 1, "3-5-2": 1 },
  wing:       { "4-3-3": 1, "4-2-3-1": 1, "3-5-2": 1, "5-3-2": 1 },
  total:      { "4-3-3": 1, "4-4-2": 1, "3-4-3": 1 },
  positional: { "4-3-3": 1 },
};
const realKeys = STYLES.map((s) => s.key).filter((k) => k !== "balanced");

const bestFormation = (key) => Object.keys(FORMATION_FIT[key] || {})[0] || "4-3-3";

// Build a synthetic seating for a formation where slot rating tracks the style's weight profile,
// rescaled so the mean rating across the 11 is exactly TARGET_MEAN (equal budget across archetypes).
const TARGET_MEAN = 78;
const SPREAD = 0.55; // how aggressively ratings lean toward the style's high-weight slots
function archetypeSeating(key) {
  const fName = bestFormation(key);
  const f = getFormation(fName);
  // Total Football's niche is EVENNESS (no weak link), not a positional spike — so its archetype is a
  // FLAT squad (every slot at the budget mean). A spiky weight-built squad can't represent it.
  if (key === "total") {
    const seating = {};
    f.slots.forEach((slot) => { seating[slot.id] = { wc_rating: TARGET_MEAN, position: slot.line, age: 25 }; });
    return { seating, fName };
  }
  const w = POS_WEIGHTS[key];
  const wMean = w.reduce((s, x) => s + x, 0) / w.length;
  const raw = f.slots.map((slot) => {
    const wv = w[REF.indexOf(TOKEN_TO_REF[slot.token] || "CM")];
    return TARGET_MEAN + SPREAD * (wv - wMean); // lean rating toward high-weight positions
  });
  // rescale to hit TARGET_MEAN exactly, clamp to a believable band
  const m = raw.reduce((s, x) => s + x, 0) / raw.length;
  const seating = {};
  f.slots.forEach((slot, i) => {
    let r = Math.round(Math.max(52, Math.min(96, raw[i] + (TARGET_MEAN - m))));
    seating[slot.id] = { wc_rating: r, position: slot.line, age: 25 };
  });
  return { seating, fName };
}

// --- Weight distinctiveness: variance + pairwise correlation (flags flat or duplicate styles) ---
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const corr = (a, b) => {
  const ma = mean(a), mb = mean(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db);
};
console.log("=== weight profile distinctiveness ===");
console.log("std (higher = more opinionated about where you must be strong; near-0 = no roster identity):");
for (const k of realKeys) {
  const w = POS_WEIGHTS[k];
  const sd = Math.sqrt(mean(w.map((x) => (x - mean(w)) ** 2)));
  console.log(`  ${k.padEnd(11)} std ${sd.toFixed(1)}`);
}
console.log("\nmost-similar style pairs (corr > 0.85 ⇒ near-duplicate reward profile):");
const pairs = [];
for (let i = 0; i < realKeys.length; i++) for (let j = i + 1; j < realKeys.length; j++) {
  pairs.push([realKeys[i], realKeys[j], corr(POS_WEIGHTS[realKeys[i]], POS_WEIGHTS[realKeys[j]])]);
}
pairs.sort((a, b) => b[2] - a[2]);
for (const [a, b, c] of pairs.slice(0, 6)) console.log(`  ${a} ~ ${b}: ${c.toFixed(2)}`);

// --- Champion% matrix: each archetype row, run every style, find the winner --------------------
const N = 12000;
console.log(`\n=== champion% — archetype (row) × style applied (col), N=${N} each ===`);
const styleKeys = STYLES.map((s) => s.key); // include balanced as a column
const hdr = "archetype".padEnd(12) + styleKeys.map((k) => k.slice(0, 5).padStart(6)).join("");
console.log(hdr);

const winnerOf = {};
for (const arch of realKeys) {
  const { seating, fName } = archetypeSeating(arch);
  const baseQ = quality(Object.values(seating));
  const row = [];
  for (const sk of styleKeys) {
    const q = applyStyle(baseQ, seating, fName, sk);
    let champs = 0;
    for (let i = 0; i < N; i++) if (runBracket({ quality: q, style: sk }, ERA).tier === "Champions") champs++;
    row.push(champs / N * 100);
  }
  const max = Math.max(...row);
  const cells = row.map((v, i) => {
    const s = v.toFixed(1).padStart(6);
    return styleKeys[i] === arch ? `[${v.toFixed(1)}]`.padStart(6) : (v === max ? "*" + v.toFixed(1).padStart(5) : s);
  });
  // record which style won this archetype
  const winIdx = row.indexOf(max);
  winnerOf[arch] = { winner: styleKeys[winIdx], self: row[styleKeys.indexOf(arch)], best: max, form: fName };
  console.log(arch.padEnd(12) + cells.join("") + `   (${fName})`);
}

console.log("\n=== verdict ===");
console.log("[x.x] = the style on its own archetype;  *x.x = the actual best style for that row.");
const neverBest = realKeys.filter((k) => !Object.values(winnerOf).some((w) => w.winner === k));
for (const arch of realKeys) {
  const w = winnerOf[arch];
  const ok = w.winner === arch ? "OK  (self is best)" : `WEAK — best is '${w.winner}' (+${(w.best - w.self).toFixed(1)} pts over self)`;
  console.log(`  ${arch.padEnd(11)} self ${w.self.toFixed(1)}%  best ${w.best.toFixed(1)}%  → ${ok}`);
}
console.log(`\n  styles that NEVER win any archetype (redundant → drop?): ${neverBest.length ? neverBest.join(", ") : "none — every style is the right pick for some build"}`);
