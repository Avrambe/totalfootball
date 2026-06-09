"""Layer H — club form, season-anchored. Spec §3.1.

A 0..1 club-quality/form signal for the 2026 cohort, built from two public sources merged:
  - Transfermarkt "player-scores" appearances (broad European coverage) — the PRIMARY source.
    Objective stats only (minutes/goals/assists); valuations ignored.
  - FBref Kaggle dumps (Big-5) — supplies keeper Save%/CS% (Transfermarkt appearances lack them)
    and a domestic-output fallback.

The backbone is **club level**, inferred from which continental competition the player's club
reached in the window (Champions League > Europa > Conference > none). This is a clean, non-valuation
proxy for club strength, and — crucially — it ranks players by the LEVEL they actually play at
rather than merely how many minutes they log, so genuine elite-club players (where the stars are)
top the table instead of any full-time starter in a covered league. Attacking output refines
forwards/midfielders; keeper rates refine GKs; a mild availability gate damps fringe squad players.

Coverage note: the appearances dump only has game-level rows for ~14 European leagues in the
2024-26 window (no MLS / Saudi / Liga MX / Brazil / Argentina), so `score` returns None for players
outside it — those degrade to the 0.5 prior + stature floor in the 2026 recipe.

Historical cohort: the available seasons bracket no pre-2023 WC, so `club_form(keys, year)` returns
None and the rating degrades to Layer 0 exactly as the spec anticipates.
"""
from __future__ import annotations
import csv
import sys

try:
    from .._shared import RAW, norm_name
    from . import club_elo
except ImportError:
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from _shared import RAW, norm_name
    from rating import club_elo

csv.field_size_limit(10_000_000)


# --- Legacy entry point (historical cohort): no club season brackets a pre-2023 WC. ---
def club_form(player_keys: set, year: int) -> float | None:
    return None


# --- League-tier weighting: a goal in a weaker league counts a little less (output only). ---
BIG5 = {"GB1", "ES1", "IT1", "L1", "FR1"}  # Premier, La Liga, Serie A, Bundesliga, Ligue 1
STRONG = {
    "NL1", "PO1", "BE1", "TR1", "RU1", "UKR1", "GR1", "SC1", "DK1",
}


def _tier_weight(comp_id: str) -> float:
    if comp_id in BIG5:
        return 1.00
    if comp_id in STRONG:
        return 0.90
    return 0.80


# --- Club level from continental competition reached (the backbone signal). ---
# Best continental competition the club played in the window -> club-level score.
CONT_LEVEL = {
    "CL": 1.00, "KLUB": 1.00, "USC": 1.00,          # Champions League / Club WC / Super Cup
    "CLQ": 0.85,                                      # CL qualifying (just missed the group)
    "EL": 0.74, "ELQ": 0.62,                          # Europa League (+ qualifying)
    "UCOL": 0.58, "ECLQ": 0.52,                       # Conference League (+ qualifying)
}
NO_CONT_LEVEL = 0.34       # plays in a covered league but no continental football
CONT_MIN_MINUTES = 90      # need a real continental contribution to claim the level

# --- Scoring shape (all tunable). ---
CAP_GA90 = {"FW": 1.00, "MF": 0.55, "DF": 0.20}      # g+a per 90 mapping output_norm -> 1.0
LEVEL_OUT = {"GK": (1.00, 0.00), "DF": (1.00, 0.00),  # (level weight, output/keeper weight)
             "MF": (0.62, 0.38), "FW": (0.45, 0.55)}
AVAIL_FLOOR = 0.45         # a fringe covered player keeps this fraction of credit
AVAIL_FULL_90S = 16.0      # ~half a season of league nineties -> availability 1.0
SEASON_START = "2024-07-01"


def _birth_year(s) -> int | None:
    try:
        return int(str(s)[:4])
    except (ValueError, TypeError):
        return None


def _num(s) -> float | None:
    if s is None or s == "":
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Index construction
# ---------------------------------------------------------------------------
def _load_fbref() -> dict:
    """norm_name -> list of FBref records (one per season file), summed downstream."""
    idx: dict[str, list] = {}
    for fname in ("fbref_2024_2025/players_data-2024_2025.csv",
                  "fbref_2025_2026/players_data-2025_2026.csv"):
        path = RAW / fname
        if not path.exists():
            continue
        with path.open(encoding="utf-8", errors="ignore", newline="") as fh:
            for row in csv.DictReader(fh):
                nn = norm_name(row.get("Player", ""))
                if not nn:
                    continue
                idx.setdefault(nn, []).append({
                    "born": _birth_year(row.get("Born")),
                    "min": _num(row.get("Min")), "nineties": _num(row.get("90s")),
                    "g": _num(row.get("Gls")), "a": _num(row.get("Ast")),
                    "save_pct": _num(row.get("Save%")), "cs_pct": _num(row.get("CS%")),
                })
    return idx


def _load_tm() -> dict:
    """norm_name -> list of Transfermarkt records aggregated over the recent window.

    Domestic-league rows drive output + availability + league tier; continental-cup rows drive the
    club-level backbone. Each record: born, club, sub_position, league nineties/goals/assists,
    minutes-weighted league tier, and club level (best continental competition reached).
    """
    league_tiers = _load_competition_tiers()
    players = _load_tm_players()
    agg: dict[str, dict] = {}
    path = RAW / "player_scores" / "appearances.csv"
    with path.open(encoding="utf-8", errors="ignore", newline="") as fh:
        for row in csv.DictReader(fh):
            if row.get("date", "") < SEASON_START:
                continue
            cid = row.get("competition_id", "")
            mins = _num(row.get("minutes_played")) or 0.0
            pid = row.get("player_id", "")
            if cid in league_tiers:
                a = agg.setdefault(pid, _empty_agg())
                a["min"] += mins
                a["g"] += _num(row.get("goals")) or 0.0
                a["a"] += _num(row.get("assists")) or 0.0
                a["by_comp"][cid] = a["by_comp"].get(cid, 0.0) + mins
                club = row.get("player_club_id", "")
                a["by_club"][club] = a["by_club"].get(club, 0.0) + mins
            elif cid in CONT_LEVEL:
                a = agg.setdefault(pid, _empty_agg())
                a["cont"][cid] = a["cont"].get(cid, 0.0) + mins

    idx: dict[str, list] = {}
    for pid, a in agg.items():
        meta = players.get(pid)
        if not meta:
            continue
        tier = (sum(league_tiers[c] * m for c, m in a["by_comp"].items()) / a["min"]
                if a["min"] > 0 else 0.80)
        cont_level = max((CONT_LEVEL[c] for c, m in a["cont"].items() if m >= CONT_MIN_MINUTES),
                         default=NO_CONT_LEVEL)
        primary_club = max(a["by_club"], key=a["by_club"].get) if a["by_club"] else ""
        idx.setdefault(meta["nn"], []).append({
            "born": meta["born"], "club": meta["club"], "sub_position": meta["sub_position"],
            "min": a["min"], "nineties": a["min"] / 90.0, "g": a["g"], "a": a["a"],
            "tier": tier, "cont_level": cont_level, "club_id": primary_club,
        })
    return idx


def _empty_agg() -> dict:
    return {"min": 0.0, "g": 0.0, "a": 0.0, "by_comp": {}, "cont": {}, "by_club": {}}


def _load_competition_tiers() -> dict:
    """competition_id -> league-tier weight, restricted to domestic leagues."""
    out = {}
    path = RAW / "player_scores" / "competitions.csv"
    with path.open(encoding="utf-8", errors="ignore", newline="") as fh:
        for row in csv.DictReader(fh):
            if row.get("type") == "domestic_league":
                cid = row.get("competition_id", "")
                out[cid] = _tier_weight(cid)
    return out


def _load_tm_players() -> dict:
    """player_id -> {nn, born, club, sub_position}."""
    out = {}
    path = RAW / "player_scores" / "players.csv"
    with path.open(encoding="utf-8", errors="ignore", newline="") as fh:
        for row in csv.DictReader(fh):
            out[row.get("player_id", "")] = {
                "nn": norm_name(row.get("name", "")),
                "born": _birth_year(row.get("date_of_birth")),
                "club": row.get("current_club_name", ""),
                "sub_position": row.get("sub_position", ""),
            }
    return out


def build_index() -> dict:
    """Build the merged club index once; reuse across the whole 2026 cohort."""
    return {"fbref": _load_fbref(), "tm": _load_tm(), "club_elo": club_elo.build()}


# ---------------------------------------------------------------------------
# Matching + scoring
# ---------------------------------------------------------------------------
def _pick(records: list, born: int | None) -> dict | None:
    """Disambiguate same-name records by birth year (exact, else closest, else first)."""
    if not records:
        return None
    if born is not None:
        exact = [r for r in records if r.get("born") == born]
        if exact:
            return exact[0]
        with_born = [r for r in records if r.get("born") is not None]
        if with_born:
            return min(with_born, key=lambda r: abs(r["born"] - born))
    return records[0]


def _sum_fbref(records: list) -> dict:
    """Sum the per-season FBref rows for one matched player (keeper rates: minutes-weighted)."""
    tot = {"min": 0.0, "nineties": 0.0, "g": 0.0, "a": 0.0}
    sp_num = cs_num = wsum = 0.0
    for r in records:
        for k in ("min", "nineties", "g", "a"):
            tot[k] += r.get(k) or 0.0
        w = r.get("nineties") or 0.0
        if r.get("save_pct") is not None:
            sp_num += r["save_pct"] * w
            wsum += w
        if r.get("cs_pct") is not None:
            cs_num += r["cs_pct"] * w
    tot["save_pct"] = sp_num / wsum if wsum else None
    tot["cs_pct"] = cs_num / wsum if wsum else None
    return tot


def _availability(nineties: float) -> float:
    return AVAIL_FLOOR + (1 - AVAIL_FLOOR) * min(nineties / AVAIL_FULL_90S, 1.0)


def score(index: dict, name: str, birth_date: str, position: str, club: str = "") -> float | None:
    """Club-form sub-score 0..1 for a 2026 squad player, or None if in neither source.

    level (continental club strength) is the backbone; output refines FW/MF, keeper rates refine GK.
    position is the GK/DF/MF/FW bucket from the squad source.
    """
    nn = norm_name(name)
    born = _birth_year(birth_date)

    tm = _pick(index["tm"].get(nn, []), born)
    fb_records = index["fbref"].get(nn, [])
    if born is not None and any(r.get("born") == born for r in fb_records):
        fb_records = [r for r in fb_records if r.get("born") in (None, born)]
    fb = _sum_fbref(fb_records) if fb_records else None

    if tm is None and fb is None:
        return None

    # Club level: club Elo of the club the player logged the most league minutes for (fine-grained).
    # Fall back to the coarse continental signal, then to a mid-strong default for FBref-only Big-5.
    level = None
    if tm is not None:
        level = club_elo.level01(index["club_elo"].get(tm.get("club_id")))
        if level is None:
            level = tm["cont_level"]
    if level is None:
        level = 0.60
    # Domestic output: prefer FBref (cleaner), else TM.
    out_src = fb if fb is not None else tm
    nineties = (out_src.get("nineties") or 0.0)
    tier = tm["tier"] if tm is not None else 1.00  # FBref = Big-5
    avail = _availability(nineties)

    w_level, w_ref = LEVEL_OUT[position]

    if position == "GK":
        if fb is not None and fb.get("save_pct") is not None:
            quality = 0.6 * (fb["save_pct"] / 100.0) + 0.4 * ((fb.get("cs_pct") or 0.0) / 100.0)
            return (0.55 * level + 0.45 * quality) * avail
        return level * avail

    if w_ref == 0.0:                                   # DF: level only
        return level * avail

    output = (out_src["g"] + out_src["a"]) / nineties if nineties > 0 else 0.0
    output_norm = min(output * tier / CAP_GA90[position], 1.0)
    return (w_level * level + w_ref * output_norm) * avail


def sub_position(index: dict, name: str, birth_date: str) -> str:
    """Granular Transfermarkt sub_position (e.g. 'Centre-Back') for a matched player, else ''."""
    rec = _pick(index["tm"].get(norm_name(name), []), _birth_year(birth_date))
    return rec.get("sub_position", "") if rec else ""
