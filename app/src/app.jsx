import React, { useState, useEffect } from "react";
import { loadLocale, t } from "./i18n/index.js";
import { loadGameData, GAME } from "./data/loader.js";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap');`;

const C = {
  pitchDeep: "#0a1f14",
  pitch: "#0b6b3a",
  gold: "#e9c46a",
  chalk: "#f3f4ef",
  ink: "#0a140e",
};

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Load locale strings first, then attempt to load game data (which may not exist yet).
    Promise.all([loadLocale("en"), loadGameData()]).then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div style={splash}>
        <style>{FONTS}</style>
        <div style={{ fontFamily: "Anton, sans-serif", fontSize: 54, color: C.gold, letterSpacing: ".02em" }}>
          TOTAL FOOTBALL
        </div>
        <div style={{ fontFamily: "Oswald, sans-serif", marginTop: 14, fontSize: 13, letterSpacing: ".25em", color: C.chalk, opacity: 0.55 }}>
          LOADING…
        </div>
      </div>
    );
  }

  const hasData = !!GAME.cards;

  return (
    <div style={splash}>
      <style>{FONTS}</style>
      <div style={{ fontFamily: "Anton, sans-serif", fontSize: 58, color: C.gold, letterSpacing: ".02em", textAlign: "center" }}>
        {t("app.title").toUpperCase()}
      </div>
      <div style={{ fontFamily: "Oswald, sans-serif", marginTop: 10, fontSize: 16, color: C.chalk, opacity: 0.85, textAlign: "center", maxWidth: 420, padding: "0 20px" }}>
        {t("app.tagline")}
      </div>

      <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
        {["era.2026", "era.modern", "era.alltime"].map((k) => (
          <div key={k} style={eraChip}>{t(k)}</div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        {["mode.classic", "mode.diehard"].map((k) => (
          <div key={k} style={modeChip}>{t(k)}</div>
        ))}
      </div>

      <div style={{ marginTop: 30, fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: hasData ? "#7CFC9A" : "#f4a261" }}>
        {hasData
          ? `cards.json loaded — ${Array.isArray(GAME.cards) ? GAME.cards.length : Object.keys(GAME.cards).length} entries`
          : "Phase 0 scaffold — run the pipeline to generate cards.json"}
      </div>
    </div>
  );
}

const splash = {
  background: `radial-gradient(1200px 600px at 50% -10%, ${C.pitch} 0%, ${C.pitchDeep} 60%)`,
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const eraChip = {
  fontFamily: "Oswald, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  color: C.ink,
  background: C.gold,
  padding: "8px 14px",
  borderRadius: 3,
  letterSpacing: ".03em",
};

const modeChip = {
  fontFamily: "Oswald, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  color: C.chalk,
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.25)",
  padding: "7px 14px",
  borderRadius: 3,
  letterSpacing: ".03em",
};
