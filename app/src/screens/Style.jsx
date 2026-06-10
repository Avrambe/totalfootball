import React, { useState } from "react";
import { t } from "../i18n/index.js";
import { C, FONTS, splash } from "../theme.js";
import { STYLES, DEFAULT_STYLE } from "../engine/style.js";
import SquadPitch from "../components/SquadPitch.jsx";

// Post-draft, pre-tournament: pick a playing style that modestly shifts results toward squads built
// to suit it (engine/style.js). The drafted XI is shown above so the choice feels tied to the squad.
export default function Style({ config, seating, formationName, onStart, onExit }) {
  const [styleKey, setStyleKey] = useState(DEFAULT_STYLE);

  return (
    <div style={{ ...splash, justifyContent: "flex-start", paddingTop: "5vh", paddingBottom: 40, padding: "5vh 14px 40px" }}>
      <style>{FONTS}</style>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, color: C.gold, letterSpacing: ".02em", textAlign: "center" }}>
        {t("style.title")}
      </div>

      <div style={{ width: "100%", maxWidth: 560, marginTop: 18 }}>
        <SquadPitch seating={seating} formationName={formationName} diehard={config && config.mode === "diehard"} height={380} />
      </div>

      <div style={{ marginTop: 22, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 8 }}>
        <select value={styleKey} onChange={(e) => setStyleKey(e.target.value)} style={select}>
          {STYLES.map((s) => <option key={s.key} value={s.key}>{t(s.labelKey)}</option>)}
        </select>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13.5, color: C.chalk, opacity: 0.7, minHeight: 36, lineHeight: 1.35 }}>
          {t((STYLES.find((s) => s.key === styleKey) || STYLES[0]).descKey)}
        </div>
      </div>

      <button onClick={() => onStart(styleKey)} style={startBtn}>{t("action.start")}</button>
      {onExit && <button onClick={onExit} style={exitBtn}>{t("action.menu")}</button>}
    </div>
  );
}

const select = {
  fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 16, cursor: "pointer",
  color: C.ink, background: C.gold, border: `1px solid ${C.gold}`, borderRadius: 6, padding: "11px 14px",
  width: "100%", appearance: "none", WebkitAppearance: "none",
};

const startBtn = {
  marginTop: 28, cursor: "pointer",
  fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: ".08em",
  color: C.ink, background: C.green, border: "none", borderRadius: 6, padding: "14px 48px",
};

const exitBtn = {
  marginTop: 14, cursor: "pointer",
  fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: ".06em",
  color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 6, padding: "11px 30px",
};
