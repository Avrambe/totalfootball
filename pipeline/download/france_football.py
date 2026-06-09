"""France Football retrospective Ballon d'Or winners ("Le nouveau palmarès"), 1958–1994.

Career-stature signal (rating Layer G). The Ballon d'Or was European-only until 1995; in 2016
France Football published a reevaluation naming who *would* have won under modern global rules.
These 12 retrospective winners are the only way non-European greats of that era (above all Pelé)
register on the Ballon d'Or axis at all, so we treat each as a rank-1 award for its year.

Static list (no network). Emits france_football.json:
  [{ "year", "player" }, ...]
"""
import json
import sys

try:
    from ._common import raw_dir
except ImportError:
    from _common import raw_dir

# France Football 2016 "Le nouveau palmarès" — alternative (global) winners.
RETROSPECTIVE = [
    (1958, "Pelé"),
    (1959, "Pelé"),
    (1960, "Pelé"),
    (1961, "Pelé"),
    (1962, "Garrincha"),
    (1963, "Pelé"),
    (1964, "Pelé"),
    (1970, "Pelé"),
    (1978, "Mario Kempes"),
    (1986, "Diego Maradona"),
    (1990, "Diego Maradona"),
    (1994, "Romário"),
]


def main(force: bool = False) -> None:
    rows = [{"year": y, "player": p} for y, p in RETROSPECTIVE]
    out = raw_dir("france_football") / "france_football.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  {len(rows)} retrospective winners (1958–1994); "
          f"Pelé x{sum(1 for _, p in RETROSPECTIVE if p == 'Pelé')}, "
          f"Maradona x{sum(1 for _, p in RETROSPECTIVE if p == 'Diego Maradona')}")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
