// Draft-time formation logic, built entirely on the Phase 4 position engine (Spec §6).
// Pure functions over arrays of card objects — no React, no DOM, so they unit-test under node.
//
// Vocabulary:
//   - `cards`  : an array of placed card objects (each already carries team_code / year / position
//                / eligible_positions, straight from cards.json).
//   - `pins`   : optional Map<player_id, slotId> — the user's chosen spot for a card, honored by
//                `seat` when still valid (the "let me pick the spot" decision).
//   - seating  : { [slotId]: card } — which card sits in which slot of a given formation.

import { FORMATIONS, getFormation } from "../positions/formations.js";
import { canPlay } from "../positions/canPlay.js";

const LINES = ["GK", "DF", "MF", "FW"];
const keyOf = (card) => card.player_id;

// Bipartite assignment (augmenting paths). Returns slotIdx->cardIdx array, or null if not everyone
// can be seated. `pins` pre-place specific cards and are never displaced.
function assign(cards, slots, pins) {
  const slotToCard = new Array(slots.length).fill(-1);
  const pinned = new Set();

  if (pins && pins.size) {
    cards.forEach((c, ci) => {
      const sid = pins.get(keyOf(c));
      if (sid == null) return;
      const si = slots.findIndex((s) => s.id === sid);
      if (si >= 0 && slotToCard[si] === -1 && canPlay(c, slots[si]).eligible) {
        slotToCard[si] = ci;
        pinned.add(ci);
      }
    });
  }

  function aug(ci, seen) {
    for (let si = 0; si < slots.length; si++) {
      const occ = slotToCard[si];
      if (occ !== -1 && pinned.has(occ)) continue; // can't displace a pinned card
      if (seen[si] || !canPlay(cards[ci], slots[si]).eligible) continue;
      seen[si] = true;
      if (occ === -1 || aug(occ, seen)) {
        slotToCard[si] = ci;
        return true;
      }
    }
    return false;
  }

  if (cards.length > slots.length) return null;
  for (let ci = 0; ci < cards.length; ci++) {
    if (pinned.has(ci)) continue;
    if (!aug(ci, new Array(slots.length).fill(false))) return null;
  }
  return slotToCard;
}

// Can this formation seat everyone in `cards`?
export function fitsFormation(cards, formation, pins) {
  return assign(cards, formation.slots, pins) !== null;
}

// The slotId -> card map for a formation (honoring valid pins), or null if it can't hold everyone.
export function seat(cards, formation, pins) {
  const m = assign(cards, formation.slots, pins);
  if (!m) return null;
  const out = {};
  m.forEach((ci, si) => {
    if (ci !== -1) out[formation.slots[si].id] = cards[ci];
  });
  return out;
}

// Every formation that can still hold the given cards (the tightening dropdown's option set).
export function holdingFormations(cards, pins) {
  return FORMATIONS.filter((f) => fitsFormation(cards, f, pins));
}

// Offer state of one candidate card against the placed roster + current formation (Spec §6):
//   green  — fits the CURRENT formation (an open slot in his line exists right now)
//   yellow — current formation can't hold him, but some other formation still can
//   grey   — no formation can hold the roster + him
export function offerState(card, placed, formationName) {
  const formation = getFormation(formationName);
  const all = [...placed, card];
  if (fitsFormation(all, formation)) return "green";
  if (holdingFormations(all).length) return "yellow";
  return "grey";
}

// For a yellow card: the formations (by name) that WOULD hold him, other than the current one.
export function targetFormationsFor(card, placed, formationName) {
  return holdingFormations([...placed, card])
    .map((f) => f.name)
    .filter((n) => n !== formationName);
}

// The exact open slots a card may take in `formationName`, each with its canPlay effectiveness.
// A slot is valid only if the rest of the roster can still be seated without it.
export function validSpots(card, placed, formationName) {
  const formation = getFormation(formationName);
  const spots = [];
  for (const slot of formation.slots) {
    const cp = canPlay(card, slot);
    if (!cp.eligible) continue;
    // Reserve this slot for the card: can everyone already placed seat in the remaining slots?
    const remaining = formation.slots.filter((s) => s.id !== slot.id);
    if (assign(placed, remaining) !== null) {
      spots.push({ slot, effectiveness: cp.effectiveness });
    }
  }
  return spots;
}

// The bucket lines that still have room given the placed roster + current formation. A spun squad
// is worth offering iff it has a card in one of these (so a spin never dead-ends). Reuses offerState
// via a synthetic bucket-only card per line.
export function openLines(placed, formationName) {
  const open = new Set();
  for (const line of LINES) {
    const probe = { player_id: "__probe__", position: line, eligible_positions: [line] };
    if (offerState(probe, placed, formationName) !== "grey") open.add(line);
  }
  return open;
}
