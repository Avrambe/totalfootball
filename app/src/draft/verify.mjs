// Phase 5 verification — pure-logic assertions for the draft helpers (offer.js + tighten.js).
// Run: node app/src/draft/verify.mjs   (ESM, no test framework — matches the project's tooling.)

import {
  seat, fitsFormation, holdingFormations, offerState, targetFormationsFor, validSpots, openLines,
  placementSpots, samePerson, alreadyDrafted, bestLineup, moveSpots,
} from "../formation/offer.js";
import { reasonString } from "../formation/tighten.js";
import { getFormation } from "../positions/formations.js";
import { canPlay } from "../positions/canPlay.js";
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

console.log("== cross-era same-person dedup (offer.js samePerson/alreadyDrafted) ==");
// Historical player_id is stable across years -> same id, already merged.
const messi18 = { player_id: "P-14758", name: "Lionel Messi", position: "FW", eligible_positions: ["FW"] };
const messi14 = { player_id: "P-14758", name: "Lionel Messi", position: "FW", eligible_positions: ["FW"] };
check("same historical id (Messi 2018 vs 2014) -> samePerson", samePerson(messi18, messi14));
check("Messi 2014 is alreadyDrafted once Messi 2018 is placed", alreadyDrafted(messi14, [messi18]));
// 2026 cohort uses a different id scheme; bridge by normalized name when exactly one side is 2026.
const messi26 = { player_id: "2026-ARG-lionel-messi", name: "Lionel Messi", position: "FW", eligible_positions: ["FW"] };
check("2026 Messi matches historical Messi by name", samePerson(messi26, messi18));
check("placing 2026 Messi greys the historical Messi (offerState)", offerState(messi18, [messi26], "4-3-3") === "grey");
check("placing historical Messi greys the 2026 Messi (offerState)", offerState(messi26, [messi18], "4-3-3") === "grey");
// Two genuinely-different historical people sharing a name (both P-…) must NOT be merged.
const danilA = { player_id: "P-1001", name: "Danilo", position: "DF", eligible_positions: ["DF"] };
const danilB = { player_id: "P-2002", name: "Danilo", position: "MF", eligible_positions: ["MF"] };
check("two different historical 'Danilo' (both P-…) are NOT merged", !samePerson(danilA, danilB));

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

console.log("== placementSpots: filled slots stay placeable (bump the incumbent) ==");
// One DF already placed in 4-3-3, then offer another DF. Open DF slots = bump-free (kind "open");
// the slot the incumbent sits in should be offered as "bump" (he can re-seat in another DF slot).
const oneDf = [card("DF")];
const seated = seat(oneDf, getFormation("4-3-3"));
const occupiedSlotId = Object.keys(seated)[0];
const pSpots = placementSpots(card("DF"), oneDf, "4-3-3");
check("a 2nd DF sees all 4 DF slots placeable", pSpots.length === 4);
check("the occupied DF slot is offered as a bump", pSpots.some((sp) => sp.slot.id === occupiedSlotId && sp.kind === "bump"));
check("the empty DF slots are offered as open", pSpots.filter((sp) => sp.kind === "open").length === 3);
check("no MF/FW/GK slot is ever offered to a DF (cross-line stays impossible)",
  pSpots.every((sp) => sp.slot.line === "DF"));
// When the line is full AND a displaced incumbent has nowhere to go, the slot is NOT offered.
const fourDf = many(4, "DF");
const fullSpots = placementSpots(card("DF"), fourDf, "4-3-3");
check("with all 4 DF slots full and no room to relocate, a 5th DF gets no DF spot", fullSpots.length === 0);

// A bump must be reachable in a SINGLE move (the incumbent has an actually-open slot to take) — not
// only via a multi-player reshuffle. 4-3-3: pin a DF/MF-versatile card + 2 pure MF in the 3 MF slots,
// and 3 pure DF in 3 of 4 DF slots (1 DF slot open). Offer a pure MF. Only the versatile incumbent can
// move (single-hop to the open DF slot); the 2 pure-MF incumbents are only multi-hop-displaceable, so
// their slots must NOT be offered as bumps (the user's "only Le Kang-in's slot turns yellow" case).
const f433 = getFormation("4-3-3");
const dfS = f433.slots.filter((sl) => sl.line === "DF");
const mfS = f433.slots.filter((sl) => sl.line === "MF");
const versV = card("MF", "DF", "MF"); // eligible at both DF and MF lines
const pm1 = card("MF"), pm2 = card("MF");
const pd1 = card("DF"), pd2 = card("DF"), pd3 = card("DF");
const placedMH = [versV, pm1, pm2, pd1, pd2, pd3];
const pinsMH = new Map([
  [versV.player_id, mfS[0].id], [pm1.player_id, mfS[1].id], [pm2.player_id, mfS[2].id],
  [pd1.player_id, dfS[0].id], [pd2.player_id, dfS[1].id], [pd3.player_id, dfS[2].id],
]);
const mhSpots = placementSpots(card("MF"), placedMH, "4-3-3", pinsMH);
check("single-hop bump: exactly ONE MF slot is a bump (the versatile incumbent's), not all 3",
  mhSpots.filter((sp) => sp.kind === "bump").length === 1);
check("single-hop bump: the bump is the slot the DF-capable midfielder occupies",
  mhSpots.some((sp) => sp.kind === "bump" && sp.slot.id === mfS[0].id));

console.log("== bestLineup: optimal (least-degradation) re-seat ==");
function sumEff(seating, formationName) {
  const f = getFormation(formationName);
  let total = 0;
  for (const [sid, c] of Object.entries(seating)) {
    const slot = f.slots.find((sl) => sl.id === sid);
    if (slot) total += canPlay(c, slot).effectiveness;
  }
  return total;
}
// An LB and an RB specialist: the only 2.0-total seating is LB->LB, RB->RB. A naive
// matching can land one or both off-position; bestLineup must find the optimum.
const lr = [card("DF", "LB"), card("DF", "RB")];
const optLR = bestLineup(lr, "4-3-3");
const naiveLR = seat(lr, getFormation("4-3-3"));
check("bestLineup seats all placed cards", Object.keys(optLR).length === 2);
check("bestLineup total effectiveness >= naive seat", sumEff(optLR, "4-3-3") >= sumEff(naiveLR, "4-3-3") - 1e-9);
check("bestLineup achieves the optimal 2.0 (LB->LB, RB->RB)", Math.abs(sumEff(optLR, "4-3-3") - 2.0) < 1e-9);
// Continuity tiebreak: a bucket MF is 1.0 at every MF slot (a tie); prevToken should
// keep him on the matching token rather than an arbitrary MF slot.
const cdmSlot = getFormation("4-3-3").slots.find((sl) => sl.token === "CDM");
const cmCard = card("MF");
const prevToken = new Map([[cmCard.player_id, "CDM"]]);
const optCdm = bestLineup([cmCard], "4-3-3", prevToken);
check("continuity tiebreak seats the card on its previous token (CDM)", optCdm[cdmSlot.id] && optCdm[cdmSlot.id].player_id === cmCard.player_id);

console.log("== moveSpots: tap a placed player to move him ==");
// 2 MF placed in 4-3-3 (3 MF slots). Move one: his slot = current, the other MF card's
// slot = bump (incumbent can re-seat in the free MF slot), the empty MF slot = open.
const mf2 = many(2, "MF");
const moverFormation = "4-3-3";
const moveSeat = seat(mf2, getFormation(moverFormation));
const movePins = new Map(Object.entries(moveSeat).map(([sid, c]) => [c.player_id, sid]));
const ms = moveSpots(mf2[0], mf2, moverFormation, movePins);
check("moveSpots offers exactly one 'current' (where he sits now)", ms.filter((sp) => sp.kind === "current").length === 1);
check("moveSpots offers one 'open' (the empty MF slot)", ms.filter((sp) => sp.kind === "open").length === 1);
check("moveSpots offers one 'bump' (the other MF card, re-seatable)", ms.filter((sp) => sp.kind === "bump").length === 1);
check("moveSpots never offers a cross-line slot (all MF for an MF card)", ms.every((sp) => sp.slot.line === "MF"));
check("the 'current' spot carries his effectiveness there", ms.find((sp) => sp.kind === "current").effectiveness === 1.0);

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
