// Shared design tokens (the pitch palette, fonts, splash layout). Kept in its own module so screens
// can import them without creating a circular dependency through app.jsx.

export const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap');`;

export const C = {
  pitchDeep: "#0a1f14",
  pitch: "#0b6b3a",
  pitchLine: "rgba(255,255,255,.16)",
  gold: "#e9c46a",
  chalk: "#f3f4ef",
  ink: "#0a140e",
  green: "#3ddc84",
  yellow: "#e9c46a",
  grey: "#6b7a70",
};

export const splash = {
  background: `radial-gradient(1200px 600px at 50% -10%, ${C.pitch} 0%, ${C.pitchDeep} 60%)`,
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  // Horizontal gutters so content never touches the screen edge on a narrow phone (iPhone 390).
  paddingLeft: 14,
  paddingRight: 14,
  boxSizing: "border-box",
};
