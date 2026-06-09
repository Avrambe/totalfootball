"""Build the app's data files from the rating pipeline, and verify the spec's sanity targets.

Emits into app/public/:
  cards.json  — per card: identity, wc_rating, eligible_positions, atk/def engine components.
  teams.json  — team_code -> { name, years played, era membership }.
  elo.json    — team_code -> { year: rating } national-team Elo (engine opponent strength only).

Then prints a PASS/FAIL table for the spec §3.3 sanity targets.
"""
from __future__ import annotations
import json
import sys

try:
    from ._shared import PUBLIC, RAW, load_worldcup, norm_name
    from .rating import combine, cohort_2026
except ImportError:
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _shared import PUBLIC, RAW, load_worldcup, norm_name
    from rating import combine, cohort_2026

# Engine bridge multipliers (spec §3.4): position -> (attack, defense).
POS_MULT = {"GK": (0.00, 1.10), "DF": (0.15, 1.00), "MF": (0.60, 0.50), "FW": (1.00, 0.10)}
LINE_FROM_BOOL = [("goal_keeper", "GK"), ("defender", "DF"), ("midfielder", "MF"), ("forward", "FW")]


def _display_name(given: str, family: str) -> str:
    if not given or given.lower() == "not applicable":
        return family
    return f"{given} {family}"


def _eligible_positions(player: dict, own_pos: str) -> list[str]:
    lines = [tok for flag, tok in LINE_FROM_BOOL if player.get(flag)]
    if own_pos not in lines:
        lines.append(own_pos)
    return sorted(set(lines), key=lambda t: ["GK", "DF", "MF", "FW"].index(t))


def _engine_components(wc_rating: int, pos: str) -> dict:
    """rating -> (atk, def) engine inputs via the position multipliers (spec §3.4)."""
    atk_m, def_m = POS_MULT[pos]
    r01 = wc_rating / 99.0
    return {"atk": round(r01 * atk_m, 4), "def": round(r01 * def_m, 4)}


def build():
    wc = load_worldcup()
    players = {p["player_id"]: p for p in wc["players"]}
    cards_raw = combine.build_all(wc)

    cards, teams = [], {}

    def register_team(tc, name, year):
        if not tc:
            return
        t = teams.setdefault(tc, {"name": name, "years": set()})
        if year:
            t["years"].add(year)

    for c in cards_raw:
        player = players[c["player_id"]]
        pos = c["position"]
        cards.append({
            "player_id": c["player_id"],
            "name": _display_name(c.get("given_name"), c.get("family_name")),
            "team_code": c["team_code"], "team_name": c["team_name"],
            "year": c["year"], "position": pos,
            "eligible_positions": _eligible_positions(player, pos),
            "wc_rating": c["wc_rating"],
            **_engine_components(c["wc_rating"], pos),
            "age": c["age"], "g_label": c["g_label"],
        })
        register_team(c["team_code"], c["team_name"], c["year"])

    # 2026 cohort (Phase 3): separate proxy-rated cards, same final shape + engine components.
    cohort = cohort_2026.build_cards()
    covered = sum(1 for c in cohort if c.pop("_has_club"))
    for c in cohort:
        c.update(_engine_components(c["wc_rating"], c["position"]))
        cards.append(c)
        register_team(c["team_code"], c["team_name"], c["year"])
    print(f"  2026 cohort: {len(cohort)} cards, club-covered "
          f"{covered} ({covered / max(len(cohort), 1):.0%})")

    # Finalize teams: era membership from years played.
    teams_out = {}
    for tc, t in teams.items():
        years = sorted(t["years"])
        teams_out[tc] = {
            "name": t["name"], "years": years,
            "eras": {"modern": any(y >= 1970 for y in years),
                     "alltime": bool(years),
                     "y2026": 2026 in years},
        }

    elo_out = _build_elo()

    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "cards.json").write_text(json.dumps(cards, ensure_ascii=False), encoding="utf-8")
    (PUBLIC / "teams.json").write_text(json.dumps(teams_out, ensure_ascii=False), encoding="utf-8")
    (PUBLIC / "elo.json").write_text(json.dumps(elo_out, ensure_ascii=False), encoding="utf-8")
    print(f"  Emitted {len(cards)} cards, {len(teams_out)} teams, {len(elo_out)} elo nations")
    return cards


def _build_elo() -> dict:
    """team_code -> { year: Elo } for every WC participant at its tournament's year.

    Source is data/raw/elo_full/elo_wc.json, the eloratings.net year-end snapshot matched to every
    men's WC participant (defunct nations included). This supersedes the old 48-team Kaggle set, which
    only covered teams in the 2026 field. The 2026 cohort's live Elo is folded in during Phase 3.
    """
    out: dict[str, dict] = {}
    rows = json.loads((RAW / "elo_full" / "elo_wc.json").read_text(encoding="utf-8"))
    for r in rows:
        out.setdefault(r["team_code"], {})[str(r["year"])] = r["elo"]
    _add_2026_elo(out)
    return out


def _add_2026_elo(out: dict) -> None:
    """Fold the 2026 cohort's live Elo (Kaggle set) into out[code]["2026"], matched by name."""
    import csv
    name2code = cohort_2026._team_name_to_code()
    # eloratings/Kaggle spells it "Czechia"; Fjelstul spine uses "Czech Republic".
    name2code["Czechia"] = name2code.get("Czech Republic")
    path = RAW / "elo" / "elo_ratings_wc2026.csv"
    with path.open(encoding="utf-8", errors="ignore", newline="") as fh:
        for row in csv.DictReader(fh):
            if row.get("year") != "2026":
                continue
            code = name2code.get(row.get("country", ""))
            if code:
                out.setdefault(code, {})["2026"] = int(row["rating"])


def sanity(cards: list[dict]) -> None:
    def find(name_sub, year=None, pos=None):
        nn = norm_name(name_sub)
        hits = [c for c in cards if nn in norm_name(c["name"])
                and (year is None or c["year"] == year)
                and (pos is None or c["position"] == pos)]
        return hits

    print("\n" + "=" * 64)
    print("  SANITY TARGETS (spec §3.3)")
    print("=" * 64)
    results = []

    mara = find("Maradona", 1986)
    r = mara[0]["wc_rating"] if mara else None
    results.append(("Maradona 1986 ≈ 99 (FW)", r, r is not None and r >= 96))

    salah = find("Mohamed Salah")
    r = salah[0]["wc_rating"] if salah else None
    results.append(("Salah (Egypt) ≥ high-80s", r, r is not None and r >= 87))

    m86 = find("Maradona", 1986)
    m94 = find("Maradona", 1994)
    if m86 and m94:
        ok = m94[0]["wc_rating"] < m86[0]["wc_rating"]
        results.append((f"Maradona age-decline (94={m94[0]['wc_rating']} < 86={m86[0]['wc_rating']})", "", ok))

    # CBs on quarterfinalists: report the band (fuzzy target mid-60s–70s).
    qf_def = [c for c in cards if c["position"] == "DF" and 60 <= c["wc_rating"] <= 80]
    results.append((f"DF cards in 60–80 band (n={len(qf_def)})", "", len(qf_def) > 0))

    # --- 2026 cohort targets (Phase 3) ---
    cards_2026 = [c for c in cards if c["year"] == 2026]
    for star in ("Mbappé", "Haaland", "Bellingham", "Messi"):
        hit = [c for c in cards_2026 if norm_name(star) in norm_name(c["name"])]
        r = max((c["wc_rating"] for c in hit), default=None)
        results.append((f"2026 {star} ≥ high-80s", r, r is not None and r >= 87))

    teams_2026 = {}
    for c in cards_2026:
        teams_2026.setdefault(c["team_code"], 0)
        teams_2026[c["team_code"]] += 1
    sizes_ok = all(20 <= n <= 28 for n in teams_2026.values()) and len(teams_2026) == 48
    results.append((f"2026: 48 teams, squad sizes 20–28 (n_teams={len(teams_2026)})", "", sizes_ok))
    none_coded = [c["team_name"] for c in cards_2026 if not c["team_code"]]
    results.append(("2026: every team mapped to a code", "", not none_coded))

    for label, val, ok in results:
        mark = "PASS" if ok else "FAIL"
        extra = f" -> {val}" if val != "" else ""
        print(f"  [{mark}] {label}{extra}")

    # Distribution snapshot per position.
    print("-" * 64)
    from statistics import median
    for pos in ("GK", "DF", "MF", "FW"):
        rs = sorted(c["wc_rating"] for c in cards if c["position"] == pos)
        if rs:
            print(f"  {pos}: n={len(rs)} min={rs[0]} med={int(median(rs))} max={rs[-1]}")
    print("=" * 64)


def main() -> None:
    cards = build()
    sanity(cards)


if __name__ == "__main__":
    main()
