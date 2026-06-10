// Daily leaderboard client (Supabase, plain fetch — no JS client dependency, mirrors 162-0).
// Writes go through the SECURITY DEFINER `submit_score` RPC; reads are anon SELECT over REST.
// Scores are keyed by config = `${era}-${mode}` (6 total) and sorted by Elo (desc).
//
// SETUP: create a Supabase project, run SUPABASE.sql (repo root), then paste the project URL +
// publishable anon key below. Until then the board is inert (calls reject and the UI shows an error).
const SB_URL = "https://skmztomaygdjxbfeyjyj.supabase.co";   // e.g. "https://xxxxxxxx.supabase.co"
const SB_KEY = "sb_publishable_udsLFmbG8d4vxxg8plsLIA_4vBVRN69";   // the publishable anon key (safe to ship; writes are RPC-gated)

const SB_H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
export const boardConfigured = () => !!(SB_URL && SB_KEY);

export const configKey = (era, mode) => `${era}-${mode}`;

// Compact XI for the roster viewer: enough for SquadPitch to rebuild a seating map.
function packSquad(seating, formationName) {
  const players = {};
  for (const [slotId, card] of Object.entries(seating || {})) {
    if (!card) continue;
    players[slotId] = { name: card.name, team_code: card.team_code, year: card.year, wc_rating: card.wc_rating };
  }
  return { formationName, players };
}

export async function submitScore({ era, mode, name, result, seating, clientKey }) {
  if (!boardConfigured()) throw new Error("Leaderboard not configured");
  const r = await fetch(`${SB_URL}/rest/v1/rpc/submit_score`, {
    method: "POST", headers: SB_H,
    body: JSON.stringify({
      p_config: configKey(era, mode),
      p_name: name,
      p_elo: result.elo,
      p_tier: result.tier,
      p_grade: result.grade ?? null,
      p_gf: result.goalsFor,
      p_ga: result.goalsAgainst,
      p_diff: result.diff,
      p_squad: packSquad(seating, result.formationName),
      p_client_key: clientKey,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function topScores(era, mode, timeframe) {
  if (!boardConfigured()) throw new Error("Leaderboard not configured");
  let u = `${SB_URL}/rest/v1/scores?config=eq.${configKey(era, mode)}`
    + `&select=name,elo,tier,grade,goals_for,goals_against,diff,squad,created_at`
    + `&order=elo.desc,created_at.asc&limit=25`;
  if (timeframe === "today") u += `&created_at=gte.${new Date(Date.now() - 864e5).toISOString()}`;
  else if (timeframe === "week") u += `&created_at=gte.${new Date(Date.now() - 6048e5).toISOString()}`;
  const r = await fetch(u, { headers: SB_H });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Would this Elo place on the board (top 25) in AT LEAST ONE timeframe (today / this week /
// all-time)? Used to decide whether to even ask for a name — no point prompting someone who
// wouldn't appear. A timeframe counts as "made" when it has fewer than 25 entries (open slot)
// OR the Elo beats the current 25th-place score. Fails OPEN (returns true) on any network/parse
// error so a flaky connection never silently denies a legit qualifier the chance to post.
export async function leaderboardStanding(era, mode, elo) {
  if (!boardConfigured()) return { made: false };
  try {
    const frames = ["today", "week", "all"];
    const lists = await Promise.all(frames.map((tf) => topScores(era, mode, tf).catch(() => null)));
    const madeIn = [];
    for (let i = 0; i < frames.length; i++) {
      const rows = lists[i];
      if (!rows) return { made: true, frames: [], error: true }; // a fetch failed → fail open
      if (rows.length < 25 || elo > rows[rows.length - 1].elo) madeIn.push(frames[i]);
    }
    return { made: madeIn.length > 0, frames: madeIn };
  } catch (e) {
    return { made: true, frames: [], error: true };
  }
}

// Real percentile only — returns the "top X%" (lower is better) once the config has ≥18 scores,
// otherwise null (no modeled fallback this phase). Never throws; the stat just hides on failure.
export async function realPct(era, mode, elo) {
  if (!boardConfigured()) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/real_pct`, {
      method: "POST", headers: SB_H,
      body: JSON.stringify({ p_config: configKey(era, mode), p_elo: elo }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.pct != null ? d.pct : null;
  } catch (e) { return null; }
}
