import React, { useState, useEffect } from "react";
import { t, tierPhrase } from "../i18n/index.js";
import { C } from "../theme.js";
import { generateShareImage } from "./shareImage.js";

// Share overlay: generates the result-card PNG on open, then offers the proven 162-0 share chain —
// native share (with image) → copy image to clipboard → download → text-only social links.
const SHARE_URL = "https://perfectxi.io"; // live site; appended to shared text + social links

export default function Share({ result, seating, formationName, config, onClose }) {
  const [imgBlob, setImgBlob] = useState(null);
  const [imgUrl, setImgUrl] = useState(null);
  const [imgCopied, setImgCopied] = useState(false);
  const [imgSaved, setImgSaved] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  useEffect(() => {
    let live = true;
    generateShareImage({ result, seating, formationName, config })
      .then((blob) => { if (live && blob) { setImgBlob(blob); setImgUrl(URL.createObjectURL(blob)); } })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);

  // Result + Elo folded into one sentence ending in a challenge; only Expert gets the mode label.
  const text = t(config.mode === "diehard" ? "share.textExpert" : "share.text", { phrase: tierPhrase(result.tier), elo: result.elo });
  const full = SHARE_URL ? `${text} ${SHARE_URL}` : text;
  const enc = encodeURIComponent;
  // X & Bluesky strip attached files from intent URLs, so these are image-first: copy the PNG to the
  // clipboard, open the composer, and prompt the user to paste it in.
  const imageFirst = [
    ["X", `https://twitter.com/intent/tweet?text=${enc(full)}`, "#1d9bf0"],
    ["Bluesky", `https://bsky.app/intent/compose?text=${enc(full)}`, "#1185fe"],
  ];
  const links = [
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(SHARE_URL || "")}&quote=${enc(text)}`, "#1877f2"],
    ["WhatsApp", `https://wa.me/?text=${enc(full)}`, "#25d366"],
    ["Telegram", `https://t.me/share/url?url=${enc(SHARE_URL || " ")}&text=${enc(text)}`, "#229ed9"],
    ["Reddit", `https://www.reddit.com/submit?title=${enc(text)}${SHARE_URL ? `&url=${enc(SHARE_URL)}` : ""}`, "#ff4500"],
    ["Messages", `sms:&body=${enc(full)}`, "#34c759"],
  ];

  const hasNative = typeof navigator !== "undefined" && !!navigator.share;
  // Probe with a tiny dummy file only to decide whether to OFFER the native button; the real
  // generated PNG is re-checked with canShare() at call time.
  const canFiles = hasNative && typeof navigator.canShare === "function" && (() => {
    try { return navigator.canShare({ files: [new File(["x"], "t.png", { type: "image/png" })] }); } catch (e) { return false; }
  })();

  const native = async () => {
    if (!imgBlob) return;
    try {
      const file = new File([imgBlob], "perfect-xi.png", { type: "image/png" });
      // URL is already at the end of `full`; passing `url` too makes iOS render the link twice.
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ text: full, files: [file] });
      } else {
        await navigator.share({ text: full });
      }
    } catch (e) {}
  };
  // Safari treats the clipboard write as gesture-initiated only when the blob is wrapped in a Promise.
  const writeImgToClipboard = () => navigator.clipboard.write([new ClipboardItem({ "image/png": Promise.resolve(imgBlob) })]);
  const copyImg = async () => {
    if (!imgBlob) return;
    try {
      await writeImgToClipboard();
      setImgCopied(true); setTimeout(() => setImgCopied(false), 2000);
    } catch (e) { saveImg(); }
  };
  // Copy without flipping the button label — the toast is the only feedback (X/Bluesky open a new tab).
  const copyImgQuiet = async () => {
    if (!imgBlob) return false;
    try { await writeImgToClipboard(); return true; } catch (e) { return false; }
  };
  const composeWithImage = (intentUrl) => async () => {
    const ok = await copyImgQuiet();
    window.open(intentUrl, "_blank", "noopener,noreferrer");
    if (ok) showToast(t("share.imageCopiedPaste"));
  };
  const saveImg = () => {
    if (!imgBlob) return;
    const url = imgUrl || URL.createObjectURL(imgBlob);
    const a = document.createElement("a"); a.href = url; a.download = "perfect-xi.png";
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
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.gold }}>{t("share.title")}</div>
          <button onClick={onClose} style={ghostBtn}>✕</button>
        </div>

        <div style={{ minHeight: 120, marginBottom: 12, display: "flex", justifyContent: "center" }}>
          {imgUrl
            ? <img src={imgUrl} alt="result card" style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.pitchLine}` }} />
            : <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: C.chalk, opacity: 0.7, alignSelf: "center" }}>{t("share.building")}</div>}
        </div>

        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: C.chalk, marginBottom: 10 }}>{text}</div>

        {/* Capability-based hierarchy: mobile leads with native file-share; desktop (no file share)
            leads with Copy Image + the copy/paste hint. `canFiles` resolves synchronously, so the
            only wait is the image rendering — show a disabled loading button until then. */}
        {!imgBlob ? (
          <button disabled style={{ ...bigBtn, background: C.ink, color: C.chalk, width: "100%", marginBottom: 8, opacity: 0.5, cursor: "default" }}>{t("share.building")}</button>
        ) : (hasNative && canFiles) ? (
          <>
            <button onClick={native} style={{ ...bigBtn, background: C.gold, color: C.ink, width: "100%", marginBottom: 8 }}>{t("share.withImage")}</button>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, justifyContent: "center" }}>
              <button onClick={saveImg} style={{ ...ghostBtn, fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 13, padding: "10px 16px" }}>{imgSaved ? t("share.saved") : t("share.saveImage")}</button>
              <button onClick={copyImg} style={{ ...ghostBtn, fontFamily: "Inter, sans-serif", fontSize: 12, padding: "8px 12px", opacity: 0.75 }}>{imgCopied ? t("share.copied") : t("share.copyImage")}</button>
            </div>
          </>
        ) : (
          <>
            <button onClick={copyImg} style={{ ...bigBtn, background: C.gold, color: C.ink, width: "100%", marginBottom: 8 }}>{imgCopied ? t("share.copied") : t("share.copyImage")}</button>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, justifyContent: "center" }}>
              <button onClick={saveImg} style={{ ...ghostBtn, fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 13, padding: "10px 16px" }}>{imgSaved ? t("share.saved") : t("share.saveImage")}</button>
            </div>
            {!imgCopied && <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: C.chalk, opacity: 0.55, marginBottom: 10, textAlign: "center" }}>{t("share.copyHint")}</div>}
          </>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(92px,1fr))", gap: 7 }}>
          {imageFirst.map(([label, intent, col]) => (
            <button key={label} onClick={composeWithImage(intent)} disabled={!imgBlob}
              style={{ textAlign: "center", padding: "9px 6px", borderRadius: 5, background: col, color: "#fff", border: "none", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: imgBlob ? "pointer" : "default", opacity: imgBlob ? 1 : 0.5 }}>{label}</button>
          ))}
          {links.map(([label, href, col]) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              style={{ textDecoration: "none", textAlign: "center", padding: "9px 6px", borderRadius: 5, background: col, color: "#fff", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600 }}>{label}</a>
          ))}
          <button onClick={copyText} style={{ textAlign: "center", padding: "9px 6px", borderRadius: 5, background: "rgba(255,255,255,.08)", color: C.chalk, border: `1px solid ${C.pitchLine}`, fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{textCopied ? t("share.textCopied") : t("share.copyText")}</button>
        </div>
      </div>
      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", background: C.ink, color: C.chalk, border: `1px solid ${C.gold}`, borderRadius: 8, padding: "10px 16px", fontFamily: "Inter, sans-serif", fontSize: 13, zIndex: 90, boxShadow: "0 4px 16px rgba(0,0,0,.5)", maxWidth: "88%", textAlign: "center" }}>{toast}</div>
      )}
    </div>
  );
}

const ghostBtn = { fontFamily: "Inter, sans-serif", fontSize: 13, color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 5, padding: "7px 12px", cursor: "pointer" };
const bigBtn = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: ".04em", border: "none", borderRadius: 6, padding: "11px 18px", cursor: "pointer" };
