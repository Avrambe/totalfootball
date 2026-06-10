# Perfect XI

A football squad-builder game. Spin to draw a country (and, in two of three
eras, a year), draft real players into an 11-slot formation, then run the squad through a
simulated knockout tournament against real historical national teams. Scored on goal
differential, how far you advanced, and an Elo rating (the leaderboard chase number).

Soccer counterpart to **162-0**; reuses its build/deploy/share/leaderboard plumbing patterns.

## Layout

```
pipeline/   Python build-time data pipeline -> emits app/public/{cards,teams,elo}.json
app/        React + esbuild web app (fetches the generated JSON at runtime)
data/       raw source downloads + intermediates (gitignored, regenerable)
```

## Develop

```bash
# Data pipeline (Python)
python3 -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt
python pipeline/download/fjelstul.py        # download the spine dataset

# Web app (Node)
cd app && npm install && npm run build       # -> app/dist/
npx serve dist                               # preview locally
```

## Data sources & attribution

This game derives ratings from several public, factual sources. Required notices:

**Fjelstul World Cup Database.** Author: Joshua C. Fjelstul, Ph.D. © 2023 Joshua C. Fjelstul,
Ph.D. Licensed CC-BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/legalcode).
Source: https://github.com/jfjelstul/worldcup. Modifications made.

**World Football Elo Ratings.** Source: eloratings.net (and CC-BY-SA dataset mirrors).
Licensed CC-BY-SA 4.0. Modifications made.

**FBref / Sports Reference** season player statistics (Big-5 European leagues), via Kaggle
mirrors. Used build-time only to compute our own derived ratings; raw statistics are not
redistributed.

**Transfermarkt** appearance data (minutes / goals / assists) and market valuations, via the
Kaggle "player-scores" dataset (David Cariboo). Used build-time only to compute our own derived
1–99 ratings; raw data is not redistributed. For the 2026 cohort, market value is used as one
broad, **age-corrected** current-skill signal (we divide out the well-known youth resale premium
and veteran discount) so quality players in leagues we lack game-level data for are still rated.

**2026 "best players" ranking lists.** The elite of the 2026 cohort is anchored to a merge of
several published "best players entering the 2026 World Cup" rankings — ESPN, FOX Sports, NBC
Sports, 365scores, and the 2025 Ballon d'Or final ranking (the season-award list, down-weighted).
Only the factual rank positions are used, build-time, merged into our own derived rating; the
lists are not redistributed. We do **not** use EA/FIFA ratings (proprietary IP).

Ballon d'Or and World Soccer Player of the Year results are factual award data; sources cited
are France Football and World Soccer / RSSSF. For the historical cohort these awards (plus the
France Football retrospective winners) **anchor the elite rating** directly — a player's award
standing in a window around a tournament sets a scarce top-end rating, with World Cup tournament
performance used only as a fallback for players the award lists don't cover. Only the factual rank
positions are used, build-time, merged into our own derived 1–99 rating; the lists are not
redistributed. Any redistributed dataset incorporating CC-BY-SA material must itself carry CC-BY-SA.
