import React, { useState, useEffect } from "react";
import { t, tierName } from "../i18n/index.js";
import { C } from "../theme.js";
import { generateShareImage } from "./shareImage.js";

// Share overlay: generates the result-card PNG on open, then offers the proven 162-0 share chain —
// native share (with image) → copy image to clipboard → download → text-only social links.
const SHARE_URL = ""; // no domain yet; text links degrade gracefully when empty

export default function Share({ result, seating, formationName, config, onClose }) {
  const [imgBlob, setImgBlob] = useState(null);
  const [imgUrl, setImgUrl] = useState(null);
  const [imgCopied, setImgCopied] = useState(false);
  const [imgSaved, setImgSaved] = useState(false);
  const [textCopied, setTextCopied] = useState(false);

  useEffect(() => {
    let live = true;
    generateShareImage({ result, seating, formationName, config })
      .then((blob) => { if (live && blob) { setImgBlob(blob); setImgUrl(URL.createObjectURL(blob)); } })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);

  const modeLabel = t(config.mode === "diehard" ? "mode.diehard" : "mode.classic");
  const text = t("share.text", { tier: tierName(result.tier), mode: modeLabel, elo: result.elo });
  const full = SHARE_URL ? `${text} ${SHARE_URL}` : text;
  const enc = encodeURIComponent;
  const links = [
    ["X", `https://twitter.com/intent/tweet?text=${enc(full)}`, "#1d9bf0"],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(SHARE_URL || "")}&quote=${enc(text)}`, "#1877f2"],
    ["Bluesky", `https://bsky.app/intent/compose?text=${enc(full)}`, "#1185fe"],
    ["WhatsApp", `https://wa.me/?text=${enc(full)}`, "#25d366"],
    ["Telegram", `https://t.me/share/url?url=${enc(SHARE_URL || " ")}&text=${enc(text)}`, "#229ed9"],
    ["Reddit", `https://www.reddit.com/submit?title=${enc(text)}${SHARE_URL ? `&url=${enc(SHARE_URL)}` : ""}`, "#ff4500"],
    ["Messages", `sms:&body=${enc(full)}`, "#34c759"],
  ];

  const hasNative = typeof navigator !== "undefined" && !!navigator.share;
  const canFiles = hasNative && typeof navigator.canShare === "function" && (() => {
    try { return navigator.canShare({ files: [new File(["x"], "t.png", { type: "image/png" })] }); } catch (e) { return false; }
  })();

  const native = async () => {
    try {
      if (imgBlob && canFiles) await navigator.share({ text, url: SHARE_URL || undefined, files: [new File([imgBlob], "total-football.png", { type: "image/png" })] });
      else await navigator.share({ text, url: SHARE_URL || undefined });
    } catch (e) {}
  };
  const copyImg = async () => {
    if (!imgBlob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": imgBlob })]);
      setImgCopied(true); setTimeout(() => setImgCopied(false), 2000);
    } catch (e) { saveImg(); }
  };
  const saveImg = () => {
    if (!imgBlob) return;
    const url = imgUrl || URL.createObjectURL(imgBlob);
    const a = document.createElement("a"); a.href = url; a.download = "total-football.png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setImgSaved(true); setTimeout(() => setImgSaved(false), 1500);
  };
  const copyText = async () => {
    try { await navigator.clipboard.writeText(full); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = full; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e2) {} document.body.removeChild(ta);
    }
    setTextCopied(true); setTimeout(() => setTextCopied(false), 1500);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 80, overflowY: "auto", padding: "24px 14px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.pitchDeep, border: `1px solid ${C.pitchLine}`, borderRadius: 12, padding: 18, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "Anton, sans-serif", fontSize: 20, color: C.gold }}>{t("share.title")}</div>
          <button onClick={onClose} style={ghostBtn}>✕</button>
        </div>

        <div style={{ minHeight: 120, marginBottom: 12, display: "flex", justifyContent: "center" }}>
          {imgUrl
            ? <img src={imgUrl} alt="result card" style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.pitchLine}` }} />
            : <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, color: C.chalk, opacity: 0.7, alignSelf: "center" }}>{t("share.building")}</div>}
        </div>

        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, color: C.chalk, marginBottom: 10 }}>{text}</div>

        {hasNative && canFiles && (
          <button onClick={native} style={{ ...bigBtn, background: C.ink, color: C.chalk, width: "100%", marginBottom: 8 }}>{t("share.withImage")}</button>
        )}
        {imgBlob && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={copyImg} style={{ ...bigBtn, background: C.gold, color: C.ink, flex: 1 }}>{imgCopied ? t("share.copied") : t("share.copyImage")}</button>
            <button onClick={saveImg} style={{ ...ghostBtn, fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 13, padding: "10px 16px" }}>{imgSaved ? t("share.saved") : t("share.saveImage")}</button>
          </div>
        )}
        {imgBlob && !imgCopied && <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: C.chalk, opacity: 0.55, marginBottom: 10, textAlign: "center" }}>{t("share.copyHint")}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(92px,1fr))", gap: 7 }}>
          {links.map(([label, href, col]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: "none", textAlign: "center", padding: "9px 6px", borderRadius: 5, background: col, color: "#fff", fontFamily: "Oswald, sans-serif", fontSize: 12.5, fontWeight: 600 }}>{label}</a>
          ))}
          <button onClick={copyText} style={{ textAlign: "center", padding: "9px 6px", borderRadius: 5, background: "rgba(255,255,255,.08)", color: C.chalk, border: `1px solid ${C.pitchLine}`, fontFamily: "Oswald, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{textCopied ? t("share.textCopied") : t("share.copyText")}</button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn = { fontFamily: "Oswald, sans-serif", fontSize: 13, color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 5, padding: "7px 12px", cursor: "pointer" };
const bigBtn = { fontFamily: "Anton, sans-serif", fontSize: 16, letterSpacing: ".04em", border: "none", borderRadius: 6, padding: "11px 18px", cursor: "pointer" };
