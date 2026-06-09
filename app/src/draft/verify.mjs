// Phase 5 verification — pure-logic assertions for the draft helpers (offer.js + tighten.js).
// Run: node app/src/draft/verify.mjs   (ESM, no test framework — matches the project's tooling.)

import {
  seat, fitsFormation, holdingFormations, offerState, targetFormationsFor, validSpots, openLines,
} from "../formation/offer.js";
import { reasonString } from "../formation/tighten.js";
import { getFormation } from "../positions/formations.js";
import { GAME } from "../data/loader.js";
import { validTargets, canRespin, reelFrames } from "../spin/pools.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  [PASS] " + name); }
  else { fail++; console.log("  [FAIL] " + name); }
}

let _id = 0;
const card = (pos, ...gran) => ({ player_id: `p${_id++}`, position: pos, eligible_positions: gran.length ? gran : [pos] });
const many = (n, pos, ...gran) => Array.from({ length: n }, () => card(pos, ...gran));

console.log("== seat / fits: a valid XI ==");
const xi = [card("GK"), ...many(4, "DF"), ...many(3, "MF"), ...many(3, "FW")];
check("XI fits 4-3-3", fitsFormation(xi, getFormation("4-3-3")));
const s = seat(xi, getFormation("4-3-3"));
check("seat returns all 11 placements", s && Object.keys(s).length === 11);
check("4-defender XI does NOT fit 3-5-2", !fitsFormation(xi, getFormation("3-5-2")));

console.log("== offerState: green / yellow / grey ==");
check("empty roster: a DF is green in 4-3-3", offerState(card("DF"), [], "4-3-3") === "green");
const four = many(4, "DF");
check("after 4 DF placed, a 5th DF is yellow in 4-3-3", offerState(card("DF"), four, "4-3-3") === "yellow");
const five = many(5, "DF");
check("after 5 DF, a 6th DF is grey (no shape holds 6)", offerState(card("DF"), five, "4-3-3") === "grey");

console.log("== tightening ==");
const holdAfter5 = holdingFormations(five).map((f) => f.name);
check("5 DF placed -> only back-five shapes hold", holdAfter5.length > 0 && holdAfter5.every((n) => n.startsWith("5-")));
check("reasonString mentions back-five at 5 DF", /back-five/.test(reasonString(five, "5-3-2")));
check("no reason when nothing tightened (empty roster)", reasonString([], "4-3-3") === "");

console.log("== targetFormationsFor (yellow) ==");
const targets = targetFormationsFor(card("DF"), four, "4-3-3");
check("a 5th DF's targets are all back-five shapes", targets.length > 0 && targets.every((n) => n.startsWith("5-")));

console.log("== validSpots: pick-the-spot ==");
const spots = validSpots(card("DF"), [], "4-3-3");
check("a DF on an empty 4-3-3 can take all 4 DF slots", spots.length === 4);
check("every returned spot is a DF-line slot", spots.every((sp) => sp.slot.line === "DF"));
const cbSpots = validSpots(card("DF", "CB"), [], "4-3-3");
check("a CB specialist gets effectiveness 1.0 at a CB slot", cbSpots.some((sp) => sp.slot.token === "CB" && sp.effectiveness === 1.0));
check("a CB specialist is still eligible (penalized) at a full-back slot", cbSpots.some((sp) => sp.slot.token !== "CB" && sp.effectiveness < 1.0));

console.log("== openLines: spin never dead-ends ==");
check("empty roster: all four lines open", openLines([], "4-3-3").size === 4);
const allButFw = [card("GK"), ...many(4, "DF"), ...many(3, "MF")];
check("with GK+DF+MF filled, FW is still open", openLines(allButFw, "4-3-3").has("FW"));

console.log("== invariant: a full-line squad always offers a non-grey while a line is open ==");
const squad = [card("GK"), ...many(3, "DF"), ...many(4, "MF"), ...many(3, "FW")];
const placed3 = [card("GK"), card("DF"), card("DF")];
check("some squad member is non-grey vs a partial roster",
  squad.some((c) => offerState(c, placed3, "4-3-3") !== "grey"));

console.log("== separate country / year respins (pools fixed-axis) ==");
// Stub the runtime data global with a tiny universe. BRA played 1970/1994/2002; ITA played
// 1970/1982. Each squad carries one card per line so any squad is a valid (non-dead-end) target.
const sq = (code, year) => ["GK", "DF", "MF", "FW"].map((p) => ({ team_code: code, year, position: p, player_id: `${code}${year}${p}`, eligible_positions: [p] }));
GAME.teams = {
  BRA: { name: "Brazil", years: [1970, 1994, 2002], eras: { alltime: true } },
  ITA: { name: "Italy", years: [1970, 1982], eras: { alltime: true } },
};
GAME.cards = [...sq("BRA", 1970), ...sq("BRA", 1994), ...sq("BRA", 2002), ...sq("ITA", 1970), ...sq("ITA", 1982)];

const fixBRA = validTargets("alltime", [], "4-3-3", { teamCode: "BRA" });
check("fix country=BRA -> only Brazil squads", fixBRA.length === 3 && fixBRA.every((s) => s.teamCode === "BRA"));
const fix1970 = validTargets("alltime", [], "4-3-3", { year: 1970 });
check("fix year=1970 -> only 1970 squads (BRA, ITA)", fix1970.length === 2 && fix1970.every((s) => s.year === 1970));
check("no fix -> all 5 squads", validTargets("alltime", [], "4-3-3").length === 5);

const curBRA70 = { teamCode: "BRA", name: "Brazil", year: 1970 };
check("respin YEAR (hold BRA) has other years -> canRespin true", canRespin("alltime", [], "4-3-3", { teamCode: "BRA" }, curBRA70) === true);
const curITA82 = { teamCode: "ITA", name: "Italy", year: 1982 };
check("respin COUNTRY (hold 1982) has no other nation -> canRespin false", canRespin("alltime", [], "4-3-3", { year: 1982 }, curITA82) === false);
check("respin COUNTRY (hold 1970) has another nation -> canRespin true", canRespin("alltime", [], "4-3-3", { year: 1970 }, curBRA70) === true);

console.log("== reel frames: every tumble frame is a REAL (team, year) pairing ==");
// Valid pairings in the stub universe: BRA 1970/1994/2002, ITA 1970/1982.
const real = new Set(["Brazil|1970", "Brazil|1994", "Brazil|2002", "Italy|1970", "Italy|1982"]);
const target = { teamCode: "BRA", name: "Brazil", year: 1994 };
const full = reelFrames("alltime", target, { team: true, year: true }, 14);
check("full draw: 14 frames", full.length === 14);
check("full draw: no impossible combos (e.g. Italy 1994)", full.every((f) => real.has(`${f.team}|${f.year}`)));
check("full draw: year settles before the team finishes (a tail of frames is locked to target year)",
  full.slice(-4).every((f) => f.year === 1994));

const yr = reelFrames("alltime", target, { team: false, year: true }, 14); // respin YEAR, hold Brazil
check("respin year: team is always held to Brazil", yr.every((f) => f.team === "Brazil"));
check("respin year: only years Brazil actually played appear", yr.every((f) => [1970, 1994, 2002].includes(f.year)));

const co = reelFrames("alltime", { teamCode: "ITA", name: "Italy", year: 1970 }, { team: true, year: false }, 14); // respin COUNTRY, hold 1970
check("respin country: year is always held to 1970", co.every((f) => f.year === 1970));
check("respin country: only teams that played 1970 appear (Brazil/Italy)", co.every((f) => ["Brazil", "Italy"].includes(f.team)));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
