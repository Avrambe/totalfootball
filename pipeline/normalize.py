"""Normalization helpers shared across the rating layers.

Three jobs (spec §2.2, §2.3, §3):
  - Stage-label ladder: collapse the messy `performance` strings into a clean tier 0..1.
  - Age-at-tournament from birth_date + tournament year (junk ages scrubbed).
  - Men's-only filter (the Fjelstul DB pools men's and women's tournaments).
"""
from __future__ import annotations
from datetime import date

# qualified_teams.performance -> (tier_index, team-success sub-score 0..1).
# Higher tier = further progress. Sub-score per spec §3.1-P-C: Champion 1.0 -> Group exit 0.18.
STAGE_LADDER = {
    "final": (7, 1.00),               # reached the final (winner vs runner-up split elsewhere)
    "final round": (7, 1.00),         # 1950 round-robin final group
    "third-place match": (6, 0.70),
    "semi-finals": (6, 0.70),
    "quarter-finals": (5, 0.50),
    "quarter-final": (5, 0.50),
    "second group stage": (4, 0.40),
    "round of 16": (3, 0.32),
    "group stage": (1, 0.18),
}
DEFAULT_STAGE = (1, 0.18)

MIN_AGE, MAX_AGE = 15, 45  # outside this band -> junk birth_date, treat age as unknown


def stage_score(performance: str) -> float:
    return STAGE_LADDER.get((performance or "").strip().lower(), DEFAULT_STAGE)[1]


def stage_tier(performance: str) -> int:
    return STAGE_LADDER.get((performance or "").strip().lower(), DEFAULT_STAGE)[0]


def parse_year(s) -> int | None:
    try:
        return int(str(s)[:4])
    except (ValueError, TypeError):
        return None


def age_at(birth_date: str, tournament_year: int) -> int | None:
    """Age in years on June 1 of the tournament year. None if birth_date is junk/missing."""
    if not birth_date or birth_date.lower() == "not applicable":
        return None
    try:
        y, m, d = (int(x) for x in birth_date.split("-")[:3])
        ref = date(tournament_year, 6, 1)
        age = ref.year - y - ((ref.month, ref.day) < (m, d))
    except (ValueError, TypeError):
        return None
    return age if MIN_AGE <= age <= MAX_AGE else None


def is_mens_tournament(tournament_name: str) -> bool:
    return "women" not in (tournament_name or "").lower()
