// Position taxonomy (Spec §4). The four buckets (GK/DF/MF/FW) are the floor; the 14 granular
// tokens add precision on top and NEVER restrict below the line. Each granular token carries a
// line, a zone (left/central/right), and a depth (deep/mid/high) — canPlay() uses zone/depth to
// scale off-position effectiveness.

// Granular token -> bucket line. The one place that knows the hierarchy.
export const HIERARCHY = {
  GK: "GK",
  CB: "DF", LB: "DF", RB: "DF", LWB: "DF", RWB: "DF",
  CDM: "MF", CM: "MF", CAM: "MF", LM: "MF", RM: "MF",
  LW: "FW", RW: "FW", ST: "FW",
};

// Spatial descriptors per granular token (drives the off-position penalty).
export const TOKENS = {
  GK:  { line: "GK", zone: "central", depth: "deep" },
  CB:  { line: "DF", zone: "central", depth: "deep" },
  LB:  { line: "DF", zone: "left",    depth: "deep" },
  RB:  { line: "DF", zone: "right",   depth: "deep" },
  LWB: { line: "DF", zone: "left",    depth: "mid"  },
  RWB: { line: "DF", zone: "right",   depth: "mid"  },
  CDM: { line: "MF", zone: "central", depth: "deep" },
  CM:  { line: "MF", zone: "central", depth: "mid"  },
  CAM: { line: "MF", zone: "central", depth: "high" },
  LM:  { line: "MF", zone: "left",    depth: "mid"  },
  RM:  { line: "MF", zone: "right",   depth: "mid"  },
  LW:  { line: "FW", zone: "left",    depth: "high" },
  RW:  { line: "FW", zone: "right",   depth: "high" },
  ST:  { line: "FW", zone: "central", depth: "high" },
};

export const BUCKETS = new Set(["GK", "DF", "MF", "FW"]);

export function isBucket(token) {
  return BUCKETS.has(token);
}

// The bucket line a token belongs to. Bucket tokens map to themselves; granular tokens via the
// hierarchy. Returns undefined for anything unrecognized.
export function lineOf(token) {
  return BUCKETS.has(token) ? token : HIERARCHY[token];
}
