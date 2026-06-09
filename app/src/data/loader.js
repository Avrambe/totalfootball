// Runtime data loading (mirrors 162-0's fetch-into-global pattern).
// The Python pipeline emits these JSON files into app/public/; the build copies them to dist/.

export const GAME = { cards: null, teams: null, elo: null };

export async function loadGameData() {
  const [cards, teams, elo] = await Promise.all([
    fetch("/cards.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/teams.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/elo.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  GAME.cards = cards;
  GAME.teams = teams;
  GAME.elo = elo;
  return GAME;
}
