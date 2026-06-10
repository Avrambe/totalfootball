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
    from .rating.consensus_2026 import CONSENSUS_FLOOR
except ImportError:
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _shared import PUBLIC, RAW, load_worldcup, norm_name
    from rating import combine, cohort_2026
    from rating.consensus_2026 import CONSENSUS_FLOOR

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
            "age": c["age"], "g_label": c["g_label"], "tier": c["_tier"],
        })
        register_team(c["team_code"], c["team_name"], c["year"])

    # 2026 cohort (Phase 3): two-tier proxy-rated cards, same final shape + engine components. The
    # composite tier calibrates to the historical per-position rating distribution, so pass it in.
    hist_by_pos: dict[str, list[int]] = {}
    for c in cards_raw:
        hist_by_pos.setdefault(c["position"], []).append(c["wc_rating"])
    cohort = cohort_2026.build_cards(hist_by_pos)
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

    def best(name_sub, year=None, pos=None):
        hits = find(name_sub, year, pos)
        return max((c["wc_rating"] for c in hits), default=None)

    # --- Historical anchor tier (Phase 3-fix-B): awards set the scarce elite ---
    r = best("Maradona", 1986)
    results.append(("Maradona 1986 = 99 (retro winner + won cup)", r, r is not None and r >= 98))

    r = best("Lionel Messi", 2018)
    results.append(("Messi 2018 ≈ 99 (±2 window catches 2019 BdO)", r, r is not None and r >= 98))

    r = best("Cristiano Ronaldo", 2018)
    results.append(("Ronaldo 2018 ≈ 99 (±2 window catches 2016/17 BdO)", r, r is not None and r >= 98))

    r = best("Mohamed Salah")
    results.append(("Salah (Egypt) ≥ high-80s (BdO top-10 anchor)", r, r is not None and r >= 87))

    m86 = best("Maradona", 1986)
    m94 = best("Maradona", 1994)
    if m86 and m94:
        results.append((f"Maradona age-decline (94={m94} < 86={m86})", "", m94 < m86))

    # --- Honor-floor tier (the user's refinement: honors bump, raw goals don't) ---
    r = best("Zinedine Zidane", 2006)
    results.append(("Zidane 2006 ≈ 95 (Golden Ball floor)", r, r is not None and 93 <= r <= 96))

    r = best("Antoine Griezmann", 2018)
    results.append(("Griezmann 2018 in 90–96 (strong tournament)", r, r is not None and 90 <= r <= 96))

    # Variance guard: no award-era, performance-tier player breaks the cap (raw goals never reach elite).
    perf_modern = [c["wc_rating"] for c in cards
                   if c.get("tier") == "perf" and (c["year"] or 0) >= 1995]
    mx = max(perf_modern, default=0)
    results.append((f"award-era perf-tier capped ≤79 (max={mx})", "", mx <= 79))

    # Scarcity: the historical 98+/99 inflation collapses to a scarce band.
    hist = [c for c in cards if (c["year"] or 0) != 2026]
    n99 = sum(1 for c in hist if c["wc_rating"] >= 99)
    n98 = sum(1 for c in hist if c["wc_rating"] >= 98)
    results.append((f"historical 98+ scarce (n={n98}, target 20–70)", "", 20 <= n98 <= 70))
    results.append((f"historical 99 scarce (n={n99}, target 8–45)", "", 8 <= n99 <= 45))

    # Pre-1956 award-less reach: the standout of an early tournament still reaches the elite band.
    pre56 = [c["wc_rating"] for c in cards if 0 < (c["year"] or 0) < 1956]
    mx56 = max(pre56, default=0)
    results.append((f"pre-1956 standout reaches elite band (max={mx56}, ≥88)", "", mx56 >= 88))

    # CBs on quarterfinalists: report the band (fuzzy target mid-60s–70s).
    qf_def = [c for c in cards if c["position"] == "DF" and 60 <= c["wc_rating"] <= 80]
    results.append((f"DF cards in 60–80 band (n={len(qf_def)})", "", len(qf_def) > 0))

    # --- 2026 cohort targets (Phase 3-fix: two-tier consensus + composite) ---
    cards_2026 = [c for c in cards if c["year"] == 2026]

    def r2026(name_sub):
        hit = [c for c in cards_2026 if norm_name(name_sub) in norm_name(c["name"])]
        return max((c["wc_rating"] for c in hit), default=None)

    # Consensus tier: ceiling, scarcity, and no active player in the historical 98/99 band.
    top3 = {"Lamine Yamal": 97, "Ousmane Dembélé": 97, "Kylian Mbappé": 97}
    for nm, want in top3.items():
        r = r2026(nm)
        results.append((f"2026 {nm} = {want} (ceiling)", r, r == want))
    max_2026 = max((c["wc_rating"] for c in cards_2026), default=0)
    results.append((f"no active 2026 player ≥ 98 (max={max_2026})", "", max_2026 <= 97))

    n97 = sum(1 for c in cards_2026 if c["wc_rating"] >= 97)
    n95 = sum(1 for c in cards_2026 if c["wc_rating"] >= 95)
    n93 = sum(1 for c in cards_2026 if c["wc_rating"] >= 93)
    results.append((f"scarce top: ~3 at 97 (n={n97}), ~7 at 95+ (n={n95}), ~12 at 93+ (n={n93})",
                    "", n97 <= 4 and 5 <= n95 <= 10 and 8 <= n93 <= 16))

    # Consensus anchor table (curve targets; allow ±1 for taper rounding).
    for nm, want in (("Harry Kane", 96), ("Pedri", 96), ("Vitinha", 95), ("Michael Olise", 95),
                     ("Erling Haaland", 94), ("Vinícius", 94), ("Lionel Messi", 92),
                     ("Cristiano Ronaldo", 87), ("Mohamed Salah", 82)):
        r = r2026(nm)
        results.append((f"2026 {nm} ≈ {want}", r, r is not None and abs(r - want) <= 1))

    # Composite tier: the reported bug (Laimer) drops below the consensus floor; rescues land
    # respectable; cap-padded weak-league veterans fall.
    laimer = r2026("Konrad Laimer")
    results.append((f"Laimer drops to ~80–82 (composite, < floor)", laimer,
                    laimer is not None and 78 <= laimer <= 82))
    for nm in ("Sadio Mané", "Riyad Mahrez"):
        r = r2026(nm)
        results.append((f"rescue (age-corrected MV): {nm} respectable (≥72, < floor)", r,
                        r is not None and 72 <= r < CONSENSUS_FLOOR))
    max_composite = max((c["wc_rating"] for c in cards_2026 if c["wc_rating"] < CONSENSUS_FLOOR),
                        default=0)
    results.append((f"no non-listed player reaches the consensus floor (max composite={max_composite})",
                    "", max_composite < CONSENSUS_FLOOR))

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

    # 2026 cohort band histogram (scarcity + spread at the top).
    print("-" * 64)
    print("  2026 cohort rating bands (per position):")
    bands = [(95, 99), (90, 94), (85, 89), (80, 84), (70, 79), (1, 69)]
    hdr = "  pos  " + "".join(f"{lo}-{hi:<3}" for lo, hi in bands)
    print(hdr)
    for pos in ("GK", "DF", "MF", "FW"):
        rs = [c["wc_rating"] for c in cards_2026 if c["position"] == pos]
        counts = "".join(f"{sum(1 for r in rs if lo <= r <= hi):<7}" for lo, hi in bands)
        print(f"  {pos:<4} {counts}")

    # Historical top-end report (Phase 3-fix-B): scarcity overall, per-era, per-tournament.
    print("-" * 64)
    print("  Historical elite scarcity (98+ should be ~1–2 per tournament):")
    hist = [c for c in cards if (c["year"] or 0) != 2026]
    def _era(y):
        return "pre-1970" if y < 1970 else "1970-1994" if y < 1995 else "1995+"
    for era in ("pre-1970", "1970-1994", "1995+"):
        grp = [c for c in hist if _era(c["year"] or 0) == era]
        n99 = sum(1 for c in grp if c["wc_rating"] >= 99)
        n98 = sum(1 for c in grp if c["wc_rating"] >= 98)
        n95 = sum(1 for c in grp if c["wc_rating"] >= 95)
        print(f"  {era:<11} n={len(grp):<5} 99:{n99:<4} 98+:{n98:<4} 95+:{n95}")
    print("  per-tournament 98+ (year: count):")
    by_year: dict[int, int] = {}
    for c in hist:
        if c["wc_rating"] >= 98:
            by_year[c["year"] or 0] = by_year.get(c["year"] or 0, 0) + 1
    line = "  " + "  ".join(f"{y}:{n}" for y, n in sorted(by_year.items()))
    print(line if by_year else "  (none)")
    print("  tier mix (historical):", end=" ")
    tier_mix: dict[str, int] = {}
    for c in hist:
        tier_mix[c.get("tier", "?")] = tier_mix.get(c.get("tier", "?"), 0) + 1
    print(", ".join(f"{k}={v}" for k, v in sorted(tier_mix.items())))

    # Clustering check (Phase Ratings-fix): whole-cohort 5-pt band counts for each cohort. Watch
    # for a single band holding a disproportionate share (the old hard cap piled 1483 cards at 79).
    print("-" * 64)
    print("  5-pt band distribution (clustering check):")
    for label, group in (("historical", hist), ("2026", cards_2026)):
        rs = [c["wc_rating"] for c in group]
        n = len(rs)
        band_counts: dict[int, int] = {}
        for r in rs:
            band_counts[(r // 5) * 5] = band_counts.get((r // 5) * 5, 0) + 1
        peak_b = max(band_counts, key=band_counts.get) if band_counts else 0
        peak_pct = band_counts.get(peak_b, 0) / max(n, 1)
        print(f"  {label} (n={n}) — peak band {peak_b}-{peak_b + 4}: "
              f"{band_counts.get(peak_b, 0)} ({peak_pct:.1%})")
        for b in range(0, 100, 5):
            cnt = band_counts.get(b, 0)
            bar = "#" * round(cnt / max(n, 1) * 200)
            print(f"    {b:>2}-{b + 4:<2}: {cnt:>5} {bar}")
    print("=" * 64)


def main() -> None:
    cards = build()
    sanity(cards)


if __name__ == "__main__":
    main()
