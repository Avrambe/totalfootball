// Turn a finished tournament into the player-facing score (Spec §7): a per-game Elo (the leaderboard
// chase number) and, for Champions only, a letter grade. Elo starts at START_ELO and accumulates a
// delta per match — win/draw/loss × opponent strength × diminishing-margin. Reads `oppStrength` (the
// opponent's national-team Elo percentile, 0..1) that bracket.js stamps on every match record.

import {
  START_ELO, K_WIN, OPP_BASE, OPP_SPAN, WIN_BASE, MARGIN_TAU,
  K_DRAW, K_LOSS, LOSS_BASE, LOSS_SPAN, LOSS_FLOOR, GRADE_THRESHOLDS,
} from "./params.js";

// Saturating margin curve: 0 at a 1-goal edge, rising toward 1 as the margin grows (diminishing returns).
const dim = (m) => 1 - Math.exp(-(m - 1) / MARGIN_TAU);

// Elo movement for ONE match. `m` carries you/opp goals, won flag, and oppStrength (0..1 percentile).
export function matchDelta(m) {
  const s = m.oppStrength ?? 0.5;
  const margin = Math.abs(m.you - m.opp);
  if (m.you === m.opp) return K_DRAW * (s - 0.5) * 2;            // exact draw (group only; KO forces a winner)
  if (m.won) return K_WIN * (OPP_BASE + OPP_SPAN * s) * (WIN_BASE + (1 - WIN_BASE) * dim(margin));
  return -K_LOSS * (LOSS_BASE + LOSS_SPAN * (1 - s)) * (LOSS_FLOOR + (1 - LOSS_FLOOR) * dim(margin));
}

// Letter grade — Champions only; bands from the simulated champion distribution (params.js). Else null.
export function grade(finalElo, isChampion) {
  if (!isChampion) return null;
  if (finalElo >= GRADE_THRESHOLDS["S+"]) return "S+";
  if (finalElo >= GRADE_THRESHOLDS.S) return "S";
  if (finalElo >= GRADE_THRESHOLDS.A) return "A";
  return "B";
}

// Score a whole tournament result → { elo, eloDelta, grade }. Sums the delta over every match the
// player actually played (their 3 group matches + each knockout match).
export function scoreTournament(result) {
  let delta = 0;
  for (const m of result.group.matches) delta += matchDelta(m);
  for (const m of result.knockout) delta += matchDelta(m);
  const elo = Math.round(START_ELO + delta);
  return { elo, eloDelta: Math.round(delta), grade: grade(elo, result.tier === "Champions") };
}
