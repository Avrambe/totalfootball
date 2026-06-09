// Squad → strength. A squad aggregates to two scalars in ~[0,1]: attack and defense "quality", the
// position-multiplier-weighted mean of its players' rating/99 (spec §3.4). Because it's a weighted
// MEAN (not a sum), it's comparable across squads of any size/formation and an all-99 squad → ~1.0,
// an all-50 squad → ~0.5. The off-position `eff` (canPlay) scales a player's contribution when he's
// out of his natural slot.

import { POS_MULT } from "./params.js";
import { squadCards } from "../spin/pools.js";

const KO_SHAPE = { GK: 1, DF: 4, MF: 3, FW: 3 }; // standard XI for an opponent's best lineup

// cards: array of card objects. effOf: optional (card) -> 0..1 effectiveness multiplier.
export function quality(cards, effOf) {
  let aNum = 0, aDen = 0, dNum = 0, dDen = 0;
  for (const c of cards) {
    const mult = POS_MULT[c.position];
    if (!mult) continue;
    const [am, dm] = mult;
    const eff = effOf ? effOf(c) : 1;
    const r01 = (c.wc_rating || 0) / 99;
    aNum += r01 * am * eff; aDen += am;
    dNum += r01 * dm * eff; dDen += dm;
  }
  return { attack: aDen ? aNum / aDen : 0, defense: dDen ? dNum / dDen : 0 };
}

// An opponent's best XI: the highest-rated GK/4 DF/3 MF/3 FW from its real squad (natural slots).
// Returns null if any line can't be filled (squad too thin — excluded from the opponent pool).
export function bestXI(teamCode, year) {
  const all = squadCards(teamCode, year);
  const out = [];
  for (const [pos, n] of Object.entries(KO_SHAPE)) {
    const pool = all.filter((c) => c.position === pos).sort((a, b) => b.wc_rating - a.wc_rating);
    if (pool.length < n) return null;
    out.push(...pool.slice(0, n));
  }
  return out;
}

// Convenience: an opponent (teamCode, year) -> { attack, defense } quality, or null if not fieldable.
export function opponentQuality(teamCode, year) {
  const xi = bestXI(teamCode, year);
  return xi ? quality(xi) : null;
}
