// The tournament: a group stage then a knockout bracket against REAL historical squads, seeded so
// later rounds pull from progressively stronger teams (Spec §8). Elo decides the DRAW (opponent
// strength tiers), never the goal model — goals come from squad player ratings on both sides (§3.4).

import { GAME } from "../data/loader.js";
import { eraSquads } from "../spin/pools.js";
import { opponentQuality } from "./squad.js";
import { playMatch } from "./match.js";
import { GROUP_SIZE, GROUPS, THIRDS_ADVANCE, KO_ROUNDS, ELO_BANDS } from "./params.js";

const TIER_ON_LOSS = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  Quarterfinals: "Quarterfinalists",
  Semifinals: "Semifinalists",
  Final: "Runner-Up",
};

// Fieldable opponent squads in an era, each with Elo + precomputed quality, sorted by Elo ascending.
// Cached per era (the pool is large and stable within a session).
const _poolCache = new Map();
export function opponentPool(era) {
  if (_poolCache.has(era)) return _poolCache.get(era);
  const out = [];
  for (const sq of eraSquads(era)) {
    const elo = GAME.elo?.[sq.teamCode]?.[String(sq.year)];
    if (elo == null) continue;
    const q = opponentQuality(sq.teamCode, sq.year);
    if (!q) continue;
    out.push({ teamCode: sq.teamCode, year: sq.year, name: sq.name, elo, quality: q });
  }
  out.sort((a, b) => a.elo - b.elo);
  // strength = Elo percentile in the era's field (0..1); the scoring module weights match Elo by it.
  out.forEach((o, i) => (o.strength = out.length > 1 ? i / (out.length - 1) : 0.5));
  _poolCache.set(era, out);
  return out;
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Draw one opponent from an Elo band, avoiding team codes already used this tournament.
function draw(pool, band, used, rng) {
  const lo = Math.floor(band[0] * pool.length);
  const hi = Math.max(lo + 1, Math.ceil(band[1] * pool.length));
  const slice = pool.slice(lo, hi).filter((s) => !used.has(s.teamCode));
  const cand = slice.length ? slice : pool.filter((s) => !used.has(s.teamCode));
  const choice = pick(cand, rng);
  used.add(choice.teamCode);
  return choice;
}

function record(you, opp, opts) {
  const r = playMatch(you.quality, opp.quality, opts);
  return {
    opponent: { teamCode: opp.teamCode, year: opp.year, name: opp.name }, oppStrength: opp.strength,
    you: r.gf, opp: r.ga, scoreline: `${r.gf}-${r.ga}`, won: r.won, decidedBy: r.decidedBy,
  };
}

// Play a 4-team round-robin. Returns { ranked, matches }: `ranked` is the standings (pts → gd → gf),
// `matches` records each result as {i,j,gf,ga} (gf/ga from team i's view) for callers that need detail.
function playGroup(teams, rng) {
  const table = new Map(teams.map((t) => [t.key, { pts: 0, gf: 0, ga: 0 }]));
  const matches = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const r = playMatch(teams[i].quality, teams[j].quality, { rng });
      const ta = table.get(teams[i].key), tb = table.get(teams[j].key);
      ta.gf += r.gf; ta.ga += r.ga; tb.gf += r.ga; tb.ga += r.gf;
      if (r.gf > r.ga) ta.pts += 3; else if (r.gf < r.ga) tb.pts += 3; else { ta.pts += 1; tb.pts += 1; }
      matches.push({ i, j, gf: r.gf, ga: r.ga });
    }
  }
  const ranked = [...table.entries()]
    .map(([key, s]) => ({ key, ...s, gd: s.gf - s.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return { ranked, matches };
}

// Is record A strictly better than B by the standings order (pts → gd → gf)?
const betterThird = (a, b) => a.pts > b.pts || (a.pts === b.pts && a.gd > b.gd) || (a.pts === b.pts && a.gd === b.gd && a.gf > b.gf);

// Run a full tournament for a drafted squad. `you` = { quality:{attack,defense} }.
// Real 2026 format: 12 groups of 4; top 2 of each group + the 8 best third-place teams advance to a
// 32-team knockout. We simulate all 12 groups so the third-place cut reflects the actual field.
export function runBracket(you, era, rng = Math.random) {
  const pool = opponentPool(era);
  const used = new Set();        // teams YOU encounter (group opponents + knockout), kept distinct
  const oppMeta = (o) => ({ teamCode: o.teamCode, year: o.year, name: o.name });

  // How many groups the pool can fill; the third-place quota scales to keep the ~2/3-of-thirds ratio
  // when a pool is too small for a full 12 (the test stub / edge eras).
  const groupsFormed = Math.max(1, Math.min(GROUPS, Math.floor((pool.length + 1) / GROUP_SIZE)));
  const thirdsQuota = Math.max(1, Math.round((THIRDS_ADVANCE / GROUPS) * groupsFormed));

  // --- Your group: you + (GROUP_SIZE-1) drawn opponents, full round-robin. ---
  const groupOpps = [];
  for (let i = 0; i < GROUP_SIZE - 1; i++) groupOpps.push(draw(pool, ELO_BANDS.group, used, rng));
  const myTeams = [{ key: "you", quality: you.quality }, ...groupOpps.map((o, i) => ({ key: i, quality: o.quality }))];
  const myGroup = playGroup(myTeams, rng);

  // Your 3 group matches, reconstructed from the simulated results (not re-rolled).
  const yourMatches = [];
  for (const m of myGroup.matches) {
    if (myTeams[m.i].key === "you") { const o = groupOpps[myTeams[m.j].key]; yourMatches.push({
      opponent: oppMeta(o), oppStrength: o.strength,
      you: m.gf, opp: m.ga, scoreline: `${m.gf}-${m.ga}`, won: m.gf > m.ga, decidedBy: "normal",
    }); }
    else if (myTeams[m.j].key === "you") { const o = groupOpps[myTeams[m.i].key]; yourMatches.push({
      opponent: oppMeta(o), oppStrength: o.strength,
      you: m.ga, opp: m.gf, scoreline: `${m.ga}-${m.gf}`, won: m.ga > m.gf, decidedBy: "normal",
    }); }
  }

  const myRank = myGroup.ranked.findIndex((t) => t.key === "you"); // 0-based (0,1 = top two)
  const myRow = myGroup.ranked[myRank];

  // --- The other groups, only to set the best-thirds cut. They draw freely (reuse across the field is
  // fine — they exist solely to produce plausible third-place records), so YOUR `used` set is untouched
  // and the opponent pool can never be exhausted. ---
  const otherThirds = [];
  for (let g = 1; g < groupsFormed; g++) {
    const localUsed = new Set();
    const gt = [];
    for (let k = 0; k < GROUP_SIZE; k++) gt.push({ key: k, quality: draw(pool, ELO_BANDS.group, localUsed, rng).quality });
    otherThirds.push(playGroup(gt, rng).ranked[2]);
  }

  // Advancement: top two always; third place only if within the best `thirdsQuota` third-place records.
  let advanced, advancedVia;
  if (myRank < 2) { advanced = true; advancedVia = "top2"; }
  else if (myRank === 2) {
    const better = otherThirds.filter((t) => betterThird(t, myRow)).length;
    advanced = better < thirdsQuota;
    advancedVia = advanced ? "third" : null;
  } else { advanced = false; advancedVia = null; }

  let goalsFor = yourMatches.reduce((s, m) => s + m.you, 0);
  let goalsAgainst = yourMatches.reduce((s, m) => s + m.opp, 0);
  const group = { matches: yourMatches, advanced, advancedVia };

  if (!advanced) {
    return { group, knockout: [], tier: "Group Stage Exit", goalsFor, goalsAgainst, diff: goalsFor - goalsAgainst };
  }

  // --- Knockout: one match per round from a progressively higher Elo band; lose and you're out. ---
  const knockout = [];
  let tier = "Champions";
  for (const round of KO_ROUNDS) {
    const opp = draw(pool, ELO_BANDS[round], used, rng);
    const m = record(you, opp, { knockout: true, rng });
    m.round = round;
    knockout.push(m);
    goalsFor += m.you; goalsAgainst += m.opp;
    if (!m.won) { tier = TIER_ON_LOSS[round]; break; }
  }

  return { group, knockout, tier, goalsFor, goalsAgainst, diff: goalsFor - goalsAgainst };
}
