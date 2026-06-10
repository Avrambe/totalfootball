// Phase 6 calibration harness. Loads the REAL generated data into GAME, then runs tens of thousands
// of tournaments at several squad-strength levels to check the spec §8 targets:
//   - match average ≈ 2.5–2.8 goals
//   - a near-perfect squad wins the whole tournament ≈ 65–70%
//   - a median squad wins ≈ 10–20%
//   - match-level upsets stay frequent
// Run: node app/src/engine/calibrate.mjs   (tune params.js between runs)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GAME } from "../data/loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "../../public");
GAME.cards = JSON.parse(readFileSync(join(pub, "cards.json"), "utf8"));
GAME.teams = JSON.parse(readFileSync(join(pub, "teams.json"), "utf8"));
GAME.elo = JSON.parse(readFileSync(join(pub, "elo.json"), "utf8"));

// Imported AFTER GAME is populated (bracket caches the opponent pool lazily, so order is fine).
const { runBracket, opponentPool } = await import("./bracket.js");
const { playMatch } = await import("./match.js");
const { quality } = await import("./squad.js");
const { eraSquads, squadCards } = await import("../spin/pools.js");
const { STYLES, applyStyle, SQUAD_CAP, MATCH_CAP, STAMINA_CAP } = await import("./style.js");
const { getFormation, DEFAULT_FORMATION } = await import("../positions/formations.js");

const ERA = "alltime";
const pool = opponentPool(ERA);

// Simulate a realistic draft: 4-3-3 line needs, fill each slot by drawing a random squad and taking
// its best-rated card for a still-open line. `skill` 1 = always take the best available draw (an
// engaged player who respins/chooses well); lower = pick a random open-line card (a careless draft).
const LINE_NEED = { GK: 1, DF: 4, MF: 3, FW: 3 };
function simulateDraft(era, skill = 1) {
  const squads = eraSquads(era);
  const need = { ...LINE_NEED };
  const picked = [];
  let guard = 0;
  while (picked.length < 11 && guard++ < 500) {
    const sq = squads[Math.floor(Math.random() * squads.length)];
    const cands = squadCards(sq.teamCode, sq.year).filter((c) => need[c.position] > 0);
    if (!cands.length) continue;
    let card;
    if (Math.random() < skill) card = cands.reduce((a, b) => (b.wc_rating > a.wc_rating ? b : a));
    else card = cands[Math.floor(Math.random() * cands.length)];
    need[card.position]--;
    picked.push(card);
  }
  return quality(picked);
}

// What quality do real drafted squads actually have? (Grounds the strength levels below.)
const draftQ = (skill, n = 3000) => {
  const a = [], d = [];
  for (let i = 0; i < n; i++) { const q = simulateDraft(ERA, skill); a.push(q.attack); d.push(q.defense); }
  a.sort((x, y) => x - y); d.sort((x, y) => x - y);
  return { a, d };
};
const eng = draftQ(1.0), cas = draftQ(0.0);
const med = (arr) => arr[Math.floor(arr.length / 2)];
console.log("simulated drafts (alltime):");
console.log(`  engaged (best pick) : attack med ${med(eng.a).toFixed(3)}, defense med ${med(eng.d).toFixed(3)}`);
console.log(`  careless (random)   : attack med ${med(cas.a).toFixed(3)}, defense med ${med(cas.d).toFixed(3)}\n`);

// Quality scale, read off the actual opponent field, so "median"/"near-perfect" mean something real.
const atk = pool.map((p) => p.quality.attack).sort((a, b) => a - b);
const def = pool.map((p) => p.quality.defense).sort((a, b) => a - b);
const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
const q = (a, d) => ({ attack: a, defense: d });

console.log(`opponent pool: ${pool.length} fieldable squads (${ERA})`);
console.log(`  attack  p10=${pct(atk, .1).toFixed(3)} p50=${pct(atk, .5).toFixed(3)} p90=${pct(atk, .9).toFixed(3)} max=${atk[atk.length - 1].toFixed(3)}`);
console.log(`  defense p10=${pct(def, .1).toFixed(3)} p50=${pct(def, .5).toFixed(3)} p90=${pct(def, .9).toFixed(3)} max=${def[def.length - 1].toFixed(3)}\n`);

// Strength levels grounded in the simulated-draft medians above (not arbitrary opponent percentiles):
//   near-perfect = an optimized dream team; median = a typical engaged draft; weak = a careless draft.
const LEVELS = [
  ["near-perfect", q(0.96, 0.94)],
  ["median draft", q(med(eng.a), med(eng.d))],
  ["weak draft", q(med(cas.a), med(cas.d))],
];

const N = 20000;
for (const [name, quality] of LEVELS) {
  let champs = 0, mGoals = 0, mCount = 0, mWins = 0;
  let viaTop2 = 0, viaThird = 0, eliminated = 0;
  const tierHist = {};
  for (let i = 0; i < N; i++) {
    const res = runBracket({ quality }, ERA);
    if (res.tier === "Champions") champs++;
    tierHist[res.tier] = (tierHist[res.tier] || 0) + 1;
    if (res.group.advancedVia === "top2") viaTop2++;
    else if (res.group.advancedVia === "third") viaThird++;
    else eliminated++;
    for (const m of res.group.matches) { mGoals += m.you + m.opp; mCount++; mWins += m.won ? 1 : 0; }
    for (const m of res.knockout) { mGoals += m.you + m.opp; mCount++; mWins += m.won ? 1 : 0; }
  }
  console.log(`${name.padEnd(14)} champions ${(champs / N * 100).toFixed(1).padStart(5)}%  | match win ${(mWins / mCount * 100).toFixed(1).padStart(5)}%  | goals/match ${(mGoals / mCount).toFixed(2)}`);
  console.log(`               group: top-2 ${(viaTop2 / N * 100).toFixed(0)}%, via-3rd ${(viaThird / N * 100).toFixed(0)}%, out ${(eliminated / N * 100).toFixed(0)}%`);
  console.log(`               tiers: ${Object.entries(tierHist).map(([t, c]) => `${t} ${(c / N * 100).toFixed(0)}%`).join(", ")}`);
}

// --- Style swing: how much does the style CHOICE move a fixed squad's champion%? ---------------
// "Style is seasoning, roster is the meal" — we want the best-vs-worst style spread to be modest
// (single-digit champion-% points), confirming style tunes outcomes without overpowering quality.
// Build a real dream-team seating (cards with positions + ages) so applyStyle sees actual slots.
function dreamSeating(era) {
  const squads = eraSquads(era);
  const need = { GK: 1, DF: 4, MF: 3, FW: 3 };
  const picked = [];
  let guard = 0;
  while (picked.length < 11 && guard++ < 2000) {
    const sq = squads[Math.floor(Math.random() * squads.length)];
    const cands = squadCards(sq.teamCode, sq.year).filter((c) => need[c.position] > 0 && c.wc_rating >= 88);
    if (!cands.length) continue;
    const card = cands.reduce((a, b) => (b.wc_rating > a.wc_rating ? b : a));
    need[card.position]--; picked.push(card);
  }
  const slots = (getFormation("4-3-3") || getFormation(DEFAULT_FORMATION)).slots;
  const byLine = { GK: [], DF: [], MF: [], FW: [] };
  for (const c of picked) byLine[c.position].push(c);
  const seating = {};
  for (const slot of slots) { const c = byLine[slot.line] && byLine[slot.line].shift(); if (c) seating[slot.id] = c; }
  return seating;
}

const seating = dreamSeating(ERA);
const baseDreamQ = quality(Object.values(seating));
const NS = 12000;
const swing = [];
for (const s of STYLES) {
  const sq = applyStyle(baseDreamQ, seating, "4-3-3", s.key);
  let champs = 0;
  for (let i = 0; i < NS; i++) if (runBracket({ quality: sq, style: s.key }, ERA).tier === "Champions") champs++;
  swing.push([s.key, champs / NS * 100]);
}
swing.sort((a, b) => b[1] - a[1]);
const best = swing[0], worst = swing[swing.length - 1];
console.log(`\nstyle swing on a fixed dream team (caps: fit ±${(SQUAD_CAP * 100).toFixed(0)}%, matchup ±${(MATCH_CAP * 100).toFixed(0)}%, stamina −${(STAMINA_CAP * 100).toFixed(0)}%):`);
console.log(`  base dream quality: attack ${baseDreamQ.attack.toFixed(3)}, defense ${baseDreamQ.defense.toFixed(3)}`);
for (const [k, p] of swing) console.log(`    ${k.padEnd(11)} champions ${p.toFixed(1).padStart(5)}%`);
console.log(`  best (${best[0]}) − worst (${worst[0]}) = ${(best[1] - worst[1]).toFixed(1)} pts spread`);

// Upset frequency: a fixed mismatch (clearly stronger vs clearly weaker) over many single matches.
const strong = q(pct(atk, .85), pct(def, .85)), weakO = q(pct(atk, .25), pct(def, .25));
let sWins = 0, draws = 0, T = 50000;
for (let i = 0; i < T; i++) { const r = playMatch(strong, weakO); if (r.won) sWins++; else if (r.gf === r.ga) draws++; }
console.log(`\nmismatch (p85 vs p25), single match: stronger wins ${(sWins / T * 100).toFixed(1)}%, draws ${(draws / T * 100).toFixed(1)}%, upsets ${((T - sWins - draws) / T * 100).toFixed(1)}%`);

// Global goal average across the whole opponent field (random fieldable pairings).
let g = 0, gc = 0;
for (let i = 0; i < 50000; i++) {
  const a = pool[Math.floor(Math.random() * pool.length)], b = pool[Math.floor(Math.random() * pool.length)];
  const r = playMatch(a.quality, b.quality); g += r.gf + r.ga; gc++;
}
console.log(`field-wide random pairings: goals/match ${(g / gc).toFixed(2)}`);
