// Formations as data (Spec §4/§6). Each formation is a list of 11 slots; each slot declares its
// natural granular token and its line. A bucket-only player fills any slot in his line via the line
// floor (canPlay), so historical bucket cards drop into granular formations with zero special-casing.
//
// Slots use granular tokens that keep the conventional bucket count of the name: wing-backs (LWB/RWB
// are DF-line in our taxonomy) appear only in back-five shapes; wide midfielders use LM/RM so a
// "3-5-2" really is three at the back.

import { lineOf } from "./taxonomy.js";
import { canPlay } from "./canPlay.js";

// Pitch coordinates are data on each slot: { x, y } as 0..1 fractions of the board, attacking
// UP — y=0 is the opponent's goal line (forwards), y=1 is our own goal (keeper); x=0 left, x=1
// right. The desktop pitch view (Phase 5) reads these directly; the narrow line-row fallback
// ignores them.
//
// Rows follow the formation NAME, not the GK/DF/MF/FW taxonomy line: a "4-2-3-1" is drawn as FOUR
// outfield bands (4 def / 2 holding / 3 attacking / 1 forward), the soccer convention where each
// digit is its own line — even though the holding (CDM) and attacking (CAM/RM/LM) bands are both
// "MF" in our taxonomy. The token arrays below are written defense->attack in band order, and slot
// 0 is always GK, so we can walk the name's digit groups and consume that many outfield slots each.
const GK_Y = 0.92;          // keeper, alone at the bottom
const Y_DEEP = 0.72;        // deepest outfield band (defenders)
const Y_HIGH = 0.16;        // most advanced band (forwards)

function makeFormation(name, tokens) {
  const counts = { GK: 0, DF: 0, MF: 0, FW: 0 };
  const slots = tokens.map((token) => {
    const line = lineOf(token);     // taxonomy line — drives eligibility; unchanged
    counts[line] += 1;
    return { id: `${line}${counts[line]}`, token, line };
  });

  slots[0].x = 0.5;
  slots[0].y = GK_Y;                 // slot 0 is GK in every formation
  const bands = name.split("-").map(Number);   // e.g. "4-2-3-1" -> [4,2,3,1]
  let idx = 1;                       // first outfield slot (after GK)
  bands.forEach((size, b) => {
    const y = bands.length === 1 ? Y_DEEP : Y_DEEP - b * (Y_DEEP - Y_HIGH) / (bands.length - 1);
    // Token arrays are written right->left (RB, CB, CB, LB), so map the first slot to high x —
    // right side on the right, left side on the left, as formations are conventionally drawn.
    for (let k = 0; k < size; k++, idx++) {
      slots[idx].x = (size - k) / (size + 1);
      slots[idx].y = y;
    }
  });
  return { name, slots, signature: { ...counts } };
}

export const FORMATIONS = [
  makeFormation("4-3-3",   ["GK", "RB", "CB", "CB", "LB", "CM", "CDM", "CM", "RW", "ST", "LW"]),
  makeFormation("4-4-2",   ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"]),
  makeFormation("4-2-3-1", ["GK", "RB", "CB", "CB", "LB", "CDM", "CDM", "RM", "CAM", "LM", "ST"]),
  makeFormation("4-5-1",   ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "CM", "LM", "ST"]),
  makeFormation("3-5-2",   ["GK", "CB", "CB", "CB", "RM", "CM", "CM", "CM", "LM", "ST", "ST"]),
  makeFormation("3-4-3",   ["GK", "CB", "CB", "CB", "RM", "CM", "CM", "LM", "RW", "ST", "LW"]),
  makeFormation("5-3-2",   ["GK", "RWB", "CB", "CB", "CB", "LWB", "CDM", "CM", "CM", "ST", "ST"]),
  makeFormation("5-4-1",   ["GK", "RWB", "CB", "CB", "CB", "LWB", "RM", "CM", "CM", "LM", "ST"]),
];

export const DEFAULT_FORMATION = "4-3-3";

export function getFormation(name) {
  return FORMATIONS.find((f) => f.name === name);
}

// Can every placed player be assigned to a distinct eligible slot in this formation? Bipartite
// matching (augmenting paths) — robust to versatile multi-line players, unlike a naive line count.
export function formationFits(players, formation) {
  const slots = formation.slots;
  const slotToPlayer = new Array(slots.length).fill(-1);

  function assign(pi, seen) {
    for (let si = 0; si < slots.length; si++) {
      if (seen[si] || !canPlay(players[pi], slots[si]).eligible) continue;
      seen[si] = true;
      if (slotToPlayer[si] === -1 || assign(slotToPlayer[si], seen)) {
        slotToPlayer[si] = pi;
        return true;
      }
    }
    return false;
  }

  if (players.length > slots.length) return false;
  for (let pi = 0; pi < players.length; pi++) {
    if (!assign(pi, new Array(slots.length).fill(false))) return false;
  }
  return true;
}

// The formations that can still seat everyone already placed — the data behind Phase 5's tightening
// dropdown. (Reason strings like "you have 5 defenders" are derived from the signatures in Phase 5.)
export function formationsHolding(players) {
  return FORMATIONS.filter((f) => formationFits(players, f));
}
