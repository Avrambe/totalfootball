"""Download the Kaggle-hosted data sources (idempotent).

Uses the Kaggle API (credentials at ~/.kaggle/kaggle.json). Each dataset is unzipped into
its own folder under data/raw/. Re-running skips download when the target CSV already exists.

Datasets:
  - World Football Elo (incl. ready-made 2026 48-team set) -> engine/opponent strength ONLY
  - FBref player season stats 2024-25 + 2025-26          -> club-form (Layer H), Big-5 only
  - Transfermarkt "player-scores" appearances           -> club-form (Layer H) for the broad,
                                                            non-Big-5 leagues (2026 proxy). We use
                                                            the OBJECTIVE appearance stats only
                                                            (minutes/goals/assists), never the
                                                            market valuations (youth-biased).
  - Ballon d'Or nominees                                  -> career stature (Layer G)
"""
import sys

try:
    from ._common import raw_dir
except ImportError:
    from _common import raw_dir

# name -> (kaggle ref, sentinel file, [specific files] or None for the whole dataset). We pull only
# the needed files from player-scores: its match-event/lineup CSVs are 500MB+ and unused.
DATASETS = {
    "elo": ("afonsofernandescruz/2026-fifa-world-cup-historical-elo-ratings", "elo_ratings_wc2026.csv", None),
    "fbref_2025_2026": ("hubertsidorowicz/football-players-stats-2025-2026", "players_data-2025_2026.csv", None),
    "fbref_2024_2025": ("hubertsidorowicz/football-players-stats-2024-2025", "players_data-2024_2025.csv", None),
    "player_scores": ("davidcariboo/player-scores", "appearances.csv",
                      ["appearances.csv", "players.csv", "clubs.csv", "competitions.csv", "games.csv"]),
    "ballon_dor": ("dcgonk/ballon-dor-nominees", "clean_ballon.xlsx", None),
}


def _api():
    from kaggle.api.kaggle_api_extended import KaggleApi
    api = KaggleApi()
    api.authenticate()
    return api


def main(force: bool = False) -> None:
    api = _api()
    for name, (ref, sentinel, files) in DATASETS.items():
        out = raw_dir(name)
        if (out / sentinel).exists() and not force:
            print(f"  [skip] {name}: {sentinel} already present")
            continue
        print(f"  [get ] {name}: {ref}")
        if files:
            for f in files:
                api.dataset_download_file(ref, f, path=str(out), quiet=True)
                zipped = out / (f + ".zip")  # kaggle gzips larger single files
                if zipped.exists():
                    import zipfile
                    with zipfile.ZipFile(zipped) as z:
                        z.extractall(out)
                    zipped.unlink()
        else:
            api.dataset_download_files(ref, path=str(out), unzip=True, quiet=True)
        got = sorted(p.name for p in out.iterdir() if p.is_file())
        print(f"  [done] {name}: {got}")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
