"""Layer G — career stature, with a rating FLOOR. Spec §3.1.

Best finish within a window (tournament year ± 2) across Ballon d'Or, World Soccer POTY, and the
France Football retrospective. This is the apex signal that solves the elite-player-on-a-weak-team
problem (Salah floors high-80s even when Egypt exits in the group). The computed score may exceed
the floor but never falls under it.

Returns per player+year: (sub_score 0..1, floor 1..99, label). G feeds BOTH the weighted Layer-P
blend (as the sub_score) and the post-normalization floor.
"""
from __future__ import annotations
import sys

try:
    from .._shared import RAW, load_json, norm_name
except ImportError:
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from _shared import RAW, load_json, norm_name

WINDOW = 2  # ± seasons around the tournament year

# finish label -> (sub_score, floor). "votes" and below have no floor.
FINISH = {
    "winner": (1.00, 92),
    "podium": (0.85, 86),
    "top10":  (0.65, 78),
    "top30":  (0.45, 70),
    "votes":  (0.30, 0),
    "none":   (0.00, 0),
}
_ORDER = ["winner", "podium", "top10", "top30", "votes", "none"]


def _rank_to_label(rank: int) -> str:
    if rank == 1:
        return "winner"
    if rank <= 3:
        return "podium"
    if rank <= 10:
        return "top10"
    if rank <= 30:
        return "top30"
    return "votes"


def build_index() -> dict:
    """year -> list of (norm_name, finish_label) across all three stature sources."""
    idx: dict[int, list] = {}

    def add(year, name, label):
        nn = norm_name(name)
        if nn and isinstance(year, int):
            idx.setdefault(year, []).append((nn, label))

    for r in load_json(RAW / "ballon_dor_wiki" / "ballon_dor.json", []) or []:
        add(r.get("year"), r.get("player", ""), _rank_to_label(int(r.get("rank", 99))))
    for r in load_json(RAW / "world_soccer_poty" / "world_soccer_poty.json", []) or []:
        add(r.get("year"), r.get("player", ""), "winner")
    for r in load_json(RAW / "france_football" / "france_football.json", []) or []:
        add(r.get("year"), r.get("player", ""), "winner")
    return idx


def best_finish(index: dict, player_keys: set, year: int,
                back: int = WINDOW, fwd: int = WINDOW) -> tuple[float, int, str]:
    """Best (lowest-index) finish label for this player across [year-back, year+fwd]."""
    best = "none"
    for y in range(year - back, year + fwd + 1):
        for nn, label in index.get(y, ()):  # noqa: E501
            if nn in player_keys and _ORDER.index(label) < _ORDER.index(best):
                best = label
    sub, floor = FINISH[best]
    return sub, floor, best
