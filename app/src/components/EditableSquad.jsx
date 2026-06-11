import React, { useState, useRef } from "react";
import { t } from "../i18n/index.js";
import { C } from "../theme.js";
import { smoothScrollToEl } from "../util/scroll.js";
import { getFormation } from "../positions/formations.js";
import { seat, holdingFormations, bestLineup, moveSpots } from "../formation/offer.js";
import { reasonString } from "../formation/tighten.js";
import { FormationPicker, PitchBoard, LineBoard, PlacingBanner } from "./Board.jsx";

const NARROW = 760;

// A self-contained, MOVE-ONLY squad board (no spin/offer/placing-new-cards). The 11 cards are fixed
// — you can rearrange them and change formation, exactly like the draft board, but never add or
// remove anyone. Reuses the same pure helpers (seat/moveSpots/bestLineup) and the same Board.jsx
// presentational pieces as the Draft screen, so move/swap/relocate/formation-change behave identically.
// Fires onChange({ seating, formationName }) whenever the lineup or shape changes so the parent (the
// Style screen) always has the current edited lineup to hand to the tournament.
export default function EditableSquad({ initialSeating, initialFormation, diehard, onChange, showYear = true }) {
  const [formationName, setFormationName] = useState(initialFormation);
  const [placed] = useState(() => Object.values(initialSeating || {}).filter(Boolean));
  const [pins, setPins] = useState(() => {
    const m = new Map();
    for (const [sid, card] of Object.entries(initialSeating || {})) if (card) m.set(card.player_id, sid);
    return m;
  });
  const [picking, setPicking] = useState(null); // { mode:"move"|"relocate", card, spots, pending }
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  const boardRef = useRef(null);

  React.useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const narrow = w < NARROW;
  const formation = getFormation(formationName);
  const seating = seat(placed, formation, pins) || {};
  const holding = holdingFormations(placed, pins);
  const reason = reasonString(placed, formationName, pins);

  function emit(nextPins, fName) {
    const s = seat(placed, getFormation(fName), nextPins) || {};
    onChange && onChange({ seating: s, formationName: fName });
  }

  function switchFormation(name) {
    setFormationName(name);
    // Re-seat with the LEAST total positional degradation, keeping each player on the same token on a
    // tie — so a formation change moves people as little as possible (same logic as the draft board).
    const oldFormation = getFormation(formationName);
    const prevSeat = seat(placed, oldFormation, pins) || {};
    const prevTokenById = new Map();
    for (const [sid, card] of Object.entries(prevSeat)) {
      const slot = oldFormation.slots.find((s) => s.id === sid);
      if (slot) prevTokenById.set(card.player_id, slot.token);
    }
    const optimal = bestLineup(placed, name, prevTokenById);
    const next = new Map();
    for (const [sid, card] of Object.entries(optimal)) next.set(card.player_id, sid);
    setPins(next);
    setPicking(null);
    emit(next, name);
  }

  function refreshPins(fName, basePins) {
    const s = seat(placed, getFormation(fName), basePins) || seat(placed, getFormation(fName));
    const next = new Map();
    if (s) for (const [sid, card] of Object.entries(s)) next.set(card.player_id, sid);
    setPins(next);
    emit(next, fName);
    return next;
  }

  function openMove(card, pinsArg = pins) {
    setPicking({ mode: "move", card, formationName, spots: moveSpots(card, placed, formationName, pinsArg) });
    setTimeout(() => smoothScrollToEl(boardRef.current, 400), 0);
  }

  function handleSpot(slot) {
    if (!picking) return;
    const kind = kindById[slot.id];

    if (picking.mode === "relocate") {
      if (kind === "current") { resumePending(pins); return; }
      const withPin = new Map(pins);
      withPin.set(picking.card.player_id, slot.id);
      const finalPins = refreshPins(formationName, withPin);
      resumePending(finalPins);
      return;
    }

    // move mode
    if (kind === "current") { setPicking(null); return; }
    if (kind === "swap") { swapInto(slot); return; }
    if (kind === "bump") { startRelocate(slot); return; }
    moveTo(slot);
  }

  function startRelocate(slot) {
    const incumbent = seating[slot.id];
    if (!incumbent) return;
    const pending = { kind: picking.mode, card: picking.card };
    const spots = moveSpots(incumbent, placed, formationName, pins).filter((s) => s.kind !== "bump");
    setPicking({ mode: "relocate", card: incumbent, formationName, spots, pending });
    setTimeout(() => smoothScrollToEl(boardRef.current, 400), 0);
  }

  function resumePending(pinsArg) {
    const pending = picking && picking.pending;
    if (!pending) { setPicking(null); return; }
    openMove(pending.card, pinsArg);
  }

  function moveTo(slot) {
    const { card } = picking;
    const withPin = new Map(pins);
    for (const [pid, sid] of withPin) { if (sid === slot.id) withPin.delete(pid); }
    withPin.set(card.player_id, slot.id);
    refreshPins(formationName, withPin);
    setPicking(null);
  }

  function swapInto(slot) {
    const { card } = picking; // mover A
    const incumbent = seating[slot.id]; // B at the tapped slot
    const mySlotId = Object.keys(seating).find(
      (sid) => seating[sid] && seating[sid].player_id === card.player_id
    );
    const withPin = new Map(pins);
    withPin.set(card.player_id, slot.id);
    if (incumbent && mySlotId) withPin.set(incumbent.player_id, mySlotId);
    refreshPins(formationName, withPin);
    setPicking(null);
  }

  const pickSpotIds = new Set(picking ? picking.spots.map((s) => s.slot.id) : []);
  const effById = {};
  const kindById = {};
  if (picking) picking.spots.forEach((s) => { effById[s.slot.id] = s.effectiveness; kindById[s.slot.id] = s.kind; });

  const moving = picking && (picking.mode === "move" || picking.mode === "relocate");

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: C.chalk, opacity: 0.7 }}>{t("draft.tapToMove")}</div>
        <FormationPicker holding={holding} value={formationName} onChange={switchFormation} />
      </div>
      {reason && (
        <div style={{ marginBottom: 6, fontFamily: "Inter, sans-serif", fontSize: 12, color: C.gold, opacity: 0.9 }}>{reason}</div>
      )}
      <div ref={boardRef} style={{ position: "relative" }}>
        {narrow
          ? <LineBoard formation={formation} seating={seating} pickSpotIds={pickSpotIds} effById={effById} kindById={kindById} onSpot={handleSpot} onPlacedTap={picking ? null : openMove} diehard={diehard} placing={picking && picking.card} moving={moving} pending={picking && picking.pending} w={w} showYear={showYear} />
          : <PitchBoard formation={formation} seating={seating} pickSpotIds={pickSpotIds} effById={effById} kindById={kindById} onSpot={handleSpot} onPlacedTap={picking ? null : openMove} diehard={diehard} showYear={showYear} />}
        {!narrow && picking && picking.card && (
          <div style={{ marginTop: 10 }}>
            <PlacingBanner card={picking.card} diehard={diehard} moving={moving} pending={picking.pending} />
          </div>
        )}
      </div>
    </div>
  );
}
