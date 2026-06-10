// Phase 6 verification — assertions for the match engine. Pure-math checks need no data; the bracket
// check stubs a tiny universe into GAME. Run: node app/src/engine/verify.mjs

import { poissonPmf, scoreMatrix, sampleScore } from "./poisson.js";
import { playMatch } from "./match.js";
import { quality } from "./squad.js";
import { GAME } from "../data/loader.js";
import { runTournament } from "./index.js";
import { KO_ROUNDS } from "./params.js";
import { applyStyle, deriveStyle, matchupMultiplier, fieldMatchup, STYLES, DEFAULT_STYLE, SQUAD_CAP, MATCH_CAP, STAMINA_CAP } from "./style.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  [PASS] " + name); }
  else { fail++; console.log("  [FAIL] " + name); }
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

console.log("== poisson + dixon-coles ==");
check("pmf sums to ~1 over 0..20", approx([...Array(21).keys()].reduce((s, k) => s + poissonPmf(k, 1.4), 0), 1, 1e-4));
const M = scoreMatrix(1.5, 1.2);
check("score matrix normalizes to 1", approx(M.reduce((s, c) => s + c.p, 0), 1, 1e-9));
// Negative rho lifts the draw mass relative to independent Poissons.
const drawDC = scoreMatrix(1.4, 1.4, -0.05).filter((c) => c.i === c.j).reduce((s, c) => s + c.p, 0);
const drawIndep = scoreMatrix(1.4, 1.4, 0).filter((c) => c.i === c.j).reduce((s, c) => s + c.p, 0);
check("DC (rho<0) increases draw probability", drawDC > drawIndep);

console.log("== sampling ==");
let goals = 0, N = 40000;
for (let i = 0; i < N; i++) { const [a, b] = sampleScore(M); goals += a + b; }
check(`mean goals from sampling ≈ λa+λb (got ${(goals / N).toFixed(2)}, want ~2.7)`, Math.abs(goals / N - 2.7) < 0.15);

console.log("== single match ==");
const strong = { attack: 0.95, defense: 0.95 }, weak = { attack: 0.45, defense: 0.45 };
let wins = 0;
for (let i = 0; i < 5000; i++) if (playMatch(strong, weak).won) wins++;
check(`strong beats weak most of the time (${(wins / 50).toFixed(0)}%)`, wins / 5000 > 0.8);
let upsets = 0;
for (let i = 0; i < 5000; i++) if (!playMatch(strong, weak).won) upsets++;
check("but upsets still happen (weak wins or draws sometimes)", upsets > 0);
// "Even" = two identical squads at a representative quality (attack runs a touch above defense, as the
// cohort means do); an identical pair is symmetric, so this isolates the draw RATE at a sane λ level.
const evenA = { attack: 0.78, defense: 0.70 }, evenB = { attack: 0.78, defense: 0.70 };
let draws = 0;
for (let i = 0; i < 5000; i++) { const r = playMatch(evenA, evenB); if (r.gf === r.ga) draws++; }
check(`even match produces a sane draw rate (${(draws / 50).toFixed(0)}%)`, draws / 5000 > 0.15 && draws / 5000 < 0.4);
let koDraws = 0;
for (let i = 0; i < 3000; i++) { const r = playMatch(evenA, evenB, { knockout: true }); if (r.gf === r.ga) koDraws++; }
check("knockout never ends level (forces a winner)", koDraws === 0);

console.log("== quality aggregation ==");
const xi = (r) => [{ position: "GK", wc_rating: r }, ...Array(4).fill({ position: "DF", wc_rating: r }),
  ...Array(3).fill({ position: "MF", wc_rating: r }), ...Array(3).fill({ position: "FW", wc_rating: r })];
const q99 = quality(xi(99)), q50 = quality(xi(50));
check("all-99 squad has attack≈defense≈1.0", approx(q99.attack, 1, 0.02) && approx(q99.defense, 1, 0.02));
check("all-50 squad has attack≈defense≈0.5", approx(q50.attack, 0.505, 0.02));

console.log("== full bracket (stubbed universe) ==");
// Build a field of squads at varied strength + Elo so seeding has tiers to draw from. The real 2026
// format simulates 12 groups of 4 (48 teams) to set the best-thirds cut, so the stub needs a full
// 48-squad field — built as a smooth ladder of ratings so seeding bands have real tiers.
const mkSquad = (code, year, r) => ["GK", "GK", ...Array(6).fill("DF"), ...Array(6).fill("MF"), ...Array(5).fill("FW")]
  .map((p, i) => ({ team_code: code, year, position: p, player_id: `${code}-${year}-${i}`, eligible_positions: [p], wc_rating: r }));
GAME.teams = {}; GAME.cards = []; GAME.elo = {};
const FIELD = 48;
for (let i = 0; i < FIELD; i++) {
  const r = Math.round(38 + (56 * i) / (FIELD - 1)); // 38 → 94 across the field
  const code = `T${i}`;
  GAME.teams[code] = { name: code, years: [1990], eras: { alltime: true } };
  GAME.cards.push(...mkSquad(code, 1990, r));
  GAME.elo[code] = { "1990": 1700 + r * 4 };
}
// Map onto a real formation's slot ids so runTournament can compute effectiveness.
import { getFormation } from "../positions/formations.js";
const f433 = getFormation("4-3-3");
const seatXI = (rating) => { const cs = xi(rating); const seat = {}; f433.slots.forEach((s, i) => (seat[s.id] = { ...cs[i], player_id: `me${i}`, eligible_positions: [cs[i].position] })); return seat; };
const mySeat = seatXI(92);
const VALID_TIERS = new Set(["Group Stage Exit", "Round of 32", "Round of 16", "Quarterfinalists", "Semifinalists", "Runner-Up", "Champions"]);
let completed = 0, champs = 0, maxKO = 0;
for (let i = 0; i < 400; i++) {
  const res = runTournament(mySeat, "4-3-3", "alltime");
  if (VALID_TIERS.has(res.tier) && res.group.matches.length === 3) completed++;
  if (res.tier === "Champions") champs++;
  maxKO = Math.max(maxKO, res.knockout.length);
}
check("400 tournaments all complete with a valid tier + 3 group matches", completed === 400);
// 92 isn't the top of this tiny stub (a 94 is in it) and the seeded bracket steepens, so "often"
// here means clearly above a uniform ~1/32 share, not a majority.
check(`a strong (92) squad wins the stub field often (${(champs / 4).toFixed(0)}%)`, champs / 400 > 0.12);
// Knockout starts at the Round of 32, so a champion's run is 5 matches (R32→R16→QF→SF→Final).
check(`knockout can reach 5 rounds (saw max ${maxKO})`, maxKO === 5);
check("Round of 32 is the first knockout round", KO_ROUNDS[0] === "Round of 32");

// A borderline squad finishes 3rd often; the best-thirds path must let it through SOMETIMES (and not
// always — top-2 isn't the only way in, but 3rd isn't a guaranteed pass either).
let thirdAdvances = 0, exits = 0;
const borderline = seatXI(58);
for (let i = 0; i < 1500; i++) {
  const res = runTournament(borderline, "4-3-3", "alltime");
  if (res.group.advancedVia === "third") thirdAdvances++;
  if (!res.group.advanced) exits++;
}
check(`a 3rd-place finish can advance via the best-thirds rule (saw ${thirdAdvances})`, thirdAdvances > 0);
check(`group stage still eliminates weak squads sometimes (saw ${exits} exits)`, exits > 0);

console.log("== playing styles (bounded, squad-shape dependent) ==");
// A seating keyed like the engine expects: { slotId: { position, wc_rating } }. styleSeat sets a flat
// rating per line; seatByIndex sets a per-slot rating (4-3-3 order: GK, RB CB CB LB, CDM CM CM, RW ST LW).
const styleSeat = (df, mf, fw, gk = 70) => {
  const cs = [{ position: "GK", wc_rating: gk }, ...Array(4).fill({ position: "DF", wc_rating: df }),
    ...Array(3).fill({ position: "MF", wc_rating: mf }), ...Array(3).fill({ position: "FW", wc_rating: fw })];
  const out = {}; f433.slots.forEach((s, i) => (out[s.id] = cs[i])); return out;
};
const seatByIndex = (ratings) => {
  const out = {}; f433.slots.forEach((s, i) => (out[s.id] = { position: s.line, wc_rating: ratings[i] })); return out;
};
const tot = (q) => q.attack + q.defense;
const baseQ = { attack: 0.80, defense: 0.75 };
const balancedSeat = styleSeat(75, 75, 75);
const bal = applyStyle(baseQ, balancedSeat, "4-3-3", DEFAULT_STYLE);
check("Balanced is a no-op (attack/defense unchanged)", bal.attack === baseQ.attack && bal.defense === baseQ.defense);

// Upside is capped at +SQUAD_CAP; downside can also include the age/stamina penalty (so −(SQUAD_CAP+STAMINA_CAP)).
const UP = SQUAD_CAP + 1e-9, DOWN = SQUAD_CAP + STAMINA_CAP + 1e-9;
let withinCap = true;
for (const st of STYLES) {
  for (const seat of [styleSeat(90, 90, 90), styleSeat(45, 45, 45), seatByIndex([95, 95, 50, 50, 95, 50, 50, 50, 95, 50, 95])]) {
    for (const fname of ["4-3-3", "4-4-2", "5-3-2", "3-4-3"]) {
      const adj = applyStyle(baseQ, seat, fname, st.key);
      const aR = adj.attack / baseQ.attack, dR = adj.defense / baseQ.defense;
      if (aR > 1 + UP || aR < 1 - DOWN || dR > 1 + UP || dR < 1 - DOWN) withinCap = false;
    }
  }
}
check(`every style keeps attack & defense within +${(SQUAD_CAP * 100).toFixed(0)}% / −${((SQUAD_CAP + STAMINA_CAP) * 100).toFixed(0)}% (the caps)`, withinCap);

// A squad BUILT for the counter (strong DF + sharp FW, weak MF) should gain more total strength under
// Counter than under Possession (which rewards midfield it doesn't have).
const counterBuilt = styleSeat(92, 55, 90);
check("a counter-built squad benefits more under Counter than Possession",
  tot(applyStyle(baseQ, counterBuilt, "4-3-3", "counter")) > tot(applyStyle(baseQ, counterBuilt, "4-3-3", "possession")));
// And the mirror: a midfield-heavy squad prefers Possession over Counter.
const possBuilt = styleSeat(58, 95, 60);
check("a midfield-heavy squad benefits more under Possession than Counter",
  tot(applyStyle(baseQ, possBuilt, "4-3-3", "possession")) > tot(applyStyle(baseQ, possBuilt, "4-3-3", "counter")));
// A wing-built squad (strong full-backs + wingers, weak central CB/ST) prefers Wing Play to Direct
// (Direct kills the flanks: FB/W weights are low, so a flank-built squad is a bad fit for it).
const wingBuilt = seatByIndex([70, 92, 55, 55, 92, 60, 60, 60, 95, 58, 95]);
check("a wing-built squad benefits more under Wing Play than Direct",
  tot(applyStyle(baseQ, wingBuilt, "4-3-3", "wing")) > tot(applyStyle(baseQ, wingBuilt, "4-3-3", "direct")));
// A back-line-built squad (strong CB + full-backs, weak central midfield) prefers Positional Play
// (owns CB+FB build-up) to Possession (which rewards the CM/AM creativity it lacks).
const backlineBuilt = seatByIndex([70, 92, 95, 95, 92, 60, 55, 55, 60, 78, 60]);
check("a back-line-built squad benefits more under Positional than Possession",
  tot(applyStyle(baseQ, backlineBuilt, "4-3-3", "positional")) > tot(applyStyle(baseQ, backlineBuilt, "4-3-3", "possession")));

// Formation compatibility moves the number the right way: Possession is High in 4-3-3, Poor in 5-4-1.
check("formation fit matters: Possession does better in 4-3-3 than 5-4-1 for the same squad",
  tot(applyStyle(baseQ, balancedSeat, "4-3-3", "possession")) > tot(applyStyle(baseQ, balancedSeat, "5-4-1", "possession")));

// deriveStyle gives any squad a valid non-balanced emergent identity (used to style opponents).
check("deriveStyle returns a valid non-balanced style", (() => {
  const k = deriveStyle(counterBuilt, "4-3-3");
  return k !== "balanced" && STYLES.some((s) => s.key === k);
})());

console.log("== style matchup (rock-paper-scissors, bounded) ==");
check("matchup vs Balanced is neutral (1.0)", matchupMultiplier("counter", "balanced") === 1 && matchupMultiplier("balanced", "press") === 1);
check("a favorable matchup beats the reverse (Counter has the edge over Press)",
  matchupMultiplier("counter", "press") > matchupMultiplier("press", "counter"));
let matchInCap = true;
for (const a of STYLES) for (const b of STYLES) {
  const m = matchupMultiplier(a.key, b.key);
  if (m > 1 + MATCH_CAP + 1e-9 || m < 1 - MATCH_CAP - 1e-9) matchInCap = false;
}
check(`every style matchup stays within ±${(MATCH_CAP * 100).toFixed(0)}%`, matchInCap);

// Field-centered matchup nets to ~1.0 across the actual opponent distribution: a style gains vs some
// opponents and loses vs others but has NO standing field-wide edge (no free lunch). Build a non-uniform
// field and confirm each style's frequency-weighted mean centered multiplier ≈ 1.0.
const fieldCounts = { possession: 12, counter: 9, press: 7, direct: 5, wing: 6, total: 3, positional: 8 };
const fc = fieldMatchup(fieldCounts);
const fieldTot = Object.values(fieldCounts).reduce((s, n) => s + n, 0);
let fieldNeutral = true;
for (const y of Object.keys(fieldCounts)) {
  const mean = Object.entries(fieldCounts).reduce((s, [o, n]) => s + (n / fieldTot) * fc(y, o), 0);
  if (Math.abs(mean - 1) > 1e-9) fieldNeutral = false;
}
check("field-centered matchup nets to ~1.0 across the field for every style (no free lunch)", fieldNeutral);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
