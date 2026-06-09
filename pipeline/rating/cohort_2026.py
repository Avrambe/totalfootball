"""Phase 3 — the 2026 World Cup cohort, rated by a TWO-TIER system. Spec §5, plan addendum.

The 2026 squads are NOT in the Fjelstul spine (it ends 2022) and these players have no 2026 WC
stats (the tournament hasn't happened), so they can't go through the historical Layer A–F path.
The 2026 rating therefore has two tiers:

  1. CONSENSUS tier (the elite) — anchored to merged industry "best players entering 2026"
     rankings (consensus_2026.py). A matched player's rating is taken DIRECTLY from the
     rank→rating curve (ceiling 97; no age factor — the lists already price age). The top should
     reflect cross-publication consensus, not our own proxy stats (which minted role-players at 98).

  2. COMPOSITE tier (everyone else, ~1,100 players) — a de-inflated proxy:
         composite = blend({H: club_form, M: age_corrected_market_value, G: stature, base: 0.5},
                           w={H:.45, M:.30, G:.15, base:.10})
         raw       = composite × age_factor                       (Layer 0)
     then percentile-ranked within position and QUANTILE-MATCHED to the pooled HISTORICAL
     per-position rating distribution (below the consensus floor) for real cross-era comparability,
     and finally CAPPED at CONSENSUS_FLOOR−1 so no non-listed player can outrank a listed one.

Key changes from the first 2026 pass (which over-rated weak-league veterans, e.g. Laimer 98):
  - International caps REMOVED entirely — caps measure national-team volume, not skill.
  - Market value ADDED as a broad component, but AGE-CORRECTED first (`_age_premium`): MV
    over-prices youth (resale potential) and under-prices age, so we divide that bias out to get a
    current-skill proxy. This rescues good players in mediocre/uncovered leagues (Mané, Mahrez…).
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
from statistics import median

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
# Composite weights for the NON-consensus tier. H = club form, M = age-corrected market value,
# G = career stature, base = neutral prior. (Caps/international-standing removed — they rewarded
# volume, not skill, and inflated weak-league veterans.)
WEIGHTS = {"H": 0.45, "M": 0.30, "G": 0.15, "base": 0.10}

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


def _calibrate(pct: float, pos: str, hist_by_pos: dict | None) -> int:
    """Quantile-match a composite percentile to the pooled HISTORICAL per-position distribution,
    using only historical ratings BELOW the consensus floor as the reference (so the composite tier
    spreads across the realistic mid/low band instead of clustering at the cap). Falls back to a
    plain 1–99 map when no historical reference is supplied (standalone smoke test)."""
    if not hist_by_pos or pos not in hist_by_pos:
        return to_1_99(pct)
    ref = sorted(r for r in hist_by_pos[pos] if r < CONSENSUS_FLOOR)
    if not ref:
        return to_1_99(pct)
    return ref[int(round(pct * (len(ref) - 1)))]


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
        composite = combine._blend(
            {"H": c["h"], "M": m, "G": c["g_blend"], "base": 0.5}, WEIGHTS)
        c["_raw"] = composite * age_curve.age_factor(c["age"])

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
            calibrated = _calibrate(rp, pos, hist_by_pos)
            c["wc_rating"] = min(CONSENSUS_FLOOR - 1, max(calibrated, c["_g_floor"]))

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
