"""Scrape World Soccer Player of the Year winners (1982–present) from Wikipedia.

Career-stature signal (rating Layer G), independent of the Ballon d'Or. The first wikitable on
"World Soccer Player of the Year" is the winners list (Year / Player / Club); player text looks
like "Paolo Rossi ( ITA ) (23%)" — we keep just the name. Winners-only (the award publishes a
single winner per year), so every row is rank 1.

Caches the raw HTML under data/raw/world_soccer_poty/ and emits world_soccer_poty.json:
  [{ "year", "player" }, ...]
"""
import json
import re
import sys
import urllib.request

try:
    from ._common import raw_dir
except ImportError:
    from _common import raw_dir

URL = "https://en.wikipedia.org/wiki/World_Soccer_Player_of_the_Year"


def _clean(s: str) -> str:
    s = re.sub(r"\[[^\]]*\]", "", s)          # footnotes
    s = re.sub(r"\([^)]*\)", "", s)           # ( ITA ), (23%)
    return re.sub(r"\s+", " ", s).strip()


def _fetch(force: bool):
    out = raw_dir("world_soccer_poty") / "page.html"
    if out.exists() and not force:
        print(f"  [skip] page.html cached ({out.stat().st_size:,} bytes)")
        return out.read_text(encoding="utf-8", errors="ignore")
    print(f"  [get ] {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "total-football/0.1"})
    try:
        html = urllib.request.urlopen(req).read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"    [miss] {e}")
        return None
    out.write_text(html, encoding="utf-8")
    print(f"  [done] page.html ({len(html):,} bytes)")
    return html


def parse(html: str):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    for table in soup.select("table.wikitable"):
        headers = [_clean(th.get_text()).lower() for th in table.select("tr th")][:4]
        if not headers or "year" not in headers[0]:
            continue
        rows = []
        for tr in table.select("tr"):
            cells = tr.find_all(["td", "th"], recursive=False)
            if len(cells) < 2:
                continue
            year_txt = cells[0].get_text(" ", strip=True)
            ym = re.match(r"\s*(\d{4})", year_txt)
            if not ym:
                continue
            name_el = cells[1].select_one("a") or cells[1]
            player = _clean(name_el.get_text(" "))
            if player:
                rows.append({"year": int(ym.group(1)), "player": player})
        if rows:
            return rows  # first winners table only
    return []


def main(force: bool = False) -> None:
    html = _fetch(force)
    rows = parse(html) if html else []
    out = raw_dir("world_soccer_poty") / "world_soccer_poty.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    yrs = sorted(r["year"] for r in rows)
    if rows:
        print(f"  Parsed {len(rows)} winners ({yrs[0]}–{yrs[-1]}); e.g. "
              + ", ".join(f"{r['year']} {r['player']}" for r in rows[-3:]))
    else:
        print("  No winners parsed")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
