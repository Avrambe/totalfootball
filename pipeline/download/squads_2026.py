"""Scrape the announced 2026 FIFA World Cup squads from Wikipedia.

2026 squads are NOT in the Fjelstul DB (ends 2022) and have no 2026 WC stats yet, so this is
the spine for the 2026 cohort. Time-sensitive: squads finalize right before kickoff (~June 11).

Caches the raw HTML to data/raw/squads_2026/page.html and emits a parsed squads_2026.json:
  [{ "team": "Brazil", "players": [
       {"number","position","name","birth_date","caps","goals","club"}, ... ] }, ...]
"""
import json
import re
import sys
import urllib.request

try:
    from ._common import raw_dir
except ImportError:
    from _common import raw_dir

URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_squads"
POS_MAP = {"GK": "GK", "DF": "DF", "MF": "MF", "FW": "FW"}


def _fetch(force: bool) -> str:
    out = raw_dir("squads_2026") / "page.html"
    if out.exists() and not force:
        print(f"  [skip] page.html cached ({out.stat().st_size:,} bytes)")
        return out.read_text(encoding="utf-8", errors="ignore")
    print(f"  [get ] {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "total-football/0.1"})
    html = urllib.request.urlopen(req).read().decode("utf-8", "ignore")
    out.write_text(html, encoding="utf-8")
    print(f"  [done] page.html ({len(html):,} bytes)")
    return html


def _clean(s: str) -> str:
    s = re.sub(r"\[\d+\]", "", s)        # footnote markers
    return re.sub(r"\s+", " ", s).strip()


def parse(html: str):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    squads = []
    for table in soup.select("table.wikitable"):
        # the country is the nearest preceding h3/h2 headline
        head = table.find_previous(["h3", "h2"])
        hl = head.select_one(".mw-headline") if head else None
        team = _clean(hl.get_text()) if hl else (_clean(head.get_text()) if head else None)
        if not team:
            continue
        # header cells decide if this is a squad table
        headers = [_clean(th.get_text()).lower() for th in table.select("tr th")]
        if not any(h.startswith("pos") for h in headers):
            continue
        players = []
        for tr in table.select("tr"):
            cells = tr.find_all(["td", "th"], recursive=False)
            if len(cells) < 7:
                continue
            texts = [_clean(c.get_text(" ")) for c in cells]
            if texts[0].lower().startswith("no"):
                continue  # header row
            m = re.search(r"\b(GK|DF|MF|FW)\b", texts[1].upper())
            if not m:
                continue
            bday_el = tr.select_one(".bday")
            birth = bday_el.get_text(strip=True) if bday_el else None
            name_el = cells[2].select_one("a") or cells[2]
            name = _clean(name_el.get_text())
            if not name:
                continue
            players.append({
                "number": texts[0] if re.fullmatch(r"\d{1,3}", texts[0]) else None,
                "position": POS_MAP[m.group(1)],
                "name": name,
                "birth_date": birth,
                "caps": texts[4] if re.fullmatch(r"\d{1,3}", texts[4]) else None,
                "goals": texts[5] if re.fullmatch(r"\d{1,3}", texts[5]) else None,
                "club": texts[6],
            })
        if len(players) >= 11:  # a real squad
            squads.append({"team": team, "players": players})
    return squads


def main(force: bool = False) -> None:
    html = _fetch(force)
    squads = parse(html)
    out = raw_dir("squads_2026") / "squads_2026.json"
    out.write_text(json.dumps(squads, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(s["players"]) for s in squads)
    with_bday = sum(1 for s in squads for p in s["players"] if p["birth_date"])
    print(f"  Parsed {len(squads)} squads, {total} players ({with_bday} with birth dates)")
    if squads:
        ex = squads[0]
        print(f"  e.g. {ex['team']}: {len(ex['players'])} players; sample={ex['players'][0]}")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
