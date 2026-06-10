import React, { useState } from "react";
import { C } from "../theme.js";

// A nation flag: <Flag code="BRA" h={14} />. Renders /flags/<CODE>.svg at a 4:3 aspect. If the
// asset is missing (a nation we haven't generated a flag for yet) it gracefully falls back to the
// text code, so the UI never shows a broken image. `code` is the team_code; SVGs are named by it.
export default function Flag({ code, h = 14, title, style }) {
  const [err, setErr] = useState(false);
  if (!code || err) {
    return (
      <span style={{ fontFamily: "Inter, monospace", fontSize: h * 0.72, color: C.chalk, opacity: 0.75, ...style }}>
        {code || ""}
      </span>
    );
  }
  return (
    <img
      src={`/flags/${code}.svg`}
      alt={title || code}
      title={title || code}
      onError={() => setErr(true)}
      style={{ height: h, width: h * (4 / 3), objectFit: "cover", borderRadius: 2, display: "inline-block", verticalAlign: "middle", boxShadow: "0 0 0 1px rgba(0,0,0,.25)", ...style }}
    />
  );
}
