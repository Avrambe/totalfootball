import React from "react";
import { t } from "../i18n/index.js";
import { C } from "../theme.js";
import Flag from "./Flag.jsx";

// Shared presentational board pieces used by BOTH the Draft screen and the Style screen's editable
// squad. These are pure / prop-driven (no state) — the owning screen supplies the seating, the
// highlight sets, and the tap handlers. Extracted from Draft.jsx so the Style screen can reuse the
// exact same pitch, line rows, slot chips, formation dropdown, and "placing/moving" banner.

/* ---------- Formation dropdown ---------- */
export function FormationPicker({ holding, value, onChange }) {
  // A native <select> auto-sizes to its WIDEST option ("4-2-3-1"), so a 3-number shape
  // like "4-3-3" would still get that wide box. Set an explicit width from the SELECTED
  // value's length so the button stays snug for the common three-row shapes and only grows
  // for the longer "4-2-3-1". (+44px covers padding + the dropdown arrow.)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14, color: C.ink,
      background: C.gold, border: "none", borderRadius: 5, padding: "8px 12px", cursor: "pointer",
      width: `calc(${value.length}ch + 44px)`,
    }}>
      {holding.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
    </select>
  );
}

/* ---------- Pitch board (desktop) ---------- */
// Conventional single-team lineup view: the XI attacks UP, so the halfway line + center circle sit
// at the TOP (the attacking edge, just above the forwards) and the penalty area is at the BOTTOM
// around the keeper. A line color reused for all markings.
export function PitchBoard({ formation, seating, pickSpotIds, effById, kindById, onSpot, onPlacedTap, diehard, showYear }) {
  const ln = `1px solid ${C.pitchLine}`;
  return (
    <div style={{
      position: "relative", width: "100%", height: 540, borderRadius: 10,
      background: `linear-gradient(${C.pitch} 0%, ${C.pitchDeep} 100%)`,
      border: `1px solid ${C.pitchLine}`, overflow: "hidden",
    }}>
      {/* pitch markings — halfway line + center circle at the top */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "4%", borderTop: ln }} />
      <div style={{ position: "absolute", left: "50%", top: "4%", width: 150, height: 150, transform: "translate(-50%,-50%)", border: ln, borderRadius: "50%" }} />
      {/* penalty box + 6-yard box at the bottom, around the keeper */}
      <div style={{ position: "absolute", left: "50%", bottom: 0, width: "46%", height: "17%", transform: "translateX(-50%)", border: ln, borderBottom: "none", borderRadius: "3px 3px 0 0" }} />
      <div style={{ position: "absolute", left: "50%", bottom: 0, width: "24%", height: "7%", transform: "translateX(-50%)", border: ln, borderBottom: "none", borderRadius: "3px 3px 0 0" }} />
      {/* penalty arc (the "D") — an upward-bulging semicircle on top of the box; its lower half is
          clipped by the board's overflow:hidden via the negative offset trick (only the cap shows) */}
      <div style={{ position: "absolute", left: "50%", bottom: "17%", width: "20%", height: "10%", transform: "translateX(-50%)", borderTop: ln, borderLeft: ln, borderRight: ln, borderRadius: "60px 60px 0 0" }} />

      {formation.slots.map((slot) => (
        <div key={slot.id} style={{ position: "absolute", left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, transform: "translate(-50%,-50%)", zIndex: 2 }}>
          <SlotChip slot={slot} card={seating[slot.id]} highlight={pickSpotIds.has(slot.id)} eff={effById[slot.id]} kind={kindById[slot.id]} onSpot={onSpot} onPlacedTap={onPlacedTap} diehard={diehard} showYear={showYear} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Line rows (narrow / mobile) ---------- */
export function LineBoard({ formation, seating, pickSpotIds, effById, kindById, onSpot, onPlacedTap, diehard, placing, moving, pending, w, showYear }) {
  // Rows follow the formation's pitch bands (slot.y), attack at top -> keeper at bottom, so a
  // "4-2-3-1" reads as four outfield lines here too — matching the desktop pitch and the name.
  const bands = [...new Set(formation.slots.map((s) => s.y))].sort((a, b) => a - b);
  // Fit the WIDEST line on one row (no wrap), so a back-five never breaks across rows. Compute the
  // chip width from the viewport and the widest band; shrink down to MIN (with smaller text) before
  // we'd ever wrap. Each row gets a faint box so the formation lines read as distinct units.
  const maxInLine = Math.max(...bands.map((y) => formation.slots.filter((s) => s.y === y).length));
  const GAP = 5, OUTER = 8 * 2, ROWPAD = 6 * 2, MIN = 50, MAX = 78;
  const avail = Math.min(w, 760) - OUTER - ROWPAD;
  const chipW = Math.max(MIN, Math.min(MAX, Math.floor((avail - (maxInLine - 1) * GAP) / maxInLine)));
  return (
    <div style={{ borderRadius: 10, background: `linear-gradient(${C.pitch} 0%, ${C.pitchDeep} 100%)`, border: `1px solid ${C.pitchLine}`, padding: "14px 8px" }}>
      {placing && <PlacingBanner card={placing} diehard={diehard} moving={moving} pending={pending} />}
      {bands.map((y) => (
        <div key={y} style={{ display: "flex", justifyContent: "center", gap: GAP, margin: "8px 0", padding: "6px 4px", flexWrap: "nowrap", border: "1px solid rgba(255,255,255,.06)", background: "rgba(255,255,255,.02)", borderRadius: 8 }}>
          {formation.slots.filter((s) => s.y === y).sort((a, b) => a.x - b.x).map((slot) => (
            <SlotChip key={slot.id} slot={slot} card={seating[slot.id]} highlight={pickSpotIds.has(slot.id)} eff={effById[slot.id]} kind={kindById[slot.id]} onSpot={onSpot} onPlacedTap={onPlacedTap} diehard={diehard} width={chipW} showYear={showYear} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SlotChip({ slot, card, highlight, eff, kind, onSpot, onPlacedTap, diehard, width = 78, showYear }) {
  const small = width < 64; // shrink text a step so 5-across still reads on a phone
  const base = {
    width, minHeight: 46, borderRadius: 6, padding: "5px 4px",
    fontFamily: "Inter, sans-serif", textAlign: "center", boxSizing: "border-box",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  };
  if (highlight) {
    // "current" = where the player being moved sits now (gold, not a move target — tapping cancels);
    // "swap" = an occupied slot whose player can trade places with the mover -> blue;
    // "bump" = an occupied slot he can take (the incumbent re-seats) -> yellow; "open" = empty -> green.
    const hl = kind === "current" ? C.gold : kind === "swap" ? "#5ab1ff" : kind === "bump" ? C.yellow : C.green;
    const bg = kind === "current" ? "rgba(212,175,55,.25)" : kind === "swap" ? "rgba(90,177,255,.20)" : kind === "bump" ? "rgba(245,200,66,.20)" : "rgba(61,220,132,.22)";
    return (
      <button onClick={() => onSpot(slot)} style={{ ...base, cursor: "pointer", background: bg, border: `2px solid ${hl}`, color: C.chalk }}>
        {card ? (
          // Occupied target: keep the incumbent visible (who's here now, but movable) — show his
          // name + flag (+ rating in classic) inside the colored highlight, with the move-fit % below.
          <>
            <div style={{ fontSize: small ? 9 : 10, opacity: 0.8, fontWeight: 700 }}>{slot.token}</div>
            <div style={{ fontSize: small ? 9 : 10.5, lineHeight: 1.1, fontWeight: 600, maxWidth: "100%", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.name}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: small ? 8.5 : 9.5 }}>
              <Flag code={card.team_code} h={10} />
              {!diehard && <span style={{ opacity: 0.75 }}>{card.wc_rating}</span>}
              {!diehard && eff != null && <span style={{ color: hl, fontWeight: 700 }}>· {Math.round(eff * 100)}%</span>}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: small ? 11 : 13 }}>{slot.token}</div>
            {!diehard && eff != null && <div style={{ fontSize: small ? 9 : 10.5, color: hl }}>{Math.round(eff * 100)}%</div>}
          </>
        )}
      </button>
    );
  }
  if (card) {
    const tappable = !!onPlacedTap;
    const Tag = tappable ? "button" : "div";
    return (
      <Tag onClick={tappable ? () => onPlacedTap(card) : undefined} style={{ ...base, background: "rgba(0,0,0,.35)", border: `1px solid ${C.pitchLine}`, color: C.chalk, cursor: tappable ? "pointer" : "default" }}>
        <div style={{ fontSize: small ? 9 : 10, opacity: 0.7, fontWeight: 700 }}>{slot.token}</div>
        <div style={{ fontSize: small ? 9 : 10.5, lineHeight: 1.1, fontWeight: 600, maxWidth: "100%", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: small ? 8.5 : 9.5, opacity: 0.75 }}>
          <Flag code={card.team_code} h={10} />
          {!diehard && <span>{card.wc_rating}</span>}
          {showYear && card.year ? <span>· {small ? `'${String(card.year).slice(2)}` : card.year}</span> : null}
        </div>
      </Tag>
    );
  }
  return (
    <div style={{ ...base, background: "rgba(255,255,255,.04)", border: `1px dashed ${C.pitchLine}`, color: C.chalk, opacity: 0.55 }}>
      <div style={{ fontSize: small ? 10 : 12, fontWeight: 700 }}>{slot.token}</div>
    </div>
  );
}

/* ---------- "Placing X" banner shown on the board while picking a spot ---------- */
export function PlacingBanner({ card, diehard, overlay, moving, pending }) {
  const wrap = overlay
    ? { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, background: "rgba(0,0,0,.6)", borderBottom: `2px solid ${C.gold}`, borderRadius: "10px 10px 0 0" }
    : { background: "rgba(0,0,0,.5)", border: `1px solid ${C.gold}`, borderRadius: 6, marginBottom: 10 };
  return (
    <div style={{ ...wrap, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "7px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10.5, letterSpacing: ".18em", color: C.gold, opacity: 0.9 }}>{moving ? t("draft.moving") : t("draft.placing")}</span>
        <Flag code={card.team_code} h={14} />
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14, color: C.chalk }}>{card.name}</span>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: C.chalk, opacity: 0.7 }}>· {t(`pos.${card.position}`)}</span>
      </div>
      {pending && (
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: C.chalk, opacity: 0.6 }}>
          {t("draft.toMakeRoom", { name: pending.card.name })}
        </span>
      )}
    </div>
  );
}
