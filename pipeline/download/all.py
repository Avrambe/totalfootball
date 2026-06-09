"""Run every data loader in order, then print a per-source coverage report.

Idempotent: each loader skips work already cached under data/raw/. Scrapes are brittle, so a
loader failing is logged and does NOT abort the run — partial external data is expected and the
rating pipeline (§3.3) drops missing fields rather than zeroing them.

Usage:
  python pipeline/download/all.py            # cached where possible
  python pipeline/download/all.py --force    # re-fetch everything
"""
import json
import sys
import traceback

try:
    from . import (fjelstul, kaggle_sources, elo_full, ballon_dor, world_soccer_poty,
                   france_football, squads_2026)
    from ._common import RAW
except ImportError:
    import fjelstul, kaggle_sources, elo_full, ballon_dor, world_soccer_poty, france_football, squads_2026
    from _common import RAW

LOADERS = [
    ("fjelstul (WC spine)", fjelstul),
    ("kaggle (elo, fbref, ballon)", kaggle_sources),
    ("elo_full (eloratings, all WC teams)", elo_full),  # needs the WC spine -> after fjelstul
    ("ballon_dor (wiki)", ballon_dor),
    ("world_soccer_poty (wiki)", world_soccer_poty),
    ("france_football (static)", france_football),
    ("squads_2026 (wiki)", squads_2026),
]


def _count(path, key=None):
    """Best-effort row count for a cached JSON file (list, or list under key)."""
    p = RAW / path
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8", errors="ignore"))
        if key is not None:
            data = data.get(key, [])
        return len(data) if isinstance(data, (list, dict)) else "?"
    except Exception:
        return "err"


def _coverage():
    print("\n" + "=" * 60)
    print("  COVERAGE REPORT")
    print("=" * 60)
    rows = [
        ("WC spine (worldcup.json)", "fjelstul/worldcup.json present" if (RAW / "fjelstul/worldcup.json").exists() else "MISSING"),
        ("Elo ratings CSV (2026 field)", "present" if (RAW / "elo/elo_ratings_wc2026.csv").exists() else "MISSING"),
        ("Elo full (WC participant-years)", _count("elo_full/elo_wc.json")),
        ("FBref 2025-26 CSV", "present" if (RAW / "fbref_2025_2026/players_data-2025_2026.csv").exists() else "MISSING"),
        ("FBref 2024-25 CSV", "present" if (RAW / "fbref_2024_2025/players_data-2024_2025.csv").exists() else "MISSING"),
        ("Ballon d'Or rows", _count("ballon_dor_wiki/ballon_dor.json")),
        ("World Soccer POTY winners", _count("world_soccer_poty/world_soccer_poty.json")),
        ("France Football retro", _count("france_football/france_football.json")),
        ("2026 squads", _count("squads_2026/squads_2026.json")),
    ]
    for label, val in rows:
        print(f"  {label:.<34} {val}")
    print("=" * 60)


def main(force: bool = False) -> None:
    for label, mod in LOADERS:
        print(f"\n>>> {label}")
        try:
            mod.main(force=force)
        except Exception:
            print(f"  [FAIL] {label} raised — continuing")
            traceback.print_exc(limit=2)
    _coverage()


if __name__ == "__main__":
    main(force="--force" in sys.argv)
