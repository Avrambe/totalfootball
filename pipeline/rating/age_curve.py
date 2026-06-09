"""Layer 0 — age/form curve (universal, free). Spec §3.1.

A peak-age multiplier from birth_date alone: rising into the mid-20s, plateau ~25-29, gentle
decline after 31, steeper after 34. Applied to every card so the age-26 vs age-34 distinction
holds for 100% of the pool, including pre-1970 cards with no other data. When age is unknown
(junk birth_date), return the neutral plateau value so the card is neither helped nor hurt.

The shape is a small table of (age -> multiplier) anchors, linearly interpolated. All tunable.
"""
from __future__ import annotations

# (age, multiplier) anchors. Plateau = 1.0 across the prime years.
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
NEUTRAL = 1.00  # used when age is unknown


def age_factor(age: int | None) -> float:
    if age is None:
        return NEUTRAL
    if age <= _ANCHORS[0][0]:
        return _ANCHORS[0][1]
    if age >= _ANCHORS[-1][0]:
        return _ANCHORS[-1][1]
    for (a0, m0), (a1, m1) in zip(_ANCHORS, _ANCHORS[1:]):
        if a0 <= age <= a1:
            t = (age - a0) / (a1 - a0)
            return m0 + t * (m1 - m0)
    return NEUTRAL
