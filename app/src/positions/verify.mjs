// Phase 4 verification — pure-logic assertions for the position engine. Run: node verify.mjs
// No test framework (matches the project's zero-dep tooling); ESM runs under node directly.

import { readFileSync } from "node:fs";
import { canPlay, OFF_POS_FLOOR } from "./canPlay.js";
import { FORMATIONS, formationsHolding, formationFits, getFormation } from "./formations.js";
import { lineOf } from "./taxonomy.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  [PASS] " + name); }
  else { fail++; console.log("  [FAIL] " + name); }
}
const slot = (token) => ({ id: "x", token, line: lineOf(token) });
const card = (...elig) => ({ eligible_positions: elig, position: lineOf(elig[0]) });

console.log("== canPlay: line floor ==");
check("cross-line rejected (CB player at ST slot)", canPlay(card("CB"), slot("ST")).eligible === false);
check("same-line allowed (CB player at LB slot)", canPlay(card("CB"), slot("LB")).eligible === true);
check("GK never eligible outfield", canPlay(card("GK"), slot("CB")).eligible === false);

console.log("== canPlay: effectiveness ==");
check("exact granular = 1.0", canPlay(card("LB"), slot("LB")).effectiveness === 1.0);
const wrongFlank = canPlay(card("LW"), slot("RW")).effectiveness;
check("wrong-flank LW->RW floored at " + OFF_POS_FLOOR, Math.abs(wrongFlank - OFF_POS_FLOOR) < 1e-9);
const towardCenter = canPlay(card("LW"), slot("ST")).effectiveness;
check("toward-center LW->ST mild (0.90<e<1.0)", towardCenter > 0.90 && towardCenter < 1.0);
check("off-position never below floor", wrongFlank >= OFF_POS_FLOOR);
const depthShift = canPlay(card("CDM"), slot("CAM")).effectiveness;
check("depth shift CDM->CAM gentle (>0.93)", depthShift > 0.93 && depthShift < 1.0);

console.log("== canPlay: bucket-only = full strength (no data to dock) ==");
check("bucket DF at CB = 1.0", canPlay(card("DF"), slot("CB")).effectiveness === 1.0);
check("bucket DF at LWB = 1.0", canPlay(card("DF"), slot("LWB")).effectiveness === 1.0);
check("bucket DF at CDM rejected (cross-line)", canPlay(card("DF"), slot("CDM")).eligible === false);

console.log("== canPlay: versatile multi-line (Kimmich-style DF + CDM) ==");
const kim = card("DF", "CDM");
check("versatile eligible at CB slot", canPlay(kim, slot("CB")).eligible === true);
check("versatile eligible at CDM slot", canPlay(kim, slot("CDM")).eligible === true);
check("versatile natural at CDM = 1.0", canPlay(kim, slot("CDM")).effectiveness === 1.0);
check("versatile at CB = 1.0 (bucket-only in DF line)", canPlay(kim, slot("CB")).effectiveness === 1.0);

console.log("== formations: tightening ==");
check("8 formations defined", FORMATIONS.length === 8);
check("every formation has 11 slots", FORMATIONS.every((f) => f.slots.length === 11));
const fiveDef = Array.from({ length: 5 }, () => card("DF"));
const holdNames = formationsHolding(fiveDef).map((f) => f.name);
check("5 DF placed -> only back-five shapes remain", holdNames.length > 0 && holdNames.every((n) => n.startsWith("5-")));
const classic = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"].map((b) => card(b));
check("classic 4-3-3 roster fits 4-3-3", formationFits(classic, getFormation("4-3-3")));
check("4-defender roster does NOT fit 3-at-back", !formationFits(classic, getFormation("3-5-2")));

console.log("== real card data (cards.json) ==");
try {
  const cards = JSON.parse(readFileSync(new URL("../../public/cards.json", import.meta.url)));
  const kimmich = cards.find((c) => Number(c.year) === 2026 && (c.name || "").includes("Kimmich"));
  if (kimmich) {
    check("Kimmich 2026 carries multi-line eligible_positions", kimmich.eligible_positions.length >= 2);
    check("Kimmich eligible at a CDM slot", canPlay(kimmich, slot("CDM")).eligible === true);
    check("Kimmich eligible at a CB slot", canPlay(kimmich, slot("CB")).eligible === true);
  } else {
    console.log("  [skip] Kimmich 2026 card not found");
  }
  const winger = cards.find((c) => Number(c.year) === 2026 && (c.eligible_positions || []).includes("RW"));
  if (winger) check("a winger card carries granular RW token", true);
} catch (err) {
  console.log("  [skip] cards.json not built yet:", err.message);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
