// Phase 7 verification — assertions for the Elo + grade scoring. Pure math, no data needed.
// Run: node app/src/scoring/verify.mjs

import { matchDelta, scoreTournament, grade } from "./score.js";
import { START_ELO } from "./params.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  [PASS] " + name); }
  else { fail++; console.log("  [FAIL] " + name); }
}

const win = (you, opp, s) => ({ you, opp, won: true, oppStrength: s });
const loss = (you, opp, s) => ({ you, opp, won: false, oppStrength: s });
const drw = (g, s) => ({ you: g, opp: g, won: false, oppStrength: s });

console.log("== per-match ordering ==");
check("win > draw > loss vs the same opponent",
  matchDelta(win(1, 0, 0.5)) > matchDelta(drw(1, 0.5)) && matchDelta(drw(1, 0.5)) > matchDelta(loss(0, 1, 0.5)));
check("beating a STRONG side scores more than the same win vs a weak side",
  matchDelta(win(2, 0, 0.95)) > matchDelta(win(2, 0, 0.05)));
check("losing to a WEAK side hurts more than losing to a strong side",
  matchDelta(loss(0, 2, 0.05)) < matchDelta(loss(0, 2, 0.95)));

console.log("== diminishing margin ==");
const d12 = matchDelta(win(2, 0, 0.5)) - matchDelta(win(1, 0, 0.5));
const d67 = matchDelta(win(7, 0, 0.5)) - matchDelta(win(6, 0, 0.5));
check(`margin saturates: Δ(+1→+2)=${d12.toFixed(2)} ≫ Δ(+6→+7)=${d67.toFixed(2)}`, d12 > d67 && d67 >= 0);

console.log("== anti-farm ==");
check("a 2-0 over a top side beats an 8-0 over a weak side",
  matchDelta(win(2, 0, 0.97)) > matchDelta(win(8, 0, 0.03)));

console.log("== draw sign ==");
check("draw vs strong side is positive, vs weak side is negative",
  matchDelta(drw(1, 0.9)) > 0 && matchDelta(drw(1, 0.1)) < 0);

console.log("== tournament aggregation ==");
const res = {
  tier: "Champions",
  group: { matches: [win(3, 0, 0.4), win(2, 1, 0.6), drw(1, 0.5)] },
  knockout: [win(1, 0, 0.7), win(2, 0, 0.8), win(1, 0, 0.85), win(2, 1, 0.9), win(1, 0, 0.95)],
};
const sc = scoreTournament(res);
let manual = 0;
for (const m of [...res.group.matches, ...res.knockout]) manual += matchDelta(m);
check(`finalElo = ${START_ELO} + Σ deltas (got ${sc.elo}, delta ${sc.eloDelta})`,
  sc.elo === Math.round(START_ELO + manual) && sc.eloDelta === Math.round(manual));
check("a champion run scores above the 1500 start", sc.elo > START_ELO);

console.log("== grade gating ==");
check("champion gets a letter grade in {S+,S,A,B}", ["S+", "S", "A", "B"].includes(sc.grade));
check("non-champion gets grade null", grade(1700, false) === null);
check("higher champion Elo grades at least as high",
  ["S+", "S"].includes(grade(2000, true)) && grade(1000, true) === "B");

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
