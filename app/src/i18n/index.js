// Minimal i18n: load a locale's strings, look them up by key with a fallback.
// First language (en) is the cost; each additional locale is a JSON file in public/i18n.

import { GAME } from "../data/loader.js";

export const LOCALES = ["en", "es", "fr", "pt", "de", "it"];
export const DEFAULT_LOCALE = "en";
const STORE_KEY = "tf-locale";

let strings = {};
let active = DEFAULT_LOCALE;

export async function loadLocale(locale) {
  const loc = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const res = await fetch(`/i18n/${loc}.json`);
  strings = await res.json();
  active = loc;
  return loc;
}

export function locale() {
  return active;
}

// t("mode.classic") -> "Classic". Returns the key itself if missing (visible in dev).
export function t(key, vars) {
  let s = strings[key];
  if (s == null) return key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

// Country name for a team code. Localized via a "team.<CODE>" key when present, else the
// English name baked into teams.json, else the raw code. So a locale that omits a country
// still shows the English name rather than a raw key.
export function teamName(code) {
  if (code == null) return "";
  const k = strings[`team.${code}`];
  if (k != null) return k;
  const team = GAME.teams && GAME.teams[code];
  return (team && team.name) || code;
}

// The engine emits raw English tier/round labels; map them to i18n keys (with a raw fallback).
const TIER_KEY = {
  "Champions": "tier.champions",
  "Runner-Up": "tier.runnerUp",
  "Semifinalists": "tier.semifinalists",
  "Quarterfinalists": "tier.quarterfinalists",
  "Round of 16": "tier.roundOf16",
  "Round of 32": "tier.roundOf32",
  "Group Stage Exit": "tier.groupExit",
};
const ROUND_KEY = {
  "Round of 32": "round.roundOf32",
  "Round of 16": "round.roundOf16",
  "Quarterfinals": "round.quarterfinals",
  "Semifinals": "round.semifinals",
  "Final": "round.final",
};
// Short labels for cramped knockout rows (mobile); same key suffixes under round.short.*
const ROUND_SHORT_KEY = {
  "Round of 32": "round.short.roundOf32",
  "Round of 16": "round.short.roundOf16",
  "Quarterfinals": "round.short.quarterfinals",
  "Semifinals": "round.short.semifinals",
  "Final": "round.short.final",
};
// Natural-English phrase for the share sentence ("I just made the semifinals…").
const TIER_PHRASE_KEY = {
  "Champions": "tierPhrase.champions",
  "Runner-Up": "tierPhrase.runnerUp",
  "Semifinalists": "tierPhrase.semifinalists",
  "Quarterfinalists": "tierPhrase.quarterfinalists",
  "Round of 16": "tierPhrase.roundOf16",
  "Round of 32": "tierPhrase.roundOf32",
  "Group Stage Exit": "tierPhrase.groupExit",
};

export function tierName(tier) {
  const key = TIER_KEY[tier];
  return key ? t(key) : tier;
}

export function roundName(round, short = false) {
  const key = (short ? ROUND_SHORT_KEY : ROUND_KEY)[round];
  return key ? t(key) : round;
}

export function tierPhrase(tier) {
  const key = TIER_PHRASE_KEY[tier];
  return key ? t(key) : tier;
}

// Browser language → a supported locale (2-char match), else English.
export function detectLocale() {
  try {
    const lang = (navigator.language || "").slice(0, 2).toLowerCase();
    if (LOCALES.includes(lang)) return lang;
  } catch (e) {}
  return DEFAULT_LOCALE;
}

// Remembered choice (localStorage, wrapped for privacy-mode safety).
export function storedLocale() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return LOCALES.includes(v) ? v : null;
  } catch (e) { return null; }
}

export function setStoredLocale(loc) {
  try { localStorage.setItem(STORE_KEY, loc); } catch (e) {}
}
