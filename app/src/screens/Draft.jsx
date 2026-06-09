import React, { useState, useEffect, useRef } from "react";
import { t } from "../i18n/index.js";
import { C, FONTS, splash } from "../theme.js";
import Flag from "../components/Flag.jsx";
import { smoothScrollToEl } from "../util/scroll.js";
import { lastName } from "../util/name.js";
import { getFormation, DEFAULT_FORMATION } from "../positions/formations.js";
import {
  seat, holdingFormations, offerState, targetFormationsFor, validSpots,
} from "../formation/offer.js";
import { reasonString } from "../formation/tighten.js";
import { validTargets, canRespin, squadCards, reelFrames } from "../spin/pools.js";
import { runReel, rnd, FRAMES } from "../spin/reel.js";

const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 };
const NARROW = 760;

export default function Draft({ config, onComplete, onExit }) {
  const [formationName, setFormationName] = useState(DEFAULT_FORMATION);
  const [placed, setPlaced] = useState([]);
  const [pins, setPins] = useState(new Map());
  const is2026 = config.era === "2026";
  const [reel, setReel] = useState({ team: "—", year: is2026 ? 2026 : "—" });
  const [spinning, setSpinning] = useState(false);
  const [offer, setOffer] = useState(null);             // { teamCode, name, year, cards }
  const [current, setCurrent] = useState(null);          // the drawn squad { teamCode, name, year }
  const [respins, setRespins] = useState({ team: 3, year: 3 }); // independent per-axis allowance
  const [picking, setPicking] = useState(null);          // { card, formationName, spots }
  const [formationChoice, setFormationChoice] = useState(null); // { card, options }
  const [toast, setToast] = useState(null);
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  const cancelRef = useRef(null);
  const didInit = useRef(false);
  const boardRef = useRef(null);
  const offerRef = useRef(null);
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

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }

  // Draw a squad onto the reel. Options: `reset` => fresh spin event (both respin allowances back
  // to 3); `fix` pins one axis ({year} reroll country, {teamCode} reroll year); `axes` chooses which
  // reel axes tumble (defaults to both, year locked in the 2026 era).
  function spin(placedArg, fName, { reset = false, fix = null, axes = null } = {}) {
    const targets = validTargets(config.era, placedArg, fName, fix);
    if (!targets.length) return;
    const pick = rnd(targets);
    setSpinning(true);
    setOffer(null);
    setPicking(null);
    if (reset) setRespins({ team: 3, year: 3 });
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
      },
    });
  }

  // Reroll just the country (hold the year). Tumbles the team axis only.
  function respinCountry() {
    if (spinning || respins.team <= 0 || !current) return;
    setRespins((r) => ({ ...r, team: r.team - 1 }));
    spin(placed, formationName, { fix: { year: current.year }, axes: { team: true, year: false } });
  }

  // Reroll just the year (hold the country). Tumbles the year axis only. Not available in 2026.
  function respinYear() {
    if (spinning || respins.year <= 0 || !current || is2026) return;
    setRespins((r) => ({ ...r, year: r.year - 1 }));
    spin(placed, formationName, { fix: { teamCode: current.teamCode }, axes: { team: false, year: true } });
  }

  function switchFormation(name) {
    setFormationName(name);
    refreshPins(placed, name, pins);
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
    const state = offerState(card, placed, formationName);
    if (state === "grey") { flashToast(t("draft.greyHint")); return; }
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

  function openPick(card, fName) {
    setPicking({ card, formationName: fName, spots: validSpots(card, placed, fName) });
    // Bring the board (and its now-highlighted slots) into view — useful on narrow screens where
    // the board sits above the offer list. Mirrors 162-0's auto-scroll.
    setTimeout(() => smoothScrollToEl(boardRef.current, 400), 0);
  }

  function chooseFormationForCard(card, name) {
    switchFormation(name);
    flashToast(t("draft.switched", { f: name }));
    setFormationChoice(null);
    openPick(card, name);
  }

  function placeAt(slot) {
    const { card, formationName: fName } = picking;
    const newPlaced = [...placed, card];
    const withPin = new Map(pins);
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
      spin(newPlaced, fName, { reset: true });
      // Scroll back to the fresh offer so the next squad is in view (162-0 feel).
      setTimeout(() => smoothScrollToEl(offerRef.current, 400), 0);
    }
  }

  const pickSpotIds = new Set(picking ? picking.spots.map((s) => s.slot.id) : []);
  const effById = {};
  if (picking) picking.spots.forEach((s) => { effById[s.slot.id] = s.effectiveness; });

  // Is there another squad to land on when rerolling a single axis? Disables a respin with no option.
  const canCountry = !!current && canRespin(config.era, placed, formationName, { year: current.year }, current);
  const canYear = !is2026 && !!current && canRespin(config.era, placed, formationName, { teamCode: current.teamCode }, current);

  return (
    <div style={{ ...splash, justifyContent: "flex-start", padding: narrow ? "10px" : "16px 22px" }}>
      <style>{FONTS}</style>

      {/* Header */}
      <div style={{ width: "100%", maxWidth: 1080, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={onExit} style={ghostBtn}>‹ {t("action.menu")}</button>
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, color: C.chalk, opacity: 0.8 }}>
          {t(`era.${config.era}`)} · {t(`mode.${config.mode}`)}
        </div>
        <div style={{ flex: 1 }} />
        <FormationPicker holding={holding} value={formationName} onChange={switchFormation} />
      </div>
      {reason && (
        <div style={{ width: "100%", maxWidth: 1080, marginTop: 6, fontFamily: "Oswald, sans-serif", fontSize: 12, color: C.gold, opacity: 0.9 }}>
          {reason}
        </div>
      )}

      {/* Body */}
      <div style={{ width: "100%", maxWidth: 1080, marginTop: 14, display: "flex", gap: 18, flexDirection: narrow ? "column" : "row", alignItems: "flex-start" }}>
        <div ref={boardRef} style={{ flex: narrow ? "none" : "0 0 420px", width: narrow ? "100%" : 420 }}>
          {narrow
            ? <LineBoard formation={formation} seating={seating} pickSpotIds={pickSpotIds} effById={effById} onSpot={placeAt} diehard={diehard} placing={picking && picking.card} />
            : <PitchBoard formation={formation} seating={seating} pickSpotIds={pickSpotIds} effById={effById} onSpot={placeAt} diehard={diehard} placing={picking && picking.card} />}
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.chalk, opacity: 0.6, marginTop: 8, textAlign: "center" }}>
            {t("draft.placedCount", { n: placed.length })}
          </div>
        </div>

        <div ref={offerRef} style={{ flex: 1, width: "100%" }}>
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

/* ---------- Formation dropdown ---------- */
function FormationPicker({ holding, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 14, color: C.ink,
      background: C.gold, border: "none", borderRadius: 5, padding: "8px 12px", cursor: "pointer",
    }}>
      {holding.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
    </select>
  );
}

/* ---------- Pitch board (desktop) ---------- */
// Conventional single-team lineup view: the XI attacks UP, so the halfway line + center circle sit
// at the TOP (the attacking edge, just above the forwards) and the penalty area is at the BOTTOM
// around the keeper. A line color reused for all markings.
function PitchBoard({ formation, seating, pickSpotIds, effById, onSpot, diehard, placing }) {
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

      {placing && <PlacingBanner card={placing} diehard={diehard} overlay />}

      {formation.slots.map((slot) => (
        <div key={slot.id} style={{ position: "absolute", left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, transform: "translate(-50%,-50%)", zIndex: 2 }}>
          <SlotChip slot={slot} card={seating[slot.id]} highlight={pickSpotIds.has(slot.id)} eff={effById[slot.id]} onSpot={onSpot} diehard={diehard} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Line rows (narrow / mobile) ---------- */
function LineBoard({ formation, seating, pickSpotIds, effById, onSpot, diehard, placing }) {
  // Rows follow the formation's pitch bands (slot.y), attack at top -> keeper at bottom, so a
  // "4-2-3-1" reads as four outfield lines here too — matching the desktop pitch and the name.
  const bands = [...new Set(formation.slots.map((s) => s.y))].sort((a, b) => a - b);
  return (
    <div style={{ borderRadius: 10, background: `linear-gradient(${C.pitch} 0%, ${C.pitchDeep} 100%)`, border: `1px solid ${C.pitchLine}`, padding: "14px 8px" }}>
      {placing && <PlacingBanner card={placing} diehard={diehard} />}
      {bands.map((y) => (
        <div key={y} style={{ display: "flex", justifyContent: "center", gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
          {formation.slots.filter((s) => s.y === y).sort((a, b) => a.x - b.x).map((slot) => (
            <SlotChip key={slot.id} slot={slot} card={seating[slot.id]} highlight={pickSpotIds.has(slot.id)} eff={effById[slot.id]} onSpot={onSpot} diehard={diehard} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SlotChip({ slot, card, highlight, eff, onSpot, diehard }) {
  const base = {
    width: 78, minHeight: 46, borderRadius: 6, padding: "5px 6px",
    fontFamily: "Oswald, sans-serif", textAlign: "center",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  };
  if (highlight) {
    return (
      <button onClick={() => onSpot(slot)} style={{ ...base, cursor: "pointer", background: "rgba(61,220,132,.22)", border: `2px solid ${C.green}`, color: C.chalk }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{slot.token}</div>
        {!diehard && eff != null && <div style={{ fontSize: 10.5, color: C.green }}>{Math.round(eff * 100)}%</div>}
      </button>
    );
  }
  if (card) {
    return (
      <div style={{ ...base, background: "rgba(0,0,0,.35)", border: `1px solid ${C.pitchLine}`, color: C.chalk }}>
        <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 700 }}>{slot.token}</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.15, fontWeight: 600 }}>{lastName(card.name)}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 9.5, opacity: 0.75 }}>
          <Flag code={card.team_code} h={10} />
          {!diehard && <span>{card.wc_rating}</span>}
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...base, background: "rgba(255,255,255,.04)", border: `1px dashed ${C.pitchLine}`, color: C.chalk, opacity: 0.55 }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{slot.token}</div>
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
  const noRespins = respins.team <= 0 && (is2026 || respins.year <= 0);
  const countryDisabled = spinning || respins.team <= 0 || !canCountry;
  const yearDisabled = spinning || respins.year <= 0 || !canYear;

  return (
    <div style={{ background: "rgba(0,0,0,.28)", border: `1px solid ${C.pitchLine}`, borderRadius: 10, padding: 14 }}>
      {/* Reel */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 12, justifyContent: "center" }}>
        <ReelBox label={reel.team} code={!spinning && current ? current.teamCode : null} />
        {!is2026 && reel.year !== "" && <ReelBox label={String(reel.year)} />}
      </div>

      {/* Per-axis respins: country always; year only when the era draws a year */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={onRespinCountry} disabled={countryDisabled} style={{ ...actionBtn, opacity: countryDisabled ? 0.4 : 1, cursor: countryDisabled ? "default" : "pointer" }}>
          {t("draft.respinCountry")} ({respins.team})
        </button>
        {!is2026 && (
          <button onClick={onRespinYear} disabled={yearDisabled} style={{ ...actionBtn, opacity: yearDisabled ? 0.4 : 1, cursor: yearDisabled ? "default" : "pointer" }}>
            {t("draft.respinYear")} ({respins.year})
          </button>
        )}
      </div>
      <div style={{ textAlign: "center", fontFamily: "Oswald, sans-serif", fontSize: 11.5, color: C.chalk, opacity: 0.7, marginTop: 8 }}>
        {picking ? t("draft.pickSpot") : noRespins ? t("draft.mustCommit") : t("draft.tapPlayer")}
      </div>

      {/* Squad offer list */}
      {offer && !spinning && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 }}>
            <Flag code={offer.teamCode} h={20} />
            <div style={{ fontFamily: "Anton, sans-serif", fontSize: 18, color: C.gold }}>
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
      fontFamily: "Anton, sans-serif", fontSize: 24, color: C.ink, background: C.chalk,
      borderRadius: 6, padding: "10px 16px", flex: "1 1 0", minWidth: 0, maxWidth: 190, textAlign: "center",
      letterSpacing: ".01em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}>
      {code && <Flag code={code} h={18} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

/* ---------- "Placing X" banner shown on the board while picking a spot ---------- */
function PlacingBanner({ card, diehard, overlay }) {
  const wrap = overlay
    ? { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, background: "rgba(0,0,0,.6)", borderBottom: `2px solid ${C.gold}`, borderRadius: "10px 10px 0 0" }
    : { background: "rgba(0,0,0,.5)", border: `1px solid ${C.gold}`, borderRadius: 6, marginBottom: 10 };
  return (
    <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "7px 10px" }}>
      <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 10.5, letterSpacing: ".18em", color: C.gold, opacity: 0.9 }}>{t("draft.placing")}</span>
      <Flag code={card.team_code} h={14} />
      <span style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 14, color: C.chalk }}>{card.name}</span>
      <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: C.chalk, opacity: 0.7 }}>· {t(`pos.${card.position}`)}</span>
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
      <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 13, color: C.chalk }}>{card.name}</div>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: C.chalk, opacity: 0.7 }}>
        {t(`pos.${card.position}`)}{diehard ? "" : ` · ${card.wc_rating} · ${card.age}y`}
      </div>
    </button>
  );
}

function CompletePanel({ onRun }) {
  return (
    <div style={{ background: "rgba(0,0,0,.28)", border: `1px solid ${C.green}`, borderRadius: 10, padding: 24, textAlign: "center" }}>
      <div style={{ fontFamily: "Anton, sans-serif", fontSize: 24, color: C.green }}>{t("draft.complete")}</div>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, color: C.chalk, opacity: 0.8, marginTop: 8 }}>{t("draft.completeHint")}</div>
      <button onClick={onRun} style={{ ...actionBtn, marginTop: 18, background: C.green, fontSize: 20, padding: "12px 40px" }}>{t("action.runIt")}</button>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.pitchDeep, border: `1px solid ${C.pitchLine}`, borderRadius: 10, padding: 20, minWidth: 240 }}>
        <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 15, color: C.chalk, marginBottom: 12 }}>{title}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
      </div>
    </div>
  );
}

const ghostBtn ={ fontFamily: "Oswald, sans-serif", fontSize: 13, color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 5, padding: "7px 12px", cursor: "pointer" };
const actionBtn = { fontFamily: "Anton, sans-serif", fontSize: 16, letterSpacing: ".06em", color: C.ink, background: C.gold, border: "none", borderRadius: 6, padding: "10px 22px", cursor: "pointer" };
const modalBtn = { fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 15, color: C.ink, background: C.gold, border: "none", borderRadius: 5, padding: "10px 18px", cursor: "pointer" };
const toastStyle = { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.ink, color: C.chalk, fontFamily: "Oswald, sans-serif", fontSize: 13, padding: "10px 18px", borderRadius: 6, border: `1px solid ${C.gold}`, zIndex: 60 };
