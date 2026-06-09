"""Combine the rating layers into the per-card WC Rating (1–99). Spec §3.3.

Pipeline per card:
  1. Layer-P components A–F (raw A/D percentiled within position across all eras).
  2. Layer G career-stature sub-score (blended) + floor (applied at the end).
  3. Blend by position weights, DROPPING missing components and renormalizing (never zero them).
  4. Incorporate Layer H where present (2026 cohort only).
  5. raw = composite × Layer-0 age factor.
  6. Normalize raw within position bucket (all eras pooled) → 1..99.
  7. final = max(normalized, G floor).
"""
from __future__ import annotations
import sys

try:
    from .._shared import load_worldcup, percentile_ranks, to_1_99, player_name_keys
    from ..normalize import age_at
    from . import wc_performance, career_stature, age_curve, club_form
except ImportError:
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from _shared import load_worldcup, percentile_ranks, to_1_99, player_name_keys
    from normalize import age_at
    from rating import wc_performance, career_stature, age_curve, club_form

POSITIONS = ("GK", "DF", "MF", "FW")


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
        })
        cards.append(comp)

    # Percentile A_raw and D_raw within position (all eras pooled).
    by_pos = {pos: [c for c in cards if c["position"] == pos] for pos in POSITIONS}
    for pos, group in by_pos.items():
        a_pct = percentile_ranks([c["A_raw"] for c in group])
        d_pct = percentile_ranks([c["D_raw"] for c in group])
        for c, a, d in zip(group, a_pct, d_pct):
            c["A"], c["D"] = a, d

    # Pass 2 — composite, age factor, raw score.
    for c in cards:
        weights = wc_performance.WEIGHTS[c["position"]]
        comps = {"A": c["A"], "B": c["B"], "C": c["C"], "D": c["D"],
                 "E": c["E"], "F": c["F"], "G": c["G"]}
        composite = _blend(comps, weights)
        if c["H"] is not None:                       # Layer H nudge (2026 cohort)
            composite = 0.75 * composite + 0.25 * c["H"]
        c["raw"] = composite * age_curve.age_factor(c["age"])

    # Normalize raw within position → 1..99, then apply the G floor.
    for pos, group in by_pos.items():
        raw_pct = percentile_ranks([c["raw"] for c in group])
        for c, rp in zip(group, raw_pct):
            c["wc_rating"] = max(to_1_99(rp), c["g_floor"])

    return cards
