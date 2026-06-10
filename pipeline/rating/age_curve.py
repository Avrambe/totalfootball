"""Layer 0 — age/form curve (universal, free). Spec §3.1.

A peak-age multiplier from birth_date alone: rising into the mid-20s, plateau ~25-29, gentle
decline after 31, steeper after 34. Applied to every card so the age-26 vs age-34 distinction
holds for 100% of the pool, including pre-1970 cards with no other data. When age is unknown
(junk birth_date), return the neutral plateau value so the card is neither helped nor hurt.

The shape is a small table of (age -> multiplier) anchors, linearly interpolated. All tunable.

Goalkeepers age differently from outfield players — they peak later (late 20s) and decline far
more slowly (a 34-year-old keeper is often still at his best, whereas a 34-year-old striker has
usually slipped). So GK has its own gentler anchor table. The `position` argument selects it; it
defaults to None, which keeps the original outfield curve so the HISTORICAL path is byte-identical
to before (only the 2026 cohort passes a position).
"""
from __future__ import annotations

# (age, multiplier) anchors for outfield players. Plateau = 1.0 across the prime years.
_ANCHORS = [
    (16, 0.72),
    (18, 0.80),
    (21, 0.92),
    (24, 0.99),
    (25, 1.00),
    (29, 1.00),
    (31, 0.97),
    (33, 0.91),
    (34, 0.87),
    (36, 0.79),
    (38, 0.71),
    (40, 0.65),
]

# Goalkeepers: peak ~27-33, decline gently (a 34yo keeper ≈ full strength).
_GK_ANCHORS = [
    (17, 0.74),
    (20, 0.84),
    (23, 0.92),
    (26, 0.98),
    (28, 1.00),
    (33, 1.00),
    (35, 0.97),
    (37, 0.92),
    (39, 0.86),
    (41, 0.80),
]
NEUTRAL = 1.00  # used when age is unknown


def _interp(age: int, anchors: list[tuple[int, float]]) -> float:
    if age <= anchors[0][0]:
        return anchors[0][1]
    if age >= anchors[-1][0]:
        return anchors[-1][1]
    for (a0, m0), (a1, m1) in zip(anchors, anchors[1:]):
        if a0 <= age <= a1:
            t = (age - a0) / (a1 - a0)
            return m0 + t * (m1 - m0)
    return NEUTRAL


def age_factor(age: int | None, position: str | None = None) -> float:
    """Age multiplier. `position="GK"` uses the gentle keeper curve; anything else (incl. None,
    the default used by the historical path) uses the outfield curve."""
    if age is None:
        return NEUTRAL
    anchors = _GK_ANCHORS if position == "GK" else _ANCHORS
    return _interp(age, anchors)
