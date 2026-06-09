"""Shared paths + helpers for the data download loaders."""
from pathlib import Path
import urllib.request
import shutil

# pipeline/download/_common.py -> repo root is two parents up
ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
DERIVED = ROOT / "data" / "derived"


def raw_dir(source: str) -> Path:
    d = RAW / source
    d.mkdir(parents=True, exist_ok=True)
    return d


def download(url: str, dest: Path, *, force: bool = False) -> Path:
    """Stream a URL to dest. Idempotent: skips if the file already exists unless force=True."""
    if dest.exists() and not force:
        print(f"  [skip] {dest.name} already cached ({dest.stat().st_size:,} bytes)")
        return dest
    print(f"  [get ] {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "total-football-data/0.1"})
    with urllib.request.urlopen(req) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    print(f"  [done] {dest.name} ({dest.stat().st_size:,} bytes)")
    return dest
