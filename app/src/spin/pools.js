// The draw universe for the spinner (Spec §6). A "squad" is one (team, year): for 2026 Only the
// year is fixed at 2026; for Modern (1970+) and All-Time (1930+) the year is part of the draw.
// `validTargets` filters to squads that can still contribute a placeable player, so a spin never
// dead-ends — mirroring 162-0's validTargets gate.

import { GAME } from "../data/loader.js";
import { openLines } from "../formation/offer.js";
import { teamName } from "../i18n/index.js";

const ERA_FLAG = { "2026": "y2026", modern: "modern", alltime: "alltime" };
const ERA_MIN_YEAR = { "2026": 2026, modern: 1970, alltime: 1930 };

// All squads available in an era: [{ teamCode, name, year }].
export function eraSquads(era) {
  const flag = ERA_FLAG[era];
  const minYear = ERA_MIN_YEAR[era];
  const out = [];
  for (const [teamCode, team] of Object.entries(GAME.teams || {})) {
    if (!team.eras || !team.eras[flag]) continue;
    if (era === "2026") {
      out.push({ teamCode, name: teamName(teamCode), year: 2026 });
    } else {
      for (const year of team.years || []) {
        if (year >= minYear) out.push({ teamCode, name: teamName(teamCode), year });
      }
    }
  }
  return out;
}

// Cards indexed by squad key `${teamCode}|${year}`, built once from cards.json.
let _index = null;
function cardIndex() {
  if (_index) return _index;
  _index = new Map();
  for (const card of GAME.cards || []) {
    const key = `${card.team_code}|${card.year}`;
    if (!_index.has(key)) _index.set(key, []);
    _index.get(key).push(card);
  }
  return _index;
}

export function squadCards(teamCode, year) {
  return cardIndex().get(`${teamCode}|${year}`) || [];
}

// Squads in this era that hold at least one card in a still-open line, given the placed roster +
// current formation. `open` is computed once per spin (not per squad), so this stays cheap.
// `fix` optionally pins one axis for a targeted respin: { teamCode } holds the country (reroll the
// year only), { year } holds the year (reroll the country only). Omitted => a fresh, both-axis draw.
export function validTargets(era, placed, formationName, fix) {
  const open = openLines(placed, formationName);
  return eraSquads(era).filter((sq) => {
    if (fix && fix.teamCode != null && sq.teamCode !== fix.teamCode) return false;
    if (fix && fix.year != null && sq.year !== fix.year) return false;
    return squadCards(sq.teamCode, sq.year).some((c) => open.has(c.position) && c.team_code);
  });
}

// Is there at least one OTHER squad to land on when rerolling a single axis? `fix` holds the axis
// being kept; `current` is the squad on the reel now (excluded so "respin" must actually change it).
// Used to disable a respin button when no alternative exists (e.g. a country with only one valid year).
export function canRespin(era, placed, formationName, fix, current) {
  return validTargets(era, placed, formationName, fix).some(
    (sq) => !(current && sq.teamCode === current.teamCode && sq.year === current.year)
  );
}

// Distinct team labels and year labels in an era, for the reel's tumble frames.
export function eraLabels(era) {
  const squads = eraSquads(era);
  const teams = [...new Set(squads.map((s) => s.name))];
  const years = era === "2026" ? [2026] : [...new Set(squads.map((s) => s.year))].sort();
  return { teams, years };
}

const pickRand = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Team names that actually fielded a squad in `year` (era-filtered).
export function teamsInYear(era, year) {
  return [...new Set(eraSquads(era).filter((s) => s.year === year).map((s) => s.name))];
}

// Distinct {name, code} squads that fielded in `year` — used so the tumbling team axis can show the
// country's flag (the code) alongside the name during the spin, not just after it settles.
export function squadsInYear(era, year) {
  const seen = new Set();
  const out = [];
  for (const s of eraSquads(era)) {
    if (s.year !== year || seen.has(s.teamCode)) continue;
    seen.add(s.teamCode);
    out.push({ name: s.name, code: s.teamCode });
  }
  return out;
}

// Years `teamCode` actually fielded a squad in (era-filtered, ascending).
export function yearsForTeam(era, teamCode) {
  return [...new Set(eraSquads(era).filter((s) => s.teamCode === teamCode).map((s) => s.year))].sort((a, b) => a - b);
}

// Build the reel's tumble frames so EVERY frame is a real (team, year) pairing — no impossible
// combos (e.g. "Serbia and Montenegro 1934") flash by mid-spin. On a full draw the year settles
// first (locks ~60% through), then the team keeps tumbling but only among teams that actually played
// that settled year — the "draw a year, then a team that played it" model. Single-axis respins tumble
// only the live axis within the values valid for the held one. `target` = the pre-picked { teamCode,
// name, year }; `axes` = { team, year }; `count` = number of tumble frames before the final snap.
export function reelFrames(era, target, axes, count) {
  const frames = [];
  const teamPool = squadsInYear(era, target.year); // {name, code} valid for the settled year
  if (axes.team && axes.year) {
    const all = eraSquads(era);
    const yLock = Math.max(1, Math.round(count * 0.6)); // year locks first; team runs on after
    for (let i = 0; i < count; i++) {
      if (i < yLock) { const sq = pickRand(all); frames.push({ team: sq.name, year: sq.year, code: sq.teamCode }); }
      else { const sq = pickRand(teamPool); frames.push({ team: sq.name, year: target.year, code: sq.code }); }
    }
  } else if (axes.team) {
    for (let i = 0; i < count; i++) { const sq = pickRand(teamPool); frames.push({ team: sq.name, year: target.year, code: sq.code }); }
  } else if (axes.year) {
    const yearPool = yearsForTeam(era, target.teamCode);
    for (let i = 0; i < count; i++) frames.push({ team: target.name, year: pickRand(yearPool), code: target.teamCode });
  } else {
    for (let i = 0; i < count; i++) frames.push({ team: target.name, year: target.year, code: target.teamCode });
  }
  return frames;
}
