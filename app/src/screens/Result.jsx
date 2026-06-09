import React, { useState, useEffect } from "react";
import { t, tierName, roundName, teamName } from "../i18n/index.js";
import { C, FONTS, splash } from "../theme.js";
import Flag from "../components/Flag.jsx";
import SquadPitch from "../components/SquadPitch.jsx";
import Share from "../share/Share.jsx";
import { submitScore, realPct, boardConfigured } from "../leaderboard/board.js";

// Phase 6 result: the REAL simulated tournament — group + knockout scorelines, opponents, and the
// final progression tier. Minimal layout on purpose; Elo/grade (Phase 7) and the polished bracket
// tree + share image (Phase 8) come next.
export default function Result({ config, squad, result, clientKey, gamePosted, setGamePosted, onAgain, onMenu, onLeaderboard }) {
  const [showShare, setShowShare] = useState(false);
  const cards = squad ? Object.values(squad) : [];
  const nations = new Set(cards.map((c) => c.team_code)).size;

  if (!result) {
    return (
      <div style={{ ...splash }}>
        <style>{FONTS}</style>
        <div style={{ fontFamily: "Anton, sans-serif", fontSize: 28, color: C.gold }}>No result</div>
        <button onClick={onMenu} style={ghostBtn}>{t("action.menu")}</button>
      </div>
    );
  }

  const champ = result.tier === "Champions";
  return (
    <div style={{ ...splash, justifyContent: "flex-start", paddingTop: "5vh", paddingBottom: 40 }}>
      <style>{FONTS}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {champ && result.grade && (
          <span style={{ fontFamily: "Anton, sans-serif", fontSize: 44, lineHeight: 1, color: C.gold, border: `2px solid ${C.gold}`, borderRadius: 8, padding: "2px 12px" }}>
            {result.grade}
          </span>
        )}
        <div style={{ fontFamily: "Anton, sans-serif", fontSize: 40, color: champ ? C.gold : C.chalk, letterSpacing: ".02em", textAlign: "center" }}>
          {tierName(result.tier)}
        </div>
      </div>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, color: C.chalk, opacity: 0.8, marginTop: 4 }}>
        {t(`era.${config.era}`)} · {t(`mode.${config.mode}`)} · {nations} {t("result.nations")}
      </div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: C.chalk, opacity: 0.65, marginTop: 8 }}>
        {result.goalsFor} {t("result.scored")} · {result.goalsAgainst} {t("result.conceded")} · {result.diff >= 0 ? "+" : ""}{result.diff} {t("result.differential")}
      </div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, color: C.gold, marginTop: 10, fontWeight: 700 }}>
        {t("result.elo")} {result.elo}
        <span style={{ fontSize: 12, color: result.eloDelta >= 0 ? C.green : "#e07a5f", marginLeft: 8 }}>
          {result.eloDelta >= 0 ? "+" : ""}{result.eloDelta}
        </span>
      </div>

      {squad && result.formationName && (
        <div style={{ width: "100%", maxWidth: 460, marginTop: 22, padding: "0 16px" }}>
          <SquadPitch seating={squad} formationName={result.formationName} diehard={config.mode === "diehard"} />
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 460, marginTop: 22, padding: "0 16px" }}>
        <Section label={t("result.groupStage")} matches={result.group.matches} />
        {result.knockout.length > 0 && (
          <Section label={t("result.knockout")} matches={result.knockout} showRound />
        )}
      </div>

      <PostBlock
        config={config}
        result={result}
        seating={squad}
        clientKey={clientKey}
        gamePosted={gamePosted}
        setGamePosted={setGamePosted}
        onLeaderboard={onLeaderboard}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={onAgain} style={primaryBtn}>{t("action.runIt")}</button>
        <button onClick={() => setShowShare(true)} style={shareBtn}>{t("action.share")}</button>
        <button onClick={onMenu} style={ghostBtn}>{t("action.menu")}</button>
      </div>

      {showShare && (
        <Share result={result} seating={squad} formationName={result.formationName} config={config} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

// Post-to-leaderboard block: name input → POST (session-guarded), the real "Top X%" stat once a
// config has ≥18 scores, and a View Leaderboard affordance. Inert (with a hint) until board.js is
// configured with a Supabase URL + key.
function PostBlock({ config, result, seating, clientKey, gamePosted, setGamePosted, onLeaderboard }) {
  const [name, setName] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState(false);
  const [pct, setPct] = useState(null);
  const configured = boardConfigured();

  useEffect(() => {
    let live = true;
    realPct(config.era, config.mode, result.elo).then((p) => { if (live) setPct(p); });
    return () => { live = false; };
  }, []);

  const doPost = async () => {
    if (posting || gamePosted || !configured) return;
    setPosting(true); setErr(false);
    try {
      await submitScore({ era: config.era, mode: config.mode, name: name.trim() || "Anon", result, seating, clientKey });
      setGamePosted(true);
    } catch (e) { setErr(true); }
    setPosting(false);
  };

  return (
    <div style={{ width: "100%", maxWidth: 460, marginTop: 20, padding: 14, borderRadius: 8, background: "rgba(255,255,255,.05)", border: `1px solid ${C.pitchLine}` }}>
      {pct != null && (
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: ".04em", marginBottom: 10, textAlign: "center" }}>
          {t("leaderboard.topPct").replace("{pct}", pct)}
        </div>
      )}
      {!configured ? (
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12.5, color: C.chalk, opacity: 0.6, textAlign: "center" }}>
          {t("leaderboard.notConfigured")}
        </div>
      ) : gamePosted ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 14, fontWeight: 700, color: C.chalk, marginBottom: 10 }}>
            {t("leaderboard.postedAs").replace("{name}", name.trim() || "Anon")}
          </div>
          <button onClick={onLeaderboard} style={lbViewBtn}>{t("action.leaderboard")}</button>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, fontWeight: 700, color: C.chalk, opacity: 0.8, letterSpacing: ".06em", marginBottom: 8 }}>
            {t("leaderboard.postPrompt")}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={name} onChange={(e) => setName(e.target.value)} maxLength={24}
              placeholder={t("leaderboard.namePlaceholder")}
              autoCorrect="off" spellCheck={false}
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 6, border: `1px solid ${C.pitchLine}`, background: "rgba(0,0,0,.25)", color: C.chalk, fontFamily: "Oswald, sans-serif", fontSize: 14 }}
            />
            <button onClick={doPost} style={{ ...lbViewBtn, opacity: posting ? 0.6 : 1 }}>
              {posting ? t("leaderboard.posting") : t("leaderboard.post")}
            </button>
          </div>
          {err && <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: "#e07a5f", marginTop: 8 }}>{t("leaderboard.error")}</div>}
          <button onClick={onLeaderboard} style={{ ...ghostBtn, fontSize: 12.5, padding: "8px 16px", marginTop: 10, width: "100%" }}>{t("leaderboard.viewLink")}</button>
        </>
      )}
    </div>
  );
}

const lbViewBtn = { fontFamily: "Anton, sans-serif", fontSize: 15, letterSpacing: ".04em", color: C.ink, background: C.gold, border: "none", borderRadius: 6, padding: "10px 18px", cursor: "pointer", flexShrink: 0 };

function Section({ label, matches, showRound }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, letterSpacing: ".2em", color: C.chalk, opacity: 0.5, marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      {matches.map((m, i) => <MatchRow key={i} m={m} showRound={showRound} />)}
    </div>
  );
}

function MatchRow({ m, showRound }) {
  const note = m.decidedBy === "penalties" ? t("result.byPenalties")
    : m.decidedBy === "extra time" ? t("result.afterExtraTime") : "";
  const color = m.won ? C.green : m.you === m.opp ? C.chalk : "#e07a5f";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.pitchLine}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {showRound && (
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.chalk, opacity: 0.45, width: 64, flexShrink: 0 }}>
            {roundName(m.round)}
          </span>
        )}
        <Flag code={m.opponent.teamCode} h={14} />
        <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 14, color: C.chalk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {teamName(m.opponent.teamCode)} <span style={{ opacity: 0.5 }}>{m.opponent.year}</span>
        </span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {note && <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.chalk, opacity: 0.5 }}>{note}</span>}
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 15, color, fontWeight: 700 }}>{m.scoreline}</span>
      </span>
    </div>
  );
}

const primaryBtn = { fontFamily: "Anton, sans-serif", fontSize: 18, letterSpacing: ".06em", color: C.ink, background: C.green, border: "none", borderRadius: 6, padding: "11px 30px", cursor: "pointer" };
const shareBtn = { fontFamily: "Anton, sans-serif", fontSize: 18, letterSpacing: ".06em", color: C.ink, background: C.gold, border: "none", borderRadius: 6, padding: "11px 30px", cursor: "pointer" };
const ghostBtn = { fontFamily: "Oswald, sans-serif", fontSize: 14, color: C.chalk, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 6, padding: "11px 22px", cursor: "pointer" };
