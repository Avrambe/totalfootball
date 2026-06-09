// All Elo + letter-grade tuning constants in ONE place (Spec §7). Elo is the leaderboard chase number:
// every game starts at START_ELO and each match moves it by result × opponent-strength × margin (with
// diminishing returns on margin so blowout-farming a weak side can't beat a tight win over a great one).
// The calibration script (calibrate.mjs) sweeps these to the spec targets; env vars override for sweeps.

const env = (k, d) => (typeof process !== "undefined" && process.env && process.env[k] != null ? +process.env[k] : d);

export const START_ELO = 1500;

// Win delta = K_WIN × oppWeight(s) × (WIN_BASE + (1−WIN_BASE)·dim(margin)).
//   oppWeight(s) = OPP_BASE + OPP_SPAN·s  (s = opponent's Elo percentile 0..1; strong opp worth more)
//   dim(m)       = 1 − exp(−(m−1)/MARGIN_TAU)  (a 1-goal win earns the WIN_BASE share; extra goals add
//                  a SATURATING bonus, so +1→+3 matters but +6→+8 barely moves — spec's diminishing margin)
export const K_WIN = env("SC_KWIN", 38);
export const OPP_BASE = env("SC_OPPBASE", 0.55);
export const OPP_SPAN = env("SC_OPPSPAN", 0.9);
export const WIN_BASE = env("SC_WINBASE", 0.6);
export const MARGIN_TAU = env("SC_MTAU", 2.2);

// Draw delta = K_DRAW × (s − 0.5)·2  → vs a strong side slightly +, vs a weak side slightly −.
export const K_DRAW = env("SC_KDRAW", 10);

// Loss delta = −K_LOSS × (LOSS_BASE + LOSS_SPAN·(1−s)) × (LOSS_FLOOR + (1−LOSS_FLOOR)·dim(margin)).
// Inverse opp weighting: losing to a WEAK side (low s) hurts MORE; a heavier defeat costs more (saturating).
export const K_LOSS = env("SC_KLOSS", 32);
export const LOSS_BASE = env("SC_LOSSBASE", 0.5);
export const LOSS_SPAN = env("SC_LOSSSPAN", 0.8);
export const LOSS_FLOOR = env("SC_LOSSFLOOR", 0.5);

// Letter grade (Champions only) by final Elo. Thresholds read off the simulated champion finalElo
// distribution (calibrate.mjs) so the bands are real, not arbitrary. Non-champions get grade = null.
// Calibrated to the champion finalElo distribution (K_WIN=38 etc.): a dominant flawless run (~1740, the
// spec's S+ example) lands S+, a typical champion (~1698) lands S, a scrappier title A, a flukey one B.
export const GRADE_THRESHOLDS = {
  "S+": env("SC_GRADE_SPLUS", 1735),
  S: env("SC_GRADE_S", 1700),
  A: env("SC_GRADE_A", 1665),
  // anything a champion scores below A is a B.
};
