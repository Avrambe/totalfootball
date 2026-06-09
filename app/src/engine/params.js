// All match-engine tuning constants in ONE place (Spec §8). The calibration script
// (calibrate.mjs) sweeps these to the spec targets; nothing else here is magic.

// Position attack/defense multipliers (mirror pipeline build_cards.POS_MULT, spec §3.4). A squad's
// attack/defense "quality" is the multiplier-weighted mean of its players' rating/99 (see squad.js),
// so GK contributes only to defense, forwards mostly to attack, etc.
export const POS_MULT = {
  GK: [0.0, 1.10],
  DF: [0.15, 1.0],
  MF: [0.6, 0.5],
  FW: [1.0, 0.1],
};

// Goal model (Dixon-Coles double-Poisson). Per side:
//   λ = BASE × exp(STEEP × ((attack − MEAN_ATK) − (oppDefense − MEAN_DEF)))
// Quality is the multiplier-weighted mean of rating/99 (squad.js), so it lives in ~[0.4, 0.97], NOT
// centered at 0. We center the matchup against the cohort means (MEAN_ATK/MEAN_DEF, the average
// fieldable squad) so an AVERAGE-vs-AVERAGE match gives λ ≈ BASE per side (→ ~2×BASE goals). Without
// centering, exp() of an uncentered [0,1] difference explodes goals. STEEP is the rating-edge→result
// steepness — the primary knob (spec §8). The calibration script can override these via env vars.
// Defaults below are the calibrated values from calibrate.mjs for the 2026 format (12 groups, 32
// advance, 5 KO rounds): spec §8 targets all land — near-perfect squad champions ~69%, a typical
// engaged draft ~12%, ~2.7 goals/match, frequent upsets.
const env = (k, d) => (typeof process !== "undefined" && process.env && process.env[k] != null ? +process.env[k] : d);
export const BASE_GOALS = env("CAL_BASE", 0.90);
export const STEEP = env("CAL_STEEP", 6.3);
export const MEAN_ATK = env("CAL_MEAN_ATK", 0.66);
export const MEAN_DEF = env("CAL_MEAN_DEF", 0.60);
export const RHO = env("CAL_RHO", -0.05);  // DC low-score correction (lifts 0-0/1-0/0-1/1-1 slightly)
export const MAX_GOALS = 9;        // score-matrix truncation
// Upper clamp caps how lopsided a blowout gets (a dominant side still WINS, just doesn't run up an
// absurd scoreline) — the main lever on average goals once STEEP sets the win curve.
export const LAMBDA_CLAMP = [0.04, env("CAL_LMAX", 3.3)];

// Knockout tie-breakers.
export const ET_FACTOR = 0.34;     // extra time ≈ 30 min at reduced intensity vs 90 min
export const PEN_EDGE = 0.18;      // penalty shootout edge per unit of overall quality gap (clamped)
export const PEN_CLAMP = [0.32, 0.68];

// Tournament shape — the real 2026 World Cup format (spec §7 progression tiers).
// 12 groups of 4: the top 2 of each group (24) PLUS the 8 best third-place teams = 32 advance, then
// a knockout starting at the Round of 32 (5 rounds). We simulate all 12 groups to set the
// third-place cut, so a stronger third-place record is genuinely more likely to go through.
export const GROUP_SIZE = 4;        // each group: 4 teams, full round-robin (yours is you + 3)
export const GROUPS = 12;           // 12 groups of 4 = 48 teams
export const THIRDS_ADVANCE = 8;    // the 8 best third-place teams advance (alongside the 24 top-2s)
export const KO_ROUNDS = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"];

// Seeded difficulty: each round draws opponents from a percentile band of the Elo-sorted field, so
// later rounds pull stronger teams (spec §8 "later rounds always pull from stronger teams"). Bands
// are [low, high] fractions of the sorted pool; draw is random within the band.
export const ELO_BANDS = {
  group: [0.10, 0.70],
  "Round of 32": [0.18, 0.78],
  "Round of 16": [0.30, 0.85],
  Quarterfinals: [0.45, 0.90],
  Semifinals: [0.55, 0.95],
  Final: [0.68, 1.0],
};
