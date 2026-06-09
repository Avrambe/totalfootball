"""Scrape Ballon d'Or annual rankings from Wikipedia per-year pages (1956–2025).

Career-stature signal (rating Layer G). The first wikitable on each "<year> Ballon d'Or" page
is the men's ranking (Rank / Player|Name / ... / Points). Eligibility caveat (handled by other
sources): European-only pre-1995, European-club 1995–2006, global 2007+.

Caches each year's HTML under data/raw/ballon_dor_wiki/ and emits ballon_dor.json:
  [{ "year", "rank", "player", "points" }, ...]
"""
import json
import re
import sys
import time
import urllib.request

try:
    from ._common import raw_dir
except ImportError:
    from _common import raw_dir

YEARS = range(1956, 2026)


def _clean(s: str) -> str:
    s = re.sub(r"\[[^\]]*\]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _fetch_year(year: int, force: bool):
    out = raw_dir("ballon_dor_wiki") / f"{year}.html"
    if out.exists() and not force:
        return out.read_text(encoding="utf-8", errors="ignore")
    url = f"https://en.wikipedia.org/wiki/{year}_Ballon_d%27Or"
    req = urllib.request.Request(url, headers={"User-Agent": "total-football/0.1"})
    try:
        html = urllib.request.urlopen(req).read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"    [miss] {year}: {e}")
        return None
    out.write_text(html, encoding="utf-8")
    time.sleep(0.3)  # be polite
    return html


def _parse_year(year: int, html: str):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    for table in soup.select("table.wikitable"):
        headers = [_clean(th.get_text()).lower() for th in table.select("tr th")][:6]
        if not headers or "rank" not in headers[0]:
            continue
        # need a name column
        name_idx = next((i for i, h in enumerate(headers) if h in ("player", "name")), None)
        if name_idx is None:
            continue
        pts_idx = next((i for i, h in enumerate(headers) if "point" in h), None)
        rows = []
        for tr in table.select("tr"):
            cells = tr.find_all(["td", "th"], recursive=False)
            if len(cells) <= name_idx:
                continue
            texts = [_clean(c.get_text(" ")) for c in cells]
            if not re.match(r"^\d+", texts[0]):  # rank must lead
                continue
            rank = int(re.match(r"^\d+", texts[0]).group())
            # First anchor is often an empty flag-icon link; take the first with real text.
            player = ""
            for a in cells[name_idx].find_all("a"):
                player = _clean(a.get_text())
                if player:
                    break
            if not player:
                player = _clean(cells[name_idx].get_text(" "))
            if not player:
                continue
            pts = None
            if pts_idx is not None and len(texts) > pts_idx:
                pm = re.search(r"\d+", texts[pts_idx])
                pts = int(pm.group()) if pm else None
            rows.append({"year": year, "rank": rank, "player": player, "points": pts})
        if rows:
            return rows  # first ranking table only (men's)
    return []


def main(force: bool = False) -> None:
    all_rows, hit = [], 0
    for year in YEARS:
        html = _fetch_year(year, force)
        if not html:
            continue
        rows = _parse_year(year, html)
        if rows:
            hit += 1
            all_rows.extend(rows)
    out = raw_dir("ballon_dor_wiki") / "ballon_dor.json"
    out.write_text(json.dumps(all_rows, ensure_ascii=False, indent=1), encoding="utf-8")
    yrs = sorted({r["year"] for r in all_rows})
    print(f"  Parsed {len(all_rows)} ranking rows across {hit} years "
          f"({yrs[0]}–{yrs[-1]} if continuous)")
    winners = [r for r in all_rows if r["rank"] == 1]
    print(f"  Winners captured: {len(winners)}; e.g. "
          + ", ".join(f"{w['year']} {w['player']}" for w in winners[-3:]))


if __name__ == "__main__":
    main(force="--force" in sys.argv)
