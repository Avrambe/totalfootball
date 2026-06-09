// Reason strings for the tightening formation dropdown (Spec §6). The dropdown itself is just
// `holdingFormations(placed)` from offer.js; this explains WHY it narrowed, from the actual seating
// of the placed roster (so versatile players are counted by the slot they occupy, not their bucket).

import { FORMATIONS, getFormation } from "../positions/formations.js";
import { seat, holdingFormations } from "./offer.js";

// Count placed cards per line, by where they actually sit in the current formation.
function placedByLine(placed, formationName, pins) {
  const counts = { GK: 0, DF: 0, MF: 0, FW: 0 };
  const s = seat(placed, getFormation(formationName), pins);
  if (!s) return counts;
  for (const slotId of Object.keys(s)) {
    const line = slotId.replace(/[0-9]+$/, "");
    if (line in counts) counts[line] += 1;
  }
  return counts;
}

// "" when nothing has tightened yet; otherwise a short human reason for the narrowed option set.
export function reasonString(placed, formationName, pins) {
  const holding = holdingFormations(placed, pins);
  if (holding.length >= FORMATIONS.length) return "";

  const c = placedByLine(placed, formationName, pins);
  if (c.DF >= 5) return `Locked to back-five shapes: you have ${c.DF} defenders.`;
  if (c.FW >= 3) return `Locked to three-forward shapes: you have ${c.FW} forwards.`;
  if (c.MF >= 5) return `Locked to five-midfield shapes: you have ${c.MF} midfielders.`;
  if (c.DF >= 4 && c.FW >= 1) return "Formation options are narrowing as your squad fills in.";
  return "Formation options are narrowing as your squad fills in.";
}
