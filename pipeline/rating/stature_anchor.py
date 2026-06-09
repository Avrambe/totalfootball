"""Layer-S — historical stature anchor (Phase 3-fix-B). The historical analogue of consensus_2026.

The elite of the historical cohort should be defined by industry award standing (Ballon d'Or,
World Soccer POTY, France Football retrospective), NOT by a hot two-week tournament. A player's best
award rank within a window around the tournament year sets a SCARCE anchor rating that OVERRIDES the
World-Cup-performance composite in combine.py:
  - multi-time winners around the tournament reach 99 (the pantheon),
  - a single winner 97–98, podium/top-N step down to the floor.
Players with no award standing in the window return None and fall through to the honor-floor /
capped-performance tiers in combine.py.

Reuses the same raw award JSONs as career_stature.py but keeps actual RANKS (not just labels) so the
top can be a fine, scarce curve. Matching is norm_name against the player's name keys (same posture
as career_stature — common-surname collisions are tolerated, as the window + full-name key limit them).
"""
from __future__ import annotations
import sys

try:
    from .._shared import RAW, load_json, norm_name
except ImportError:
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from _shared import RAW, load_json, norm_name

BEST_WINDOW = 2   # ± years for the player's current award standing (drives the base anchor)
WIN_WINDOW = 6    # ± years for counting distinct win-years (the dominance signal that reaches 99)

ANCHOR_FLOOR = 80  # lowest rating the anchor hands out; combine.py caps the performance tier below this


def _build_index() -> tuple[dict, dict]:
    """Two indices keyed by calendar year:
       ranks[year] -> list of (norm_name, rank)   (Ballon d'Or ranks; POTY/France-Football as rank 1)
       wins[year]  -> set of norm_name            (rank-1 finishers that year, any source)
    """
    ranks: dict[int, list] = {}
    wins: dict[int, set] = {}

    def add(year, name, rank):
        if not isinstance(year, int):
            return
        nn = norm_name(name)
        if not nn:
            return
        ranks.setdefault(year, []).append((nn, rank))
        if rank == 1:
            wins.setdefault(year, set()).add(nn)

    for r in load_json(RAW / "ballon_dor_wiki" / "ballon_dor.json", []) or []:
        try:
            add(int(r.get("year")), r.get("player", ""), int(r.get("rank", 99)))
        except (TypeError, ValueError):
            continue
    for r in load_json(RAW / "world_soccer_poty" / "world_soccer_poty.json", []) or []:
        add(r.get("year"), r.get("player", ""), 1)
    for r in load_json(RAW / "france_football" / "france_football.json", []) or []:
        add(r.get("year"), r.get("player", ""), 1)
    return ranks, wins


_RANKS, _WINS = _build_index()


def _anchor_rating(best_rank: int, win_count: int, exact_year_win: bool) -> int:
    """Scarce rank → rating curve. 99 is reserved for serial winners around the tournament."""
    if best_rank == 1:
        if win_count >= 2:
            return 99            # serial winner around this tournament (the pantheon)
        if exact_year_win:
            return 98            # won the award the same year as the World Cup
        return 97                # a single win within the standing window
    if best_rank <= 3:
        return 95                # podium
    if best_rank <= 6:
        return 92
    if best_rank <= 10:
        return 89
    if best_rank <= 20:
        return 85
    if best_rank <= 30:
        return 82
    return ANCHOR_FLOOR          # received votes only


def lookup(player_keys: set, year: int) -> tuple[int | None, str]:
    """Best award anchor for this player around `year`. Returns (rating|None, label).

    None => no award standing in the window; combine.py then uses the honor / performance tiers."""
    if not year:
        return None, "none"
    best_rank = None
    for y in range(year - BEST_WINDOW, year + BEST_WINDOW + 1):
        for nn, rank in _RANKS.get(y, ()):
            if nn in player_keys and (best_rank is None or rank < best_rank):
                best_rank = rank
    if best_rank is None:
        return None, "none"
    win_years = sum(1 for y in range(year - WIN_WINDOW, year + WIN_WINDOW + 1)
                    if _WINS.get(y, set()) & player_keys)
    exact = bool(_WINS.get(year, set()) & player_keys)
    rating = _anchor_rating(best_rank, win_years, exact)
    label = ("win" if best_rank == 1 else "podium" if best_rank <= 3
             else "top10" if best_rank <= 10 else "top30" if best_rank <= 30 else "votes")
    return rating, label


if __name__ == "__main__":
    # Smoke test: a few known anchors (keys are norm_name sets).
    for nm, yr in [("diego maradona", 1986), ("diego maradona", 1994), ("lionel messi", 2018),
                   ("cristiano ronaldo", 2018), ("pele", 1970), ("antoine griezmann", 2018),
                   ("zinedine zidane", 2006)]:
        print(f"{nm:20} {yr}  ->  {lookup({nm}, yr)}")
