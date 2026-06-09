import { build } from "esbuild";
import { mkdirSync, copyFileSync, readFileSync, existsSync, cpSync } from "fs";

mkdirSync("./dist", { recursive: true });

// Static shell
copyFileSync("./index.html", "./dist/index.html");
copyFileSync("./public/manifest.json", "./dist/manifest.json");
copyFileSync("./public/sw.js", "./dist/sw.js");

// Optional assets (icons / privacy) — copy only if present so the build never breaks early on
for (const f of ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "privacy.html"]) {
  if (existsSync(`./public/${f}`)) copyFileSync(`./public/${f}`, `./dist/${f}`);
}

// Generated data (emitted by the Python pipeline). Copy if present.
for (const f of ["cards.json", "teams.json", "elo.json"]) {
  if (existsSync(`./public/${f}`)) copyFileSync(`./public/${f}`, `./dist/${f}`);
}

// Locale strings + flags (directories)
for (const d of ["i18n", "flags"]) {
  if (existsSync(`./public/${d}`)) cpSync(`./public/${d}`, `./dist/${d}`, { recursive: true });
}

await build({
  entryPoints: ["./src/entry.jsx"],
  bundle: true,
  outfile: "./dist/bundle.js",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
}).catch(() => process.exit(1));

const kb = Math.round(readFileSync("./dist/bundle.js").length / 1024);
const dataNote = existsSync("./dist/cards.json")
  ? ` + cards ${Math.round(readFileSync("./dist/cards.json").length / 1024)}KB`
  : " (no cards.json yet)";
console.log(`build complete -> dist/  (bundle ${kb}KB${dataNote})`);
