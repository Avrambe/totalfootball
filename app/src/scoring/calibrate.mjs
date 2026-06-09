// Phase 7 scoring calibration. Loads real data into GAME, runs N tournaments at several squad-strength
// levels, and prints the per-tier finalElo distribution + the champion distribution (to set grade bands)
// + an anti-farm check. Tune scoring/params.js between runs. Run: node app/src/scoring/calibrate.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GAME } from "../data/loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "../../public");
GAME.cards = JSON.parse(readFileSync(join(pub, "cards.json"), "utf8"));
GAME.teams = JSON.parse(readFileSync(join(pub, "teams.json"), "utf8"));
GAME.elo = JSON.parse(readFileSync(join(pub, "elo.json"), "utf8"));

const { runBracket } = await import("../engine/bracket.js");
const { scoreTournament, matchDelta } = await import("./score.js");

const ERA = "alltime";
const q = (a, d) => ({ attack: a, defense: d });
const LEVELS = [
  ["near-perfect", q(0.96, 0.94)],
  ["median draft", q(0.78, 0.72)],
  ["weak draft", q(0.62, 0.55)],
];

const N = 20000;
const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];

for (const [name, quality] of LEVELS) {
  const byTier = {};            // tier -> [elo...]
  const champElos = [];
  for (let i = 0; i < N; i++) {
    const res = runBracket({ quality }, ERA);
    const sc = scoreTournament(res);
    (byTier[res.tier] ||= []).push(sc.elo);
    if (res.tier === "Champions") champElos.push(sc.elo);
  }
  const allElos = Object.values(byTier).flat().sort((a, b) => a - b);
  const mean = allElos.reduce((s, e) => s + e, 0) / allElos.length;
  console.log(`\n${name}  (mean Elo ${mean.toFixed(0)}, n=${allElos.length})`);
  const order = ["Champions", "Runner-Up", "Semifinalists", "Quarterfinalists", "Round of 16", "Round of 32", "Group Stage Exit"];
  for (const t of order) {
    const a = byTier[t]; if (!a) continue; a.sort((x, y) => x - y);
    const m = a.reduce((s, e) => s + e, 0) / a.length;
    console.log(`  ${t.padEnd(18)} n=${String(a.length).padStart(5)}  mean ${m.toFixed(0)}  p10 ${pct(a, .1)}  p50 ${pct(a, .5)}  p90 ${pct(a, .9)}`);
  }
  if (champElos.length > 30) {
    champElos.sort((a, b) => a - b);
    console.log(`  champion distribution: p35 ${pct(champElos, .35)}  p65 ${pct(champElos, .65)}  p90 ${pct(champElos, .9)}  (→ grade A/S/S+ cuts)`);
  }
}

// Anti-farm sanity (single matches): a tight win over a top side must beat a rout of a minnow.
console.log(`\nanti-farm: 2-0 vs p97 = ${matchDelta({ you: 2, opp: 0, won: true, oppStrength: 0.97 }).toFixed(2)}, ` +
  `8-0 vs p03 = ${matchDelta({ you: 8, opp: 0, won: true, oppStrength: 0.03 }).toFixed(2)}`);
