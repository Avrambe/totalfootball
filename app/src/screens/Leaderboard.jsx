import React, { useState, useEffect } from "react";
import { t } from "../i18n/index.js";
import { C, FONTS, splash } from "../theme.js";
import { topScores, boardConfigured } from "../leaderboard/board.js";
import SquadPitch from "../components/SquadPitch.jsx";

const ERAS = ["2026", "modern", "alltime"];
const MODES = ["classic", "diehard"];
const TIMEFRAMES = ["today", "week", "all"];

export default function Leaderboard({ onBack, initial }) {
  const [era, setEra] = useState(initial?.era || "2026");
  const [mode, setMode] = useState(initial?.mode || "classic");
  const [tf, setTf] = useState("today");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(false);
  const [view, setView] = useState(null); // a row whose squad is open in the viewer

  useEffect(() => {
    let live = true;
    setRows(null); setErr(false);
    if (!boardConfigured()) { setErr(true); return; }
    topScores(era, mode, tf)
      .then((d) => { if (live) setRows(d); })
      .catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [era, mode, tf]);

  return (
    <div style={{ ...splash, justifyContent: "flex-start", paddingTop: "5vh", paddingBottom: 40 }}>
      <style>{FONTS}</style>

      <div style={{ width: "100%", maxWidth: 480, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} style={ghostBtn}>{`‹ ${t("action.menu")}`}</button>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, color: C.gold, letterSpacing: ".02em" }}>
          {t("action.leaderboard")}
        </div>
        <div style={{ width: 64 }} />
      </div>

      <div style={{ width: "100%", maxWidth: 480, padding: "0 16px", marginTop: 16 }}>
        <TabRow items={ERAS.map((k) => [k, t(`era.${k}`)])} active={era} onPick={setEra} color={C.gold} />
        <TabRow items={MODES.map((k) => [k, t(`mode.${k}`)])} active={mode} onPick={setMode} color={C.gold} />
        <TabRow items={TIMEFRAMES.map((k) => [k, t(`leaderboard.tf.${k}`)])} active={tf} onPick={setTf} color={C.green} />
      </div>

      <div style={{ width: "100%", maxWidth: 480, padding: "0 16px", marginTop: 18 }}>
        {rows === null && !err && <Msg text={t("leaderboard.loading")} />}
        {err && <Msg text={t("leaderboard.error")} color="#e07a5f" />}
        {rows && rows.length === 0 && <Msg text={t("leaderboard.empty")} />}
        {rows && rows.length > 0 && (
          <>
            {rows.map((row, i) => (
              <Row key={i} rank={i + 1} row={row} onView={() => setView(row)} />
            ))}
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: C.chalk, opacity: 0.5, textAlign: "center", marginTop: 10 }}>
              {t("leaderboard.tapToView")}
            </div>
          </>
        )}
      </div>

      {view && <SquadViewer row={view} diehard={mode === "diehard"} onClose={() => setView(null)} />}
    </div>
  );
}

function TabRow({ items, active, onPick, color }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      {items.map(([k, lbl]) => {
        const on = active === k;
        return (
          <button key={k} onClick={() => onPick(k)} style={{
            flex: 1, cursor: "pointer", fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 12.5,
            padding: "8px 4px", borderRadius: 5, border: `1px solid ${color}`,
            background: on ? color : "transparent", color: on ? C.ink : C.chalk,
          }}>{lbl}</button>
        );
      })}
    </div>
  );
}

function Row({ rank, row, onView }) {
  const top = rank === 1;
  return (
    <button onClick={onView} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
      padding: "10px 12px", borderRadius: 6, marginBottom: 6,
      background: top ? "rgba(233,196,106,.12)" : "rgba(255,255,255,.05)",
      border: `1px solid ${top ? C.gold : C.pitchLine}`,
    }}>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, width: 26, flexShrink: 0, color: top ? C.gold : C.chalk }}>{rank}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 15, color: C.chalk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
        <span style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: 11.5, color: C.chalk, opacity: 0.6 }}>
          {row.tier}{row.grade ? ` · ${row.grade}` : ""}
        </span>
      </span>
      <span style={{ fontFamily: "Inter, monospace", fontSize: 16, fontWeight: 700, color: C.gold, flexShrink: 0 }}>{row.elo}</span>
    </button>
  );
}

function SquadViewer({ row, diehard, onClose }) {
  const squad = row.squad || {};
  const seating = squad.players || {};
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 80, overflowY: "auto", padding: "24px 14px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.pitchDeep, border: `1px solid ${C.pitchLine}`, borderRadius: 12, padding: 16, width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.gold, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: C.chalk, opacity: 0.7 }}>
              {row.tier}{row.grade ? ` · ${row.grade}` : ""} · Elo {row.elo}
            </div>
          </div>
          <button onClick={onClose} style={ghostBtn}>✕</button>
        </div>
        {squad.formationName
          ? <SquadPitch seating={seating} formationName={squad.formationName} diehard={diehard} />
          : <Msg text={t("leaderboard.noSquad")} />}
      </div>
    </div>
  );
}

function Msg({ text, color }) {
  return <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: color || C.chalk, opacity: color ? 1 : 0.7, textAlign: "center", padding: 28 }}>{text}</div>;
}

const ghostBtn = { fontFamily: "Inter, sans-serif", fontSize: 13, color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "7px 14px", cursor: "pointer" };
