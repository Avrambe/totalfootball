"""Shared helpers for the rating pipeline: data loading, name normalization, percentile mapping."""
from __future__ import annotations
import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DERIVED = ROOT / "data" / "derived"
PUBLIC = ROOT / "app" / "public"


def load_worldcup() -> dict:
    """The Fjelstul spine (worldcup.json), keyed by table name -> list of rows."""
    return json.loads((RAW / "fjelstul" / "worldcup.json").read_text(encoding="utf-8"))


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return default


def strip_accents(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def norm_name(s: str) -> str:
    """Lowercase, de-accent, collapse whitespace, drop punctuation — for cross-source matching."""
    s = strip_accents(s or "").lower()
    s = "".join(c if c.isalnum() or c.isspace() else " " for c in s)
    return " ".join(s.split())


def player_name_keys(given: str, family: str) -> set:
    """Match keys for a Fjelstul player. Mononyms store given='not applicable'."""
    fam = norm_name(family)
    keys = {fam}
    if given and given.lower() != "not applicable":
        full = norm_name(f"{given} {family}")
        keys.add(full)
    return {k for k in keys if k}


def percentile_ranks(values: list[float]) -> list[float]:
    """Fractional rank in [0,1] for each value (ties share the average rank). Order preserved."""
    n = len(values)
    if n == 0:
        return []
    if n == 1:
        return [0.5]
    order = sorted(range(n), key=lambda i: values[i])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg_rank = (i + j) / 2.0          # 0-based average index of the tie group
        frac = avg_rank / (n - 1)
        for k in range(i, j + 1):
            ranks[order[k]] = frac
        i = j + 1
    return ranks


def to_1_99(frac: float) -> int:
    """Map a [0,1] percentile to an integer 1..99."""
    return max(1, min(99, round(1 + 98 * frac)))
