// One match between two squad strengths (Spec §8). Neutral venue (no home edge); knockout ties go to
// extra time then penalties so a single elimination match can still upset.

import { BASE_GOALS, STEEP, MEAN_ATK, MEAN_DEF, LAMBDA_CLAMP, ET_FACTOR, PEN_EDGE, PEN_CLAMP } from "./params.js";
import { scoreMatrix, sampleScore } from "./poisson.js";

const clamp = (x, [lo, hi]) => Math.max(lo, Math.min(hi, x));

// λ for the side with `att` attacking the side with `oppDef` defense. Both are centered on the cohort
// means so an average-vs-average match yields λ ≈ BASE_GOALS (see params.js).
function lambdaFor(att, oppDef) {
  return clamp(BASE_GOALS * Math.exp(STEEP * ((att - MEAN_ATK) - (oppDef - MEAN_DEF))), LAMBDA_CLAMP);
}

// a, b: { attack, defense } quality. Returns { gf, ga, won, decidedBy } from a's perspective.
// `decidedBy`: "normal" | "extra time" | "penalties". `knockout` forces a winner.
export function playMatch(a, b, { knockout = false, rng = Math.random } = {}) {
  const la = lambdaFor(a.attack, b.defense);
  const lb = lambdaFor(b.attack, a.defense);
  let [gf, ga] = sampleScore(scoreMatrix(la, lb), rng);
  let decidedBy = "normal";

  if (knockout && gf === ga) {
    const [etf, etg] = sampleScore(scoreMatrix(la * ET_FACTOR, lb * ET_FACTOR), rng);
    gf += etf; ga += etg;
    decidedBy = "extra time";
    if (gf === ga) {
      // Penalties: near coin-flip with a small edge to the overall stronger side.
      const edge = (a.attack + a.defense - b.attack - b.defense) * PEN_EDGE;
      const pWin = clamp(0.5 + edge, PEN_CLAMP);
      decidedBy = "penalties";
      if (rng() < pWin) gf += 1; else ga += 1;
    }
  }

  return { gf, ga, won: gf > ga, decidedBy };
}
