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

// You can't draft the same real person twice — even a DIFFERENT era's version of him. Historical
// player_ids are already stable across tournament years (Messi is one id for 2006…2022), so the only
// gap is the 2026 cohort, which uses its own id scheme (`2026-<code>-<slug>`). We bridge that one
// boundary by matching normalized names ONLY when exactly one card is a 2026 card — so the genuine
// historical "same name, different person" pairs (both `P-…`) are never falsely merged.
const is2026Card = (c) => String(c.player_id).startsWith("2026-");
const normName = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export function samePerson(a, b) {
  if (a.player_id === b.player_id) return true;
  if (is2026Card(a) !== is2026Card(b)) return normName(a.name) === normName(b.name);
  return false;
}
export function alreadyDrafted(card, placed) {
  return placed.some((p) => samePerson(p, card));
}

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
  if (alreadyDrafted(card, placed)) return "grey"; // same real person already on the squad
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

// The currently-EMPTY slots `mover` could relocate into in a single move (no displacement), excluding
// `exceptSlotId`. A slot counts only if it's empty, the mover is eligible there, and the rest of the
// squad still seats without it. This is the "single-hop home" test behind a valid bump: we only offer
// to displace an incumbent when he has a real one-move spot to go to — matching the manual relocate
// step exactly, so a bump is never a dead end. (No chained, multi-player reshuffles — by design.)
function openRelocations(mover, placed, formation, pins, exceptSlotId) {
  const seating = seat(placed, formation, pins) || {};
  const others = placed.filter((p) => !samePerson(p, mover));
  const out = [];
  for (const slot of formation.slots) {
    if (slot.id === exceptSlotId || seating[slot.id]) continue; // skip the vacating slot + occupied slots
    if (!canPlay(mover, slot).eligible) continue;
    const remaining = formation.slots.filter((s) => s.id !== slot.id);
    if (assign(others, remaining) !== null) out.push(slot);
  }
  return out;
}

// Every slot a card may take in `formationName`, INCLUDING occupied ones where the incumbent can be
// re-seated elsewhere in his line (placement-with-displacement, 162-0 style). Each entry is
// { slot, effectiveness, kind } where kind is "open" (empty slot) or "bump" (displaces incumbent).
// A truly impossible slot (cross-line, or one whose incumbent has no single-move home) is not returned.
export function placementSpots(card, placed, formationName, pins) {
  const formation = getFormation(formationName);
  const seating = seat(placed, formation, pins) || {};
  const spots = [];
  for (const slot of formation.slots) {
    const cp = canPlay(card, slot);
    if (!cp.eligible) continue;
    const occupant = seating[slot.id];
    if (!occupant) {
      // Open slot: the rest of the roster must still seat in the remaining slots.
      const remaining = formation.slots.filter((s) => s.id !== slot.id);
      if (assign(placed, remaining) !== null) {
        spots.push({ slot, effectiveness: cp.effectiveness, kind: "open" });
      }
    } else if (occupant.player_id !== card.player_id) {
      // Occupied slot: a bump ONLY if the incumbent has a single-move home (an open slot he can take).
      if (openRelocations(occupant, placed, formation, pins, slot.id).length) {
        spots.push({ slot, effectiveness: cp.effectiveness, kind: "bump" });
      }
    }
  }
  return spots;
}

// ---------------------------------------------------------------------------------------------
// Optimal re-seat on formation change.
// `assign` above finds *any* valid seating; it doesn't care how well each player fits his slot. On a
// formation change we want the seating that wastes the LEAST total fit — and, on a tie, keeps players
// closest to where they already were. That's a max-weight bipartite assignment, solved exactly by the
// Hungarian (Kuhn–Munkres) algorithm below.

const BIG = 1e6; // cost for an ineligible (cross-line) pairing — never chosen if any valid seating exists.

// Square min-cost assignment. `cost` is an n×n matrix; returns rowToCol (length n). Classic O(n³)
// potentials method. We pad to square with zero-cost dummy rows/cols at the call site.
function hungarian(cost) {
  const n = cost.length;
  if (n === 0) return [];
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[j] = row assigned to col j (1-indexed; 0 = none)
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] >= 1) rowToCol[p[j] - 1] = j - 1;
  }
  return rowToCol;
}

// The seating that maximizes total effectiveness for `placed` in `formationName`. `prevTokenById`
// (Map<player_id, slotToken>) is the player's *previous* slot token; we add a tiny bonus for keeping a
// player on the same token, so an otherwise-equal re-seat keeps everyone where they were. Returns
// { slotId: card }, falling back to a plain `seat` if (defensively) the optimal one leaves anyone off.
export function bestLineup(placed, formationName, prevTokenById) {
  const formation = getFormation(formationName);
  const slots = formation.slots;
  const m = placed.length;
  const s = slots.length;
  if (m === 0) return {};
  const n = Math.max(m, s);
  const EPS = 0.001; // continuity tiebreak: smaller than any real effectiveness gap.
  const cost = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < s; j++) {
      const cp = canPlay(placed[i], slots[j]);
      if (!cp.eligible) {
        cost[i][j] = BIG;
      } else {
        let weight = cp.effectiveness;
        if (prevTokenById && prevTokenById.get(keyOf(placed[i])) === slots[j].token) weight += EPS;
        cost[i][j] = -weight; // minimize cost == maximize weight
      }
    }
    // dummy slot columns (j >= s) stay 0-cost.
  }
  // dummy rows (i >= m) stay 0-cost across all columns.
  const rowToCol = hungarian(cost);
  const out = {};
  let anyIneligible = false;
  for (let i = 0; i < m; i++) {
    const j = rowToCol[i];
    if (j < s && cost[i][j] < BIG) out[slots[j].id] = placed[i];
    else anyIneligible = true;
  }
  if (anyIneligible) return seat(placed, formation) || out;
  return out;
}

// For a card ALREADY on the board: where can he move? Returns his current slot (kind "current", not a
// move target) plus every other slot he's eligible for as "open" (empty & rest still seat) or "bump"
// (occupied but the incumbent can be re-seated). Mirrors placementSpots, but the mover is already placed.
export function moveSpots(card, placed, formationName, pins) {
  const formation = getFormation(formationName);
  const seating = seat(placed, formation, pins) || {};
  const currentSlotId = Object.keys(seating).find((sid) => seating[sid] && samePerson(seating[sid], card));
  const others = placed.filter((p) => !samePerson(p, card));
  const spots = [];
  for (const slot of formation.slots) {
    const cp = canPlay(card, slot);
    if (!cp.eligible) continue;
    if (slot.id === currentSlotId) {
      spots.push({ slot, effectiveness: cp.effectiveness, kind: "current" });
      continue;
    }
    const occupant = seating[slot.id];
    if (!occupant || samePerson(occupant, card)) {
      const remaining = formation.slots.filter((s) => s.id !== slot.id);
      if (assign(others, remaining) !== null) {
        spots.push({ slot, effectiveness: cp.effectiveness, kind: "open" });
      }
    } else {
      // Occupied slot: a bump ONLY if the incumbent has a single-move home (an open slot he can take),
      // matching the manual relocate step — so a bump is never a dead end. (No chained reshuffles.)
      if (openRelocations(occupant, placed, formation, pins, slot.id).length) {
        spots.push({ slot, effectiveness: cp.effectiveness, kind: "bump" });
      }
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
