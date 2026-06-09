import React, { useState, useEffect } from "react";
import { C } from "../theme.js";
import Flag from "./Flag.jsx";
import { lastName } from "../util/name.js";
import { getFormation } from "../positions/formations.js";

// Read-only pitch for the Result screen: shows the XI you drafted. Mirrors the draft board's markings
// and slot.{x,y} positioning, but with no draft interactivity (no picking/highlight). Desktop = a real
// pitch (chips at formation coordinates); narrow = line-grouped rows. Ratings shown only in classic.
const NARROW = 760;

export default function SquadPitch({ seating, formationName, diehard, height = 460 }) {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const narrow = w < NARROW;
  const formation = getFormation(formationName);
  if (!formation) return null;
  return narrow
    ? <LineView formation={formation} seating={seating} diehard={diehard} />
    : <PitchView formation={formation} seating={seating} diehard={diehard} height={height} />;
}

function PitchView({ formation, seating, diehard, height }) {
  const ln = `1px solid ${C.pitchLine}`;
  return (
    <div style={{
      position: "relative", width: "100%", height, borderRadius: 10,
      background: `linear-gradient(${C.pitch} 0%, ${C.pitchDeep} 100%)`,
      border: `1px solid ${C.pitchLine}`, overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: "4%", borderTop: ln }} />
      <div style={{ position: "absolute", left: "50%", top: "4%", width: 130, height: 130, transform: "translate(-50%,-50%)", border: ln, borderRadius: "50%" }} />
      <div style={{ position: "absolute", left: "50%", bottom: 0, width: "46%", height: "17%", transform: "translateX(-50%)", border: ln, borderBottom: "none", borderRadius: "3px 3px 0 0" }} />
      <div style={{ position: "absolute", left: "50%", bottom: 0, width: "24%", height: "7%", transform: "translateX(-50%)", border: ln, borderBottom: "none", borderRadius: "3px 3px 0 0" }} />
      <div style={{ position: "absolute", left: "50%", bottom: "17%", width: "20%", height: "10%", transform: "translateX(-50%)", borderTop: ln, borderLeft: ln, borderRight: ln, borderRadius: "60px 60px 0 0" }} />

      {formation.slots.map((slot) => (
        <div key={slot.id} style={{ position: "absolute", left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, transform: "translate(-50%,-50%)", zIndex: 2 }}>
          <Chip slot={slot} card={seating[slot.id]} diehard={diehard} />
        </div>
      ))}
    </div>
  );
}

function LineView({ formation, seating, diehard }) {
  const bands = [...new Set(formation.slots.map((s) => s.y))].sort((a, b) => a - b);
  return (
    <div style={{ borderRadius: 10, background: `linear-gradient(${C.pitch} 0%, ${C.pitchDeep} 100%)`, border: `1px solid ${C.pitchLine}`, padding: "14px 8px" }}>
      {bands.map((y) => (
        <div key={y} style={{ display: "flex", justifyContent: "center", gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
          {formation.slots.filter((s) => s.y === y).sort((a, b) => a.x - b.x).map((slot) => (
            <Chip key={slot.id} slot={slot} card={seating[slot.id]} diehard={diehard} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Chip({ slot, card, diehard }) {
  const base = {
    width: 78, minHeight: 46, borderRadius: 6, padding: "5px 6px",
    fontFamily: "Oswald, sans-serif", textAlign: "center",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,.35)", border: `1px solid ${C.pitchLine}`, color: C.chalk,
  };
  if (!card) {
    return <div style={{ ...base, background: "rgba(255,255,255,.04)", border: `1px dashed ${C.pitchLine}`, opacity: 0.55 }}><div style={{ fontSize: 12, fontWeight: 700 }}>{slot.token}</div></div>;
  }
  return (
    <div style={base}>
      <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 700 }}>{slot.token}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.15, fontWeight: 600 }}>{lastName(card.name)}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 9.5, opacity: 0.75 }}>
        <Flag code={card.team_code} h={10} />
        {!diehard && <span>{card.wc_rating}</span>}
      </div>
    </div>
  );
}
