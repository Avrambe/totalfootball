// canPlay(player, slot) — the single source of truth for BOTH eligibility and effectiveness
// (Spec §4). Three layers:
//   1. Line floor   — a player is eligible for any slot in his own line; cross-line is the only "no".
//   2. Natural 1.0  — an exact granular token match (or a bucket-only player) plays at full strength.
//   3. Off-position — within a line, a granular specialist played off his token takes a small penalty
//                     scaled by zone/depth distance, floored at OFF_POS_FLOOR.
// Bucket-only players (no granular token in that line) are full strength anywhere in the line: we
// have no data to dock them, and penalizing missing data would unfairly punish the historical cards.

import { TOKENS, isBucket, lineOf } from "./taxonomy.js";

// One tunable. Set to 1.0 to disable the off-position penalty entirely (see Spec §13).
export const OFF_POS_FLOOR = 0.88;
const W_ZONE = 0.06;   // per zone step: side<->center = 1 step, wrong flank (left<->right) = 2 steps
const W_DEPTH = 0.03;  // per depth step (deep/mid/high) — deliberately gentler than zone

const ZONE_IX = { left: 0, central: 1, right: 2 };
const DEPTH_IX = { deep: 0, mid: 1, high: 2 };

function distanceCost(fromToken, toToken) {
  const a = TOKENS[fromToken];
  const b = TOKENS[toToken];
  if (!a || !b) return 0;
  const zd = Math.abs(ZONE_IX[a.zone] - ZONE_IX[b.zone]);
  const dd = Math.abs(DEPTH_IX[a.depth] - DEPTH_IX[b.depth]);
  return W_ZONE * zd + W_DEPTH * dd;
}

// player: a card with `eligible_positions` (array of tokens); falls back to `position` bucket.
// slot:   { token, line } from a formation.
export function canPlay(player, slot) {
  const elig = (player.eligible_positions && player.eligible_positions.length)
    ? player.eligible_positions
    : [player.position];

  const lines = new Set(elig.map(lineOf));
  if (!lines.has(slot.line)) return { eligible: false, effectiveness: 0 };

  // Granular tokens the player actually has in the slot's line.
  const granInLine = elig.filter((t) => !isBucket(t) && lineOf(t) === slot.line);

  // Bucket-only in this line, or an exact token match -> full strength.
  if (granInLine.length === 0 || granInLine.includes(slot.token)) {
    return { eligible: true, effectiveness: 1.0 };
  }

  // Specialist played off his token: best (smallest) cost over his granular tokens in this line.
  let best = Infinity;
  for (const t of granInLine) best = Math.min(best, distanceCost(t, slot.token));
  return { eligible: true, effectiveness: Math.max(OFF_POS_FLOOR, 1 - best) };
}
