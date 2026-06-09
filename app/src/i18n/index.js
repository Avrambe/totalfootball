// Minimal i18n: load a locale's strings, look them up by key with a fallback.
// First language (en) is the cost; each additional locale is a JSON file in public/i18n.

export const LOCALES = ["en", "es", "fr", "pt", "de", "it"];
export const DEFAULT_LOCALE = "en";

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
