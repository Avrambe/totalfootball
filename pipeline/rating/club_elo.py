"""Club Elo from match results — a fine-grained, objective club-strength signal for Layer H.

The coarse "did the club reach the Champions League" level can't separate a Real Madrid star from a
Celtic squad player (both read as CL). So we compute a club Elo over recent match results the same
way the project rates national teams: iterate games chronologically, move both clubs' ratings toward
the result with a margin-of-victory boost. Continental fixtures (CL/Europa/Conference) pit clubs from
different leagues against each other, which calibrates the leagues onto ONE comparable scale — no
market valuations involved.

Source: data/raw/player_scores/games.csv (≈25k matches since 2023, ~2k clubs). Emits club_id -> Elo;
`level01` maps that to the 0..1 backbone Layer H consumes.
"""
from __future__ import annotations
import csv
import sys

try:
    from .._shared import RAW
except ImportError:
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from _shared import RAW

csv.field_size_limit(10_000_000)

START_DATE = "2023-07-01"   # ~three seasons of form
BASE_ELO = 1500.0
HOME_ADV = 65.0
K = 30.0
# Map raw Elo -> 0..1 club level. Calibrated to the observed distribution: a mid covered-league
# club sits ~LOW, the very strongest clubs ~HIGH.
LEVEL_LOW = 1450.0
LEVEL_HIGH = 2050.0


def _mov(goal_diff: int) -> float:
    """Margin-of-victory multiplier — a 4-0 says more than a 1-0, with diminishing returns."""
    return max(goal_diff, 1) ** 0.5


def _expected(home: float, away: float) -> float:
    return 1.0 / (1.0 + 10 ** ((away - home + HOME_ADV) / 400.0))


def build() -> dict:
    """club_id (str) -> Elo, from chronological match results across all club competitions."""
    games = []
    with (RAW / "player_scores" / "games.csv").open(encoding="utf-8", errors="ignore",
                                                     newline="") as fh:
        for row in csv.DictReader(fh):
            d = row.get("date", "")
            hg, ag = row.get("home_club_goals", ""), row.get("away_club_goals", "")
            if d < START_DATE or not hg.lstrip("-").isdigit() or not ag.lstrip("-").isdigit():
                continue
            games.append((d, row["home_club_id"], row["away_club_id"], int(hg), int(ag)))
    games.sort(key=lambda g: g[0])

    elo: dict[str, float] = {}
    for _, h, a, hg, ag in games:
        eh = elo.setdefault(h, BASE_ELO)
        ea = elo.setdefault(a, BASE_ELO)
        exp_h = _expected(eh, ea)
        act_h = 1.0 if hg > ag else 0.5 if hg == ag else 0.0
        delta = K * _mov(abs(hg - ag)) * (act_h - exp_h)
        elo[h] = eh + delta
        elo[a] = ea - delta
    return elo


def level01(elo_value: float | None) -> float | None:
    """Map a club Elo to the 0..1 club-strength backbone Layer H uses."""
    if elo_value is None:
        return None
    frac = (elo_value - LEVEL_LOW) / (LEVEL_HIGH - LEVEL_LOW)
    return max(0.0, min(1.0, frac))


if __name__ == "__main__":
    import json
    elo = build()
    names = {}
    with (RAW / "player_scores" / "clubs.csv").open(encoding="utf-8", errors="ignore",
                                                    newline="") as fh:
        for row in csv.DictReader(fh):
            names[row["club_id"]] = row.get("name", "")
    top = sorted(elo.items(), key=lambda kv: -kv[1])[:30]
    for cid, e in top:
        print(f"  {e:7.0f}  {level01(e):.2f}  {names.get(cid, cid)}")
