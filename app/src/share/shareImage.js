// Shareable result card (canvas PNG). Adapts 162-0's generateShareImage technique: await fonts.ready,
// S=2 retina scale, drawPill rounded-rect helper, c.toBlob. 4:5 PORTRAIT (1080×1350) so it renders
// UNCROPPED in X/Bluesky/Facebook feeds. Layout top→bottom, Elo as the hero: small wordmark → tier
// label → ELO (huge, gold, thumbnail-legible) + delta → record line → Expert-only mode pill → grade
// badge (champions only) → a large mini pitch of the XI (flag + last name + position, NO ratings) →
// a gold CHALLENGE line ("Think you can beat {elo}?") + URL. Scorelines are intentionally NOT on the card.

import { C } from "../theme.js";
import { getFormation } from "../positions/formations.js";
import { lastName } from "../util/name.js";
import { t, tierName } from "../i18n/index.js";

// Flip to false to drop flags from the card if they read too busy (trivial removal, per the user).
const FLAGS_ON_CARD = true;
const SHARE_URL = "perfectxi.io"; // shown on the card footer

function drawPill(ctx, cx, y, text, bg, fg, font) {
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const pw = tw + 22, ph = 22, px = cx - pw / 2, r = 4;
  ctx.beginPath();
  ctx.moveTo(px + r, y); ctx.lineTo(px + pw - r, y);
  ctx.arcTo(px + pw, y, px + pw, y + r, r); ctx.lineTo(px + pw, y + ph - r);
  ctx.arcTo(px + pw, y + ph, px + pw - r, y + ph, r); ctx.lineTo(px + r, y + ph);
  ctx.arcTo(px, y + ph, px, y + ph - r, r); ctx.lineTo(px, y + r);
  ctx.arcTo(px, y, px + r, y, r); ctx.closePath();
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.fillText(text, cx, y + 15);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Load each squad nation's flag SVG into an <img>. Same-origin (served from /flags), so no taint.
// Any miss resolves to null and the chip falls back to the text code.
function loadFlags(codes) {
  if (!FLAGS_ON_CARD) return Promise.resolve(new Map());
  const uniq = [...new Set(codes)];
  return Promise.all(uniq.map((code) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve([code, img]);
    img.onerror = () => resolve([code, null]);
    img.src = `/flags/${code}.svg`;
  }))).then((pairs) => new Map(pairs));
}

export async function generateShareImage({ result, seating, formationName, config }) {
  if (typeof document !== "undefined" && document.fonts) { try { await document.fonts.ready; } catch (e) {} }
  const formation = getFormation(formationName) || getFormation("4-3-3");
  const cards = Object.values(seating || {});
  const flags = await loadFlags(cards.map((c) => c.team_code));
  // Show the represented year only when the squad spans years (not a 2026-only squad).
  const showYear = cards.some((c) => c && c.year && c.year !== 2026);

  // 4:5 portrait (1080×1350) so the card renders UNCROPPED in social feeds.
  const S = 2, W = 540, H = 675;
  const c = document.createElement("canvas"); c.width = W * S; c.height = H * S;
  const g = c.getContext("2d"); g.scale(S, S);
  const L = 30, R = W - 30;
  const champ = result.tier === "Champions";
  const diehard = config && config.mode === "diehard";

  // background
  g.fillStyle = C.pitchDeep; g.fillRect(0, 0, W, H);

  // wordmark — a small sender stamp, not the hero
  g.textAlign = "center";
  g.font = "26px 'Bebas Neue',sans-serif"; g.fillStyle = C.gold; g.fillText("PERFECT XI", W / 2, 40);

  // tier label — where you made it
  g.font = "18px Inter,sans-serif"; g.fillStyle = champ ? C.gold : C.chalk;
  g.fillText(tierName(result.tier).toUpperCase(), W / 2, 66);

  // ELO — the hero number, legible even at thumbnail size
  g.font = "13px Inter,sans-serif"; g.fillStyle = C.chalk; g.fillText(t("share.cardElo"), W / 2, 92);
  g.font = "92px 'Bebas Neue',sans-serif"; g.fillStyle = C.gold; g.textAlign = "center";
  g.fillText(String(result.elo), W / 2, 172);
  // delta — small, to the right of the (centered) Elo number
  const eloW = g.measureText(String(result.elo)).width;
  const deltaStr = (result.eloDelta >= 0 ? "+" : "") + result.eloDelta;
  g.font = "18px Inter,monospace"; g.fillStyle = C.chalk; g.textAlign = "left";
  g.fillText(`(${deltaStr})`, W / 2 + eloW / 2 + 8, 162);

  // record line — differential · score, one small line
  g.textAlign = "center";
  const dStr = (result.diff >= 0 ? "+" : "") + result.diff;
  g.font = "13px Inter,monospace"; g.fillStyle = C.chalk;
  g.fillText(`${dStr} ${t("share.cardDiff")}  ·  ${result.goalsFor}-${result.goalsAgainst}`, W / 2, 196);

  // mode pill — Expert only (Classic is the default, no badge)
  let pitchTop = 214;
  if (diehard) {
    drawPill(g, W / 2, 208, t("mode.diehard").toUpperCase(), C.gold, C.ink, "bold 11px Inter,sans-serif");
    pitchTop = 240;
  }

  // grade badge (champions only), top-right
  if (champ && result.grade) {
    const bw = 52, bh = 52, bx = W - 30 - bw, by = 50;
    g.strokeStyle = C.gold; g.lineWidth = 2; roundRect(g, bx, by, bw, bh, 8); g.stroke();
    g.fillStyle = C.gold; g.font = "34px 'Bebas Neue',sans-serif"; g.textAlign = "center";
    g.fillText(result.grade, bx + bw / 2, by + 38);
  }

  // mini pitch with the XI — as large as the layout allows (the names drive replies)
  const PX = L, PW = R - L, PY = pitchTop, PH = 600 - PY;
  g.fillStyle = C.pitch; roundRect(g, PX, PY, PW, PH, 10); g.fill();
  // markings (attack up: halfway line + circle near top, box at bottom)
  g.strokeStyle = C.pitchLine; g.lineWidth = 1;
  const topY = PY + PH * 0.05;
  g.beginPath(); g.moveTo(PX, topY); g.lineTo(PX + PW, topY); g.stroke();
  g.beginPath(); g.arc(PX + PW / 2, topY, 55, 0, Math.PI); g.stroke();
  const boxW = PW * 0.46, boxH = PH * 0.16;
  g.strokeRect(PX + (PW - boxW) / 2, PY + PH - boxH, boxW, boxH);
  const sixW = PW * 0.24, sixH = PH * 0.07;
  g.strokeRect(PX + (PW - sixW) / 2, PY + PH - sixH, sixW, sixH);

  for (const slot of formation.slots) {
    const card = seating[slot.id];
    const cx = PX + slot.x * PW;
    // Inset the vertical span so the forward line sits just below the halfway line and the keeper
    // clears the box edge — pulls the lines a touch closer (the "tighter spacing" the user asked for).
    const cy = PY + (0.07 + slot.y * 0.86) * PH;
    drawChip(g, cx, cy, slot, card, flags, showYear);
  }

  // challenge line — the CTA, big and gold ("Think you can beat {elo}?")
  g.strokeStyle = C.pitchLine; g.lineWidth = 1; g.beginPath(); g.moveTo(L, 618); g.lineTo(R, 618); g.stroke();
  g.font = "24px 'Bebas Neue',sans-serif"; g.fillStyle = C.gold; g.textAlign = "center";
  g.fillText(t("share.cardChallenge", { elo: result.elo }), W / 2, 646);
  if (SHARE_URL) {
    g.font = "13px Inter,sans-serif"; g.fillStyle = C.chalk; g.textAlign = "center";
    g.fillText(SHARE_URL, W / 2, 666);
  }

  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

function drawChip(g, cx, cy, slot, card, flags, showYear) {
  // Bigger chip with token / name / flag on their OWN rows so the flag and name never overlap.
  const w = 96, h = 56, x = cx - w / 2, ytop = cy - h / 2;
  g.fillStyle = "rgba(0,0,0,.45)"; roundRect(g, x, ytop, w, h, 7); g.fill();
  g.strokeStyle = C.pitchLine; g.lineWidth = 1; roundRect(g, x, ytop, w, h, 7); g.stroke();
  g.textAlign = "center";
  g.font = "bold 10px Inter,sans-serif"; g.fillStyle = "rgba(243,244,239,.7)";
  g.fillText(slot.token, cx, ytop + 14);          // row 1: position
  if (!card) return;
  let nm = lastName(card.name) || "";
  if (nm.length > 13) nm = nm.slice(0, 12) + "…";
  g.font = "600 13px Inter,sans-serif"; g.fillStyle = C.chalk;
  g.fillText(nm, cx, ytop + 32);                   // row 2: name
  // row 3: flag (or text code), with the represented year to its right when the squad spans years.
  const hasYear = showYear && card.year;
  const img = flags.get(card.team_code);
  const fw = 22, fh = 15, fy = ytop + h - 19;
  if (img) {
    const fx = hasYear ? cx - fw - 1 : cx - fw / 2; // shift flag left to make room for the year
    try { g.drawImage(img, fx, fy, fw, fh); } catch (e) {}
    if (hasYear) {
      g.font = "10px Inter,monospace"; g.fillStyle = "rgba(243,244,239,.7)"; g.textAlign = "left";
      g.fillText(`'${String(card.year).slice(2)}`, cx + 4, fy + 12);
      g.textAlign = "center";
    }
  } else {
    g.font = "10px Inter,monospace"; g.fillStyle = "rgba(243,244,239,.7)";
    g.fillText(hasYear ? `${card.team_code} '${String(card.year).slice(2)}` : card.team_code, cx, ytop + h - 8);
  }
}
