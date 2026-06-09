"""Phase 3 — the 2026 World Cup cohort, rated from a current-form proxy. Spec §5.

The 2026 squads are NOT in the Fjelstul spine (it ends 2022) and these players have no 2026 WC
stats (the tournament hasn't happened), so they can't go through the historical Layer A–F path.
Instead each 2026 card blends only what exists:

    composite = blend({H: club_form, G: career_stature, base: 0.5}, w={H:.60, G:.25, base:.15})
    raw       = composite × age_factor          (Layer 0)
    wc_rating = max( percentile(raw within 2026 position pool) -> 1..99,  G floor )

H (club form) is real Transfermarkt/FBref season output; G (career stature) keys by year±2 so the
2024/25 Ballon d'Or & POTY finishers floor the current stars automatically. Normalization is a
SEPARATE within-position pool for 2026 (not pooled with history): the recipes differ, national
strength enters the engine via Elo not the player score, and the bar here is explicitly "good
enough" (see plan). Returns cards in the shape build_cards.build() emits (minus atk/def, which
build_cards computes uniformly for both cohorts).
"""
from __future__ import annotations
import csv
import json
import math
import re
import sys

try:
    from .._shared import RAW, norm_name, percentile_ranks, to_1_99
    from ..normalize import age_at
    from . import club_form, career_stature, age_curve, combine
except ImportError:
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from _shared import RAW, norm_name, percentile_ranks, to_1_99
    from normalize import age_at
    from rating import club_form, career_stature, age_curve, combine

YEAR = 2026
POSITIONS = ("GK", "DF", "MF", "FW")
# Composite weights. H = club form/strength, G = career stature, I = international standing
# (full coverage; goal-weighted so it rewards attackers and proven names), base = neutral prior.
WEIGHTS = {"H": 0.45, "G": 0.20, "I": 0.20, "base": 0.15}

# International-standing shape: (experience weight, goals weight, goals cap) per position.
INTL = {"FW": (0.40, 0.60, 40), "MF": (0.60, 0.40, 22),
        "DF": (0.85, 0.15, 10), "GK": (1.00, 0.00, 1)}
CAPS_FULL = 90.0           # caps that map experience -> 1.0


def _intl_standing(caps, goals, pos: str) -> float:
    """Proven-international quality 0..1 from caps + international goals (squad data; 100% coverage)."""
    try:
        caps, goals = int(caps or 0), int(goals or 0)
    except (ValueError, TypeError):
        return 0.0
    w_exp, w_goal, gcap = INTL[pos]
    experience = min(caps / CAPS_FULL, 1.0)
    goals_norm = min(goals / gcap, 1.0)
    return w_exp * experience + w_goal * goals_norm


# --- Young-player floor (Spec §5, refinement) -----------------------------------------------
# Our caps/stature signals reward accumulated career — which teenagers haven't had time to build,
# so phenoms (Yamal, Cubarsí) read low. Transfermarkt MARKET VALUE is the one signal that's
# explicitly forward-looking: it prices a player's expected trajectory, the very "youth premium"
# that made it unusable for the general pool. So we use it ONLY for the young, blended with their
# most-recent club form, as a FLOOR that lifts but never lowers. The weight fades to zero by prime
# age (no youth bias leaks into established players), and a conservative shrink errs ~45th pct — we
# would rather a young star overperform in-sim than be over-rated up front. Paired with `volatility`
# (a boom-or-bust tag the Phase 6 match engine widens their per-game output with).
YOUTH_FULL_AGE = 19        # full youth signal at/below this age
YOUTH_ZERO_AGE = 25        # youth signal (and volatility) fade to zero at/above this age
MV_MAX_WEIGHT = 0.40       # market value's share of the consensus floor, at the youngest age
CONSERVATIVE = 0.78        # shrink on the consensus floor — the "err ~45th pct" dial
MV_LOG_LOW = 6.0           # €1M  market value -> 0.0
MV_LOG_HIGH = 8.18         # ~€150M market value -> 1.0
YOUTH_VOL = 0.15           # max per-card volatility tag (at the youngest age)


def _youth_weight(age: int | None) -> float:
    """1.0 at/below YOUTH_FULL_AGE, linearly to 0.0 at/above YOUTH_ZERO_AGE — no cliffs."""
    if age is None or age >= YOUTH_ZERO_AGE:
        return 0.0
    if age <= YOUTH_FULL_AGE:
        return 1.0
    return (YOUTH_ZERO_AGE - age) / (YOUTH_ZERO_AGE - YOUTH_FULL_AGE)


def _mv_norm(mv: int | None) -> float | None:
    """Log-scale a market value (EUR) onto 0..1; None when absent (floor simply doesn't apply)."""
    if not mv or mv <= 0:
        return None
    frac = (math.log10(mv) - MV_LOG_LOW) / (MV_LOG_HIGH - MV_LOG_LOW)
    return max(0.0, min(1.0, frac))


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

# Squad team names that are not in the Fjelstul spine. DR Congo == Zaire's COD; the four debutants
# get their ISO-3 codes.
TEAM_CODE_OVERRIDES = {
    "DR Congo": "COD", "Cape Verde": "CPV", "Curaçao": "CUW",
    "Jordan": "JOR", "Uzbekistan": "UZB",
}


def _team_name_to_code() -> dict:
    """Authoritative name -> ISO-3 from the Fjelstul spine, plus the 2026 overrides."""
    wc = json.loads((RAW / "fjelstul" / "worldcup.json").read_text(encoding="utf-8"))
    out = {q["team_name"]: q["team_code"] for q in wc["qualified_teams"]}
    out.update(TEAM_CODE_OVERRIDES)
    return out


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm_name(name)).strip("-")


def build_cards() -> list[dict]:
    squads = json.loads((RAW / "squads_2026" / "squads_2026.json").read_text(encoding="utf-8"))
    name2code = _team_name_to_code()
    club_idx = club_form.build_index()
    g_index = career_stature.build_index()
    mv_index = _load_market_values()

    cards = []
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
            # No stature -> drop G (don't let a 0.0 drag uncovered players below the 0.5 prior).
            g_blend = g_sub if g_label != "none" else None
            intl = _intl_standing(p.get("caps"), p.get("goals"), pos)
            composite = combine._blend(
                {"H": h, "G": g_blend, "I": intl, "base": 0.5}, WEIGHTS)
            raw = composite * age_curve.age_factor(age)
            # Young-player floor: blend recent club form with market-value trajectory consensus,
            # weighted toward youth, conservatively shrunk; lift `raw` but never lower it.
            yw = _youth_weight(age)
            if yw > 0:
                mv = _mv_norm(_market_value(mv_index, name, bdate))
                if mv is not None:
                    mv_w = MV_MAX_WEIGHT * yw
                    consensus = combine._blend({"H": h, "MV": mv}, {"H": 1 - mv_w, "MV": mv_w})
                    raw = max(raw, CONSERVATIVE * consensus)
            cards.append({
                "player_id": f"2026-{tcode or 'XXX'}-{_slug(name)}",
                "name": name, "team_code": tcode, "team_name": tname, "year": YEAR,
                "position": pos,
                "eligible_positions": [pos],
                "sub_position": club_form.sub_position(club_idx, name, bdate),
                "age": age, "g_label": g_label, "g_floor": g_floor,
                "volatility": round(YOUTH_VOL * yw, 3),
                "_raw": raw, "_has_club": h is not None,
            })

    # Separate within-position normalization for the 2026 pool, then apply the G floor.
    for pos in POSITIONS:
        group = [c for c in cards if c["position"] == pos]
        pct = percentile_ranks([c["_raw"] for c in group])
        for c, rp in zip(group, pct):
            c["wc_rating"] = max(to_1_99(rp), c["g_floor"])

    for c in cards:
        del c["_raw"], c["g_floor"]
    return cards


if __name__ == "__main__":
    cs = build_cards()
    covered = sum(1 for c in cs if c["_has_club"]) if cs else 0
    print(f"2026 cohort: {len(cs)} cards, club-covered {covered} ({covered/max(len(cs),1):.0%})")
