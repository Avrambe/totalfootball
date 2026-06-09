"""Download the Fjelstul World Cup database (the spine).

Source: https://github.com/jfjelstul/worldcup  (data-json/worldcup.json, ~35 MB)
License: CC-BY-SA 4.0. Attribution: Joshua C. Fjelstul, Ph.D., (c) 2023.

Idempotent: re-running skips the download if the file is already cached.
Prints a per-dataset record count so we can confirm the file matches the spec.
"""
import json
import sys

try:
    from ._common import raw_dir, download
except ImportError:  # allow running as a plain script: python pipeline/download/fjelstul.py
    from _common import raw_dir, download

URL = "https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-json/worldcup.json"

# From the spec: expected record counts for the tables we rely on.
EXPECTED = {
    "squads": 13843,
    "players": 10401,
    "goals": 3637,
    "award_winners": 200,
    "team_appearances": 2496,
    "player_appearances": 27432,
    "substitutions": 10222,
    "bookings": 3178,
    "qualified_teams": 625,
    "tournament_standings": 120,
}


def main(force: bool = False) -> None:
    dest = raw_dir("fjelstul") / "worldcup.json"
    download(URL, dest, force=force)

    print("\n  Verifying datasets:")
    with open(dest) as f:
        db = json.load(f)

    if not isinstance(db, dict):
        print("  [warn] unexpected top-level structure (expected an object of datasets)")
        return

    print(f"  Top-level datasets: {len(db)}")
    for name, expected in EXPECTED.items():
        node = db.get(name)
        # Fjelstul json wraps each dataset; records may be a list directly or under a key.
        if isinstance(node, list):
            n = len(node)
        elif isinstance(node, dict):
            # find the list-valued field
            lists = [v for v in node.values() if isinstance(v, list)]
            n = len(lists[0]) if lists else 0
        else:
            n = 0
        flag = "ok " if n == expected else "DIFF"
        print(f"    [{flag}] {name:22s} {n:>6,}  (spec {expected:,})")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
