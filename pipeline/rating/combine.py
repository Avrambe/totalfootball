"""Combine the rating layers into the per-card WC Rating (1–99). Spec §3.3 + Phase 3-fix-B.

The final rating is the MAX of three signals, so the scarce elite is set by *who a player was*
(awards), not by a hot two-week tournament:

  1. Awards anchor (Layer S, stature_anchor.py) — OVERRIDES everything. Ballon d'Or / POTY /
     France-Football standing in a window around the tournament → a scarce 80–99 curve. Serial
     winners reach 99; a single win 97–98; podium/top-N step down. No age factor (awards already
     price age). Players with no award standing get None here and fall through.
  2. WC-honor floor — a player who EARNED a tournament honor (Golden Ball/Boot/Glove, Silver,
     Bronze, Best Young Player; isolated as component B) was judged elite AT that tournament, so
     gets a real floor (up to 95). Driven by the honor (recognition), NOT raw goals — variance
     goals for a strong team don't lift anyone.
  3. Capped WC-performance — the Layer-P composite (components A–F) × age factor, normalized within
     position, then CAPPED so a hot tournament can't mint elites: ≤79 where the player had a real
     award opportunity (so non-listed role-players settle "very good, not elite"); ≤95 in award-less
     profiles (pre-1956, or pre-1995 non-UEFA where the Euro-only Ballon d'Or couldn't see them) so
     early-era greats can still reach the elite band on merit.

wc_rating = max(anchor or 0, honor_floor or 0, min(perf_cap, normalized_performance)).

The old Layer-G *floor* (career_stature.FINISH) is superseded by the anchor for the rating, but
g_label is kept for display/debug. atk/def derive downstream from this final wc_rating.
"""
from __future__ import annotations
import sys

try:
    from .._shared import load_worldcup, percentile_ranks, to_1_99, player_name_keys
    from ..normalize import age_at
    from . import wc_performance, career_stature, age_curve, club_form
    from .stature_anchor import lookup as anchor_lookup, ANCHOR_FLOOR
except ImportError:
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from _shared import load_worldcup, percentile_ranks, to_1_99, player_name_keys
    from normalize import age_at
    from rating import wc_performance, career_stature, age_curve, club_form
    from rating.stature_anchor import lookup as anchor_lookup, ANCHOR_FLOOR

POSITIONS = ("GK", "DF", "MF", "FW")

# UEFA member ISO-3 codes present in the historical cohort. Used to decide "award opportunity":
# the Ballon d'Or was Europe-only 1956–1994, so a non-UEFA player in that era had no realistic
# shot at the award and his ABSENCE from it must not be read as "not elite" — he gets the higher,
# award-less performance cap instead. (Defunct codes — SUN/DDR/YUG/SCG/CSK — included.)
UEFA = {"AUT", "BEL", "BGR", "BIH", "CHE", "CSK", "CZE", "DDR", "DEU", "DNK", "ENG", "ESP", "FRA",
        "GRC", "HRV", "HUN", "IRL", "ISL", "ITA", "NIR", "NLD", "NOR", "POL", "PRT", "ROU", "RUS",
        "SCG", "SCO", "SRB", "SUN", "SVK", "SVN", "SWE", "TUR", "UKR", "WAL", "YUG"}

PERF_CAP_AWARD_ERA = ANCHOR_FLOOR - 1   # 79 — non-listed player who COULD have been seen by awards
PERF_CAP_AWARDLESS = 95                 # award-less profile (pre-1956 / pre-1995 non-UEFA): full reach

# WC-honor → rating floor. Component B isolates the honor (Golden Ball 1.0, Golden Boot/Glove 0.90,
# Silver Ball 0.75, Silver Boot / Best Young Player 0.70, Bronze 0.55–0.60). A single honor lifts
# into the elite band but tops out at 95 — 99 still requires the serial-award rule in the anchor.
HONOR_FLOOR = [(1.00, 95), (0.90, 92), (0.75, 90), (0.70, 88), (0.55, 86)]


def _award_opportunity(year: int | None, code: str | None) -> bool:
    """Did this player have a realistic shot at the era's awards? False for the award-less profiles
    (no Ballon d'Or before 1956; Europe-only until 1995)."""
    if not year:
        return False
    if year < 1956:
        return False
    if year < 1995 and code not in UEFA:
        return False
    return True


def _perf_cap(year: int | None, code: str | None) -> int:
    return PERF_CAP_AWARD_ERA if _award_opportunity(year, code) else PERF_CAP_AWARDLESS


def _honor_floor(b: float | None) -> int | None:
    if not b:
        return None
    for threshold, rating in HONOR_FLOOR:
        if b >= threshold:
            return rating
    return None


def _blend(comps: dict, weights: dict) -> float:
    """Weighted mean over present components, renormalizing weights for any that are None."""
    num = den = 0.0
    for k, w in weights.items():
        v = comps.get(k)
        if v is None:
            continue
        num += w * v
        den += w
    return num / den if den else 0.0


def build_all(wc: dict | None = None) -> list[dict]:
    wc = wc or load_worldcup()
    spine = wc_performance.build_spine(wc)
    g_index = career_stature.build_index()
    players = spine["players"]

    # Pass 1 — raw components per card.
    cards = []
    for sq in wc["squads"]:
        comp = wc_performance.components(spine, sq)
        if comp is None or comp["position"] not in POSITIONS:
            continue
        p = players[sq["player_id"]]
        keys = player_name_keys(p.get("given_name", ""), p.get("family_name", ""))
        g_sub, g_floor, g_label = career_stature.best_finish(g_index, keys, comp["year"] or 0)
        comp.update({
            "player_id": sq["player_id"], "team_id": sq["team_id"],
            "team_code": sq.get("team_code"), "team_name": sq.get("team_name"),
            "tournament_id": sq["tournament_id"], "tournament_name": sq.get("tournament_name"),
            "given_name": p.get("given_name"), "family_name": p.get("family_name"),
            "birth_date": p.get("birth_date"),
            "G": g_sub, "g_floor": g_floor, "g_label": g_label,
            "H": club_form.club_form(keys, comp["year"] or 0),
            "age": age_at(p.get("birth_date"), comp["year"]) if comp["year"] else None,
            "_keys": keys,
        })
        cards.append(comp)

    # Percentile A_raw and D_raw within position (all eras pooled).
    by_pos = {pos: [c for c in cards if c["position"] == pos] for pos in POSITIONS}
    for pos, group in by_pos.items():
        a_pct = percentile_ranks([c["A_raw"] for c in group])
        d_pct = percentile_ranks([c["D_raw"] for c in group])
        for c, a, d in zip(group, a_pct, d_pct):
            c["A"], c["D"] = a, d

    # Pass 2 — WC-performance composite × age factor (Tier-2 raw). G is dropped from the blend:
    # anchored players bypass it and non-anchored have G=None, so it's moot for the rating.
    for c in cards:
        weights = wc_performance.WEIGHTS[c["position"]]
        comps = {"A": c["A"], "B": c["B"], "C": c["C"], "D": c["D"], "E": c["E"], "F": c["F"]}
        composite = _blend(comps, weights)
        if c["H"] is not None:                       # Layer H nudge (2026 cohort)
            composite = 0.75 * composite + 0.25 * c["H"]
        c["raw"] = composite * age_curve.age_factor(c["age"])

    # Normalize the Tier-2 performance score within position → 1..99 (pre-cap).
    for pos, group in by_pos.items():
        raw_pct = percentile_ranks([c["raw"] for c in group])
        for c, rp in zip(group, raw_pct):
            c["_perf"] = to_1_99(rp)

    # Pass 3 — three-signal max: awards anchor (override) vs honor floor vs capped performance.
    for c in cards:
        anchor, s_label = anchor_lookup(c["_keys"], c["year"] or 0)
        honor = _honor_floor(c["B"])
        capped_perf = min(_perf_cap(c["year"], c["team_code"]), c["_perf"])
        rating = max(anchor or 0, honor or 0, capped_perf)
        c["wc_rating"] = rating
        c["s_label"] = s_label
        c["_tier"] = ("anchor" if rating == (anchor or 0) and anchor
                      else "honor" if rating == (honor or 0) and honor
                      else "perf")
        for k in ("_keys", "raw", "_perf"):
            c.pop(k, None)

    return cards
