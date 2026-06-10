// Playing style: a post-draft choice that modestly shifts the squad's match strength via THREE bounded
// levers, so "building to fit a style" pays off without overpowering roster quality (this is a roster
// game first). All magnitudes live here — easy to tune, add, or drop after playtesting.
//   1. Squad-fit (±SQUAD_CAP): how well your XI's ratings sit at the SLOTS this style cares about
//      (per-position weights), plus how well your formation suits it. Keyed off the SLOT a player
//      occupies, so it works for every era (incl. bucket-only historical cards).
//   2. Matchup tilt (±MATCH_CAP): your style vs the opponent's emergent style (rock-paper-scissors).
//   3. Age/stamina depressor (−STAMINA_CAP): high-energy styles fade with an older squad.

import { getFormation, DEFAULT_FORMATION } from "../positions/formations.js";

// Caps are deliberately small: the goal model applies exp(STEEP·Δ) (STEEP≈6.3), so even a few-percent
// quality shift moves outcomes noticeably. Style is seasoning; roster quality is the meal.
export const SQUAD_CAP = 0.025;  // max fractional shift from squad-fit (your roster matching the style)
export const MATCH_CAP = 0.018;  // max fractional shift from the style-vs-style matchup
export const STAMINA_CAP = 0.02; // max fractional penalty from squad age on high-energy styles
const W_FIT = 0.75;   // squad-fit weight within SQUAD_CAP
const W_FORM = 0.25;  // formation-compatibility weight within SQUAD_CAP
const REL_SCALE = 0.024; // a +0.024 slot-weighted-rating edge over the squad mean = full squad-fit signal
// Total Football fit is an EVENNESS reward (no weak link), not a weighted-mean spike: a squad whose 11
// slot ratings are TIGHTLY clustered scores high; a spiky squad scores low. REF_SPREAD is the spread
// (population stddev of the 0..1 slot ratings) that reads as "neutral"; tighter → positive fit.
const REF_SPREAD = 0.05;
const SPREAD_SCALE = 0.045; // a spread REF_SPREAD−0.045 tighter than neutral = full positive evenness signal
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const STYLES = [
  { key: "balanced",   labelKey: "style.balanced",   descKey: "style.balanced.desc" },
  { key: "possession", labelKey: "style.possession", descKey: "style.possession.desc" },
  { key: "counter",    labelKey: "style.counter",    descKey: "style.counter.desc" },
  { key: "press",      labelKey: "style.press",      descKey: "style.press.desc" },
  { key: "direct",     labelKey: "style.direct",     descKey: "style.direct.desc" },
  { key: "wing",       labelKey: "style.wing",       descKey: "style.wing.desc" },
  { key: "total",      labelKey: "style.total",      descKey: "style.total.desc" },
  { key: "positional", labelKey: "style.positional", descKey: "style.positional.desc" },
];
export const DEFAULT_STYLE = "balanced";

// Reference positions the per-style weights are expressed over, and the slot-token → reference map.
const REF = ["GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"];
const REF_INDEX = Object.fromEntries(REF.map((r, i) => [r, i]));
const TOKEN_TO_REF = {
  GK: "GK", CB: "CB", LB: "FB", RB: "FB", LWB: "FB", RWB: "FB",
  CDM: "DM", CM: "CM", CAM: "AM", LM: "W", RM: "W", LW: "W", RW: "W", ST: "ST",
};
// 0..100 importance of each reference position to each style. Sharpened so each style has a DISTINCT
// spike signature (low pairwise correlation) — that's what makes "which roster fits this style best"
// a real decision. Order: [GK, CB, FB, DM, CM, AM, W, ST]. (Total uses an evenness fit, not these.)
const POS_WEIGHTS = {
  possession: [55, 64, 56, 74, 98, 92, 60, 60], // owns CM+AM (central creativity); low DM/wide/ST
  positional: [55, 92, 92, 90, 80, 70, 55, 58], // owns CB+FB+DM (deep build-up spine); modest front line
  counter:    [60, 80, 86, 64, 55, 60, 92, 95], // deep block, WIDE transition, sharp forwards (not DM-led)
  direct:     [55, 88, 50, 86, 60, 45, 45, 98], // target man + aerial CBs, NARROW (kills W/FB)
  press:      [55, 64, 66, 94, 72, 58, 90, 92], // gegenpress: owns DM + high W/ST; low CM/AM/CB/FB
  wing:       [50, 60, 96, 60, 60, 70, 98, 82], // flanks dominant + crosses, low central
  total:      [70, 80, 85, 80, 90, 85, 85, 80], // kept high/even for display + deriveStyle (fit = evenness)
};
// High-energy styles that fade with age (weight 0..1 of STAMINA_CAP).
const STAMINA = { press: 1.0, total: 0.6, wing: 0.4 };
// Formation compatibility: +1 High, 0 Moderate, −1 Poor.
const FORMATION_FIT = {
  possession: { "4-3-3": 1, "4-2-3-1": 0, "4-4-2": -1, "4-5-1": -1, "3-5-2": -1, "3-4-3": 1, "5-3-2": -1, "5-4-1": -1 },
  counter:    { "4-3-3": 0, "4-2-3-1": 1, "4-4-2": 1, "4-5-1": 1, "3-5-2": 1, "3-4-3": -1, "5-3-2": 1, "5-4-1": 1 },
  press:      { "4-3-3": 1, "4-2-3-1": 1, "4-4-2": 1, "4-5-1": -1, "3-5-2": -1, "3-4-3": 0, "5-3-2": -1, "5-4-1": -1 },
  direct:     { "4-3-3": 0, "4-2-3-1": 0, "4-4-2": 1, "4-5-1": 0, "3-5-2": 1, "3-4-3": -1, "5-3-2": 1, "5-4-1": 0 },
  wing:       { "4-3-3": 1, "4-2-3-1": 1, "4-4-2": -1, "4-5-1": -1, "3-5-2": 1, "3-4-3": 0, "5-3-2": 1, "5-4-1": -1 },
  total:      { "4-3-3": 1, "4-2-3-1": 0, "4-4-2": 1, "4-5-1": -1, "3-5-2": -1, "3-4-3": 1, "5-3-2": -1, "5-4-1": -1 },
  positional: { "4-3-3": 1, "4-2-3-1": 0, "4-4-2": -1, "4-5-1": -1, "3-5-2": -1, "3-4-3": 0, "5-3-2": -1, "5-4-1": -1 },
};
// 8×8 rock-paper-scissors matrix (row's win-expectancy vs col; 50 = neutral). ANTISYMMETRIC by
// construction (M[a][b] + M[b][a] = 100) so no style has a structural edge across the whole field —
// a matchup is situational, not a free lunch. Balanced sits outside it (always neutral).
const MK = ["possession", "counter", "press", "direct", "wing", "total", "positional"];
const MATCHUP_ROWS = {
  possession: [50, 40, 38, 60, 53, 47, 50],
  counter:    [60, 50, 62, 52, 52, 46, 47],
  press:      [62, 38, 50, 40, 52, 50, 47],
  direct:     [40, 48, 60, 50, 50, 46, 45],
  wing:       [47, 48, 48, 50, 50, 49, 49],
  total:      [53, 54, 50, 54, 51, 50, 51],
  positional: [50, 53, 53, 55, 51, 49, 50],
};
const MATCHUP = Object.fromEntries(
  Object.entries(MATCHUP_ROWS).map(([k, row]) => [k, Object.fromEntries(MK.map((c, i) => [c, row[i]]))])
);

// How well a seating fits a style: a slot-weighted rating edge over the squad's flat mean (relScaled),
// and the formation compatibility (formComp). relScaled > 0 ⇒ the squad is genuinely BUILT for this.
function fitScore(seating, formationName, key) {
  const weights = POS_WEIGHTS[key];
  if (!weights || !seating) return { relScaled: 0, formComp: 0 };
  const formation = getFormation(formationName) || getFormation(DEFAULT_FORMATION);
  const ratings = [];
  let wSum = 0, wRating = 0, rSum = 0, n = 0;
  for (const slot of formation.slots) {
    const card = seating[slot.id];
    if (!card) continue;
    const r = (card.wc_rating || 0) / 99;
    const w = weights[REF_INDEX[TOKEN_TO_REF[slot.token] || "CM"]];
    wSum += w; wRating += w * r;
    rSum += r; n += 1; ratings.push(r);
  }
  if (!n || !wSum) return { relScaled: 0, formComp: 0 };
  const formComp = (FORMATION_FIT[key] && FORMATION_FIT[key][formationName]) || 0;
  // Total Football: reward EVENNESS (tight rating spread = no weak link), not a weighted-mean spike.
  if (key === "total") {
    const m = rSum / n;
    const spread = Math.sqrt(ratings.reduce((s, r) => s + (r - m) ** 2, 0) / n);
    return { relScaled: clamp((REF_SPREAD - spread) / SPREAD_SCALE, -1, 1), formComp };
  }
  const relScaled = clamp((wRating / wSum - rSum / n) / REL_SCALE, -1, 1);
  return { relScaled, formComp };
}

const avgAge = (seating) => {
  const ages = Object.values(seating || {}).map((c) => c && c.age).filter((a) => a > 0);
  return ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : 27;
};

// Apply the chosen style to the squad's {attack, defense}. Bounded by SQUAD_CAP (plus the age penalty).
export function applyStyle(quality, seating, formationName, styleKey) {
  if (!styleKey || styleKey === "balanced" || !POS_WEIGHTS[styleKey]) {
    return { attack: quality.attack, defense: quality.defense };
  }
  const { relScaled, formComp } = fitScore(seating, formationName, styleKey);
  // Two-way boost: a style that SUITS your squad makes the whole team click — apply it equally to
  // attack and defense. (In the goal model att and def have equal leverage, so a side-split would
  // hand "both-sides" styles a structural edge unrelated to roster fit — the thing we're fixing.)
  const boost = clamp(SQUAD_CAP * (W_FIT * relScaled + W_FORM * formComp), -SQUAD_CAP, SQUAD_CAP);
  const sw = STAMINA[styleKey] || 0;
  const pen = sw > 0 ? STAMINA_CAP * sw * clamp((avgAge(seating) - 26) / 7, 0, 1) : 0;
  return {
    attack: quality.attack * (1 + boost - pen),
    defense: quality.defense * (1 + boost - pen),
  };
}

// The emergent style of a squad (used to give opponents a style without hand-authored data): the
// non-balanced style this seating fits best.
export function deriveStyle(seating, formationName) {
  let best = "balanced", bestScore = -Infinity;
  for (const s of STYLES) {
    if (s.key === "balanced") continue;
    const { relScaled, formComp } = fitScore(seating, formationName, s.key);
    const score = W_FIT * relScaled + W_FORM * formComp;
    if (score > bestScore) { bestScore = score; best = s.key; }
  }
  return best;
}

// Multiplier on YOUR strength from the style matchup (≥1 favorable, <1 unfavorable). The strongest
// matchup deviates ~12 from neutral, so /15 maps it to ~0.8 of the cap; clamp guards the rest.
export function matchupMultiplier(yourStyle, oppStyle) {
  if (yourStyle === "balanced" || oppStyle === "balanced") return 1;
  const row = MATCHUP[yourStyle];
  if (!row || row[oppStyle] == null) return 1;
  return 1 + MATCH_CAP * clamp((row[oppStyle] - 50) / 15, -1, 1);
}

// Field-CENTERED matchup: the raw matchup is zero-sum pairwise, but the opponent FIELD isn't uniform
// (some emergent styles are far more common), so a style that happens to beat the common opponent would
// gain a standing, field-wide edge — a free lunch, not flavor. Divide each style's multiplier by its
// own field-average so it nets to 1.0 across the actual distribution: you gain vs some opponents and
// lose vs others, but no style is better against the field as a whole. `styleCounts` = {styleKey: n}
// over the era's emergent opponent styles. Returns (your, opp) → centered multiplier (≈1, ±MATCH_CAP).
export function fieldMatchup(styleCounts) {
  const total = MK.reduce((s, k) => s + (styleCounts[k] || 0), 0) || 1;
  const freq = Object.fromEntries(MK.map((k) => [k, (styleCounts[k] || 0) / total]));
  const avg = Object.fromEntries(
    MK.map((y) => [y, MK.reduce((s, o) => s + freq[o] * matchupMultiplier(y, o), 0) || 1])
  );
  return (your, opp) => {
    if (your === "balanced" || opp === "balanced") return 1;
    return matchupMultiplier(your, opp) / (avg[your] || 1);
  };
}
