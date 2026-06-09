// Poisson + Dixon-Coles math for the goal model (Spec §8). Pure functions, no data deps.

import { RHO, MAX_GOALS } from "./params.js";

// Sized well past MAX_GOALS so poissonPmf stays a correct general utility (it's tested to k=20).
const FACT = (() => {
  const f = [1];
  for (let i = 1; i <= 30; i++) f[i] = f[i - 1] * i;
  return f;
})();

export function poissonPmf(k, lambda) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / FACT[k];
}

// Dixon-Coles low-score dependence correction. Nudges the four lowest scorelines so draws / 1-0s are
// a touch more likely than independent Poissons predict (the empirically-observed soccer pattern).
function tau(x, y, la, lb, rho) {
  if (x === 0 && y === 0) return 1 - la * lb * rho;
  if (x === 0 && y === 1) return 1 + la * rho;
  if (x === 1 && y === 0) return 1 + lb * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Normalized P(i goals for A, j goals for B) over 0..MAX_GOALS, as a flat array of
// { i, j, p } with Σp = 1.
export function scoreMatrix(la, lb, rho = RHO) {
  const cells = [];
  let total = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poissonPmf(i, la) * poissonPmf(j, lb) * Math.max(0, tau(i, j, la, lb, rho));
      cells.push({ i, j, p });
      total += p;
    }
  }
  for (const c of cells) c.p /= total;
  return cells;
}

// Sample a scoreline [a, b] from a normalized matrix. `rng` defaults to Math.random.
export function sampleScore(cells, rng = Math.random) {
  let r = rng();
  for (const c of cells) {
    r -= c.p;
    if (r <= 0) return [c.i, c.j];
  }
  const last = cells[cells.length - 1];
  return [last.i, last.j];
}
