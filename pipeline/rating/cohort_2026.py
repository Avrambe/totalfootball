"""Phase 3 — the 2026 World Cup cohort, rated by a TWO-TIER system. Spec §5, plan addendum.

The 2026 squads are NOT in the Fjelstul spine (it ends 2022) and these players have no 2026 WC
stats (the tournament hasn't happened), so they can't go through the historical Layer A–F path.
The 2026 rating therefore has two tiers:

  1. CONSENSUS tier (the elite) — anchored to merged industry "best players entering 2026"
     rankings (consensus_2026.py). A matched player's rating is taken DIRECTLY from the
     rank→rating curve (ceiling 97; no age factor — the lists already price age). The top should
     reflect cross-publication consensus, not our own proxy stats (which minted role-players at 98).

  2. COMPOSITE tier (everyone else, ~1,100 players) — a de-inflated proxy, age-corrected
     MARKET VALUE as the backbone (see `_composite`):
         composite = backbone(market_value) refined by club_form (lift-only), floored by stature
         raw       = composite × age_factor(position)            (Layer 0, gentle for keepers)
     then percentile-ranked within position and mapped onto a TARGET rating BAND defined by a
     mean + standard deviation (N(TARGET_MEAN, TARGET_SD) via inverse-normal — a robust rank-based
     z-score). The 2026 cohort is a truncated population (every card is a WC-squad professional), so
     it gets its own believable band — a "fringe pro" floor and a tight spread — instead of
     inheriting football history's amateur-to-legend shape (which sent keepers to 2 and capped strong
     mid-tier nations in the high 60s). Finally CAPPED at CONSENSUS_FLOOR−1 so no non-listed player
     can outrank a listed one.

Key changes from the first 2026 pass (which over-rated weak-league veterans, e.g. Laimer 98):
  - International caps REMOVED entirely — caps measure national-team volume, not skill.
  - Market value is the BACKBONE, but AGE-CORRECTED first (`_age_premium`): MV over-prices youth
    (resale potential) and under-prices age, so we divide that bias out to get a current-skill
    proxy. It covers ~65% of the cohort incl. non-European leagues, rescuing good players in
    mediocre/uncovered leagues (Mané, Mahrez…) and lifting real internationals (Mathew Ryan).
  - The INVERTED 0.5 baseline is GONE (Phase Ratings-fix-2): it let no-data players outrank real
    ones. Club form is now an *asymmetric* refinement (lifts at full weight, drags at a throttle)
    so a quality player at a small club isn't punished for the club; truly invisible players sink
    to LOW_PRIOR. The age curve is position-aware (keepers peak late, decline slowly).
  - The raw-MV youth FLOOR is gone (consensus + age-corrected M handle youth properly); the
    `volatility` tag is KEPT (the Phase-6 engine's young-player boom/bust channel).

Returns cards in the shape build_cards.build() emits (minus atk/def, computed uniformly downstream).
"""
from __future__ import annotations
import csv
import json
import math
import re
import sys
from statistics import median, NormalDist

try:
    from .._shared import RAW, norm_name, percentile_ranks, to_1_99
    from ..normalize import age_at
    from . import club_form, career_stature, age_curve, combine, consensus_2026
    from .consensus_2026 import CONSENSUS_FLOOR
except ImportError:
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from _shared import RAW, norm_name, percentile_ranks, to_1_99
    from normalize import age_at
    from rating import club_form, career_stature, age_curve, combine, consensus_2026
    from rating.consensus_2026 import CONSENSUS_FLOOR

YEAR = 2026
POSITIONS = ("GK", "DF", "MF", "FW")

# --- Composite recipe for the NON-consensus tier (Phase Ratings-fix-2) ----------------------------
# The old recipe blended H/M/G over a constant 0.5 baseline. That baseline was INVERTED: a player
# with no data at all scored 0.50, which BEAT real players whose club-form (a club-strength proxy,
# not a quality proxy) came out below 0.50 — so Australia's captain-keeper Mathew Ryan (real club +
# real €2M value) landed at 26 while an unknown A-League kid with no data sat on top at 67.
#
# The fix makes **age-corrected market value the backbone** (it's the one signal that measures the
# PLAYER, not his club, and it covers ~65% of the cohort including non-European leagues), with
# club-form as an *asymmetric* refinement (it can lift a player who's clearly performing at a high
# level, but is throttled when it would drag a good player down just for playing at a small club),
# career stature as an elite floor, and a genuinely LOW prior for the truly invisible.
LOW_PRIOR = 0.18        # no club, no market value, no stature → sinks to the bottom of the pool
W_CLUB = 0.40           # club-form's weight when it LIFTS the market-value backbone
CLUB_DRAG = 0.30        # club-form's weight is throttled to this fraction when it would DRAG
G_FLOOR_PULL = 0.55     # how hard a career-stature signal pulls the estimate up toward itself

# --- Young-player volatility tag (Spec §5) --------------------------------------------------
# The rating itself is a clean point estimate; the per-match boom/bust for young players lives in
# this `volatility` tag, which the Phase-6 engine widens their output with. (The old raw-MV youth
# rating FLOOR is removed — consensus + age-corrected M now place youth on the proper scale.)
YOUTH_FULL_AGE = 19        # full volatility at/below this age
YOUTH_ZERO_AGE = 25        # volatility fades to zero at/above this age
YOUTH_VOL = 0.15           # max per-card volatility tag (at the youngest age)


def _youth_weight(age: int | None) -> float:
    """1.0 at/below YOUTH_FULL_AGE, linearly to 0.0 at/above YOUTH_ZERO_AGE — no cliffs."""
    if age is None or age >= YOUTH_ZERO_AGE:
        return 0.0
    if age <= YOUTH_FULL_AGE:
        return 1.0
    return (YOUTH_ZERO_AGE - age) / (YOUTH_ZERO_AGE - YOUTH_FULL_AGE)


# --- Market value: load + age-correction --------------------------------------------------------
def _load_market_values() -> dict:
    """norm_name -> list of (birth_year|None, market_value_eur). From Transfermarkt players.csv."""
    out: dict[str, list] = {}
    path = RAW / "player_scores" / "players.csv"
    with path.open(encoding="utf-8", errors="ignore", newline="") as fh:
        for row in csv.DictReader(fh):
            mv = (row.get("market_value_in_eur") or row.get("highest_market_value_in_eur") or "").strip()
            key = norm_name(row.get("name", ""))
            if not key or not mv.isdigit():
                continue
            dob = row.get("date_of_birth", "") or ""
            yr = int(dob[:4]) if dob[:4].isdigit() else None
            out.setdefault(key, []).append((yr, int(mv)))
    return out


def _market_value(mv_index: dict, name: str, birth_date: str) -> int | None:
    """Look up a player's market value, disambiguating same-name players by birth year."""
    recs = mv_index.get(norm_name(name))
    if not recs:
        return None
    byr = int(birth_date[:4]) if birth_date[:4].isdigit() else None
    if byr is not None:
        same = [v for (y, v) in recs if y == byr]
        if same:
            return max(same)
    return max(v for _, v in recs)


def _build_age_premium(cards: list[dict]):
    """A function age -> premium = (cohort median MV at that age) / (cohort overall median MV).

    Market value peaks young (resale-potential premium) and collapses with age, so dividing a
    player's MV by this premium removes the age bias and leaves a current-skill proxy. Built from
    the cohort's OWN MV-by-age medians (smoothed over a ±1yr window, clamped) so it's self-calibrating.
    """
    by_age: dict[int, list[int]] = {}
    for c in cards:
        if c["mv"] and c["age"]:
            by_age.setdefault(c["age"], []).append(c["mv"])
    all_mv = [c["mv"] for c in cards if c["mv"]]
    overall = median(all_mv) if all_mv else 1.0
    med_by_age = {a: median(v) for a, v in by_age.items()}

    def premium(age: int | None) -> float:
        if age is None:
            return 1.0
        vals = [med_by_age[a] for a in (age - 1, age, age + 1)
                if a in med_by_age and len(by_age[a]) >= 3]
        if not vals:
            return 1.0
        return max(0.2, min(4.0, (sum(vals) / len(vals)) / overall))

    return premium


def _fit_log_bounds(values: list[float]) -> tuple[float, float]:
    """Log10 bounds (10th, 95th pct) for mapping age-adjusted MV -> 0..1; data-fit, not hand-tuned."""
    logs = sorted(math.log10(v) for v in values if v > 0)
    if not logs:
        return 6.0, 8.0
    lo = logs[int(0.10 * (len(logs) - 1))]
    hi = logs[int(0.95 * (len(logs) - 1))]
    return (lo, hi + 1.0) if hi <= lo else (lo, hi)


def _mv_norm(mv: float | None, low: float, high: float) -> float | None:
    """Log-scale a (age-adjusted) market value onto 0..1; None when absent."""
    if not mv or mv <= 0:
        return None
    return max(0.0, min(1.0, (math.log10(mv) - low) / (high - low)))


def _composite(m: float | None, h: float | None, g: float | None) -> float:
    """Blend the three 2026 signals into a 0..1 quality estimate (Phase Ratings-fix-2).

    m = age-corrected market value, h = club form, g = career stature — each None when absent.

      1. Backbone = market value if we have it; else club form (the only quality signal left);
         else LOW_PRIOR (truly invisible player).
      2. Club form refines the MV backbone *asymmetrically*: full weight (W_CLUB) when it LIFTS the
         estimate (a player clearly playing well at a high level), throttled (CLUB_DRAG) when it
         would DRAG (so a quality player at a small club isn't punished for the club, only the MV).
      3. Career stature is an elite floor: an award standing can only pull the estimate UP.
    """
    if m is not None:
        base = m
        if h is not None:
            w = W_CLUB if h >= base else W_CLUB * CLUB_DRAG
            base = (1 - w) * base + w * h
    elif h is not None:
        base = h
    else:
        base = LOW_PRIOR
    if g is not None and g > base:
        base = (1 - G_FLOOR_PULL) * base + G_FLOOR_PULL * g
    return base


# --- Composite-tier normalization: map onto a TARGET BAND (mean/SD), not the historical shape ------
# Earlier passes quantile-matched the composite percentile onto the full historical per-position
# distribution. That distribution spans 1930s amateurs to modern pros, so a mid-table 2026 squad
# player (still a full professional international) inherited an amateur's low rating — keepers landing
# at 2, Bundesliga regulars at 10 — and a strong mid-tier nation's best non-elite player topped out
# in the high 60s. Both are wrong: the 2026 cohort is a TRUNCATED population (every card is a WC
# squad professional), so it should have a HIGHER floor and a TIGHTER spread than all of football
# history.
#
# We therefore normalize to an explicit target band defined by a mean + standard deviation (the
# user's suggested statistical approach). Each player's within-position percentile is mapped through
# the inverse-normal of N(TARGET_MEAN, TARGET_SD) — a robust rank-based z-score. This guarantees a
# believable centre (~TARGET_MEAN), a believable spread, a floor that reads as "fringe squad player"
# (never amateur), and a top that lets the best non-elite players reach the low 80s (just under the
# consensus floor). All four numbers below are tunable.
TARGET_MEAN = 62.0      # median 2026 squad player ≈ a solid international
TARGET_SD = 10.0        # spread; ±2 SD ≈ [40, 80], landing just under the consensus floor
RATING_FLOOR = 40       # a qualified-WC-squad professional is never rated like an amateur
P_CLAMP = 0.02          # clamp the percentile tails so extremes don't blow past the band

_TARGET = NormalDist(TARGET_MEAN, TARGET_SD)


def _target_rating(pct: float) -> int:
    """Map a within-position percentile (0..1) onto the target N(mean, SD) rating band."""
    p = min(1.0 - P_CLAMP, max(P_CLAMP, pct))
    return round(_TARGET.inv_cdf(p))


# Squad team names that are not in the Fjelstul spine. DR Congo == Zaire's COD; the four debutants
# get their ISO-3 codes.
TEAM_CODE_OVERRIDES = {
    "DR Congo": "COD", "Cape Verde": "CPV", "Curaçao": "CUW",
    "Jordan": "JOR", "Uzbekistan": "UZB",
}


# Transfermarkt sub_position -> our granular token (Spec §4 taxonomy). Blank/unmapped -> bucket only.
SUB_TO_TOKEN = {
    "Goalkeeper": "GK",
    "Centre-Back": "CB", "Left-Back": "LB", "Right-Back": "RB",
    "Defensive Midfield": "CDM", "Central Midfield": "CM", "Attacking Midfield": "CAM",
    "Left Midfield": "LM", "Right Midfield": "RM",
    "Left Winger": "LW", "Right Winger": "RW",
    "Centre-Forward": "ST", "Second Striker": "ST",
}
TOKEN_LINE = {
    "GK": "GK", "CB": "DF", "LB": "DF", "RB": "DF", "LWB": "DF", "RWB": "DF",
    "CDM": "MF", "CM": "MF", "CAM": "MF", "LM": "MF", "RM": "MF",
    "LW": "FW", "RW": "FW", "ST": "FW",
}


def _eligible_positions(bucket: str, sub: str) -> list[str]:
    """Bucket + (where known) granular token. Granular ADDS a line, never replaces the rated one:
    a card's 1-99 was normalized within its bucket, so a cross-line token (e.g. Kimmich DF + CDM)
    must not silently move him to another pool. Same-line token -> [token] (line recoverable via the
    hierarchy); cross-line -> [bucket, token]; no sub_position -> [bucket]."""
    token = SUB_TO_TOKEN.get(sub or "")
    if not token:
        return [bucket]
    if TOKEN_LINE[token] == bucket:
        return [token]
    return [bucket, token]


def _team_name_to_code() -> dict:
    """Authoritative name -> ISO-3 from the Fjelstul spine, plus the 2026 overrides."""
    wc = json.loads((RAW / "fjelstul" / "worldcup.json").read_text(encoding="utf-8"))
    out = {q["team_name"]: q["team_code"] for q in wc["qualified_teams"]}
    out.update(TEAM_CODE_OVERRIDES)
    return out


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm_name(name)).strip("-")


def build_cards(hist_by_pos: dict | None = None) -> list[dict]:
    """Build the 2026 cohort cards. `hist_by_pos` = {position: [historical wc_rating, …]} from the
    already-built historical cards, used to calibrate the composite tier onto the historical scale;
    when omitted (standalone run) the composite tier falls back to a plain 1–99 map."""
    squads = json.loads((RAW / "squads_2026" / "squads_2026.json").read_text(encoding="utf-8"))
    name2code = _team_name_to_code()
    club_idx = club_form.build_index()
    g_index = career_stature.build_index()
    mv_index = _load_market_values()

    # First pass: gather the raw per-card signals.
    raw = []
    for team in squads:
        tname = team["team"]
        tcode = name2code.get(tname)
        for p in team["players"]:
            pos = p.get("position")
            if pos not in POSITIONS:
                continue
            name, bdate = p.get("name", ""), p.get("birth_date", "")
            age = age_at(bdate, YEAR)
            h = club_form.score(club_idx, name, bdate, pos, p.get("club", ""))
            # Reach back to the 2023 Ballon d'Or (the most recent completed cycles at squad
            # selection): floors current legends even if their league has no game-level data.
            g_sub, g_floor, g_label = career_stature.best_finish(
                g_index, {norm_name(name)}, YEAR, back=3, fwd=0)
            g_blend = g_sub if g_label != "none" else None
            raw.append({
                "name": name, "team_code": tcode, "team_name": tname, "pos": pos,
                "bdate": bdate, "age": age, "h": h, "g_blend": g_blend,
                "g_floor": g_floor, "g_label": g_label,
                "mv": _market_value(mv_index, name, bdate),
                "sub_pos": club_form.sub_position(club_idx, name, bdate),
            })

    # Age-correct market value, then fit the log bounds over the cohort's age-adjusted MVs.
    age_premium = _build_age_premium(raw)
    adj_mvs = [c["mv"] / age_premium(c["age"]) for c in raw if c["mv"]]
    mv_low, mv_high = _fit_log_bounds(adj_mvs)

    # Composite raw for every card (consensus cards keep it too; it's just unused for them).
    for c in raw:
        m = _mv_norm(c["mv"] / age_premium(c["age"]), mv_low, mv_high) if c["mv"] else None
        c["_raw"] = _composite(m, c["h"], c["g_blend"]) * age_curve.age_factor(c["age"], c["pos"])

    # Consensus tier: merged industry rankings -> direct ratings for matched participants.
    consensus, _order, _unmatched = consensus_2026.build_ratings([c["name"] for c in raw])

    cards = []
    for c in raw:
        yw = _youth_weight(c["age"])
        card = {
            "player_id": f"2026-{c['team_code'] or 'XXX'}-{_slug(c['name'])}",
            "name": c["name"], "team_code": c["team_code"], "team_name": c["team_name"],
            "year": YEAR, "position": c["pos"],
            "eligible_positions": _eligible_positions(c["pos"], c["sub_pos"]),
            "sub_position": c["sub_pos"],
            "age": c["age"], "g_label": c["g_label"],
            "volatility": round(YOUTH_VOL * yw, 3),
            "_raw": c["_raw"], "_g_floor": c["g_floor"], "_has_club": c["h"] is not None,
        }
        key = norm_name(c["name"])
        if key in consensus:
            card["wc_rating"] = consensus[key]      # direct, no age factor, skip normalization
            card["_tier"] = "consensus"
        else:
            card["_tier"] = "composite"
        cards.append(card)

    # Composite-tier normalization: percentile within position -> calibrate to history -> cap.
    for pos in POSITIONS:
        group = [c for c in cards if c["position"] == pos and c["_tier"] == "composite"]
        pct = percentile_ranks([c["_raw"] for c in group])
        for c, rp in zip(group, pct):
            base = _target_rating(rp)
            c["wc_rating"] = min(CONSENSUS_FLOOR - 1, max(base, c["_g_floor"], RATING_FLOOR))

    for c in cards:
        del c["_raw"], c["_g_floor"], c["_tier"]
    return cards


if __name__ == "__main__":
    cs = build_cards()
    covered = sum(1 for c in cs if c["_has_club"]) if cs else 0
    con = sum(1 for c in cs if c["wc_rating"] >= CONSENSUS_FLOOR)
    print(f"2026 cohort: {len(cs)} cards, club-covered {covered} "
          f"({covered/max(len(cs),1):.0%}), consensus-tier {con}")
    top = sorted(cs, key=lambda c: c["wc_rating"], reverse=True)[:20]
    for c in top:
        print(f"  {c['wc_rating']:>3}  {c['name']} ({c['team_code']})")
