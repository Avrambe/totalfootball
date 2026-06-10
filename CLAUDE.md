# Perfect XI — Project Context

## What this is
A World Cup squad-builder web game (named "Perfect XI"; repo/folder still `total-football`), the soccer counterpart to
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

## Current status (2026-06-09)
Phases 0–10 done; Phase 11 (Capacitor/iOS) is the only remaining build phase. Phases 0–2: scaffold + plumbing, data acquisition, rating pipeline (all §3.3
sanity targets pass). Elo coverage spans EVERY men's WC participant at its tournament year
(489/489, 1930–2022) via eloratings.net year-end snapshots name-matched against their authoritative
`en.teams.tsv` dictionary — `pipeline/download/elo_full.py` → `data/raw/elo_full/elo_wc.json` →
`app/public/elo.json` (team_code → {year: Elo}); the 2026 cohort's live Elo is folded in from the
Kaggle 2026 set. Caveat: year-end snapshot is a proxy for at-WC strength.

Phase 3 (2026 cohort) — **TWO-TIER rating (Phase 3-fix overhaul).** The first pass over-rated
weak-league veterans (Konrad Laimer hit 98) because international caps masqueraded as skill and a
separate within-position percentile crowded the top. Replaced with two tiers:
- **Consensus tier (the elite)** — `pipeline/rating/consensus_2026.py`. The top is anchored to a
  weighted-Borda merge of 5 published "best entering 2026" lists (ESPN 50, FOX top-30, NBC 25,
  365scores 25, Ballon d'Or 2025 top-30 ×0.6). Merge is filtered to actual 2026 participants, then
  a scarce rank→rating curve assigns ratings: #1–3 → **97 (the ceiling — Yamal/Dembélé/Mbappé; no
  active 2026 player reaches 98/99, reserved for the historical pantheon)**, #4–5 → 96, then taper
  ~0.42/rank down to the floor. `CONSENSUS_FLOOR = 82`. A matched player's rating is taken
  DIRECTLY (no age factor — the lists already price age: Messi 92, Ronaldo 87, Salah 82).
- **Composite tier (everyone else, ~1,100)** — `cohort_2026.py`. De-inflated proxy:
  composite = blend(H club-form .45, **M age-corrected market value .30**, G stature .15, base .10)
  × age factor; caps/international-standing REMOVED. M divides raw Transfermarkt market value by an
  `_age_premium(age)` curve built from the cohort's own median-MV-by-age (removes the youth resale
  premium + veteran discount) → a current-skill proxy that **rescues quality in uncovered leagues**
  (Neymar 79, Kessié 77, Toney 81). Each card's composite percentile is then **quantile-matched to
  the pooled HISTORICAL per-position distribution** (below the floor) for real cross-era
  comparability, and capped at `CONSENSUS_FLOOR−1 = 81` so no non-listed player outranks a listed
  one. `build_cards(hist_by_pos)` receives the historical ratings from `build_cards.py`.
The raw-MV youth FLOOR is gone (consensus + age-corrected M handle youth); the `volatility` tag is
KEPT (0.15 youngest → 0 by 25; Phase-6 boom/bust channel). Layer H (`rating/club_form.py`) unchanged:
FBref Big-5 + TM appearances (objective minutes/goals/assists), league-tier weighted, club coverage
64%. 4 debutants coded CPV/CUW/JOR/UZB, DR Congo→COD. Results: Yamal/Dembélé/Mbappé 97, Kane/Pedri
96, Vitinha/Olise 95, Haaland 94, Vinícius 93, Bellingham 90, Messi 92, Ronaldo 87, Salah 82; Laimer
dropped 98→81, Almoez Ali→55, Beiranvand→17. Scarcity: 3 at 97, 7 at 95+, 12 at 93+.

Phase 3-fix-B (historical two-tier) — the mirror of the Laimer fix, on the HISTORICAL side. Drafting
2022 Argentina showed too many near-perfect cards (Messi 98, E. Martínez 98, Álvarez 96, Enzo 94);
auditing found the historical path minted 170 cards at 98+ because the rating was driven by hot
two-week WORLD-CUP performance (Layer P) spread linearly across 1–99, while awards (Layer G) only
acted as a weak floor. Replaced with a **three-signal MAX** in `pipeline/rating/combine.py`:
`wc_rating = max(awards_anchor, honor_floor, capped_performance)`.
- **Awards anchor (override)** — `pipeline/rating/stature_anchor.py`, the historical analogue of
  `consensus_2026.py`. Best Ballon d'Or rank (POTY/France-Football retro = rank 1) in a **±2-year
  window** sets a scarce 80–99 curve; **distinct win-years in a ±6 window** is the dominance signal
  that reaches 99 (serial winner). No age factor (awards price age). The ±2 window is what makes the
  user's example work: 2018±2 catches Ronaldo (2016/17 BdO) AND Messi (2019 BdO) → both 99. Players
  with no award standing return None and fall through. Supersedes the old Layer-G floor (g_label kept
  for display).
- **WC-honor floor** — a player who EARNED a tournament honor (component B: Golden Ball 1.0 → 95,
  Golden Boot/Glove .90 → 92, Silver Ball .75 → 90, Silver Boot/Best-Young-Player .70 → 88, Bronze
  .55 → 86) gets a real floor (tops at 95). Driven by the HONOR (recognition), not raw goals — so a
  variance two-goal striker on a strong team is NOT lifted. This is the user's Zidane-2006 refinement
  (Golden Ball → 95 despite a past-peak award standing).
- **Capped WC-performance** — the Layer-P composite × age factor, normalized within position, then
  soft-capped: ≤79 where the player had a real **award opportunity** (so non-listed role-players settle
  "very good"), ≤95 in **award-less profiles** (`year<1956` OR `year<1995 and team not in UEFA` — the
  Euro-only Ballon d'Or era) so early-era greats still reach the elite band. `UEFA` set + `_perf_cap`
  + `_honor_floor` live in combine.py. **Phase Ratings-fix (2026-06-09): the cap is now a soft knee
  ramp, not a hard `min()` clamp.** The old hard clamp collapsed the whole top tail of every position
  onto the cap value — **1,483 historical cards landed on exactly 79** (75–79 band held 17.5% of the
  cohort). `_soft_cap(perf, cap)` (KNEE_WIDTH=16) keeps scores at/below `knee = cap−16` at their exact
  value (no median shift) and squeezes the tail [knee, 99] into [knee, cap], so the spike dissolves into
  a smooth ramp. Result: the 70–79 lump is gone; both cohorts now ramp smoothly (peak ~9–10% at 65–69).
  Because the 2026 composite tier quantile-matches to this historical distribution, **2026 de-clustered
  for free** (no `_calibrate` change needed). Anchor/honor tiers and all named sanity anchors unchanged.
Results: historical 98+ collapsed 170→46 (99: 30), ~2–4 per tournament and all genuine greats
(1990 Maradona/van Basten/Gullit/Matthäus; 2018 Messi/Ronaldo/Lewandowski/Modrić). 2022 Argentina now
reads Messi 99 / E. Martínez 92 (Golden Glove) / Álvarez+Lautaro 89 / Enzo 88 (Best Young Player) /
supporting cast 79. Pre-1956 standout reaches 97 (award-less reach). Sanity: Maradona 1986 = 99 (age-
decline to 84 by 1994), Zidane 2006 = 95, Salah 92. All targets pass; **2026 cohort UNCHANGED**
(separate path). atk/def already derive from final `wc_rating`, so a quiet-tournament 99 plays like a
99 (the plan's Phase-6 engine note is moot). Tuning lives in `stature_anchor.py` (windows, curve) and
`combine.py` (caps, honor floors, UEFA set); each card carries a `tier` field (anchor/honor/perf/2026)
for debug.

Phase 4 (position engine): `app/src/positions/` — 14-token taxonomy (`taxonomy.js`:
GK; CB/LB/RB/LWB/RWB; CDM/CM/CAM/LM/RM; LW/RW/ST, each with line+zone+depth), formations-as-data
(`formations.js`: 8 shapes 4-3-3…5-4-1, granular slots + bipartite `formationsHolding` for the
Phase-5 tightening dropdown), and `canPlay(player, slot)` (`canPlay.js`) as the single source of
truth: line floor (cross-line = only hard no) → exact-token/bucket-only = 1.0 → off-position penalty
scaled by zone/depth, floored at `OFF_POS_FLOOR=0.88` (one tunable, zero-able). The pipeline
(`cohort_2026.py`) now populates 2026 cards' `eligible_positions` with granular tokens via
`SUB_TO_TOKEN`: 726 cards carry a granular token, and **73 cross-line versatile players** (Kimmich
DF+CDM, Maeda MF+LW, Almirón MF+RW) get a multi-line array — granular ADDS a line, never replaces the
rated bucket (rating was normalized within bucket). Historical cards stay bucket-only (0 granular).
Verify: `node app/src/positions/verify.mjs` (24/24 pass).

Phase 5 (draft UX): the app is now a real multi-screen game. `src/theme.js` holds shared design
tokens (C palette, FONTS, splash) — extracted to break an app.jsx↔screens import cycle that blanked
the page; every screen imports from theme.js, never from app.jsx. `src/app.jsx` is the router
(title→draft→result) behind the dataReady gate. Screens: `Title.jsx` (3 eras × 2 modes + PLAY),
`Draft.jsx` (the loop: reel → green/yellow/grey offer → tap → pick-the-spot on the board → place →
auto-spin → 11/11 → RUN IT to the Result stub), `Result.jsx` (Phase-5 stub: XI by line + nation
count + "engine arrives in Phase 6"). Pure logic in `src/formation/` (`offer.js`: offerState,
seat with user pins, validSpots, openLines; `tighten.js`: reasonString) and `src/spin/`
(`pools.js` era/validTargets, `reel.js` tumble). `positions/formations.js` slots gained {x,y} pitch
coords (LINE_Y bands). Board is responsive: desktop (≥760px) = absolute-positioned PitchBoard at
formation coords; narrow = line-grouped rows (LineBoard). Classic shows stats + effectiveness %;
Diehard shows name+position only. 2026 era is team-only (no year box); Modern/All-Time draw year+team.
Verify: `node app/src/draft/verify.mjs` (17/17). **Plumbing fix:** `public/sw.js` was cache-first on
the stable-named `bundle.js`, pinning stale builds forever (162-0 hashes its bundle; we don't) —
switched to network-first w/ cache fallback, CACHE bumped tf-v1→tf-v2.

Phase 5b (draft UX refinements, post-Phase-5 user feedback): four fixes.
(1) **Separate country/year respins** — one RESPIN used to reroll both axes; now `respins` is
`{team:3, year:3}` independent counts. `spin/reel.js` takes `axes:{team,year}` (a locked axis holds
the target value instead of tumbling, 162-0's fixFr/fixDec pattern); `spin/pools.js` `validTargets`
gained a `fix` arg (`{teamCode}` holds country / `{year}` holds year) + `canRespin(...,current)`
(true only if an OTHER squad exists) to disable a dead axis. Draft shows two buttons RESPIN COUNTRY /
RESPIN YEAR with live counts; 2026 era (no year axis) shows only country. Verified live: year-respin
held Argentina & swapped 1994→1962 (YEAR 3→2, COUNTRY stayed 3); country-respin held 1962 & swapped
Argentina→Ghana (COUNTRY 3→2, YEAR stayed 2); 2026 = country-only.
(2) **Flags** (pulled forward from Phase 10) — bundled flag-icons SVGs served at `/flags/<TEAM_CODE>.svg`
(named by team_code, so runtime needs NO map/dep). `data/flags.js` `FLAG_KEY` (88 codes→flag-icons
keys: ENG→gb-eng/SCO→gb-sct/WAL→gb-wls/NIR→gb-nir, DEU→de, CSK→cz) drives `scripts/build_flags.mjs`
(`npm run flags`, flag-icons is a devDependency); 4 defunct nations (SUN/DDR/YUG/SCG) are hand-authored
SVGs in `public/flags/`. `components/Flag.jsx` = `<img>` w/ onError→text-code fallback, used on offer
cards, board chips, reel box, offer header, placing banner. 88 SVGs in dist; `build.js` already copies.
(3) **Placing banner + auto-scroll** — tapping an offered player now shows a "PLACING [flag] Name · POS"
banner on the board (overlay on PitchBoard, inline on LineBoard) so you see WHO, not just where;
`util/scroll.js` ports 162-0's `smoothScrollToEl` (easeInOutQuad) — board scrolls into view on tap,
offer scrolls into view on the post-place auto-spin.
(4) **Pitch markings fixed** — PitchBoard now a conventional single-team lineup: halfway line +
center circle at the TOP (the attacking edge, by the forwards), penalty box + 6-yard box + penalty
arc (the "D") at the BOTTOM around the keeper. LineBoard (narrow) has no markings by design.
Verify: `node app/src/draft/verify.mjs` (30/30 — added fixed-axis validTargets/canRespin asserts) +
`node app/src/positions/verify.mjs` (24/24); all four items confirmed in live desktop preview.

Phase 5c (formation row layout fix): formations are now drawn with rows following the formation
NAME, not the GK/DF/MF/FW taxonomy line — so a "4-2-3-1" reads as FOUR outfield bands (4 def / 2
holding / 3 attacking / 1 forward) the way soccer formations are conventionally shown, even though
the holding (CDM) and attacking (CAM/RM/LM) bands are both "MF" in our taxonomy. `positions/
formations.js` `makeFormation` parses the name's digit groups and assigns each slot's pitch `y` by
band (the token arrays are written defense->attack so digit groups consume slots in order); slot
`line`/`id` (eligibility) are unchanged. Both boards updated to read bands: `Draft.jsx` PitchBoard
already used slot.x/y; LineBoard (narrow) now groups rows by distinct slot.y (attack top -> GK
bottom) instead of by taxonomy line. Also flipped left/right: token arrays are written right->left
within each band (RB, CB, CB, LB), so `makeFormation` maps the first slot of a band to high x
(`x = (size - k)/(size + 1)`) — right side renders on the right, left on the left, as conventionally
drawn. Confirmed in preview at desktop (1100px) and narrow (600px).

Phase 6 (match engine + calibration): "RUN IT" now plays a real simulated World Cup. The engine is
in `app/src/engine/`: `params.js` (all tuning constants in one place), `poisson.js` (Dixon-Coles
double-Poisson — `poissonPmf`, `scoreMatrix` with the τ low-score correction, `sampleScore`),
`squad.js` (aggregate an XI to attack/defense as the POS_MULT-weighted MEAN of card atk/def ×
canPlay effectiveness; `bestXI` for opponents), `match.js` (`playMatch` with ET + penalties for
knockout ties), `bracket.js` (Elo-seeded opponent draw + group + knockout, returns the result
object), `index.js` (`runTournament(seating, formationName, era)` public surface).
**Goal model:** per side `λ = BASE_GOALS × exp(STEEP × ((att−MEAN_ATK) − (oppDef−MEAN_DEF)))`,
clamped to LAMBDA_CLAMP, then a Dixon-Coles score matrix sampled. The **centering** against cohort
means (MEAN_ATK=0.66, MEAN_DEF=0.60) is essential — quality is a mean in ~[0.4,0.97], not centered
at 0, so without subtracting the means the exp() explodes goal counts. **Elo feeds opponent SEEDING
only** (later rounds draw from progressively higher Elo tiers via ELO_BANDS), never the goal model.
**Calibrated constants** (baked as defaults, env-overridable for sweeps via `CAL_STEEP`/`CAL_BASE`/
`CAL_LMAX`...): STEEP=6.3, BASE_GOALS=0.90, LAMBDA_CLAMP=[0.04, 3.3], RHO=−0.05. The λ-upper-clamp
is the lever that caps blowout scorelines without changing WHO wins (decouples goal level from the
win curve). **Calibration results** (all spec §8 targets land): near-perfect dream-team wins the
tournament ~69%, a typical engaged draft ~12%, goals/match ≈2.7, upsets frequent. Calibration is
grounded in reality via `calibrate.mjs`, which simulates actual drafts (engaged draft ≈ attack
0.82/def 0.73; careless ≈ 0.50/0.49; dream team ≈ 0.96) rather than arbitrary percentiles.
**Phase 6b — real 2026 World Cup format:** 12 groups of 4 (48 teams); top 2 of each group (24) PLUS
the 8 best third-place teams = 32 advance → Round of 32 → R16 → QF → SF → Final (5 KO rounds). The
third-place cut is set by simulating ALL 12 groups (cheap) and comparing your 3rd-place record
(pts→gd→gf) against the field's other thirds, so a stronger 3rd-place showing is genuinely more
likely to go through. The 11 other groups draw opponents freely (reuse across the field allowed, deduped
only within each group) so YOUR `used` set stays duplicate-free and small pools (2026 = exactly 48
squads) can't be exhausted. A small-pool guard scales groups/thirds-quota when a pool can't fill 12.
Tiers: Group Stage Exit / Round of 32 / Round of 16 / Quarterfinalists / Semifinalists / Runner-Up /
Champions. Tooling: `node app/src/engine/verify.mjs` (16/16 — pmf sums, matrix normalized, τ lifts low
scores, dominant beats weak but upsets happen, bracket always completes with a valid tier, KO reaches
5 rounds starting at Round of 32, a 3rd-place finish can advance via best-thirds) and `node
app/src/engine/calibrate.mjs` (prints the calibration table). Wired in-app: `Draft.jsx` onComplete
hands `{seating, formationName}` to `app.jsx`, which calls `runTournament` and renders `Result.jsx`
(full rewrite from the Phase-5 stub) — real bracket: tier headline, era/mode/nations line, goal
differential line, group + knockout rows with flags and color-coded scorelines (green win / red
loss / chalk draw) + "on pens"/"after extra time" notes. Smoke-tested live (All-Time · Classic):
completed an 11-player draft → RUN IT → Result rendered a real bracket (Round of 16 tier, group L/W/W
then a R16 penalty loss) with no console errors. New i18n keys: result.groupStage/knockout/byPenalties/
afterExtraTime/scored/conceded/differential.

Phase 7 (scoring: Elo + letter grade): every game now yields a per-game **Elo** (the leaderboard
chase number, Phase 9's sort key) and, for Champions only, a letter **grade** (S+/S/A/B). Logic in
`app/src/scoring/`: `params.js` (all Elo + grade constants in one place, env-overridable via `SC_*`),
`score.js` (`matchDelta`, `scoreTournament(result)` → `{elo, eloDelta, grade}`, `grade`),
`verify.mjs` (11/11), `calibrate.mjs` (per-tier Elo distribution + champion-distribution grade bands
+ anti-farm check). **Elo model:** start every game at START_ELO=1500 (per-game, NOT persistent);
`finalElo = 1500 + Σ(per-match deltas)`. Each match delta = result × opponent-strength × diminishing-
margin, where opponent strength `s` = the opponent's **national-team Elo percentile** (0..1) in the
era's field — `bracket.js` now attaches `strength` to every `opponentPool` entry and stamps
`oppStrength` on each group + knockout match record. Win = `K_WIN·(OPP_BASE+OPP_SPAN·s)·(WIN_BASE+
(1−WIN_BASE)·dim(m))`; draw = `K_DRAW·(s−0.5)·2`; loss = `−K_LOSS·(LOSS_BASE+LOSS_SPAN·(1−s))·
(LOSS_FLOOR+(1−LOSS_FLOOR)·dim(m))`; `dim(m)=1−exp(−(m−1)/MARGIN_TAU)` saturates the margin so
blowout-farming a weak side can't beat a tight win over a great one (anti-farm: a 2-0 vs a top side
out-scores an 8-0 vs a minnow — verified). **Calibrated constants** (baked defaults): K_WIN=38,
K_LOSS=32, K_DRAW=10, OPP_BASE=0.55, OPP_SPAN=0.9, WIN_BASE=0.6, MARGIN_TAU=2.2, LOSS_BASE=0.5,
LOSS_SPAN=0.8, LOSS_FLOOR=0.5. **Results** (mean finalElo, tiers strictly ordered): near-perfect
champion ≈1740 (matches spec §7's "Elo 1740 / S+" example), median champion ≈1698, runner-up
≈1654–1694, QF low-1600s, group exit ≤1481. **Grade bands** (from the champion finalElo distribution):
S+ ≥1735, S ≥1700, A ≥1665, else B; non-champions grade null. Wired via `index.js` (merges
`scoreTournament(result)` into the `runTournament` return). `Result.jsx` shows an **Elo line**
(`Elo {elo}` + green/red delta) and a Champions-only **grade badge** (gold-bordered letter by the
tier headline). Smoke-tested live: a 2026·Classic draft → RUN IT → Result showed "Elo 1573 +73"
on a Round-of-16 finish (no badge, correct for non-champions); the Champions grade path verified in
node (Brazil 1994 → Champions, Elo 1733 grade S / 1763 grade S+). Engine verify still 16/16.

Phase 8 (polished result screen + shareable image): the Result screen now shows **your drafted XI on a
pitch** (between the header and the scorelines) plus a **SHARE** button; a generated PNG result card is
offered via the proven 162-0 share chain. New `app/src/components/SquadPitch.jsx` — a read-only pitch
(desktop = absolute chips at formation `slot.{x,y}` with the same markings as the draft board; narrow
<760px = line-grouped rows), props `{seating, formationName, diehard}`, ratings shown only in Classic.
`app/src/util/name.js` — `lastName()` extracted from Draft.jsx (now imported by both Draft + SquadPitch).
`app/src/engine/index.js` now puts `formationName` on the returned result so the screen/card can lay out
the pitch. **Share card** (`app/src/share/shareImage.js`, `generateShareImage({result,seating,
formationName,config})→Promise<Blob>`): adapts 162-0's canvas technique (await `document.fonts.ready`,
`S=2` retina, `drawPill`, `toBlob`). Layout top→bottom: PERFECT XI header → **mode pill**
(CLASSIC/EXPERT) → tier ("where you made it") → Champions-only **grade badge** → Elo (+delta) + goal
differential → **mini pitch** of the XI (each chip = flag + last name + position token, **NO ratings**,
per the user) → footer. Flags preloaded from `/flags/{code}.svg` into a Map (onerror→text-code fallback),
gated by a `FLAGS_ON_CARD` const. Intentionally **no scorelines on the card** (they stay on the screen).
`app/src/share/Share.jsx` — overlay that builds the blob on open and offers native-share (with image,
gated by `navigator.canShare({files})`) → copy-image (clipboard.write ClipboardItem → falls back to
download) → save (download `<a>`) → text social links (X/Facebook/Bluesky/WhatsApp/Telegram/Reddit/
Messages). `SHARE_URL` is an empty placeholder (no domain yet; links degrade gracefully). **"Diehard"
renamed to "Expert"** — display label only (en.json `mode.diehard`/`.desc`); the internal config key
stays `diehard` to avoid rippling through pools/draft/engine. New i18n: `share.*` keys. Smoke-tested
live (2026·Classic): completed a draft → RUN IT → Result showed the XI on the pitch + group/knockout
scorelines + Elo; SHARE generated a 1040×1760 PNG card with the mode pill, tier, Elo, differential, and
11 flag+name+position chips and no ratings; verified both the desktop pitch and the narrow line-row
fallback. Engine verify 16/16, scoring verify 11/11. NOTE: the user has DEFERRED selection-page UI/UX
touch-ups to after the whole product is built.

Phase 9 (Supabase daily leaderboard, sorted by Elo): every completed run can be POSTED to a shared
board and browsed by era × mode × timeframe (today/week/all-time), sorted by Elo — the 162-0
leaderboard pattern ported (plain `fetch`, no JS client dep). **Backend** (`SUPABASE.sql`, repo root —
the user runs it in a NEW Supabase project): a `scores` table (config, name, elo, tier, grade,
goals_for/against/diff, squad jsonb, client_key, created_at), RLS with anon SELECT-only, a unique index
on `client_key` (idempotency), and two `SECURITY DEFINER` RPCs — `submit_score(...)` (the only write
path; trims/clamps name to 24, defaults "Anon", `INSERT ... ON CONFLICT (client_key) DO NOTHING`) and
`real_pct(p_config, p_elo)` (returns the "top X%" int, null until a config has ≥18 scores — the
real-only switchover; the modeled baseline is deferred). **Client** (`app/src/leaderboard/board.js`):
`SB_URL`/`SB_KEY` placeholder consts (user pastes Project URL + publishable anon key — same posture as
162-0, no other secrets), `boardConfigured()`, `configKey(era,mode)=`${era}-${mode}``, `packSquad`
(compact `{formationName, players:{[slotId]:{name,team_code,year,wc_rating}}}` for the viewer), and
`submitScore`/`topScores`/`realPct` (POST `rpc/submit_score`, GET `scores?...&order=elo.desc,
created_at.asc&limit=25` + `created_at=gte.` for today/week, POST `rpc/real_pct`). **Screens:**
`Leaderboard.jsx` (era×mode×timeframe tab rows, ranked rows, tap a row → overlay rendering the stored
squad via the read-only `SquadPitch`, ratings hidden in diehard); `Title.jsx` + `Result.jsx` gained a
LEADERBOARD entry; `Result.jsx` gained a **PostBlock** (name input + POST, session-guarded by
`gamePosted` lifted to `app.jsx`, shows "Top X%" only when `realPct` is non-null, three states:
not-configured / posted / input). `app.jsx` mints a per-run `clientKey` (crypto.randomUUID) and routes
title⇄leaderboard⇄result. New i18n `leaderboard.*` keys. **Smoke-tested live** (board NOT yet
configured): LEADERBOARD button on Title; the Leaderboard screen renders all tab rows + the graceful
"Could not reach the leaderboard" state; a completed 2026·Classic run (Semifinalists, Elo 1627 +127)
showed the PostBlock in its "Leaderboard coming soon." not-configured state with no errors. **Handoff
pending:** the user must create the Supabase project, run `SUPABASE.sql`, and paste URL + key into
`board.js` before a live round-trip is possible (account action I can't do). Next: Phase 10 (i18n fill +
flags) / Phase 11 (Capacitor/iOS).

Phase 10 (i18n fill — 5 languages + full country-name localization + switcher): the game now ships in
all six declared locales (en/es/fr/pt/de/it). Flags were already 100% done in Phase 5b, so this phase was
languages only. **i18n hub** (`app/src/i18n/index.js`) gained: `teamName(code)` (fallback chain
`strings["team."+code] || GAME.teams[code]?.name || code` — a locale missing a country falls back to the
English `teams.json` name, never a raw key); `tierName(tier)`/`roundName(round)` (map the engine's raw
English tier/round strings via `TIER_KEY`/`ROUND_KEY` to i18n keys, raw-string fallback); `detectLocale()`
(first 2 chars of `navigator.language` matched to LOCALES, else "en"); `storedLocale()`/`setStoredLocale()`
(`localStorage` key `tf-locale`, try/catch for privacy mode). **Boot + switching** (`app.jsx`): boots from
`storedLocale() || detectLocale()`, `Promise.all([loadLocale(initial), loadGameData()])`; a root `lang`
state + `onSetLang(loc)` (loadLocale → setStoredLocale → setLang) re-renders the tree on switch (needed
because `t()` reads a module global). **Switcher UI** (`Title.jsx`): a row of six endonym chips (English ·
Español · Français · Português · Deutsch · Italiano), active = gold; lives on Title only (pick language
before playing — sufficient). **Render sites routed through i18n:** `spin/pools.js` builds pool entries
with `name: teamName(teamCode)` (reel tumble frames + offer header localize for free); `Result.jsx` uses
`tierName`/`roundName`/`teamName` for the headline, knockout round labels, and opponent names;
`share/shareImage.js` localizes the canvas (tier via `tierName().toUpperCase()`, mode pill via
`t("mode."+...)`, subtitle/ELO/diff/footer via `share.card*` keys); `share/Share.jsx` localizes the
social-share sentence via a templated `share.text` key (`{tier}`/`{mode}`/`{elo}` vars, tier via
`tierName`) — this was a gap caught in verification (it had been hardcoded English) and fixed.
**Content:** `en.json` stays the canonical key set (88 keys incl. new `label.era`/`label.mode`,
`draft.placedCount`, `round.*`, `share.text`; English country names come from `teams.json`, not duplicated
into en.json). The five new locale files (`es/fr/pt/de/it.json`) each carry all en.json keys translated
**plus** an 88-entry `team.<CODE>` block of localized country names (incl. defunct SUN/DDR/CSK/YUG/SCG/
IDN/Zaire and the home nations); `app.title` is "Perfect XI" (brand) everywhere. Translations are
model-authored (natural football terminology) — **a native-speaker review before public launch is the
recommended follow-up** (flagged to the user). `build.js` already copies `i18n/`, so no build change.
**Verified live** (Italian, 2026·Classic): switcher re-localizes UI chrome + era/mode cards + tagline +
draft chrome + country names + positions; localStorage persists across reload; auto-detect logic confirmed
(sandbox reports en-US, so verified via the function + stored path); Result screen showed a localized tier
headline ("Quarti di finale"), round labels ("Sedicesimi/Ottavi/Quarti"), opponent names ("Egitto/Costa
d'Avorio/Svezia/Turchia/Germania"), and "ai rigori"; the SHARE card rendered the localized
subtitle/mode-pill ("CLASSICA")/tier/Elo/differential/tagline with accented glyphs, and the social-share
sentence is now fully Italian with no English leak. `npm run build` clean; all 4 node verify suites still
pass (positions 24/24, draft 30/30, engine 16/16, scoring 11/11). Out of scope (later): native-speaker
translation review; an in-Draft/Result switcher (Title-only is enough now). Next: Phase 11 (Capacitor/iOS).

Phase Style (playing styles — a real pre-tournament skill choice): after drafting the XI the player
picks a **playing style** (`Style.jsx`, a dropdown) that modestly shifts match strength. All logic +
magnitudes live in `app/src/engine/style.js`. Eight options: **Balanced** (true no-op default) +
**possession, counter, press, direct, wing, total, positional** (Park the Bus was dropped — it could
never win in a format where you must *win* knockout games). Three bounded levers, deliberately small
("style is seasoning, roster quality is the meal" — the goal model applies exp(STEEP·Δ) with STEEP≈6.3,
so a few-percent shift already moves outcomes): **(1) squad-fit** ±SQUAD_CAP (0.025) — how well your XI's
ratings sit at the SLOTS a style cares about (per-position weights `POS_WEIGHTS`, keyed off the slot a
player occupies so it works for every era incl. bucket-only historical cards), plus formation
compatibility (`FORMATION_FIT`); **(2) matchup tilt** ±MATCH_CAP (0.018) — your style vs the opponent's
emergent style via an antisymmetric rock-paper-scissors matrix; **(3) age/stamina depressor** −STAMINA_CAP
(0.02) on high-energy styles (press/total/wing) scaled by squad age. The fit boost is applied **equally to
attack and defense** (a style that suits the squad makes the whole team click; a side-split would hand
"both-sides" styles a structural edge unrelated to roster fit).

**Phase Style-3 (the rework that made style selection a genuine skill):** play-testing showed only
counter & press were ever the best pick. Diagnosed three root causes and fixed all: (1) removed the
attack/defense SIDE split (the "both-sides" leak — boost is now two-way); (2) **field-centered the
matchup** (`fieldMatchup(styleCounts)` in style.js, wired through `bracket.js`'s `fieldMatchupFor(era)` →
`adjustForMatchup`): the raw matrix is zero-sum *pairwise* but the opponent field isn't uniform, so each
style's multiplier is divided by its own field-average → nets to 1.0 across the field (you gain vs some
opponents, lose vs others, **no standing edge** — flavor, not a free lunch); (3) **sharpened POS_WEIGHTS**
so each style uniquely owns a slot-combination (possession owns CM+AM, positional owns CB+FB, press owns
DM+W+ST, counter is wide+sharp-forwards, direct is narrow target-man, wing owns FB+W) — this de-correlated
the "cousin" styles so two styles on a shared formation mutually penalize each other; and **redefined
Total Football as an EVENNESS reward** (its `fitScore` branch rewards a TIGHT rating spread = no weak
link, not a weighted-mean spike — a genuinely orthogonal niche: the deep, even squad wants Total, a spiky
squad wants its matching spike style). **Acceptance test = `node app/src/engine/style_analysis.mjs`**: it
builds a per-style "archetype" roster (strong exactly where that style's weights are high, equal budget,
Total gets a FLAT squad) and runs every style on every archetype at N=8000 champion%. Result: **every
style now wins its own archetype and none is never-best** (the "redundant → drop?" line is empty) — the
user's exact bar. Calibration (`calibrate.mjs`) still holds §8 targets (near-perfect champion ~70%, median
~11%, ~2.7 goals/match, frequent upsets) and the best-vs-worst-style swing on a fixed dream team stays
single-digit (~6.5 champion-% pts). Opponent emergent styles are shown on the Result screen. All 4 verify
suites pass (engine 28/28 incl. new directionality + field-centered-matchup asserts). Tuning constants
(SQUAD_CAP/MATCH_CAP/STAMINA_CAP/W_FIT/W_FORM/REL_SCALE/REF_SPREAD/SPREAD_SCALE/POS_WEIGHTS) all live at
the top of `style.js`.

**Phase UX-4 (move placed players + readable narrow board):** two draft-board improvements, app-layer
only. **(A) Manage a placed XI.** Tapping an already-placed player now opens a MOVE flow (gold "MOVING"
banner): his **current** slot is highlighted gold with its effectiveness %, and every slot he could move
to shows as green (`open` — empty & the rest still seat) or yellow (`bump` — occupied but the incumbent
can be re-seated in his line); tapping the current slot cancels, tapping a target moves him (bumping a
displaceable incumbent). Logic in `offer.js` `moveSpots(card, placed, formationName, pins)` (mirrors
`placementSpots`, reuses canPlay/assign/seat). `picking` gained a `mode` ("place"|"move"); SlotChip's
card branch is now a tappable `<button>` (`onPlacedTap`). **Least-degradation re-seat on formation
change:** `bestLineup(placed, formationName, prevTokenById)` in offer.js runs a **Hungarian
(Kuhn–Munkres) max-weight assignment** over canPlay effectiveness (ineligible = BIG cost; padded square
with 0-cost dummies), with a small EPS continuity bonus when a candidate slot's token matches the
player's previous token — so a formation switch keeps everyone at their best fit, ties break to the
prior position, and two players contending for one spot resolve to the globally optimal lineup (the
user can hand-edit after). `switchFormation` now calls `bestLineup`; manual picks still use the
pin-honoring `seat`, so we only re-optimize on a formation *change*, not after every pick. **(B)
Readable narrow board.** `LineBoard` chip width is computed from the widest band + viewport
(GAP=5/OUTER=16/ROWPAD=12/MIN=50/MAX=78) with `flexWrap:"nowrap"`, so a back-five sits on ONE row, 5
across (font shrinks below width 64); each band row is wrapped in a faint bordered box so formation
lines read as units. Verify: `node app/src/draft/verify.mjs` (50/50 — added bestLineup-optimality,
continuity-tiebreak, and moveSpots asserts) + `node app/src/positions/verify.mjs` (24/24). Confirmed
live (iPhone 390×844): 5-4-1 back-five on one readable row; tapping KDB showed current CM 97% + move
targets LM/RM 91%, move worked; 5-4-1→4-3-3 re-seated KDB RM(91% off-pos)→CM(97% natural).

**Phase Respin (single fungible respin pool), 2026-06-10:** the rigid 3-country + 3-year split is now
ONE shared pool of `RESPINS_PER_DRAFT = 6` (a module const in `Draft.jsx`), spendable on country OR
year, one at a time; seeded only on a fresh draft (the post-place auto-spin keeps `{reset:false}` so
the budget stays scarce across all 11 picks). 2026 era (no year axis) spends all 6 on country. UI shows
one "Respins left: {n}" line (`draft.respinsLeft`, added to all 6 locales); pools.js draw/eligibility
logic unchanged.

**Phase Swap (two placed players exchange slots), 2026-06-10:** the MOVE flow now supports a direct
SWAP. In `offer.js` `moveSpots`, an occupied target slot is offered as `kind:"swap"` (blue, `#5ab1ff`)
when the two are **mutually eligible** — the mover fits the target's slot (already required) AND the
occupant fits the mover's current slot (`canPlay(occupant, mySlot).eligible`). Swap takes **priority
over bump**; the old `bump` (relocate the incumbent to an empty slot) is the fallback when they're not
mutually eligible. Unlike bump, swap works on a **full 11/11 squad** (no empty slot needed). Executed
by `swapInto(slot)` in `Draft.jsx` (exchange the two players' pins, `refreshPins`). Verify:
`node app/src/draft/verify.mjs` (57/57 — the old 2-MF "bump" assert is now "swap"; added full-XI swap +
no-empty-slot + cross-line-rejection asserts) + positions/engine/scoring suites all green; `npm run
build` clean.

**Phase Share-3 (share-system overhaul for virality), 2026-06-10:** four fixes in `Share.jsx` +
`shareImage.js` + the 6 locale JSONs. (1) **Single URL on native share** — dropped the redundant
`url:` field from `navigator.share` (the URL already lives at the end of the text; iOS was rendering it
twice). (2) **New share text with a CTA**, applied to every path (native, X/Bluesky intent, Copy Text):
two keys `share.text` (Classic) / `share.textExpert` ("(Expert mode)") fold tier + Elo into one line
ending "Think you can beat it?" — Classic never shows a mode label; "made the {result}" reuses
`tierPhrase` for natural grammar in all 6 locales; text+URL stays < 300 chars (worst case de Expert =
155). (3) **Capability-based button hierarchy** keyed on `navigator.canShare({files})`: mobile leads
with a prominent "Share with image…" and demotes Copy Image to tertiary; desktop hides native and makes
Copy Image the prominent gold primary with a copy-then-paste hint; while the PNG is still rendering the
primary slot shows a disabled "Building…" button (no wrong-button flash). (4) **Result image redesigned
to 4:5 portrait (1080×1350)** so it renders uncropped in X/Bluesky/Facebook feeds — Elo is the hero
(92px gold, thumbnail-legible) with a small (+delta), small wordmark + tier label above, record line
(differential · score), Expert-only mode pill, champions-only grade badge, a large mini-pitch of the
XI, and a gold challenge line "Think you can beat {elo}?" (`share.cardChallenge`, localized) + URL.
Scorelines intentionally omitted from the card. Verified: `npm run build` clean, all 6 JSONs parse,
image renders at exactly 1080×1350 with no clipping. **Needs manual device testing:** `navigator.share`
(the double-URL fix) and `ClipboardItem` image copy can't be exercised in the sandbox.

## Working norms (user is non-technical)
- Explain *why*, not just *what*; flag tradeoffs. Never commit/push without explicit instruction.
- Confirm before destructive actions. Check in at the end of each phase.
