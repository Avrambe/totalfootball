// ============================================================================
// DYNAMIC LEADERBOARD SIZING — TEMPORARY (retire once the game is established)
// ============================================================================
// While the game is young, a leaderboard that literally shows every entry also
// broadcasts how few people have played: a board of 23 names reads as "only 23
// people have ever played this." This module hides that by only ever revealing a
// "round" number of names — 10, 25, 50, or 100 — chosen from how many scores
// actually exist for the view being shown.
//
// Staircase (per era + mode + timeframe):
//   under 25 total ─ show top 10        (a short, curated-looking board)
//   25–49 total   ─ show 25
//   50–99 total   ─ show 50
//   100+ total    ─ show 100
//
// HOW TO REMOVE IT LATER (it's deliberately isolated):
//   • Quick off-switch: set ENABLED = false below. displayCap then always returns
//     MAX_ROWS and scoreCount skips the network call, so the board simply shows up
//     to 100 names — the natural end state.
//   • Full removal: delete this file, then in Leaderboard.jsx revert the one fenced
//     "DYNAMIC LEADERBOARD SIZING" block back to a plain topScores(era, mode, tf).
//   (The two supporting changes in board.js — exported SB_* constants and the
//   topScores `limit` argument — are harmless and can stay.)
// ============================================================================
import { SB_URL, SB_H, configKey } from "./board.js";

export const ENABLED = true;
export const MAX_ROWS = 100; // most names ever shown; also the row limit the screen fetches

// total scores in a view -> how many names to display.
export function displayCap(total) {
  if (!ENABLED) return MAX_ROWS;
  if (total >= 100) return 100;
  if (total >= 50) return 50;
  if (total >= 25) return 25;
  return 10;
}

// Exact number of scores for a config + timeframe, fetched cheaply: we ask for a
// single row but add the count header, so Supabase returns the full total in the
// Content-Range response header (e.g. "0-0/57") without downloading the rows.
// Fails OPEN (returns MAX_ROWS) so a hiccup never blanks the board.
export async function scoreCount(era, mode, timeframe) {
  if (!ENABLED) return MAX_ROWS;
  try {
    let u = `${SB_URL}/rest/v1/scores?config=eq.${configKey(era, mode)}&select=id&limit=1`;
    if (timeframe === "today") u += `&created_at=gte.${new Date(Date.now() - 864e5).toISOString()}`;
    else if (timeframe === "week") u += `&created_at=gte.${new Date(Date.now() - 6048e5).toISOString()}`;
    const r = await fetch(u, { headers: { ...SB_H, Prefer: "count=exact" } });
    const total = parseInt((r.headers.get("content-range") || "").split("/")[1], 10);
    return Number.isFinite(total) ? total : MAX_ROWS;
  } catch (e) {
    return MAX_ROWS;
  }
}
