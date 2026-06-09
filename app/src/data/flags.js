// team_code → flag-icons key, for the build-time flag generation script (scripts/build_flags.mjs).
// At RUNTIME nothing imports this: flag SVGs are served from /flags/<TEAM_CODE>.svg, so the
// component only needs the team_code. This map exists only so the generator can copy the right
// flag-icons source file to the right team-code filename.
//
// Live nations use standard ISO-3 → ISO-2. Per the user's decisions: UK home nations use
// flag-icons' gb-* subdivisions; DEU→de covers both West Germany and Germany; CSK→cz. The four
// defunct nations with no flag-icons asset (SUN/DDR/YUG/SCG) are CUSTOM — hand-authored SVGs that
// already live in public/flags, so the generator skips them.

export const FLAG_KEY = {
  AGO: "ao", ARE: "ae", ARG: "ar", AUS: "au", AUT: "at", BEL: "be", BGR: "bg", BIH: "ba",
  BOL: "bo", BRA: "br", CAN: "ca", CHE: "ch", CHL: "cl", CHN: "cn", CIV: "ci", CMR: "cm",
  COD: "cd", COL: "co", CPV: "cv", CRI: "cr", CSK: "cz", CUB: "cu", CUW: "cw", CZE: "cz",
  DEU: "de", DNK: "dk", DZA: "dz", ECU: "ec", EGY: "eg", ENG: "gb-eng", ESP: "es", FRA: "fr",
  GHA: "gh", GRC: "gr", HND: "hn", HRV: "hr", HTI: "ht", HUN: "hu", IDN: "id", IRL: "ie",
  IRN: "ir", IRQ: "iq", ISL: "is", ISR: "il", ITA: "it", JAM: "jm", JOR: "jo", JPN: "jp",
  KOR: "kr", KWT: "kw", MAR: "ma", MEX: "mx", NGA: "ng", NIR: "gb-nir", NLD: "nl", NOR: "no",
  NZL: "nz", PAN: "pa", PER: "pe", POL: "pl", PRK: "kp", PRT: "pt", PRY: "py", QAT: "qa",
  ROU: "ro", RUS: "ru", SAU: "sa", SCO: "gb-sct", SEN: "sn", SLV: "sv", SRB: "rs", SVK: "sk",
  SVN: "si", SWE: "se", TGO: "tg", TTO: "tt", TUN: "tn", TUR: "tr", UKR: "ua", URY: "uy",
  USA: "us", UZB: "uz", WAL: "gb-wls", ZAF: "za",
};

// Defunct nations with hand-authored SVGs already in public/flags (no flag-icons source to copy).
export const CUSTOM_FLAGS = ["SUN", "DDR", "YUG", "SCG"];
