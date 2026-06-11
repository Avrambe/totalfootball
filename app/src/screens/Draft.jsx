import React, { useState, useEffect, useRef } from "react";
import { t } from "../i18n/index.js";
import { C, FONTS, splash } from "../theme.js";
import Flag from "../components/Flag.jsx";
import { FormationPicker, PitchBoard, LineBoard, SlotChip, PlacingBanner } from "../components/Board.jsx";
import { smoothScrollToEl } from "../util/scroll.js";
import { getFormation, DEFAULT_FORMATION } from "../positions/formations.js";
import {
  seat, holdingFormations, offerState, targetFormationsFor, placementSpots, alreadyDrafted,
  bestLineup, moveSpots,
} from "../formation/offer.js";
import { reasonString } from "../formation/tighten.js";
import { validTargets, canRespin, squadCards, reelFrames } from "../spin/pools.js";
import { runReel, rnd, FRAMES } from "../spin/reel.js";

const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 };
const NARROW = 760;
const RESPINS_PER_DRAFT = 6; // one shared pool, spendable on country OR year (one at a time)

export default function Draft({ config, onComplete, onExit }) {
  const [formationName, setFormationName] = useState(DEFAULT_FORMATION);
  const [placed, setPlaced] = useState([]);
  const [pins, setPins] = useState(new Map());
  const is2026 = config.era === "2026";
  const [reel, setReel] = useState({ team: "—", year: is2026 ? 2026 : "—" });
  const [spinning, setSpinning] = useState(false);
  const [offer, setOffer] = useState(null);             // { teamCode, name, year, cards }
  const [current, setCurrent] = useState(null);          // the drawn squad { teamCode, name, year }
  const [respins, setRespins] = useState(RESPINS_PER_DRAFT); // shared pool, either axis
  const [picking, setPicking] = useState(null);          // { card, formationName, spots }
  const [formationChoice, setFormationChoice] = useState(null); // { card, options }
  const [toast, setToast] = useState(null);
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  const cancelRef = useRef(null);
  const didInit = useRef(false);
  const boardRef = useRef(null);
  const offerRef = useRef(null);
  const [reservedH, setReservedH] = useState(null); // hold the offer panel's height during a spin
  const narrow = w < NARROW;
  const diehard = config.mode === "diehard";

  const formation = getFormation(formationName);
  const seating = seat(placed, formation, pins) || {};
  const holding = holdingFormations(placed, pins);
  const reason = reasonString(placed, formationName, pins);
  const complete = placed.length === 11;

  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    spin([], DEFAULT_FORMATION, { reset: true });
    return () => cancelRef.current && cancelRef.current();
  }, []);

  // On phones, when a spin LANDS (first spin of the game, the auto-spin after a placement, or a
  // respin), slide the reel's country/flag pillbox to the top of the viewport so the offered players
  // that just appeared are visible below the fold without manual scrolling. Recycles 162-0's scroll
  // mechanism + timing (350ms). We trigger on the offer arriving (offer only ever becomes truthy when
  // a spin finishes — it's cleared to null while the reel tumbles), and defer one animation frame so
  // the freshly-rendered offer cards are laid out before we measure the scroll target. Desktop shows
  // both columns side-by-side, so no scroll is needed there.
  useEffect(() => {
    if (!narrow || !offer) return;
    const id = requestAnimationFrame(() => smoothScrollToEl(offerRef.current, 350));
    return () => cancelAnimationFrame(id);
  }, [offer, narrow]);

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }

  // Draw a squad onto the reel. Options: `reset` => fresh spin event (shared respin pool back to
  // RESPINS_PER_DRAFT); `fix` pins one axis ({year} reroll country, {teamCode} reroll year); `axes`
  // chooses which reel axes tumble (defaults to both, year locked in the 2026 era).
  function spin(placedArg, fName, { reset = false, fix = null, axes = null } = {}) {
    const targets = validTargets(config.era, placedArg, fName, fix);
    if (!targets.length) return;
    // A respin must actually change the live axis: drop the current value so we never re-land on it.
    // (Single-axis respins only; full draws pass current=null so nothing is excluded.)
    let pool = targets;
    if (axes && current) {
      if (axes.team && !axes.year) pool = targets.filter((s) => s.teamCode !== current.teamCode);
      else if (axes.year && !axes.team) pool = targets.filter((s) => s.year !== current.year);
      if (!pool.length) pool = targets;
    }
    const pick = rnd(pool);
    // Reserve the offer panel's current height for the duration of the spin. Clearing `offer` below
    // unmounts the tall player list, which would shrink the page and make the browser yank the
    // scroll position upward (a jarring jump to the top) — then the spin-landed effect would scroll
    // back down. Pinning the height keeps the document tall, so the viewport doesn't move on spin;
    // only the intended landing scroll runs. (Measured synchronously before React applies the state
    // updates below, so the DOM still reflects the old list height.)
    if (offerRef.current) setReservedH(offerRef.current.offsetHeight);
    setSpinning(true);
    setOffer(null);
    setPicking(null);
    if (reset) setRespins(RESPINS_PER_DRAFT);
    setCurrent({ teamCode: pick.teamCode, name: pick.name, year: pick.year });
    cancelRef.current && cancelRef.current();
    const useAxes = axes || { team: true, year: !is2026 };
    cancelRef.current = runReel({
      frames: reelFrames(config.era, pick, useAxes, FRAMES),
      target: pick,
      onFrame: setReel,
      onDone: () => {
        setOffer({ teamCode: pick.teamCode, name: pick.name, year: pick.year, cards: squadCards(pick.teamCode, pick.year) });
        setSpinning(false);
        setReservedH(null); // the real list is back to provide height; drop the reservation
      },
    });
  }

  // Reroll just the country (hold the year). Tumbles the team axis only. Spends one shared respin.
  function respinCountry() {
    if (spinning || respins <= 0 || !current) return;
    setRespins((r) => r - 1);
    spin(placed, formationName, { fix: { year: current.year }, axes: { team: true, year: false } });
  }

  // Reroll just the year (hold the country). Tumbles the year axis only. Not available in 2026.
  // Spends one from the same shared pool as the country reroll.
  function respinYear() {
    if (spinning || respins <= 0 || !current || is2026) return;
    setRespins((r) => r - 1);
    spin(placed, formationName, { fix: { teamCode: current.teamCode }, axes: { team: false, year: true } });
  }

  function switchFormation(name) {
    setFormationName(name);
    // Re-seat with the LEAST total positional degradation (max-effectiveness assignment), and on a
    // tie keep each player on the same position token he already had — so a formation change moves
    // people as little as possible. The user can hand-edit afterwards.
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
  }

  function refreshPins(placedArg, fName, basePins) {
    const s = seat(placedArg, getFormation(fName), basePins) || seat(placedArg, getFormation(fName));
    const next = new Map();
    if (s) for (const [sid, card] of Object.entries(s)) next.set(card.player_id, sid);
    setPins(next);
    return next;
  }

  function tapCard(card) {
    if (spinning) return;
    // Tapping the player you're currently placing again cancels the selection (toggle off). Tapping a
    // DIFFERENT offer player still switches to them (falls through below).
    if (picking && picking.mode === "place" && picking.card.player_id === card.player_id) {
      setPicking(null);
      return;
    }
    const state = offerState(card, placed, formationName);
    if (state === "grey") {
      flashToast(alreadyDrafted(card, placed) ? t("draft.alreadyDrafted") : t("draft.greyHint"));
      return;
    }
    if (state === "green") { openPick(card, formationName); return; }
    // yellow
    const targets = targetFormationsFor(card, placed, formationName);
    if (targets.length === 1) {
      switchFormation(targets[0]);
      flashToast(t("draft.switched", { f: targets[0] }));
      openPick(card, targets[0]);
    } else {
      setFormationChoice({ card, options: targets });
    }
  }

  function openPick(card, fName, pinsArg = pins) {
    setPicking({ mode: "place", card, formationName: fName, spots: placementSpots(card, placed, fName, pinsArg) });
    // Bring the board (and its now-highlighted slots) into view — useful on narrow screens where
    // the board sits above the offer list. Mirrors 162-0's auto-scroll.
    setTimeout(() => smoothScrollToEl(boardRef.current, 400), 0);
  }

  // Tap a player already ON the board → show his current slot's % plus every other slot he could move
  // to (with its %), and let the user move him there. `pinsArg` lets the resume-after-relocate path
  // pass the freshly-updated pins (React state hasn't flushed yet at that moment).
  function openMove(card, pinsArg = pins) {
    if (spinning) return;
    setPicking({ mode: "move", card, formationName, spots: moveSpots(card, placed, formationName, pinsArg) });
    setTimeout(() => smoothScrollToEl(boardRef.current, 400), 0);
  }

  function chooseFormationForCard(card, name) {
    switchFormation(name);
    flashToast(t("draft.switched", { f: name }));
    setFormationChoice(null);
    openPick(card, name);
  }

  // The board calls this when a highlighted slot is tapped. Tapping an OCCUPIED ("bump") slot never
  // silently displaces the incumbent — instead it switches into "relocate" mode: the user must first
  // move the incumbent to a free slot, which frees the original slot, and then the original
  // place/move action resumes so the user taps the now-open slot to finish (162-0 style).
  function handleSpot(slot) {
    if (!picking) return;
    const kind = kindById[slot.id];

    if (picking.mode === "relocate") {
      // Tapping the incumbent's own slot cancels the relocate and resumes the pending action.
      if (kind === "current") { resumePending(pins); return; }
      // Move the incumbent into the chosen free slot, then resume the interrupted place/move.
      const withPin = new Map(pins);
      withPin.set(picking.card.player_id, slot.id);
      const finalPins = refreshPins(placed, formationName, withPin);
      resumePending(finalPins);
      return;
    }

    if (picking.mode === "move") {
      if (kind === "current") { setPicking(null); return; }
      if (kind === "swap") { swapInto(slot); return; }
      if (kind === "bump") { startRelocate(slot); return; }
      moveTo(slot);
      return;
    }

    // place mode
    if (kind === "bump") { startRelocate(slot); return; }
    placeAt(slot);
  }

  // The user tapped an occupied slot. Park the current action as `pending` and ask the user to move
  // the incumbent to a free slot first. Only OPEN slots are offered for the incumbent (single level:
  // because eligibility is line-membership and a bump guarantees a free slot exists in that line, one
  // open move is always enough — no chained displacements).
  function startRelocate(slot) {
    const incumbent = seating[slot.id];
    if (!incumbent) return;
    const pending = { kind: picking.mode, card: picking.card };
    const spots = moveSpots(incumbent, placed, formationName, pins).filter((s) => s.kind !== "bump");
    setPicking({ mode: "relocate", card: incumbent, formationName, spots, pending });
    setTimeout(() => smoothScrollToEl(boardRef.current, 400), 0);
  }

  // Resume the action interrupted by a relocate, using the freshly-updated pins (React state hasn't
  // flushed yet, so we pass the map explicitly).
  function resumePending(pinsArg) {
    const pending = picking && picking.pending;
    if (!pending) { setPicking(null); return; }
    if (pending.kind === "place") openPick(pending.card, formationName, pinsArg);
    else openMove(pending.card, pinsArg);
  }

  function moveTo(slot) {
    const { card } = picking;
    const withPin = new Map(pins);
    // Free the target slot's pin so its incumbent re-seats elsewhere in his line, then pin the mover.
    for (const [pid, sid] of withPin) { if (sid === slot.id) withPin.delete(pid); }
    withPin.set(card.player_id, slot.id);
    refreshPins(placed, formationName, withPin);
    setPicking(null);
  }

  // Two placed players exchange slots: the mover (A) takes the tapped slot, the incumbent (B) takes
  // the mover's old slot. Works even on a full XI since neither needs an empty slot.
  function swapInto(slot) {
    const { card } = picking; // mover A
    const incumbent = seating[slot.id]; // B at the tapped slot
    const mySlotId = Object.keys(seating).find(
      (sid) => seating[sid] && seating[sid].player_id === card.player_id
    );
    const withPin = new Map(pins);
    withPin.set(card.player_id, slot.id);
    if (incumbent && mySlotId) withPin.set(incumbent.player_id, mySlotId);
    refreshPins(placed, formationName, withPin);
    setPicking(null);
  }

  function placeAt(slot) {
    const { card, formationName: fName } = picking;
    const newPlaced = [...placed, card];
    const withPin = new Map(pins);
    // If the chosen slot is occupied, drop the incumbent's pin so he can be re-seated elsewhere
    // in his line (placement-with-displacement); the new card then claims the slot.
    for (const [pid, sid] of withPin) { if (sid === slot.id) withPin.delete(pid); }
    withPin.set(card.player_id, slot.id);
    setFormationName(fName);
    setPlaced(newPlaced);
    const finalPins = refreshPins(newPlaced, fName, withPin);
    setPicking(null);
    setOffer(null);
    if (newPlaced.length === 11) {
      const finalSeat = seat(newPlaced, getFormation(fName), finalPins) || {};
      flashToast(t("draft.complete"));
      // hold the completed seating for the result stub; user taps RUN IT to proceed
      setReel({ team: "✓", year: "" });
      window.__finalSquad = { seating: finalSeat, formationName: fName };
    } else {
      // Global respin budget: the next squad auto-spins WITHOUT resetting the allowance, so the
      // shared pool of respins is scarce across the whole draft (only the initial spin seeds them).
      // The spin-landed effect (above) scrolls the reel to the top on phones once the new offer
      // renders, so the fresh offer is in view — no separate scroll needed here.
      spin(newPlaced, fName, { reset: false });
    }
  }

  const pickSpotIds = new Set(picking ? picking.spots.map((s) => s.slot.id) : []);
  const effById = {};
  const kindById = {};
  if (picking) picking.spots.forEach((s) => { effById[s.slot.id] = s.effectiveness; kindById[s.slot.id] = s.kind; });

  // Is there another squad to land on when rerolling a single axis? Disables a respin with no option.
  const canCountry = !!current && canRespin(config.era, placed, formationName, { year: current.year }, current);
  const canYear = !is2026 && !!current && canRespin(config.era, placed, formationName, { teamCode: current.teamCode }, current);

  return (
    <div style={{ ...splash, justifyContent: "flex-start", padding: narrow ? "10px" : "16px 22px" }}>
      <style>{FONTS}</style>

      {/* Header */}
      <div style={{ width: "100%", maxWidth: 1080, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={onExit} style={ghostBtn}>‹ {t("action.menu")}</button>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: C.chalk, opacity: 0.8 }}>
          {t(`era.${config.era}`)} · {t(`mode.${config.mode}`)}
        </div>
        <div style={{ flex: 1 }} />
        {/* On phones the picker stays in the header; on desktop it moves onto the pitch (below). */}
        {narrow && <FormationPicker holding={holding} value={formationName} onChange={switchFormation} />}
      </div>
      {reason && (
        <div style={{ width: "100%", maxWidth: 1080, marginTop: 6, fontFamily: "Inter, sans-serif", fontSize: 12, color: C.gold, opacity: 0.9 }}>
          {reason}
        </div>
      )}

      {/* Body */}
      <div style={{ width: "100%", maxWidth: 1080, marginTop: 14, display: "flex", gap: 18, flexDirection: narrow ? "column" : "row", alignItems: "flex-start" }}>
        <div ref={boardRef} style={{ position: "relative", flex: narrow ? "none" : "0 0 420px", width: narrow ? "100%" : 420 }}>
          {/* Desktop: overlay the formation picker in the pitch's top-right corner, next to the
              layout it controls (clear of the forwards row + markings). */}
          {!narrow && (
            <div style={{ position: "absolute", top: 10, right: 10, zIndex: 5 }}>
              <FormationPicker holding={holding} value={formationName} onChange={switchFormation} />
            </div>
          )}
          {narrow
            ? <LineBoard formation={formation} seating={seating} pickSpotIds={pickSpotIds} effById={effById} kindById={kindById} onSpot={handleSpot} onPlacedTap={picking ? null : openMove} diehard={diehard} placing={picking && picking.card} moving={picking && (picking.mode === "move" || picking.mode === "relocate")} pending={picking && picking.pending} w={w} showYear={!is2026} />
            : <PitchBoard formation={formation} seating={seating} pickSpotIds={pickSpotIds} effById={effById} kindById={kindById} onSpot={handleSpot} onPlacedTap={picking ? null : openMove} diehard={diehard} showYear={!is2026} />}
          {/* Desktop: the "placing" banner sits BELOW the pitch (clear of the top-right formation
              picker), rather than overlaid on the pitch's top edge where it collided. */}
          {!narrow && picking && picking.card && (
            <div style={{ marginTop: 10 }}>
              <PlacingBanner card={picking.card} diehard={diehard} moving={picking.mode === "move" || picking.mode === "relocate"} pending={picking.pending} />
            </div>
          )}
          <div style={{ fontFamily: "Inter, monospace", fontSize: 11, color: C.chalk, opacity: 0.6, marginTop: 8, textAlign: "center" }}>
            {t("draft.placedCount", { n: placed.length })}
          </div>
        </div>

        <div ref={offerRef} style={{ flex: 1, width: "100%", minHeight: spinning && reservedH ? reservedH : undefined }}>
          {complete
            ? <CompletePanel onRun={() => onComplete(window.__finalSquad || { seating, formationName })} />
            : <OfferPanel
                reel={reel} spinning={spinning} offer={offer} respins={respins}
                onRespinCountry={respinCountry} onRespinYear={respinYear} canCountry={canCountry} canYear={canYear}
                onTap={tapCard} placed={placed} formationName={formationName}
                diehard={diehard} picking={picking} era={config.era} current={current}
              />}
        </div>
      </div>

      {formationChoice && (
        <Modal onClose={() => setFormationChoice(null)} title={t("draft.chooseFormation")}>
          {formationChoice.options.map((name) => (
            <button key={name} onClick={() => chooseFormationForCard(formationChoice.card, name)} style={modalBtn}>{name}</button>
          ))}
        </Modal>
      )}

      {toast && (
        <div style={toastStyle}>{toast}</div>
      )}
    </div>
  );
}

/* ---------- Offer panel ---------- */
function OfferPanel({ reel, spinning, offer, respins, onRespinCountry, onRespinYear, canCountry, canYear, onTap, placed, formationName, diehard, picking, era, current }) {
  let cards = offer ? offer.cards.slice() : [];
  cards = cards.filter((c) => c.team_code);
  if (diehard) cards.sort((a, b) => (POS_ORDER[a.position] - POS_ORDER[b.position]) || a.name.localeCompare(b.name));
  else cards.sort((a, b) => b.wc_rating - a.wc_rating);

  const is2026 = era === "2026";
  const noRespins = respins <= 0;
  const countryDisabled = spinning || respins <= 0 || !canCountry;
  const yearDisabled = spinning || respins <= 0 || !canYear;

  return (
    <div style={{ background: "rgba(0,0,0,.28)", border: `1px solid ${C.pitchLine}`, borderRadius: 10, padding: 14 }}>
      {/* Reel */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 12, justifyContent: "center" }}>
        <ReelBox label={reel.team} code={reel.code || (current ? current.teamCode : null)} />
        {!is2026 && reel.year !== "" && <ReelBox label={String(reel.year)} />}
      </div>

      {/* Shared respin pool spendable on either axis (one at a time). Country always; year only when
          the era draws a year. In the 2026 era there is no year axis, so the single button reads
          "SPIN AGAIN" instead of "RESPIN COUNTRY". The remaining count is shown once, below. */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={onRespinCountry} disabled={countryDisabled} style={{ ...actionBtn, opacity: countryDisabled ? 0.4 : 1, cursor: countryDisabled ? "default" : "pointer" }}>
          {is2026 ? t("action.spinAgain") : t("draft.respinCountry")}
        </button>
        {!is2026 && (
          <button onClick={onRespinYear} disabled={yearDisabled} style={{ ...actionBtn, opacity: yearDisabled ? 0.4 : 1, cursor: yearDisabled ? "default" : "pointer" }}>
            {t("draft.respinYear")}
          </button>
        )}
      </div>
      <div style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 12, color: C.gold, opacity: 0.85, marginTop: 8 }}>
        {t("draft.respinsLeft", { n: respins })}
      </div>
      <div style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: 11.5, color: C.chalk, opacity: 0.7, marginTop: 8 }}>
        {picking ? t("draft.pickSpot") : noRespins ? t("draft.mustCommit") : t("draft.tapPlayer")}
      </div>

      {/* Squad offer list */}
      {offer && !spinning && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 }}>
            <Flag code={offer.teamCode} h={20} />
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: C.gold }}>
              {offer.name}{!is2026 && offer.year ? ` ${offer.year}` : ""}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 6, marginTop: 10 }}>
            {cards.map((card) => {
              const state = offerState(card, placed, formationName);
              const isPick = picking && picking.card.player_id === card.player_id;
              return <OfferCard key={card.player_id} card={card} state={state} active={isPick} diehard={diehard} onClick={() => onTap(card)} />;
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ReelBox({ label, code }) {
  return (
    <div style={{
      fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: C.ink, background: C.chalk,
      borderRadius: 6, padding: "10px 16px", flex: "1 1 0", minWidth: 0, maxWidth: 190, textAlign: "center",
      letterSpacing: ".01em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}>
      {code && <Flag code={code} h={18} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function OfferCard({ card, state, active, diehard, onClick }) {
  const color = state === "green" ? C.green : state === "yellow" ? C.yellow : C.grey;
  const clickable = state !== "grey";
  return (
    <button onClick={onClick} disabled={!clickable} style={{
      textAlign: "left", cursor: clickable ? "pointer" : "default",
      background: active ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.05)",
      border: `1px solid ${color}`, borderLeft: `4px solid ${color}`,
      borderRadius: 5, padding: "7px 9px", opacity: state === "grey" ? 0.5 : 1,
    }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 13, color: C.chalk }}>{card.name}</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: C.chalk, opacity: 0.7 }}>
        {t(`pos.${card.position}`)}{diehard ? "" : ` · ${card.wc_rating} · ${card.age}y`}
      </div>
    </button>
  );
}

function CompletePanel({ onRun }) {
  return (
    <div style={{ background: "rgba(0,0,0,.28)", border: `1px solid ${C.green}`, borderRadius: 10, padding: 24, textAlign: "center" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: C.green }}>{t("draft.complete")}</div>
      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: C.chalk, opacity: 0.8, marginTop: 8 }}>{t("draft.completeHint")}</div>
      <button onClick={onRun} style={{ ...actionBtn, marginTop: 18, background: C.green, fontSize: 20, padding: "12px 40px" }}>{t("action.chooseStyle")}</button>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.pitchDeep, border: `1px solid ${C.pitchLine}`, borderRadius: 10, padding: 20, minWidth: 240 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 15, color: C.chalk, marginBottom: 12 }}>{title}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
      </div>
    </div>
  );
}

const ghostBtn ={ fontFamily: "Inter, sans-serif", fontSize: 13, color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 5, padding: "7px 12px", cursor: "pointer" };
const actionBtn = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: ".06em", color: C.ink, background: C.gold, border: "none", borderRadius: 6, padding: "10px 22px", cursor: "pointer" };
const modalBtn = { fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 15, color: C.ink, background: C.gold, border: "none", borderRadius: 5, padding: "10px 18px", cursor: "pointer" };
const toastStyle = { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.ink, color: C.chalk, fontFamily: "Inter, sans-serif", fontSize: 13, padding: "10px 18px", borderRadius: 6, border: `1px solid ${C.gold}`, zIndex: 60 };
