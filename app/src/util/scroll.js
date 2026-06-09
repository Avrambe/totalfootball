// Smooth viewport scroll to an element, ported verbatim from 162-0 (easeInOutQuad over `duration`ms
// via requestAnimationFrame). Used by the draft loop to bring the board into view when you pick a
// player to place, and to bring the fresh offer into view after the next auto-spin.

export function smoothScrollToEl(el, duration = 400) {
  if (!el || typeof window === "undefined") return;
  const startY = window.scrollY || window.pageYOffset || 0;
  const targetY = startY + el.getBoundingClientRect().top;
  const dist = targetY - startY;
  if (Math.abs(dist) < 2) return;
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  (function step(now) {
    const p = Math.min(1, (now - t0) / duration);
    window.scrollTo(0, startY + dist * ease(p));
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}
