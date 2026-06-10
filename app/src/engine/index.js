// Public surface for the match engine. `runTournament` is what the app calls when the user hits
// RUN IT: it converts the drafted XI into a squad strength (honoring off-position effectiveness) and
// runs a full seeded World Cup against real historical squads.

import { getFormation } from "../positions/formations.js";
import { canPlay } from "../positions/canPlay.js";
import { quality } from "./squad.js";
import { runBracket } from "./bracket.js";
import { scoreTournament } from "../scoring/score.js";
import { applyStyle, DEFAULT_STYLE } from "./style.js";

export { opponentPool } from "./bracket.js";
export { quality } from "./squad.js";

// seating: { [slotId]: card }. formationName: the chosen shape. era: "2026" | "modern" | "alltime".
// styleKey: the post-draft playing style (one of STYLES in ./style.js; defaults to "balanced").
export function runTournament(seating, formationName, era, styleKey = DEFAULT_STYLE, rng = Math.random) {
  const formation = getFormation(formationName);
  const slotById = new Map(formation.slots.map((s) => [s.id, s]));
  const cards = Object.values(seating);

  // Each card's effectiveness in the slot it actually occupies (1.0 natural, ≥0.88 off-position).
  const effById = new Map();
  for (const [slotId, card] of Object.entries(seating)) {
    const slot = slotById.get(slotId);
    effById.set(card.player_id, slot ? canPlay(card, slot).effectiveness : 1);
  }

  const q = quality(cards, (c) => effById.get(c.player_id) ?? 1);
  const styled = applyStyle(q, seating, formationName, styleKey);
  const result = runBracket({ quality: styled, style: styleKey }, era, rng);
  return { ...result, ...scoreTournament(result), formationName, style: styleKey };
}
