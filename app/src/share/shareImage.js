// Shareable result card (canvas PNG). Adapts 162-0's generateShareImage technique: await fonts.ready,
// S=2 retina scale, drawPill rounded-rect helper, c.toBlob. Soccer layout: header → mode pill → tier
// (where you made it) → grade badge (champions only) → Elo + goal differential → a mini pitch of the
// XI (flag + last name + position, NO ratings — the user's call) → footer. Scorelines are intentionally
// NOT on the card.

import { C } from "../theme.js";
import { getFormation } from "../positions/formations.js";
import { lastName } from "../util/name.js";
import { t, tierName, tierPhrase } from "../i18n/index.js";

// Flip to false to drop flags from the card if they read too busy (trivial removal, per the user).
const FLAGS_ON_CARD = true;
const SHARE_URL = ""; // no domain yet; footer degrades gracefully

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

  const S = 2, W = 520, H = 740;
  const c = document.createElement("canvas"); c.width = W * S; c.height = H * S;
  const g = c.getContext("2d"); g.scale(S, S);
  const L = 30, R = W - 30;
  const champ = result.tier === "Champions";

  // background
  g.fillStyle = C.pitchDeep; g.fillRect(0, 0, W, H);

  // header
  g.textAlign = "center";
  g.font = "40px 'Bebas Neue',sans-serif"; g.fillStyle = C.gold; g.fillText("PERFECT XI", W / 2, 48);
  g.font = "15px Inter,sans-serif"; g.fillStyle = C.chalk; g.fillText(t("share.cardSubtitle"), W / 2, 70);

  // mode pill
  const modeLabel = t(config && config.mode === "diehard" ? "mode.diehard" : "mode.classic").toUpperCase();
  drawPill(g, W / 2, 86, modeLabel, C.gold, C.ink, "bold 11px Inter,sans-serif");

  // tier — where you made it (the headline)
  g.font = "34px 'Bebas Neue',sans-serif"; g.fillStyle = champ ? C.gold : C.chalk;
  g.textAlign = "center"; g.fillText(tierName(result.tier).toUpperCase(), W / 2, 152);

  // grade badge (champions only), to the right of the tier
  if (champ && result.grade) {
    const bw = 52, bh = 52, bx = W - 30 - bw, by = 116;
    g.strokeStyle = C.gold; g.lineWidth = 2; roundRect(g, bx, by, bw, bh, 8); g.stroke();
    g.fillStyle = C.gold; g.font = "34px 'Bebas Neue',sans-serif"; g.textAlign = "center";
    g.fillText(result.grade, bx + bw / 2, by + 38);
  }

  // stat row: Elo (+delta) · differential
  let y = 182;
  g.textAlign = "center";
  const dStr = (result.diff >= 0 ? "+" : "") + result.diff;
  const deltaStr = (result.eloDelta >= 0 ? "+" : "") + result.eloDelta;
  g.font = "16px Inter,monospace"; g.fillStyle = C.gold;
  g.fillText(`${t("share.cardElo")} ${result.elo}  (${deltaStr})`, W / 2, y);
  y += 22;
  g.font = "14px Inter,monospace"; g.fillStyle = C.chalk;
  g.fillText(`${dStr} ${t("share.cardDiff")}  ·  ${result.goalsFor}-${result.goalsAgainst}`, W / 2, y);
  y += 18;

  // mini pitch with the XI
  const PX = L, PW = R - L, PY = y, PH = 440;
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
    drawChip(g, cx, cy, slot, card, flags);
  }
  y = PY + PH;

  // footer — the shareable sentence, big and centered (replaces the old dead tagline box).
  // Grammar via tierPhrase: "I just made the semifinals." not "I just took Semifinalists".
  y += 36;
  g.strokeStyle = C.pitchLine; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y - 18); g.lineTo(R, y - 18); g.stroke();
  const sentence = t("share.cardSentence", { phrase: tierPhrase(result.tier) });
  g.font = "bold 22px Inter,sans-serif"; g.fillStyle = C.gold; g.textAlign = "center";
  g.fillText(sentence, W / 2, y + 8);
  if (SHARE_URL) {
    g.font = "13px Inter,sans-serif"; g.fillStyle = C.chalk; g.textAlign = "center";
    g.fillText(SHARE_URL, W / 2, y + 30);
  }

  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

function drawChip(g, cx, cy, slot, card, flags) {
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
  const img = flags.get(card.team_code);           // row 3: flag (or text code)
  if (img) {
    const fw = 22, fh = 15;
    try { g.drawImage(img, cx - fw / 2, ytop + h - 19, fw, fh); } catch (e) {}
  } else {
    g.font = "10px Inter,monospace"; g.fillStyle = "rgba(243,244,239,.7)";
    g.fillText(card.team_code, cx, ytop + h - 8);
  }
}
