import React, { useState, useEffect } from "react";
import { t, LOCALES } from "../i18n/index.js";
import { C, FONTS, splash } from "../theme.js";

const ERAS = ["2026", "modern", "alltime"];
const MODES = ["classic", "diehard"];
const ENDONYM = { en: "English", es: "Español", fr: "Français", pt: "Português", de: "Deutsch", it: "Italiano" };

export default function Title({ lang, onSetLang, onStart, onLeaderboard }) {
  const [era, setEra] = useState("2026");
  const [mode, setMode] = useState("classic");
  // Track viewport width so the whole title screen can be condensed on a phone (iPhone ~390px),
  // where the full-size cards would push Expert / PLAY / LEADERBOARD below the fold.
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const narrow = w < 760;

  return (
    <div style={{ ...splash, justifyContent: "flex-start", paddingTop: narrow ? "3vh" : "8vh", paddingBottom: narrow ? 24 : 40 }}>
      <style>{FONTS}</style>
      {onSetLang && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: narrow ? 10 : 18, padding: "0 16px" }}>
          <select value={lang} onChange={(e) => onSetLang(e.target.value)} style={{
            cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600,
            color: C.chalk, background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.2)", borderRadius: 5, padding: "6px 12px",
          }}>
            {LOCALES.map((loc) => (
              <option key={loc} value={loc} style={{ color: C.ink }}>{ENDONYM[loc] || loc}</option>
            ))}
          </select>
        </div>
      )}
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: narrow ? 44 : 58, color: C.gold, letterSpacing: ".02em", textAlign: "center", lineHeight: 1 }}>
        {t("app.title").toUpperCase()}
      </div>
      <div style={{ fontFamily: "Inter, sans-serif", marginTop: narrow ? 6 : 8, fontSize: narrow ? 13.5 : 15, color: C.chalk, opacity: 0.8, textAlign: "center", maxWidth: 420, padding: "0 20px" }}>
        {t("app.tagline")}
      </div>

      <Section label={t("label.era")} narrow={narrow}>
        {ERAS.map((k) => (
          <Card key={k} active={era === k} narrow={narrow} onClick={() => setEra(k)}
            title={t(`era.${k}`)} desc={t(`era.${k}.desc`)} />
        ))}
      </Section>

      <Section label={t("label.mode")} narrow={narrow}>
        {MODES.map((k) => (
          <Card key={k} active={mode === k} narrow={narrow} onClick={() => setMode(k)}
            title={t(`mode.${k}`)} desc={t(`mode.${k}.desc`)} />
        ))}
      </Section>

      <button onClick={() => onStart(era, mode)} style={{ ...playBtn, marginTop: narrow ? 20 : 34, padding: narrow ? "12px 46px" : "14px 48px" }}>{t("action.play")}</button>
      {onLeaderboard && (
        <button onClick={onLeaderboard} style={{ ...lbBtn, marginTop: narrow ? 10 : 14 }}>{t("action.leaderboard")}</button>
      )}
    </div>
  );
}

function Section({ label, narrow, children }) {
  return (
    <div style={{ marginTop: narrow ? 16 : 28, width: "100%", maxWidth: 720, padding: "0 16px" }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: narrow ? 11 : 12, letterSpacing: ".25em", color: C.chalk, opacity: 0.55, marginBottom: narrow ? 6 : 10 }}>{label}</div>
      {/* On a phone, force the cards into a single row (era = thirds, mode = halves) instead of
          letting them wrap to one-per-row, which is what made the screen too tall. */}
      <div style={{ display: "flex", gap: narrow ? 7 : 10, flexWrap: narrow ? "nowrap" : "wrap" }}>{children}</div>
    </div>
  );
}

function Card({ active, narrow, onClick, title, desc }) {
  return (
    <button onClick={onClick} style={{
      flex: narrow ? "1 1 0" : "1 1 180px", minWidth: 0, textAlign: "left", cursor: "pointer",
      background: active ? C.gold : "rgba(255,255,255,.06)",
      color: active ? C.ink : C.chalk,
      border: active ? `1px solid ${C.gold}` : "1px solid rgba(255,255,255,.2)",
      borderRadius: 6, padding: narrow ? "9px 10px" : "12px 14px", transition: "all .12s",
    }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: narrow ? 15 : 17 }}>{title}</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: narrow ? 11 : 12.5, opacity: active ? 0.8 : 0.65, marginTop: narrow ? 2 : 3 }}>{desc}</div>
    </button>
  );
}

const playBtn = {
  marginTop: 34, cursor: "pointer",
  fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: ".08em",
  color: C.ink, background: C.green, border: "none", borderRadius: 6,
  padding: "14px 48px",
};

const lbBtn = {
  marginTop: 14, cursor: "pointer",
  fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: ".06em",
  color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 6, padding: "11px 30px",
};
