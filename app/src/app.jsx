import React, { useState, useEffect } from "react";
import { loadLocale, t, detectLocale, storedLocale, setStoredLocale, DEFAULT_LOCALE } from "./i18n/index.js";
import { loadGameData, GAME } from "./data/loader.js";
import { C, FONTS, splash } from "./theme.js";
import { runTournament } from "./engine/index.js";
import Title from "./screens/Title.jsx";
import Draft from "./screens/Draft.jsx";
import Result from "./screens/Result.jsx";
import Leaderboard from "./screens/Leaderboard.jsx";

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState("title");
  const [config, setConfig] = useState(null); // { era, mode }
  const [squad, setSquad] = useState(null);   // completed XI (seating)
  const [result, setResult] = useState(null); // simulated tournament result
  const [clientKey, setClientKey] = useState(null); // idempotency key for the current run's post
  const [gamePosted, setGamePosted] = useState(false); // session guard against double-post
  const [lbReturn, setLbReturn] = useState("title");    // where the leaderboard's back button returns
  const [lang, setLang] = useState(DEFAULT_LOCALE); // active locale; bumping it re-renders the tree

  useEffect(() => {
    const initial = storedLocale() || detectLocale();
    Promise.all([loadLocale(initial), loadGameData()]).then(() => { setLang(initial); setReady(true); });
  }, []);

  // t() reads a module global, so bumping `lang` at the root is what re-renders with the new strings.
  const onSetLang = async (loc) => {
    await loadLocale(loc);
    setStoredLocale(loc);
    setLang(loc);
  };

  if (!ready) {
    return (
      <div style={splash}>
        <style>{FONTS}</style>
        <div style={{ fontFamily: "Anton, sans-serif", fontSize: 54, color: C.gold, letterSpacing: ".02em" }}>
          TOTAL FOOTBALL
        </div>
        <div style={{ fontFamily: "Oswald, sans-serif", marginTop: 14, fontSize: 13, letterSpacing: ".25em", color: C.chalk, opacity: 0.55 }}>
          {t("loading")}
        </div>
      </div>
    );
  }

  if (!GAME.cards) {
    return (
      <div style={splash}>
        <style>{FONTS}</style>
        <div style={{ fontFamily: "Anton, sans-serif", fontSize: 48, color: C.gold }}>TOTAL FOOTBALL</div>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#f4a261", marginTop: 18, textAlign: "center", maxWidth: 420 }}>
          No cards.json — run the pipeline (`python -m pipeline.build_cards`) then `npm run build`.
        </div>
      </div>
    );
  }

  if (screen === "title") {
    return (
      <Title
        lang={lang}
        onSetLang={onSetLang}
        onStart={(era, mode) => { setConfig({ era, mode }); setScreen("draft"); }}
        onLeaderboard={() => { setLbReturn("title"); setScreen("leaderboard"); }}
      />
    );
  }
  if (screen === "draft") {
    return (
      <Draft
        config={config}
        onComplete={({ seating, formationName }) => {
          setSquad(seating);
          setResult(runTournament(seating, formationName, config.era));
          setClientKey(newClientKey());
          setGamePosted(false);
          setScreen("result");
        }}
        onExit={() => setScreen("title")}
      />
    );
  }
  if (screen === "leaderboard") {
    return (
      <Leaderboard
        initial={config}
        onBack={() => setScreen(lbReturn)}
      />
    );
  }
  return (
    <Result
      config={config}
      squad={squad}
      result={result}
      clientKey={clientKey}
      gamePosted={gamePosted}
      setGamePosted={setGamePosted}
      onAgain={() => setScreen("draft")}
      onMenu={() => setScreen("title")}
      onLeaderboard={() => { setLbReturn("result"); setScreen("leaderboard"); }}
    />
  );
}

function newClientKey() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
