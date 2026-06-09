"""Download comprehensive historical Elo for EVERY World Cup participant, at its tournament's time.

The Kaggle "2026" Elo set only covers the 48 teams in the next tournament, so it can't tell us how
strong Chile were in 1958 or Spain in 1994. eloratings.net publishes a year-end snapshot of ALL
national teams for any year at https://www.eloratings.net/<year>.tsv (143 teams in 1958, including
defunct sides like the Soviet Union and West Germany). We pull one snapshot per men's World Cup year
and join it to the Fjelstul participants by a code map.

eloratings uses its own 2-letter codes (WG=West Germany, CS=Czechoslovakia, ZR=Zaire, DD=East
Germany, YU=Yugoslavia, DI=Dutch East Indies, RM=Serbia and Montenegro, SQ=Scotland, WA=Wales).
Rather than hand-guess those codes (an earlier attempt silently mismatched several), we match by
NAME against eloratings' own authoritative code->name dictionary at en.teams.tsv, bridging only the
few Fjelstul spelling differences. Fjelstul distinguishes "West Germany" from "Germany" by NAME
under one ISO-3 code (DEU), which name-matching handles for free.

Caches each year's TSV under data/raw/elo_full/ and emits elo_wc.json:
  [{ "year", "team_code", "team_name", "elo" }, ...]   (one row per WC participant)
plus prints a coverage report listing any participant we could not match.
"""
from __future__ import annotations
import json
import sys
import time
import urllib.request

try:
    from ._common import raw_dir
except ImportError:
    from _common import raw_dir

BASE = "https://www.eloratings.net/{year}.tsv"
DICT_URL = "https://www.eloratings.net/en.teams.tsv"

# Fjelstul team names that differ from eloratings' canonical spelling. Matching is by NAME against
# eloratings' own authoritative code->name dictionary (en.teams.tsv), so we only need to bridge the
# handful of naming differences, not guess any 2-letter codes.
NAME_ALIASES = {
    "Czech Republic": "Czechia",
    "Republic of Ireland": "Ireland",
}

# eloratings codes a few entities INCONSISTENTLY across its year-end snapshots. We try the dictionary
# code first, then these fallbacks, taking whichever is present in that year's table. Safe because
# each fallback's "other" meaning never appears in a World Cup these nations also played:
#   Soviet Union: SU in 1958/1970 but RU (the modern Russia code) in 1962/1966 — and Russia proper
#     has no WC before 1994, so there is no collision.
#   West Germany: WG through 1986 but DE (the unified Germany code) in 1990, because reunification
#     (Oct 1990) had already happened by that year-end snapshot — the same squad, correctly rated.
#   Serbia and Montenegro: RM in 2002 was still "YU", but by the 2006 year-end snapshot the union
#     had dissolved (June 2006) and they are listed as RS (Serbia) — and Serbia proper has no WC
#     before 2010, so there is no collision.
EXTRA_CANDIDATES = {
    "Soviet Union": ["RU"],
    "West Germany": ["DE"],
    "Serbia and Montenegro": ["RS"],
}


def _fetch_dict(force: bool) -> dict:
    """Build {normalized eloratings name -> 2-letter code} from the authoritative dictionary."""
    out = raw_dir("elo_full") / "en.teams.tsv"
    if out.exists() and not force:
        txt = out.read_text(encoding="utf-8", errors="ignore")
    else:
        req = urllib.request.Request(DICT_URL, headers={"User-Agent": "total-football/0.1"})
        txt = urllib.request.urlopen(req).read().decode("utf-8", "ignore")
        out.write_text(txt, encoding="utf-8")
    name_to_code = {}
    for line in txt.splitlines():
        cols = line.split("\t")
        if len(cols) < 2:
            continue
        code = cols[0].strip()
        if not code or code.endswith("_loc"):  # *_loc rows are "in <country>" location phrases
            continue
        for name in cols[1:]:                  # primary name + any short aliases
            nn = name.strip().lower()
            if nn:
                name_to_code.setdefault(nn, code)
    return name_to_code


def _candidate_codes(name_to_code: dict, team_name: str) -> list[str]:
    canonical = NAME_ALIASES.get(team_name, team_name)
    primary = name_to_code.get(canonical.lower())
    codes = [primary] if primary else []
    return codes + EXTRA_CANDIDATES.get(team_name, [])


def _fetch_year(year: int, force: bool):
    out = raw_dir("elo_full") / f"{year}.tsv"
    if out.exists() and not force:
        return out.read_text(encoding="utf-8", errors="ignore")
    url = BASE.format(year=year)
    req = urllib.request.Request(url, headers={"User-Agent": "total-football/0.1"})
    try:
        txt = urllib.request.urlopen(req).read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"    [miss] {year}: {e}")
        return None
    out.write_text(txt, encoding="utf-8")
    time.sleep(0.3)
    return txt


def _parse_tsv(txt: str) -> dict:
    """code -> year-end Elo rating. Columns: [rank_change, rank, code, rating, ...]."""
    out = {}
    for line in txt.splitlines():
        cols = line.split("\t")
        if len(cols) < 4:
            continue
        code, rating = cols[2].strip(), cols[3].strip()
        if code and rating.lstrip("-").isdigit():
            out[code] = int(rating)
    return out


def _load_participants() -> list[tuple[int, str, str]]:
    """(year, team_code, team_name) for every men's WC participant, from the Fjelstul spine."""
    wc = json.loads((raw_dir("fjelstul") / "worldcup.json").read_text(encoding="utf-8"))
    tour_year = {t["tournament_id"]: int(str(t["year"])[:4]) for t in wc["tournaments"]}
    mens = {t["tournament_id"] for t in wc["tournaments"] if "women" not in t["tournament_name"].lower()}
    seen, rows = set(), []
    for q in wc["qualified_teams"]:
        tid = q["tournament_id"]
        if tid not in mens:
            continue
        key = (tour_year[tid], q["team_code"], q["team_name"])
        if key not in seen:
            seen.add(key)
            rows.append(key)
    return rows


def main(force: bool = False) -> None:
    participants = _load_participants()
    name_to_code = _fetch_dict(force)
    years = sorted({y for y, _, _ in participants})
    year_tables = {}
    for y in years:
        txt = _fetch_year(y, force)
        if txt:
            year_tables[y] = _parse_tsv(txt)

    rows, misses = [], []
    for year, code, name in participants:
        table = year_tables.get(year, {})
        candidates = _candidate_codes(name_to_code, name)
        elo = next((table[c] for c in candidates if c in table), None)
        if elo is None:
            misses.append((year, code, name, candidates))
            continue
        rows.append({"year": year, "team_code": code, "team_name": name, "elo": elo})

    out = raw_dir("elo_full") / "elo_wc.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  Matched {len(rows)}/{len(participants)} WC participant-years "
          f"across {len(year_tables)} tournament years")
    if misses:
        print(f"  [UNMATCHED] {len(misses)}:")
        for year, code, name, candidates in misses:
            print(f"    {year} {code} {name} (tried elo codes {candidates or 'NONE'})")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
