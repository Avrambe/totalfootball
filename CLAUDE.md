# Total Football — Project Context

## What this is
A World Cup squad-builder web game (working title "Total Football"), the soccer counterpart to
the user's baseball game **162-0**. Spin to draw a country (+ a year in two of three eras), draft
real players into an 11-slot formation, run the squad through a simulated knockout tournament vs
real historical World Cup teams. Scored on goal differential, progression tier, and Elo (the
leaderboard chase number). Web-first; iOS via Capacitor and 6-language i18n come later.

The full design spec lives at `~/Downloads/World Cup Game Spec.md`. The approved build plan is at
`~/.claude/plans/cosmic-purring-quasar.md`.

## Architecture
- **`pipeline/`** — Python, build-time. Downloads multiple data sources into `data/raw/`,
  computes the layered "WC Rating" (1–99) per player-tournament card, emits flat JSON
  (`app/public/cards.json`, `teams.json`, `elo.json`). Ratings are precomputed, never client-side.
- **`app/`** — React + esbuild (single `build.js`, no framework). Fetches the generated JSON at
  runtime into a global, gated by `dataReady`. `src/` is split into modules (positions, spin,
  formation, engine, scoring, screens, share, leaderboard, i18n).
- **`data/`** — gitignored raw downloads + intermediates (regenerable).

## Key design decisions (see spec for full detail)
- 3 eras (2026 Only / Modern 1970+ / All-Time 1930+) × 2 modes (Classic / Diehard) = 6 configs.
- **One surface, random seeded bracket** (design change from spec §8): every game draws random
  opponents in the group phase with progressively stronger teams later. No fixed Daily gauntlet.
  Keep a daily leaderboard (today/week/all). Draw luck affecting Elo is accepted by design.
- Rating is normalized within position bucket across all eras; **team strength never enters a
  player's score** (Salah on a weak Egypt still rates elite). Degrades gracefully when data is thin.
- Position data has only 4 buckets (GK/DF/MF/FW) in the source; architecture is "granular-ready"
  via per-card `eligible_positions` arrays + a `canPlay()` function.
- Match engine: Dixon-Coles double-Poisson, calibrated by mass simulation (162-0 methodology).

## Reuse from 162-0
Full repo to mine: `~/Downloads/162-0-main` (NOT the stripped `~/Downloads/162-0`). Reusable:
esbuild build, PWA (sw.js/manifest), runtime fetch loader, reel mechanic, roster/slot placement,
Supabase leaderboard (plain `fetch` to `submit_score`/`real_pct` RPCs — no JS client dep),
modeled→real percentile switchover (real at ≥18 samples), canvas share-image + share chain.
Net-new: Capacitor, i18n, and all soccer-specific logic.

## Current status (2026-06-08)
Phases 0–3 done. Phases 0–2: scaffold + plumbing, data acquisition, rating pipeline (all §3.3
sanity targets pass). Elo coverage spans EVERY men's WC participant at its tournament year
(489/489, 1930–2022) via eloratings.net year-end snapshots name-matched against their authoritative
`en.teams.tsv` dictionary — `pipeline/download/elo_full.py` → `data/raw/elo_full/elo_wc.json` →
`app/public/elo.json` (team_code → {year: Elo}); the 2026 cohort's live Elo is folded in from the
Kaggle 2026 set. Caveat: year-end snapshot is a proxy for at-WC strength.

Phase 3 (2026 cohort): `pipeline/rating/cohort_2026.py` rates all 1,245 announced 2026 squad
players from a current-form proxy — composite = blend(H club-form .60, G stature .25, base .15) ×
age factor, normalized SEPARATELY within position → 1–99, G floor applied. Layer H
(`rating/club_form.py`) is real: FBref Big-5 (preferred, incl. keeper Save%/CS%) + Transfermarkt
"player-scores" appearances (objective minutes/goals/assists only, NEVER market value),
league-tier weighted. **Data limitation:** the TM appearances dump only has game-level rows for ~14
European leagues in the 2024-26 window — MLS / Saudi / Liga MX / Brazil / Argentina have ZERO rows,
so club coverage tops out at 59%; uncovered players degrade to the 0.5 prior × age (+ stature floor
for legends). Stature lookback widened to back=3 for 2026 so the 2023 Ballon d'Or (Messi) floors
current legends in uncovered leagues. 4 debutants coded CPV/CUW/JOR/UZB, DR Congo→COD.
**Young-player floor (refinement):** caps/stature reward accumulated career, so teenagers read low.
Transfermarkt MARKET VALUE (the one forward-looking signal — exactly the youth premium that bans it
from the general pool) is blended with recent club form as a lift-only FLOOR, scoped to the young
(full at age ≤19, fading to 0 by 25), conservatively shrunk (0.78) so they keep headroom to
overperform. Lifted Yamal 86→95, Cubarsí 82→91, Pedri 89→92; low-value teen fillers untouched.
Each 2026 card also carries a `volatility` tag (0.15 youngest → 0 by 25) for the Phase 6 engine to
make young players boom-or-bust per match (rating itself stays a clean point estimate).
All sanity targets pass (Mbappé 99, Haaland 99, Bellingham 96, Messi 92; historical unchanged).
Next: Phase 4 (position engine).

## Working norms (user is non-technical)
- Explain *why*, not just *what*; flag tradeoffs. Never commit/push without explicit instruction.
- Confirm before destructive actions. Check in at the end of each phase.
