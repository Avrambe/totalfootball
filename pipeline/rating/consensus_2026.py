"""Phase 3-fix — the 2026 elite "consensus tier" (Spec §5, plan addendum).

The 2026 cohort's *top* should not be derived from our own proxy stats (caps/market value), which
mint role-players at 98. It should be anchored to industry consensus: several reputable "best
players entering the 2026 World Cup" rankings, merged. Below this tier the composite path
(cohort_2026.py) rates everyone else, calibrated to the historical scale and capped under the
consensus floor — so no non-listed player can outrank a listed one.

Sources (fetched 2026-06-09, ordered rankings; build-time only, merged into our OWN derived 1–99,
never redistributed raw — attribution in README/About, same posture as Fjelstul/Elo/Transfermarkt):
  - ESPN  "World Cup Rank: 50 best players in the 2026 tournament" (full 50)
  - FOX Sports "Top 100 players in the 2026 World Cup" (top 30 used, for cross-list comparability)
  - NBC Sports "Ranking the top 25 players at the 2026 World Cup" (25)
  - 365scores "The 25 best players heading to the 2026 World Cup" (25)
  - 2025 men's Ballon d'Or final ranking, top 30 — DOWN-WEIGHTED ×0.6 (a season-award list, it
    rewards one club campaign, not World-Cup-entry quality; it also contains non-participants, which
    the participant filter drops).
We do NOT use EA/FIFA ratings (proprietary IP).

Merge = weighted Borda: a list of length N awards rank r the score (N−r+1)/N; we average across the
five lists by source weight, with ABSENCE counting as 0 (so missing a list pulls a player down).
The merged order is filtered to players who are actually in a 2026 squad, then a scarce rank→rating
curve assigns the elite ratings (ceiling 97 — Yamal/Dembélé/Mbappé; 98/99 reserved for the
historical pantheon).
"""
from __future__ import annotations
import sys

try:
    from .._shared import norm_name
except ImportError:
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
    from _shared import norm_name

# --- The five source lists (ordered #1 → #N) ------------------------------------------------
ESPN = [
    "Ousmane Dembélé", "Lamine Yamal", "Michael Olise", "Harry Kane", "Bruno Fernandes",
    "Pedri", "William Saliba", "Raphinha", "Bukayo Saka", "Martin Ødegaard",
    "Erling Haaland", "Vinícius Júnior", "Jude Bellingham", "Kylian Mbappé", "Lionel Messi",
    "Declan Rice", "Vitinha", "Bruno Guimarães", "Federico Valverde", "Moisés Caicedo",
    "João Neves", "Julián Álvarez", "Jérémy Doku", "Rayan Cherki", "Achraf Hakimi",
    "Nuno Mendes", "Lautaro Martínez", "Désiré Doué", "Luis Díaz", "Bradley Barcola",
    "Antoine Semenyo", "Jamal Musiala", "Yan Diomande", "Florian Wirtz", "Alexander Isak",
    "Virgil van Dijk", "Luka Modrić", "Joshua Kimmich", "Rodri", "Casemiro",
    "Thibaut Courtois", "Marquinhos", "Willian Pacho", "Gabriel Magalhães", "Emiliano Martínez",
    "Joško Gvardiol", "Jules Koundé", "Bernardo Silva", "Kai Havertz", "Mohamed Salah",
]
FOX = [  # FOX's published list is 100 deep; top 30 used so all five lists share a comparable depth.
    "Lamine Yamal", "Kylian Mbappé", "Harry Kane", "Ousmane Dembélé", "Michael Olise",
    "Erling Haaland", "Vinícius Júnior", "Achraf Hakimi", "Vitinha", "Pedri",
    "Federico Valverde", "Bruno Fernandes", "Julián Álvarez", "Rodri", "Raphinha",
    "Lionel Messi", "João Neves", "Jude Bellingham", "Declan Rice", "Moisés Caicedo",
    "Gabriel Magalhães", "Florian Wirtz", "Luis Díaz", "Antoine Semenyo", "Aurélien Tchouaméni",
    "Lautaro Martínez", "Bukayo Saka", "Virgil van Dijk", "Joshua Kimmich", "Alphonso Davies",
]
NBC = [
    "Kylian Mbappé", "Lamine Yamal", "Ousmane Dembélé", "Lionel Messi", "Harry Kane",
    "Bruno Fernandes", "Raphinha", "Erling Haaland", "Michael Olise", "Désiré Doué",
    "Rodri", "Pedri", "Achraf Hakimi", "Vitinha", "Federico Valverde",
    "Cristiano Ronaldo", "João Neves", "Kevin De Bruyne", "Vinícius Júnior", "Julián Álvarez",
    "William Saliba", "Thibaut Courtois", "Declan Rice", "Jamal Musiala", "Lautaro Martínez",
]
SCORES365 = [
    "Lamine Yamal", "Kylian Mbappé", "Harry Kane", "Ousmane Dembélé", "Vinícius Júnior",
    "Vitinha", "Pedri", "Erling Haaland", "Michael Olise", "Bruno Fernandes",
    "Lionel Messi", "Cristiano Ronaldo", "Raphinha", "Thibaut Courtois", "Jamal Musiala",
    "Achraf Hakimi", "João Neves", "Nuno Mendes", "Federico Valverde", "Virgil van Dijk",
    "Julián Álvarez", "Jude Bellingham", "Declan Rice", "Désiré Doué", "Rayan Cherki",
]
BALLON_DOR_2025 = [
    "Ousmane Dembélé", "Lamine Yamal", "Vitinha", "Mohamed Salah", "Raphinha",
    "Achraf Hakimi", "Kylian Mbappé", "Cole Palmer", "Gianluigi Donnarumma", "Nuno Mendes",
    "Pedri", "Khvicha Kvaratskhelia", "Harry Kane", "Désiré Doué", "Viktor Gyökeres",
    "Vinícius Júnior", "Robert Lewandowski", "Scott McTominay", "João Neves", "Lautaro Martínez",
    "Serhou Guirassy", "Alexis Mac Allister", "Jude Bellingham", "Fabián Ruiz", "Denzel Dumfries",
    "Erling Haaland", "Declan Rice", "Virgil van Dijk", "Florian Wirtz", "Michael Olise",
]

# (tag, list, weight). WC-entry lists 1.0; the season-award Ballon d'Or 0.6.
SOURCES = [
    ("ESPN", ESPN, 1.0), ("FOX", FOX, 1.0), ("NBC", NBC, 1.0),
    ("365scores", SCORES365, 1.0), ("BallonDor2025", BALLON_DOR_2025, 0.6),
]

CONSENSUS_FLOOR = 82        # lowest rating the consensus tier hands out; composite tier caps at -1.
CEILING = 97                # the single allowed top band (Yamal/Dembélé/Mbappé). 98/99 = historical.

# Display-name aliases for any list spelling that doesn't norm-match the squad card. The squad source
# uses the same display names as the lists, so this is currently empty — kept as the documented hook.
NAME_ALIASES: dict[str, str] = {}


def _alias(name: str) -> str:
    return NAME_ALIASES.get(norm_name(name), norm_name(name))


def merge() -> list[tuple[str, float]]:
    """Weighted-Borda merge of the five lists → [(display_name, score)] ordered best-first.
    Absence from a list contributes 0 to the numerator but the source's full weight to the
    denominator, so appearing on fewer lists lowers the average."""
    total_w = sum(w for _, _, w in SOURCES)
    num: dict[str, float] = {}
    disp: dict[str, str] = {}
    for _tag, lst, w in SOURCES:
        n = len(lst)
        for i, name in enumerate(lst):
            key = _alias(name)
            num[key] = num.get(key, 0.0) + w * ((n - i) / n)
            disp.setdefault(key, name)
    ranked = sorted(num.items(), key=lambda kv: kv[1], reverse=True)
    return [(disp[k], s / total_w) for k, s in ranked]


def consensus_rating(rank: int) -> int:
    """Scarce rank→rating curve over the participant-filtered consensus order (rank is 1-based).
    Top three share the 97 ceiling; #4–5 at 96; then a gentle ~0.42/rank taper down to the floor."""
    if rank <= 3:
        return CEILING
    if rank <= 5:
        return 96
    return round(95.5 - 0.42 * (rank - 5))


def build_ratings(card_names) -> tuple[dict, list, list]:
    """Resolve the merged consensus to actual 2026 squad players.

    `card_names` = iterable of 2026 card display names. Returns:
      ratings    — { norm_name(card) : wc_rating } for matched players whose curve value ≥ floor;
      order      — [(rank, display_name, rating, score)] for the matched consensus tier (debug);
      unmatched  — merged names in the would-be tier that matched NO card (flags a name-match miss).
    The order is filtered to participants BEFORE the rank curve, so non-participants on the Ballon
    d'Or list (e.g. Kvaratskhelia) never consume a rating slot from a player who's actually here.
    """
    have = {norm_name(n) for n in card_names}
    ratings, order, unmatched = {}, [], []
    rank = 0
    for disp, score in merge():
        key = _alias(disp)
        if key not in have:
            # Track misses only while we're still in the plausible tier depth (~top 40).
            if len(order) + len(unmatched) < 40:
                unmatched.append(disp)
            continue
        rank += 1
        r = consensus_rating(rank)
        if r < CONSENSUS_FLOOR:
            break
        ratings[key] = r
        order.append((rank, disp, r, round(score, 3)))
    return ratings, order, unmatched


if __name__ == "__main__":
    # Smoke test: print the merged consensus order (no card filter — shows raw merge).
    print(f"{'rk':>3}  {'rating':>6}  {'score':>6}  name")
    for i, (name, score) in enumerate(merge()[:45], start=1):
        print(f"{i:>3}  {consensus_rating(i):>6}  {score:>6.3f}  {name}")
