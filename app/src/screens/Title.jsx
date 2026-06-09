import React, { useState } from "react";
import { t, LOCALES } from "../i18n/index.js";
import { C, FONTS, splash } from "../theme.js";

const ERAS = ["2026", "modern", "alltime"];
const MODES = ["classic", "diehard"];
const ENDONYM = { en: "English", es: "Español", fr: "Français", pt: "Português", de: "Deutsch", it: "Italiano" };

export default function Title({ lang, onSetLang, onStart, onLeaderboard }) {
  const [era, setEra] = useState("2026");
  const [mode, setMode] = useState("classic");

  return (
    <div style={{ ...splash, justifyContent: "flex-start", paddingTop: "8vh", paddingBottom: 40 }}>
      <style>{FONTS}</style>
      {onSetLang && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 18, padding: "0 16px" }}>
          {LOCALES.map((loc) => (
            <button key={loc} onClick={() => onSetLang(loc)} style={{
              cursor: "pointer", fontFamily: "Oswald, sans-serif", fontSize: 12, fontWeight: 600,
              color: lang === loc ? C.ink : C.chalk,
              background: lang === loc ? C.gold : "rgba(255,255,255,.06)",
              border: lang === loc ? `1px solid ${C.gold}` : "1px solid rgba(255,255,255,.18)",
              borderRadius: 5, padding: "5px 11px",
            }}>{ENDONYM[loc] || loc}</button>
          ))}
        </div>
      )}
      <div style={{ fontFamily: "Anton, sans-serif", fontSize: 58, color: C.gold, letterSpacing: ".02em", textAlign: "center" }}>
        {t("app.title").toUpperCase()}
      </div>
      <div style={{ fontFamily: "Oswald, sans-serif", marginTop: 8, fontSize: 15, color: C.chalk, opacity: 0.8, textAlign: "center", maxWidth: 420, padding: "0 20px" }}>
        {t("app.tagline")}
      </div>

      <Section label={t("label.era")}>
        {ERAS.map((k) => (
          <Card key={k} active={era === k} onClick={() => setEra(k)}
            title={t(`era.${k}`)} desc={t(`era.${k}.desc`)} />
        ))}
      </Section>

      <Section label={t("label.mode")}>
        {MODES.map((k) => (
          <Card key={k} active={mode === k} onClick={() => setMode(k)}
            title={t(`mode.${k}`)} desc={t(`mode.${k}.desc`)} />
        ))}
      </Section>

      <button onClick={() => onStart(era, mode)} style={playBtn}>{t("action.play")}</button>
      {onLeaderboard && (
        <button onClick={onLeaderboard} style={lbBtn}>{t("action.leaderboard")}</button>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginTop: 28, width: "100%", maxWidth: 720, padding: "0 16px" }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, letterSpacing: ".25em", color: C.chalk, opacity: 0.55, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Card({ active, onClick, title, desc }) {
  return (
    <button onClick={onClick} style={{
      flex: "1 1 180px", textAlign: "left", cursor: "pointer",
      background: active ? C.gold : "rgba(255,255,255,.06)",
      color: active ? C.ink : C.chalk,
      border: active ? `1px solid ${C.gold}` : "1px solid rgba(255,255,255,.2)",
      borderRadius: 6, padding: "12px 14px", transition: "all .12s",
    }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 17 }}>{title}</div>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12.5, opacity: active ? 0.8 : 0.65, marginTop: 3 }}>{desc}</div>
    </button>
  );
}

const playBtn = {
  marginTop: 34, cursor: "pointer",
  fontFamily: "Anton, sans-serif", fontSize: 22, letterSpacing: ".08em",
  color: C.ink, background: C.green, border: "none", borderRadius: 6,
  padding: "14px 48px",
};

const lbBtn = {
  marginTop: 14, cursor: "pointer",
  fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: ".06em",
  color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 6, padding: "11px 30px",
};
