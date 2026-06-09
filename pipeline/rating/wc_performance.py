"""Layer P — World Cup tournament performance, from the Fjelstul spine. Spec §3.1-P, §3.2.

Components per card (player-tournament), each 0..1. A and D are RAW here (clean goals/match and a
defensive metric); combine.py percentiles them within position across all eras. B, C, E, F are
absolute scales. Pre-1970 cards have no player_appearances, so A falls back to team-level and E
drops out (weights renormalize in combine.py).
"""
from __future__ import annotations

# Layer-P component weights by position (spec §3.2). G (career stature) is blended in combine.py.
WEIGHTS = {
    "GK": {"A": 0.00, "B": 0.14, "C": 0.08, "D": 0.34, "E": 0.10, "F": 0.06, "G": 0.28},
    "DF": {"A": 0.06, "B": 0.12, "C": 0.08, "D": 0.28, "E": 0.12, "F": 0.06, "G": 0.28},
    "MF": {"A": 0.20, "B": 0.12, "C": 0.07, "D": 0.10, "E": 0.13, "F": 0.06, "G": 0.32},
    "FW": {"A": 0.30, "B": 0.14, "C": 0.06, "D": 0.02, "E": 0.12, "F": 0.06, "G": 0.30},
}

# WC honor -> sub-score (take max across a player's honors that tournament).
HONORS = {
    "Golden Ball": 1.00,
    "Golden Boot": 0.90, "Golden Glove": 0.90,
    "Silver Ball": 0.75,
    "Silver Boot": 0.70, "Best Young Player": 0.70,
    "Bronze Ball": 0.60,
    "Bronze Boot": 0.55,
}


def build_spine(wc: dict) -> dict:
    """Precompute the per-card lookup indices from the raw worldcup.json tables."""
    from collections import defaultdict
    from ..normalize import parse_year, is_mens_tournament

    tour = {t["tournament_id"]: t for t in wc["tournaments"]}
    goals = defaultdict(lambda: {"clean": 0.0})
    for g in wc["goals"]:
        if g.get("own_goal"):
            continue
        key = (g["player_id"], g["tournament_id"])
        goals[key]["clean"] += 0.9 if g.get("penalty") else 1.0

    awards = defaultdict(list)
    for a in wc["award_winners"]:
        awards[(a["player_id"], a["tournament_id"])].append(a["award_name"])

    appr = defaultdict(lambda: {"starts": 0, "subs": 0, "matches": 0})
    for p in wc["player_appearances"]:
        rec = appr[(p["player_id"], p["tournament_id"])]
        rec["matches"] += 1
        if p.get("starter"):
            rec["starts"] += 1
        elif p.get("substitute"):
            rec["subs"] += 1

    team = defaultdict(lambda: {"matches": 0, "ga": 0})
    for ta in wc["team_appearances"]:
        rec = team[(ta["team_id"], ta["tournament_id"])]
        rec["matches"] += 1
        rec["ga"] += ta.get("goals_against", 0) or 0

    qual = {(q["team_id"], q["tournament_id"]): q.get("performance") for q in wc["qualified_teams"]}
    players = {p["player_id"]: p for p in wc["players"]}

    return {
        "tour": tour, "goals": goals, "awards": awards, "appr": appr,
        "team": team, "qual": qual, "players": players,
        "parse_year": parse_year, "is_mens": is_mens_tournament,
    }


def components(spine: dict, squad: dict) -> dict | None:
    """Raw Layer-P components for one squad row. None if the card should be skipped."""
    from ..normalize import stage_score

    tid, pid, team_id = squad["tournament_id"], squad["player_id"], squad["team_id"]
    t = spine["tour"].get(tid)
    if not t or not spine["is_mens"](t.get("tournament_name", "")):
        return None
    player = spine["players"].get(pid)
    if not player or player.get("female"):
        return None
    year = spine["parse_year"](t.get("year"))
    pre1970 = year is not None and year < 1970

    tm = spine["team"].get((team_id, tid), {"matches": 0, "ga": 0})
    team_matches = tm["matches"] or 1

    # A — attacking output (raw; percentiled later)
    clean = spine["goals"].get((pid, tid), {"clean": 0.0})["clean"]
    appr = spine["appr"].get((pid, tid))
    if pre1970 or not appr:
        a_raw = clean / team_matches            # per team-match (no player apps pre-1970)
        e_val = None
    else:
        played = appr["matches"] or 1
        a_raw = clean / played                  # per match played
        e_val = (appr["starts"] + 0.5 * appr["subs"]) / team_matches

    # B — WC honors (max)
    b_val = max((HONORS.get(name, 0.0) for name in spine["awards"].get((pid, tid), ())), default=0.0)

    # C — team success (champion override)
    perf = spine["qual"].get((team_id, tid))
    c_val = stage_score(perf)
    if (t.get("winner") or "").strip() and squad.get("team_name") == t.get("winner"):
        c_val = 1.00

    # D — team defensive record (raw; percentiled later)
    d_raw = 1.0 / (1.0 + tm["ga"] / team_matches)

    # F — longevity
    f_val = min(int(player.get("count_tournaments") or 1), 4) / 4.0

    return {
        "year": year, "position": squad.get("position_code"),
        "A_raw": a_raw, "B": b_val, "C": c_val, "D_raw": d_raw, "E": e_val, "F": f_val,
    }
